use crate::models::types::{AppResourceUsage, SystemMetrics, TrayIcon};
use crate::services::tray_host;

#[tauri::command]
pub fn get_tray_icons() -> Vec<TrayIcon> {
    tray_host::get_icons()
}

#[tauri::command]
pub fn get_system_metrics() -> SystemMetrics {
    tray_host::get_system_metrics()
}

#[tauri::command]
pub fn get_app_resource_usage() -> AppResourceUsage {
    tray_host::get_app_resource_usage()
}

