//! Journal (0.16.0) : lecture par pages numérotées, filtres de section et de
//! période. Lecture seule ; toutes les données sont fictives.

use super::*;
use std::sync::{Arc, Mutex};
use tempfile::TempDir;

/// Horloge de test dont on choisit l'heure avant chaque écriture.
struct HorlogeReglable(Arc<Mutex<String>>);
impl Horloge for HorlogeReglable {
    fn maintenant(&self) -> String {
        self.0.lock().unwrap().clone()
    }
}

fn ouvrir(d: &TempDir) -> (Stockage, Arc<Mutex<String>>) {
    let h = Arc::new(Mutex::new("2026-11-08T14:00:00Z".to_string()));
    let s = Stockage::ouvrir(
        &d.path().join("donnees.sqlite"),
        Profil::Essai,
        Box::new(HorlogeReglable(h.clone())),
    )
    .unwrap();
    (s, h)
}

fn entree(section: &str, champ: &str) -> NouvelleEntree {
    NouvelleEntree {
        section: section.into(),
        objet: "Dépense « Loyer (fictif) »".into(),
        champ: champ.into(),
        ancienne_valeur: None,
        nouvelle_valeur: Some("1 100,00 $".into()),
        motif: None,
    }
}

fn remplir(s: &mut Stockage, n: usize) {
    for i in 0..n {
        let section = if i % 2 == 0 {
            "Mes paies"
        } else {
            "Mes dettes"
        };
        s.consigner(&entree(section, &format!("changement {i}")))
            .unwrap();
    }
}

fn champs(p: &PageJournal) -> Vec<&str> {
    p.entrees.iter().map(|e| e.champ.as_str()).collect()
}

#[test]
fn pages_numerotees_sans_doublon_ni_oubli() {
    let d = TempDir::new().unwrap();
    let (mut s, _) = ouvrir(&d);
    remplir(&mut s, 7);
    let tous = FiltreJournal::default();
    let p1 = s.lire_page_journal(0, 3, &tous).unwrap();
    assert_eq!(
        champs(&p1),
        ["changement 6", "changement 5", "changement 4"]
    );
    assert_eq!(p1.total, 7);
    let p2 = s.lire_page_journal(3, 3, &tous).unwrap();
    assert_eq!(
        champs(&p2),
        ["changement 3", "changement 2", "changement 1"]
    );
    let p3 = s.lire_page_journal(6, 3, &tous).unwrap();
    assert_eq!(champs(&p3), ["changement 0"]);
    // Au-delà de la fin : rien, mais le total reste juste.
    let vide = s.lire_page_journal(9, 3, &tous).unwrap();
    assert!(vide.entrees.is_empty());
    assert_eq!(vide.total, 7);
    assert_eq!(p1.plus_ancien.as_deref(), Some("2026-11-08T14:00:00Z"));
}

#[test]
fn filtre_section_puis_pagination() {
    let d = TempDir::new().unwrap();
    let (mut s, _) = ouvrir(&d);
    remplir(&mut s, 7);
    let dettes = FiltreJournal {
        sections: vec!["Mes dettes".into()],
        ..Default::default()
    };
    let p = s.lire_page_journal(0, 2, &dettes).unwrap();
    assert_eq!(champs(&p), ["changement 5", "changement 3"]);
    assert_eq!(p.total, 3);
    let p2 = s.lire_page_journal(2, 2, &dettes).unwrap();
    assert_eq!(champs(&p2), ["changement 1"]);
}

#[test]
fn periode_debut_compris_fin_exclue_et_lecture_seule() {
    let d = TempDir::new().unwrap();
    let (mut s, h) = ouvrir(&d);
    // 30 nov. 21 h à Montréal = 1er déc. 02 h en heure universelle.
    for (moment, champ) in [
        ("2026-11-01T03:59:59Z", "octobre local"),
        ("2026-11-01T04:00:00Z", "début novembre local"),
        ("2026-12-01T02:00:00Z", "30 nov. 21 h local"),
        ("2026-12-01T05:00:00Z", "décembre local"),
    ] {
        *h.lock().unwrap() = moment.to_string();
        s.consigner(&entree("Mes paies", champ)).unwrap();
    }
    let avant = s.lire_journal(100).unwrap();
    let novembre = FiltreJournal {
        debut: Some("2026-11-01T04:00:00Z".into()),
        fin: Some("2026-12-01T05:00:00Z".into()),
        ..Default::default()
    };
    let p = s.lire_page_journal(0, 50, &novembre).unwrap();
    assert_eq!(champs(&p), ["30 nov. 21 h local", "début novembre local"]);
    assert_eq!(p.total, 2);
    let n = s
        .compter_journal(&[
            PeriodeJournal {
                debut: "2025-01-01T05:00:00Z".into(),
                fin: "2026-01-01T05:00:00Z".into(),
            },
            PeriodeJournal {
                debut: "2026-01-01T05:00:00Z".into(),
                fin: "2027-01-01T05:00:00Z".into(),
            },
        ])
        .unwrap();
    assert_eq!(n, [0, 4]);
    // Lire ne change rien.
    assert_eq!(s.lire_journal(100).unwrap(), avant);
    assert_eq!(s.nombre_entrees_journal().unwrap(), 4);
}

#[test]
fn journal_vide() {
    let d = TempDir::new().unwrap();
    let (s, _) = ouvrir(&d);
    let p = s
        .lire_page_journal(0, 0, &FiltreJournal::default())
        .unwrap();
    assert!(p.entrees.is_empty());
    assert_eq!(p.total, 0);
    assert_eq!(p.plus_ancien, None);
}
