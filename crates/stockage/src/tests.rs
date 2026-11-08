//! Tests du stockage. Toutes les données utilisées sont fictives.

use super::*;
use tempfile::TempDir;

const HEURE: &str = "2026-11-08T14:00:00Z";

fn horloge() -> Box<dyn Horloge> {
    Box::new(HorlogeFixe(HEURE.to_string()))
}

fn chemin_dans(dossier: &TempDir, nom: &str) -> PathBuf {
    dossier.path().join(nom)
}

const V2_TEST: &str =
    "CREATE TABLE essai_v2 (id INTEGER PRIMARY KEY, libelle TEXT NOT NULL) STRICT;";
const V2_CASSEE: &str =
    "CREATE TABLE moitie (id INTEGER PRIMARY KEY) STRICT; CECI N'EST PAS DU SQL;";

fn migrations_avec(v2_sql: &'static str) -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "v1",
            sql: MIGRATIONS[0].sql,
        },
        Migration {
            version: 2,
            description: "v2 (test)",
            sql: v2_sql,
        },
    ]
}

fn entree(champ: &str, ancienne: &str, nouvelle: &str) -> NouvelleEntree {
    NouvelleEntree {
        section: "Paramètres".into(),
        objet: "test".into(),
        champ: champ.into(),
        ancienne_valeur: Some(ancienne.into()),
        nouvelle_valeur: Some(nouvelle.into()),
        motif: None,
    }
}

#[test]
fn nouveau_fichier_cree_a_la_derniere_version() {
    let d = TempDir::new().unwrap();
    let s = Stockage::ouvrir(&chemin_dans(&d, "donnees.sqlite"), Profil::Essai, horloge()).unwrap();
    let etat = s.etat().unwrap();
    assert_eq!(etat.version_schema, version_schema_attendue());
    assert_eq!(etat.version_schema, 1);
    assert_eq!(etat.profil, Profil::Essai);
    assert!(etat.integrite_ok);
    assert_eq!(etat.nombre_entrees_journal, 0);
}

#[test]
fn les_donnees_survivent_a_la_fermeture() {
    let d = TempDir::new().unwrap();
    let chemin = chemin_dans(&d, "donnees.sqlite");
    {
        let mut s = Stockage::ouvrir(&chemin, Profil::Essai, horloge()).unwrap();
        s.definir_parametre("page_ouverture", "vue-ensemble")
            .unwrap();
        s.consigner(&entree("seuil", "0", "100")).unwrap();
    }
    let s = Stockage::ouvrir(&chemin, Profil::Essai, horloge()).unwrap();
    assert_eq!(
        s.parametre("page_ouverture").unwrap().as_deref(),
        Some("vue-ensemble")
    );
    assert_eq!(s.nombre_entrees_journal().unwrap(), 1);
}

#[test]
fn un_fichier_d_essai_ne_s_ouvre_pas_dans_l_installation_officielle() {
    let d = TempDir::new().unwrap();
    let chemin = chemin_dans(&d, "donnees.sqlite");
    {
        let mut s = Stockage::ouvrir(&chemin, Profil::Essai, horloge()).unwrap();
        s.definir_parametre("cle", "fictive").unwrap();
    }
    let avant = std::fs::read(&chemin).unwrap();
    let erreur = Stockage::ouvrir(&chemin, Profil::Officiel, horloge())
        .err()
        .unwrap();
    assert!(matches!(
        erreur,
        ErreurStockage::ProfilIncompatible {
            attendu: Profil::Officiel,
            ..
        }
    ));
    assert!(erreur.to_string().contains("essai"));
    assert_eq!(
        std::fs::read(&chemin).unwrap(),
        avant,
        "le fichier ne doit pas avoir changé"
    );
}

#[test]
fn l_inverse_est_aussi_refuse() {
    let d = TempDir::new().unwrap();
    let chemin = chemin_dans(&d, "donnees.sqlite");
    drop(Stockage::ouvrir(&chemin, Profil::Officiel, horloge()).unwrap());
    let erreur = Stockage::ouvrir(&chemin, Profil::Essai, horloge())
        .err()
        .unwrap();
    assert!(matches!(
        erreur,
        ErreurStockage::ProfilIncompatible {
            attendu: Profil::Essai,
            ..
        }
    ));
}

#[test]
fn un_fichier_d_une_version_plus_recente_n_est_pas_touche() {
    let d = TempDir::new().unwrap();
    let chemin = chemin_dans(&d, "donnees.sqlite");
    drop(Stockage::ouvrir(&chemin, Profil::Essai, horloge()).unwrap());
    Connection::open(&chemin)
        .unwrap()
        .pragma_update(None, "user_version", 99)
        .unwrap();
    let avant = std::fs::read(&chemin).unwrap();
    let erreur = Stockage::ouvrir(&chemin, Profil::Essai, horloge())
        .err()
        .unwrap();
    assert!(matches!(
        erreur,
        ErreurStockage::VersionTropRecente {
            fichier: 99,
            application: 1
        }
    ));
    assert_eq!(std::fs::read(&chemin).unwrap(), avant);
}

#[test]
fn un_fichier_sqlite_etranger_est_refuse() {
    let d = TempDir::new().unwrap();
    let chemin = chemin_dans(&d, "autre.sqlite");
    Connection::open(&chemin)
        .unwrap()
        .execute_batch("CREATE TABLE recettes (nom TEXT);")
        .unwrap();
    let erreur = Stockage::ouvrir(&chemin, Profil::Essai, horloge())
        .err()
        .unwrap();
    assert!(matches!(erreur, ErreurStockage::FichierInconnu));
}

#[test]
fn le_journal_conserve_les_anciennes_et_nouvelles_valeurs() {
    let d = TempDir::new().unwrap();
    let mut s =
        Stockage::ouvrir(&chemin_dans(&d, "donnees.sqlite"), Profil::Essai, horloge()).unwrap();
    s.consigner(&entree("montant", "1 000,00 $", "1 050,00 $"))
        .unwrap();
    s.consigner(&entree("date", "2026-11-13", "2026-11-14"))
        .unwrap();
    let journal = s.lire_journal(10).unwrap();
    assert_eq!(journal.len(), 2);
    assert_eq!(journal[0].champ, "date", "le plus récent d'abord");
    assert_eq!(journal[1].ancienne_valeur.as_deref(), Some("1 000,00 $"));
    assert_eq!(journal[1].nouvelle_valeur.as_deref(), Some("1 050,00 $"));
    assert_eq!(journal[1].horodatage, HEURE);
}

#[test]
fn le_journal_ne_peut_etre_ni_modifie_ni_efface() {
    let d = TempDir::new().unwrap();
    let mut s =
        Stockage::ouvrir(&chemin_dans(&d, "donnees.sqlite"), Profil::Essai, horloge()).unwrap();
    s.consigner(&entree("montant", "1", "2")).unwrap();
    let modif = s
        .conn
        .execute("UPDATE journal_changements SET nouvelle_valeur = '3'", []);
    assert!(modif
        .unwrap_err()
        .to_string()
        .contains("ne peut pas être modifié"));
    let suppr = s.conn.execute("DELETE FROM journal_changements", []);
    assert!(suppr
        .unwrap_err()
        .to_string()
        .contains("ne peut pas être effacé"));
    assert_eq!(
        s.lire_journal(10).unwrap()[0].nouvelle_valeur.as_deref(),
        Some("2")
    );
}

#[test]
fn mise_a_niveau_precedee_d_une_copie_de_precaution_verifiee() {
    let d = TempDir::new().unwrap();
    let chemin = chemin_dans(&d, "donnees.sqlite");
    {
        let mut s = Stockage::ouvrir(&chemin, Profil::Essai, horloge()).unwrap();
        s.definir_parametre("cle", "valeur fictive").unwrap();
        s.consigner(&entree("montant", "1", "2")).unwrap();
    }
    let migrations = migrations_avec(V2_TEST);
    let s = Stockage::ouvrir_avec(&chemin, Profil::Essai, horloge(), &migrations).unwrap();

    // La mise à niveau a eu lieu, sans perte.
    assert_eq!(s.version_schema().unwrap(), 2);
    assert_eq!(
        s.parametre("cle").unwrap().as_deref(),
        Some("valeur fictive")
    );
    assert_eq!(s.nombre_entrees_journal().unwrap(), 1);
    assert!(s.verifier_integrite().unwrap());

    // La copie de précaution existe, est intègre et reste en version 1.
    let copies: Vec<_> = std::fs::read_dir(d.path().join("precaution"))
        .unwrap()
        .collect();
    assert_eq!(copies.len(), 1);
    let copie = copies[0].as_ref().unwrap().path();
    assert!(copie
        .to_string_lossy()
        .contains("avant-mise-a-niveau-v1-vers-v2-20261108140000"));
    let c = Connection::open(&copie).unwrap();
    assert_eq!(lire_version(&c).unwrap(), 1);
    let valeur: String = c
        .query_row("SELECT valeur FROM parametres WHERE cle = 'cle'", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(valeur, "valeur fictive");
}

#[test]
fn une_mise_a_niveau_qui_echoue_ne_laisse_rien_a_moitie_fait() {
    let d = TempDir::new().unwrap();
    let chemin = chemin_dans(&d, "donnees.sqlite");
    {
        let mut s = Stockage::ouvrir(&chemin, Profil::Essai, horloge()).unwrap();
        s.definir_parametre("cle", "intacte").unwrap();
    }
    let migrations = migrations_avec(V2_CASSEE);
    assert!(Stockage::ouvrir_avec(&chemin, Profil::Essai, horloge(), &migrations).is_err());

    // Toujours en version 1, sans table à moitié créée, données intactes.
    let s = Stockage::ouvrir(&chemin, Profil::Essai, horloge()).unwrap();
    assert_eq!(s.version_schema().unwrap(), 1);
    let moitie: i64 = s
        .conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_schema WHERE name = 'moitie'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(moitie, 0);
    assert_eq!(s.parametre("cle").unwrap().as_deref(), Some("intacte"));
}

#[test]
fn un_fichier_abime_n_est_jamais_mis_a_niveau() {
    let d = TempDir::new().unwrap();
    let chemin = chemin_dans(&d, "donnees.sqlite");
    {
        let mut s = Stockage::ouvrir(&chemin, Profil::Essai, horloge()).unwrap();
        for i in 0..200 {
            s.consigner(&entree("montant", &i.to_string(), &(i + 1).to_string()))
                .unwrap();
        }
    }
    // On abîme volontairement une partie du fichier (pas l'en-tête).
    let mut octets = std::fs::read(&chemin).unwrap();
    let taille_page = 4096;
    for o in octets.iter_mut().skip(taille_page * 2).take(taille_page) {
        *o = 0xA5;
    }
    std::fs::write(&chemin, &octets).unwrap();

    let migrations = migrations_avec(V2_TEST);
    let resultat = Stockage::ouvrir_avec(&chemin, Profil::Essai, horloge(), &migrations);
    let erreur = resultat
        .err()
        .expect("un fichier abîmé ne doit pas être mis à niveau");
    assert!(
        matches!(erreur, ErreurStockage::IntegriteCompromise(_)),
        "erreur inattendue : {erreur:?}"
    );
    assert!(
        !d.path().join("precaution").exists()
            || std::fs::read_dir(d.path().join("precaution"))
                .unwrap()
                .next()
                .is_none(),
        "aucune copie de précaution ne doit être produite à partir d'un fichier abîmé"
    );
    assert_eq!(
        std::fs::read(&chemin).unwrap(),
        octets,
        "le fichier abîmé ne doit pas être réécrit"
    );
}

#[test]
fn un_fichier_abime_est_signale_comme_tel_a_l_ouverture() {
    let d = TempDir::new().unwrap();
    let chemin = chemin_dans(&d, "donnees.sqlite");
    {
        let mut s = Stockage::ouvrir(&chemin, Profil::Essai, horloge()).unwrap();
        for i in 0..200 {
            s.consigner(&entree("montant", &i.to_string(), &(i + 1).to_string()))
                .unwrap();
        }
    }
    let mut octets = std::fs::read(&chemin).unwrap();
    for o in octets.iter_mut().skip(4096 * 2).take(4096) {
        *o = 0xA5;
    }
    std::fs::write(&chemin, &octets).unwrap();

    let erreur = Stockage::ouvrir(&chemin, Profil::Essai, horloge())
        .err()
        .unwrap();
    assert!(
        matches!(erreur, ErreurStockage::IntegriteCompromise(_)),
        "{erreur:?}"
    );
    assert!(erreur.to_string().contains("Rien n'a été modifié"));
    assert_eq!(std::fs::read(&chemin).unwrap(), octets);
}

#[test]
fn le_profil_vient_de_l_identifiant_de_l_installation() {
    assert_eq!(
        Profil::depuis_identifiant("ca.liberte35.essai"),
        Profil::Essai
    );
    assert_eq!(
        Profil::depuis_identifiant("ca.liberte35.officiel"),
        Profil::Officiel
    );
    assert_eq!(
        Profil::depuis_identifiant("ca.liberte35.essai.autre"),
        Profil::Officiel
    );
}

#[test]
fn deux_installations_deux_fichiers_independants() {
    // Simule les dossiers de données distincts des deux installations.
    let d = TempDir::new().unwrap();
    let essai = d
        .path()
        .join("ca.liberte35.essai")
        .join("liberte-35.sqlite");
    let officiel = d
        .path()
        .join("ca.liberte35.officiel")
        .join("liberte-35.sqlite");
    let mut s_essai = Stockage::ouvrir(&essai, Profil::Essai, horloge()).unwrap();
    s_essai.definir_parametre("donnee", "fictive").unwrap();
    let s_officiel = Stockage::ouvrir(&officiel, Profil::Officiel, horloge()).unwrap();
    assert_eq!(
        s_officiel.parametre("donnee").unwrap(),
        None,
        "aucune donnée fictive dans l'officielle"
    );
    assert_eq!(s_officiel.nombre_entrees_journal().unwrap(), 0);
}
