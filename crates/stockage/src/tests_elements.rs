//! Tests des autres revenus et des dépenses (étape 4). Données fictives.

use super::*;
use serde_json::json;
use tempfile::TempDir;

fn ouvrir(d: &TempDir) -> Stockage {
    Stockage::ouvrir(
        &d.path().join("donnees.sqlite"),
        Profil::Essai,
        Box::new(HorlogeFixe("2026-11-08T15:00:00Z".into())),
    )
    .unwrap()
}

fn journal() -> Vec<NouvelleEntree> {
    vec![NouvelleEntree {
        section: "Mes paies".into(),
        objet: "Dépense « Loyer »".into(),
        champ: "création".into(),
        ancienne_valeur: None,
        nouvelle_valeur: Some("1 200,00 $".into()),
        motif: None,
    }]
}

fn loyer() -> ElementStocke {
    ElementStocke {
        id: "6f1c1d1e-0000-4000-8000-000000000001".into(),
        libelle: "Loyer".into(),
        nature: "depense".into(),
        genre: "fixe".into(),
        incertain: false,
        estimation: false,
        frequence: json!({ "type": "mois", "n": 1, "depart": "2027-01-01" }),
        montants: vec![
            MontantStocke {
                a_partir_du: "2027-07-01".into(),
                montant: 125_000,
            },
            MontantStocke {
                a_partir_du: "2027-01-01".into(),
                montant: 120_000,
            },
        ],
        suspensions: vec![SuspensionStocke {
            debut: "2027-08-01".into(),
            fin: "2027-08-31".into(),
        }],
        fin: Some("2028-06-30".into()),
        cycle_paie: None,
        changements_frequence: vec![],
    }
}

fn definir(e: ElementStocke) -> ChangementPaie {
    ChangementPaie::DefinirElement { element: e }
}

#[test]
fn un_element_est_conserve_tel_quel_avec_ses_montants_dates_dans_l_ordre() {
    let d = TempDir::new().unwrap();
    {
        let mut s = ouvrir(&d);
        s.appliquer_changement_paie(&definir(loyer()), &journal())
            .unwrap();
    }
    let s = ouvrir(&d);
    let lu = s.lire_paie().unwrap().elements;
    let mut attendu = loyer();
    attendu.montants.reverse();
    assert_eq!(lu, vec![attendu]);
}

#[test]
fn redefinir_remplace_l_element_entier_sans_doublon() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    s.appliquer_changement_paie(&definir(loyer()), &journal())
        .unwrap();
    let mut modifie = loyer();
    modifie.montants = vec![MontantStocke {
        a_partir_du: "2027-01-01".into(),
        montant: 99_000,
    }];
    modifie.suspensions.clear();
    modifie.fin = None;
    let donnees = s
        .appliquer_changement_paie(&definir(modifie.clone()), &journal())
        .unwrap();
    assert_eq!(donnees.elements, vec![modifie]);
}

#[test]
fn supprimer_retire_l_element_et_rien_d_autre() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    let mut autre = loyer();
    autre.id = "6f1c1d1e-0000-4000-8000-000000000002".into();
    autre.libelle = "Assurances".into();
    s.appliquer_changements_paie(&[definir(loyer()), definir(autre.clone())], &journal())
        .unwrap();
    let avant = s.nombre_entrees_journal().unwrap();
    let donnees = s
        .appliquer_changement_paie(
            &ChangementPaie::SupprimerElement { id: loyer().id },
            &journal(),
        )
        .unwrap();
    autre
        .montants
        .sort_by(|a, b| a.a_partir_du.cmp(&b.a_partir_du));
    assert_eq!(donnees.elements, vec![autre]);
    // Le journal garde la trace de la suppression.
    assert_eq!(s.nombre_entrees_journal().unwrap(), avant + 1);
}

#[test]
fn les_elements_invalides_sont_refuses_sans_rien_ecrire() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    let mut cas: Vec<ElementStocke> = Vec::new();
    let mut e = loyer();
    e.libelle = "  ".into();
    cas.push(e);
    let mut e = loyer();
    e.nature = "achat".into();
    cas.push(e);
    let mut e = loyer();
    e.genre = "autre".into();
    cas.push(e);
    let mut e = loyer();
    e.montants[0].montant = -1;
    cas.push(e);
    let mut e = loyer();
    e.montants[0].a_partir_du = "1er mars".into();
    cas.push(e);
    let mut e = loyer();
    e.suspensions[0].fin = "2027-07-01".into();
    cas.push(e);
    let mut e = loyer();
    e.frequence = json!("mensuelle");
    cas.push(e);
    // Une enveloppe est toujours une dépense.
    let mut e = loyer();
    e.nature = "revenu".into();
    e.genre = "enveloppe".into();
    cas.push(e);
    for e in cas {
        let r = s.appliquer_changement_paie(&definir(e.clone()), &journal());
        assert!(
            matches!(r, Err(ErreurStockage::DonneeInvalide(_))),
            "accepté à tort : {e:?}"
        );
    }
    assert!(s.lire_paie().unwrap().elements.is_empty());
    assert_eq!(s.nombre_entrees_journal().unwrap(), 0);
}

#[test]
fn un_lot_avec_un_element_invalide_n_ecrit_rien() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    let mut mauvais = loyer();
    mauvais.id = "autre".into();
    mauvais.montants[0].montant = -5;
    let r = s.appliquer_changements_paie(&[definir(loyer()), definir(mauvais)], &journal());
    assert!(r.is_err());
    assert!(s.lire_paie().unwrap().elements.is_empty());
}

#[test]
fn contrat_d_echange_avec_l_interface_pour_les_elements() {
    // Exactement ce que l'interface envoie (voir src/lib/plateforme.ts).
    let envoye = json!([
        {
            "type": "definirElement",
            "element": {
                "id": "a1",
                "libelle": "Coupe de cheveux",
                "nature": "depense",
                "genre": "fixe",
                "incertain": false,
                "estimation": true,
                "frequence": { "type": "ponctuelle", "date": "2027-03-04" },
                "montants": [{ "aPartirDu": "2027-03-04", "montant": 4500 }],
                "suspensions": [],
                "fin": null,
                "cyclePaie": "2027-03-04"
            }
        },
        { "type": "supprimerElement", "id": "inexistant" }
    ]);
    let changements: Vec<ChangementPaie> = serde_json::from_value(envoye).unwrap();
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    let donnees = s
        .appliquer_changements_paie(&changements, &journal())
        .unwrap();
    let rendu = serde_json::to_value(&donnees).unwrap();
    assert_eq!(rendu["elements"][0]["cyclePaie"], "2027-03-04");
    assert_eq!(
        rendu["elements"][0]["montants"][0]["aPartirDu"],
        "2027-03-04"
    );
    assert_eq!(rendu["elements"][0]["frequence"]["type"], "ponctuelle");
    assert_eq!(rendu["elements"][0]["estimation"], true);
}

#[test]
fn un_fichier_de_l_etape_3_passe_en_version_3_sans_perte() {
    let d = TempDir::new().unwrap();
    let chemin = d.path().join("donnees.sqlite");
    let horloge = || Box::new(HorlogeFixe("2026-11-08T15:00:00Z".into())) as Box<dyn Horloge>;
    {
        // Fichier tel que l'installation de l'étape 3 l'a créé (version 2),
        // écrit directement comme l'ancienne version l'aurait fait.
        let mut s =
            Stockage::ouvrir_avec(&chemin, Profil::Essai, horloge(), &MIGRATIONS[..2]).unwrap();
        assert_eq!(s.version_schema().unwrap(), 2);
        s.conn
            .execute_batch(
                "INSERT INTO profil_paie (id, frequence, depart) VALUES (1, 'deuxSemaines', '2027-01-07');
                 INSERT INTO salaires (a_partir_du, montant) VALUES ('2027-01-07', 210000);
                 INSERT INTO exceptions_paie (date_origine, date_reelle) VALUES ('2027-02-18', '2027-02-21');
                 INSERT INTO parametres (cle, valeur, modifie_le) VALUES ('seuil_attention', '50000', '2026-11-08T15:00:00Z');",
            )
            .unwrap();
        s.consigner(&journal()[0]).unwrap();
    }
    let avant = DonneesPaie {
        profil: Some(ProfilPaieStocke {
            frequence: "deuxSemaines".into(),
            depart: "2027-01-07".into(),
            jours: None,
        }),
        salaires: vec![SalaireStocke {
            a_partir_du: "2027-01-07".into(),
            montant: 210_000,
        }],
        exceptions: vec![ExceptionStockee {
            date_origine: "2027-02-18".into(),
            date_reelle: Some("2027-02-21".into()),
            montant: None,
        }],
        seuil: Some(50_000),
        elements: Vec::new(),
        ajustements: Vec::new(),
        confirmations: Vec::new(),
        prets: Vec::new(),
        cartes: Vec::new(),
        comptes: Vec::new(),
        depenses: Vec::new(),
        priorite_dettes: Vec::new(),
    };
    let s = Stockage::ouvrir(&chemin, Profil::Essai, horloge()).unwrap();
    assert_eq!(
        s.version_schema().unwrap(),
        MIGRATIONS.last().unwrap().version
    );
    assert_eq!(s.lire_paie().unwrap(), avant);
    assert_eq!(s.nombre_entrees_journal().unwrap(), 1);
    let copies = std::fs::read_dir(d.path().join("precaution"))
        .unwrap()
        .count();
    assert_eq!(copies, 1);
}
