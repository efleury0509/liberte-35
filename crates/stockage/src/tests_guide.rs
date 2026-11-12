//! Configuration guidée (0.22.0) : un réglage d'affichage, sans journal et
//! sans effet sur les données financières. Données fictives.

use super::*;
use tempfile::TempDir;

fn ouvrir(d: &TempDir) -> Stockage {
    Stockage::ouvrir(
        &d.path().join("donnees.sqlite"),
        Profil::Essai,
        Box::new(HorlogeFixe("2026-11-12T15:00:00Z".into())),
    )
    .unwrap()
}

fn guide(statut: &str, etape: u8) -> ConfigurationGuidee {
    ConfigurationGuidee {
        statut: statut.into(),
        etape,
    }
}

#[test]
fn absente_au_depart_puis_lue_telle_quelle() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    assert_eq!(s.lire_configuration_guidee().unwrap(), None);
    s.definir_configuration_guidee(&guide("enCours", 3))
        .unwrap();
    assert_eq!(
        s.lire_configuration_guidee().unwrap(),
        Some(guide("enCours", 3))
    );
    s.definir_configuration_guidee(&guide("terminee", 6))
        .unwrap();
    assert_eq!(
        s.lire_configuration_guidee().unwrap(),
        Some(guide("terminee", 6))
    );
}

#[test]
fn conservee_apres_reouverture() {
    let d = TempDir::new().unwrap();
    ouvrir(&d)
        .definir_configuration_guidee(&guide("masquee", 2))
        .unwrap();
    assert_eq!(
        ouvrir(&d).lire_configuration_guidee().unwrap(),
        Some(guide("masquee", 2))
    );
}

#[test]
fn ne_touche_ni_au_journal_ni_aux_donnees() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    let avant = s.lire_paie().unwrap();
    s.definir_configuration_guidee(&guide("enCours", 4))
        .unwrap();
    assert_eq!(s.nombre_entrees_journal().unwrap(), 0);
    assert_eq!(s.lire_paie().unwrap(), avant);
}

#[test]
fn valeurs_invalides_refusees_sans_rien_ecrire() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    assert!(s
        .definir_configuration_guidee(&guide("inconnu", 2))
        .is_err());
    assert!(s
        .definir_configuration_guidee(&guide("enCours", 0))
        .is_err());
    assert!(s
        .definir_configuration_guidee(&guide("enCours", 7))
        .is_err());
    assert_eq!(s.lire_configuration_guidee().unwrap(), None);
}

#[test]
fn valeur_illisible_comptee_comme_absente() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d);
    s.definir_parametre("configuration_guidee", "pas du json")
        .unwrap();
    assert_eq!(s.lire_configuration_guidee().unwrap(), None);
    s.definir_parametre("configuration_guidee", r#"{"statut":"enCours","etape":9}"#)
        .unwrap();
    assert_eq!(s.lire_configuration_guidee().unwrap(), None);
}
