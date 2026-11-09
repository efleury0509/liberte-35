//! Stockage local de Liberté 35.
//!
//! Un seul fichier SQLite contient toutes les données. Ce module :
//! - crée le fichier ou l'ouvre, et le met à niveau vers la dernière version
//!   du schéma, après une copie de précaution vérifiée ;
//! - refuse d'ouvrir un fichier qui appartient à l'autre installation
//!   (essai ou officielle), pour que les données fictives ne contaminent
//!   jamais les vraies ;
//! - tient le journal des changements significatifs, qui ne peut être ni
//!   modifié ni effacé.

mod export;
mod horloge;
mod migrations;
mod paie;
mod sauvegardes;

use std::fmt;
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OpenFlags, OptionalExtension};

pub use export::ResumeExport;
pub use horloge::{formater_utc, Horloge, HorlogeFixe, HorlogeSysteme};
use migrations::{derniere_version, Migration, MIGRATIONS};
pub use paie::{
    AjustementStocke, CarteStocke, ChangementPaie, ConfirmationStockee, DonneesPaie, ElementStocke,
    ExceptionStockee, FraisCarteStocke, MontantStocke, PeriodeStockee, PretStocke,
    ProfilPaieStocke, ReleveStocke, SalaireStocke, SoldeCarteStocke, SoldePretStocke,
    SuspensionStocke,
};
pub use sauvegardes::{
    ApercuRestauration, ChangementJournal, CopieFaite, CopieListee, ListeDesCopies,
    ResultatRestauration, ResumeCopie, SourceCopie,
};

/// Version du schéma attendue par cette version de l'application.
pub fn version_schema_attendue() -> u32 {
    derniere_version(MIGRATIONS)
}

/// Liste des versions du schéma et de leur description, pour l'affichage.
pub fn versions_du_schema() -> Vec<(u32, &'static str)> {
    MIGRATIONS
        .iter()
        .map(|m| (m.version, m.description))
        .collect()
}

/// Les deux installations possibles. Chacune a son propre fichier.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Profil {
    Essai,
    Officiel,
}

impl Profil {
    pub fn code(self) -> &'static str {
        match self {
            Profil::Essai => "essai",
            Profil::Officiel => "officiel",
        }
    }

    /// Déduit le profil de l'identifiant de l'installation : seule
    /// l'installation dont l'identifiant finit par « .essai » est l'essai.
    /// Tout autre identifiant est traité comme officiel, et chacun a son
    /// propre dossier de données sous Windows.
    pub fn depuis_identifiant(identifiant: &str) -> Profil {
        if identifiant.ends_with(".essai") {
            Profil::Essai
        } else {
            Profil::Officiel
        }
    }

    pub fn depuis_code(code: &str) -> Option<Profil> {
        match code {
            "essai" => Some(Profil::Essai),
            "officiel" => Some(Profil::Officiel),
            _ => None,
        }
    }
}

#[derive(Debug)]
pub enum ErreurStockage {
    Sqlite(rusqlite::Error),
    Fichier(std::io::Error),
    /// Le fichier appartient à l'autre installation.
    ProfilIncompatible {
        attendu: Profil,
        trouve: String,
    },
    /// Le fichier a été créé par une version plus récente de l'application.
    VersionTropRecente {
        fichier: u32,
        application: u32,
    },
    /// Le fichier n'est pas un fichier de données de Liberté 35.
    FichierInconnu,
    /// Le contrôle d'intégrité a échoué ; rien n'a été modifié.
    IntegriteCompromise(String),
    /// La copie de précaution n'a pas pu être vérifiée ; la mise à niveau
    /// n'a pas eu lieu.
    CopieDePrecautionInvalide(String),
    /// Une donnée reçue est invalide ; rien n'a été enregistré.
    DonneeInvalide(String),
    /// La copie du jour n'a pas pu être faite ; les autres sont intactes.
    CopieDuJourEchouee(String),
    /// La copie choisie ne peut pas être restaurée (explication).
    RestaurationRefusee(String),
    /// La restauration a échoué en cours de route ; rien n'a changé.
    RestaurationEchouee(String),
    /// L'export n'a pas pu être enregistré.
    ExportEchoue(String),
}

impl fmt::Display for ErreurStockage {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ErreurStockage::Sqlite(e) => write!(f, "Erreur du fichier de données : {e}"),
            ErreurStockage::Fichier(e) => write!(f, "Erreur d'accès au fichier : {e}"),
            ErreurStockage::ProfilIncompatible { attendu, trouve } => write!(
                f,
                "Ce fichier appartient à l'installation « {trouve} », pas à l'installation « {} ». Il n'a pas été ouvert.",
                attendu.code()
            ),
            ErreurStockage::VersionTropRecente { fichier, application } => write!(
                f,
                "Ce fichier a été créé par une version plus récente de Liberté 35 (schéma {fichier}, cette version connaît le schéma {application}). Il n'a pas été modifié."
            ),
            ErreurStockage::FichierInconnu => {
                write!(f, "Ce fichier n'est pas un fichier de données de Liberté 35.")
            }
            ErreurStockage::IntegriteCompromise(d) => {
                write!(f, "Le contrôle d'intégrité a échoué ({d}). Rien n'a été modifié.")
            }
            ErreurStockage::DonneeInvalide(d) => write!(f, "{d} Rien n'a été enregistré."),
            ErreurStockage::CopieDuJourEchouee(d) => write!(
                f,
                "La copie de sauvegarde du jour n'a pas pu être faite ({d}). Tes données sont bien enregistrées et tes copies précédentes sont intactes."
            ),
            ErreurStockage::RestaurationRefusee(d) => write!(f, "{d}"),
            ErreurStockage::RestaurationEchouee(d) => write!(
                f,
                "La restauration n'a pas pu se faire ({d}). Rien n'a été restauré : tes données actuelles sont intactes."
            ),
            ErreurStockage::ExportEchoue(d) => write!(
                f,
                "L'export n'a pas pu être enregistré ({d}). Aucun fichier n'a été laissé à moitié écrit."
            ),
            ErreurStockage::CopieDePrecautionInvalide(d) => write!(
                f,
                "La copie de précaution n'a pas pu être vérifiée ({d}). La mise à niveau n'a pas eu lieu."
            ),
        }
    }
}

impl std::error::Error for ErreurStockage {}

impl From<rusqlite::Error> for ErreurStockage {
    fn from(e: rusqlite::Error) -> Self {
        ErreurStockage::Sqlite(e)
    }
}

impl From<std::io::Error> for ErreurStockage {
    fn from(e: std::io::Error) -> Self {
        ErreurStockage::Fichier(e)
    }
}

pub type Resultat<T> = Result<T, ErreurStockage>;

/// Une entrée à ajouter au journal des changements.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NouvelleEntree {
    pub section: String,
    pub objet: String,
    pub champ: String,
    pub ancienne_valeur: Option<String>,
    pub nouvelle_valeur: Option<String>,
    pub motif: Option<String>,
}

/// Une entrée lue dans le journal.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntreeJournal {
    pub id: i64,
    pub horodatage: String,
    pub section: String,
    pub objet: String,
    pub champ: String,
    pub ancienne_valeur: Option<String>,
    pub nouvelle_valeur: Option<String>,
    pub motif: Option<String>,
}

/// Résumé de l'état du stockage, affiché dans Paramètres.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EtatStockage {
    pub profil: Profil,
    pub version_schema: u32,
    pub chemin: PathBuf,
    pub integrite_ok: bool,
    pub nombre_entrees_journal: u64,
}

const MARQUE_APPLICATION: &str = "liberte-35";
pub(crate) const DOSSIER_PRECAUTION: &str = "precaution";

pub struct Stockage {
    conn: Connection,
    chemin: PathBuf,
    profil: Profil,
    horloge: Box<dyn Horloge>,
}

impl Stockage {
    /// Ouvre (ou crée) le fichier de données de l'installation `profil`.
    pub fn ouvrir(chemin: &Path, profil: Profil, horloge: Box<dyn Horloge>) -> Resultat<Stockage> {
        Self::ouvrir_avec(chemin, profil, horloge, MIGRATIONS)
    }

    fn ouvrir_avec(
        chemin: &Path,
        profil: Profil,
        horloge: Box<dyn Horloge>,
        migrations: &[Migration],
    ) -> Resultat<Stockage> {
        let conn = ouvrir_connexion(chemin, profil, horloge.as_ref(), migrations)?;
        sauvegardes::nettoyer_temporaires(chemin);
        Ok(Stockage {
            conn,
            chemin: chemin.to_path_buf(),
            profil,
            horloge,
        })
    }

    pub fn profil(&self) -> Profil {
        self.profil
    }

    pub fn chemin(&self) -> &Path {
        &self.chemin
    }

    pub fn version_schema(&self) -> Resultat<u32> {
        lire_version(&self.conn)
    }

    /// Contrôle d'intégrité complet du fichier (SQLite `integrity_check`).
    pub fn verifier_integrite(&self) -> Resultat<bool> {
        Ok(rapport_integrite(&self.conn)? == "ok")
    }

    pub fn etat(&self) -> Resultat<EtatStockage> {
        Ok(EtatStockage {
            profil: self.profil,
            version_schema: self.version_schema()?,
            chemin: self.chemin.clone(),
            integrite_ok: self.verifier_integrite()?,
            nombre_entrees_journal: self.nombre_entrees_journal()?,
        })
    }

    /// Ajoute une entrée au journal des changements et renvoie son numéro.
    pub fn consigner(&mut self, entree: &NouvelleEntree) -> Resultat<i64> {
        let horodatage = self.horloge.maintenant();
        self.conn.execute(
            "INSERT INTO journal_changements
               (horodatage, section, objet, champ, ancienne_valeur, nouvelle_valeur, motif)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                horodatage,
                entree.section,
                entree.objet,
                entree.champ,
                entree.ancienne_valeur,
                entree.nouvelle_valeur,
                entree.motif
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    /// Les entrées les plus récentes d'abord.
    pub fn lire_journal(&self, limite: u32) -> Resultat<Vec<EntreeJournal>> {
        let mut req = self.conn.prepare(
            "SELECT id, horodatage, section, objet, champ, ancienne_valeur, nouvelle_valeur, motif
             FROM journal_changements ORDER BY id DESC LIMIT ?1",
        )?;
        let lignes = req.query_map([limite], |r| {
            Ok(EntreeJournal {
                id: r.get(0)?,
                horodatage: r.get(1)?,
                section: r.get(2)?,
                objet: r.get(3)?,
                champ: r.get(4)?,
                ancienne_valeur: r.get(5)?,
                nouvelle_valeur: r.get(6)?,
                motif: r.get(7)?,
            })
        })?;
        Ok(lignes.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn nombre_entrees_journal(&self) -> Resultat<u64> {
        let n: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM journal_changements", [], |r| r.get(0))?;
        Ok(n as u64)
    }

    pub fn parametre(&self, cle: &str) -> Resultat<Option<String>> {
        Ok(self
            .conn
            .query_row("SELECT valeur FROM parametres WHERE cle = ?1", [cle], |r| {
                r.get(0)
            })
            .optional()?)
    }

    pub fn definir_parametre(&mut self, cle: &str, valeur: &str) -> Resultat<()> {
        let maintenant = self.horloge.maintenant();
        self.conn.execute(
            "INSERT INTO parametres (cle, valeur, modifie_le) VALUES (?1, ?2, ?3)
             ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur, modifie_le = excluded.modifie_le",
            params![cle, valeur, maintenant],
        )?;
        Ok(())
    }
}

/// Ouvre (ou crée) le fichier, vérifie qu'il appartient à l'installation
/// et le met à niveau. Sert aussi à rouvrir le fichier après une restauration.
fn ouvrir_connexion(
    chemin: &Path,
    profil: Profil,
    horloge: &dyn Horloge,
    migrations: &[Migration],
) -> Resultat<Connection> {
    if let Some(parent) = chemin.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let existait = chemin.exists();
    let mut conn = Connection::open(chemin)?;
    // Écriture sûre : chaque enregistrement est sur le disque avant de
    // rendre la main ; les liens entre tables sont vérifiés.
    conn.pragma_update(None, "journal_mode", "DELETE")?;
    conn.pragma_update(None, "synchronous", "FULL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;

    let attendue = derniere_version(migrations);
    let actuelle = lire_version(&conn)?;

    if actuelle > attendue {
        return Err(ErreurStockage::VersionTropRecente {
            fichier: actuelle,
            application: attendue,
        });
    }

    if existait && actuelle > 0 {
        // Toujours vérifier l'intégrité en premier, pour qu'un fichier
        // abîmé soit signalé comme tel, et jamais modifié.
        let rapport = rapport_integrite(&conn)
            .map_err(|e| ErreurStockage::IntegriteCompromise(e.to_string()))?;
        if rapport != "ok" {
            return Err(ErreurStockage::IntegriteCompromise(rapport));
        }
        verifier_appartenance(&conn, profil)?;
    } else if existait && actuelle == 0 && contient_des_tables(&conn)? {
        return Err(ErreurStockage::FichierInconnu);
    }

    if actuelle < attendue {
        if actuelle > 0 {
            // Fichier existant (déjà vérifié ci-dessus) : copie de
            // précaution vérifiée avant toute mise à niveau.
            copie_de_precaution(&conn, chemin, actuelle, attendue, horloge)?;
        }
        appliquer_migrations(&mut conn, actuelle, migrations)?;
        if actuelle == 0 {
            let maintenant = horloge.maintenant();
            conn.execute(
                "INSERT INTO meta (cle, valeur) VALUES ('application', ?1), ('profil', ?2), ('cree_le', ?3)",
                params![MARQUE_APPLICATION, profil.code(), maintenant],
            )?;
        }
    }

    Ok(conn)
}

fn lire_version(conn: &Connection) -> Resultat<u32> {
    let v: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    Ok(v as u32)
}

fn contient_des_tables(conn: &Connection) -> Resultat<bool> {
    let n: i64 = conn.query_row("SELECT COUNT(*) FROM sqlite_schema", [], |r| r.get(0))?;
    Ok(n > 0)
}

fn rapport_integrite(conn: &Connection) -> Resultat<String> {
    let mut req = conn.prepare("PRAGMA integrity_check")?;
    let lignes: Vec<String> = req
        .query_map([], |r| r.get::<_, String>(0))?
        .collect::<Result<_, _>>()?;
    Ok(lignes.join("; "))
}

fn verifier_appartenance(conn: &Connection, profil: Profil) -> Resultat<()> {
    let lire = |cle: &str| -> Resultat<Option<String>> {
        Ok(conn
            .query_row("SELECT valeur FROM meta WHERE cle = ?1", [cle], |r| {
                r.get(0)
            })
            .optional()?)
    };
    let marque = lire("application").map_err(|_| ErreurStockage::FichierInconnu)?;
    if marque.as_deref() != Some(MARQUE_APPLICATION) {
        return Err(ErreurStockage::FichierInconnu);
    }
    let trouve = lire("profil")?.unwrap_or_default();
    if Profil::depuis_code(&trouve) != Some(profil) {
        return Err(ErreurStockage::ProfilIncompatible {
            attendu: profil,
            trouve,
        });
    }
    Ok(())
}

fn appliquer_migrations(
    conn: &mut Connection,
    depuis: u32,
    migrations: &[Migration],
) -> Resultat<()> {
    let mut a_appliquer: Vec<&Migration> =
        migrations.iter().filter(|m| m.version > depuis).collect();
    a_appliquer.sort_by_key(|m| m.version);
    for m in a_appliquer {
        let tx = conn.transaction()?;
        tx.execute_batch(m.sql)?;
        tx.pragma_update(None, "user_version", m.version)?;
        tx.commit()?;
    }
    Ok(())
}

/// Copie complète et vérifiée du fichier, faite avant toute mise à niveau.
/// Si la copie ne peut pas être vérifiée, la mise à niveau n'a pas lieu.
fn copie_de_precaution(
    conn: &Connection,
    chemin: &Path,
    depuis: u32,
    vers: u32,
    horloge: &dyn Horloge,
) -> Resultat<PathBuf> {
    let dossier = chemin
        .parent()
        .map(|p| p.join(DOSSIER_PRECAUTION))
        .unwrap_or_else(|| PathBuf::from(DOSSIER_PRECAUTION));
    std::fs::create_dir_all(&dossier)?;
    let horodatage: String = horloge
        .maintenant()
        .chars()
        .filter(|c| c.is_ascii_digit())
        .collect();
    let cible = dossier.join(format!(
        "avant-mise-a-niveau-v{depuis}-vers-v{vers}-{horodatage}.sqlite"
    ));
    if cible.exists() {
        std::fs::remove_file(&cible)?;
    }
    let cible_texte = cible.to_string_lossy().to_string();
    conn.execute("VACUUM INTO ?1", [cible_texte])?;

    // Vérification de la copie : lisible, intègre, même version.
    let copie = Connection::open_with_flags(&cible, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| ErreurStockage::CopieDePrecautionInvalide(e.to_string()))?;
    let rapport = rapport_integrite(&copie)
        .map_err(|e| ErreurStockage::CopieDePrecautionInvalide(e.to_string()))?;
    if rapport != "ok" {
        return Err(ErreurStockage::CopieDePrecautionInvalide(rapport));
    }
    let version = lire_version(&copie)
        .map_err(|e| ErreurStockage::CopieDePrecautionInvalide(e.to_string()))?;
    if version != depuis {
        return Err(ErreurStockage::CopieDePrecautionInvalide(format!(
            "version {version} au lieu de {depuis}"
        )));
    }
    sauvegardes::elaguer_precautions(&dossier);
    Ok(cible)
}

#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_ajustements;
#[cfg(test)]
mod tests_cartes;
#[cfg(test)]
mod tests_confirmations;
#[cfg(test)]
mod tests_elements;
#[cfg(test)]
mod tests_export;
#[cfg(test)]
mod tests_paie;
#[cfg(test)]
mod tests_prets;
#[cfg(test)]
mod tests_sauvegardes;
