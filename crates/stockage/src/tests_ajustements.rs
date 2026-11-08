//! Tests de l'étape 4b : ajustements d'occurrence et périodes de fréquence.
//! Données fictives.

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
        objet: "Dépense « Épicerie »".into(),
        champ: "ajustement".into(),
        ancienne_valeur: None,
        nouvelle_valeur: Some("350,00 $".into()),
        motif: None,
    }]
}

fn epicerie() -> ElementStocke {
    ElementStocke {
        id: "epicerie".into(),
        libelle: "Épicerie".into(),
        nature: "depense".into(),
        genre: "enveloppe".into(),
        incertain: false,
        estimation: false,
        frequence: json!({ "type": "rangPaie", "rang": 1 }),
        montants: vec![MontantStocke {
            a_partir_du: "2027-01-01".into(),
            montant: 30_000,
        }],
        suspensions: vec![],
        fin: None,
        cycle_paie: None,
        changements_frequence: vec![],
    }
}

fn ajustement(origine: &str) -> AjustementStocke {
    AjustementStocke {
        element_id: "epicerie".into(),
        origine: origine.into(),
        montant: Some(35_000),
        date: None,
        paie_origine: None,
        retire: false,
    }
}

fn preparer(s: &mut Stockage) {
    s.appliquer_changement_paie(
        &ChangementPaie::DefinirElement {
            element: epicerie(),
        },
        &journal(),
    )
    .unwrap();
}

#[test]
fn un_ajustement_est_conserve_puis_remplace_puis_retire() {
    let d = TempDir::new().unwrap();
    {
        let mut s = ouvrir(&d);
        preparer(&mut s);
        s.appliquer_changement_paie(
            &ChangementPaie::DefinirAjustement {
                ajustement: ajustement("2027-04-01"),
            },
            &journal(),
        )
        .unwrap();
    }
    let mut s = ouvrir(&d);
    assert_eq!(
        s.lire_paie().unwrap().ajustements,
        vec![ajustement("2027-04-01")]
    );
    let mut remplace = ajustement("2027-04-01");
    remplace.montant = None;
    remplace.paie_origine = Some("2027-04-29".into());
    let donnees = s
        .appliquer_changement_paie(
            &ChangementPaie::DefinirAjustement {
                ajustement: remplace.clone(),
            },
            &journal(),
        )
        .unwrap();
    assert_eq!(donnees.ajustements, vec![remplace]);
    let donnees = s
        .appliquer_changement_paie(
            &ChangementPaie::RetirerAjustement {
                element_id: "epicerie".into(),
                origine: "2027-04-01".into(),
            },
            &journal(),
        )
        .unwrap();
    assert!(donnees.ajustements.is_empty());
    assert_eq!(donnees.elements, vec![epicerie()]);
}

#[test]
fn redefinir_la_regle_garde_ses_ajustements_supprimer_l_element_les_retire() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    preparer(&mut s);
    s.appliquer_changement_paie(
        &ChangementPaie::DefinirAjustement {
            ajustement: ajustement("2027-04-01"),
        },
        &journal(),
    )
    .unwrap();
    let mut modifiee = epicerie();
    modifiee.montants.push(MontantStocke {
        a_partir_du: "2027-04-01".into(),
        montant: 32_000,
    });
    let donnees = s
        .appliquer_changement_paie(
            &ChangementPaie::DefinirElement { element: modifiee },
            &journal(),
        )
        .unwrap();
    assert_eq!(donnees.ajustements, vec![ajustement("2027-04-01")]);
    let donnees = s
        .appliquer_changement_paie(
            &ChangementPaie::SupprimerElement {
                id: "epicerie".into(),
            },
            &journal(),
        )
        .unwrap();
    assert!(donnees.elements.is_empty());
    assert!(donnees.ajustements.is_empty());
}

#[test]
fn les_ajustements_invalides_sont_refuses_sans_rien_ecrire() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    preparer(&mut s);
    let journal_avant = s.nombre_entrees_journal().unwrap();
    let mut cas = Vec::new();
    let mut a = ajustement("2027-04-01");
    a.montant = None;
    cas.push(a); // aucun effet
    let mut a = ajustement("2027-04-01");
    a.montant = Some(-1);
    cas.push(a);
    let mut a = ajustement("2027-04-01");
    a.date = Some("16 avril".into());
    cas.push(a);
    let mut a = ajustement("1er avril");
    a.montant = Some(1);
    cas.push(a);
    let mut a = ajustement("2027-04-01");
    a.element_id = "inconnu".into();
    cas.push(a); // élément inexistant
    for a in cas {
        let r = s.appliquer_changement_paie(
            &ChangementPaie::DefinirAjustement {
                ajustement: a.clone(),
            },
            &journal(),
        );
        assert!(
            matches!(r, Err(ErreurStockage::DonneeInvalide(_))),
            "accepté à tort : {a:?} → {r:?}"
        );
    }
    assert!(s.lire_paie().unwrap().ajustements.is_empty());
    assert_eq!(s.nombre_entrees_journal().unwrap(), journal_avant);
}

#[test]
fn les_periodes_de_frequence_sont_conservees_dans_l_ordre() {
    let d = TempDir::new().unwrap();
    let mut e = epicerie();
    e.changements_frequence = vec![
        PeriodeStockee {
            a_partir_du: "2027-09-01".into(),
            frequence: json!({ "type": "rangPaie", "rang": 2 }),
        },
        PeriodeStockee {
            a_partir_du: "2027-05-01".into(),
            frequence: json!({ "type": "chaquePaie" }),
        },
    ];
    {
        let mut s = ouvrir(&d);
        s.appliquer_changement_paie(
            &ChangementPaie::DefinirElement { element: e.clone() },
            &journal(),
        )
        .unwrap();
    }
    let s = ouvrir(&d);
    let lu = &s.lire_paie().unwrap().elements[0];
    assert_eq!(
        lu.changements_frequence
            .iter()
            .map(|p| p.a_partir_du.as_str())
            .collect::<Vec<_>>(),
        vec!["2027-05-01", "2027-09-01"]
    );
    assert_eq!(
        lu.changements_frequence[0].frequence,
        json!({ "type": "chaquePaie" })
    );
}

#[test]
fn une_periode_invalide_est_refusee() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    for p in [
        PeriodeStockee {
            a_partir_du: "mai".into(),
            frequence: json!({ "type": "chaquePaie" }),
        },
        PeriodeStockee {
            a_partir_du: "2027-05-01".into(),
            frequence: json!("chaquePaie"),
        },
    ] {
        let mut e = epicerie();
        e.changements_frequence = vec![p];
        let r =
            s.appliquer_changement_paie(&ChangementPaie::DefinirElement { element: e }, &journal());
        assert!(matches!(r, Err(ErreurStockage::DonneeInvalide(_))));
    }
    let mut e = epicerie();
    let p = PeriodeStockee {
        a_partir_du: "2027-05-01".into(),
        frequence: json!({ "type": "chaquePaie" }),
    };
    e.changements_frequence = vec![p.clone(), p];
    let r = s.appliquer_changement_paie(&ChangementPaie::DefinirElement { element: e }, &journal());
    assert!(matches!(r, Err(ErreurStockage::DonneeInvalide(_))));
    assert!(s.lire_paie().unwrap().elements.is_empty());
}

#[test]
fn contrat_d_echange_avec_l_interface_pour_l_etape_4b() {
    let envoye = json!([
        {
            "type": "definirElement",
            "element": {
                "id": "epicerie", "libelle": "Épicerie", "nature": "depense", "genre": "enveloppe",
                "incertain": false, "estimation": false,
                "frequence": { "type": "rangPaie", "rang": 1 },
                "montants": [{ "aPartirDu": "2027-01-01", "montant": 30000 }],
                "suspensions": [], "fin": null, "cyclePaie": null,
                "changementsFrequence": [{ "aPartirDu": "2027-05-01", "frequence": { "type": "chaquePaie" } }]
            }
        },
        {
            "type": "definirAjustement",
            "ajustement": { "elementId": "epicerie", "origine": "2027-04-01", "montant": null,
                            "date": null, "paieOrigine": "2027-04-29", "retire": false }
        },
        { "type": "retirerAjustement", "elementId": "epicerie", "origine": "2027-06-10" }
    ]);
    let changements: Vec<ChangementPaie> = serde_json::from_value(envoye).unwrap();
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    let donnees = s
        .appliquer_changements_paie(&changements, &journal())
        .unwrap();
    let rendu = serde_json::to_value(&donnees).unwrap();
    assert_eq!(rendu["ajustements"][0]["paieOrigine"], "2027-04-29");
    assert_eq!(rendu["ajustements"][0]["elementId"], "epicerie");
    assert_eq!(
        rendu["elements"][0]["changementsFrequence"][0]["aPartirDu"],
        "2027-05-01"
    );
    // Un élément envoyé sans « changementsFrequence » (format de l'étape 4) reste accepté.
    let ancien = json!({ "type": "definirElement", "element": {
        "id": "x", "libelle": "x", "nature": "depense", "genre": "fixe", "incertain": false, "estimation": false,
        "frequence": { "type": "ponctuelle", "date": "2027-04-01" }, "montants": [], "suspensions": [],
        "fin": null, "cyclePaie": null } });
    assert!(serde_json::from_value::<ChangementPaie>(ancien).is_ok());
}

#[test]
fn b4_un_fichier_de_l_etape_4_passe_en_version_4_sans_rien_changer() {
    let d = TempDir::new().unwrap();
    let chemin = d.path().join("donnees.sqlite");
    let horloge = || Box::new(HorlogeFixe("2026-11-08T15:00:00Z".into())) as Box<dyn Horloge>;
    {
        // Fichier tel que l'installation 0.4.0 l'a créé (version 3), avec un élément complet.
        let mut s =
            Stockage::ouvrir_avec(&chemin, Profil::Essai, horloge(), &MIGRATIONS[..3]).unwrap();
        assert_eq!(s.version_schema().unwrap(), 3);
        s.conn
            .execute_batch(
                r#"INSERT INTO profil_paie (id, frequence, depart) VALUES (1, 'deuxSemaines', '2027-01-07');
                   INSERT INTO salaires (a_partir_du, montant) VALUES ('2027-01-07', 210000);
                   INSERT INTO elements (id, libelle, nature, genre, incertain, estimation, frequence, fin, cycle_paie)
                     VALUES ('gym', 'Gym', 'depense', 'fixe', 0, 1, '{"type":"mois","n":1,"depart":"2027-01-05"}', '2027-12-31', NULL);
                   INSERT INTO montants_element (element_id, a_partir_du, montant) VALUES ('gym', '2027-01-05', 4000), ('gym', '2027-06-01', 4500);
                   INSERT INTO suspensions_element (element_id, debut, fin) VALUES ('gym', '2027-03-01', '2027-04-30');"#,
            )
            .unwrap();
    }
    let s = Stockage::ouvrir(&chemin, Profil::Essai, horloge()).unwrap();
    assert_eq!(s.version_schema().unwrap(), 4);
    let donnees = s.lire_paie().unwrap();
    assert_eq!(
        donnees.elements,
        vec![ElementStocke {
            id: "gym".into(),
            libelle: "Gym".into(),
            nature: "depense".into(),
            genre: "fixe".into(),
            incertain: false,
            estimation: true,
            frequence: json!({ "type": "mois", "n": 1, "depart": "2027-01-05" }),
            montants: vec![
                MontantStocke {
                    a_partir_du: "2027-01-05".into(),
                    montant: 4000
                },
                MontantStocke {
                    a_partir_du: "2027-06-01".into(),
                    montant: 4500
                },
            ],
            suspensions: vec![SuspensionStocke {
                debut: "2027-03-01".into(),
                fin: "2027-04-30".into()
            }],
            fin: Some("2027-12-31".into()),
            cycle_paie: None,
            changements_frequence: vec![],
        }]
    );
    assert!(donnees.ajustements.is_empty());
    assert_eq!(donnees.salaires.len(), 1);
    let copies: Vec<String> = std::fs::read_dir(d.path().join("precaution"))
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    assert_eq!(copies.len(), 1);
    assert!(copies[0].contains("v3-vers-v4"), "{copies:?}");
}
