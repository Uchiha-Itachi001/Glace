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

#[tauri::command]
pub fn open_start_menu() {
    unsafe {
        // Trigger native Windows Start Menu via VK_LWIN (0x5B)
        keybd_event(0x5B, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0x5B, 0, KEYEVENTF_KEYUP, 0);
    }
}

#[tauri::command]
pub fn open_quick_settings() {
    unsafe {
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
pub fn launch_app(cmd: String) -> Result<(), String> {
    Command::new("cmd")
        .args(["/C", "start", "", &cmd])
        .spawn()
        .map_err(|e| e.to_string())?;
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
