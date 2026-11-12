//! Étape 6 : copies du jour, copies de précaution et restauration.
//!
//! - Trois copies du jour, de trois journées d'utilisation distinctes, dans
//!   le sous-dossier `copies`. Chaque copie est écrite sous un nom
//!   temporaire, vérifiée, puis seulement alors mise en place.
//! - Cinq copies de précaution au plus, dans `precaution` : avant chaque
//!   restauration et chaque mise à niveau de la structure.
//! - Une restauration vérifie la copie, fait une copie de précaution de
//!   l'état actuel, puis remplace le fichier. Tout échec avant le
//!   remplacement laisse le fichier actuel intact.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};

use super::{
    formater_utc, lire_version, migrations::MIGRATIONS, ouvrir_connexion, rapport_integrite,
    version_schema_attendue, ErreurStockage, NouvelleEntree, Profil, Resultat, Stockage,
    DOSSIER_PRECAUTION, MARQUE_APPLICATION,
};

pub const DOSSIER_COPIES: &str = "copies";
pub const NOMBRE_COPIES_DU_JOUR: usize = 3;
pub const NOMBRE_COPIES_DE_PRECAUTION: usize = 5;
const SUFFIXE_ECRITURE: &str = ".ecriture";
const SUFFIXE_RESTAURATION: &str = ".restauration";

/// Où se trouve une copie. Les noms sont vérifiés : impossible de sortir
/// du dossier des copies.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "genre", rename_all = "camelCase")]
pub enum SourceCopie {
    Jour { nom: String },
    Precaution { nom: String },
    Fichier { chemin: String },
}

/// Ce que contient une copie, en quelques nombres.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumeCopie {
    pub paie_configuree: bool,
    pub salaires: u64,
    pub elements: u64,
    pub confirmations: u64,
    pub entrees_journal: u64,
    /// Lot 1 : date de la première paie du calendrier de cette copie, pour
    /// reconnaître une copie d'un coup d'œil (« paies depuis le … »).
    pub debut_paies: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopieListee {
    pub source: SourceCopie,
    pub nom: String,
    /// Copie du jour : le jour (AAAA-MM-JJ).
    pub jour: Option<String>,
    /// Moment de la copie, UTC (ISO 8601).
    pub horodatage: String,
    /// Copie de précaution : « restauration » ou « miseANiveau ».
    pub motif: Option<String>,
    pub lisible: bool,
    pub raison: Option<String>,
    pub version_schema: Option<u32>,
    pub resume: Option<ResumeCopie>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListeDesCopies {
    pub copies_du_jour: Vec<CopieListee>,
    pub precautions: Vec<CopieListee>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopieFaite {
    pub nom: String,
    pub jour: String,
    pub horodatage: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangementJournal {
    pub horodatage: String,
    pub section: String,
    pub objet: String,
    pub champ: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApercuRestauration {
    pub source: SourceCopie,
    pub nom: String,
    pub horodatage: String,
    pub version_schema: u32,
    /// La copie vient d'une structure plus ancienne : elle sera mise à niveau.
    pub mise_a_niveau: bool,
    pub resume: ResumeCopie,
    /// Changements faits depuis la copie, qui seront retirés.
    pub nombre_retires: u64,
    /// Les plus récents d'abord, cinq au plus.
    pub retires: Vec<ChangementJournal>,
    /// Changements présents dans la copie mais pas maintenant (par exemple
    /// en restaurant une copie de précaution) : ils reviennent.
    pub nombre_retrouves: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultatRestauration {
    pub nom: String,
    /// Copie de précaution de l'état d'avant.
    pub precaution: String,
}

/// Ce qu'on apprend d'un fichier de copie après l'avoir vérifié.
pub(crate) struct Examen {
    pub version: u32,
    pub resume: ResumeCopie,
}

const NON_LIBERTE: &str = "Ce fichier n'est pas une copie de Liberté 35.";

fn illisible() -> String {
    "Cette copie est illisible (le contrôle d'intégrité a échoué) : elle ne peut pas être restaurée."
        .to_string()
}

fn compter(conn: &Connection, table: &str) -> Result<u64, rusqlite::Error> {
    let existe: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_schema WHERE type = 'table' AND name = ?1",
        [table],
        |r| r.get(0),
    )?;
    if existe == 0 {
        return Ok(0);
    }
    let n: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM \"{table}\""), [], |r| {
        r.get(0)
    })?;
    Ok(n as u64)
}

pub(crate) fn resume_de(conn: &Connection) -> Result<ResumeCopie, rusqlite::Error> {
    Ok(ResumeCopie {
        paie_configuree: compter(conn, "profil_paie")? > 0,
        salaires: compter(conn, "salaires")?,
        elements: compter(conn, "elements")?,
        confirmations: compter(conn, "confirmations")?,
        entrees_journal: compter(conn, "journal_changements")?,
        debut_paies: debut_paies(conn)?,
    })
}

fn debut_paies(conn: &Connection) -> Result<Option<String>, rusqlite::Error> {
    if compter(conn, "profil_paie")? == 0 {
        return Ok(None);
    }
    conn.query_row("SELECT depart FROM profil_paie LIMIT 1", [], |r| r.get(0))
}

fn ouvrir_lecture(chemin: &Path) -> Result<Connection, rusqlite::Error> {
    Connection::open_with_flags(chemin, OpenFlags::SQLITE_OPEN_READ_ONLY)
}

/// Vérifie qu'un fichier est une copie restaurable dans l'installation
/// `profil`. L'erreur est une explication pour l'utilisatrice.
pub(crate) fn examiner(chemin: &Path, profil: Profil) -> Result<Examen, String> {
    if !chemin.is_file() {
        return Err("Ce fichier est introuvable.".into());
    }
    let mut entete = [0u8; 16];
    let lu = {
        use std::io::Read;
        let mut f = std::fs::File::open(chemin)
            .map_err(|e| format!("Ce fichier ne peut pas être lu ({e})."))?;
        f.read(&mut entete).unwrap_or(0)
    };
    let est_zip = entete.starts_with(b"PK\x03\x04")
        || chemin
            .extension()
            .map(|x| x.eq_ignore_ascii_case("zip"))
            .unwrap_or(false);
    if est_zip {
        return Err("Ce fichier est un export (.zip) : un export ne se restaure pas. Choisis une copie de sauvegarde (.sqlite).".into());
    }
    if lu < 16 || &entete != b"SQLite format 3\0" {
        return Err(NON_LIBERTE.into());
    }
    let conn = ouvrir_lecture(chemin).map_err(|_| illisible())?;
    match rapport_integrite(&conn) {
        Ok(r) if r == "ok" => {}
        _ => return Err(illisible()),
    }
    let version = lire_version(&conn).map_err(|_| illisible())?;
    if version == 0 {
        return Err(NON_LIBERTE.into());
    }
    let lire = |cle: &str| -> Option<String> {
        conn.query_row("SELECT valeur FROM meta WHERE cle = ?1", [cle], |r| {
            r.get(0)
        })
        .ok()
    };
    if lire("application").as_deref() != Some(MARQUE_APPLICATION) {
        return Err(NON_LIBERTE.into());
    }
    match (lire("profil").as_deref().and_then(Profil::depuis_code), profil) {
        (Some(p), attendu) if p == attendu => {}
        (Some(Profil::Essai), Profil::Officiel) => {
            return Err("Cette copie vient de l'installation d'essai (données fictives) : elle ne peut pas être restaurée dans l'installation officielle.".into())
        }
        (Some(Profil::Officiel), Profil::Essai) => {
            return Err("Cette copie vient de l'installation officielle : elle ne peut pas être restaurée dans l'installation d'essai.".into())
        }
        _ => return Err(NON_LIBERTE.into()),
    }
    let attendue = version_schema_attendue();
    if version > attendue {
        return Err(format!(
            "Cette copie a été créée par une version plus récente de Liberté 35 (structure {version} ; cette version connaît la structure {attendue}). Installe d'abord la version la plus récente."
        ));
    }
    let resume = resume_de(&conn).map_err(|_| illisible())?;
    Ok(Examen { version, resume })
}

/// Écrit une copie complète de `conn` dans `cible` (qui ne doit pas
/// exister), puis la vérifie : intègre, même structure, même installation.
pub(crate) fn ecrire_copie_verifiee(
    conn: &Connection,
    cible: &Path,
    profil: Profil,
) -> Result<(), String> {
    let version = lire_version(conn).map_err(|e| e.to_string())?;
    conn.execute("VACUUM INTO ?1", [cible.to_string_lossy().to_string()])
        .map_err(|e| e.to_string())?;
    let examen = examiner(cible, profil)?;
    if examen.version != version {
        return Err(format!("structure {} au lieu de {version}", examen.version));
    }
    Ok(())
}

fn retirer_si_fichier(chemin: &Path) {
    if chemin.is_file() {
        let _ = std::fs::remove_file(chemin);
    }
}

fn est_nom_de_jour(nom: &str) -> bool {
    let b = nom.as_bytes();
    nom.len() == "jour-2026-11-08.sqlite".len()
        && nom.starts_with("jour-")
        && nom.ends_with(".sqlite")
        && b[5..9].iter().all(u8::is_ascii_digit)
        && b[9] == b'-'
        && b[10..12].iter().all(u8::is_ascii_digit)
        && b[12] == b'-'
        && b[13..15].iter().all(u8::is_ascii_digit)
}

fn est_nom_de_precaution(nom: &str) -> bool {
    nom.starts_with("avant-")
        && nom.ends_with(".sqlite")
        && !nom.contains("..")
        && nom
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '.')
}

/// Horodatage (14 chiffres) et rang d'un nom de copie de précaution.
fn cle_precaution(nom: &str) -> Option<(String, u32)> {
    let corps = nom.strip_prefix("avant-")?.strip_suffix(".sqlite")?;
    let morceaux: Vec<&str> = corps.split('-').collect();
    let i = morceaux
        .iter()
        .position(|m| m.len() == 14 && m.chars().all(|c| c.is_ascii_digit()))?;
    let rang = morceaux
        .get(i + 1)
        .and_then(|m| m.parse().ok())
        .unwrap_or(0);
    Some((morceaux[i].to_string(), rang))
}

fn horodatage_de_chiffres(c: &str) -> String {
    format!(
        "{}-{}-{}T{}:{}:{}Z",
        &c[0..4],
        &c[4..6],
        &c[6..8],
        &c[8..10],
        &c[10..12],
        &c[12..14]
    )
}

fn horodatage_du_fichier(chemin: &Path) -> String {
    std::fs::metadata(chemin)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| formater_utc(d.as_secs() as i64))
        .unwrap_or_default()
}

fn noms_dans(dossier: &Path, garder: impl Fn(&str) -> bool) -> Vec<String> {
    let Ok(lecture) = std::fs::read_dir(dossier) else {
        return Vec::new();
    };
    lecture
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| garder(n))
        .collect()
}

/// Les copies de précaution, les plus récentes d'abord.
fn precautions_triees(dossier: &Path) -> Vec<String> {
    let mut noms: Vec<(String, u32, String)> = noms_dans(dossier, est_nom_de_precaution)
        .into_iter()
        .filter_map(|n| cle_precaution(&n).map(|(h, r)| (h, r, n)))
        .collect();
    noms.sort();
    noms.reverse();
    noms.into_iter().map(|(_, _, n)| n).collect()
}

/// Garde les cinq copies de précaution les plus récentes.
pub(crate) fn elaguer_precautions(dossier: &Path) {
    for nom in precautions_triees(dossier)
        .into_iter()
        .skip(NOMBRE_COPIES_DE_PRECAUTION)
    {
        let _ = std::fs::remove_file(dossier.join(nom));
    }
}

/// Nom libre pour une copie de précaution `avant-<motif>-<horodatage>`.
pub(crate) fn nom_de_precaution(dossier: &Path, motif: &str, maintenant: &str) -> String {
    let chiffres: String = maintenant.chars().filter(|c| c.is_ascii_digit()).collect();
    let mut nom = format!("avant-{motif}-{chiffres}.sqlite");
    let mut rang = 2;
    while dossier.join(&nom).exists() {
        nom = format!("avant-{motif}-{chiffres}-{rang}.sqlite");
        rang += 1;
    }
    nom
}

/// Retire les fichiers temporaires laissés par une coupure (cas R7).
pub(crate) fn nettoyer_temporaires(chemin_donnees: &Path) {
    if let Some(dossier) = chemin_donnees.parent() {
        for nom in noms_dans(&dossier.join(DOSSIER_COPIES), |n| {
            n.ends_with(SUFFIXE_ECRITURE)
        }) {
            let _ = std::fs::remove_file(dossier.join(DOSSIER_COPIES).join(nom));
        }
    }
    retirer_si_fichier(&temporaire_de_restauration(chemin_donnees));
}

fn temporaire_de_restauration(chemin_donnees: &Path) -> PathBuf {
    let mut nom = chemin_donnees
        .file_name()
        .map(|n| n.to_os_string())
        .unwrap_or_default();
    nom.push(SUFFIXE_RESTAURATION);
    chemin_donnees.with_file_name(nom)
}

impl Stockage {
    fn dossier_donnees(&self) -> PathBuf {
        self.chemin
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_default()
    }

    fn dossier_copies(&self) -> PathBuf {
        self.dossier_donnees().join(DOSSIER_COPIES)
    }

    fn dossier_precaution(&self) -> PathBuf {
        self.dossier_donnees().join(DOSSIER_PRECAUTION)
    }

    /// Écrit (ou remplace) la copie du jour, vérifiée, puis garde les trois
    /// copies les plus récentes. Un échec laisse les autres copies intactes.
    pub fn faire_copie_du_jour(&self) -> Resultat<CopieFaite> {
        let jour = self.horloge.jour_local();
        let nom = format!("jour-{jour}.sqlite");
        if !est_nom_de_jour(&nom) {
            return Err(ErreurStockage::CopieDuJourEchouee(format!(
                "jour invalide : {jour}"
            )));
        }
        let dossier = self.dossier_copies();
        let temporaire = dossier.join(format!("{nom}{SUFFIXE_ECRITURE}"));
        let essai = (|| -> Result<(), String> {
            std::fs::create_dir_all(&dossier).map_err(|e| e.to_string())?;
            if temporaire.exists() {
                std::fs::remove_file(&temporaire).map_err(|e| e.to_string())?;
            }
            ecrire_copie_verifiee(&self.conn, &temporaire, self.profil)?;
            std::fs::rename(&temporaire, dossier.join(&nom)).map_err(|e| e.to_string())
        })();
        if let Err(e) = essai {
            retirer_si_fichier(&temporaire);
            return Err(ErreurStockage::CopieDuJourEchouee(e));
        }
        let mut jours = noms_dans(&dossier, est_nom_de_jour);
        jours.sort();
        jours.reverse();
        for ancien in jours.into_iter().skip(NOMBRE_COPIES_DU_JOUR) {
            let _ = std::fs::remove_file(dossier.join(ancien));
        }
        Ok(CopieFaite {
            nom,
            jour,
            horodatage: self.horloge.maintenant(),
        })
    }

    /// Les copies du jour et de précaution, les plus récentes d'abord,
    /// chacune vérifiée.
    pub fn lister_copies(&self) -> Resultat<ListeDesCopies> {
        let decrire = |source: SourceCopie, chemin: PathBuf, nom: String| -> CopieListee {
            let (jour, horodatage, motif) = match &source {
                SourceCopie::Jour { .. } => (
                    Some(nom[5..15].to_string()),
                    horodatage_du_fichier(&chemin),
                    None,
                ),
                _ => {
                    let h = cle_precaution(&nom)
                        .map(|(c, _)| horodatage_de_chiffres(&c))
                        .unwrap_or_else(|| horodatage_du_fichier(&chemin));
                    let motif = if nom.starts_with("avant-restauration") {
                        Some("restauration".to_string())
                    } else if nom.starts_with("avant-mise-a-niveau") {
                        Some("miseANiveau".to_string())
                    } else {
                        None
                    };
                    (None, h, motif)
                }
            };
            let examen = examiner(&chemin, self.profil);
            CopieListee {
                source,
                nom,
                jour,
                horodatage,
                motif,
                lisible: examen.is_ok(),
                version_schema: examen.as_ref().ok().map(|e| e.version),
                resume: examen.as_ref().ok().map(|e| e.resume.clone()),
                raison: examen.err(),
            }
        };
        let dossier = self.dossier_copies();
        let mut jours = noms_dans(&dossier, est_nom_de_jour);
        jours.sort();
        jours.reverse();
        let copies_du_jour = jours
            .into_iter()
            .map(|n| decrire(SourceCopie::Jour { nom: n.clone() }, dossier.join(&n), n))
            .collect();
        let dp = self.dossier_precaution();
        let precautions = precautions_triees(&dp)
            .into_iter()
            .map(|n| decrire(SourceCopie::Precaution { nom: n.clone() }, dp.join(&n), n))
            .collect();
        Ok(ListeDesCopies {
            copies_du_jour,
            precautions,
        })
    }

    fn chemin_de(&self, source: &SourceCopie) -> Result<(PathBuf, String), String> {
        let (chemin, nom) = match source {
            SourceCopie::Jour { nom } if est_nom_de_jour(nom) => {
                (self.dossier_copies().join(nom), nom.clone())
            }
            SourceCopie::Precaution { nom } if est_nom_de_precaution(nom) => {
                (self.dossier_precaution().join(nom), nom.clone())
            }
            SourceCopie::Fichier { chemin } if !chemin.trim().is_empty() => {
                let p = PathBuf::from(chemin);
                let nom = p
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                (p, nom)
            }
            _ => return Err("Cette copie est introuvable.".into()),
        };
        let meme = match (chemin.canonicalize(), self.chemin.canonicalize()) {
            (Ok(a), Ok(b)) => a == b,
            _ => false,
        };
        if meme {
            return Err("C'est le fichier de données actuel : choisis une copie.".into());
        }
        Ok((chemin, nom))
    }

    fn horodatage_de(&self, source: &SourceCopie, chemin: &Path, nom: &str) -> String {
        match source {
            SourceCopie::Precaution { .. } => cle_precaution(nom)
                .map(|(c, _)| horodatage_de_chiffres(&c))
                .unwrap_or_else(|| horodatage_du_fichier(chemin)),
            _ => horodatage_du_fichier(chemin),
        }
    }

    /// Ce que ferait la restauration de `source`, sans rien modifier.
    pub fn apercu_restauration(&self, source: &SourceCopie) -> Resultat<ApercuRestauration> {
        let (chemin, nom) = self
            .chemin_de(source)
            .map_err(ErreurStockage::RestaurationRefusee)?;
        let examen = examiner(&chemin, self.profil).map_err(ErreurStockage::RestaurationRefusee)?;
        let copie = ouvrir_lecture(&chemin)
            .map_err(|_| ErreurStockage::RestaurationRefusee(illisible()))?;
        let lire_journal =
            |c: &Connection| -> Result<Vec<(i64, ChangementJournal)>, rusqlite::Error> {
                let mut req = c.prepare(
                "SELECT id, horodatage, section, objet, champ FROM journal_changements ORDER BY id DESC",
            )?;
                let lignes = req.query_map([], |r| {
                    Ok((
                        r.get(0)?,
                        ChangementJournal {
                            horodatage: r.get(1)?,
                            section: r.get(2)?,
                            objet: r.get(3)?,
                            champ: r.get(4)?,
                        },
                    ))
                })?;
                lignes.collect()
            };
        let journal_copie =
            lire_journal(&copie).map_err(|_| ErreurStockage::RestaurationRefusee(illisible()))?;
        let journal_actuel = lire_journal(&self.conn)?;
        let cle = |(id, c): &(i64, ChangementJournal)| {
            (*id, c.horodatage.clone(), c.objet.clone(), c.champ.clone())
        };
        let dans_copie: HashSet<_> = journal_copie.iter().map(cle).collect();
        let dans_actuel: HashSet<_> = journal_actuel.iter().map(cle).collect();
        let retires: Vec<ChangementJournal> = journal_actuel
            .iter()
            .filter(|e| !dans_copie.contains(&cle(e)))
            .map(|(_, c)| c.clone())
            .collect();
        let nombre_retrouves = journal_copie
            .iter()
            .filter(|e| !dans_actuel.contains(&cle(e)))
            .count() as u64;
        Ok(ApercuRestauration {
            source: source.clone(),
            horodatage: self.horodatage_de(source, &chemin, &nom),
            nom,
            version_schema: examen.version,
            mise_a_niveau: examen.version < version_schema_attendue(),
            resume: examen.resume,
            nombre_retires: retires.len() as u64,
            retires: retires.into_iter().take(5).collect(),
            nombre_retrouves,
        })
    }

    /// Copie de précaution vérifiée de l'état actuel ; renvoie son nom.
    fn copie_de_precaution_actuelle(&self, motif: &str) -> Result<String, String> {
        let dossier = self.dossier_precaution();
        std::fs::create_dir_all(&dossier).map_err(|e| e.to_string())?;
        let nom = nom_de_precaution(&dossier, motif, &self.horloge.maintenant());
        let cible = dossier.join(&nom);
        if let Err(e) = ecrire_copie_verifiee(&self.conn, &cible, self.profil) {
            retirer_si_fichier(&cible);
            return Err(format!("copie de précaution impossible : {e}"));
        }
        elaguer_precautions(&dossier);
        Ok(nom)
    }

    /// Restaure `source`. Avant tout remplacement : vérification de la copie
    /// et copie de précaution de l'état actuel. Le journal de la copie est
    /// repris, puis une entrée « restauration » y est ajoutée.
    pub fn restaurer(&mut self, source: &SourceCopie) -> Resultat<ResultatRestauration> {
        let apercu = self.apercu_restauration(source)?;
        let (chemin_source, _) = self
            .chemin_de(source)
            .map_err(ErreurStockage::RestaurationRefusee)?;
        let temporaire = temporaire_de_restauration(&self.chemin);
        let echec = |e: String| ErreurStockage::RestaurationEchouee(e);

        // 1. Copie de la source à côté du fichier de données, vérifiée.
        //    (Avant la précaution : la source peut être une précaution que
        //    l'élagage retirerait.)
        let preparation = (|| -> Result<(), String> {
            if temporaire.exists() {
                std::fs::remove_file(&temporaire).map_err(|e| e.to_string())?;
            }
            let src = ouvrir_lecture(&chemin_source).map_err(|_| illisible())?;
            ecrire_copie_verifiee(&src, &temporaire, self.profil)
        })();
        if let Err(e) = preparation {
            retirer_si_fichier(&temporaire);
            return Err(echec(e));
        }
        // 2. Copie de précaution de l'état actuel.
        let precaution = match self.copie_de_precaution_actuelle("restauration") {
            Ok(n) => n,
            Err(e) => {
                retirer_si_fichier(&temporaire);
                return Err(echec(e));
            }
        };
        // 3. Fermer le fichier actuel, puis le remplacer.
        let ancienne = std::mem::replace(&mut self.conn, Connection::open_in_memory()?);
        if let Err((conn, e)) = ancienne.close() {
            self.conn = conn;
            retirer_si_fichier(&temporaire);
            return Err(echec(e.to_string()));
        }
        let rouvrir = |s: &mut Stockage| -> Resultat<()> {
            s.conn = ouvrir_connexion(&s.chemin, s.profil, s.horloge.as_ref(), MIGRATIONS)?;
            Ok(())
        };
        if let Err(e) = std::fs::rename(&temporaire, &self.chemin) {
            retirer_si_fichier(&temporaire);
            rouvrir(self)?;
            return Err(echec(e.to_string()));
        }
        // 4. Rouvrir (avec mise à niveau si la copie est plus ancienne).
        if let Err(e) = rouvrir(self) {
            // Dernier recours : remettre l'état d'avant.
            let _ = std::fs::copy(self.dossier_precaution().join(&precaution), &self.chemin);
            rouvrir(self)?;
            return Err(echec(e.to_string()));
        }
        let description = match source {
            SourceCopie::Jour { nom } => format!("copie du {} ({nom})", &nom[5..15]),
            SourceCopie::Precaution { nom } => format!(
                "copie de précaution du {} ({nom})",
                apercu.horodatage.chars().take(10).collect::<String>()
            ),
            SourceCopie::Fichier { .. } => format!("fichier « {} »", apercu.nom),
        };
        self.consigner(&NouvelleEntree {
            section: "Paramètres".into(),
            objet: "Sauvegardes".into(),
            champ: "restauration".into(),
            ancienne_valeur: None,
            nouvelle_valeur: Some(description),
            motif: Some(format!(
                "L'état d'avant est gardé dans la copie de précaution {precaution}."
            )),
        })?;
        Ok(ResultatRestauration {
            nom: apercu.nom,
            precaution,
        })
    }
}
