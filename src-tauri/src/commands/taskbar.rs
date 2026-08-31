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
pub fn quit_app(app_handle: tauri::AppHandle) {
    work_area::restore_native_taskbar();
    work_area::restore(0, 0);
    app_handle.exit(0);
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
pub fn is_tray_overflow_open() -> bool {
    flyout_tracker::is_flyout_currently_open(flyout_tracker::FlyoutKind::TrayOverflow)
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct KeyboardLayoutInfo {
    pub lang: String,
    pub country: String,
}

pub fn get_keyboard_layout_info() -> KeyboardLayoutInfo {
    unsafe {
        use windows::Win32::UI::Input::KeyboardAndMouse::GetKeyboardLayout;
        use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

        let fg = GetForegroundWindow();
        let thread_id = if !fg.0.is_null() {
            GetWindowThreadProcessId(fg, None)
        } else {
            0
        };

        let hkl = GetKeyboardLayout(thread_id);
        let lang_id = (hkl.0 as usize & 0xFFFF) as u16;

        let (lang, country) = match lang_id {
            0x0409 => ("ENG", "US"),
            0x4009 => ("ENG", "IN"),
            0x0809 => ("ENG", "GB"),
            0x0c09 => ("ENG", "AU"),
            0x1009 => ("ENG", "CA"),
            0x040c => ("FRA", "FR"),
            0x080c => ("FRA", "BE"),
            0x0c0c => ("FRA", "CA"),
            0x0407 => ("DEU", "DE"),
            0x0807 => ("DEU", "CH"),
            0x040a => ("ESP", "ES"),
            0x080a => ("ESP", "MX"),
            0x0411 => ("JPN", "JP"),
            0x0412 => ("KOR", "KR"),
            0x0419 => ("RUS", "RU"),
            0x0804 => ("CHS", "CN"),
            0x0404 => ("CHT", "TW"),
            0x0416 => ("POR", "BR"),
            0x0816 => ("POR", "PT"),
            0x0410 => ("ITA", "IT"),
            0x041f => ("TUR", "TR"),
            0x0401 => ("ARA", "SA"),
            0x0439 => ("HIN", "IN"),
            0x0445 => ("BEN", "BD"),
            0x044e => ("MAR", "IN"),
            0x0447 => ("GUJ", "IN"),
            0x0449 => ("TAM", "IN"),
            0x044a => ("TEL", "IN"),
            0x044b => ("KAN", "IN"),
            0x044c => ("MAL", "IN"),
            0x0446 => ("PAN", "IN"),
            0x0420 => ("URD", "PK"),
            0x041e => ("THA", "TH"),
            0x042a => ("VIE", "VN"),
            0x0421 => ("IND", "ID"),
            0x040e => ("HUN", "HU"),
            0x0415 => ("POL", "PL"),
            0x0405 => ("CSY", "CZ"),
            0x0413 => ("NLD", "NL"),
            0x041d => ("SVE", "SE"),
            0x0414 => ("NOR", "NO"),
            0x0406 => ("DAN", "DK"),
            0x040b => ("FIN", "FI"),
            0x0408 => ("ELL", "GR"),
            0x040d => ("HEB", "IL"),
            _ => ("ENG", "IN"),
        };

        KeyboardLayoutInfo {
            lang: lang.to_string(),
            country: country.to_string(),
        }
    }
}

#[tauri::command]
pub fn get_current_keyboard_layout() -> KeyboardLayoutInfo {
    get_keyboard_layout_info()
}

#[tauri::command]
pub fn toggle_input_language() {
    unsafe {
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            keybd_event, ActivateKeyboardLayout, ACTIVATE_KEYBOARD_LAYOUT_FLAGS, HKL,
            KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
        };
        use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, PostMessageW};

        // 1. Cycle keyboard layout in Windows system thread (HKL_NEXT is 1)
        let _ = ActivateKeyboardLayout(HKL(1 as *mut _), ACTIVATE_KEYBOARD_LAYOUT_FLAGS(0));

        // 2. Broadcast language change request to active focused window
        let fg = GetForegroundWindow();
        if !fg.0.is_null() {
            let _ = PostMessageW(
                Some(fg),
                0x0050, /* WM_INPUTLANGCHANGEREQUEST */
                windows::Win32::Foundation::WPARAM(0x0002 /* INPUTLANGCHANGE_FORWARD */),
                windows::Win32::Foundation::LPARAM(0),
            );
        }

        // 3. Trigger native Windows Shell Input Switcher overlay (Win + Space)
        keybd_event(0x5B /* VK_LWIN */, 0x5B, KEYBD_EVENT_FLAGS(0), 0);
        std::thread::sleep(std::time::Duration::from_millis(25));
        keybd_event(0x20 /* VK_SPACE */, 0x39, KEYBD_EVENT_FLAGS(0), 0);
        std::thread::sleep(std::time::Duration::from_millis(40));
        keybd_event(0x20 /* VK_SPACE */, 0x39, KEYEVENTF_KEYUP, 0);
        std::thread::sleep(std::time::Duration::from_millis(25));
        keybd_event(0x5B /* VK_LWIN */, 0x5B, KEYEVENTF_KEYUP, 0);
    }
}

#[tauri::command]
pub fn open_touch_keyboard() {
    use std::os::windows::process::CommandExt;

    // 1. Official Windows 11 UIHostNoLaunch COM invocation (isolated process, 100% crash-proof)
    let _ = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            r#"$code = @'
using System;
using System.Runtime.InteropServices;
public class TKH {
    [ComImport, Guid("4ce576fa-83dc-4f88-951c-9d0782b4e376")]
    private class UIHostNoLaunch { }
    [ComImport, Guid("37c994e7-432b-4834-a2f7-dce1f13b834b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface ITipInvocation { void Toggle(IntPtr hwnd); }
    [DllImport("user32.dll")]
    private static extern IntPtr GetDesktopWindow();
    public static void Toggle() {
        try {
            var ui = new UIHostNoLaunch();
            ((ITipInvocation)ui).Toggle(GetDesktopWindow());
            Marshal.ReleaseComObject(ui);
        } catch { }
    }
}
'@; Add-Type -TypeDefinition $code -Language CSharp; [TKH]::Toggle()"#,
        ])
        .creation_flags(0x08000000 /* CREATE_NO_WINDOW */)
        .spawn();

    // 2. Immediate fallback to standard TabTip.exe shell activator
    let _ = Command::new("cmd")
        .args(["/C", "start", "", "tabtip.exe"])
        .creation_flags(0x08000000 /* CREATE_NO_WINDOW */)
        .spawn();
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
