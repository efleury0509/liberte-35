//! Tests de l'étape 6 : export portable (cas E1 à E7). Données fictives.

use super::*;
use serde_json::{json, Value};
use std::io::Read;
use tempfile::TempDir;

fn ouvrir(d: &TempDir, profil: Profil) -> Stockage {
    Stockage::ouvrir(
        &d.path().join("liberte-35.sqlite"),
        profil,
        Box::new(HorlogeFixe("2026-11-08T20:52:29Z".into())),
    )
    .unwrap()
}

fn journal(objet: &str) -> Vec<NouvelleEntree> {
    vec![NouvelleEntree {
        section: "Mes paies".into(),
        objet: objet.into(),
        champ: "création".into(),
        ancienne_valeur: None,
        nouvelle_valeur: Some("2 100,00 $; « fictif »".into()),
        motif: None,
    }]
}

fn epicerie() -> ElementStocke {
    ElementStocke {
        id: "epicerie".into(),
        libelle: "Épicerie « maison »; fruits".into(),
        nature: "depense".into(),
        genre: "enveloppe".into(),
        incertain: false,
        estimation: true,
        frequence: json!({ "type": "chaquePaie" }),
        montants: vec![MontantStocke {
            a_partir_du: "2027-01-07".into(),
            montant: 123_456,
        }],
        suspensions: vec![],
        fin: None,
        cycle_paie: None,
        changements_frequence: vec![],
    }
}

fn remplir(s: &mut Stockage) {
    s.appliquer_changements_paie(
        &[
            ChangementPaie::DefinirProfil {
                profil: ProfilPaieStocke {
                    frequence: "deuxSemaines".into(),
                    depart: "2027-01-07".into(),
                    jours: None,
                },
            },
            ChangementPaie::DefinirSalaire {
                salaire: SalaireStocke {
                    a_partir_du: "2027-01-07".into(),
                    montant: 210_000,
                },
            },
            ChangementPaie::DefinirElement {
                element: epicerie(),
            },
            ChangementPaie::DefinirConfirmation {
                confirmation: ConfirmationStockee {
                    element_id: None,
                    origine: "2027-01-07".into(),
                    date: "2027-01-08".into(),
                    montant: 210_005,
                },
            },
        ],
        &journal("Paie"),
    )
    .unwrap();
}

/// Contenu du dossier compressé : nom → texte.
fn lire_zip(chemin: &Path) -> std::collections::BTreeMap<String, String> {
    let f = std::fs::File::open(chemin).unwrap();
    let mut z = zip::ZipArchive::new(f).unwrap();
    let mut m = std::collections::BTreeMap::new();
    for i in 0..z.len() {
        let mut e = z.by_index(i).unwrap();
        let mut t = String::new();
        e.read_to_string(&mut t).unwrap();
        let nom = e.name().unwrap().to_string();
        m.insert(nom, t);
    }
    m
}

const CSV_ATTENDUS: &[&str] = &[
    "ajustements.csv",
    "changements-frequence.csv",
    "confirmations.csv",
    "elements.csv",
    "journal.csv",
    "montants.csv",
    "paies-modifiees.csv",
    "prets.csv",
    "profil-paie.csv",
    "salaires.csv",
    "soldes-prets.csv",
    "suspensions.csv",
];

#[test]
fn e1_le_dossier_compresse_contient_le_json_un_csv_par_type_et_le_lisezmoi() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d, Profil::Officiel);
    remplir(&mut s);
    let dest = d.path().join("export.zip");
    let r = s.exporter(&dest, "0.6.0").unwrap();
    let contenu = lire_zip(&dest);
    let mut attendus: Vec<&str> = CSV_ATTENDUS.to_vec();
    attendus.push("LISEZMOI.txt");
    attendus.push("donnees.json");
    attendus.sort();
    assert_eq!(
        contenu.keys().map(String::as_str).collect::<Vec<_>>(),
        attendus
    );
    assert_eq!(r.fichiers.len(), attendus.len());
    assert_eq!(r.nom_fichier, "export.zip");
    assert_eq!(r.resume.elements, 1);
    assert_eq!(r.resume.confirmations, 1);
    assert!(!r.vide);

    let lisezmoi = &contenu["LISEZMOI.txt"];
    for f in CSV_ATTENDUS {
        assert!(lisezmoi.contains(f), "{f} absent du LISEZMOI");
    }
    assert!(lisezmoi.contains("LibreOffice Calc"));
    assert!(lisezmoi
        .contains("Exporté le 2026-11-08 20:52:29 (heure universelle) par Liberté 35 0.6.0."));
    assert!(lisezmoi.contains("en cents"));
    assert!(lisezmoi.contains("Montant ($)"));
}

#[test]
fn e2_le_json_contient_toutes_les_tables_et_tous_les_champs() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d, Profil::Officiel);
    remplir(&mut s);
    s.definir_parametre("page_ouverture", "mes-paies").unwrap();
    let dest = d.path().join("export.zip");
    s.exporter(&dest, "0.6.0").unwrap();
    let json: Value = serde_json::from_str(&lire_zip(&dest)["donnees.json"]).unwrap();

    assert_eq!(json["format"], "liberte-35-export");
    assert_eq!(json["versionFormat"], 1);
    assert_eq!(json["versionApplication"], "0.6.0");
    assert_eq!(json["installation"], "officiel");
    assert_eq!(json["versionSchema"], version_schema_attendue());
    assert_eq!(json["exporteLe"], "2026-11-08T20:52:29Z");
    // Chaque table du fichier, chaque ligne, chaque champ.
    let attendu = serde_json::to_value(s.contenu_des_tables().unwrap()).unwrap();
    assert_eq!(json["tables"], attendu);
    let noms: Vec<String> = s
        .conn
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .map(Result::unwrap)
        .collect();
    for n in &noms {
        assert!(json["tables"].get(n).is_some(), "table {n} absente");
    }
    // Montants au cent près, en cents entiers.
    assert_eq!(json["tables"]["salaires"][0]["montant"], 210_000);
    assert_eq!(json["tables"]["montants_element"][0]["montant"], 123_456);
    assert_eq!(json["tables"]["confirmations"][0]["montant"], 210_005);
    assert_eq!(json["tables"]["parametres"][0]["valeur"], "mes-paies");
}

#[test]
fn e2_chaque_table_du_schema_a_un_csv_sauf_les_tables_techniques() {
    // Garde-fou : une table ajoutée par une étape future doit recevoir son CSV.
    let d = TempDir::new().unwrap();
    let s = ouvrir(&d, Profil::Essai);
    let mut noms: Vec<String> = s
        .conn
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .map(Result::unwrap)
        .collect();
    noms.retain(|n| n != "meta" && n != "parametres");
    let mut couvertes: Vec<String> = export::tables_couvertes_par_les_csv()
        .into_iter()
        .map(str::to_string)
        .collect();
    couvertes.sort();
    assert_eq!(couvertes, noms);
}

#[test]
fn e3_les_csv_sont_lisibles_par_libreoffice_calc_en_francais() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d, Profil::Officiel);
    remplir(&mut s);
    let dest = d.path().join("export.zip");
    s.exporter(&dest, "0.6.0").unwrap();
    let z = lire_zip(&dest);

    for f in CSV_ATTENDUS {
        let t = &z[*f];
        assert!(t.starts_with('\u{feff}'), "{f} : marque UTF-8 absente");
        assert!(t.ends_with("\r\n"), "{f} : fin de ligne Windows absente");
    }
    let salaires = &z["salaires.csv"];
    assert_eq!(
        salaires,
        "\u{feff}À partir du;Montant ($)\r\n2027-01-07;2100,00\r\n"
    );

    let elements = &z["elements.csv"];
    let lignes: Vec<&str> = elements
        .trim_start_matches('\u{feff}')
        .split("\r\n")
        .collect();
    assert_eq!(
        lignes[0],
        "Identifiant;Libellé;Nature;Genre;Incertain;Estimation;Fréquence (JSON);Fin;Cycle de la paie du"
    );
    // Accents gardés ; le point-virgule et les guillemets sont protégés.
    assert_eq!(
        lignes[1],
        "epicerie;\"Épicerie « maison »; fruits\";dépense;enveloppe;non;oui;\"{\"\"type\"\":\"\"chaquePaie\"\"}\";;"
    );

    let montants = &z["montants.csv"];
    assert!(montants.contains("epicerie;\"Épicerie « maison »; fruits\";2027-01-07;1234,56\r\n"));
    // Pas d'espace des milliers : le montant reste un nombre pour Calc.
    assert!(!montants.contains("1 234"));

    let conf = &z["confirmations.csv"];
    assert!(
        conf.contains(";Paie;2027-01-07;2027-01-08;2100,05;2026-11-08 20:52:29\r\n"),
        "{conf}"
    );

    let journal = &z["journal.csv"];
    assert!(journal.starts_with("\u{feff}Numéro;Horodatage (UTC);Section;Objet;Champ;Ancienne valeur;Nouvelle valeur;Motif\r\n"));
    assert!(journal.contains(
        "1;2026-11-08 20:52:29;Mes paies;Paie;création;;\"2 100,00 $; « fictif »\";\r\n"
    ));
}

#[test]
fn e3_format_des_montants() {
    assert_eq!(export::montant_csv(0), "0,00");
    assert_eq!(export::montant_csv(5), "0,05");
    assert_eq!(export::montant_csv(210_000), "2100,00");
    assert_eq!(export::montant_csv(123_456_789), "1234567,89");
    assert_eq!(export::montant_csv(-1_250), "-12,50");
}

#[test]
fn e4_aucun_secret_ni_chemin_personnel_dans_l_export() {
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d, Profil::Officiel);
    remplir(&mut s);
    let dest = d.path().join("export.zip");
    s.exporter(&dest, "0.6.0").unwrap();
    let dossier = d.path().display().to_string();
    for (nom, texte) in lire_zip(&dest) {
        assert!(
            !texte.contains(&dossier),
            "{nom} contient le dossier des données"
        );
        let bas = texte.to_lowercase();
        for interdit in [
            "appdata",
            "\\users\\",
            "/home/",
            "/root/",
            "secret",
            "jeton",
            "token",
            "phrase de passe :",
        ] {
            assert!(!bas.contains(interdit), "{nom} contient « {interdit} »");
        }
    }
}

#[test]
fn e5_l_export_d_une_installation_vide_fonctionne_et_le_dit() {
    let d = TempDir::new().unwrap();
    let s = ouvrir(&d, Profil::Officiel);
    let dest = d.path().join("vide.zip");
    let r = s.exporter(&dest, "0.6.0").unwrap();
    assert!(r.vide);
    let z = lire_zip(&dest);
    assert_eq!(z["salaires.csv"], "\u{feff}À partir du;Montant ($)\r\n");
    assert!(z["LISEZMOI.txt"].contains("Aucune donnée pour l'instant"));
}

#[test]
fn e6_un_export_d_essai_porte_essai_dans_son_nom_et_dans_le_json() {
    let d = TempDir::new().unwrap();
    let s = ouvrir(&d, Profil::Essai);
    assert_eq!(
        s.nom_export_propose(),
        "liberte-35-essai-export-2026-11-08.zip"
    );
    let dest = d.path().join(s.nom_export_propose());
    s.exporter(&dest, "0.6.0").unwrap();
    let z = lire_zip(&dest);
    let json: Value = serde_json::from_str(&z["donnees.json"]).unwrap();
    assert_eq!(json["installation"], "essai");
    assert!(z["LISEZMOI.txt"].contains("données fictives"));

    let d2 = TempDir::new().unwrap();
    let o = ouvrir(&d2, Profil::Officiel);
    assert_eq!(o.nom_export_propose(), "liberte-35-export-2026-11-08.zip");
}

#[test]
fn e7_l_export_va_a_l_emplacement_choisi_et_un_echec_ne_laisse_rien() {
    let d = TempDir::new().unwrap();
    let cle_usb = TempDir::new().unwrap();
    let mut s = ouvrir(&d, Profil::Officiel);
    remplir(&mut s);
    let dest = cle_usb
        .path()
        .join("Sauvegardes Liberté")
        .join("mon export.zip");
    std::fs::create_dir_all(dest.parent().unwrap()).unwrap();
    s.exporter(&dest, "0.6.0").unwrap();
    assert!(dest.exists());
    // Un export existant est remplacé proprement.
    s.exporter(&dest, "0.6.0").unwrap();
    assert_eq!(lire_zip(&dest).len(), CSV_ATTENDUS.len() + 2);

    // Dossier absent : échec, et aucun fichier à moitié écrit.
    let absent = cle_usb.path().join("debranchee").join("export.zip");
    assert!(s.exporter(&absent, "0.6.0").is_err());
    assert!(!absent.exists());
    // Destination occupée par un dossier : échec, rien d'autre n'est touché.
    let occupe = cle_usb.path().join("occupe.zip");
    std::fs::create_dir(&occupe).unwrap();
    assert!(s.exporter(&occupe, "0.6.0").is_err());
    let restes: Vec<String> = std::fs::read_dir(cle_usb.path())
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
        .filter(|n| n.ends_with(".ecriture"))
        .collect();
    assert!(restes.is_empty(), "{restes:?}");
    // L'export ne modifie pas les données.
    assert_eq!(s.nombre_entrees_journal().unwrap(), 1);
}

/// Fabrique un export d'exemple dans $L35_EXPORT_DEMO (vérification
/// manuelle dans LibreOffice Calc). Ignoré par défaut.
#[test]
#[ignore]
fn export_de_demonstration() {
    let Ok(cible) = std::env::var("L35_EXPORT_DEMO") else {
        return;
    };
    let d = TempDir::new().unwrap();
    let mut s = ouvrir(&d, Profil::Essai);
    remplir(&mut s);
    s.exporter(Path::new(&cible), "0.6.0").unwrap();
}
