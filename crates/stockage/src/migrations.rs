//! Versions successives de la structure des données (le « schéma »).
//!
//! Règles :
//! - une migration publiée n'est jamais modifiée : on en ajoute une nouvelle ;
//! - la version courante est gardée dans `PRAGMA user_version` ;
//! - chaque migration s'applique en entier ou pas du tout (transaction).

pub struct Migration {
    pub version: u32,
    pub description: &'static str,
    pub sql: &'static str,
}

/// Version 1 : fondations. Les tables financières arrivent avec leur étape
/// (paies à l'étape 3, dettes à l'étape 7, etc.), pas avant.
const V1: &str = r#"
CREATE TABLE meta (
    cle    TEXT PRIMARY KEY,
    valeur TEXT NOT NULL
) STRICT;

CREATE TABLE parametres (
    cle        TEXT PRIMARY KEY,
    valeur     TEXT NOT NULL,
    modifie_le TEXT NOT NULL
) STRICT;

-- Journal des changements significatifs (A10). Distinct de l'historique
-- financier ; aucune saisie demandée à l'utilisatrice.
CREATE TABLE journal_changements (
    id              INTEGER PRIMARY KEY,
    horodatage      TEXT NOT NULL,
    section         TEXT NOT NULL,
    objet           TEXT NOT NULL,
    champ           TEXT NOT NULL,
    ancienne_valeur TEXT,
    nouvelle_valeur TEXT,
    motif           TEXT
) STRICT;

-- Le passé ne se réécrit pas : le journal refuse toute modification
-- et toute suppression.
CREATE TRIGGER journal_sans_modification
BEFORE UPDATE ON journal_changements
BEGIN
    SELECT RAISE(ABORT, 'Le journal des changements ne peut pas être modifié.');
END;

CREATE TRIGGER journal_sans_suppression
BEFORE DELETE ON journal_changements
BEGIN
    SELECT RAISE(ABORT, 'Le journal des changements ne peut pas être effacé.');
END;
"#;

pub const MIGRATIONS: &[Migration] = &[Migration {
    version: 1,
    description: "Fondations : métadonnées, paramètres, journal des changements",
    sql: V1,
}];

/// Dernière version connue de cette version de l'application.
pub fn derniere_version(liste: &[Migration]) -> u32 {
    liste.iter().map(|m| m.version).max().unwrap_or(0)
}
