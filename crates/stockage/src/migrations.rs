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

const V3: &str = r#"
CREATE TABLE elements (
    id          TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64),
    libelle     TEXT NOT NULL CHECK (length(trim(libelle)) > 0),
    nature      TEXT NOT NULL CHECK (nature IN ('revenu', 'depense')),
    genre       TEXT NOT NULL CHECK (genre IN ('fixe', 'enveloppe')),
    incertain   INTEGER NOT NULL CHECK (incertain IN (0, 1)),
    estimation  INTEGER NOT NULL CHECK (estimation IN (0, 1)),
    frequence   TEXT NOT NULL CHECK (json_valid(frequence) AND json_type(frequence) = 'object'),
    fin         TEXT CHECK (fin GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    cycle_paie  TEXT CHECK (cycle_paie GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    CHECK (nature = 'depense' OR (genre = 'fixe')),
    CHECK (nature = 'revenu' OR incertain = 0)
) STRICT;

CREATE TABLE montants_element (
    element_id  TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
    a_partir_du TEXT NOT NULL CHECK (a_partir_du GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    montant     INTEGER NOT NULL CHECK (montant >= 0),
    PRIMARY KEY (element_id, a_partir_du)
) STRICT;

CREATE TABLE suspensions_element (
    element_id  TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
    debut       TEXT NOT NULL CHECK (debut GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    fin         TEXT NOT NULL CHECK (fin GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    CHECK (fin >= debut)
) STRICT;
"#;

// Étape 4b : ajouts seulement, aucune donnée existante n'est transformée.
// La fréquence d'origine reste dans « elements » ; les changements datés
// s'ajoutent à côté.
const V4: &str = r#"
CREATE TABLE ajustements_element (
    element_id   TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
    origine      TEXT NOT NULL CHECK (origine GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    montant      INTEGER CHECK (montant >= 0),
    date         TEXT CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    paie_origine TEXT CHECK (paie_origine GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    retire       INTEGER NOT NULL CHECK (retire IN (0, 1)),
    PRIMARY KEY (element_id, origine),
    CHECK (montant IS NOT NULL OR date IS NOT NULL OR paie_origine IS NOT NULL OR retire = 1)
) STRICT;

CREATE TABLE periodes_frequence (
    element_id  TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
    a_partir_du TEXT NOT NULL CHECK (a_partir_du GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    frequence   TEXT NOT NULL CHECK (json_valid(frequence) AND json_type(frequence) = 'object'),
    PRIMARY KEY (element_id, a_partir_du)
) STRICT;
"#;

// Étape 5 : ajout seulement. Une confirmation est un fait (date, montant)
// accroché à une occurrence ; element_id vide (NULL) : la paie elle-même.
// Un élément qui a des confirmations ne peut pas être supprimé (RESTRICT).
const V5: &str = r#"
CREATE TABLE confirmations (
    element_id TEXT REFERENCES elements(id) ON DELETE RESTRICT,
    origine    TEXT NOT NULL CHECK (origine GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    date       TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    montant    INTEGER NOT NULL CHECK (montant >= 0),
    cree_le    TEXT NOT NULL
) STRICT;

CREATE UNIQUE INDEX confirmations_occurrence ON confirmations (ifnull(element_id, ''), origine);
"#;

// Étape 7a : ajout seulement. Un prêt est la fiche d'un élément de dépense
// fixe (son versement), qui garde ses cycles, confirmations et ajustements.
// Tout est facultatif sauf le versement : on commence avec ce qu'on sait.
// Les soldes sont des références datées (solde de départ, puis mises à jour
// d'après un relevé) ; aucune n'en réécrit une autre.
const V6: &str = r#"
CREATE TABLE prets (
    id              TEXT PRIMARY KEY REFERENCES elements(id) ON DELETE RESTRICT,
    minimum         INTEGER CHECK (minimum >= 0),
    echeance_finale TEXT CHECK (echeance_finale GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    taux            TEXT CHECK (taux GLOB '[0-9]*' AND taux NOT GLOB '*[^0-9.]*'),
    rembourse_le    TEXT CHECK (rembourse_le GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
) STRICT;

CREATE TABLE soldes_pret (
    pret_id TEXT NOT NULL REFERENCES prets(id) ON DELETE CASCADE,
    date    TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    montant INTEGER NOT NULL CHECK (montant >= 0),
    note    TEXT,
    PRIMARY KEY (pret_id, date)
) STRICT;
"#;

// Étape 8 : ajout seulement. La carte est la fiche d'un élément de dépense
// fixe (son échéance mensuelle, montant souvent « À compléter ») ; les
// paiements supplémentaires sont des dépenses « une seule fois » rattachées à
// la carte. Les relevés sont recopiés tels quels et jamais modifiés ; le solde
// actuel vient seulement de mises à jour datées. Aucun achat n'est suivi.
const V7: &str = r#"
CREATE TABLE cartes (
    id       TEXT PRIMARY KEY REFERENCES elements(id) ON DELETE RESTRICT,
    limite   INTEGER CHECK (limite >= 0),
    taux     TEXT CHECK (taux GLOB '[0-9]*' AND taux NOT GLOB '*[^0-9.]*'),
    objectif TEXT CHECK (objectif IN ('reduireSolde', 'payerReleves'))
) STRICT;

CREATE TABLE releves_carte (
    carte_id TEXT NOT NULL REFERENCES cartes(id) ON DELETE CASCADE,
    date     TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    solde    INTEGER NOT NULL CHECK (solde >= 0),
    minimum  INTEGER CHECK (minimum >= 0),
    echeance TEXT CHECK (echeance GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    PRIMARY KEY (carte_id, date)
) STRICT;

CREATE TABLE soldes_carte (
    carte_id TEXT NOT NULL REFERENCES cartes(id) ON DELETE CASCADE,
    date     TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    montant  INTEGER NOT NULL CHECK (montant >= 0),
    note     TEXT,
    PRIMARY KEY (carte_id, date)
) STRICT;

CREATE TABLE frais_carte (
    carte_id  TEXT NOT NULL REFERENCES cartes(id) ON DELETE CASCADE,
    libelle   TEXT NOT NULL CHECK (length(trim(libelle)) > 0),
    montant   INTEGER NOT NULL CHECK (montant >= 0),
    frequence TEXT NOT NULL CHECK (frequence IN ('annee', 'mois')),
    PRIMARY KEY (carte_id, libelle)
) STRICT;

CREATE TABLE paiements_carte (
    element_id TEXT PRIMARY KEY REFERENCES elements(id) ON DELETE RESTRICT,
    carte_id   TEXT NOT NULL REFERENCES cartes(id) ON DELETE CASCADE
) STRICT;
"#;

/// Version 8 : comptes d'épargne (étape 9). Une contribution est un élément
/// de dépense fixe rattaché au compte ; la valeur suivie se recalcule à partir
/// des références datées, des contributions confirmées et des mouvements.
const V8: &str = r#"
CREATE TABLE comptes_epargne (
    id          TEXT PRIMARY KEY,
    sorte       TEXT NOT NULL CHECK (sorte IN ('celi', 'reer', 'celiapp', 'epargne', 'autre')),
    type_libre  TEXT CHECK (type_libre IS NULL OR length(trim(type_libre)) > 0),
    nom         TEXT,
    vocation    TEXT,
    institution TEXT,
    ferme_le    TEXT CHECK (ferme_le GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    CHECK ((sorte = 'autre') = (type_libre IS NOT NULL))
) STRICT;

CREATE TABLE references_compte (
    compte_id TEXT NOT NULL REFERENCES comptes_epargne(id) ON DELETE CASCADE,
    date      TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    montant   INTEGER NOT NULL CHECK (montant >= 0),
    note      TEXT,
    PRIMARY KEY (compte_id, date)
) STRICT;

CREATE TABLE mouvements_compte (
    id          TEXT PRIMARY KEY,
    compte_id   TEXT NOT NULL REFERENCES comptes_epargne(id) ON DELETE CASCADE,
    date        TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    sorte       TEXT NOT NULL CHECK (sorte IN ('fluctuation', 'retrait', 'transfert')),
    montant     INTEGER NOT NULL CHECK (montant <> 0 AND (sorte = 'fluctuation' OR montant > 0)),
    vers        TEXT REFERENCES comptes_epargne(id) ON DELETE RESTRICT,
    destination TEXT,
    note        TEXT,
    CHECK ((sorte = 'transfert') = (vers IS NOT NULL)),
    CHECK (vers IS NULL OR vers <> compte_id)
) STRICT;

CREATE TABLE contributions_compte (
    element_id TEXT PRIMARY KEY REFERENCES elements(id) ON DELETE RESTRICT,
    compte_id  TEXT NOT NULL REFERENCES comptes_epargne(id) ON DELETE CASCADE
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
    Migration {
        version: 3,
        description: "Autres revenus, dépenses fixes, enveloppes et dépenses ponctuelles",
        sql: V3,
    },
    Migration {
        version: 4,
        description: "Ajustements d'occurrence et changements de fréquence datés",
        sql: V4,
    },
    Migration {
        version: 5,
        description: "Confirmations : faits confirmés, distincts du plan",
        sql: V5,
    },
    Migration {
        version: 6,
        description: "Prêts : fiche du versement et soldes de référence datés",
        sql: V6,
    },
    Migration {
        version: 7,
        description:
            "Carte Visa : fiche, relevés, soldes actuels, frais, paiements supplémentaires",
        sql: V7,
    },
    Migration {
        version: 8,
        description: "Épargne : comptes, références, mouvements, contributions",
        sql: V8,
    },
];

/// Dernière version connue de cette version de l'application.
pub fn derniere_version(liste: &[Migration]) -> u32 {
    liste.iter().map(|m| m.version).max().unwrap_or(0)
}
