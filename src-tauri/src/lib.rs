//! Coquille de l'application de bureau : relie l'interface au stockage.
//! Aucune logique financière ici.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use l35_stockage::{
    ApercuRestauration, ChangementPaie, CopieFaite, DonneesPaie, HorlogeSysteme, ListeDesCopies,
    NouvelleEntree, PageJournal, Profil, ResultatRestauration, ResumeExport, SourceCopie, Stockage,
};
use serde::Serialize;
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

const NOM_FICHIER: &str = "liberte-35.sqlite";

/// Délai de calme avant la copie du jour (décision Q27). L'enregistrement
/// des opérations, lui, reste immédiat.
const DELAI_COPIE: Duration = Duration::from_secs(5);

/// Où en est la copie du jour.
#[derive(Default)]
struct SuiviCopie {
    /// Des changements ne sont pas encore dans la copie du jour.
    en_attente: bool,
    dernier_changement: Option<Instant>,
    derniere_reussie: Option<CopieFaite>,
    erreur: Option<String>,
}

/// Le stockage ouvert, ou le message expliquant pourquoi il n'a pas pu
/// l'être. L'application démarre dans les deux cas, pour pouvoir
/// afficher le problème au lieu de se fermer sans explication.
struct EtatApp {
    stockage: Mutex<Result<Stockage, String>>,
    suivi: Mutex<SuiviCopie>,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EtatSauvegardes {
    derniere_copie: Option<CopieFaite>,
    erreur: Option<String>,
    en_attente: bool,
    copies: ListeDesCopies,
}

/// Envoyé à l'interface après chaque tentative de copie du jour.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AvisCopie {
    reussie: bool,
    erreur: Option<String>,
    /// Premier échec après une réussite : un seul avis est montré.
    nouvel_avis: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportEnregistre {
    chemin: String,
    #[serde(flatten)]
    resume: ResumeExport,
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
    etat: &EtatApp,
    action: impl FnOnce(&mut Stockage) -> Result<T, l35_stockage::ErreurStockage>,
) -> Result<T, String> {
    let mut garde = etat
        .stockage
        .lock()
        .map_err(|_| "Stockage indisponible.".to_string())?;
    let stockage = garde.as_mut().map_err(|m| m.clone())?;
    action(stockage).map_err(|e| e.to_string())
}

/// Des changements viennent d'être enregistrés : la copie du jour suivra.
fn signaler_changement(etat: &EtatApp) {
    if let Ok(mut s) = etat.suivi.lock() {
        s.en_attente = true;
        s.dernier_changement = Some(Instant::now());
    }
}

/// Fait la copie du jour si des changements attendent (après le délai de
/// calme, ou tout de suite à la fermeture).
fn copier_si_en_attente(app: &tauri::AppHandle, sans_delai: bool) {
    let etat = app.state::<EtatApp>();
    let moment = {
        let Ok(s) = etat.suivi.lock() else { return };
        match (s.en_attente, s.dernier_changement) {
            (true, Some(m)) if sans_delai || m.elapsed() >= DELAI_COPIE => m,
            _ => return,
        }
    };
    let resultat = avec_stockage(&etat, |s| s.faire_copie_du_jour());
    let avis = {
        let Ok(mut s) = etat.suivi.lock() else { return };
        // Un changement arrivé pendant la copie attend la suivante.
        if s.dernier_changement == Some(moment) {
            s.en_attente = false;
        }
        match resultat {
            Ok(c) => {
                s.derniere_reussie = Some(c);
                s.erreur = None;
                AvisCopie {
                    reussie: true,
                    erreur: None,
                    nouvel_avis: false,
                }
            }
            Err(e) => {
                let nouvel_avis = s.erreur.is_none();
                s.erreur = Some(e.clone());
                // On réessaiera au prochain changement, pas en boucle.
                s.en_attente = false;
                AvisCopie {
                    reussie: false,
                    erreur: Some(e),
                    nouvel_avis,
                }
            }
        }
    };
    let _ = app.emit("etat-copie", avis);
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
    let donnees = avec_stockage(&etat, |s| {
        s.appliquer_changements_paie(&changements, &journal)
    })?;
    signaler_changement(&etat);
    Ok(donnees)
}

/// Accueil et journal (0.16.0) : une page du journal, en lecture seule.
#[tauri::command]
fn lire_journal(
    etat: tauri::State<'_, EtatApp>,
    avant: Option<i64>,
    limite: u32,
    sections: Vec<String>,
) -> Result<PageJournal, String> {
    avec_stockage(&etat, |s| s.lire_page_journal(avant, limite, &sections))
}

#[tauri::command]
fn etat_sauvegardes(etat: tauri::State<'_, EtatApp>) -> Result<EtatSauvegardes, String> {
    let copies = avec_stockage(&etat, |s| s.lister_copies())?;
    let s = etat
        .suivi
        .lock()
        .map_err(|_| "Suivi indisponible.".to_string())?;
    let derniere_copie = s.derniere_reussie.clone().or_else(|| {
        copies
            .copies_du_jour
            .iter()
            .find(|c| c.lisible)
            .map(|c| CopieFaite {
                nom: c.nom.clone(),
                jour: c.jour.clone().unwrap_or_default(),
                horodatage: c.horodatage.clone(),
            })
    });
    Ok(EtatSauvegardes {
        derniere_copie,
        erreur: s.erreur.clone(),
        en_attente: s.en_attente,
        copies,
    })
}

#[tauri::command]
fn apercu_restauration(
    etat: tauri::State<'_, EtatApp>,
    source: SourceCopie,
) -> Result<ApercuRestauration, String> {
    avec_stockage(&etat, |s| s.apercu_restauration(&source))
}

/// Fenêtre « Ouvrir » de Windows, puis aperçu de la copie choisie.
/// `None` : la fenêtre a été fermée sans choisir.
#[tauri::command]
async fn choisir_fichier_copie(
    app: tauri::AppHandle,
    etat: tauri::State<'_, EtatApp>,
) -> Result<Option<ApercuRestauration>, String> {
    let choix = app
        .dialog()
        .file()
        .set_title("Restaurer depuis un fichier")
        .add_filter("Copie de Liberté 35", &["sqlite"])
        .add_filter("Tous les fichiers", &["*"])
        .blocking_pick_file();
    let Some(choix) = choix else { return Ok(None) };
    let chemin = choix
        .into_path()
        .map_err(|e| format!("Ce fichier ne peut pas être ouvert ({e})."))?;
    let source = SourceCopie::Fichier {
        chemin: chemin.display().to_string(),
    };
    avec_stockage(&etat, |s| s.apercu_restauration(&source)).map(Some)
}

#[tauri::command]
fn restaurer(
    etat: tauri::State<'_, EtatApp>,
    source: SourceCopie,
) -> Result<ResultatRestauration, String> {
    let r = avec_stockage(&etat, |s| s.restaurer(&source))?;
    signaler_changement(&etat);
    Ok(r)
}

/// Fenêtre « Enregistrer sous » de Windows (Documents par défaut, ou une
/// clé USB, un dossier Google Drive…), puis export. `None` : annulé.
#[tauri::command]
async fn exporter_donnees(
    app: tauri::AppHandle,
    etat: tauri::State<'_, EtatApp>,
) -> Result<Option<ExportEnregistre>, String> {
    let nom = avec_stockage(&etat, |s| Ok(s.nom_export_propose()))?;
    let mut fenetre = app
        .dialog()
        .file()
        .set_title("Exporter mes données")
        .set_file_name(&nom)
        .add_filter("Export Liberté 35 (.zip)", &["zip"]);
    if let Ok(documents) = app.path().document_dir() {
        fenetre = fenetre.set_directory(documents);
    }
    let Some(choix) = fenetre.blocking_save_file() else {
        return Ok(None);
    };
    let mut chemin = choix
        .into_path()
        .map_err(|e| format!("Cet emplacement ne peut pas être utilisé ({e})."))?;
    let est_zip = chemin
        .extension()
        .map(|x| x.eq_ignore_ascii_case("zip"))
        .unwrap_or(false);
    if !est_zip {
        let mut n = chemin
            .file_name()
            .map(|n| n.to_os_string())
            .unwrap_or_default();
        n.push(".zip");
        chemin.set_file_name(n);
    }
    let version = app.package_info().version.to_string();
    let resume = avec_stockage(&etat, |s| s.exporter(&chemin, &version))?;
    Ok(Some(ExportEnregistre {
        chemin: chemin.display().to_string(),
        resume,
    }))
}

pub fn lancer() {
    let application = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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
                suivi: Mutex::new(SuiviCopie::default()),
            });
            // La copie du jour se fait à part, quelques secondes après le
            // dernier changement : l'utilisation n'attend jamais.
            let poignee = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(1));
                copier_si_en_attente(&poignee, false);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            etat_application,
            lire_paie,
            lire_journal,
            appliquer_changements_paie,
            etat_sauvegardes,
            apercu_restauration,
            choisir_fichier_copie,
            restaurer,
            exporter_donnees
        ])
        .build(tauri::generate_context!())
        .expect("Liberté 35 n'a pas pu démarrer");
    application.run(|app, evenement| {
        // À la fermeture : copie des changements pas encore copiés (Q27).
        if let tauri::RunEvent::Exit = evenement {
            copier_si_en_attente(app, true);
        }
    });
}
