//! Tests de l'étape 6 : copies du jour, copies de précaution, restauration.
//! Les identifiants R, P et Re renvoient aux cas témoins validés.
//! Toutes les données sont fictives.

use super::*;
use std::sync::{Arc, Mutex};
use tempfile::TempDir;

/// Horloge que le test fait avancer, pour simuler plusieurs journées.
#[derive(Clone)]
struct HorlogeReglable(Arc<Mutex<String>>);

impl HorlogeReglable {
    fn nouvelle(t: &str) -> Self {
        HorlogeReglable(Arc::new(Mutex::new(t.to_string())))
    }
    fn regler(&self, t: &str) {
        *self.0.lock().unwrap() = t.to_string();
    }
}

impl Horloge for HorlogeReglable {
    fn maintenant(&self) -> String {
        self.0.lock().unwrap().clone()
    }
}

fn chemin(d: &TempDir) -> PathBuf {
    d.path().join("liberte-35.sqlite")
}

fn ouvrir_avec(d: &TempDir, profil: Profil, h: &HorlogeReglable) -> Stockage {
    Stockage::ouvrir(&chemin(d), profil, Box::new(h.clone())).unwrap()
}

fn entree(champ: &str) -> Vec<NouvelleEntree> {
    vec![NouvelleEntree {
        section: "Mes paies".into(),
        objet: "Salaire net".into(),
        champ: champ.into(),
        ancienne_valeur: None,
        nouvelle_valeur: Some("fictif".into()),
        motif: None,
    }]
}

fn salaire(s: &mut Stockage, date: &str, montant: i64) {
    s.appliquer_changements_paie(
        &[ChangementPaie::DefinirSalaire {
            salaire: SalaireStocke {
                a_partir_du: date.into(),
                montant,
            },
        }],
        &entree(&format!("à partir du {date}")),
    )
    .unwrap();
}

fn noms_des_copies_du_jour(s: &Stockage) -> Vec<String> {
    s.lister_copies()
        .unwrap()
        .copies_du_jour
        .into_iter()
        .map(|c| c.nom)
        .collect()
}

fn dossier_copies(d: &TempDir) -> PathBuf {
    d.path().join("copies")
}

fn dossier_precaution(d: &TempDir) -> PathBuf {
    d.path().join("precaution")
}

fn jour(nom: &str) -> SourceCopie {
    SourceCopie::Jour { nom: nom.into() }
}

fn salaires(s: &Stockage) -> Vec<i64> {
    s.lire_paie()
        .unwrap()
        .salaires
        .iter()
        .map(|x| x.montant)
        .collect()
}

// ---------- R : rotation des copies du jour ----------

#[test]
fn r1_premier_enregistrement_du_jour_cree_une_copie_verifiee() {
    let d = TempDir::new().unwrap();
    let h = HorlogeReglable::nouvelle("2026-11-08T14:00:00Z");
    let mut s = ouvrir_avec(&d, Profil::Essai, &h);
    salaire(&mut s, "2027-01-07", 210_000);

    let faite = s.faire_copie_du_jour().unwrap();
    assert_eq!(faite.nom, "jour-2026-11-08.sqlite");
    assert_eq!(faite.jour, "2026-11-08");
    assert!(dossier_copies(&d).join("jour-2026-11-08.sqlite").exists());

    let liste = s.lister_copies().unwrap();
    assert_eq!(liste.copies_du_jour.len(), 1);
    let c = &liste.copies_du_jour[0];
    assert!(c.lisible, "{:?}", c.raison);
    assert_eq!(c.jour.as_deref(), Some("2026-11-08"));
    assert_eq!(c.version_schema, Some(version_schema_attendue()));
    assert_eq!(c.resume.as_ref().unwrap().entrees_journal, 1);
    assert_eq!(c.source, jour("jour-2026-11-08.sqlite"));
}

#[test]
fn r2_le_meme_jour_la_copie_du_jour_est_remplacee_et_les_autres_ne_bougent_pas() {
    let d = TempDir::new().unwrap();
    let h = HorlogeReglable::nouvelle("2026-11-07T14:00:00Z");
    let mut s = ouvrir_avec(&d, Profil::Essai, &h);
    salaire(&mut s, "2027-01-07", 210_000);
    s.faire_copie_du_jour().unwrap();
    let veille = std::fs::read(dossier_copies(&d).join("jour-2026-11-07.sqlite")).unwrap();

    h.regler("2026-11-08T09:00:00Z");
    salaire(&mut s, "2027-02-04", 215_000);
    s.faire_copie_du_jour().unwrap();
    h.regler("2026-11-08T18:00:00Z");
    salaire(&mut s, "2027-03-04", 220_000);
    s.faire_copie_du_jour().unwrap();

    assert_eq!(
        noms_des_copies_du_jour(&s),
        vec!["jour-2026-11-08.sqlite", "jour-2026-11-07.sqlite"]
    );
    // La copie du jour contient le dernier état (3 entrées au journal).
    let liste = s.lister_copies().unwrap();
    assert_eq!(
        liste.copies_du_jour[0]
            .resume
            .as_ref()
            .unwrap()
            .entrees_journal,
        3
    );
    // La copie de la veille n'a pas changé d'un octet.
    assert_eq!(
        std::fs::read(dossier_copies(&d).join("jour-2026-11-07.sqlite")).unwrap(),
        veille
    );
}

#[test]
fn r3_r4_trois_journees_puis_la_plus_ancienne_cede_sa_place() {
    let d = TempDir::new().unwrap();
    let h = HorlogeReglable::nouvelle("2026-11-01T14:00:00Z");
    let mut s = ouvrir_avec(&d, Profil::Essai, &h);
    for (i, j) in ["2026-11-01", "2026-11-03", "2026-11-04"]
        .iter()
        .enumerate()
    {
        h.regler(&format!("{j}T14:00:00Z"));
        salaire(&mut s, "2027-01-07", 200_000 + i as i64);
        s.faire_copie_du_jour().unwrap();
    }
    assert_eq!(
        noms_des_copies_du_jour(&s),
        vec![
            "jour-2026-11-04.sqlite",
            "jour-2026-11-03.sqlite",
            "jour-2026-11-01.sqlite"
        ]
    );
    let deux = std::fs::read(dossier_copies(&d).join("jour-2026-11-03.sqlite")).unwrap();

    h.regler("2026-11-05T14:00:00Z");
    salaire(&mut s, "2027-01-07", 199_000);
    s.faire_copie_du_jour().unwrap();
    assert_eq!(
        noms_des_copies_du_jour(&s),
        vec![
            "jour-2026-11-05.sqlite",
            "jour-2026-11-04.sqlite",
            "jour-2026-11-03.sqlite"
        ]
    );
    assert!(!dossier_copies(&d).join("jour-2026-11-01.sqlite").exists());
    assert_eq!(
        std::fs::read(dossier_copies(&d).join("jour-2026-11-03.sqlite")).unwrap(),
        deux
    );
}

#[test]
fn r5_quinze_jours_sans_ouvrir_l_app_les_trois_dernieres_journees_d_utilisation_restent() {
    let d = TempDir::new().unwrap();
    let h = HorlogeReglable::nouvelle("2026-10-01T14:00:00Z");
    {
        let mut s = ouvrir_avec(&d, Profil::Essai, &h);
        for j in ["2026-10-01", "2026-10-02", "2026-10-03"] {
            h.regler(&format!("{j}T14:00:00Z"));
            salaire(&mut s, "2027-01-07", 210_000);
            s.faire_copie_du_jour().unwrap();
        }
    }
    // Quinze jours plus tard, on ouvre seulement l'app, sans rien changer.
    h.regler("2026-10-18T14:00:00Z");
    let s = ouvrir_avec(&d, Profil::Essai, &h);
    assert_eq!(
        noms_des_copies_du_jour(&s),
        vec![
            "jour-2026-10-03.sqlite",
            "jour-2026-10-02.sqlite",
            "jour-2026-10-01.sqlite"
        ]
    );
}

#[test]
fn le_jour_d_une_copie_est_le_jour_local_et_non_le_jour_utc() {
    struct Soir;
    impl Horloge for Soir {
        fn maintenant(&self) -> String {
            "2026-11-09T01:30:00Z".into()
        }
        fn jour_local(&self) -> String {
            // 20 h 30 à Montréal : encore le 8 novembre.
            "2026-11-08".into()
        }
    }
    let d = TempDir::new().unwrap();
    let s = Stockage::ouvrir(&chemin(&d), Profil::Essai, Box::new(Soir)).unwrap();
    assert_eq!(
        s.faire_copie_du_jour().unwrap().nom,
        "jour-2026-11-08.sqlite"
    );
}

#[test]
fn r6_un_echec_laisse_les_copies_valides_intactes() {
    let d = TempDir::new().unwrap();
    let h = HorlogeReglable::nouvelle("2026-11-07T14:00:00Z");
    let mut s = ouvrir_avec(&d, Profil::Essai, &h);
    salaire(&mut s, "2027-01-07", 210_000);
    s.faire_copie_du_jour().unwrap();
    h.regler("2026-11-08T09:00:00Z");
    s.faire_copie_du_jour().unwrap();
    let avant_07 = std::fs::read(dossier_copies(&d).join("jour-2026-11-07.sqlite")).unwrap();
    let avant_08 = std::fs::read(dossier_copies(&d).join("jour-2026-11-08.sqlite")).unwrap();

    // Un dossier occupe la place du fichier temporaire : l'écriture échoue.
    std::fs::create_dir(dossier_copies(&d).join("jour-2026-11-08.sqlite.ecriture")).unwrap();
    salaire(&mut s, "2027-02-04", 215_000);
    let erreur = s.faire_copie_du_jour().unwrap_err();
    assert!(
        erreur
            .to_string()
            .contains("copies précédentes sont intactes"),
        "{erreur}"
    );

    assert_eq!(
        std::fs::read(dossier_copies(&d).join("jour-2026-11-07.sqlite")).unwrap(),
        avant_07
    );
    assert_eq!(
        std::fs::read(dossier_copies(&d).join("jour-2026-11-08.sqlite")).unwrap(),
        avant_08
    );
    assert_eq!(noms_des_copies_du_jour(&s).len(), 2);
    // Les données, elles, sont bien enregistrées : seule la copie a échoué.
    assert_eq!(salaires(&s), vec![210_000, 215_000]);
}

#[test]
fn r7_un_fichier_temporaire_laisse_par_une_coupure_n_est_jamais_retenu_et_il_est_nettoye() {
    let d = TempDir::new().unwrap();
    let h = HorlogeReglable::nouvelle("2026-11-08T14:00:00Z");
    {
        let s = ouvrir_avec(&d, Profil::Essai, &h);
        s.faire_copie_du_jour().unwrap();
    }
    let temporaire = dossier_copies(&d).join("jour-2026-11-09.sqlite.ecriture");
    std::fs::write(&temporaire, b"moitie d'une copie").unwrap();
    let restauration = d.path().join("liberte-35.sqlite.restauration");
    std::fs::write(&restauration, b"moitie d'une restauration").unwrap();

    let s = ouvrir_avec(&d, Profil::Essai, &h);
    assert!(!temporaire.exists());
    assert!(!restauration.exists());
    assert_eq!(noms_des_copies_du_jour(&s), vec!["jour-2026-11-08.sqlite"]);
}

#[test]
fn r8_une_copie_abimee_est_marquee_illisible_et_jamais_restauree() {
    let d = TempDir::new().unwrap();
    let h = HorlogeReglable::nouvelle("2026-11-08T14:00:00Z");
    let mut s = ouvrir_avec(&d, Profil::Essai, &h);
    salaire(&mut s, "2027-01-07", 210_000);
    s.faire_copie_du_jour().unwrap();
    let f = dossier_copies(&d).join("jour-2026-11-08.sqlite");
    let mut octets = std::fs::read(&f).unwrap();
    for o in octets.iter_mut().skip(1024).take(4096) {
        *o = 0xA5;
    }
    std::fs::write(&f, octets).unwrap();

    let liste = s.lister_copies().unwrap();
    assert!(!liste.copies_du_jour[0].lisible);
    assert!(liste.copies_du_jour[0]
        .raison
        .as_deref()
        .unwrap()
        .contains("illisible"));
    let refus = s
        .apercu_restauration(&jour("jour-2026-11-08.sqlite"))
        .unwrap_err();
    assert!(refus.to_string().contains("illisible"), "{refus}");
    assert!(s.restaurer(&jour("jour-2026-11-08.sqlite")).is_err());
    assert_eq!(salaires(&s), vec![210_000]);
}

// ---------- P : copies de précaution ----------

#[test]
fn p1_une_copie_de_precaution_verifiee_precede_toute_restauration() {
    let d = TempDir::new().unwrap();
    let h = HorlogeReglable::nouvelle("2026-11-07T14:00:00Z");
    let mut s = ouvrir_avec(&d, Profil::Essai, &h);
    salaire(&mut s, "2027-01-07", 210_000);
    s.faire_copie_du_jour().unwrap();
    h.regler("2026-11-08T15:30:00Z");
    salaire(&mut s, "2027-02-04", 215_000);

    let r = s.restaurer(&jour("jour-2026-11-07.sqlite")).unwrap();
    assert_eq!(r.precaution, "avant-restauration-20261108153000.sqlite");
    let liste = s.lister_copies().unwrap();
    let p = &liste.precautions[0];
    assert_eq!(p.nom, r.precaution);
    assert_eq!(p.motif.as_deref(), Some("restauration"));
    assert_eq!(p.horodatage, "2026-11-08T15:30:00Z");
    assert!(p.lisible);
    // La précaution contient l'état d'avant la restauration.
    assert_eq!(p.resume.as_ref().unwrap().entrees_journal, 2);
}

#[test]
fn p1_sans_copie_de_precaution_pas_de_restauration() {
    let d = TempDir::new().unwrap();
    let h = HorlogeReglable::nouvelle("2026-11-07T14:00:00Z");
    let mut s = ouvrir_avec(&d, Profil::Essai, &h);
    salaire(&mut s, "2027-01-07", 210_000);
    s.faire_copie_du_jour().unwrap();
    h.regler("2026-11-08T15:30:00Z");
    salaire(&mut s, "2027-02-04", 215_000);
    // Un fichier occupe la place du dossier de précaution.
    std::fs::write(dossier_precaution(&d), b"pas un dossier").unwrap();

    let erreur = s.restaurer(&jour("jour-2026-11-07.sqlite")).unwrap_err();
    assert!(
        erreur.to_string().contains("Rien n'a été restauré"),
        "{erreur}"
    );
    assert_eq!(salaires(&s), vec![210_000, 215_000]);
}

#[test]
fn p3_on_garde_les_cinq_copies_de_precaution_les_plus_recentes() {
    let d = TempDir::new().unwrap();
    let h = HorlogeReglable::nouvelle("2026-11-01T14:00:00Z");
    let mut s = ouvrir_avec(&d, Profil::Essai, &h);
    salaire(&mut s, "2027-01-07", 210_000);
    s.faire_copie_du_jour().unwrap();
    for minute in 10..17 {
        h.regler(&format!("2026-11-01T15:{minute}:00Z"));
        s.restaurer(&jour("jour-2026-11-01.sqlite")).unwrap();
    }
    let noms: Vec<String> = s
        .lister_copies()
        .unwrap()
        .precautions
        .into_iter()
        .map(|c| c.nom)
        .collect();
    assert_eq!(
        noms,
        (12..17)
            .rev()
            .map(|m| format!("avant-restauration-2026110115{m}00.sqlite"))
            .collect::<Vec<_>>()
    );
}

#[test]
fn p3_la_limite_compte_aussi_les_copies_d_avant_mise_a_niveau() {
    let d = TempDir::new().unwrap();
    std::fs::create_dir_all(dossier_precaution(&d)).unwrap();
    let h = HorlogeReglable::nouvelle("2026-11-01T14:00:00Z");
    let mut s = ouvrir_avec(&d, Profil::Essai, &h);
    s.faire_copie_du_jour().unwrap();
    // Une vieille copie d'avant mise à niveau, déjà présente.
    std::fs::copy(
        dossier_copies(&d).join("jour-2026-11-01.sqlite"),
        dossier_precaution(&d).join("avant-mise-a-niveau-v4-vers-v5-20261020100000.sqlite"),
    )
    .unwrap();
    let liste = s.lister_copies().unwrap();
    assert_eq!(liste.precautions[0].motif.as_deref(), Some("miseANiveau"));
    assert_eq!(liste.precautions[0].horodatage, "2026-10-20T10:00:00Z");
    for minute in 10..15 {
        h.regler(&format!("2026-11-01T15:{minute}:00Z"));
        s.restaurer(&jour("jour-2026-11-01.sqlite")).unwrap();
    }
    let liste = s.lister_copies().unwrap();
    assert_eq!(liste.precautions.len(), 5);
    assert!(liste
        .precautions
        .iter()
        .all(|c| c.motif.as_deref() == Some("restauration")));
}

// ---------- Re : restauration ----------

fn contenu_sans_journal(s: &Stockage) -> serde_json::Value {
    let mut t = s.contenu_des_tables().unwrap();
    t.remove("journal_changements");
    serde_json::to_value(t).unwrap()
}

#[test]
fn re1_apres_restauration_les_donnees_sont_identiques_a_la_copie_au_champ_pres() {
    let d = TempDir::new().unwrap();
    let h = HorlogeReglable::nouvelle("2026-11-07T14:00:00Z");
    let mut s = ouvrir_avec(&d, Profil::Essai, &h);
    salaire(&mut s, "2027-01-07", 210_000);
    s.definir_parametre("page_ouverture", "mes-paies").unwrap();
    s.faire_copie_du_jour().unwrap();
    let attendu = contenu_sans_journal(&s);
    let journal_copie = s.lire_journal(100).unwrap();

    h.regler("2026-11-08T15:30:00Z");
    salaire(&mut s, "2027-02-04", 215_000);
    salaire(&mut s, "2027-01-07", 199_999);
    s.definir_parametre("page_ouverture", "parametres").unwrap();

    s.restaurer(&jour("jour-2026-11-07.sqlite")).unwrap();
    assert_eq!(contenu_sans_journal(&s), attendu);
    assert_eq!(salaires(&s), vec![210_000]);
    // Q33 : le journal de la copie est repris, plus une entrée de restauration.
    let journal = s.lire_journal(100).unwrap();
    assert_eq!(journal.len(), journal_copie.len() + 1);
    assert_eq!(&journal[1..], &journal_copie[..]);
    assert_eq!(journal[0].champ, "restauration");
    assert_eq!(journal[0].section, "Paramètres");
    assert!(journal[0]
        .nouvelle_valeur
        .as_deref()
        .unwrap()
        .contains("copie du 2026-11-07"));
    assert!(journal[0]
        .motif
        .as_deref()
        .unwrap()
        .contains("avant-restauration-20261108153000.sqlite"));
    assert!(s.verifier_integrite().unwrap());
}

#[test]
fn re2_l_apercu_montre_la_copie_son_contenu_et_les_changements_retires() {
    let d = TempDir::new().unwrap();
    let h = HorlogeReglable::nouvelle("2026-11-07T14:00:00Z");
    let mut s = ouvrir_avec(&d, Profil::Essai, &h);
    salaire(&mut s, "2027-01-07", 210_000);
    s.faire_copie_du_jour().unwrap();
    h.regler("2026-11-08T15:30:00Z");
    for (i, date) in [
        "2027-02-04",
        "2027-03-04",
        "2027-04-01",
        "2027-05-06",
        "2027-06-03",
        "2027-07-01",
    ]
    .iter()
    .enumerate()
    {
        salaire(&mut s, date, 211_000 + i as i64);
    }

    let a = s
        .apercu_restauration(&jour("jour-2026-11-07.sqlite"))
        .unwrap();
    assert_eq!(a.nom, "jour-2026-11-07.sqlite");
    assert_eq!(a.version_schema, version_schema_attendue());
    assert_eq!(a.resume.entrees_journal, 1);
    assert_eq!(a.resume.salaires, 1);
    assert_eq!(a.nombre_retires, 6);
    // Les plus récents d'abord, cinq au plus.
    assert_eq!(a.retires.len(), 5);
    assert_eq!(a.retires[0].champ, "à partir du 2027-07-01");
    assert_eq!(a.retires[0].objet, "Salaire net");
    assert_eq!(a.nombre_retrouves, 0);
    assert!(!a.mise_a_niveau);
}

#[test]
fn re3_regarder_l_apercu_ne_change_rien() {
    let d = TempDir::new().unwrap();
    let h = HorlogeReglable::nouvelle("2026-11-07T14:00:00Z");
    let mut s = ouvrir_avec(&d, Profil::Essai, &h);
    salaire(&mut s, "2027-01-07", 210_000);
    s.faire_copie_du_jour().unwrap();
    h.regler("2026-11-08T15:30:00Z");
    salaire(&mut s, "2027-02-04", 215_000);
    let avant = std::fs::read(chemin(&d)).unwrap();
    s.apercu_restauration(&jour("jour-2026-11-07.sqlite"))
        .unwrap();
    assert_eq!(std::fs::read(chemin(&d)).unwrap(), avant);
    assert!(!dossier_precaution(&d).exists());
    assert_eq!(salaires(&s), vec![210_000, 215_000]);
}

#[test]
fn re4_une_copie_d_essai_ne_va_jamais_dans_l_officielle_ni_l_inverse() {
    let essai = TempDir::new().unwrap();
    let officiel = TempDir::new().unwrap();
    let h = HorlogeReglable::nouvelle("2026-11-08T14:00:00Z");
    let mut se = ouvrir_avec(&essai, Profil::Essai, &h);
    salaire(&mut se, "2027-01-07", 999_999);
    se.faire_copie_du_jour().unwrap();
    let mut so = ouvrir_avec(&officiel, Profil::Officiel, &h);
    salaire(&mut so, "2027-01-07", 210_000);
    so.faire_copie_du_jour().unwrap();

    let copie_essai = SourceCopie::Fichier {
        chemin: dossier_copies(&essai)
            .join("jour-2026-11-08.sqlite")
            .display()
            .to_string(),
    };
    let refus = so
        .apercu_restauration(&copie_essai)
        .unwrap_err()
        .to_string();
    assert!(
        refus.contains("installation d'essai (données fictives)"),
        "{refus}"
    );
    assert!(so.restaurer(&copie_essai).is_err());
    assert_eq!(salaires(&so), vec![210_000]);

    let copie_officielle = SourceCopie::Fichier {
        chemin: dossier_copies(&officiel)
            .join("jour-2026-11-08.sqlite")
            .display()
            .to_string(),
    };
    let refus = se
        .apercu_restauration(&copie_officielle)
        .unwrap_err()
        .to_string();
    assert!(
        refus.contains("vient de l'installation officielle"),
        "{refus}"
    );
    assert!(se.restaurer(&copie_officielle).is_err());
    assert_eq!(salaires(&se), vec![999_999]);
}

#[test]
fn re4_un_fichier_externe_valide_se_restaure_avec_les_memes_verifications() {
    let d = TempDir::new().unwrap();
    let ailleurs = TempDir::new().unwrap();
    let h = HorlogeReglable::nouvelle("2026-11-07T14:00:00Z");
    let mut s = ouvrir_avec(&d, Profil::Essai, &h);
    salaire(&mut s, "2027-01-07", 210_000);
    s.faire_copie_du_jour().unwrap();
    let cle_usb = ailleurs.path().join("ma copie.sqlite");
    std::fs::copy(dossier_copies(&d).join("jour-2026-11-07.sqlite"), &cle_usb).unwrap();
    h.regler("2026-11-08T15:30:00Z");
    salaire(&mut s, "2027-02-04", 215_000);

    let source = SourceCopie::Fichier {
        chemin: cle_usb.display().to_string(),
    };
    let a = s.apercu_restauration(&source).unwrap();
    assert_eq!(a.nom, "ma copie.sqlite");
    assert_eq!(a.nombre_retires, 1);
    s.restaurer(&source).unwrap();
    assert_eq!(salaires(&s), vec![210_000]);
    // Le fichier externe n'est jamais modifié.
    assert!(cle_usb.exists());
}

#[test]
fn re4_un_export_ou_un_autre_fichier_est_refuse_avec_une_explication() {
    let d = TempDir::new().unwrap();
    let h = HorlogeReglable::nouvelle("2026-11-08T14:00:00Z");
    let mut s = ouvrir_avec(&d, Profil::Essai, &h);
    salaire(&mut s, "2027-01-07", 210_000);

    let zip = d.path().join("liberte-35-essai-export-2026-11-08.zip");
    s.exporter(&zip, "0.6.0").unwrap();
    let refus = s
        .apercu_restauration(&SourceCopie::Fichier {
            chemin: zip.display().to_string(),
        })
        .unwrap_err()
        .to_string();
    assert!(refus.contains("un export ne se restaure pas"), "{refus}");

    let texte = d.path().join("notes.sqlite");
    std::fs::write(&texte, "pas une base de données").unwrap();
    let refus = s
        .apercu_restauration(&SourceCopie::Fichier {
            chemin: texte.display().to_string(),
        })
        .unwrap_err()
        .to_string();
    assert!(
        refus.contains("n'est pas une copie de Liberté 35"),
        "{refus}"
    );

    let absent = SourceCopie::Fichier {
        chemin: d.path().join("absent.sqlite").display().to_string(),
    };
    assert!(s.apercu_restauration(&absent).is_err());
    // Un fichier SQLite vide n'est pas créé par l'aperçu.
    assert!(!d.path().join("absent.sqlite").exists());
    assert_eq!(salaires(&s), vec![210_000]);
}

#[test]
fn re4_un_nom_de_copie_ne_peut_pas_sortir_de_son_dossier() {
    let d = TempDir::new().unwrap();
    let h = HorlogeReglable::nouvelle("2026-11-08T14:00:00Z");
    let s = ouvrir_avec(&d, Profil::Essai, &h);
    for nom in [
        "../liberte-35.sqlite",
        "..\\x.sqlite",
        "jour-2026-11-08.sqlite/..",
        "",
    ] {
        assert!(s.apercu_restauration(&jour(nom)).is_err(), "{nom}");
        assert!(s
            .apercu_restauration(&SourceCopie::Precaution { nom: nom.into() })
            .is_err());
    }
}

#[test]
fn re5_une_copie_d_une_structure_plus_ancienne_est_restauree_puis_mise_a_niveau() {
    let d = TempDir::new().unwrap();
    let ailleurs = TempDir::new().unwrap();
    // Une copie en structure 4, fabriquée avec les migrations 1 à 4.
    let ancienne = ailleurs.path().join("copie-v4.sqlite");
    {
        let liste: Vec<Migration> = MIGRATIONS
            .iter()
            .filter(|m| m.version <= 4)
            .map(|m| Migration {
                version: m.version,
                description: m.description,
                sql: m.sql,
            })
            .collect();
        let mut v4 = Stockage::ouvrir_avec(
            &ancienne,
            Profil::Essai,
            Box::new(HorlogeFixe("2026-10-01T10:00:00Z".into())),
            &liste,
        )
        .unwrap();
        v4.conn
            .execute(
                "INSERT INTO salaires (a_partir_du, montant) VALUES ('2027-01-07', 205000)",
                [],
            )
            .unwrap();
        v4.consigner(&entree("à partir du 2027-01-07")[0]).unwrap();
    }
    let h = HorlogeReglable::nouvelle("2026-11-08T15:30:00Z");
    let mut s = ouvrir_avec(&d, Profil::Essai, &h);
    salaire(&mut s, "2027-01-07", 210_000);
    let source = SourceCopie::Fichier {
        chemin: ancienne.display().to_string(),
    };
    let a = s.apercu_restauration(&source).unwrap();
    assert_eq!(a.version_schema, 4);
    assert!(a.mise_a_niveau);

    s.restaurer(&source).unwrap();
    assert_eq!(s.version_schema().unwrap(), version_schema_attendue());
    assert_eq!(salaires(&s), vec![205_000]);
    let motifs: Vec<Option<String>> = s
        .lister_copies()
        .unwrap()
        .precautions
        .into_iter()
        .map(|c| c.motif)
        .collect();
    assert!(motifs.contains(&Some("restauration".into())));
    assert!(motifs.contains(&Some("miseANiveau".into())));
    // La copie d'origine n'a pas été touchée.
    let c = Connection::open_with_flags(&ancienne, OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();
    assert_eq!(lire_version(&c).unwrap(), 4);
}

#[test]
fn re6_une_copie_d_une_version_plus_recente_est_refusee() {
    let d = TempDir::new().unwrap();
    let ailleurs = TempDir::new().unwrap();
    let h = HorlogeReglable::nouvelle("2026-11-08T14:00:00Z");
    let mut s = ouvrir_avec(&d, Profil::Essai, &h);
    salaire(&mut s, "2027-01-07", 210_000);
    s.faire_copie_du_jour().unwrap();
    let future = ailleurs.path().join("future.sqlite");
    std::fs::copy(dossier_copies(&d).join("jour-2026-11-08.sqlite"), &future).unwrap();
    Connection::open(&future)
        .unwrap()
        .pragma_update(None, "user_version", 99)
        .unwrap();
    let source = SourceCopie::Fichier {
        chemin: future.display().to_string(),
    };
    let refus = s.apercu_restauration(&source).unwrap_err().to_string();
    assert!(refus.contains("version plus récente"), "{refus}");
    assert!(s.restaurer(&source).is_err());
    assert_eq!(s.version_schema().unwrap(), version_schema_attendue());
}

#[test]
fn re7_restaurer_la_copie_de_precaution_ramene_l_etat_d_avant() {
    let d = TempDir::new().unwrap();
    let h = HorlogeReglable::nouvelle("2026-11-07T14:00:00Z");
    let mut s = ouvrir_avec(&d, Profil::Essai, &h);
    salaire(&mut s, "2027-01-07", 210_000);
    s.faire_copie_du_jour().unwrap();
    h.regler("2026-11-08T15:30:00Z");
    salaire(&mut s, "2027-02-04", 215_000);
    let avant = contenu_sans_journal(&s);
    let journal_avant = s.lire_journal(100).unwrap();

    let r = s.restaurer(&jour("jour-2026-11-07.sqlite")).unwrap();
    assert_eq!(salaires(&s), vec![210_000]);

    h.regler("2026-11-08T15:31:00Z");
    let precaution = SourceCopie::Precaution { nom: r.precaution };
    let a = s.apercu_restauration(&precaution).unwrap();
    assert_eq!(a.nombre_retrouves, 1);
    s.restaurer(&precaution).unwrap();
    assert_eq!(contenu_sans_journal(&s), avant);
    let journal = s.lire_journal(100).unwrap();
    assert_eq!(&journal[1..], &journal_avant[..]);
}

#[test]
fn re8_si_la_restauration_echoue_le_fichier_actuel_reste_intact() {
    let d = TempDir::new().unwrap();
    let h = HorlogeReglable::nouvelle("2026-11-07T14:00:00Z");
    let mut s = ouvrir_avec(&d, Profil::Essai, &h);
    salaire(&mut s, "2027-01-07", 210_000);
    s.faire_copie_du_jour().unwrap();
    h.regler("2026-11-08T15:30:00Z");
    salaire(&mut s, "2027-02-04", 215_000);
    // Un dossier occupe la place du fichier temporaire de restauration.
    std::fs::create_dir(d.path().join("liberte-35.sqlite.restauration")).unwrap();

    let erreur = s.restaurer(&jour("jour-2026-11-07.sqlite")).unwrap_err();
    assert!(
        erreur.to_string().contains("Rien n'a été restauré"),
        "{erreur}"
    );
    // Le stockage reste utilisable, avec les données d'avant.
    assert_eq!(salaires(&s), vec![210_000, 215_000]);
    salaire(&mut s, "2027-03-04", 220_000);
    assert_eq!(salaires(&s), vec![210_000, 215_000, 220_000]);
    assert!(s.verifier_integrite().unwrap());
}

#[test]
fn la_restauration_ne_laisse_aucun_fichier_temporaire() {
    let d = TempDir::new().unwrap();
    let h = HorlogeReglable::nouvelle("2026-11-07T14:00:00Z");
    let mut s = ouvrir_avec(&d, Profil::Essai, &h);
    s.faire_copie_du_jour().unwrap();
    h.regler("2026-11-08T15:30:00Z");
    s.restaurer(&jour("jour-2026-11-07.sqlite")).unwrap();
    let restes: Vec<String> = std::fs::read_dir(d.path())
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
        .filter(|n| n.contains("restauration") || n.ends_with("-journal"))
        .collect();
    assert!(restes.is_empty(), "{restes:?}");
}
