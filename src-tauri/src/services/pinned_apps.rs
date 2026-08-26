use std::fs;
use std::path::PathBuf;
use windows::core::PCWSTR;
use windows::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};
use windows::Win32::UI::WindowsAndMessaging::DestroyIcon;

use crate::config::settings;
use crate::models::types::PinnedApp;
use crate::services::window_watcher::hicon_to_base64_bmp;

/// Extract high-res icon from a .lnk or .exe file path and encode as base64 BMP data URL
pub fn extract_icon_from_path(path: &str) -> String {
    unsafe {
        let path_w: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
        let mut shfi = SHFILEINFOW::default();
        let res = SHGetFileInfoW(
            PCWSTR(path_w.as_ptr()),
            Default::default(),
            Some(&mut shfi),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        );
        if res != 0 && !shfi.hIcon.0.is_null() {
            let b64 = hicon_to_base64_bmp(shfi.hIcon);
            let _ = DestroyIcon(shfi.hIcon);
            if let Some(b64) = b64 {
                return b64;
            }
        }
    }
    String::new()
}

/// Infers the expected .exe process name from the shortcut title or file name
fn infer_exe_name_from_title(title: &str) -> String {
    let lower = title.to_lowercase();
    if lower.contains("chrome") {
        "chrome.exe".into()
    } else if lower.contains("edge") {
        "msedge.exe".into()
    } else if lower.contains("brave") {
        "brave.exe".into()
    } else if lower.contains("code - insiders") {
        "Code - Insiders.exe".into()
    } else if lower.contains("code") || lower.contains("vs code") || lower.contains("visual studio code") {
        "Code.exe".into()
    } else if lower.contains("telegram") {
        "Telegram.exe".into()
    } else if lower.contains("android studio") {
        "studio64.exe".into()
    } else if lower.contains("antigravity") {
        "Antigravity.exe".into()
    } else if lower.contains("terminal") {
        "WindowsTerminal.exe".into()
    } else if lower.contains("explorer") || lower.contains("files") {
        "explorer.exe".into()
    } else if lower.contains("youtube music") {
        "YouTube Music.exe".into()
    } else if lower.contains("spotify") {
        "Spotify.exe".into()
    } else if lower.contains("discord") {
        "Discord.exe".into()
    } else if lower.contains("slack") {
        "slack.exe".into()
    } else if lower.contains("perplexity") {
        "Perplexity.exe".into()
    } else if lower.contains("notepad") {
        "notepad.exe".into()
    } else if lower.contains("calculator") {
        "CalculatorApp.exe".into()
    } else if lower.contains("task manager") {
        "Taskmgr.exe".into()
    } else {
        format!("{}.exe", title.replace(' ', ""))
    }
}

/// Scans the native Windows Taskbar user-pinned shortcuts directory
pub fn scan_windows_taskbar_pins() -> Vec<PinnedApp> {
    let mut pinned = Vec::new();
    let app_data = std::env::var("APPDATA").unwrap_or_default();
    if app_data.is_empty() {
        return pinned;
    }

    let taskbar_dir = PathBuf::from(app_data)
        .join("Microsoft")
        .join("Internet Explorer")
        .join("Quick Launch")
        .join("User Pinned")
        .join("TaskBar");

    if let Ok(entries) = fs::read_dir(&taskbar_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext.to_string_lossy().eq_ignore_ascii_case("lnk") {
                        let file_stem = path
                            .file_stem()
                            .map(|s| s.to_string_lossy().to_string())
                            .unwrap_or_default();

                        if file_stem.eq_ignore_ascii_case("Tombstones") {
                            continue;
                        }

                        let lnk_path = path.to_string_lossy().to_string();
                        let icon_b64 = extract_icon_from_path(&lnk_path);
                        let exe = infer_exe_name_from_title(&file_stem);
                        let id = file_stem
                            .to_lowercase()
                            .chars()
                            .map(|c| if c.is_alphanumeric() { c } else { '-' })
                            .collect::<String>();

                        pinned.push(PinnedApp {
                            id,
                            title: file_stem,
                            exe,
                            lnk_path,
                            icon_b64,
                        });
                    }
                }
            }
        }
    }

    pinned
}

/// Returns the currently active list of pinned apps.
/// Always re-scans Windows TaskBar pins so newly pinned apps appear automatically.
pub fn get_pinned_apps() -> Vec<PinnedApp> {
    let mut cfg = settings::load();

    // Always re-scan native Windows TaskBar pins
    let mut scanned = scan_windows_taskbar_pins();

    // Merge: for each Windows pin, check if we have a saved user customization
    // (user may have re-ordered or added extra icon_b64 override)
    for scanned_app in &mut scanned {
        if let Some(saved) = cfg
            .pinned_apps
            .iter()
            .find(|p| p.id == scanned_app.id || p.exe.eq_ignore_ascii_case(&scanned_app.exe))
        {
            // Preserve custom icon override if any
            if !saved.icon_b64.is_empty() && !saved.icon_b64.starts_with("data:image/png") {
                // saved icon was old BMP, prefer freshly scanned PNG
            } else if !saved.icon_b64.is_empty() {
                scanned_app.icon_b64 = saved.icon_b64.clone();
            }
        }
    }

    // Append any extra user-added pins that aren't Windows shortcuts
    for saved in &cfg.pinned_apps {
        let already_present = scanned.iter().any(|s| {
            s.id == saved.id || s.exe.eq_ignore_ascii_case(&saved.exe)
        });
        if !already_present {
            scanned.push(saved.clone());
        }
    }

    // Persist the merged list
    cfg.pinned_apps = scanned.clone();
    settings::save(&cfg);

    scanned
}


/// Pins an application to Glace taskbar
pub fn pin_app(app: PinnedApp) -> Result<(), String> {
    let mut cfg = settings::load();
    // Check if already pinned by id or exe
    if let Some(existing) = cfg.pinned_apps.iter_mut().find(|p| p.id == app.id || (!app.exe.is_empty() && p.exe.eq_ignore_ascii_case(&app.exe))) {
        *existing = app;
    } else {
        cfg.pinned_apps.push(app);
    }
    settings::save(&cfg);
    Ok(())
}

/// Unpins an application from Glace taskbar
pub fn unpin_app(id_or_exe: &str) -> Result<(), String> {
    let mut cfg = settings::load();
    cfg.pinned_apps.retain(|p| {
        p.id != id_or_exe && !p.exe.eq_ignore_ascii_case(id_or_exe) && !p.title.eq_ignore_ascii_case(id_or_exe)
    });
    settings::save(&cfg);
    Ok(())
}
