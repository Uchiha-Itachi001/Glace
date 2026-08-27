use crate::services::work_area;
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

use windows::core::PCWSTR;
use windows::Win32::UI::WindowsAndMessaging::{FindWindowW, IsWindowVisible};

fn is_native_flyout_visible(class_name: &str) -> bool {
    let wide: Vec<u16> = class_name.encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        if let Ok(hwnd) = FindWindowW(PCWSTR(wide.as_ptr()), PCWSTR::null()) {
            if !hwnd.0.is_null() && IsWindowVisible(hwnd).as_bool() {
                return true;
            }
        }
        false
    }
}

#[tauri::command]
pub fn open_start_menu() {
    unsafe {
        // If Start Menu or LightDismiss overlay is already visible, clicking was intended to close it
        if is_native_flyout_visible("Windows.UI.Core.AppFrameWindow")
            || is_native_flyout_visible("Shell_LightDismissOverlayWindow")
        {
            return;
        }

        // Trigger native Windows Start Menu via VK_LWIN (0x5B)
        keybd_event(0x5B, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0x5B, 0, KEYEVENTF_KEYUP, 0);
    }
}

#[tauri::command]
pub fn open_quick_settings() {
    unsafe {
        if is_native_flyout_visible("ControlCenterWindow")
            || is_native_flyout_visible("Shell_LightDismissOverlayWindow")
        {
            return;
        }

        // Trigger native Windows Quick Settings / Action Center via Win + A
        keybd_event(0x5B, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0x41 /* 'A' */, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0x41, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(0x5B, 0, KEYEVENTF_KEYUP, 0);
    }
}

#[tauri::command]
pub fn open_calendar_notifications() {
    unsafe {
        if is_native_flyout_visible("NotificationCenterWindow")
            || is_native_flyout_visible("Shell_LightDismissOverlayWindow")
        {
            return;
        }

        // Trigger native Windows Calendar & Notification Center via Win + N
        keybd_event(0x5B, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0x4E /* 'N' */, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0x4E, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(0x5B, 0, KEYEVENTF_KEYUP, 0);
    }
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
    unsafe {
        if is_native_flyout_visible("TopLevelWindowForOverflowXamlIsland")
            || is_native_flyout_visible("NotifyIconOverflowWindow")
        {
            return;
        }

        // Trigger native Windows Notification Area overflow via Win + B, Enter
        keybd_event(0x5B, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0x42 /* 'B' */, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0x42, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(0x5B, 0, KEYEVENTF_KEYUP, 0);

        std::thread::sleep(std::time::Duration::from_millis(50));
        keybd_event(0x0D /* VK_RETURN */, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0x0D, 0, KEYEVENTF_KEYUP, 0);
    }
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
    let _ = Command::new("cmd")
        .args(["/C", "start", "", "tabtip.exe"])
        .spawn();
}

#[tauri::command]
pub fn open_widgets_panel() {
    unsafe {
        // Trigger native Windows Copilot / Widgets via Win + W
        keybd_event(0x5B, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0x57 /* 'W' */, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0x57, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(0x5B, 0, KEYEVENTF_KEYUP, 0);
    }
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
    top_notch_enabled: bool,
) -> Result<(), String> {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        if let Ok(Some(monitor)) = window.primary_monitor() {
            let size = monitor.size();
            let scale_factor = monitor.scale_factor();
            let bar_height_physical = (48.0 * scale_factor).round() as i32;
            let top_notch_physical = if top_notch_enabled {
                (28.0 * scale_factor).round() as i32
            } else {
                0
            };
            work_area::reserve(
                top_notch_physical,
                bar_height_physical,
                size.height as i32,
                size.width as i32,
            );
        }
    }
    Ok(())
}
