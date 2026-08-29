use crate::services::{flyout_tracker, work_area};
use std::process::Command;
use windows::Win32::UI::Input::KeyboardAndMouse::{keybd_event, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP};

#[tauri::command]
pub fn hide_native_taskbar() {
    work_area::hide_native_taskbar();
}

#[tauri::command]
pub fn restore_native_taskbar() {
    work_area::restore_native_taskbar();
}

#[tauri::command]
pub fn open_start_menu() {
    flyout_tracker::toggle_start_menu();
}

#[tauri::command]
pub fn open_quick_settings() {
    flyout_tracker::toggle_quick_settings();
}

#[tauri::command]
pub fn open_calendar_notifications() {
    flyout_tracker::toggle_calendar_notifications();
}

#[tauri::command]
pub fn open_windows_settings() {
    unsafe {
        // Trigger native Windows Settings via Win + I
        keybd_event(0x5B, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0x49 /* 'I' */, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0x49, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(0x5B, 0, KEYEVENTF_KEYUP, 0);
    }
}

#[tauri::command]
pub fn open_tray_overflow() {
    flyout_tracker::toggle_tray_overflow();
}

#[tauri::command]
pub fn toggle_input_language() {
    unsafe {
        // Trigger native Windows language switcher via Win + Space
        keybd_event(0x5B, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0x20 /* Space */, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0x20, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(0x5B, 0, KEYEVENTF_KEYUP, 0);
    }
}

#[tauri::command]
pub fn open_touch_keyboard() {
    let tabtip_path = "C:\\Program Files\\Common Files\\microsoft shared\\ink\\TabTip.exe";
    if std::path::Path::new(tabtip_path).exists() {
        let _ = Command::new(tabtip_path).spawn();
    } else {
        let _ = Command::new("cmd")
            .args(["/C", "start", "", "tabtip.exe"])
            .spawn();
    }
}

#[tauri::command]
pub fn open_widgets_panel() {
    flyout_tracker::toggle_widgets_panel();
}

#[tauri::command]
pub fn launch_app(cmd: String) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let op: Vec<u16> = "open\0".encode_utf16().collect();
    let file: Vec<u16> = cmd.encode_utf16().chain(std::iter::once(0)).collect();

    unsafe {
        let res = ShellExecuteW(
            None,
            PCWSTR(op.as_ptr()),
            PCWSTR(file.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        );
        // ShellExecute returns HINSTANCE > 32 on success
        if (res.0 as isize) <= 32 {
            let _ = Command::new("cmd")
                .args(["/C", "start", "", &cmd])
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn power_action(action: String) -> Result<(), String> {
    match action.as_str() {
        "lock" => {
            Command::new("rundll32.exe")
                .args(["user32.dll,LockWorkStation"])
                .spawn()
                .map_err(|e| e.to_string())?;
            Ok(())
        }
        "sleep" => {
            Command::new("rundll32.exe")
                .args(["powrprof.dll,SetSuspendState", "0,1,0"])
                .spawn()
                .map_err(|e| e.to_string())?;
            Ok(())
        }
        "restart" => {
            Command::new("shutdown")
                .args(["/r", "/t", "0"])
                .spawn()
                .map_err(|e| e.to_string())?;
            Ok(())
        }
        "shutdown" => {
            Command::new("shutdown")
                .args(["/s", "/t", "0"])
                .spawn()
                .map_err(|e| e.to_string())?;
            Ok(())
        }
        _ => Err("Unknown power action".into()),
    }
}

#[tauri::command]
pub fn update_work_area(
    app: tauri::AppHandle,
    top_notch_enabled: Option<bool>,
    margin_top: Option<i32>,
    margin_bottom: Option<i32>,
    margin_left: Option<i32>,
    margin_right: Option<i32>,
) -> Result<(), String> {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        if let Ok(Some(monitor)) = window.primary_monitor() {
            let size = monitor.size();
            let pos = monitor.position();
            let scale_factor = monitor.scale_factor();

            let top = if let Some(m_top) = margin_top {
                (m_top as f64 * scale_factor).round() as i32
            } else if top_notch_enabled.unwrap_or(true) {
                (32.0 * scale_factor).round() as i32
            } else {
                0
            };

            let bottom = if let Some(m_bottom) = margin_bottom {
                (m_bottom as f64 * scale_factor).round() as i32
            } else {
                (48.0 * scale_factor).round() as i32
            };

            let left = if let Some(m_left) = margin_left {
                (m_left as f64 * scale_factor).round() as i32
            } else {
                0
            };

            let right = if let Some(m_right) = margin_right {
                (m_right as f64 * scale_factor).round() as i32
            } else {
                0
            };

            work_area::reserve_margins(
                top,
                bottom,
                left,
                right,
                pos.x,
                pos.y,
                size.width as i32,
                size.height as i32,
            );
        }
    }
    Ok(())
}
