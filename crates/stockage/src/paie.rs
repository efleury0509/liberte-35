//! Données de paie : profil, changements de salaire, exceptions, seuil
//! d'attention. Chaque changement est enregistré avec ses entrées de
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DonneesPaie {
    pub profil: Option<ProfilPaieStocke>,
    pub salaires: Vec<SalaireStocke>,
    pub exceptions: Vec<ExceptionStockee>,
    pub seuil: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ChangementPaie {
    DefinirProfil { profil: ProfilPaieStocke },
    DefinirSalaire { salaire: SalaireStocke },
    RetirerSalaire { a_partir_du: String },
    DefinirException { exception: ExceptionStockee },
    RetirerException { date_origine: String },
    DefinirSeuil { seuil: Option<i64> },
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
    }
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
        Ok(DonneesPaie {
            profil,
            salaires,
            exceptions,
            seuil,
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
