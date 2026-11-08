//! L'heure est fournie de l'extérieur : en production par l'horloge du
//! système, dans les tests par une horloge fixe. Les résultats sont ainsi
//! reproductibles (architecture, section 5).

use std::time::{SystemTime, UNIX_EPOCH};

pub trait Horloge: Send {
    /// Horodatage UTC au format ISO 8601, par exemple `2026-11-08T14:05:09Z`.
    fn maintenant(&self) -> String;

    /// Jour civil local (`AAAA-MM-JJ`), pour nommer la copie du jour.
    /// Par défaut, le jour de l'horodatage (les horloges de test).
    fn jour_local(&self) -> String {
        self.maintenant().chars().take(10).collect()
    }
}

/// Horloge réelle du système.
pub struct HorlogeSysteme;

impl Horloge for HorlogeSysteme {
    fn maintenant(&self) -> String {
        let secondes = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        formater_utc(secondes)
    }

    fn jour_local(&self) -> String {
        // Le soir à Montréal, le jour UTC est déjà le lendemain : on prend
        // le jour du fuseau réglé dans Windows.
        chrono::Local::now().format("%Y-%m-%d").to_string()
    }
}

/// Horloge figée, pour les tests.
pub struct HorlogeFixe(pub String);

impl Horloge for HorlogeFixe {
    fn maintenant(&self) -> String {
        self.0.clone()
    }
}

/// Convertit des secondes depuis le 1er janvier 1970 (UTC) en texte ISO 8601.
/// Algorithme « civil from days » de Howard Hinnant, sans dépendance externe.
pub fn formater_utc(secondes: i64) -> String {
    let jours = secondes.div_euclid(86_400);
    let reste = secondes.rem_euclid(86_400);
    let (h, m, s) = (reste / 3600, (reste % 3600) / 60, reste % 60);

    let z = jours + 719_468;
    let ere = z.div_euclid(146_097);
    let jde = z.rem_euclid(146_097);
    let ade = (jde - jde / 1460 + jde / 36_524 - jde / 146_096) / 365;
    let a = ade + ere * 400;
    let jda = jde - (365 * ade + ade / 4 - ade / 100);
    let mp = (5 * jda + 2) / 153;
    let jour = jda - (153 * mp + 2) / 5 + 1;
    let mois = if mp < 10 { mp + 3 } else { mp - 9 };
    let annee = if mois <= 2 { a + 1 } else { a };

    format!("{annee:04}-{mois:02}-{jour:02}T{h:02}:{m:02}:{s:02}Z")
}

#[cfg(test)]
mod tests {
    use super::formater_utc;

    #[test]
    fn epoque_unix() {
        assert_eq!(formater_utc(0), "1970-01-01T00:00:00Z");
    }

    #[test]
    fn jour_bissextile_et_fin_de_mois() {
        // 29 février 2028, 23 h 59 min 59 s
        assert_eq!(formater_utc(1_835_481_599), "2028-02-29T23:59:59Z");
        // 1er mars 2028, minuit
        assert_eq!(formater_utc(1_835_481_600), "2028-03-01T00:00:00Z");
    }

    #[test]
    fn date_courante_connue() {
        assert_eq!(formater_utc(1_794_146_709), "2026-11-08T14:05:09Z");
    }
}
