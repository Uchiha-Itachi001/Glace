use crate::models::types::WindowInfo;
use crate::services::window_watcher;

#[tauri::command]
pub fn get_open_windows() -> Vec<WindowInfo> {
    window_watcher::enumerate_windows()
}

#[tauri::command]
pub fn focus_window(hwnd: u64) {
    window_watcher::focus_window(hwnd);
}

#[tauri::command]
pub fn minimize_window(hwnd: u64) {
    window_watcher::minimize_window(hwnd);
}

#[tauri::command]
pub fn close_window(hwnd: u64) {
    window_watcher::close_window(hwnd);
}

#[tauri::command]
pub fn snap_window(hwnd: u64, position: String) {
    window_watcher::snap_window(hwnd, &position);
}

#[tauri::command]
pub fn set_window_height(
    app: tauri::AppHandle,
    expanded: bool,
    height_px: Option<i32>,
) -> Result<(), String> {
    use tauri::Manager;

    if let Some(window) = app.get_webview_window("main") {
        if let Ok(Some(monitor)) = window.primary_monitor() {
            let size = monitor.size();
            let scale_factor = monitor.scale_factor();
            let bar_height_physical = (48.0 * scale_factor).round() as i32;
            let flyout_h_physical = (height_px.unwrap_or(520) as f64 * scale_factor).round() as i32;
            let flyout_w_physical = (600.0 * scale_factor).round() as i32;

            if let Ok(hwnd) = window.hwnd() {
                let win32_hwnd = windows::Win32::Foundation::HWND(hwnd.0 as _);
                crate::services::work_area::update_window_region(
                    win32_hwnd,
                    size.width as i32,
                    size.height as i32,
                    bar_height_physical,
                    expanded,
                    flyout_w_physical,
                    flyout_h_physical,
                );
            }
        }
    }
    Ok(())
}
