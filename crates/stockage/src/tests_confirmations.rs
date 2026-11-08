//! Tests de l'étape 5 : confirmations. Données fictives.

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
        champ: "confirmation du 2027-03-01".into(),
        ancienne_valeur: None,
        nouvelle_valeur: Some("1 200,00 $ le 2027-03-10".into()),
        motif: None,
    }]
}

fn loyer() -> ElementStocke {
    ElementStocke {
        id: "loyer".into(),
        libelle: "Loyer".into(),
        nature: "depense".into(),
        genre: "fixe".into(),
        incertain: false,
        estimation: false,
        frequence: json!({ "type": "mois", "n": 1, "depart": "2027-01-01" }),
        montants: vec![MontantStocke {
            a_partir_du: "2027-01-01".into(),
            montant: 120_000,
        }],
        suspensions: vec![],
        fin: None,
        cycle_paie: None,
        changements_frequence: vec![],
    }
}

fn confirmation(element: Option<&str>, origine: &str, montant: i64) -> ConfirmationStockee {
    ConfirmationStockee {
        element_id: element.map(str::to_string),
        origine: origine.into(),
        date: "2027-03-10".into(),
        montant,
    }
}

fn definir(c: ConfirmationStockee) -> ChangementPaie {
    ChangementPaie::DefinirConfirmation { confirmation: c }
}

fn preparer(s: &mut Stockage) {
    s.appliquer_changement_paie(
        &ChangementPaie::DefinirElement { element: loyer() },
        &journal(),
    )
    .unwrap();
}

#[test]
fn une_confirmation_est_conservee_corrigee_puis_annulee() {
    let d = TempDir::new().unwrap();
    {
        let mut s = ouvrir(&d);
        preparer(&mut s);
        s.appliquer_changements_paie(
            &[
                definir(confirmation(Some("loyer"), "2027-03-01", 120_000)),
                definir(confirmation(None, "2027-03-04", 205_000)),
            ],
            &journal(),
        )
        .unwrap();
    }
    let mut s = ouvrir(&d);
    assert_eq!(
        s.lire_paie().unwrap().confirmations,
        vec![
            confirmation(None, "2027-03-04", 205_000),
            confirmation(Some("loyer"), "2027-03-01", 120_000),
        ]
    );
    // Corriger : la même occurrence, une seule ligne.
    let donnees = s
        .appliquer_changement_paie(
            &definir(confirmation(None, "2027-03-04", 206_000)),
            &journal(),
        )
        .unwrap();
    assert_eq!(donnees.confirmations.len(), 2);
    assert!(donnees
        .confirmations
        .contains(&confirmation(None, "2027-03-04", 206_000)));
    // Annuler : retour exact, sans trace dans le plan ; le journal la garde.
    let avant = s.nombre_entrees_journal().unwrap();
    let donnees = s
        .appliquer_changement_paie(
            &ChangementPaie::RetirerConfirmation {
                element_id: None,
                origine: "2027-03-04".into(),
            },
            &journal(),
        )
        .unwrap();
    assert_eq!(
        donnees.confirmations,
        vec![confirmation(Some("loyer"), "2027-03-01", 120_000)]
    );
    assert_eq!(s.nombre_entrees_journal().unwrap(), avant + 1);
}

#[test]
fn un_element_confirme_ne_peut_pas_etre_supprime_mais_reste_modifiable() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    preparer(&mut s);
    s.appliquer_changement_paie(
        &definir(confirmation(Some("loyer"), "2027-03-01", 120_000)),
        &journal(),
    )
    .unwrap();
    let r = s.appliquer_changement_paie(
        &ChangementPaie::SupprimerElement { id: "loyer".into() },
        &journal(),
    );
    assert!(matches!(r, Err(ErreurStockage::DonneeInvalide(m)) if m.contains("termine-le")));
    assert_eq!(s.lire_paie().unwrap().elements.len(), 1);
    // Redéfinir la règle (par exemple la terminer) garde la confirmation.
    let mut termine = loyer();
    termine.fin = Some("2027-06-30".into());
    let donnees = s
        .appliquer_changement_paie(
            &ChangementPaie::DefinirElement { element: termine },
            &journal(),
        )
        .unwrap();
    assert_eq!(donnees.confirmations.len(), 1);
}

#[test]
fn les_confirmations_invalides_sont_refusees_sans_rien_ecrire() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    preparer(&mut s);
    let avant = s.nombre_entrees_journal().unwrap();
    let mut negative = confirmation(Some("loyer"), "2027-03-01", 1);
    negative.montant = -1;
    let mut mauvaise_date = confirmation(Some("loyer"), "2027-03-01", 1);
    mauvaise_date.date = "10 mars".into();
    for c in [
        negative,
        mauvaise_date,
        confirmation(Some("inconnu"), "2027-03-01", 1),
    ] {
        assert!(s
            .appliquer_changements_paie(&[definir(c)], &journal())
            .is_err());
    }
    assert!(s.lire_paie().unwrap().confirmations.is_empty());
    assert_eq!(s.nombre_entrees_journal().unwrap(), avant);
}

#[test]
fn contrat_d_echange_avec_l_interface_pour_l_etape_5() {
    let envoye = json!([
        { "type": "definirConfirmation", "confirmation": { "elementId": "loyer", "origine": "2027-03-01", "date": "2027-02-28", "montant": 120000 } },
        { "type": "definirConfirmation", "confirmation": { "elementId": null, "origine": "2027-03-04", "date": "2027-03-04", "montant": 205000 } },
        { "type": "retirerConfirmation", "elementId": null, "origine": "2027-03-04" }
    ]);
    let changements: Vec<ChangementPaie> = serde_json::from_value(envoye).unwrap();
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    preparer(&mut s);
    let donnees = s
        .appliquer_changements_paie(&changements, &journal())
        .unwrap();
    let rendu = serde_json::to_value(&donnees).unwrap();
    assert_eq!(
        rendu["confirmations"],
        json!([{ "elementId": "loyer", "origine": "2027-03-01", "date": "2027-02-28", "montant": 120000 }])
    );
}

#[test]
fn p5_un_fichier_de_l_etape_4b_passe_en_version_5_sans_rien_changer() {
    let d = TempDir::new().unwrap();
    let chemin = d.path().join("donnees.sqlite");
    let horloge = || Box::new(HorlogeFixe("2026-11-08T15:00:00Z".into())) as Box<dyn Horloge>;
    let avant;
    {
        let mut s =
            Stockage::ouvrir_avec(&chemin, Profil::Essai, horloge(), &MIGRATIONS[..4]).unwrap();
        assert_eq!(s.version_schema().unwrap(), 4);
        s.conn
            .execute_batch(
                r#"INSERT INTO profil_paie (id, frequence, depart) VALUES (1, 'deuxSemaines', '2027-01-07');
                   INSERT INTO salaires (a_partir_du, montant) VALUES ('2027-01-07', 210000);
                   INSERT INTO exceptions_paie (date_origine, date_reelle) VALUES ('2027-04-29', '2027-05-10');
                   INSERT INTO elements (id, libelle, nature, genre, incertain, estimation, frequence, fin, cycle_paie)
                     VALUES ('epicerie', 'Épicerie', 'depense', 'enveloppe', 0, 0, '{"type":"rangPaie","rang":1}', NULL, NULL);
                   INSERT INTO montants_element (element_id, a_partir_du, montant) VALUES ('epicerie', '2027-01-07', 30000);
                   INSERT INTO ajustements_element (element_id, origine, montant, date, paie_origine, retire)
                     VALUES ('epicerie', '2027-04-01', 35000, NULL, '2027-04-15', 0);
                   INSERT INTO periodes_frequence (element_id, a_partir_du, frequence)
                     VALUES ('epicerie', '2027-07-01', '{"type":"chaquePaie"}');"#,
            )
            .unwrap();
        // Lecture « à la 4b » : sans la table des confirmations.
        avant = (
            s.conn
                .query_row("SELECT count(*) FROM ajustements_element", [], |r| {
                    r.get::<_, i64>(0)
                })
                .unwrap(),
            s.conn
                .query_row("SELECT count(*) FROM periodes_frequence", [], |r| {
                    r.get::<_, i64>(0)
                })
                .unwrap(),
        );
    }
    let s = Stockage::ouvrir(&chemin, Profil::Essai, horloge()).unwrap();
    assert_eq!(s.version_schema().unwrap(), 5);
    let donnees = s.lire_paie().unwrap();
    assert_eq!(
        (
            donnees.ajustements.len() as i64,
            donnees.elements[0].changements_frequence.len() as i64
        ),
        avant
    );
    assert_eq!(
        donnees.exceptions[0].date_reelle.as_deref(),
        Some("2027-05-10")
    );
    assert!(donnees.confirmations.is_empty());
    let copies: Vec<_> = std::fs::read_dir(d.path().join("precaution"))
        .unwrap()
        .collect();
    assert_eq!(copies.len(), 1);
}
