//! Étape 6 : export portable. Un dossier compressé (.zip) contient :
//! - `donnees.json` : toutes les tables, tous les champs, montants en cents ;
//! - un CSV par type de donnée, lisible dans LibreOffice Calc ou Excel en
//!   français (UTF-8, point-virgule, virgule décimale, dates AAAA-MM-JJ) ;
//! - `LISEZMOI.txt` : ce que veut dire chaque colonne.
//!
//! Ce n'est pas un rapport : c'est la porte de sortie si Liberté 35 devait
//! un jour être remplacée. L'export ne se réimporte pas (décision Q32).

use std::collections::BTreeMap;
use std::io::Write;
use std::path::Path;

use rusqlite::types::ValueRef;
use serde::Serialize;
use serde_json::{json, Map, Value};

use super::{
    sauvegardes::{resume_de, ResumeCopie},
    ErreurStockage, Profil, Resultat, Stockage,
};

const VERSION_FORMAT: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumeExport {
    pub nom_fichier: String,
    pub fichiers: Vec<String>,
    pub resume: ResumeCopie,
    /// Aucune donnée pour l'instant.
    pub vide: bool,
}

#[derive(Clone, Copy)]
enum Genre {
    Texte,
    Date,
    Montant,
    Entier,
    OuiNon,
    Horodatage,
}

struct Colonne {
    entete: &'static str,
    sql: &'static str,
    genre: Genre,
    description: &'static str,
}

struct FichierCsv {
    nom: &'static str,
    #[cfg_attr(not(test), allow(dead_code))]
    table: &'static str,
    description: &'static str,
    depuis: &'static str,
    colonnes: &'static [Colonne],
}

const fn col(
    entete: &'static str,
    sql: &'static str,
    genre: Genre,
    description: &'static str,
) -> Colonne {
    Colonne {
        entete,
        sql,
        genre,
        description,
    }
}

const ID: Colonne = col(
    "Identifiant",
    "x.element_id",
    Genre::Texte,
    "identifiant de l'élément (voir elements.csv)",
);
const LIBELLE: Colonne = col("Libellé", "e.libelle", Genre::Texte, "nom de l'élément");

const FICHIERS: &[FichierCsv] = &[
    FichierCsv {
        nom: "profil-paie.csv",
        table: "profil_paie",
        description: "Comment et quand tu es payée.",
        depuis: "FROM profil_paie x",
        colonnes: &[
            col("Fréquence", "x.frequence", Genre::Texte, "hebdomadaire, deuxSemaines, deuxFoisParMois ou mensuelle"),
            col("Première paie", "x.depart", Genre::Date, "date de la première paie"),
            col("Jour 1", "x.jour1", Genre::Entier, "deux fois par mois : premier jour du mois"),
            col("Jour 2", "x.jour2", Genre::Entier, "deux fois par mois : second jour du mois"),
        ],
    },
    FichierCsv {
        nom: "salaires.csv",
        table: "salaires",
        description: "Salaire net, avec la date à partir de laquelle il s'applique.",
        depuis: "FROM salaires x ORDER BY x.a_partir_du",
        colonnes: &[
            col("À partir du", "x.a_partir_du", Genre::Date, "date d'effet"),
            col("Montant ($)", "x.montant", Genre::Montant, "salaire net par paie"),
        ],
    },
    FichierCsv {
        nom: "paies-modifiees.csv",
        table: "exceptions_paie",
        description: "Paies déplacées ou au montant différent, une seule fois.",
        depuis: "FROM exceptions_paie x ORDER BY x.date_origine",
        colonnes: &[
            col("Date prévue", "x.date_origine", Genre::Date, "date prévue par le calendrier de paie"),
            col("Date réelle", "x.date_reelle", Genre::Date, "date réelle, si elle a changé"),
            col("Montant ($)", "x.montant", Genre::Montant, "montant de cette paie, s'il a changé"),
        ],
    },
    FichierCsv {
        nom: "elements.csv",
        table: "elements",
        description: "Autres revenus, dépenses fixes et enveloppes variables.",
        depuis: "FROM elements x ORDER BY x.nature DESC, x.libelle",
        colonnes: &[
            col("Identifiant", "x.id", Genre::Texte, "identifiant stable, repris dans les autres fichiers"),
            col("Libellé", "x.libelle", Genre::Texte, "nom de l'élément"),
            col("Nature", "CASE x.nature WHEN 'depense' THEN 'dépense' ELSE x.nature END", Genre::Texte, "revenu ou dépense"),
            col("Genre", "x.genre", Genre::Texte, "fixe ou enveloppe"),
            col("Incertain", "x.incertain", Genre::OuiNon, "revenu incertain : compté seulement une fois confirmé"),
            col("Estimation", "x.estimation", Genre::OuiNon, "montant estimé"),
            col("Fréquence (JSON)", "x.frequence", Genre::Texte, "règle de fréquence d'origine, au format JSON"),
            col("Fin", "x.fin", Genre::Date, "dernier jour, si l'élément est terminé"),
            col("Cycle de la paie du", "x.cycle_paie", Genre::Date, "dépense ponctuelle : paie du cycle choisi"),
        ],
    },
    FichierCsv {
        nom: "montants.csv",
        table: "montants_element",
        description: "Montants des éléments, avec leur date d'effet.",
        depuis: "FROM montants_element x LEFT JOIN elements e ON e.id = x.element_id ORDER BY e.libelle, x.a_partir_du",
        colonnes: &[
            ID,
            LIBELLE,
            col("À partir du", "x.a_partir_du", Genre::Date, "date d'effet"),
            col("Montant ($)", "x.montant", Genre::Montant, "montant de chaque occurrence"),
        ],
    },
    FichierCsv {
        nom: "suspensions.csv",
        table: "suspensions_element",
        description: "Périodes pendant lesquelles un élément est suspendu.",
        depuis: "FROM suspensions_element x LEFT JOIN elements e ON e.id = x.element_id ORDER BY e.libelle, x.debut",
        colonnes: &[
            ID,
            LIBELLE,
            col("Début", "x.debut", Genre::Date, "premier jour de la suspension"),
            col("Fin", "x.fin", Genre::Date, "dernier jour de la suspension"),
        ],
    },
    FichierCsv {
        nom: "ajustements.csv",
        table: "ajustements_element",
        description: "Ajustements d'une seule occurrence (la règle ne change pas).",
        depuis: "FROM ajustements_element x LEFT JOIN elements e ON e.id = x.element_id ORDER BY e.libelle, x.origine",
        colonnes: &[
            ID,
            LIBELLE,
            col("Occurrence du", "x.origine", Genre::Date, "date d'origine de l'occurrence ajustée"),
            col("Montant ($)", "x.montant", Genre::Montant, "montant pour cette fois"),
            col("Déplacée au", "x.date", Genre::Date, "nouvelle date pour cette fois"),
            col("Rattachée à la paie du", "x.paie_origine", Genre::Date, "cycle de paie choisi pour cette fois"),
            col("Retirée", "x.retire", Genre::OuiNon, "n'a pas lieu cette fois"),
        ],
    },
    FichierCsv {
        nom: "changements-frequence.csv",
        table: "periodes_frequence",
        description: "Changements de fréquence datés.",
        depuis: "FROM periodes_frequence x LEFT JOIN elements e ON e.id = x.element_id ORDER BY e.libelle, x.a_partir_du",
        colonnes: &[
            ID,
            LIBELLE,
            col("À partir du", "x.a_partir_du", Genre::Date, "date d'effet"),
            col("Fréquence (JSON)", "x.frequence", Genre::Texte, "nouvelle règle, au format JSON"),
        ],
    },
    FichierCsv {
        nom: "confirmations.csv",
        table: "confirmations",
        description: "Opérations confirmées. Identifiant vide et libellé « Paie » : la paie elle-même.",
        depuis: "FROM confirmations x LEFT JOIN elements e ON e.id = x.element_id ORDER BY x.origine, e.libelle",
        colonnes: &[
            col("Identifiant", "ifnull(x.element_id, '')", Genre::Texte, "identifiant de l'élément ; vide pour la paie"),
            col("Libellé", "CASE WHEN x.element_id IS NULL THEN 'Paie' ELSE e.libelle END", Genre::Texte, "nom de l'élément, ou « Paie »"),
            col("Occurrence du", "x.origine", Genre::Date, "date d'origine de l'occurrence confirmée"),
            col("Date confirmée", "x.date", Genre::Date, "date indiquée à la confirmation"),
            col("Montant ($)", "x.montant", Genre::Montant, "montant reçu ou payé"),
            col("Confirmée le (UTC)", "x.cree_le", Genre::Horodatage, "moment de la confirmation"),
        ],
    },
    FichierCsv {
        nom: "prets.csv",
        table: "prets",
        description: "Prêts : la fiche de chaque prêt. Son versement est dans elements.csv et montants.csv (même identifiant).",
        depuis: "FROM prets x LEFT JOIN elements e ON e.id = x.id ORDER BY e.libelle",
        colonnes: &[
            col("Identifiant", "x.id", Genre::Texte, "identifiant du prêt et de son versement"),
            LIBELLE,
            col("Minimum ($)", "x.minimum", Genre::Montant, "minimum obligatoire ; vide : le versement sert de minimum"),
            col("Échéance finale", "x.echeance_finale", Genre::Date, "dernier versement prévu, s'il est connu"),
            col("Taux (%)", "replace(x.taux, '.', ',')", Genre::Texte, "taux annuel indiqué"),
            col("Remboursé le", "x.rembourse_le", Genre::Date, "date où le prêt a été marqué remboursé"),
        ],
    },
    FichierCsv {
        nom: "soldes-prets.csv",
        table: "soldes_pret",
        description: "Soldes de référence des prêts : solde de départ, puis mises à jour d'après un relevé.",
        depuis: "FROM soldes_pret x LEFT JOIN elements e ON e.id = x.pret_id ORDER BY e.libelle, x.date",
        colonnes: &[
            col("Identifiant", "x.pret_id", Genre::Texte, "identifiant du prêt"),
            LIBELLE,
            col("Date", "x.date", Genre::Date, "date du solde"),
            col("Solde ($)", "x.montant", Genre::Montant, "solde du prêt à cette date"),
            col("Note", "x.note", Genre::Texte, "précision, par exemple « relevé de mars »"),
        ],
    },
    FichierCsv {
        nom: "carte.csv",
        table: "cartes",
        description: "Carte de crédit : sa fiche. Ses échéances sont dans elements.csv et montants.csv (même identifiant).",
        depuis: "FROM cartes x LEFT JOIN elements e ON e.id = x.id",
        colonnes: &[
            col("Identifiant", "x.id", Genre::Texte, "identifiant de la carte et de son échéance mensuelle"),
            LIBELLE,
            col("Limite ($)", "x.limite", Genre::Montant, "limite de crédit"),
            col("Taux (%)", "replace(x.taux, '.', ',')", Genre::Texte, "taux annuel indiqué (information seulement)"),
            col("Objectif", "CASE x.objectif WHEN 'reduireSolde' THEN 'Réduire mon solde actuel' WHEN 'payerReleves' THEN 'Payer mes relevés en entier' ELSE '' END", Genre::Texte, "objectif informatif choisi"),
        ],
    },
    FichierCsv {
        nom: "releves-carte.csv",
        table: "releves_carte",
        description: "Relevés de la carte, recopiés tels quels.",
        depuis: "FROM releves_carte x ORDER BY x.date",
        colonnes: &[
            col("Date du relevé", "x.date", Genre::Date, "date du relevé"),
            col("Nouveau solde ($)", "x.solde", Genre::Montant, "nouveau solde indiqué sur le relevé"),
            col("Minimum ($)", "x.minimum", Genre::Montant, "paiement minimum indiqué"),
            col("Échéance", "x.echeance", Genre::Date, "date d'échéance indiquée"),
        ],
    },
    FichierCsv {
        nom: "soldes-carte.csv",
        table: "soldes_carte",
        description: "Solde actuel de la carte, d'après tes mises à jour datées.",
        depuis: "FROM soldes_carte x ORDER BY x.date",
        colonnes: &[
            col("Date", "x.date", Genre::Date, "date de la mise à jour"),
            col("Solde actuel ($)", "x.montant", Genre::Montant, "solde indiqué"),
            col("Note", "x.note", Genre::Texte, "source, par exemple « app de la banque »"),
        ],
    },
    FichierCsv {
        nom: "frais-carte.csv",
        table: "frais_carte",
        description: "Frais récurrents autorisés de la carte (information seulement).",
        depuis: "FROM frais_carte x ORDER BY x.libelle",
        colonnes: &[
            col("Libellé", "x.libelle", Genre::Texte, "nom du frais"),
            col("Montant ($)", "x.montant", Genre::Montant, "montant"),
            col("Fréquence", "CASE x.frequence WHEN 'annee' THEN 'par année' ELSE 'par mois' END", Genre::Texte, "par année ou par mois"),
        ],
    },
    FichierCsv {
        nom: "paiements-supplementaires-carte.csv",
        table: "paiements_carte",
        description: "Paiements supplémentaires de la carte. Leur date et leur montant sont dans elements.csv et montants.csv.",
        depuis: "FROM paiements_carte x LEFT JOIN elements e ON e.id = x.element_id ORDER BY x.element_id",
        colonnes: &[
            col("Identifiant", "x.element_id", Genre::Texte, "identifiant du paiement supplémentaire"),
            col("Libellé", "e.libelle", Genre::Texte, "nom du paiement"),
            col("Carte", "x.carte_id", Genre::Texte, "identifiant de la carte"),
        ],
    },
    FichierCsv {
        nom: "comptes-epargne.csv",
        table: "comptes_epargne",
        description: "Comptes d'épargne : leur fiche. La valeur suivie se recalcule à partir des références, des contributions confirmées et des mouvements.",
        depuis: "FROM comptes_epargne x ORDER BY x.rowid",
        colonnes: &[
            col("Identifiant", "x.id", Genre::Texte, "identifiant du compte"),
            col("Type", "CASE x.sorte WHEN 'celi' THEN 'CELI' WHEN 'reer' THEN 'REER' WHEN 'celiapp' THEN 'CELIAPP' WHEN 'epargne' THEN 'Compte épargne' ELSE x.type_libre END", Genre::Texte, "type du compte"),
            col("Nom", "x.nom", Genre::Texte, "nom choisi (facultatif)"),
            col("Vocation", "x.vocation", Genre::Texte, "vocation (facultative)"),
            col("Institution", "x.institution", Genre::Texte, "institution (facultative)"),
            col("Fermé le", "x.ferme_le", Genre::Date, "date de fermeture ; vide si le compte est ouvert"),
        ],
    },
    FichierCsv {
        nom: "references-compte.csv",
        table: "references_compte",
        description: "Soldes de référence datés des comptes d'épargne (départ et corrections).",
        depuis: "FROM references_compte x ORDER BY x.compte_id, x.date",
        colonnes: &[
            col("Compte", "x.compte_id", Genre::Texte, "identifiant du compte"),
            col("Date", "x.date", Genre::Date, "date du solde de référence"),
            col("Solde ($)", "x.montant", Genre::Montant, "solde à cette date"),
            col("Note", "x.note", Genre::Texte, "précision, par exemple « relevé annuel »"),
        ],
    },
    FichierCsv {
        nom: "mouvements-compte.csv",
        table: "mouvements_compte",
        description: "Fluctuations, retraits et transferts des comptes d'épargne. Jamais dans Mes paies.",
        depuis: "FROM mouvements_compte x ORDER BY x.date, x.rowid",
        colonnes: &[
            col("Identifiant", "x.id", Genre::Texte, "identifiant du mouvement"),
            col("Compte", "x.compte_id", Genre::Texte, "identifiant du compte (source d'un transfert)"),
            col("Date", "x.date", Genre::Date, "date du mouvement"),
            col("Sorte", "CASE x.sorte WHEN 'fluctuation' THEN 'Fluctuation' WHEN 'retrait' THEN 'Retrait' ELSE 'Transfert' END", Genre::Texte, "fluctuation, retrait ou transfert"),
            col("Montant ($)", "x.montant", Genre::Montant, "montant ; une fluctuation peut être négative"),
            col("Vers le compte", "x.vers", Genre::Texte, "destination d'un transfert"),
            col("Destination", "x.destination", Genre::Texte, "destination d'un retrait (facultative)"),
            col("Note", "x.note", Genre::Texte, "note (facultative)"),
        ],
    },
    FichierCsv {
        nom: "contributions-compte.csv",
        table: "contributions_compte",
        description: "Contributions des comptes d'épargne. Leurs dates et montants sont dans elements.csv et montants.csv.",
        depuis: "FROM contributions_compte x LEFT JOIN elements e ON e.id = x.element_id ORDER BY x.compte_id, x.rowid",
        colonnes: &[
            col("Identifiant", "x.element_id", Genre::Texte, "identifiant de la contribution"),
            col("Libellé", "e.libelle", Genre::Texte, "nom de la contribution"),
            col("Compte", "x.compte_id", Genre::Texte, "identifiant du compte"),
        ],
    },
    FichierCsv {
        nom: "journal.csv",
        table: "journal_changements",
        description: "Journal des changements, du plus ancien au plus récent.",
        depuis: "FROM journal_changements x ORDER BY x.id",
        colonnes: &[
            col("Numéro", "x.id", Genre::Entier, "ordre des changements"),
            col("Horodatage (UTC)", "x.horodatage", Genre::Horodatage, "moment du changement, heure universelle"),
            col("Section", "x.section", Genre::Texte, "section de l'application"),
            col("Objet", "x.objet", Genre::Texte, "ce qui a changé"),
            col("Champ", "x.champ", Genre::Texte, "quel aspect"),
            col("Ancienne valeur", "x.ancienne_valeur", Genre::Texte, "avant"),
            col("Nouvelle valeur", "x.nouvelle_valeur", Genre::Texte, "après"),
            col("Motif", "x.motif", Genre::Texte, "précision éventuelle"),
        ],
    },
];

/// Tables couvertes par un CSV (garde-fou testé : toute nouvelle table
/// doit recevoir le sien).
#[cfg(test)]
pub(crate) fn tables_couvertes_par_les_csv() -> Vec<&'static str> {
    FICHIERS.iter().map(|f| f.table).collect()
}

/// Cents en dollars, virgule décimale, sans espace des milliers : Calc le
/// reconnaît comme un nombre.
pub(crate) fn montant_csv(cents: i64) -> String {
    let signe = if cents < 0 { "-" } else { "" };
    let a = cents.unsigned_abs();
    format!("{signe}{},{:02}", a / 100, a % 100)
}

fn champ_csv(t: &str) -> String {
    if t.contains([';', '"', '\n', '\r']) {
        format!("\"{}\"", t.replace('"', "\"\""))
    } else {
        t.to_string()
    }
}

fn valeur_csv(v: ValueRef<'_>, genre: Genre) -> String {
    match (v, genre) {
        (ValueRef::Null, _) => String::new(),
        (ValueRef::Integer(n), Genre::Montant) => montant_csv(n),
        (ValueRef::Integer(n), Genre::OuiNon) => (if n != 0 { "oui" } else { "non" }).into(),
        (ValueRef::Integer(n), _) => n.to_string(),
        (ValueRef::Real(x), _) => x.to_string().replace('.', ","),
        (ValueRef::Text(t), Genre::Horodatage) => {
            let t = String::from_utf8_lossy(t);
            champ_csv(t.replace('T', " ").trim_end_matches('Z'))
        }
        (ValueRef::Text(t), _) => champ_csv(&String::from_utf8_lossy(t)),
        (ValueRef::Blob(_), _) => String::new(),
    }
}

fn valeur_json(v: ValueRef<'_>) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(n) => json!(n),
        ValueRef::Real(x) => json!(x),
        ValueRef::Text(t) => json!(String::from_utf8_lossy(t)),
        ValueRef::Blob(b) => json!(b.iter().map(|o| format!("{o:02x}")).collect::<String>()),
    }
}

impl Stockage {
    /// Toutes les tables, toutes les lignes, tous les champs, dans un ordre
    /// stable (indépendant des numéros internes de SQLite).
    pub fn contenu_des_tables(&self) -> Resultat<BTreeMap<String, Vec<Map<String, Value>>>> {
        let tables: Vec<String> = self
            .conn
            .prepare(
                "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
            )?
            .query_map([], |r| r.get(0))?
            .collect::<Result<_, _>>()?;
        let mut tout = BTreeMap::new();
        for t in tables {
            let req = self.conn.prepare(&format!("SELECT * FROM \"{t}\""))?;
            let noms: Vec<String> = req.column_names().map(|c| c.to_string()).collect();
            let ordre = (1..=noms.len())
                .map(|i| i.to_string())
                .collect::<Vec<_>>()
                .join(", ");
            drop(req);
            let mut req = self
                .conn
                .prepare(&format!("SELECT * FROM \"{t}\" ORDER BY {ordre}"))?;
            let mut lignes = Vec::new();
            let mut curseur = req.query([])?;
            while let Some(r) = curseur.next()? {
                let mut m = Map::new();
                for (i, n) in noms.iter().enumerate() {
                    m.insert(n.clone(), valeur_json(r.get_ref(i)?));
                }
                lignes.push(m);
            }
            tout.insert(t, lignes);
        }
        Ok(tout)
    }

    /// Nom proposé pour l'export, avec « essai » pour l'installation d'essai.
    pub fn nom_export_propose(&self) -> String {
        let jour = self.horloge.jour_local();
        match self.profil {
            Profil::Essai => format!("liberte-35-essai-export-{jour}.zip"),
            Profil::Officiel => format!("liberte-35-export-{jour}.zip"),
        }
    }

    fn csv(&self, f: &FichierCsv) -> Resultat<String> {
        let mut texte = String::from("\u{feff}");
        let entetes: Vec<&str> = f.colonnes.iter().map(|c| c.entete).collect();
        texte.push_str(&entetes.join(";"));
        texte.push_str("\r\n");
        let selection: Vec<&str> = f.colonnes.iter().map(|c| c.sql).collect();
        let sql = format!("SELECT {} {}", selection.join(", "), f.depuis);
        let mut req = self.conn.prepare(&sql)?;
        let mut curseur = req.query([])?;
        while let Some(r) = curseur.next()? {
            let mut champs = Vec::with_capacity(f.colonnes.len());
            for (i, c) in f.colonnes.iter().enumerate() {
                champs.push(valeur_csv(r.get_ref(i)?, c.genre));
            }
            texte.push_str(&champs.join(";"));
            texte.push_str("\r\n");
        }
        Ok(texte)
    }

    fn lisezmoi(&self, version_application: &str, exporte_le: &str, vide: bool) -> String {
        let mut t = String::new();
        t.push_str("LIBERTÉ 35 — EXPORT DE TES DONNÉES\r\n");
        t.push_str("===================================\r\n\r\n");
        t.push_str(&format!(
            "Exporté le {} (heure universelle) par Liberté 35 {version_application}.\r\n",
            exporte_le.replace('T', " ").trim_end_matches('Z')
        ));
        if self.profil == Profil::Essai {
            t.push_str("Installation d'essai : données fictives seulement.\r\n");
        }
        if vide {
            t.push_str("Aucune donnée pour l'instant : les fichiers ne contiennent que leurs en-têtes.\r\n");
        }
        t.push_str(
            "\r\nCet export est ta porte de sortie : tout y est, dans des formats ouverts.\r\n",
        );
        t.push_str("Les fichiers CSV s'ouvrent dans LibreOffice Calc ou dans Excel.\r\n");
        t.push_str("Il n'est pas chiffré : garde-le en lieu sûr. Il ne se réimporte pas ;\r\n");
        t.push_str("pour revenir en arrière, Liberté 35 utilise ses copies de sauvegarde.\r\n\r\n");

        t.push_str("OUVRIR UN CSV DANS LIBREOFFICE CALC\r\n");
        t.push_str("-----------------------------------\r\n");
        t.push_str(
            "Fichier > Ouvrir, puis choisir le fichier .csv. Dans la fenêtre d'import :\r\n",
        );
        t.push_str("  - Jeu de caractères : Unicode (UTF-8)\r\n");
        t.push_str("  - Langue : Français (Canada)\r\n");
        t.push_str("  - Séparé par : Point-virgule (seulement)\r\n");
        t.push_str("Les montants utilisent la virgule décimale, sans espace des milliers\r\n");
        t.push_str("(2100,00) : Calc les reconnaît comme des nombres. Les dates sont au\r\n");
        t.push_str("format AAAA-MM-JJ. Excel en français les ouvre aussi directement.\r\n\r\n");

        t.push_str("donnees.json\r\n");
        t.push_str("------------\r\n");
        t.push_str("Toutes les tables du fichier de données, tous les champs. Les montants y\r\n");
        t.push_str("sont en cents entiers (210000 = 2 100,00 $). Les horodatages sont en\r\n");
        t.push_str("heure universelle (UTC).\r\n\r\n");

        for f in FICHIERS {
            t.push_str(f.nom);
            t.push_str("\r\n");
            t.push_str(&"-".repeat(f.nom.chars().count()));
            t.push_str("\r\n");
            t.push_str(f.description);
            t.push_str("\r\n");
            for c in f.colonnes {
                let unite = match c.genre {
                    Genre::Montant => " (en dollars)",
                    Genre::Date => " (AAAA-MM-JJ)",
                    Genre::OuiNon => " (oui ou non)",
                    _ => "",
                };
                t.push_str(&format!(
                    "  - {} : {}{}\r\n",
                    c.entete, c.description, unite
                ));
            }
            t.push_str("\r\n");
        }
        t
    }

    /// Écrit l'export dans `destination` (.zip). Il est écrit sous un nom
    /// temporaire, puis mis en place : un échec ne laisse rien à moitié écrit.
    pub fn exporter(
        &self,
        destination: &Path,
        version_application: &str,
    ) -> Resultat<ResumeExport> {
        let exporte_le = self.horloge.maintenant();
        let resume = resume_de(&self.conn)?;
        let vide = !resume.paie_configuree
            && resume.salaires == 0
            && resume.elements == 0
            && resume.entrees_journal == 0;

        let donnees = json!({
            "format": "liberte-35-export",
            "versionFormat": VERSION_FORMAT,
            "versionApplication": version_application,
            "installation": self.profil.code(),
            "versionSchema": self.version_schema()?,
            "exporteLe": exporte_le,
            "tables": self.contenu_des_tables()?,
        });
        let mut fichiers: Vec<(String, String)> = vec![(
            "donnees.json".into(),
            serde_json::to_string_pretty(&donnees)
                .map_err(|e| ErreurStockage::ExportEchoue(e.to_string()))?,
        )];
        for f in FICHIERS {
            fichiers.push((f.nom.into(), self.csv(f)?));
        }
        fichiers.push((
            "LISEZMOI.txt".into(),
            self.lisezmoi(version_application, &exporte_le, vide),
        ));

        let mut nom_temp = destination
            .file_name()
            .map(|n| n.to_os_string())
            .unwrap_or_default();
        nom_temp.push(".ecriture");
        let temporaire = destination.with_file_name(nom_temp);
        let ecrire = || -> Result<(), String> {
            let fichier = std::fs::File::create(&temporaire).map_err(|e| e.to_string())?;
            let mut z = zip::ZipWriter::new(fichier);
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);
            for (nom, contenu) in &fichiers {
                z.start_file(nom.as_str(), options)
                    .map_err(|e| e.to_string())?;
                z.write_all(contenu.as_bytes()).map_err(|e| e.to_string())?;
            }
            let fichier = z.finish().map_err(|e| e.to_string())?;
            fichier.sync_all().map_err(|e| e.to_string())?;
            drop(fichier);
            std::fs::rename(&temporaire, destination).map_err(|e| e.to_string())
        };
        if let Err(e) = ecrire() {
            if temporaire.is_file() {
                let _ = std::fs::remove_file(&temporaire);
            }
            return Err(ErreurStockage::ExportEchoue(e));
        }
        Ok(ResumeExport {
            nom_fichier: destination
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default(),
            fichiers: fichiers.into_iter().map(|(n, _)| n).collect(),
            resume,
            vide,
        })
    }
}
