use crate::config::settings as cfg;
use crate::models::types::Settings;
use crate::services;

#[tauri::command]
pub fn get_settings() -> Settings {
    cfg::load()
}

#[tauri::command]
pub fn save_settings(app: tauri::AppHandle, settings: Settings) {
    // 1. Save settings to disk first so all consumers read latest configuration
    cfg::save(&settings);

    // 2. Notify background worker threads of new enable/disable states immediately
    services::bluetooth::set_enabled(settings.enable_dynamic_island && settings.island_show_bluetooth);

    // 3. Apply work area margins and update window click-through regions live
    let _ = crate::commands::taskbar::update_work_area(
        app,
        Some(settings.enable_dynamic_island),
        Some(settings.margin_top as i32),
        Some(settings.margin_bottom as i32),
        Some(settings.margin_left as i32),
        Some(settings.margin_right as i32),
    );
}
