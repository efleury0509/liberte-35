//! Tests des données de paie. Données fictives.

use super::*;
use tempfile::TempDir;

fn ouvrir(d: &TempDir) -> Stockage {
    Stockage::ouvrir(
        &d.path().join("donnees.sqlite"),
        Profil::Essai,
        Box::new(HorlogeFixe("2026-11-08T15:00:00Z".into())),
    )
    .unwrap()
}

fn journal(champ: &str) -> Vec<NouvelleEntree> {
    vec![NouvelleEntree {
        section: "Mes paies".into(),
        objet: "Profil de paie".into(),
        champ: champ.into(),
        ancienne_valeur: None,
        nouvelle_valeur: Some("valeur".into()),
        motif: None,
    }]
}

fn profil() -> ChangementPaie {
    ChangementPaie::DefinirProfil {
        profil: ProfilPaieStocke {
            frequence: "deuxSemaines".into(),
            depart: "2027-01-07".into(),
            jours: None,
        },
    }
}

#[test]
fn profil_salaire_exception_et_seuil_sont_conserves() {
    let d = TempDir::new().unwrap();
    {
        let mut s = ouvrir(&d);
        s.appliquer_changement_paie(&profil(), &journal("fréquence"))
            .unwrap();
        let salaire = SalaireStocke {
            a_partir_du: "2027-01-07".into(),
            montant: 210_000,
        };
        s.appliquer_changement_paie(
            &ChangementPaie::DefinirSalaire { salaire },
            &journal("salaire"),
        )
        .unwrap();
        let exception = ExceptionStockee {
            date_origine: "2027-04-15".into(),
            date_reelle: Some("2027-04-16".into()),
            montant: None,
        };
        s.appliquer_changement_paie(
            &ChangementPaie::DefinirException { exception },
            &journal("date"),
        )
        .unwrap();
        s.appliquer_changement_paie(
            &ChangementPaie::DefinirSeuil {
                seuil: Some(75_000),
            },
            &journal("seuil"),
        )
        .unwrap();
    }
    let s = ouvrir(&d);
    let p = s.lire_paie().unwrap();
    assert_eq!(p.profil.unwrap().depart, "2027-01-07");
    assert_eq!(
        p.salaires,
        vec![SalaireStocke {
            a_partir_du: "2027-01-07".into(),
            montant: 210_000
        }]
    );
    assert_eq!(p.exceptions[0].date_reelle.as_deref(), Some("2027-04-16"));
    assert_eq!(p.seuil, Some(75_000));
    assert_eq!(s.nombre_entrees_journal().unwrap(), 4);
}

#[test]
fn une_seule_exception_par_paie_la_plus_recente_remplace() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    for jour in ["2027-03-31", "2027-03-30"] {
        let exception = ExceptionStockee {
            date_origine: "2027-04-01".into(),
            date_reelle: Some(jour.into()),
            montant: None,
        };
        s.appliquer_changement_paie(
            &ChangementPaie::DefinirException { exception },
            &journal("date"),
        )
        .unwrap();
    }
    let p = s.lire_paie().unwrap();
    assert_eq!(p.exceptions.len(), 1);
    assert_eq!(p.exceptions[0].date_reelle.as_deref(), Some("2027-03-30"));
}

#[test]
fn un_changement_sans_journal_est_refuse_et_rien_n_est_ecrit() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    let erreur = s.appliquer_changement_paie(&profil(), &[]).unwrap_err();
    assert!(erreur.to_string().contains("journal"));
    assert_eq!(s.lire_paie().unwrap(), DonneesPaie::default());
}

#[test]
fn les_donnees_invalides_sont_refusees_sans_rien_ecrire() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    let invalides = [
        ChangementPaie::DefinirProfil {
            profil: ProfilPaieStocke {
                frequence: "quotidienne".into(),
                depart: "2027-01-07".into(),
                jours: None,
            },
        },
        ChangementPaie::DefinirProfil {
            profil: ProfilPaieStocke {
                frequence: "deuxFoisParMois".into(),
                depart: "2027-01-01".into(),
                jours: Some((28, 31)),
            },
        },
        ChangementPaie::DefinirSalaire {
            salaire: SalaireStocke {
                a_partir_du: "7 janvier".into(),
                montant: 1,
            },
        },
        ChangementPaie::DefinirSalaire {
            salaire: SalaireStocke {
                a_partir_du: "2027-01-07".into(),
                montant: -1,
            },
        },
        ChangementPaie::DefinirException {
            exception: ExceptionStockee {
                date_origine: "2027-04-01".into(),
                date_reelle: None,
                montant: None,
            },
        },
        ChangementPaie::DefinirSeuil { seuil: Some(-5) },
    ];
    for c in &invalides {
        let e = s.appliquer_changement_paie(c, &journal("x")).unwrap_err();
        assert!(
            matches!(e, ErreurStockage::DonneeInvalide(_)),
            "{c:?} → {e:?}"
        );
        assert!(e.to_string().contains("Rien n'a été enregistré"));
    }
    assert_eq!(s.lire_paie().unwrap(), DonneesPaie::default());
    assert_eq!(s.nombre_entrees_journal().unwrap(), 0);
}

#[test]
fn retirer_une_exception_ou_le_seuil() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    let exception = ExceptionStockee {
        date_origine: "2027-04-01".into(),
        date_reelle: None,
        montant: Some(150_000),
    };
    s.appliquer_changement_paie(
        &ChangementPaie::DefinirException { exception },
        &journal("montant"),
    )
    .unwrap();
    s.appliquer_changement_paie(
        &ChangementPaie::DefinirSeuil { seuil: Some(10) },
        &journal("seuil"),
    )
    .unwrap();
    s.appliquer_changement_paie(
        &ChangementPaie::RetirerException {
            date_origine: "2027-04-01".into(),
        },
        &journal("montant"),
    )
    .unwrap();
    let p = s
        .appliquer_changement_paie(
            &ChangementPaie::DefinirSeuil { seuil: None },
            &journal("seuil"),
        )
        .unwrap();
    assert!(p.exceptions.is_empty());
    assert_eq!(p.seuil, None);
    assert_eq!(s.nombre_entrees_journal().unwrap(), 4);
}

#[test]
fn le_format_echange_avec_l_interface_est_stable() {
    let json = r#"{"type":"definirException","exception":{"dateOrigine":"2027-04-15","dateReelle":"2027-04-16","montant":null}}"#;
    let c: ChangementPaie = serde_json::from_str(json).unwrap();
    assert!(matches!(c, ChangementPaie::DefinirException { .. }));
}

#[test]
fn plusieurs_changements_tout_ou_rien() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    let salaire_invalide = ChangementPaie::DefinirSalaire {
        salaire: SalaireStocke {
            a_partir_du: "2027-01-07".into(),
            montant: -1,
        },
    };
    // Le profil est valide, mais le salaire ne l'est pas : rien n'est écrit.
    assert!(s
        .appliquer_changements_paie(&[profil(), salaire_invalide], &journal("x"))
        .is_err());
    assert_eq!(s.lire_paie().unwrap(), DonneesPaie::default());
    let salaire = ChangementPaie::DefinirSalaire {
        salaire: SalaireStocke {
            a_partir_du: "2027-01-07".into(),
            montant: 210_000,
        },
    };
    let p = s
        .appliquer_changements_paie(&[profil(), salaire], &journal("x"))
        .unwrap();
    assert!(p.profil.is_some());
    assert_eq!(p.salaires.len(), 1);
}

/// Contrat avec l'interface : chaque type de changement, exactement au
/// format envoyé par `src/lib/plateforme.ts`, doit être compris.
#[test]
fn contrat_d_echange_avec_l_interface_pour_les_six_changements() {
    let exemples = [
        r#"{"type":"definirProfil","profil":{"frequence":"deuxFoisParMois","depart":"2027-01-15","jours":[15,31]}}"#,
        r#"{"type":"definirProfil","profil":{"frequence":"deuxSemaines","depart":"2027-01-07","jours":null}}"#,
        r#"{"type":"definirSalaire","salaire":{"aPartirDu":"2027-06-10","montant":218000}}"#,
        r#"{"type":"retirerSalaire","aPartirDu":"2027-06-10"}"#,
        r#"{"type":"definirException","exception":{"dateOrigine":"2027-04-15","dateReelle":"2027-04-16","montant":null}}"#,
        r#"{"type":"retirerException","dateOrigine":"2027-04-15"}"#,
        r#"{"type":"definirSeuil","seuil":75000}"#,
        r#"{"type":"definirSeuil","seuil":null}"#,
    ];
    for json in exemples {
        let c: Result<ChangementPaie, _> = serde_json::from_str(json);
        assert!(c.is_ok(), "non compris : {json} → {:?}", c.err());
    }
    let entree = r#"{"section":"Mes paies","objet":"Paie","champ":"date","ancienneValeur":"a","nouvelleValeur":"b","motif":null}"#;
    assert!(serde_json::from_str::<NouvelleEntree>(entree).is_ok());
    let donnees = serde_json::to_value(DonneesPaie {
        profil: Some(ProfilPaieStocke {
            frequence: "deuxFoisParMois".into(),
            depart: "2027-01-15".into(),
            jours: Some((15, 31)),
        }),
        salaires: vec![SalaireStocke {
            a_partir_du: "2027-01-15".into(),
            montant: 1,
        }],
        exceptions: vec![ExceptionStockee {
            date_origine: "2027-04-15".into(),
            date_reelle: None,
            montant: Some(2),
        }],
        seuil: None,
        elements: Vec::new(),
        ajustements: Vec::new(),
        confirmations: Vec::new(),
        prets: Vec::new(),
        cartes: Vec::new(),
    })
    .unwrap();
    assert_eq!(donnees["salaires"][0]["aPartirDu"], "2027-01-15");
    assert_eq!(donnees["exceptions"][0]["dateOrigine"], "2027-04-15");
    assert_eq!(donnees["profil"]["jours"], serde_json::json!([15, 31]));
}
