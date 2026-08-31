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
    let is_macos_mode = settings.bar_position == "macos" || settings.bar_position == "top";
    let effective_margin_top = if is_macos_mode {
        32
    } else if settings.enable_dynamic_island {
        settings.margin_top as i32
    } else {
        0
    };

    let _ = crate::commands::taskbar::update_work_area(
        app,
        Some(settings.enable_dynamic_island),
        Some(effective_margin_top),
        Some(settings.margin_bottom as i32),
        Some(settings.margin_left as i32),
        Some(settings.margin_right as i32),
    );

    // 4. Synchronize Windows Run registry key with startup preference
    services::autostart::sync_autostart(settings.autostart);
}
