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

/// Version 2 (étape 3) : profil de paie, changements de salaire datés,
/// exceptions de paie. Les montants sont des cents entiers.
const V2: &str = r#"
CREATE TABLE profil_paie (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    frequence  TEXT NOT NULL CHECK (frequence IN ('hebdomadaire', 'deuxSemaines', 'deuxFoisParMois', 'mensuelle')),
    depart     TEXT NOT NULL CHECK (depart GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    jour1      INTEGER CHECK (jour1 BETWEEN 1 AND 27),
    jour2      INTEGER CHECK (jour2 BETWEEN 2 AND 31),
    CHECK ((frequence = 'deuxFoisParMois') = (jour1 IS NOT NULL AND jour2 IS NOT NULL AND jour2 > jour1))
) STRICT;

CREATE TABLE salaires (
    a_partir_du TEXT PRIMARY KEY CHECK (a_partir_du GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    montant     INTEGER NOT NULL CHECK (montant >= 0)
) STRICT;

CREATE TABLE exceptions_paie (
    date_origine TEXT PRIMARY KEY CHECK (date_origine GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    date_reelle  TEXT CHECK (date_reelle GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    montant      INTEGER CHECK (montant >= 0),
    CHECK (date_reelle IS NOT NULL OR montant IS NOT NULL)
) STRICT;
"#;

pub const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        description: "Fondations : métadonnées, paramètres, journal des changements",
        sql: V1,
    },
    Migration {
        version: 2,
        description: "Paie : profil, changements de salaire, exceptions",
        sql: V2,
    },
];

/// Dernière version connue de cette version de l'application.
pub fn derniere_version(liste: &[Migration]) -> u32 {
    liste.iter().map(|m| m.version).max().unwrap_or(0)
}
