use std::path::PathBuf;
use super::helpers::BROWSER_EXES;

/// Locate ChatGPT Desktop executable on Windows
pub fn get_chatgpt_desktop_exe() -> Option<PathBuf> {
    if let Some(local) = dirs::data_local_dir() {
        let p1 = local.join("Programs").join("ChatGPT").join("ChatGPT.exe");
        if p1.exists() { return Some(p1); }
        let p2 = local.join("ChatGPT").join("ChatGPT.exe");
        if p2.exists() { return Some(p2); }
        let p3 = local.join("Microsoft").join("WindowsApps").join("ChatGPT.exe");
        if p3.exists() { return Some(p3); }
    }
    let pf = PathBuf::from("C:\\Program Files\\ChatGPT\\ChatGPT.exe");
    if pf.exists() { return Some(pf); }
    None
}

/// Checks if ChatGPT Desktop is installed on the machine
pub fn is_chatgpt_desktop_installed() -> bool {
    if get_chatgpt_desktop_exe().is_some() {
        return true;
    }
    if let Some(local) = dirs::data_local_dir() {
        if local.join("OpenAI").join("ChatGPT").exists() || local.join("ChatGPT").exists() {
            return true;
        }
        let packages_dir = local.join("Packages");
        if packages_dir.is_dir() {
            if let Ok(entries) = std::fs::read_dir(packages_dir) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.starts_with("OpenAI.ChatGPT-Desktop") {
                        return true;
                    }
                }
            }
        }
    }
    if let Some(appdata) = dirs::data_dir() {
        if appdata.join("OpenAI").join("ChatGPT").exists() || appdata.join("ChatGPT").exists() {
            return true;
        }
    }
    false
}

/// Checks if ChatGPT is open in a browser tab
pub fn find_chatgpt_browser_window(open_windows: &[crate::models::types::WindowInfo]) -> Option<(u64, String)> {
    for win in open_windows {
        let exe_lower = win.exe.to_lowercase();
        let is_browser = BROWSER_EXES.iter().any(|b| exe_lower.contains(b));
        if is_browser {
            let title_lower = win.title.to_lowercase();
            if title_lower.contains("chatgpt") || title_lower.contains("chat.openai.com") {
                return Some((win.hwnd, win.title.clone()));
            }
        }
    }
    None
}
