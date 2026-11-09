//! Données de paie : profil, changements de salaire, exceptions, seuil
//! d'attention, autres revenus et dépenses (étape 4). Chaque changement est enregistré avec ses entrées de
//! journal dans une seule transaction : soit tout est écrit, soit rien.
//! Les calculs (cycles, disponible) se font dans le noyau de l'interface ;
//! ici, on ne fait que garder les décisions de l'utilisatrice.

use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::{ErreurStockage, NouvelleEntree, Resultat, Stockage};

const CLE_SEUIL: &str = "seuil_attention";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfilPaieStocke {
    /// hebdomadaire, deuxSemaines, deuxFoisParMois ou mensuelle.
    pub frequence: String,
    pub depart: String,
    pub jours: Option<(u8, u8)>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SalaireStocke {
    pub a_partir_du: String,
    pub montant: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExceptionStockee {
    pub date_origine: String,
    pub date_reelle: Option<String>,
    pub montant: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MontantStocke {
    pub a_partir_du: String,
    pub montant: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuspensionStocke {
    pub debut: String,
    pub fin: String,
}

/// Changement de fréquence « à partir du » (étape 4b, B).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeriodeStockee {
    pub a_partir_du: String,
    pub frequence: serde_json::Value,
}

/// Ajustement d'une occurrence (étape 4b, A) : la règle ne change pas.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AjustementStocke {
    pub element_id: String,
    /// Date d'origine de l'occurrence : son identité stable.
    pub origine: String,
    pub montant: Option<i64>,
    pub date: Option<String>,
    pub paie_origine: Option<String>,
    pub retire: bool,
}

/// Fait confirmé (étape 5) : une date et un montant réels pour une
/// occurrence. Ce n'est pas une transaction bancaire.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfirmationStockee {
    /// None : la paie elle-même.
    pub element_id: Option<String>,
    pub origine: String,
    pub date: String,
    pub montant: i64,
}

/// Autre revenu ou dépense (étape 4). La fréquence garde le format du noyau
/// de l'interface ; on vérifie ici seulement qu'elle a un type.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementStocke {
    pub id: String,
    pub libelle: String,
    /// revenu ou depense.
    pub nature: String,
    /// fixe ou enveloppe.
    pub genre: String,
    pub incertain: bool,
    pub estimation: bool,
    pub frequence: serde_json::Value,
    pub montants: Vec<MontantStocke>,
    pub suspensions: Vec<SuspensionStocke>,
    pub fin: Option<String>,
    pub cycle_paie: Option<String>,
    /// Absent dans le format de l'étape 4 : aucun changement.
    #[serde(default)]
    pub changements_frequence: Vec<PeriodeStockee>,
}

/// Solde de référence d'un prêt à une date (étape 7a, Q40) : le solde de
/// départ, puis chaque mise à jour d'après un relevé.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoldePretStocke {
    pub date: String,
    pub montant: i64,
    pub note: Option<String>,
}

/// Fiche d'un prêt (étape 7a). Son `id` est celui de l'élément de dépense
/// fixe qui porte le versement. Tout est facultatif : on commence avec ce
/// qu'on sait et on complète plus tard.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PretStocke {
    pub id: String,
    /// Minimum obligatoire ; absent : le versement sert de minimum (Q46).
    pub minimum: Option<i64>,
    pub echeance_finale: Option<String>,
    /// Taux annuel en pour cent, point décimal (« 9.90 »).
    pub taux: Option<String>,
    /// Marqué remboursé par l'utilisatrice (jamais déduit d'une estimation).
    pub rembourse_le: Option<String>,
    #[serde(default)]
    pub soldes: Vec<SoldePretStocke>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DonneesPaie {
    pub profil: Option<ProfilPaieStocke>,
    pub salaires: Vec<SalaireStocke>,
    pub exceptions: Vec<ExceptionStockee>,
    pub seuil: Option<i64>,
    pub elements: Vec<ElementStocke>,
    #[serde(default)]
    pub ajustements: Vec<AjustementStocke>,
    #[serde(default)]
    pub confirmations: Vec<ConfirmationStockee>,
    #[serde(default)]
    pub prets: Vec<PretStocke>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ChangementPaie {
    DefinirProfil {
        profil: ProfilPaieStocke,
    },
    DefinirSalaire {
        salaire: SalaireStocke,
    },
    RetirerSalaire {
        a_partir_du: String,
    },
    DefinirException {
        exception: ExceptionStockee,
    },
    RetirerException {
        date_origine: String,
    },
    DefinirSeuil {
        seuil: Option<i64>,
    },
    DefinirElement {
        element: ElementStocke,
    },
    SupprimerElement {
        id: String,
    },
    DefinirAjustement {
        ajustement: AjustementStocke,
    },
    RetirerAjustement {
        element_id: String,
        origine: String,
    },
    DefinirConfirmation {
        confirmation: ConfirmationStockee,
    },
    RetirerConfirmation {
        element_id: Option<String>,
        origine: String,
    },
    DefinirPret {
        pret: PretStocke,
    },
    SupprimerPret {
        id: String,
    },
}

fn erreur(message: impl Into<String>) -> ErreurStockage {
    ErreurStockage::DonneeInvalide(message.into())
}

fn verifier_date(d: &str) -> Resultat<()> {
    let ok = d.len() == 10
        && d.chars().enumerate().all(|(i, c)| {
            if i == 4 || i == 7 {
                c == '-'
            } else {
                c.is_ascii_digit()
            }
        });
    if ok {
        Ok(())
    } else {
        Err(erreur(format!(
            "Date invalide : « {d} » (format attendu AAAA-MM-JJ)."
        )))
    }
}

fn verifier(changement: &ChangementPaie) -> Resultat<()> {
    match changement {
        ChangementPaie::DefinirProfil { profil } => {
            verifier_date(&profil.depart)?;
            match (profil.frequence.as_str(), profil.jours) {
                ("deuxFoisParMois", Some((j1, j2)))
                    if (1..=27).contains(&j1) && j2 > j1 && j2 <= 31 =>
                {
                    Ok(())
                }
                ("deuxFoisParMois", _) => Err(erreur("Deux fois par mois : jours invalides.")),
                ("hebdomadaire" | "deuxSemaines" | "mensuelle", None) => Ok(()),
                (f, _) => Err(erreur(format!(
                    "Fréquence de paie inconnue ou incomplète : « {f} »."
                ))),
            }
        }
        ChangementPaie::DefinirSalaire { salaire } => {
            verifier_date(&salaire.a_partir_du)?;
            if salaire.montant < 0 {
                return Err(erreur("Un salaire ne peut pas être négatif."));
            }
            Ok(())
        }
        ChangementPaie::RetirerSalaire { a_partir_du } => verifier_date(a_partir_du),
        ChangementPaie::DefinirException { exception } => {
            verifier_date(&exception.date_origine)?;
            if let Some(d) = &exception.date_reelle {
                verifier_date(d)?;
            }
            if exception.montant.is_some_and(|m| m < 0) {
                return Err(erreur("Le montant d'une paie ne peut pas être négatif."));
            }
            if exception.date_reelle.is_none() && exception.montant.is_none() {
                return Err(erreur("Une exception doit changer la date ou le montant."));
            }
            Ok(())
        }
        ChangementPaie::RetirerException { date_origine } => verifier_date(date_origine),
        ChangementPaie::DefinirSeuil { seuil } => {
            if seuil.is_some_and(|s| s < 0) {
                return Err(erreur("Le seuil d'attention ne peut pas être négatif."));
            }
            Ok(())
        }
        ChangementPaie::DefinirElement { element } => verifier_element(element),
        ChangementPaie::SupprimerElement { id } => {
            if id.is_empty() {
                return Err(erreur("Élément à supprimer non précisé."));
            }
            Ok(())
        }
        ChangementPaie::DefinirAjustement { ajustement: a } => {
            verifier_date(&a.origine)?;
            if let Some(d) = &a.date {
                verifier_date(d)?;
            }
            if let Some(d) = &a.paie_origine {
                verifier_date(d)?;
            }
            if a.montant.is_some_and(|m| m < 0) {
                return Err(erreur("Un montant ne peut pas être négatif."));
            }
            if a.montant.is_none() && a.date.is_none() && a.paie_origine.is_none() && !a.retire {
                return Err(erreur("Un ajustement doit changer quelque chose."));
            }
            Ok(())
        }
        ChangementPaie::RetirerAjustement { origine, .. } => verifier_date(origine),
        ChangementPaie::DefinirConfirmation { confirmation: c } => {
            verifier_date(&c.origine)?;
            verifier_date(&c.date)?;
            if c.montant < 0 {
                return Err(erreur("Un montant confirmé ne peut pas être négatif."));
            }
            Ok(())
        }
        ChangementPaie::RetirerConfirmation { origine, .. } => verifier_date(origine),
        ChangementPaie::DefinirPret { pret } => verifier_pret(pret),
        ChangementPaie::SupprimerPret { id } => {
            if id.is_empty() {
                return Err(erreur("Prêt à supprimer non précisé."));
            }
            Ok(())
        }
    }
}

fn verifier_pret(p: &PretStocke) -> Resultat<()> {
    if p.id.is_empty() {
        return Err(erreur("Prêt sans identifiant."));
    }
    if p.minimum.is_some_and(|m| m < 0) {
        return Err(erreur("Le minimum d'un prêt ne peut pas être négatif."));
    }
    for d in [&p.echeance_finale, &p.rembourse_le].into_iter().flatten() {
        verifier_date(d)?;
    }
    if let Some(t) = &p.taux {
        let (entier, decimales) = t.split_once('.').unwrap_or((t.as_str(), ""));
        let forme = !entier.is_empty()
            && entier.chars().all(|c| c.is_ascii_digit())
            && decimales.len() <= 3
            && decimales.chars().all(|c| c.is_ascii_digit());
        let valeur: f64 = t.parse().unwrap_or(f64::MAX);
        if !forme || valeur > 100.0 {
            return Err(erreur(format!(
                "Taux invalide : « {t} » (par exemple 9.90)."
            )));
        }
    }
    let mut dates = std::collections::HashSet::new();
    for s in &p.soldes {
        verifier_date(&s.date)?;
        if s.montant < 0 {
            return Err(erreur("Un solde ne peut pas être négatif."));
        }
        if !dates.insert(&s.date) {
            return Err(erreur(format!("Deux soldes à la même date ({}).", s.date)));
        }
    }
    Ok(())
}

fn lire_prets(conn: &rusqlite::Connection) -> Resultat<Vec<PretStocke>> {
    let mut req = conn.prepare(
        "SELECT id, minimum, echeance_finale, taux, rembourse_le FROM prets ORDER BY id",
    )?;
    let mut prets = req
        .query_map([], |r| {
            Ok(PretStocke {
                id: r.get(0)?,
                minimum: r.get(1)?,
                echeance_finale: r.get(2)?,
                taux: r.get(3)?,
                rembourse_le: r.get(4)?,
                soldes: Vec::new(),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut req = conn
        .prepare("SELECT date, montant, note FROM soldes_pret WHERE pret_id = ?1 ORDER BY date")?;
    for p in &mut prets {
        p.soldes = req
            .query_map([&p.id], |r| {
                Ok(SoldePretStocke {
                    date: r.get(0)?,
                    montant: r.get(1)?,
                    note: r.get(2)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
    }
    Ok(prets)
}

fn lire_confirmations(conn: &rusqlite::Connection) -> Resultat<Vec<ConfirmationStockee>> {
    let mut req = conn.prepare(
        "SELECT element_id, origine, date, montant FROM confirmations
         ORDER BY ifnull(element_id, ''), origine",
    )?;
    let lignes = req
        .query_map([], |r| {
            Ok(ConfirmationStockee {
                element_id: r.get(0)?,
                origine: r.get(1)?,
                date: r.get(2)?,
                montant: r.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(lignes)
}

fn verifier_element(e: &ElementStocke) -> Resultat<()> {
    if e.id.is_empty() || e.id.len() > 64 {
        return Err(erreur("Identifiant d'élément invalide."));
    }
    if e.libelle.trim().is_empty() {
        return Err(erreur("Un revenu ou une dépense doit avoir un nom."));
    }
    match (e.nature.as_str(), e.genre.as_str()) {
        ("depense", "fixe" | "enveloppe") | ("revenu", "fixe") => {}
        ("revenu", "enveloppe") => return Err(erreur("Une enveloppe est toujours une dépense.")),
        _ => return Err(erreur("Nature ou genre inconnu.")),
    }
    if e.incertain && e.nature != "revenu" {
        return Err(erreur("Seul un revenu peut être incertain."));
    }
    if !e.frequence.get("type").is_some_and(|t| t.is_string()) {
        return Err(erreur("Fréquence invalide."));
    }
    for m in &e.montants {
        verifier_date(&m.a_partir_du)?;
        if m.montant < 0 {
            return Err(erreur("Un montant ne peut pas être négatif."));
        }
    }
    for s in &e.suspensions {
        verifier_date(&s.debut)?;
        verifier_date(&s.fin)?;
        if s.fin < s.debut {
            return Err(erreur("Une suspension doit finir après son début."));
        }
    }
    if let Some(f) = &e.fin {
        verifier_date(f)?;
    }
    if let Some(c) = &e.cycle_paie {
        verifier_date(c)?;
    }
    let mut dates = std::collections::BTreeSet::new();
    for p in &e.changements_frequence {
        verifier_date(&p.a_partir_du)?;
        if !p.frequence.get("type").is_some_and(|t| t.is_string()) {
            return Err(erreur("Fréquence invalide."));
        }
        if !dates.insert(p.a_partir_du.as_str()) {
            return Err(erreur(
                "Deux changements de fréquence ne peuvent pas commencer le même jour.",
            ));
        }
    }
    Ok(())
}

fn lire_ajustements(conn: &rusqlite::Connection) -> Resultat<Vec<AjustementStocke>> {
    let mut req = conn.prepare(
        "SELECT element_id, origine, montant, date, paie_origine, retire
         FROM ajustements_element ORDER BY element_id, origine",
    )?;
    let lignes = req
        .query_map([], |r| {
            Ok(AjustementStocke {
                element_id: r.get(0)?,
                origine: r.get(1)?,
                montant: r.get(2)?,
                date: r.get(3)?,
                paie_origine: r.get(4)?,
                retire: r.get::<_, i64>(5)? == 1,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(lignes)
}

fn lire_elements(conn: &rusqlite::Connection) -> Resultat<Vec<ElementStocke>> {
    let mut req = conn.prepare(
        "SELECT id, libelle, nature, genre, incertain, estimation, frequence, fin, cycle_paie
         FROM elements ORDER BY rowid",
    )?;
    let mut elements = req
        .query_map([], |r| {
            let frequence: String = r.get(6)?;
            Ok(ElementStocke {
                id: r.get(0)?,
                libelle: r.get(1)?,
                nature: r.get(2)?,
                genre: r.get(3)?,
                incertain: r.get::<_, i64>(4)? == 1,
                estimation: r.get::<_, i64>(5)? == 1,
                frequence: serde_json::from_str(&frequence).unwrap_or(serde_json::Value::Null),
                montants: Vec::new(),
                suspensions: Vec::new(),
                fin: r.get(7)?,
                cycle_paie: r.get(8)?,
                changements_frequence: Vec::new(),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut req_m = conn.prepare(
        "SELECT a_partir_du, montant FROM montants_element WHERE element_id = ?1 ORDER BY a_partir_du",
    )?;
    let mut req_s = conn.prepare(
        "SELECT debut, fin FROM suspensions_element WHERE element_id = ?1 ORDER BY debut, fin",
    )?;
    let mut req_p = conn.prepare(
        "SELECT a_partir_du, frequence FROM periodes_frequence WHERE element_id = ?1 ORDER BY a_partir_du",
    )?;
    for e in &mut elements {
        e.montants = req_m
            .query_map([&e.id], |r| {
                Ok(MontantStocke {
                    a_partir_du: r.get(0)?,
                    montant: r.get(1)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        e.suspensions = req_s
            .query_map([&e.id], |r| {
                Ok(SuspensionStocke {
                    debut: r.get(0)?,
                    fin: r.get(1)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        e.changements_frequence = req_p
            .query_map([&e.id], |r| {
                let f: String = r.get(1)?;
                Ok(PeriodeStockee {
                    a_partir_du: r.get(0)?,
                    frequence: serde_json::from_str(&f).unwrap_or(serde_json::Value::Null),
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
    }
    Ok(elements)
}

fn ecrire_element(tx: &rusqlite::Transaction, e: &ElementStocke) -> Resultat<()> {
    // Remplacement complet : l'élément garde sa place dans la liste.
    tx.execute(
        "INSERT INTO elements (id, libelle, nature, genre, incertain, estimation, frequence, fin, cycle_paie)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(id) DO UPDATE SET libelle = excluded.libelle, nature = excluded.nature,
           genre = excluded.genre, incertain = excluded.incertain, estimation = excluded.estimation,
           frequence = excluded.frequence, fin = excluded.fin, cycle_paie = excluded.cycle_paie",
        params![
            e.id,
            e.libelle.trim(),
            e.nature,
            e.genre,
            e.incertain as i64,
            e.estimation as i64,
            e.frequence.to_string(),
            e.fin,
            e.cycle_paie
        ],
    )?;
    tx.execute(
        "DELETE FROM montants_element WHERE element_id = ?1",
        [&e.id],
    )?;
    tx.execute(
        "DELETE FROM suspensions_element WHERE element_id = ?1",
        [&e.id],
    )?;
    // Les ajustements de l'élément ne sont pas touchés : jamais d'écrasement.
    tx.execute(
        "DELETE FROM periodes_frequence WHERE element_id = ?1",
        [&e.id],
    )?;
    for p in &e.changements_frequence {
        tx.execute(
            "INSERT INTO periodes_frequence (element_id, a_partir_du, frequence) VALUES (?1, ?2, ?3)",
            params![e.id, p.a_partir_du, p.frequence.to_string()],
        )?;
    }
    for m in &e.montants {
        tx.execute(
            "INSERT INTO montants_element (element_id, a_partir_du, montant) VALUES (?1, ?2, ?3)",
            params![e.id, m.a_partir_du, m.montant],
        )?;
    }
    for s in &e.suspensions {
        tx.execute(
            "INSERT INTO suspensions_element (element_id, debut, fin) VALUES (?1, ?2, ?3)",
            params![e.id, s.debut, s.fin],
        )?;
    }
    Ok(())
}

impl Stockage {
    pub fn lire_paie(&self) -> Resultat<DonneesPaie> {
        let profil = self
            .conn
            .query_row(
                "SELECT frequence, depart, jour1, jour2 FROM profil_paie WHERE id = 1",
                [],
                |r| {
                    let j1: Option<u8> = r.get(2)?;
                    let j2: Option<u8> = r.get(3)?;
                    Ok(ProfilPaieStocke {
                        frequence: r.get(0)?,
                        depart: r.get(1)?,
                        jours: j1.zip(j2),
                    })
                },
            )
            .optional()?;
        let mut req = self
            .conn
            .prepare("SELECT a_partir_du, montant FROM salaires ORDER BY a_partir_du")?;
        let salaires = req
            .query_map([], |r| {
                Ok(SalaireStocke {
                    a_partir_du: r.get(0)?,
                    montant: r.get(1)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        let mut req = self.conn.prepare(
            "SELECT date_origine, date_reelle, montant FROM exceptions_paie ORDER BY date_origine",
        )?;
        let exceptions = req
            .query_map([], |r| {
                Ok(ExceptionStockee {
                    date_origine: r.get(0)?,
                    date_reelle: r.get(1)?,
                    montant: r.get(2)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        let seuil = self
            .parametre(CLE_SEUIL)?
            .and_then(|s| s.parse::<i64>().ok());
        let elements = lire_elements(&self.conn)?;
        let ajustements = lire_ajustements(&self.conn)?;
        let confirmations = lire_confirmations(&self.conn)?;
        let prets = lire_prets(&self.conn)?;
        Ok(DonneesPaie {
            profil,
            salaires,
            exceptions,
            seuil,
            elements,
            ajustements,
            confirmations,
            prets,
        })
    }

    /// Applique un changement et ses entrées de journal, tout ou rien.
    pub fn appliquer_changement_paie(
        &mut self,
        changement: &ChangementPaie,
        journal: &[NouvelleEntree],
    ) -> Resultat<DonneesPaie> {
        self.appliquer_changements_paie(std::slice::from_ref(changement), journal)
    }

    /// Applique plusieurs changements et leurs entrées de journal dans une
    /// seule transaction : tout ou rien. Un changement sans entrée de journal
    /// est refusé (décision A10).
    pub fn appliquer_changements_paie(
        &mut self,
        changements: &[ChangementPaie],
        journal: &[NouvelleEntree],
    ) -> Resultat<DonneesPaie> {
        if changements.is_empty() {
            return Err(erreur("Aucun changement à enregistrer."));
        }
        for c in changements {
            verifier(c)?;
        }
        if journal.is_empty() {
            return Err(erreur(
                "Un changement de paie doit être consigné au journal.",
            ));
        }
        let maintenant = self.horloge.maintenant();
        let tx = self.conn.transaction()?;
        for changement in changements {
            match changement {
                ChangementPaie::DefinirProfil { profil } => {
                    tx.execute(
                    "INSERT INTO profil_paie (id, frequence, depart, jour1, jour2) VALUES (1, ?1, ?2, ?3, ?4)
                     ON CONFLICT(id) DO UPDATE SET frequence = excluded.frequence, depart = excluded.depart,
                       jour1 = excluded.jour1, jour2 = excluded.jour2",
                    params![profil.frequence, profil.depart, profil.jours.map(|j| j.0), profil.jours.map(|j| j.1)],
                )?;
                }
                ChangementPaie::DefinirSalaire { salaire } => {
                    tx.execute(
                        "INSERT INTO salaires (a_partir_du, montant) VALUES (?1, ?2)
                     ON CONFLICT(a_partir_du) DO UPDATE SET montant = excluded.montant",
                        params![salaire.a_partir_du, salaire.montant],
                    )?;
                }
                ChangementPaie::RetirerSalaire { a_partir_du } => {
                    tx.execute("DELETE FROM salaires WHERE a_partir_du = ?1", [a_partir_du])?;
                }
                ChangementPaie::DefinirException { exception } => {
                    tx.execute(
                    "INSERT INTO exceptions_paie (date_origine, date_reelle, montant) VALUES (?1, ?2, ?3)
                     ON CONFLICT(date_origine) DO UPDATE SET date_reelle = excluded.date_reelle, montant = excluded.montant",
                    params![exception.date_origine, exception.date_reelle, exception.montant],
                )?;
                }
                ChangementPaie::RetirerException { date_origine } => {
                    tx.execute(
                        "DELETE FROM exceptions_paie WHERE date_origine = ?1",
                        [date_origine],
                    )?;
                }
                ChangementPaie::DefinirSeuil { seuil } => match seuil {
                    Some(s) => {
                        tx.execute(
                        "INSERT INTO parametres (cle, valeur, modifie_le) VALUES (?1, ?2, ?3)
                         ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur, modifie_le = excluded.modifie_le",
                        params![CLE_SEUIL, s.to_string(), maintenant],
                    )?;
                    }
                    None => {
                        tx.execute("DELETE FROM parametres WHERE cle = ?1", [CLE_SEUIL])?;
                    }
                },
                ChangementPaie::DefinirElement { element } => ecrire_element(&tx, element)?,
                ChangementPaie::SupprimerElement { id } => {
                    // Q16 : un élément qui a des opérations confirmées se termine,
                    // il ne se supprime pas.
                    let confirme: bool = tx.query_row(
                        "SELECT EXISTS (SELECT 1 FROM confirmations WHERE element_id = ?1)",
                        [id],
                        |r| r.get(0),
                    )?;
                    if confirme {
                        return Err(erreur(
                            "Ce revenu ou cette dépense a des opérations confirmées : termine-le plutôt que de le supprimer.",
                        ));
                    }
                    let pret: bool = tx.query_row(
                        "SELECT EXISTS (SELECT 1 FROM prets WHERE id = ?1)",
                        [id],
                        |r| r.get(0),
                    )?;
                    if pret {
                        return Err(erreur(
                            "Ce versement appartient à un prêt : supprime le prêt depuis Mes dettes.",
                        ));
                    }
                    // Ses montants, suspensions, périodes et ajustements partent avec lui.
                    tx.execute("DELETE FROM elements WHERE id = ?1", [id])?;
                }
                ChangementPaie::DefinirAjustement { ajustement: a } => {
                    let existe: bool = tx.query_row(
                        "SELECT EXISTS (SELECT 1 FROM elements WHERE id = ?1)",
                        [&a.element_id],
                        |r| r.get(0),
                    )?;
                    if !existe {
                        return Err(erreur("Ce revenu ou cette dépense n'existe plus."));
                    }
                    tx.execute(
                        "INSERT INTO ajustements_element (element_id, origine, montant, date, paie_origine, retire)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                         ON CONFLICT(element_id, origine) DO UPDATE SET montant = excluded.montant,
                           date = excluded.date, paie_origine = excluded.paie_origine, retire = excluded.retire",
                        params![a.element_id, a.origine, a.montant, a.date, a.paie_origine, a.retire as i64],
                    )?;
                }
                ChangementPaie::RetirerAjustement {
                    element_id,
                    origine,
                } => {
                    tx.execute(
                        "DELETE FROM ajustements_element WHERE element_id = ?1 AND origine = ?2",
                        [element_id, origine],
                    )?;
                }
                ChangementPaie::DefinirConfirmation { confirmation: c } => {
                    if let Some(id) = &c.element_id {
                        let existe: bool = tx.query_row(
                            "SELECT EXISTS (SELECT 1 FROM elements WHERE id = ?1)",
                            [id],
                            |r| r.get(0),
                        )?;
                        if !existe {
                            return Err(erreur("Ce revenu ou cette dépense n'existe plus."));
                        }
                    }
                    tx.execute(
                        "DELETE FROM confirmations WHERE ifnull(element_id, '') = ifnull(?1, '') AND origine = ?2",
                        params![c.element_id, c.origine],
                    )?;
                    tx.execute(
                        "INSERT INTO confirmations (element_id, origine, date, montant, cree_le)
                         VALUES (?1, ?2, ?3, ?4, ?5)",
                        params![c.element_id, c.origine, c.date, c.montant, maintenant],
                    )?;
                }
                ChangementPaie::RetirerConfirmation {
                    element_id,
                    origine,
                } => {
                    tx.execute(
                        "DELETE FROM confirmations WHERE ifnull(element_id, '') = ifnull(?1, '') AND origine = ?2",
                        params![element_id, origine],
                    )?;
                }
                ChangementPaie::DefinirPret { pret: p } => {
                    let genre: Option<(String, String)> = tx
                        .query_row(
                            "SELECT nature, genre FROM elements WHERE id = ?1",
                            [&p.id],
                            |r| Ok((r.get(0)?, r.get(1)?)),
                        )
                        .optional()?;
                    match genre.as_ref().map(|(n, g)| (n.as_str(), g.as_str())) {
                        Some(("depense", "fixe")) => {}
                        Some(_) => {
                            return Err(erreur(
                                "Le versement d'un prêt doit être une dépense fixe.",
                            ))
                        }
                        None => return Err(erreur("Le versement de ce prêt n'existe pas.")),
                    }
                    tx.execute(
                        "INSERT INTO prets (id, minimum, echeance_finale, taux, rembourse_le)
                         VALUES (?1, ?2, ?3, ?4, ?5)
                         ON CONFLICT(id) DO UPDATE SET minimum = excluded.minimum,
                           echeance_finale = excluded.echeance_finale, taux = excluded.taux,
                           rembourse_le = excluded.rembourse_le",
                        params![p.id, p.minimum, p.echeance_finale, p.taux, p.rembourse_le],
                    )?;
                    tx.execute("DELETE FROM soldes_pret WHERE pret_id = ?1", [&p.id])?;
                    for so in &p.soldes {
                        tx.execute(
                            "INSERT INTO soldes_pret (pret_id, date, montant, note) VALUES (?1, ?2, ?3, ?4)",
                            params![p.id, so.date, so.montant, so.note],
                        )?;
                    }
                }
                ChangementPaie::SupprimerPret { id } => {
                    let confirme: bool = tx.query_row(
                        "SELECT EXISTS (SELECT 1 FROM confirmations WHERE element_id = ?1)",
                        [id],
                        |r| r.get(0),
                    )?;
                    if confirme {
                        return Err(erreur(
                            "Ce prêt a des versements confirmés : marque-le comme remboursé plutôt que de le supprimer.",
                        ));
                    }
                    // Ses soldes de référence partent avec lui.
                    tx.execute("DELETE FROM prets WHERE id = ?1", [id])?;
                }
            }
        }
        for e in journal {
            tx.execute(
                "INSERT INTO journal_changements
                   (horodatage, section, objet, champ, ancienne_valeur, nouvelle_valeur, motif)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    maintenant,
                    e.section,
                    e.objet,
                    e.champ,
                    e.ancienne_valeur,
                    e.nouvelle_valeur,
                    e.motif
                ],
            )?;
        }
        tx.commit()?;
        self.lire_paie()
    }
}
