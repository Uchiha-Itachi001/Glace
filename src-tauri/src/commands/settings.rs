use crate::config::settings as cfg;
use crate::models::types::Settings;
use crate::services;

#[tauri::command]
pub fn get_settings() -> Settings {
    cfg::load()
}

#[tauri::command]
pub fn save_settings(settings: Settings) {
    // Notify background worker threads of new enable/disable states immediately
    services::bluetooth::set_enabled(settings.enable_dynamic_island && settings.island_show_bluetooth);
    cfg::save(&settings);
}
