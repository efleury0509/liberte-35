//! Tests de l'étape 8 : la carte Visa. Son échéance mensuelle est un élément
//! de dépense fixe (souvent sans montant) ; ses paiements supplémentaires sont
//! des dépenses « une seule fois » rattachées. Données fictives.

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
        section: "Mes dettes".into(),
        objet: "Carte « Visa (fictive) »".into(),
        champ: "création".into(),
        ancienne_valeur: None,
        nouvelle_valeur: Some("échéance le 11 de chaque mois".into()),
        motif: None,
    }]
}

/// Échéance mensuelle sans montant (Q57) : `montants` vide.
fn echeance(id: &str) -> ElementStocke {
    ElementStocke {
        id: id.into(),
        libelle: "Visa (fictive)".into(),
        nature: "depense".into(),
        genre: "fixe".into(),
        incertain: false,
        estimation: false,
        frequence: json!({ "type": "mois", "n": 1, "depart": "2027-01-11" }),
        montants: vec![],
        suspensions: vec![],
        fin: None,
        cycle_paie: None,
        changements_frequence: vec![],
    }
}

fn supplement(id: &str) -> ElementStocke {
    ElementStocke {
        id: id.into(),
        libelle: "Visa (fictive) — paiement supplémentaire".into(),
        frequence: json!({ "type": "unique", "date": "2027-01-27" }),
        montants: vec![MontantStocke {
            a_partir_du: "2027-01-27".into(),
            montant: 30_000,
        }],
        ..echeance(id)
    }
}

fn carte(id: &str) -> CarteStocke {
    CarteStocke {
        id: id.into(),
        limite: None,
        taux: None,
        objectif: None,
        releves: vec![],
        soldes: vec![],
        frais: vec![],
        supplements: vec![],
    }
}

fn appliquer(s: &mut Stockage, c: Vec<ChangementPaie>) -> Resultat<DonneesPaie> {
    s.appliquer_changements_paie(&c, &journal())
}

fn creer(s: &mut Stockage) {
    appliquer(
        s,
        vec![
            ChangementPaie::DefinirElement {
                element: echeance("visa"),
            },
            ChangementPaie::DefinirCarte {
                carte: carte("visa"),
            },
        ],
    )
    .unwrap();
}

#[test]
fn f1_une_carte_minimale_sans_montant_est_gardee() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    creer(&mut s);
    let lu = s.lire_paie().unwrap();
    assert_eq!(lu.cartes, vec![carte("visa")]);
    assert!(lu.elements[0].montants.is_empty());
}

#[test]
fn f2_r_s_g_une_fiche_complete_se_relit_a_l_identique() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    creer(&mut s);
    let complete = CarteStocke {
        limite: Some(500_000),
        taux: Some("20.99".into()),
        objectif: Some("reduireSolde".into()),
        releves: vec![
            ReleveStocke {
                date: "2027-01-20".into(),
                solde: 124_000,
                minimum: Some(3_500),
                echeance: Some("2027-02-09".into()),
            },
            ReleveStocke {
                date: "2027-02-20".into(),
                solde: 80_000,
                minimum: None,
                echeance: None,
            },
        ],
        soldes: vec![SoldeCarteStocke {
            date: "2027-01-25".into(),
            montant: 141_000,
            note: Some("app de la banque".into()),
        }],
        frais: vec![FraisCarteStocke {
            libelle: "Frais annuels".into(),
            montant: 12_000,
            frequence: "annee".into(),
        }],
        supplements: vec!["sup1".into()],
        ..carte("visa")
    };
    appliquer(
        &mut s,
        vec![
            ChangementPaie::DefinirElement {
                element: supplement("sup1"),
            },
            ChangementPaie::DefinirCarte {
                carte: complete.clone(),
            },
        ],
    )
    .unwrap();
    assert_eq!(s.lire_paie().unwrap().cartes, vec![complete]);
}

#[test]
fn f3_une_seule_carte_et_des_donnees_valides() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    creer(&mut s);
    let e = appliquer(
        &mut s,
        vec![
            ChangementPaie::DefinirElement {
                element: echeance("autre"),
            },
            ChangementPaie::DefinirCarte {
                carte: carte("autre"),
            },
        ],
    )
    .unwrap_err();
    assert!(e.to_string().contains("Une seule carte"), "{e}");
    for invalide in [
        CarteStocke {
            limite: Some(-1),
            ..carte("visa")
        },
        CarteStocke {
            taux: Some("abc".into()),
            ..carte("visa")
        },
        CarteStocke {
            objectif: Some("tout".into()),
            ..carte("visa")
        },
        CarteStocke {
            releves: vec![
                ReleveStocke {
                    date: "2027-01-20".into(),
                    solde: 1,
                    minimum: None,
                    echeance: None,
                };
                2
            ],
            ..carte("visa")
        },
        CarteStocke {
            frais: vec![FraisCarteStocke {
                libelle: "Frais".into(),
                montant: 1,
                frequence: "semaine".into(),
            }],
            ..carte("visa")
        },
        CarteStocke {
            supplements: vec!["inexistant".into()],
            ..carte("visa")
        },
    ] {
        assert!(
            appliquer(
                &mut s,
                vec![ChangementPaie::DefinirCarte {
                    carte: invalide.clone()
                }]
            )
            .is_err(),
            "{invalide:?}"
        );
    }
    assert_eq!(s.lire_paie().unwrap().cartes, vec![carte("visa")]);
}

#[test]
fn les_paiements_de_la_carte_ne_se_suppriment_pas_comme_des_depenses() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    creer(&mut s);
    let e = appliquer(
        &mut s,
        vec![ChangementPaie::SupprimerElement { id: "visa".into() }],
    )
    .unwrap_err();
    assert!(e.to_string().contains("Mes dettes"), "{e}");
}

#[test]
fn x3_d1_un_supplement_puis_la_carte_se_suppriment_sans_confirmation() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    creer(&mut s);
    appliquer(
        &mut s,
        vec![
            ChangementPaie::DefinirElement {
                element: supplement("sup1"),
            },
            ChangementPaie::DefinirCarte {
                carte: CarteStocke {
                    supplements: vec!["sup1".into()],
                    ..carte("visa")
                },
            },
        ],
    )
    .unwrap();
    // X3 : retirer le lien, puis l'élément.
    appliquer(
        &mut s,
        vec![
            ChangementPaie::DefinirCarte {
                carte: carte("visa"),
            },
            ChangementPaie::SupprimerElement { id: "sup1".into() },
        ],
    )
    .unwrap();
    // D1 : la carte, puis son échéance.
    let lu = appliquer(
        &mut s,
        vec![
            ChangementPaie::SupprimerCarte { id: "visa".into() },
            ChangementPaie::SupprimerElement { id: "visa".into() },
        ],
    )
    .unwrap();
    assert!(lu.cartes.is_empty() && lu.elements.is_empty());
}

#[test]
fn d2_x3_avec_un_paiement_confirme_rien_ne_se_supprime() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    creer(&mut s);
    appliquer(
        &mut s,
        vec![
            ChangementPaie::DefinirElement {
                element: supplement("sup1"),
            },
            ChangementPaie::DefinirCarte {
                carte: CarteStocke {
                    supplements: vec!["sup1".into()],
                    ..carte("visa")
                },
            },
            ChangementPaie::DefinirConfirmation {
                confirmation: ConfirmationStockee {
                    element_id: Some("sup1".into()),
                    origine: "2027-01-27".into(),
                    date: "2027-01-27".into(),
                    montant: 30_000,
                },
            },
        ],
    )
    .unwrap();
    let e = appliquer(
        &mut s,
        vec![ChangementPaie::SupprimerCarte { id: "visa".into() }],
    )
    .unwrap_err();
    assert!(e.to_string().contains("paiements confirmés"), "{e}");
    let e = appliquer(
        &mut s,
        vec![
            ChangementPaie::DefinirCarte {
                carte: carte("visa"),
            },
            ChangementPaie::SupprimerElement { id: "sup1".into() },
        ],
    )
    .unwrap_err();
    assert!(e.to_string().contains("confirmées"), "{e}");
    assert_eq!(
        s.lire_paie().unwrap().cartes[0].supplements,
        vec!["sup1".to_string()]
    );
}

#[test]
fn le_format_d_echange_avec_l_interface() {
    let c: ChangementPaie = serde_json::from_value(json!({
        "type": "definirCarte",
        "carte": {
            "id": "visa", "limite": 500000, "taux": null, "objectif": "payerReleves",
            "releves": [{ "date": "2027-01-20", "solde": 124000, "minimum": 3500, "echeance": "2027-02-09" }],
            "soldes": [{ "date": "2027-01-25", "montant": 141000, "note": null }],
            "frais": [], "supplements": ["sup1"]
        }
    }))
    .unwrap();
    let ChangementPaie::DefinirCarte { carte } = c else {
        panic!()
    };
    assert_eq!(carte.objectif.as_deref(), Some("payerReleves"));
    assert_eq!(carte.releves[0].minimum, Some(3_500));
    let ancien: DonneesPaie = serde_json::from_value(json!({
        "profil": null, "salaires": [], "exceptions": [], "seuil": null, "elements": []
    }))
    .unwrap();
    assert!(ancien.cartes.is_empty());
}

#[test]
fn n1_mise_a_niveau_de_la_structure_6_vers_7() {
    let d = TempDir::new().unwrap();
    let chemin = d.path().join("donnees.sqlite");
    {
        let liste: Vec<Migration> = MIGRATIONS
            .iter()
            .filter(|m| m.version <= 6)
            .map(|m| Migration {
                version: m.version,
                description: m.description,
                sql: m.sql,
            })
            .collect();
        let v6 = Stockage::ouvrir_avec(
            &chemin,
            Profil::Essai,
            Box::new(HorlogeFixe("2026-11-01T10:00:00Z".into())),
            &liste,
        )
        .unwrap();
        v6.conn
            .execute(
                "INSERT INTO elements (id, libelle, nature, genre, incertain, estimation, frequence)
                 VALUES ('pret', 'Prêt', 'depense', 'fixe', 0, 0, '{\"type\":\"mois\",\"n\":1,\"depart\":\"2027-01-15\"}')",
                [],
            )
            .unwrap();
        v6.conn
            .execute("INSERT INTO prets (id) VALUES ('pret')", [])
            .unwrap();
    }
    let s = Stockage::ouvrir(
        &chemin,
        Profil::Essai,
        Box::new(HorlogeFixe("2026-11-08T15:00:00Z".into())),
    )
    .unwrap();
    assert_eq!(s.version_schema().unwrap(), 7);
    let lu = s.lire_paie().unwrap();
    assert_eq!(lu.prets.len(), 1);
    assert!(lu.cartes.is_empty());
    assert!(d.path().join("precaution").read_dir().unwrap().any(|e| e
        .unwrap()
        .file_name()
        .to_string_lossy()
        .contains("v6-vers-v7")));
}
