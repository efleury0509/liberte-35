//! Tests de l'étape 7a : prêts. Un prêt est la fiche d'un élément de
//! dépense fixe (son versement) : les cycles, confirmations et ajustements
//! des étapes 4 à 5 s'appliquent tels quels. Données fictives.

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
        objet: "Prêt « Prêt auto (fictif) »".into(),
        champ: "création".into(),
        ancienne_valeur: None,
        nouvelle_valeur: Some("205,00 $ aux deux semaines".into()),
        motif: None,
    }]
}

fn versement(id: &str) -> ElementStocke {
    ElementStocke {
        id: id.into(),
        libelle: "Prêt auto (fictif)".into(),
        nature: "depense".into(),
        genre: "fixe".into(),
        incertain: false,
        estimation: false,
        frequence: json!({ "type": "semaines", "n": 2, "depart": "2027-01-14" }),
        montants: vec![MontantStocke {
            a_partir_du: "2027-01-14".into(),
            montant: 20_500,
        }],
        suspensions: vec![],
        fin: None,
        cycle_paie: None,
        changements_frequence: vec![],
    }
}

/// F1 : création minimale — seulement le versement.
fn pret_minimal(id: &str) -> PretStocke {
    PretStocke {
        id: id.into(),
        minimum: None,
        echeance_finale: None,
        taux: None,
        rembourse_le: None,
        soldes: vec![],
    }
}

fn creer(s: &mut Stockage, pret: PretStocke) {
    s.appliquer_changements_paie(
        &[
            ChangementPaie::DefinirElement {
                element: versement(&pret.id),
            },
            ChangementPaie::DefinirPret { pret },
        ],
        &journal(),
    )
    .unwrap();
}

#[test]
fn f1_un_pret_minimal_est_garde_avec_son_versement() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    creer(&mut s, pret_minimal("auto"));
    let donnees = s.lire_paie().unwrap();
    assert_eq!(donnees.prets, vec![pret_minimal("auto")]);
    assert_eq!(donnees.elements.len(), 1);
}

#[test]
fn f2_f4_une_fiche_se_complete_plus_tard_sans_rien_perdre() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    creer(&mut s, pret_minimal("auto"));
    s.appliquer_changements_paie(
        &[ChangementPaie::DefinirConfirmation {
            confirmation: ConfirmationStockee {
                element_id: Some("auto".into()),
                origine: "2027-01-14".into(),
                date: "2027-01-14".into(),
                montant: 20_500,
            },
        }],
        &journal(),
    )
    .unwrap();
    let complet = PretStocke {
        id: "auto".into(),
        minimum: Some(20_000),
        echeance_finale: Some("2031-06-12".into()),
        taux: Some("6.49".into()),
        rembourse_le: None,
        soldes: vec![
            SoldePretStocke {
                date: "2027-02-11".into(),
                montant: 1_750_000,
                note: None,
            },
            SoldePretStocke {
                date: "2027-03-11".into(),
                montant: 1_700_000,
                note: Some("relevé de mars".into()),
            },
        ],
    };
    s.appliquer_changements_paie(
        &[ChangementPaie::DefinirPret {
            pret: complet.clone(),
        }],
        &journal(),
    )
    .unwrap();
    let donnees = s.lire_paie().unwrap();
    assert_eq!(donnees.prets, vec![complet]);
    // La confirmation d'avant est intacte.
    assert_eq!(donnees.confirmations.len(), 1);
}

#[test]
fn les_donnees_invalides_sont_refusees() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    creer(&mut s, pret_minimal("auto"));
    let base = pret_minimal("auto");
    let cas: Vec<PretStocke> = vec![
        PretStocke {
            minimum: Some(-1),
            ..base.clone()
        },
        PretStocke {
            taux: Some("9,90".into()),
            ..base.clone()
        },
        PretStocke {
            taux: Some("abc".into()),
            ..base.clone()
        },
        PretStocke {
            taux: Some("101".into()),
            ..base.clone()
        },
        PretStocke {
            echeance_finale: Some("2031-6-12".into()),
            ..base.clone()
        },
        PretStocke {
            soldes: vec![SoldePretStocke {
                date: "2027-02-11".into(),
                montant: -5,
                note: None,
            }],
            ..base.clone()
        },
        PretStocke {
            soldes: vec![
                SoldePretStocke {
                    date: "2027-02-11".into(),
                    montant: 5,
                    note: None,
                },
                SoldePretStocke {
                    date: "2027-02-11".into(),
                    montant: 6,
                    note: None,
                },
            ],
            ..base.clone()
        },
    ];
    for p in cas {
        assert!(
            s.appliquer_changements_paie(
                &[ChangementPaie::DefinirPret { pret: p.clone() }],
                &journal()
            )
            .is_err(),
            "{p:?}"
        );
    }
    assert_eq!(s.lire_paie().unwrap().prets, vec![pret_minimal("auto")]);
}

#[test]
fn un_pret_doit_avoir_son_versement_une_depense_fixe() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    // Sans élément.
    assert!(s
        .appliquer_changements_paie(
            &[ChangementPaie::DefinirPret {
                pret: pret_minimal("absent")
            }],
            &journal()
        )
        .is_err());
    // Un revenu ne peut pas être le versement d'un prêt.
    let mut revenu = versement("rev");
    revenu.nature = "revenu".into();
    s.appliquer_changements_paie(
        &[ChangementPaie::DefinirElement { element: revenu }],
        &journal(),
    )
    .unwrap();
    let refus = s
        .appliquer_changements_paie(
            &[ChangementPaie::DefinirPret {
                pret: pret_minimal("rev"),
            }],
            &journal(),
        )
        .unwrap_err();
    assert!(refus.to_string().contains("dépense fixe"), "{refus}");
    assert!(s.lire_paie().unwrap().prets.is_empty());
}

#[test]
fn d1_supprimer_un_pret_puis_son_versement() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    creer(&mut s, pret_minimal("auto"));
    // Le versement seul ne peut pas partir avant la fiche du prêt.
    let refus = s
        .appliquer_changements_paie(
            &[ChangementPaie::SupprimerElement { id: "auto".into() }],
            &journal(),
        )
        .unwrap_err();
    assert!(refus.to_string().contains("prêt"), "{refus}");
    s.appliquer_changements_paie(
        &[
            ChangementPaie::SupprimerPret { id: "auto".into() },
            ChangementPaie::SupprimerElement { id: "auto".into() },
        ],
        &journal(),
    )
    .unwrap();
    let donnees = s.lire_paie().unwrap();
    assert!(donnees.prets.is_empty());
    assert!(donnees.elements.is_empty());
}

#[test]
fn d2_un_pret_avec_un_versement_confirme_ne_se_supprime_pas() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    creer(&mut s, pret_minimal("auto"));
    s.appliquer_changements_paie(
        &[ChangementPaie::DefinirConfirmation {
            confirmation: ConfirmationStockee {
                element_id: Some("auto".into()),
                origine: "2027-01-14".into(),
                date: "2027-01-14".into(),
                montant: 20_500,
            },
        }],
        &journal(),
    )
    .unwrap();
    let refus = s
        .appliquer_changements_paie(
            &[
                ChangementPaie::SupprimerPret { id: "auto".into() },
                ChangementPaie::SupprimerElement { id: "auto".into() },
            ],
            &journal(),
        )
        .unwrap_err();
    assert!(refus.to_string().contains("remboursé"), "{refus}");
    // Tout ou rien : la fiche est toujours là.
    assert_eq!(s.lire_paie().unwrap().prets.len(), 1);
}

#[test]
fn l3_marquer_rembourse_garde_la_fiche_et_ses_soldes() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    let mut p = pret_minimal("auto");
    p.soldes.push(SoldePretStocke {
        date: "2027-01-14".into(),
        montant: 1_800_000,
        note: None,
    });
    creer(&mut s, p.clone());
    p.rembourse_le = Some("2031-06-12".into());
    s.appliquer_changements_paie(
        &[ChangementPaie::DefinirPret { pret: p.clone() }],
        &journal(),
    )
    .unwrap();
    assert_eq!(s.lire_paie().unwrap().prets, vec![p]);
}

#[test]
fn le_format_d_echange_avec_l_interface() {
    let p = PretStocke {
        id: "a".into(),
        minimum: Some(18_500),
        echeance_finale: Some("2029-12-15".into()),
        taux: Some("9.90".into()),
        rembourse_le: None,
        soldes: vec![SoldePretStocke {
            date: "2027-01-15".into(),
            montant: 600_000,
            note: Some("relevé".into()),
        }],
    };
    let v = serde_json::to_value(ChangementPaie::DefinirPret { pret: p.clone() }).unwrap();
    assert_eq!(
        v,
        json!({ "type": "definirPret", "pret": {
            "id": "a", "minimum": 18500, "echeanceFinale": "2029-12-15", "taux": "9.90",
            "rembourseLe": null,
            "soldes": [{ "date": "2027-01-15", "montant": 600000, "note": "relevé" }]
        }})
    );
    let retour: ChangementPaie =
        serde_json::from_value(json!({ "type": "supprimerPret", "id": "a" })).unwrap();
    assert_eq!(retour, ChangementPaie::SupprimerPret { id: "a".into() });
    // Les données d'avant l'étape 7 se lisent sans « prets ».
    let ancien: DonneesPaie = serde_json::from_value(json!({
        "profil": null, "salaires": [], "exceptions": [], "seuil": null, "elements": []
    }))
    .unwrap();
    assert!(ancien.prets.is_empty());
}

#[test]
fn p6_mise_a_niveau_de_la_structure_5_vers_6() {
    let d = TempDir::new().unwrap();
    let chemin = d.path().join("donnees.sqlite");
    {
        let liste: Vec<Migration> = MIGRATIONS
            .iter()
            .filter(|m| m.version <= 5)
            .map(|m| Migration {
                version: m.version,
                description: m.description,
                sql: m.sql,
            })
            .collect();
        let v5 = Stockage::ouvrir_avec(
            &chemin,
            Profil::Essai,
            Box::new(HorlogeFixe("2026-11-01T10:00:00Z".into())),
            &liste,
        )
        .unwrap();
        v5.conn
            .execute(
                "INSERT INTO elements (id, libelle, nature, genre, incertain, estimation, frequence)
                 VALUES ('loyer', 'Loyer', 'depense', 'fixe', 0, 0, '{\"type\":\"mois\",\"n\":1,\"depart\":\"2027-01-01\"}')",
                [],
            )
            .unwrap();
    }
    let mut s = Stockage::ouvrir(
        &chemin,
        Profil::Essai,
        Box::new(HorlogeFixe("2026-11-08T15:00:00Z".into())),
    )
    .unwrap();
    assert_eq!(s.version_schema().unwrap(), 6);
    let donnees = s.lire_paie().unwrap();
    assert_eq!(donnees.elements.len(), 1);
    assert!(donnees.prets.is_empty());
    assert!(d.path().join("precaution").read_dir().unwrap().any(|e| e
        .unwrap()
        .file_name()
        .to_string_lossy()
        .contains("v5-vers-v6")));
    creer(&mut s, pret_minimal("auto"));
    assert_eq!(s.lire_paie().unwrap().prets.len(), 1);
}
