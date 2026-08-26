use crate::config::settings as cfg;
use crate::models::types::Settings;

#[tauri::command]
pub fn get_settings() -> Settings { cfg::load() }

#[tauri::command]
pub fn save_settings(settings: Settings) { cfg::save(&settings); }
