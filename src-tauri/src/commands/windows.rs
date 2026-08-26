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
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_SHOWWINDOW,
    };

    if let Some(window) = app.get_webview_window("main") {
        if let Ok(Some(monitor)) = window.primary_monitor() {
            let size = monitor.size();
            let pos = monitor.position();
            let scale_factor = monitor.scale_factor();

            let target_h_logical = if expanded {
                height_px.unwrap_or(600) as f64
            } else {
                48.0
            };
            let target_h_physical = (target_h_logical * scale_factor).round() as i32;
            let target_y = pos.y + (size.height as i32) - target_h_physical;

            if let Ok(hwnd) = window.hwnd() {
                let win32_hwnd = windows::Win32::Foundation::HWND(hwnd.0 as _);
                unsafe {
                    let _ = SetWindowPos(
                        win32_hwnd,
                        Some(HWND_TOPMOST),
                        pos.x,
                        target_y,
                        size.width as i32,
                        target_h_physical,
                        SWP_NOACTIVATE | SWP_SHOWWINDOW,
                    );
                }
            }
        }
    }
    Ok(())
}
