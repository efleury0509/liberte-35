//! Accueil et journal (0.16.0) : lecture du journal par pages. Lecture
//! seule ; toutes les données sont fictives.

use super::*;
use tempfile::TempDir;

fn ouvrir(d: &TempDir) -> Stockage {
    Stockage::ouvrir(
        &d.path().join("donnees.sqlite"),
        Profil::Essai,
        Box::new(HorlogeFixe("2026-11-08T14:00:00Z".to_string())),
    )
    .unwrap()
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

fn remplir(s: &mut Stockage) {
    for i in 0..7 {
        let section = if i % 2 == 0 {
            "Mes paies"
        } else {
            "Mes dettes"
        };
        s.consigner(&entree(section, &format!("changement {i}")))
            .unwrap();
    }
}

#[test]
fn journal_par_pages_du_plus_recent_au_plus_ancien() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    remplir(&mut s);
    let p1 = s.lire_page_journal(None, 3, &[]).unwrap();
    let champs: Vec<_> = p1.entrees.iter().map(|e| e.champ.as_str()).collect();
    assert_eq!(champs, ["changement 6", "changement 5", "changement 4"]);
    assert_eq!(p1.restantes, 4);
    let p2 = s
        .lire_page_journal(Some(p1.entrees.last().unwrap().id), 3, &[])
        .unwrap();
    assert_eq!(p2.entrees[0].champ, "changement 3");
    assert_eq!(p2.restantes, 1);
    let p3 = s
        .lire_page_journal(Some(p2.entrees.last().unwrap().id), 3, &[])
        .unwrap();
    assert_eq!(p3.entrees.len(), 1);
    assert_eq!(p3.restantes, 0);
}

#[test]
fn journal_filtre_par_section_sans_rien_modifier() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    remplir(&mut s);
    let avant = s.lire_journal(100).unwrap();
    let dettes = s
        .lire_page_journal(None, 50, &["Mes dettes".to_string()])
        .unwrap();
    assert_eq!(dettes.entrees.len(), 3);
    assert!(dettes.entrees.iter().all(|e| e.section == "Mes dettes"));
    assert_eq!(dettes.restantes, 0);
    let deux = s
        .lire_page_journal(
            None,
            50,
            &["Mes dettes".to_string(), "Mes paies".to_string()],
        )
        .unwrap();
    assert_eq!(deux.entrees.len(), 7);
    // Lire ne change rien : même journal, même nombre.
    assert_eq!(s.lire_journal(100).unwrap(), avant);
    assert_eq!(s.nombre_entrees_journal().unwrap(), 7);
}

#[test]
fn journal_vide_et_limite_bornee() {
    let d = TempDir::new().unwrap();
    let s = ouvrir(&d);
    let p = s.lire_page_journal(None, 0, &[]).unwrap();
    assert!(p.entrees.is_empty());
    assert_eq!(p.restantes, 0);
}
