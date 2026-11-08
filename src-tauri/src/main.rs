// Sous Windows, pas de fenêtre de console en plus de l'application.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    liberte_35_lib::lancer()
}
