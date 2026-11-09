//! Tests de l'étape 9 : les comptes d'épargne. Une contribution est un
//! élément de dépense fixe rattaché au compte ; les mouvements (fluctuation,
//! retrait, transfert) n'apparaissent jamais dans Mes paies. Données fictives.

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
        objet: "Compte « CELI — Fonds d'urgence »".into(),
        champ: "création".into(),
        ancienne_valeur: None,
        nouvelle_valeur: Some("CELI".into()),
        motif: None,
    }]
}

fn contribution(id: &str) -> ElementStocke {
    ElementStocke {
        id: id.into(),
        libelle: "Contribution — CELI".into(),
        nature: "depense".into(),
        genre: "fixe".into(),
        incertain: false,
        estimation: false,
        frequence: json!({ "type": "chaquePaie", "depart": "2027-01-07" }),
        montants: vec![MontantStocke {
            a_partir_du: "2027-01-07".into(),
            montant: 10_000,
        }],
        suspensions: vec![],
        fin: None,
        cycle_paie: None,
        changements_frequence: vec![],
    }
}

fn compte(id: &str, sorte: &str) -> CompteStocke {
    CompteStocke {
        id: id.into(),
        sorte: sorte.into(),
        type_libre: None,
        nom: None,
        vocation: None,
        institution: None,
        ferme_le: None,
        references: vec![],
        mouvements: vec![],
        contributions: vec![],
        reserves: vec![],
        repartitions: vec![],
    }
}

fn mouvement(id: &str, sorte: &str, montant: i64, vers: Option<&str>) -> MouvementStocke {
    MouvementStocke {
        id: id.into(),
        date: "2027-02-12".into(),
        sorte: sorte.into(),
        montant,
        vers: vers.map(Into::into),
        destination: None,
        note: None,
        lien: None,
    }
}

fn appliquer(s: &mut Stockage, c: Vec<ChangementPaie>) -> Resultat<DonneesPaie> {
    s.appliquer_changements_paie(&c, &journal())
}

/// Le CELI (référence 2 000 $, contribution à chaque paie) et le compte épargne.
fn creer(s: &mut Stockage) {
    appliquer(
        s,
        vec![
            ChangementPaie::DefinirElement {
                element: contribution("c1"),
            },
            ChangementPaie::DefinirCompte {
                compte: CompteStocke {
                    nom: Some("CELI — Fonds d'urgence".into()),
                    vocation: Some("Fonds d'urgence".into()),
                    references: vec![ReferenceCompteStockee {
                        date: "2027-01-01".into(),
                        montant: 200_000,
                        note: None,
                    }],
                    contributions: vec!["c1".into()],
                    ..compte("celi", "celi")
                },
            },
            ChangementPaie::DefinirCompte {
                compte: CompteStocke {
                    vocation: Some("Réserve".into()),
                    references: vec![ReferenceCompteStockee {
                        date: "2027-01-01".into(),
                        montant: 0,
                        note: None,
                    }],
                    ..compte("ep", "epargne")
                },
            },
        ],
    )
    .unwrap();
}

#[test]
fn t_une_fiche_complete_se_relit_a_l_identique_dans_l_ordre_de_creation() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    creer(&mut s);
    let complet = CompteStocke {
        type_libre: Some("CRI".into()),
        institution: Some("Banque fictive".into()),
        mouvements: vec![
            MouvementStocke {
                note: Some("marché".into()),
                ..mouvement("m1", "fluctuation", -8_000, None)
            },
            MouvementStocke {
                destination: Some("compte courant".into()),
                ..mouvement("m2", "retrait", 30_000, None)
            },
            mouvement("m3", "transfert", 50_000, Some("ep")),
        ],
        ..compte("cri", "autre")
    };
    let lu = appliquer(
        &mut s,
        vec![ChangementPaie::DefinirCompte {
            compte: complet.clone(),
        }],
    )
    .unwrap();
    assert_eq!(
        lu.comptes.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(),
        ["celi", "ep", "cri"]
    );
    assert_eq!(lu.comptes[2], complet);
    // 0 $ est un vrai solde de référence (T4).
    assert!(lu.comptes[1].references[0].montant == 0);
}

#[test]
fn t5_m3_refus_clairs() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    creer(&mut s);
    let cas: Vec<(CompteStocke, &str)> = vec![
        (compte("x", "autre"), "Donne un nom au type"),
        (
            CompteStocke {
                type_libre: Some("CRI".into()),
                ..compte("x", "celi")
            },
            "Seul le type « Autre »",
        ),
        (compte("x", "cto"), "Type de compte inconnu"),
        (
            CompteStocke {
                references: vec![ReferenceCompteStockee {
                    date: "2027-01-01".into(),
                    montant: -1,
                    note: None,
                }],
                ..compte("x", "reer")
            },
            "ne peut pas être négatif",
        ),
        (
            CompteStocke {
                mouvements: vec![mouvement("m", "transfert", 100, Some("x"))],
                ..compte("x", "reer")
            },
            "vers un autre compte",
        ),
        (
            CompteStocke {
                mouvements: vec![mouvement("m", "retrait", 0, None)],
                ..compte("x", "reer")
            },
            "plus grand que 0",
        ),
        (
            CompteStocke {
                mouvements: vec![mouvement("m", "fluctuation", 0, None)],
                ..compte("x", "reer")
            },
            "nulle",
        ),
        (
            CompteStocke {
                mouvements: vec![mouvement("m", "transfert", 100, Some("absent"))],
                ..compte("x", "reer")
            },
            "n'existe pas",
        ),
    ];
    for (c, attendu) in cas {
        let e = appliquer(&mut s, vec![ChangementPaie::DefinirCompte { compte: c }]).unwrap_err();
        assert!(e.to_string().contains(attendu), "{e} / {attendu}");
    }
    assert_eq!(s.lire_paie().unwrap().comptes.len(), 2);
}

#[test]
fn c_une_contribution_se_gere_depuis_mon_epargne() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    creer(&mut s);
    let e = appliquer(
        &mut s,
        vec![ChangementPaie::SupprimerElement { id: "c1".into() }],
    )
    .unwrap_err();
    assert!(e.to_string().contains("Mon épargne"), "{e}");
}

#[test]
fn x1_x2_suppression_seulement_sans_historique() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    creer(&mut s);
    // Le compte épargne reçoit un transfert : ni lui ni le CELI ne se suppriment.
    let mut celi = s.lire_paie().unwrap().comptes[0].clone();
    celi.mouvements = vec![mouvement("m3", "transfert", 50_000, Some("ep"))];
    appliquer(
        &mut s,
        vec![ChangementPaie::DefinirCompte {
            compte: celi.clone(),
        }],
    )
    .unwrap();
    for id in ["ep", "celi"] {
        let e = appliquer(
            &mut s,
            vec![ChangementPaie::SupprimerCompte { id: id.into() }],
        )
        .unwrap_err();
        assert!(e.to_string().contains("ferme-le plutôt"), "{e}");
    }
    // Sans le transfert, le compte épargne se supprime.
    celi.mouvements.clear();
    let lu = appliquer(
        &mut s,
        vec![
            ChangementPaie::DefinirCompte { compte: celi },
            ChangementPaie::SupprimerCompte { id: "ep".into() },
        ],
    )
    .unwrap();
    assert_eq!(lu.comptes.len(), 1);
    // Une contribution confirmée suffit à garder le CELI.
    appliquer(
        &mut s,
        vec![ChangementPaie::DefinirConfirmation {
            confirmation: ConfirmationStockee {
                element_id: Some("c1".into()),
                origine: "2027-01-07".into(),
                date: "2027-01-07".into(),
                montant: 10_000,
            },
        }],
    )
    .unwrap();
    let e = appliquer(
        &mut s,
        vec![ChangementPaie::SupprimerCompte { id: "celi".into() }],
    )
    .unwrap_err();
    assert!(e.to_string().contains("historique"), "{e}");
    // Sans confirmation : le lien, puis l'élément.
    let lu = appliquer(
        &mut s,
        vec![
            ChangementPaie::RetirerConfirmation {
                element_id: Some("c1".into()),
                origine: "2027-01-07".into(),
            },
            ChangementPaie::SupprimerCompte { id: "celi".into() },
            ChangementPaie::SupprimerElement { id: "c1".into() },
        ],
    )
    .unwrap();
    assert!(lu.comptes.is_empty() && lu.elements.is_empty());
}

#[test]
fn le_format_d_echange_avec_l_interface() {
    let c: ChangementPaie = serde_json::from_value(json!({
        "type": "definirCompte",
        "compte": {
            "id": "celi", "sorte": "celi", "typeLibre": null, "nom": null, "vocation": "Voyage",
            "institution": null, "fermeLe": "2027-03-01",
            "references": [{ "date": "2027-01-01", "montant": 200000, "note": null }],
            "mouvements": [{ "id": "m1", "date": "2027-01-20", "sorte": "fluctuation", "montant": -8000,
                             "vers": null, "destination": null, "note": null }],
            "contributions": ["c1"]
        }
    }))
    .unwrap();
    let ChangementPaie::DefinirCompte { compte } = c else {
        panic!()
    };
    assert_eq!(compte.ferme_le.as_deref(), Some("2027-03-01"));
    assert_eq!(compte.mouvements[0].montant, -8_000);
    let ancien: DonneesPaie = serde_json::from_value(json!({
        "profil": null, "salaires": [], "exceptions": [], "seuil": null, "elements": []
    }))
    .unwrap();
    assert!(ancien.comptes.is_empty());
}

#[test]
fn n1_mise_a_niveau_de_la_structure_7_vers_8() {
    let d = TempDir::new().unwrap();
    let chemin = d.path().join("donnees.sqlite");
    {
        let liste: Vec<Migration> = MIGRATIONS
            .iter()
            .filter(|m| m.version <= 7)
            .map(|m| Migration {
                version: m.version,
                description: m.description,
                sql: m.sql,
            })
            .collect();
        let v7 = Stockage::ouvrir_avec(
            &chemin,
            Profil::Essai,
            Box::new(HorlogeFixe("2026-11-01T10:00:00Z".into())),
            &liste,
        )
        .unwrap();
        v7.conn
            .execute(
                "INSERT INTO elements (id, libelle, nature, genre, incertain, estimation, frequence)
                 VALUES ('visa', 'Visa', 'depense', 'fixe', 0, 0, '{\"type\":\"mois\",\"n\":1,\"depart\":\"2027-01-11\"}')",
                [],
            )
            .unwrap();
        v7.conn
            .execute("INSERT INTO cartes (id) VALUES ('visa')", [])
            .unwrap();
    }
    let s = Stockage::ouvrir(
        &chemin,
        Profil::Essai,
        Box::new(HorlogeFixe("2026-11-09T15:00:00Z".into())),
    )
    .unwrap();
    assert_eq!(s.version_schema().unwrap(), version_schema_attendue());
    let lu = s.lire_paie().unwrap();
    assert_eq!(lu.cartes.len(), 1);
    assert!(lu.comptes.is_empty());
    assert!(d.path().join("precaution").read_dir().unwrap().any(|e| e
        .unwrap()
        .file_name()
        .to_string_lossy()
        .contains("v7-vers-v")));
}
