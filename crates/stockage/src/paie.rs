//! Données de paie : profil, changements de salaire, exceptions, seuil
//! d'attention, autres revenus et dépenses (étape 4). Chaque changement est enregistré avec ses entrées de
//! journal dans une seule transaction : soit tout est écrit, soit rien.
//! Les calculs (cycles, disponible) se font dans le noyau de l'interface ;
//! ici, on ne fait que garder les décisions de l'utilisatrice.

use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::{ErreurStockage, NouvelleEntree, Resultat, Stockage};

const CLE_SEUIL: &str = "seuil_attention";
/// Lot 1 : ordre de priorité de remboursement des dettes (identifiants de
/// prêts ou de la carte), choisi à la main. Un réglage d'affichage : il ne
/// change ni paiement, ni prévision, ni solde.
const CLE_PRIORITE_DETTES: &str = "priorite_dettes";

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

/// Relevé de carte recopié tel quel (étape 8) : jamais modifié ensuite.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleveStocke {
    pub date: String,
    pub solde: i64,
    pub minimum: Option<i64>,
    pub echeance: Option<String>,
}

/// Solde actuel de la carte selon une mise à jour manuelle datée (Q59).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoldeCarteStocke {
    pub date: String,
    pub montant: i64,
    pub note: Option<String>,
}

/// Frais récurrent autorisé, informatif seulement (Q62).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FraisCarteStocke {
    pub libelle: String,
    pub montant: i64,
    /// « annee » ou « mois ».
    pub frequence: String,
}

/// Fiche de la carte (étape 8). Son `id` est celui de l'élément de dépense
/// fixe qui porte l'échéance mensuelle ; `supplements` liste les éléments
/// « une seule fois » des paiements supplémentaires.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CarteStocke {
    pub id: String,
    pub limite: Option<i64>,
    pub taux: Option<String>,
    /// « reduireSolde », « payerReleves » ; absent : aucun objectif choisi.
    pub objectif: Option<String>,
    #[serde(default)]
    pub releves: Vec<ReleveStocke>,
    #[serde(default)]
    pub soldes: Vec<SoldeCarteStocke>,
    #[serde(default)]
    pub frais: Vec<FraisCarteStocke>,
    #[serde(default)]
    pub supplements: Vec<String>,
}

/// Solde de référence daté d'un compte d'épargne (étape 9) : le point de
/// départ de la valeur suivie, ou une correction (Q71, R1).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceCompteStockee {
    pub date: String,
    pub montant: i64,
    pub note: Option<String>,
}

/// Mouvement d'un compte d'épargne (Q73, Q74) : « fluctuation » (+ ou −),
/// « retrait » ou « transfert » (vers un autre compte). Jamais dans Mes paies.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MouvementStocke {
    pub id: String,
    pub date: String,
    pub sorte: String,
    pub montant: i64,
    pub vers: Option<String>,
    pub destination: Option<String>,
    pub note: Option<String>,
    /// Étape A : lien vers une occurrence de dépense (« id|date ») réglée
    /// avec une réserve.
    #[serde(default)]
    pub lien: Option<String>,
}

/// Étape A : période de suspension d'une réserve (fin absente : en cours).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuspensionReserveStockee {
    pub debut: String,
    pub fin: Option<String>,
}

/// Étape A : mouvement interne d'une réserve. Jamais dans Mes paies.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MouvementReserveStocke {
    pub id: String,
    pub date: String,
    /// affectation, liberation, reaffectation, utilisation, prelevement, transfert.
    pub sorte: String,
    pub montant: i64,
    /// Réaffectation : la réserve qui reçoit.
    pub vers: Option<String>,
    /// Utilisation : « dépense|date » ; prélèvement ou transfert : le mouvement du compte.
    pub lien: Option<String>,
    pub note: Option<String>,
}

/// Étape A : réserve virtuelle dans un compte d'épargne.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReserveStockee {
    pub id: String,
    pub nom: String,
    /// « permanente » ou « ponctuelle ».
    pub sorte: String,
    pub cible: Option<i64>,
    pub date: Option<String>,
    pub frequence_mois: Option<i64>,
    /// B1 : la dépense à prévoir qui porte date, fréquence et montant.
    pub depense_id: Option<String>,
    pub arretee_le: Option<String>,
    pub transferee_vers: Option<String>,
    pub note: Option<String>,
    #[serde(default)]
    pub suspensions: Vec<SuspensionReserveStockee>,
    #[serde(default)]
    pub mouvements: Vec<MouvementReserveStocke>,
}

/// Étape A (A5) : répartition d'une contribution entre réserves ; `origine`
/// absente pour la répartition habituelle, présente pour une seule paie (P6).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PartStockee {
    pub reserve_id: String,
    pub montant: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepartitionStockee {
    pub element_id: String,
    pub origine: Option<String>,
    pub parts: Vec<PartStockee>,
}

/// Étape A : dépense à prévoir (un élément de dépense, plus sa fiche).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModeDepenseStocke {
    pub origine: String,
    /// « disponible » ou « reserve ».
    pub mode: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DepenseStockee {
    pub id: String,
    pub note: Option<String>,
    #[serde(default)]
    pub modes: Vec<ModeDepenseStocke>,
}

/// Compte d'épargne (étape 9). `contributions` liste les éléments de dépense
/// fixe qui l'alimentent depuis Mes paies.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompteStocke {
    pub id: String,
    /// « celi », « reer », « celiapp », « epargne » ou « autre ».
    pub sorte: String,
    pub type_libre: Option<String>,
    pub nom: Option<String>,
    pub vocation: Option<String>,
    pub institution: Option<String>,
    pub ferme_le: Option<String>,
    #[serde(default)]
    pub references: Vec<ReferenceCompteStockee>,
    #[serde(default)]
    pub mouvements: Vec<MouvementStocke>,
    #[serde(default)]
    pub contributions: Vec<String>,
    #[serde(default)]
    pub reserves: Vec<ReserveStockee>,
    #[serde(default)]
    pub repartitions: Vec<RepartitionStockee>,
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
    #[serde(default)]
    pub cartes: Vec<CarteStocke>,
    #[serde(default)]
    pub comptes: Vec<CompteStocke>,
    #[serde(default)]
    pub depenses: Vec<DepenseStockee>,
    /// Lot 1 : priorité de remboursement, la première d'abord ; vide : aucune.
    #[serde(default)]
    pub priorite_dettes: Vec<String>,
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
    /// Lot 1 : ordre de priorité des dettes ; une liste vide retire les priorités.
    DefinirPrioriteDettes {
        ordre: Vec<String>,
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
    DefinirCarte {
        carte: CarteStocke,
    },
    SupprimerCarte {
        id: String,
    },
    DefinirCompte {
        compte: CompteStocke,
    },
    SupprimerCompte {
        id: String,
    },
    DefinirDepense {
        depense: DepenseStockee,
    },
    SupprimerDepense {
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
        ChangementPaie::DefinirPrioriteDettes { ordre } => {
            let mut vus = std::collections::HashSet::new();
            if ordre
                .iter()
                .any(|id| id.trim().is_empty() || !vus.insert(id.as_str()))
            {
                return Err(erreur(
                    "L'ordre de priorité contient une dette vide ou en double.",
                ));
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
        ChangementPaie::DefinirCarte { carte } => verifier_carte(carte),
        ChangementPaie::SupprimerCarte { id } => {
            if id.is_empty() {
                return Err(erreur("Carte à supprimer non précisée."));
            }
            Ok(())
        }
        ChangementPaie::DefinirCompte { compte } => verifier_compte(compte),
        ChangementPaie::DefinirDepense { depense } => {
            if depense.id.is_empty() {
                return Err(erreur("Dépense à prévoir sans identifiant."));
            }
            for m in &depense.modes {
                verifier_date(&m.origine)?;
                if m.mode != "disponible" && m.mode != "reserve" {
                    return Err(erreur("Mode de paiement inconnu."));
                }
            }
            Ok(())
        }
        ChangementPaie::SupprimerDepense { id } => {
            if id.is_empty() {
                return Err(erreur("Dépense à supprimer non précisée."));
            }
            Ok(())
        }
        ChangementPaie::SupprimerCompte { id } => {
            if id.is_empty() {
                return Err(erreur("Compte à supprimer non précisé."));
            }
            Ok(())
        }
    }
}

fn verifier_compte(c: &CompteStocke) -> Resultat<()> {
    if c.id.is_empty() {
        return Err(erreur("Compte sans identifiant."));
    }
    match c.sorte.as_str() {
        "celi" | "reer" | "celiapp" | "epargne" => {
            if c.type_libre.is_some() {
                return Err(erreur("Seul le type « Autre » a un nom libre."));
            }
        }
        "autre" => {
            if c.type_libre.as_deref().is_none_or(|t| t.trim().is_empty()) {
                return Err(erreur("Donne un nom au type « Autre »."));
            }
        }
        autre => return Err(erreur(format!("Type de compte inconnu : « {autre} »."))),
    }
    if let Some(f) = &c.ferme_le {
        verifier_date(f)?;
    }
    let mut dates = std::collections::HashSet::new();
    for r in &c.references {
        verifier_date(&r.date)?;
        if r.montant < 0 {
            return Err(erreur("Un solde de référence ne peut pas être négatif."));
        }
        if !dates.insert(&r.date) {
            return Err(erreur(format!(
                "Deux soldes de référence à la même date ({}).",
                r.date
            )));
        }
    }
    let mut ids = std::collections::HashSet::new();
    for m in &c.mouvements {
        verifier_date(&m.date)?;
        if m.id.is_empty() || !ids.insert(&m.id) {
            return Err(erreur("Mouvement sans identifiant unique."));
        }
        match (m.sorte.as_str(), &m.vers) {
            ("fluctuation", None) => {
                if m.montant == 0 {
                    return Err(erreur("Une fluctuation ne peut pas être nulle."));
                }
            }
            ("retrait", None) | ("transfert", Some(_)) => {
                if m.montant <= 0 {
                    return Err(erreur("Le montant doit être plus grand que 0."));
                }
            }
            _ => return Err(erreur("Mouvement invalide.")),
        }
        if m.vers.as_deref() == Some(c.id.as_str()) {
            return Err(erreur("Un transfert doit aller vers un autre compte."));
        }
    }
    let ids_reserves: std::collections::HashSet<&str> =
        c.reserves.iter().map(|r| r.id.as_str()).collect();
    if ids_reserves.len() != c.reserves.len() {
        return Err(erreur("Deux réserves ont le même identifiant."));
    }
    let mut ids_mv = std::collections::HashSet::new();
    for r in &c.reserves {
        if r.id.is_empty() || r.nom.trim().is_empty() {
            return Err(erreur("Donne un nom à la réserve."));
        }
        if r.sorte != "permanente" && r.sorte != "ponctuelle" {
            return Err(erreur("Sorte de réserve inconnue."));
        }
        if r.cible.is_some_and(|x| x < 0) {
            return Err(erreur("Une cible ne peut pas être négative."));
        }
        if r.frequence_mois.is_some_and(|x| x <= 0) {
            return Err(erreur("Fréquence de réserve invalide."));
        }
        if r.sorte == "ponctuelle" && r.depense_id.is_none() && r.date.is_none() {
            return Err(erreur("Une réserve ponctuelle a besoin d'une date."));
        }
        for d in [&r.date, &r.arretee_le].into_iter().flatten() {
            verifier_date(d)?;
        }
        for su in &r.suspensions {
            verifier_date(&su.debut)?;
            if let Some(f) = &su.fin {
                verifier_date(f)?;
            }
        }
        for m in &r.mouvements {
            verifier_date(&m.date)?;
            if m.id.is_empty() || !ids_mv.insert(&m.id) {
                return Err(erreur("Mouvement de réserve sans identifiant unique."));
            }
            if m.montant <= 0 {
                return Err(erreur("Le montant doit être plus grand que 0."));
            }
            match m.sorte.as_str() {
                "reaffectation" => {
                    if !m
                        .vers
                        .as_deref()
                        .is_some_and(|v| v != r.id && ids_reserves.contains(v))
                    {
                        return Err(erreur("Réaffectation vers une réserve inconnue."));
                    }
                }
                "affectation" | "liberation" | "utilisation" | "prelevement" | "transfert" => {}
                _ => return Err(erreur("Mouvement de réserve invalide.")),
            }
        }
    }
    let mut cles = std::collections::HashSet::new();
    for rp in &c.repartitions {
        if !c.contributions.contains(&rp.element_id) {
            return Err(erreur(
                "Une répartition doit viser une contribution du compte.",
            ));
        }
        if let Some(o) = &rp.origine {
            verifier_date(o)?;
        }
        if !cles.insert((&rp.element_id, &rp.origine)) {
            return Err(erreur("Répartition en double."));
        }
        let mut vues = std::collections::HashSet::new();
        for p in &rp.parts {
            if p.montant <= 0
                || !ids_reserves.contains(p.reserve_id.as_str())
                || !vues.insert(&p.reserve_id)
            {
                return Err(erreur("Part de répartition invalide."));
            }
        }
    }
    Ok(())
}

fn lire_comptes(conn: &rusqlite::Connection) -> Resultat<Vec<CompteStocke>> {
    let mut req = conn.prepare(
        "SELECT id, sorte, type_libre, nom, vocation, institution, ferme_le
         FROM comptes_epargne ORDER BY rowid",
    )?;
    let mut comptes = req
        .query_map([], |r| {
            Ok(CompteStocke {
                id: r.get(0)?,
                sorte: r.get(1)?,
                type_libre: r.get(2)?,
                nom: r.get(3)?,
                vocation: r.get(4)?,
                institution: r.get(5)?,
                ferme_le: r.get(6)?,
                references: Vec::new(),
                mouvements: Vec::new(),
                contributions: Vec::new(),
                reserves: Vec::new(),
                repartitions: Vec::new(),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    for c in &mut comptes {
        c.references = conn
            .prepare(
                "SELECT date, montant, note FROM references_compte WHERE compte_id = ?1 ORDER BY date",
            )?
            .query_map([&c.id], |r| {
                Ok(ReferenceCompteStockee {
                    date: r.get(0)?,
                    montant: r.get(1)?,
                    note: r.get(2)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        c.mouvements = conn
            .prepare(
                "SELECT id, date, sorte, montant, vers, destination, note, lien FROM mouvements_compte
                 WHERE compte_id = ?1 ORDER BY date, rowid",
            )?
            .query_map([&c.id], |r| {
                Ok(MouvementStocke {
                    id: r.get(0)?,
                    date: r.get(1)?,
                    sorte: r.get(2)?,
                    montant: r.get(3)?,
                    vers: r.get(4)?,
                    destination: r.get(5)?,
                    note: r.get(6)?,
                    lien: r.get(7)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        c.contributions = conn
            .prepare(
                "SELECT element_id FROM contributions_compte WHERE compte_id = ?1 ORDER BY rowid",
            )?
            .query_map([&c.id], |r| r.get(0))?
            .collect::<Result<Vec<_>, _>>()?;
        c.reserves = conn
            .prepare(
                "SELECT id, nom, sorte, cible, date, frequence_mois, depense_id, arretee_le, transferee_vers, note
                 FROM reserves_compte WHERE compte_id = ?1 ORDER BY rowid",
            )?
            .query_map([&c.id], |r| {
                Ok(ReserveStockee {
                    id: r.get(0)?,
                    nom: r.get(1)?,
                    sorte: r.get(2)?,
                    cible: r.get(3)?,
                    date: r.get(4)?,
                    frequence_mois: r.get(5)?,
                    depense_id: r.get(6)?,
                    arretee_le: r.get(7)?,
                    transferee_vers: r.get(8)?,
                    note: r.get(9)?,
                    suspensions: Vec::new(),
                    mouvements: Vec::new(),
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        for res in &mut c.reserves {
            res.suspensions = conn
                .prepare("SELECT debut, fin FROM suspensions_reserve WHERE reserve_id = ?1 ORDER BY debut")?
                .query_map([&res.id], |r| Ok(SuspensionReserveStockee { debut: r.get(0)?, fin: r.get(1)? }))?
                .collect::<Result<Vec<_>, _>>()?;
            res.mouvements = conn
                .prepare(
                    "SELECT id, date, sorte, montant, vers, lien, note FROM mouvements_reserve
                     WHERE reserve_id = ?1 ORDER BY date, rowid",
                )?
                .query_map([&res.id], |r| {
                    Ok(MouvementReserveStocke {
                        id: r.get(0)?,
                        date: r.get(1)?,
                        sorte: r.get(2)?,
                        montant: r.get(3)?,
                        vers: r.get(4)?,
                        lien: r.get(5)?,
                        note: r.get(6)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;
        }
        let lignes: Vec<(String, String, String, i64)> = conn
            .prepare(
                "SELECT element_id, origine, reserve_id, montant FROM repartitions
                 WHERE compte_id = ?1 ORDER BY rowid",
            )?
            .query_map([&c.id], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        for (e, o, res, montant) in lignes {
            let origine = if o.is_empty() { None } else { Some(o) };
            let part = PartStockee {
                reserve_id: res,
                montant,
            };
            match c
                .repartitions
                .iter_mut()
                .find(|x| x.element_id == e && x.origine == origine)
            {
                Some(x) => x.parts.push(part),
                None => c.repartitions.push(RepartitionStockee {
                    element_id: e,
                    origine,
                    parts: vec![part],
                }),
            }
        }
    }
    Ok(comptes)
}

fn lire_depenses(conn: &rusqlite::Connection) -> Resultat<Vec<DepenseStockee>> {
    let mut depenses = conn
        .prepare("SELECT element_id, note FROM depenses_prevoir ORDER BY rowid")?
        .query_map([], |r| {
            Ok(DepenseStockee {
                id: r.get(0)?,
                note: r.get(1)?,
                modes: Vec::new(),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    for d in &mut depenses {
        d.modes = conn
            .prepare(
                "SELECT origine, mode FROM modes_depense WHERE element_id = ?1 ORDER BY origine",
            )?
            .query_map([&d.id], |r| {
                Ok(ModeDepenseStocke {
                    origine: r.get(0)?,
                    mode: r.get(1)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
    }
    Ok(depenses)
}

fn verifier_taux(t: &str) -> Resultat<()> {
    let (entier, decimales) = t.split_once('.').unwrap_or((t, ""));
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
    Ok(())
}

fn verifier_carte(c: &CarteStocke) -> Resultat<()> {
    if c.id.is_empty() {
        return Err(erreur("Carte sans identifiant."));
    }
    if c.limite.is_some_and(|m| m < 0) {
        return Err(erreur("La limite d'une carte ne peut pas être négative."));
    }
    if let Some(t) = &c.taux {
        verifier_taux(t)?;
    }
    if let Some(o) = &c.objectif {
        if o != "reduireSolde" && o != "payerReleves" {
            return Err(erreur(format!("Objectif inconnu : « {o} ».")));
        }
    }
    let mut dates = std::collections::HashSet::new();
    for r in &c.releves {
        verifier_date(&r.date)?;
        if let Some(e) = &r.echeance {
            verifier_date(e)?;
        }
        if r.solde < 0 || r.minimum.is_some_and(|m| m < 0) {
            return Err(erreur("Un montant de relevé ne peut pas être négatif."));
        }
        if !dates.insert(&r.date) {
            return Err(erreur(format!("Deux relevés à la même date ({}).", r.date)));
        }
    }
    let mut dates = std::collections::HashSet::new();
    for s in &c.soldes {
        verifier_date(&s.date)?;
        if s.montant < 0 {
            return Err(erreur("Un solde ne peut pas être négatif."));
        }
        if !dates.insert(&s.date) {
            return Err(erreur(format!("Deux soldes à la même date ({}).", s.date)));
        }
    }
    let mut libelles = std::collections::HashSet::new();
    for f in &c.frais {
        if f.libelle.trim().is_empty() {
            return Err(erreur("Un frais doit avoir un libellé."));
        }
        if f.montant < 0 {
            return Err(erreur("Un frais ne peut pas être négatif."));
        }
        if f.frequence != "annee" && f.frequence != "mois" {
            return Err(erreur(format!(
                "Fréquence de frais inconnue : « {} ».",
                f.frequence
            )));
        }
        if !libelles.insert(&f.libelle) {
            return Err(erreur(format!("Deux frais nommés « {} ».", f.libelle)));
        }
    }
    let mut ids = std::collections::HashSet::new();
    for s in &c.supplements {
        if s.is_empty() || s == &c.id || !ids.insert(s) {
            return Err(erreur("Paiement supplémentaire invalide."));
        }
    }
    Ok(())
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
        verifier_taux(t)?;
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

fn lire_cartes(conn: &rusqlite::Connection) -> Resultat<Vec<CarteStocke>> {
    let mut req = conn.prepare("SELECT id, limite, taux, objectif FROM cartes ORDER BY id")?;
    let mut cartes = req
        .query_map([], |r| {
            Ok(CarteStocke {
                id: r.get(0)?,
                limite: r.get(1)?,
                taux: r.get(2)?,
                objectif: r.get(3)?,
                releves: Vec::new(),
                soldes: Vec::new(),
                frais: Vec::new(),
                supplements: Vec::new(),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    for c in &mut cartes {
        c.releves = conn
            .prepare("SELECT date, solde, minimum, echeance FROM releves_carte WHERE carte_id = ?1 ORDER BY date")?
            .query_map([&c.id], |r| {
                Ok(ReleveStocke {
                    date: r.get(0)?,
                    solde: r.get(1)?,
                    minimum: r.get(2)?,
                    echeance: r.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        c.soldes = conn
            .prepare(
                "SELECT date, montant, note FROM soldes_carte WHERE carte_id = ?1 ORDER BY date",
            )?
            .query_map([&c.id], |r| {
                Ok(SoldeCarteStocke {
                    date: r.get(0)?,
                    montant: r.get(1)?,
                    note: r.get(2)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        c.frais = conn
            .prepare("SELECT libelle, montant, frequence FROM frais_carte WHERE carte_id = ?1 ORDER BY libelle")?
            .query_map([&c.id], |r| {
                Ok(FraisCarteStocke {
                    libelle: r.get(0)?,
                    montant: r.get(1)?,
                    frequence: r.get(2)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        c.supplements = conn
            .prepare(
                "SELECT element_id FROM paiements_carte WHERE carte_id = ?1 ORDER BY element_id",
            )?
            .query_map([&c.id], |r| r.get(0))?
            .collect::<Result<Vec<_>, _>>()?;
    }
    Ok(cartes)
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
        let cartes = lire_cartes(&self.conn)?;
        let comptes = lire_comptes(&self.conn)?;
        let depenses = lire_depenses(&self.conn)?;
        // Lot 1 : seules les dettes qui existent encore gardent leur rang.
        let priorite_dettes = self
            .parametre(CLE_PRIORITE_DETTES)?
            .and_then(|v| serde_json::from_str::<Vec<String>>(&v).ok())
            .unwrap_or_default()
            .into_iter()
            .filter(|id| prets.iter().any(|p| &p.id == id) || cartes.iter().any(|c| &c.id == id))
            .collect();
        Ok(DonneesPaie {
            profil,
            salaires,
            exceptions,
            seuil,
            elements,
            ajustements,
            confirmations,
            prets,
            cartes,
            comptes,
            depenses,
            priorite_dettes,
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
                ChangementPaie::DefinirPrioriteDettes { ordre } => {
                    if ordre.is_empty() {
                        tx.execute(
                            "DELETE FROM parametres WHERE cle = ?1",
                            [CLE_PRIORITE_DETTES],
                        )?;
                    } else {
                        for id in ordre {
                            let existe: bool = tx.query_row(
                                "SELECT EXISTS(SELECT 1 FROM prets WHERE id = ?1)
                                     OR EXISTS(SELECT 1 FROM cartes WHERE id = ?1)",
                                [id],
                                |r| r.get(0),
                            )?;
                            if !existe {
                                return Err(erreur(format!(
                                    "Priorité : la dette « {id} » n'existe pas."
                                )));
                            }
                        }
                        let valeur =
                            serde_json::to_string(ordre).map_err(|e| erreur(e.to_string()))?;
                        tx.execute(
                            "INSERT INTO parametres (cle, valeur, modifie_le) VALUES (?1, ?2, ?3)
                             ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur, modifie_le = excluded.modifie_le",
                            params![CLE_PRIORITE_DETTES, valeur, maintenant],
                        )?;
                    }
                }
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
                            "Ce versement appartient à un prêt : supprime le prêt depuis Dettes.",
                        ));
                    }
                    let carte: bool = tx.query_row(
                        "SELECT EXISTS (SELECT 1 FROM cartes WHERE id = ?1)
                            OR EXISTS (SELECT 1 FROM paiements_carte WHERE element_id = ?1)",
                        [id],
                        |r| r.get(0),
                    )?;
                    if carte {
                        return Err(erreur(
                            "Ce paiement appartient à la carte : gère-le depuis Dettes.",
                        ));
                    }
                    let contribution: bool = tx.query_row(
                        "SELECT EXISTS (SELECT 1 FROM contributions_compte WHERE element_id = ?1)",
                        [id],
                        |r| r.get(0),
                    )?;
                    if contribution {
                        return Err(erreur(
                            "Cette contribution appartient à un compte : gère-la depuis Épargne.",
                        ));
                    }
                    let depense: bool = tx.query_row(
                        "SELECT EXISTS (SELECT 1 FROM depenses_prevoir WHERE element_id = ?1)",
                        [id],
                        |r| r.get(0),
                    )?;
                    if depense {
                        return Err(erreur("Cette dépense se gère depuis Dépenses."));
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
                ChangementPaie::DefinirCarte { carte: c } => {
                    let depense_fixe = |id: &str| -> Resultat<bool> {
                        let g: Option<(String, String)> = tx
                            .query_row(
                                "SELECT nature, genre FROM elements WHERE id = ?1",
                                [id],
                                |r| Ok((r.get(0)?, r.get(1)?)),
                            )
                            .optional()?;
                        Ok(matches!(
                            g.as_ref().map(|(n, g)| (n.as_str(), g.as_str())),
                            Some(("depense", "fixe"))
                        ))
                    };
                    if !depense_fixe(&c.id)? {
                        return Err(erreur(
                            "L'échéance de la carte doit être une dépense fixe existante.",
                        ));
                    }
                    for s in &c.supplements {
                        if !depense_fixe(s)? {
                            return Err(erreur(
                                "Un paiement supplémentaire doit être une dépense fixe existante.",
                            ));
                        }
                    }
                    // Q55 : une seule carte pour l'instant.
                    let autre: bool = tx.query_row(
                        "SELECT EXISTS (SELECT 1 FROM cartes WHERE id <> ?1)",
                        [&c.id],
                        |r| r.get(0),
                    )?;
                    if autre {
                        return Err(erreur("Une seule carte pour l'instant."));
                    }
                    tx.execute(
                        "INSERT INTO cartes (id, limite, taux, objectif) VALUES (?1, ?2, ?3, ?4)
                         ON CONFLICT(id) DO UPDATE SET limite = excluded.limite,
                           taux = excluded.taux, objectif = excluded.objectif",
                        params![c.id, c.limite, c.taux, c.objectif],
                    )?;
                    tx.execute("DELETE FROM releves_carte WHERE carte_id = ?1", [&c.id])?;
                    for r in &c.releves {
                        tx.execute(
                            "INSERT INTO releves_carte (carte_id, date, solde, minimum, echeance) VALUES (?1, ?2, ?3, ?4, ?5)",
                            params![c.id, r.date, r.solde, r.minimum, r.echeance],
                        )?;
                    }
                    tx.execute("DELETE FROM soldes_carte WHERE carte_id = ?1", [&c.id])?;
                    for s in &c.soldes {
                        tx.execute(
                            "INSERT INTO soldes_carte (carte_id, date, montant, note) VALUES (?1, ?2, ?3, ?4)",
                            params![c.id, s.date, s.montant, s.note],
                        )?;
                    }
                    tx.execute("DELETE FROM frais_carte WHERE carte_id = ?1", [&c.id])?;
                    for f in &c.frais {
                        tx.execute(
                            "INSERT INTO frais_carte (carte_id, libelle, montant, frequence) VALUES (?1, ?2, ?3, ?4)",
                            params![c.id, f.libelle, f.montant, f.frequence],
                        )?;
                    }
                    tx.execute("DELETE FROM paiements_carte WHERE carte_id = ?1", [&c.id])?;
                    for s in &c.supplements {
                        tx.execute(
                            "INSERT INTO paiements_carte (element_id, carte_id) VALUES (?1, ?2)",
                            params![s, c.id],
                        )?;
                    }
                }
                ChangementPaie::SupprimerCarte { id } => {
                    let confirme: bool = tx.query_row(
                        "SELECT EXISTS (SELECT 1 FROM confirmations WHERE element_id = ?1
                            OR element_id IN (SELECT element_id FROM paiements_carte WHERE carte_id = ?1))",
                        [id],
                        |r| r.get(0),
                    )?;
                    if confirme {
                        return Err(erreur(
                            "La carte a des paiements confirmés : elle ne peut pas être supprimée.",
                        ));
                    }
                    // Relevés, soldes, frais et liens partent avec elle ; les
                    // éléments de paiement se suppriment ensuite.
                    tx.execute("DELETE FROM cartes WHERE id = ?1", [id])?;
                }
                ChangementPaie::DefinirCompte { compte: c } => {
                    for e in &c.contributions {
                        let g: Option<(String, String)> = tx
                            .query_row(
                                "SELECT nature, genre FROM elements WHERE id = ?1",
                                [e],
                                |r| Ok((r.get(0)?, r.get(1)?)),
                            )
                            .optional()?;
                        if !matches!(
                            g.as_ref().map(|(n, g)| (n.as_str(), g.as_str())),
                            Some(("depense", "fixe"))
                        ) {
                            return Err(erreur(
                                "Une contribution doit être une dépense fixe existante.",
                            ));
                        }
                    }
                    for m in &c.mouvements {
                        if let Some(v) = &m.vers {
                            let existe: bool = tx.query_row(
                                "SELECT EXISTS (SELECT 1 FROM comptes_epargne WHERE id = ?1)",
                                [v],
                                |r| r.get(0),
                            )?;
                            if !existe {
                                return Err(erreur("Le compte de destination n'existe pas."));
                            }
                        }
                    }
                    tx.execute(
                        "INSERT INTO comptes_epargne (id, sorte, type_libre, nom, vocation, institution, ferme_le)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                         ON CONFLICT(id) DO UPDATE SET sorte = excluded.sorte,
                           type_libre = excluded.type_libre, nom = excluded.nom,
                           vocation = excluded.vocation, institution = excluded.institution,
                           ferme_le = excluded.ferme_le",
                        params![c.id, c.sorte, c.type_libre, c.nom, c.vocation, c.institution, c.ferme_le],
                    )?;
                    tx.execute(
                        "DELETE FROM references_compte WHERE compte_id = ?1",
                        [&c.id],
                    )?;
                    for r in &c.references {
                        tx.execute(
                            "INSERT INTO references_compte (compte_id, date, montant, note) VALUES (?1, ?2, ?3, ?4)",
                            params![c.id, r.date, r.montant, r.note],
                        )?;
                    }
                    tx.execute(
                        "DELETE FROM mouvements_compte WHERE compte_id = ?1",
                        [&c.id],
                    )?;
                    for m in &c.mouvements {
                        tx.execute(
                            "INSERT INTO mouvements_compte (id, compte_id, date, sorte, montant, vers, destination, note, lien)
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                            params![m.id, c.id, m.date, m.sorte, m.montant, m.vers, m.destination, m.note, m.lien],
                        )?;
                    }
                    tx.execute("DELETE FROM reserves_compte WHERE compte_id = ?1", [&c.id])?;
                    for r in &c.reserves {
                        tx.execute(
                            "INSERT INTO reserves_compte (id, compte_id, nom, sorte, cible, date, frequence_mois, depense_id, arretee_le, transferee_vers, note)
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                            params![r.id, c.id, r.nom, r.sorte, r.cible, r.date, r.frequence_mois, r.depense_id, r.arretee_le, r.transferee_vers, r.note],
                        )?;
                        for su in &r.suspensions {
                            tx.execute(
                                "INSERT INTO suspensions_reserve (reserve_id, debut, fin) VALUES (?1, ?2, ?3)",
                                params![r.id, su.debut, su.fin],
                            )?;
                        }
                        for m in &r.mouvements {
                            tx.execute(
                                "INSERT INTO mouvements_reserve (id, reserve_id, date, sorte, montant, vers, lien, note)
                                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                                params![m.id, r.id, m.date, m.sorte, m.montant, m.vers, m.lien, m.note],
                            )?;
                        }
                    }
                    tx.execute("DELETE FROM repartitions WHERE compte_id = ?1", [&c.id])?;
                    for rp in &c.repartitions {
                        for p in &rp.parts {
                            tx.execute(
                                "INSERT INTO repartitions (compte_id, element_id, origine, reserve_id, montant)
                                 VALUES (?1, ?2, ?3, ?4, ?5)",
                                params![c.id, rp.element_id, rp.origine.clone().unwrap_or_default(), p.reserve_id, p.montant],
                            )?;
                        }
                    }
                    tx.execute(
                        "DELETE FROM contributions_compte WHERE compte_id = ?1",
                        [&c.id],
                    )?;
                    for e in &c.contributions {
                        tx.execute(
                            "INSERT INTO contributions_compte (element_id, compte_id) VALUES (?1, ?2)",
                            params![e, c.id],
                        )?;
                    }
                }
                ChangementPaie::DefinirDepense { depense: dp } => {
                    let g: Option<(String, String)> = tx
                        .query_row(
                            "SELECT nature, genre FROM elements WHERE id = ?1",
                            [&dp.id],
                            |r| Ok((r.get(0)?, r.get(1)?)),
                        )
                        .optional()?;
                    if !matches!(
                        g.as_ref().map(|(n, g)| (n.as_str(), g.as_str())),
                        Some(("depense", "fixe"))
                    ) {
                        return Err(erreur(
                            "Une dépense à prévoir doit être une dépense fixe existante.",
                        ));
                    }
                    tx.execute(
                        "INSERT INTO depenses_prevoir (element_id, note) VALUES (?1, ?2)
                         ON CONFLICT(element_id) DO UPDATE SET note = excluded.note",
                        params![dp.id, dp.note],
                    )?;
                    tx.execute("DELETE FROM modes_depense WHERE element_id = ?1", [&dp.id])?;
                    for m in &dp.modes {
                        tx.execute(
                            "INSERT INTO modes_depense (element_id, origine, mode) VALUES (?1, ?2, ?3)",
                            params![dp.id, m.origine, m.mode],
                        )?;
                    }
                }
                ChangementPaie::SupprimerDepense { id } => {
                    tx.execute("DELETE FROM depenses_prevoir WHERE element_id = ?1", [id])?;
                }
                ChangementPaie::SupprimerCompte { id } => {
                    let historique: bool = tx.query_row(
                        "SELECT EXISTS (SELECT 1 FROM confirmations WHERE element_id IN
                              (SELECT element_id FROM contributions_compte WHERE compte_id = ?1))
                            OR EXISTS (SELECT 1 FROM mouvements_compte WHERE compte_id = ?1 OR vers = ?1)",
                        [id],
                        |r| r.get(0),
                    )?;
                    if historique {
                        return Err(erreur("Ce compte a un historique : ferme-le plutôt."));
                    }
                    // Références et liens partent avec lui ; les éléments de
                    // contribution se suppriment ensuite.
                    tx.execute("DELETE FROM comptes_epargne WHERE id = ?1", [id])?;
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
