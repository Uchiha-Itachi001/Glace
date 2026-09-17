use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::time::Duration;
use super::types::AiProviderStatus;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
pub const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn get_home_dir() -> Option<PathBuf> {
    dirs::home_dir()
}

pub fn get_appdata_dir() -> Option<PathBuf> {
    dirs::data_dir()
}

pub fn get_localappdata_dir() -> Option<PathBuf> {
    dirs::data_local_dir()
}

/// Helper to run a command silently without any flashing command window on Windows
pub fn run_hidden(program: &str, args: &[&str]) -> Option<String> {
    let mut cmd = std::process::Command::new(program);
    cmd.args(args)
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let output = cmd.output().ok()?;
    if output.status.success() {
        Some(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        None
    }
}

/// Parse RFC3339 timestamp (e.g. 2026-09-13T11:03:04Z) to Unix epoch seconds
pub fn parse_rfc3339_to_unix(s: &str) -> Option<u64> {
    let clean = s.trim();
    let parts: Vec<&str> = clean.split('T').collect();
    if parts.len() < 2 { return None; }
    let ymd: Vec<u64> = parts[0].split('-').filter_map(|x| x.parse().ok()).collect();
    let hms_str = parts[1].trim_end_matches('Z');
    let hms: Vec<u64> = hms_str.split(':')
        .enumerate()
        .filter_map(|(index, x)| {
            let whole = if index == 2 { x.split('.').next().unwrap_or(x) } else { x };
            whole.parse().ok()
        })
        .collect();
    if ymd.len() < 3 || hms.len() < 3 { return None; }

    let (year, month, day) = (ymd[0], ymd[1], ymd[2]);
    let (hour, min, sec) = (hms[0], hms[1], hms[2]);

    let mut days = 0u64;
    for y in 1970..year {
        days += if (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0) { 366 } else { 365 };
    }
    let is_leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
    let month_days = [31, if is_leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    for m in 1..month {
        days += month_days[(m - 1) as usize];
    }
    days += day.saturating_sub(1);

    Some(days * 86400 + hour * 3600 + min * 60 + sec)
}

/// Format relative countdown from unix epoch seconds
pub fn format_unix_countdown(target_secs: u64) -> String {
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    if target_secs <= now_secs {
        return "Refreshing now".to_string();
    }
    let diff = target_secs - now_secs;
    let days = diff / 86400;
    let hours = (diff % 86400) / 3600;
    let mins = (diff % 3600) / 60;
    if days > 0 {
        format!("in {}d {}h", days, hours)
    } else if hours > 0 {
        format!("in {}h {}m", hours, mins)
    } else {
        format!("in {}m", mins.max(1))
    }
}

/// Format relative reset countdown string from RFC3339 timestamp
pub fn format_reset_countdown(iso: &str) -> String {
    let Some(target_secs) = parse_rfc3339_to_unix(iso) else {
        return iso.to_string();
    };
    format!("Resets {}", format_unix_countdown(target_secs))
}

/// Probes a local TCP port and optionally sends a raw HTTP GET request.
pub fn probe_local_http(port: u16, path: &str) -> Option<String> {
    let addr: SocketAddr = format!("127.0.0.1:{}", port).parse().ok()?;
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(150)).ok()?;
    stream.set_read_timeout(Some(Duration::from_millis(250))).ok()?;
    stream.set_write_timeout(Some(Duration::from_millis(150))).ok()?;

    let req = format!(
        "GET {} HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nUser-Agent: Glace-CodeNotch\r\nAccept: application/json\r\nConnection: close\r\n\r\n",
        path, port
    );

    if stream.write_all(req.as_bytes()).is_err() {
        return None;
    }

    let mut resp = Vec::new();
    let mut buf = [0u8; 4096];
    while let Ok(n) = stream.read(&mut buf) {
        if n == 0 {
            break;
        }
        resp.extend_from_slice(&buf[..n]);
        if resp.len() > 65536 {
            break;
        }
    }

    let resp_str = String::from_utf8_lossy(&resp).to_string();
    if let Some(pos) = resp_str.find("\r\n\r\n") {
        Some(resp_str[pos + 4..].to_string())
    } else {
        Some(resp_str)
    }
}

pub const BROWSER_EXES: &[&str] = &[
    "chrome.exe", "msedge.exe", "firefox.exe", "brave.exe",
    "opera.exe", "vivaldi.exe", "arc.exe", "zen.exe", "thorium.exe",
];

#[cfg(windows)]
pub fn get_running_process_names() -> std::collections::HashSet<String> {
    use windows::Win32::System::ProcessStatus::{K32EnumProcesses, K32GetModuleFileNameExW};
    use windows::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_NAME_FORMAT};
    use windows::Win32::Foundation::CloseHandle;
    use windows::core::PWSTR;

    let mut pids = [0u32; 2048];
    let mut bytes_needed = 0u32;
    let mut names = std::collections::HashSet::new();

    let success = unsafe {
        K32EnumProcesses(
            pids.as_mut_ptr(),
            (pids.len() * std::mem::size_of::<u32>()) as u32,
            &mut bytes_needed,
        )
    };

    if success.as_bool() {
        let count = (bytes_needed as usize) / std::mem::size_of::<u32>();
        for &pid in &pids[..count] {
            if pid == 0 { continue; }
            if let Ok(process) = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) } {
                if !process.0.is_null() {
                    let mut path_buf = [0u16; 512];
                    let mut len = path_buf.len() as u32;
                    let q_res = unsafe {
                        QueryFullProcessImageNameW(
                            process,
                            PROCESS_NAME_FORMAT(0),
                            PWSTR(path_buf.as_mut_ptr()),
                            &mut len,
                        )
                    };
                    let extracted_name = if q_res.is_ok() && len > 0 {
                        let full_path = String::from_utf16_lossy(&path_buf[..len as usize]);
                        std::path::Path::new(&full_path).file_name().and_then(|n| n.to_str()).map(|s| s.to_string())
                    } else {
                        let k_len = unsafe { K32GetModuleFileNameExW(Some(process), None, &mut path_buf) };
                        if k_len > 0 {
                            let full_path = String::from_utf16_lossy(&path_buf[..k_len as usize]);
                            std::path::Path::new(&full_path).file_name().and_then(|n| n.to_str()).map(|s| s.to_string())
                        } else {
                            None
                        }
                    };
                    let _ = unsafe { CloseHandle(process) };
                    if let Some(exe_name) = extracted_name {
                        names.insert(exe_name.to_lowercase());
                    }
                }
            }
        }
    }
    names
}

#[cfg(not(windows))]
pub fn get_running_process_names() -> std::collections::HashSet<String> {
    std::collections::HashSet::new()
}

/// Checks if any open browser window has an active tab matching the keywords.
pub fn find_browser_window(open_windows: &[crate::models::types::WindowInfo], keywords: &[&str]) -> Option<(u64, String)> {
    for win in open_windows {
        let exe_lower = win.exe.to_lowercase();
        let is_browser = BROWSER_EXES.iter().any(|b| exe_lower.contains(b));
        if is_browser {
            let title_lower = win.title.to_lowercase();
            for kw in keywords {
                if title_lower.contains(&kw.to_lowercase()) {
                    return Some((win.hwnd, win.title.clone()));
                }
            }
        }
    }
    None
}

/// Finds the HWND of a window matching executable or title patterns
pub fn find_process_window(open_windows: &[crate::models::types::WindowInfo], patterns: &[&str]) -> Option<u64> {
    for win in open_windows {
        let exe_lower = win.exe.to_lowercase();
        let title_lower = win.title.to_lowercase();
        for pat in patterns {
            let p = pat.to_lowercase();
            if p.ends_with(".exe") {
                if exe_lower.contains(&p) {
                    return Some(win.hwnd);
                }
            } else if exe_lower.contains(&p) || title_lower.contains(&p) {
                return Some(win.hwnd);
            }
        }
    }
    None
}

/// Checks if any open window title or process executable matches a query (case-insensitive)
pub fn is_process_running(open_windows: &[crate::models::types::WindowInfo], patterns: &[&str]) -> bool {
    find_process_window(open_windows, patterns).is_some()
}

/// Fast O(1) running process check using pre-enumerated process set.
pub fn is_named_process_running(running_processes: &std::collections::HashSet<String>, image_name: &str) -> bool {
    running_processes.contains(&image_name.to_lowercase())
}

/// Adds a browser/desktop-only provider when it is actually open.
pub fn add_browser_provider(
    open_windows: &[crate::models::types::WindowInfo],
    results: &mut Vec<AiProviderStatus>,
    id: &str,
    name: &str,
    browser_keywords: &[&str],
    desktop_patterns: &[&str],
    icon_color: &str,
) {
    let browser = find_browser_window(open_windows, browser_keywords);
    let desktop_running = is_process_running(open_windows, desktop_patterns);
    if browser.is_none() && !desktop_running {
        return;
    }

    let surface = if desktop_running { "Desktop" } else { "Web" };
    results.push(AiProviderStatus {
        id: id.to_string(),
        name: name.to_string(),
        is_installed: true,
        is_running: true,
        active_model: None,
        session_status: "active".to_string(),
        usage_percent: None,
        detail: Some(format!("{} session detected", surface)),
        icon_color: icon_color.to_string(),
        category: "browser".to_string(),
        session_reset_time: None,
        all_models_usage_percent: None,
        all_models_reset_time: None,
        input_tokens: None,
        output_tokens: None,
        total_input_tokens: None,
        total_output_tokens: None,
        usage_source: Some(format!("{} does not expose token usage through its local {} session.", name, surface.to_lowercase())),
        tags: vec![surface.to_string(), "Usage unavailable".to_string()],
    });
}
