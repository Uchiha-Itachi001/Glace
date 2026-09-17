use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use super::helpers::{parse_rfc3339_to_unix, BROWSER_EXES};
use super::types::ClaudeTokenStats;

static CLAUDE_STATS_CACHE: Mutex<Option<(Instant, ClaudeTokenStats)>> = Mutex::new(None);
const CLAUDE_STATS_CACHE_TTL: Duration = Duration::from_secs(30);

/// Locate Claude Desktop executable on Windows
pub fn get_claude_desktop_exe() -> Option<PathBuf> {
    if let Some(local) = dirs::data_local_dir() {
        let p1 = local.join("Programs").join("Claude").join("Claude.exe");
        if p1.exists() { return Some(p1); }
        let p2 = local.join("Claude").join("Claude.exe");
        if p2.exists() { return Some(p2); }
        let claude_local = local.join("Claude");
        if claude_local.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&claude_local) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.starts_with("app-") {
                        let exe = entry.path().join("Claude.exe");
                        if exe.exists() { return Some(exe); }
                    }
                }
            }
        }
    }
    let pf = PathBuf::from("C:\\Program Files\\Claude\\Claude.exe");
    if pf.exists() { return Some(pf); }
    None
}

/// Checks if Claude Desktop is installed on the machine
pub fn is_claude_desktop_installed() -> bool {
    if get_claude_desktop_exe().is_some() {
        return true;
    }
    if let Some(appdata) = dirs::data_dir() {
        if appdata.join("Claude").exists() {
            return true;
        }
    }
    if let Some(local) = dirs::data_local_dir() {
        if local.join("Claude").exists() {
            return true;
        }
    }
    false
}

/// Checks if Claude is open in a browser tab
pub fn find_claude_browser_window(open_windows: &[crate::models::types::WindowInfo]) -> Option<(u64, String)> {
    for win in open_windows {
        let exe_lower = win.exe.to_lowercase();
        let is_browser = BROWSER_EXES.iter().any(|b| exe_lower.contains(b));
        if is_browser {
            let title_lower = win.title.to_lowercase();
            if title_lower.contains("claude.ai")
                || title_lower == "claude"
                || title_lower.starts_with("claude -")
                || title_lower.starts_with("claude |")
                || title_lower.starts_with("claude:")
                || title_lower.ends_with(" - claude")
                || title_lower.contains(" - claude - ")
            {
                return Some((win.hwnd, win.title.clone()));
            }
        }
    }
    None
}

pub fn read_claude_token_stats(home: &PathBuf) -> ClaudeTokenStats {
    if let Ok(guard) = CLAUDE_STATS_CACHE.lock() {
        if let Some((cached_time, ref stats)) = *guard {
            if cached_time.elapsed() < CLAUDE_STATS_CACHE_TTL {
                return stats.clone();
            }
        }
    }

    let stats = read_claude_token_stats_uncached(home);
    if let Ok(mut guard) = CLAUDE_STATS_CACHE.lock() {
        *guard = Some((Instant::now(), stats.clone()));
    }
    stats
}

/// Reads real token data from ~/.claude/projects/**/*.jsonl
fn read_claude_token_stats_uncached(home: &PathBuf) -> ClaudeTokenStats {
    let projects_dir = home.join(".claude").join("projects");
    let mut stats = ClaudeTokenStats::default();

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let day_start_ms = now_ms - (now_ms % 86_400_000);
    let week_start_ms = now_ms.saturating_sub(7 * 86_400_000);
    let window_start_ms = now_ms.saturating_sub(5 * 3600 * 1000);

    let proj_dir = match std::fs::read_dir(&projects_dir) {
        Ok(d) => d,
        Err(_) => return stats,
    };

    for proj_entry in proj_dir.flatten() {
        if !proj_entry.path().is_dir() { continue; }
        let jsonl_dir = match std::fs::read_dir(proj_entry.path()) {
            Ok(d) => d,
            Err(_) => continue,
        };
        for file_entry in jsonl_dir.flatten() {
            let path = file_entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("jsonl") { continue; }
            if let Ok(meta) = std::fs::metadata(&path) {
                if let Ok(mtime) = meta.modified() {
                    let mtime_ms = mtime
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64;
                    if mtime_ms >= day_start_ms { stats.sessions_today += 1; }
                    if mtime_ms >= week_start_ms { stats.recent_sessions += 1; }
                }
            }
            let content = match std::fs::read_to_string(&path) {
                Ok(c) => c,
                Err(_) => continue,
            };
            for line in content.lines() {
                let parsed: serde_json::Value = match serde_json::from_str(line) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                let msg = match parsed.get("message") {
                    Some(m) => m,
                    None => continue,
                };
                if let Some(model_str) = msg.get("model").and_then(|m| m.as_str()) {
                    if !model_str.is_empty() && model_str != "<synthetic>" {
                        stats.last_model = Some(model_str.to_string());
                    }
                }
                let usage = match msg.get("usage") { Some(u) => u, None => continue };
                let inp = usage.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
                let out = usage.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
                stats.total_input += inp;
                stats.total_output += out;
                let ts = parsed.get("timestamp").and_then(parse_timestamp_ms).unwrap_or(0);
                if ts >= window_start_ms {
                    stats.window_input += inp;
                    stats.window_output += out;
                }
            }
        }
    }
    stats
}

pub fn parse_timestamp_ms(value: &serde_json::Value) -> Option<u64> {
    if let Some(ts) = value.as_u64() {
        return Some(if ts < 10_000_000_000 { ts.saturating_mul(1_000) } else { ts });
    }
    let iso = value.as_str()?;
    let seconds = parse_rfc3339_to_unix(iso)?;
    Some(seconds.saturating_mul(1_000))
}

pub fn fmt_tokens(n: u64) -> String {
    if n >= 1_000_000 {
        format!("{:.1}M", n as f64 / 1_000_000.0)
    } else if n >= 1_000 {
        format!("{:.1}K", n as f64 / 1_000.0)
    } else {
        format!("{}", n)
    }
}

pub fn shorten_model(model: &str) -> String {
    let parts: Vec<&str> = model.split('-').collect();
    let no_date: Vec<&str> = parts.iter()
        .filter(|p| p.parse::<u64>().map(|n| n < 20_000_000).unwrap_or(true))
        .copied().collect();
    let mut out: Vec<String> = Vec::new();
    let mut i = 0;
    while i < no_date.len() {
        let cur = no_date[i];
        if i + 1 < no_date.len() {
            let next = no_date[i + 1];
            if cur.parse::<u32>().is_ok() && next.parse::<u32>().is_ok() {
                out.push(format!("{}.{}", cur, next));
                i += 2;
                continue;
            }
        }
        out.push(cur.to_string());
        i += 1;
    }
    out.join("-")
}
