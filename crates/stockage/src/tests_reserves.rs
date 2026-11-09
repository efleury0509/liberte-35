//! Tests de l'étape A : réserves et dépenses à prévoir. Données fictives.

use super::*;
use serde_json::json;
use tempfile::TempDir;

fn ouvrir(d: &TempDir) -> Stockage {
    Stockage::ouvrir(
        &d.path().join("donnees.sqlite"),
        Profil::Essai,
        Box::new(HorlogeFixe("2026-11-09T15:00:00Z".into())),
    )
    .unwrap()
}

fn journal() -> Vec<NouvelleEntree> {
    vec![NouvelleEntree {
        section: "Mon épargne".into(),
        objet: "Réserve « Pneus »".into(),
        champ: "création".into(),
        ancienne_valeur: None,
        nouvelle_valeur: Some("Pneus".into()),
        motif: None,
    }]
}

fn element(id: &str, frequence: serde_json::Value) -> ElementStocke {
    ElementStocke {
        id: id.into(),
        libelle: id.into(),
        nature: "depense".into(),
        genre: "fixe".into(),
        incertain: false,
        estimation: false,
        frequence,
        montants: vec![],
        suspensions: vec![],
        fin: None,
        cycle_paie: None,
        changements_frequence: vec![],
    }
}

fn reserve(id: &str) -> ReserveStockee {
    ReserveStockee {
        id: id.into(),
        nom: id.into(),
        sorte: "permanente".into(),
        cible: Some(300_000),
        date: None,
        frequence_mois: None,
        depense_id: None,
        arretee_le: None,
        transferee_vers: None,
        note: None,
        suspensions: vec![],
        mouvements: vec![],
    }
}

fn mv(id: &str, sorte: &str, vers: Option<&str>) -> MouvementReserveStocke {
    MouvementReserveStocke {
        id: id.into(),
        date: "2027-01-01".into(),
        sorte: sorte.into(),
        montant: 10_000,
        vers: vers.map(Into::into),
        lien: None,
        note: None,
    }
}

fn compte() -> CompteStocke {
    CompteStocke {
        id: "ep".into(),
        sorte: "epargne".into(),
        type_libre: None,
        nom: None,
        vocation: None,
        institution: None,
        ferme_le: None,
        references: vec![ReferenceCompteStockee {
            date: "2027-01-01".into(),
            montant: 150_000,
            note: None,
        }],
        mouvements: vec![],
        contributions: vec!["c1".into()],
        reserves: vec![],
        repartitions: vec![],
    }
}

fn appliquer(s: &mut Stockage, c: Vec<ChangementPaie>) -> Resultat<DonneesPaie> {
    s.appliquer_changements_paie(&c, &journal())
}

fn preparer(s: &mut Stockage) {
    appliquer(
        s,
        vec![
            ChangementPaie::DefinirElement {
                element: element(
                    "c1",
                    json!({ "type": "chaquePaie", "depart": "2027-01-07" }),
                ),
            },
            ChangementPaie::DefinirElement {
                element: element(
                    "pneus",
                    json!({ "type": "annee", "n": 1, "depart": "2027-04-15" }),
                ),
            },
            ChangementPaie::DefinirCompte { compte: compte() },
        ],
    )
    .unwrap();
}

#[test]
fn reserves_repartitions_et_depense_se_relisent_a_l_identique() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    preparer(&mut s);
    let complet = CompteStocke {
        mouvements: vec![MouvementStocke {
            id: "r1".into(),
            date: "2027-04-15".into(),
            sorte: "retrait".into(),
            montant: 90_000,
            vers: None,
            destination: Some("compte courant".into()),
            note: None,
            lien: Some("pneus|2027-04-15".into()),
        }],
        reserves: vec![
            ReserveStockee {
                suspensions: vec![SuspensionReserveStockee {
                    debut: "2027-02-01".into(),
                    fin: None,
                }],
                mouvements: vec![
                    mv("a1", "affectation", None),
                    mv("a2", "reaffectation", Some("pneus-r")),
                ],
                ..reserve("urgence")
            },
            ReserveStockee {
                sorte: "ponctuelle".into(),
                depense_id: Some("pneus".into()),
                mouvements: vec![MouvementReserveStocke {
                    lien: Some("pneus|2027-04-15".into()),
                    ..mv("u1", "utilisation", None)
                }],
                ..reserve("pneus-r")
            },
        ],
        repartitions: vec![
            RepartitionStockee {
                element_id: "c1".into(),
                origine: None,
                parts: vec![
                    PartStockee {
                        reserve_id: "urgence".into(),
                        montant: 10_000,
                    },
                    PartStockee {
                        reserve_id: "pneus-r".into(),
                        montant: 5_000,
                    },
                ],
            },
            RepartitionStockee {
                element_id: "c1".into(),
                origine: Some("2027-01-21".into()),
                parts: vec![PartStockee {
                    reserve_id: "urgence".into(),
                    montant: 15_000,
                }],
            },
        ],
        ..compte()
    };
    let depense = DepenseStockee {
        id: "pneus".into(),
        note: Some("4 pneus d'hiver".into()),
        modes: vec![ModeDepenseStocke {
            origine: "2027-04-15".into(),
            mode: "disponible".into(),
        }],
    };
    let lu = appliquer(
        &mut s,
        vec![
            ChangementPaie::DefinirCompte {
                compte: complet.clone(),
            },
            ChangementPaie::DefinirDepense {
                depense: depense.clone(),
            },
        ],
    )
    .unwrap();
    assert_eq!(lu.comptes[0], complet);
    assert_eq!(lu.depenses, vec![depense]);
    // Une dépense à prévoir se gère depuis sa section ; puis se supprime.
    let e = appliquer(
        &mut s,
        vec![ChangementPaie::SupprimerElement { id: "pneus".into() }],
    )
    .unwrap_err();
    assert!(e.to_string().contains("Dépenses à prévoir"), "{e}");
    let lu = appliquer(
        &mut s,
        vec![
            ChangementPaie::SupprimerDepense { id: "pneus".into() },
            ChangementPaie::SupprimerElement { id: "pneus".into() },
        ],
    )
    .unwrap();
    assert!(lu.depenses.is_empty());
}

#[test]
fn refus_clairs() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    preparer(&mut s);
    let cas: Vec<(CompteStocke, &str)> = vec![
        (
            CompteStocke {
                reserves: vec![ReserveStockee {
                    nom: " ".into(),
                    ..reserve("x")
                }],
                ..compte()
            },
            "Donne un nom",
        ),
        (
            CompteStocke {
                reserves: vec![ReserveStockee {
                    cible: Some(-1),
                    ..reserve("x")
                }],
                ..compte()
            },
            "négative",
        ),
        (
            CompteStocke {
                reserves: vec![ReserveStockee {
                    sorte: "ponctuelle".into(),
                    ..reserve("x")
                }],
                ..compte()
            },
            "besoin d'une date",
        ),
        (
            CompteStocke {
                reserves: vec![ReserveStockee {
                    mouvements: vec![mv("m", "reaffectation", Some("absente"))],
                    ..reserve("x")
                }],
                ..compte()
            },
            "réserve inconnue",
        ),
        (
            CompteStocke {
                reserves: vec![reserve("x")],
                repartitions: vec![RepartitionStockee {
                    element_id: "c1".into(),
                    origine: None,
                    parts: vec![PartStockee {
                        reserve_id: "absente".into(),
                        montant: 100,
                    }],
                }],
                ..compte()
            },
            "Part de répartition invalide",
        ),
        (
            CompteStocke {
                reserves: vec![reserve("x")],
                repartitions: vec![RepartitionStockee {
                    element_id: "autre".into(),
                    origine: None,
                    parts: vec![],
                }],
                ..compte()
            },
            "contribution du compte",
        ),
    ];
    for (c, attendu) in cas {
        let e = appliquer(&mut s, vec![ChangementPaie::DefinirCompte { compte: c }]).unwrap_err();
        assert!(e.to_string().contains(attendu), "{e} / {attendu}");
    }
    let e = appliquer(
        &mut s,
        vec![ChangementPaie::DefinirDepense {
            depense: DepenseStockee {
                id: "absente".into(),
                note: None,
                modes: vec![],
            },
        }],
    )
    .unwrap_err();
    assert!(e.to_string().contains("dépense fixe existante"), "{e}");
}

#[test]
fn le_format_d_echange_avec_l_interface() {
    let c: ChangementPaie = serde_json::from_value(json!({
        "type": "definirDepense",
        "depense": { "id": "pneus", "note": null, "modes": [{ "origine": "2027-04-15", "mode": "reserve" }] }
    }))
    .unwrap();
    assert!(matches!(c, ChangementPaie::DefinirDepense { .. }));
    let r: ReserveStockee = serde_json::from_value(json!({
        "id": "r", "nom": "Pneus", "sorte": "ponctuelle", "cible": null, "date": null, "frequenceMois": 12,
        "depenseId": "pneus", "arreteeLe": null, "transfereeVers": null, "note": null
    }))
    .unwrap();
    assert_eq!(r.frequence_mois, Some(12));
    assert!(r.mouvements.is_empty());
}

#[test]
fn mise_a_niveau_de_la_structure_8_vers_9() {
    let d = TempDir::new().unwrap();
    let chemin = d.path().join("donnees.sqlite");
    {
        let liste: Vec<Migration> = MIGRATIONS
            .iter()
            .filter(|m| m.version <= 8)
            .map(|m| Migration {
                version: m.version,
                description: m.description,
                sql: m.sql,
            })
            .collect();
        let v8 = Stockage::ouvrir_avec(
            &chemin,
            Profil::Essai,
            Box::new(HorlogeFixe("2026-11-01T10:00:00Z".into())),
            &liste,
        )
        .unwrap();
        v8.conn
            .execute(
                "INSERT INTO comptes_epargne (id, sorte) VALUES ('ep', 'epargne')",
                [],
            )
            .unwrap();
        v8.conn
            .execute(
                "INSERT INTO mouvements_compte (id, compte_id, date, sorte, montant) VALUES ('m', 'ep', '2027-01-20', 'fluctuation', 5000)",
                [],
            )
            .unwrap();
    }
    let s = ouvrir(&d);
    assert_eq!(s.version_schema().unwrap(), version_schema_attendue());
    let lu = s.lire_paie().unwrap();
    assert_eq!(lu.comptes[0].mouvements[0].lien, None);
    assert!(lu.comptes[0].reserves.is_empty() && lu.depenses.is_empty());
    assert!(d.path().join("precaution").read_dir().unwrap().any(|e| e
        .unwrap()
        .file_name()
        .to_string_lossy()
        .contains("v8-vers-v9")));
}
