//! Coquille de l'application de bureau : relie l'interface au stockage.
//! Aucune logique financière ici.

use std::sync::Mutex;

use l35_stockage::{ChangementPaie, DonneesPaie, HorlogeSysteme, NouvelleEntree, Profil, Stockage};
use serde::Serialize;
use tauri::Manager;

const NOM_FICHIER: &str = "liberte-35.sqlite";

/// Le stockage ouvert, ou le message expliquant pourquoi il n'a pas pu
/// l'être. L'application démarre dans les deux cas, pour pouvoir
/// afficher le problème au lieu de se fermer sans explication.
struct EtatApp {
    stockage: Mutex<Result<Stockage, String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EtatApplication {
    profil: &'static str,
    version_application: String,
    version_schema: u32,
    dossier_donnees: String,
    integrite_ok: bool,
    nombre_entrees_journal: u64,
}

#[tauri::command]
fn etat_application(
    app: tauri::AppHandle,
    etat: tauri::State<'_, EtatApp>,
) -> Result<EtatApplication, String> {
    let garde = etat
        .stockage
        .lock()
        .map_err(|_| "Stockage indisponible.".to_string())?;
    let stockage = garde.as_ref().map_err(|m| m.clone())?;
    let e = stockage.etat().map_err(|err| err.to_string())?;
    Ok(EtatApplication {
        profil: e.profil.code(),
        version_application: app.package_info().version.to_string(),
        version_schema: e.version_schema,
        dossier_donnees: e
            .chemin
            .parent()
            .map(|p| p.display().to_string())
            .unwrap_or_default(),
        integrite_ok: e.integrite_ok,
        nombre_entrees_journal: e.nombre_entrees_journal,
    })
}

fn avec_stockage<T>(
    etat: &tauri::State<'_, EtatApp>,
    action: impl FnOnce(&mut Stockage) -> Result<T, l35_stockage::ErreurStockage>,
) -> Result<T, String> {
    let mut garde = etat
        .stockage
        .lock()
        .map_err(|_| "Stockage indisponible.".to_string())?;
    let stockage = garde.as_mut().map_err(|m| m.clone())?;
    action(stockage).map_err(|e| e.to_string())
}

#[tauri::command]
fn lire_paie(etat: tauri::State<'_, EtatApp>) -> Result<DonneesPaie, String> {
    avec_stockage(&etat, |s| s.lire_paie())
}

#[tauri::command]
fn appliquer_changements_paie(
    etat: tauri::State<'_, EtatApp>,
    changements: Vec<ChangementPaie>,
    journal: Vec<NouvelleEntree>,
) -> Result<DonneesPaie, String> {
    avec_stockage(&etat, |s| {
        s.appliquer_changements_paie(&changements, &journal)
    })
}

pub fn lancer() {
    tauri::Builder::default()
        .setup(|app| {
            let profil = Profil::depuis_identifiant(&app.config().identifier);
            // Dossier propre à chaque installation (identifiant distinct),
            // dans le dossier utilisateur Windows (AppData\Roaming).
            let ouverture = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Dossier des données introuvable : {e}"))
                .and_then(|dossier| {
                    Stockage::ouvrir(&dossier.join(NOM_FICHIER), profil, Box::new(HorlogeSysteme))
                        .map_err(|e| e.to_string())
                });
            app.manage(EtatApp {
                stockage: Mutex::new(ouverture),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            etat_application,
            lire_paie,
            appliquer_changements_paie
        ])
        .run(tauri::generate_context!())
        .expect("Liberté 35 n'a pas pu démarrer");
}
