//! Configuration guidée (0.22.0) : où en est le guide de première
//! utilisation. Un simple réglage d'affichage, gardé dans la table
//! `parametres` (aucun changement de schéma) : il ne touche à aucune donnée
//! financière, d'où l'absence d'entrée au journal. Les données saisies dans
//! le guide passent, elles, par les changements de paie habituels.

use serde::{Deserialize, Serialize};

use crate::{ErreurStockage, Resultat, Stockage};

const CLE_CONFIGURATION_GUIDEE: &str = "configuration_guidee";

/// Statuts permis : le guide est commencé (ou mis en pause), terminé, ou
/// son invitation a été retirée de l'Accueil (il reste dans Paramètres).
const STATUTS: [&str; 3] = ["enCours", "terminee", "masquee"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigurationGuidee {
    pub statut: String,
    /// Dernière étape ouverte, de 1 (Bienvenue) à 6 (Récapitulatif).
    pub etape: u8,
}

fn verifier(c: &ConfigurationGuidee) -> Resultat<()> {
    if !STATUTS.contains(&c.statut.as_str()) {
        return Err(ErreurStockage::DonneeInvalide(format!(
            "Statut de configuration guidée inconnu : « {} ».",
            c.statut
        )));
    }
    if !(1..=6).contains(&c.etape) {
        return Err(ErreurStockage::DonneeInvalide(
            "L'étape de la configuration guidée va de 1 à 6.".to_string(),
        ));
    }
    Ok(())
}

impl Stockage {
    /// Absent : le guide n'a jamais été ouvert ni écarté. Une valeur
    /// illisible compte comme absente : elle ne bloque jamais l'application.
    pub fn lire_configuration_guidee(&self) -> Resultat<Option<ConfigurationGuidee>> {
        Ok(self
            .parametre(CLE_CONFIGURATION_GUIDEE)?
            .and_then(|v| serde_json::from_str::<ConfigurationGuidee>(&v).ok())
            .filter(|c| verifier(c).is_ok()))
    }

    pub fn definir_configuration_guidee(&mut self, c: &ConfigurationGuidee) -> Resultat<()> {
        verifier(c)?;
        let valeur =
            serde_json::to_string(c).map_err(|e| ErreurStockage::DonneeInvalide(e.to_string()))?;
        self.definir_parametre(CLE_CONFIGURATION_GUIDEE, &valeur)
    }
}
