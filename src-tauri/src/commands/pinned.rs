use crate::models::types::PinnedApp;
use crate::services::pinned_apps;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub fn get_pinned_apps() -> Vec<PinnedApp> {
    pinned_apps::get_pinned_apps()
}

#[tauri::command]
pub fn pin_app(app_handle: AppHandle, app: PinnedApp) -> Result<(), String> {
    pinned_apps::pin_app(app)?;
    let pins = pinned_apps::get_pinned_apps();
    let _ = app_handle.emit("pinned-apps-updated", &pins);
    Ok(())
}

#[tauri::command]
pub fn unpin_app(app_handle: AppHandle, id: String) -> Result<(), String> {
    pinned_apps::unpin_app(&id)?;
    let pins = pinned_apps::get_pinned_apps();
    let _ = app_handle.emit("pinned-apps-updated", &pins);
    Ok(())
}
