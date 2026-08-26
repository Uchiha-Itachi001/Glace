use crate::models::types::PinnedApp;
use crate::services::pinned_apps;

#[tauri::command]
pub fn get_pinned_apps() -> Vec<PinnedApp> {
    pinned_apps::get_pinned_apps()
}

#[tauri::command]
pub fn pin_app(app: PinnedApp) -> Result<(), String> {
    pinned_apps::pin_app(app)
}

#[tauri::command]
pub fn unpin_app(id: String) -> Result<(), String> {
    pinned_apps::unpin_app(&id)
}
