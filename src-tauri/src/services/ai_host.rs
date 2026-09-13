use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AiProviderStatus {
    pub id: String,
    pub name: String,
    pub is_installed: bool,
    pub is_running: bool,
    pub active_model: Option<String>,
    pub session_status: String, // "active", "idle", "blocked", "offline"
    pub usage_percent: Option<f32>,
    pub detail: Option<String>,
    pub icon_color: String,
    pub category: String, // "editor", "cli", "local_llm", "agent"
    pub session_reset_time: Option<String>,
    pub all_models_usage_percent: Option<f32>,
    pub all_models_reset_time: Option<String>,
}

#[cfg(windows)]
use std::os::windows::process::CommandExt;
const CREATE_NO_WINDOW: u32 = 0x08000000;

static AI_CACHE: Mutex<Option<(Instant, Vec<AiProviderStatus>)>> = Mutex::new(None);
const CACHE_TTL: Duration = Duration::from_millis(1500);

/// Helper to run a command silently without any flashing command window on Windows
fn run_hidden(program: &str, args: &[&str]) -> Option<String> {
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
fn parse_rfc3339_to_unix(s: &str) -> Option<u64> {
    let clean = s.trim();
    let parts: Vec<&str> = clean.split('T').collect();
    if parts.len() < 2 { return None; }
    let ymd: Vec<u64> = parts[0].split('-').filter_map(|x| x.parse().ok()).collect();
    let hms_str = parts[1].trim_end_matches('Z');
    let hms: Vec<u64> = hms_str.split(':').filter_map(|x| x.parse().ok()).collect();
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
fn format_unix_countdown(target_secs: u64) -> String {
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
fn format_reset_countdown(iso: &str) -> String {
    let Some(target_secs) = parse_rfc3339_to_unix(iso) else {
        return iso.to_string();
    };
    format!("Resets {}", format_unix_countdown(target_secs))
}

#[derive(Debug, Clone, Default)]
struct AntigravityQuota {
    gemini_5h_used: Option<f32>,
    gemini_5h_reset: Option<String>,
    gemini_weekly_used: Option<f32>,
    gemini_weekly_reset: Option<String>,
    claude_weekly_used: Option<f32>,
    claude_weekly_reset: Option<String>,
    claude_blocked: bool,
}

static ANTIGRAVITY_CACHE: Mutex<Option<(Instant, AntigravityQuota)>> = Mutex::new(None);
const QUOTA_CACHE_TTL: Duration = Duration::from_secs(60);

fn fetch_antigravity_quota() -> Option<AntigravityQuota> {
    if let Ok(guard) = ANTIGRAVITY_CACHE.lock() {
        if let Some((cached_time, ref quota)) = *guard {
            if cached_time.elapsed() < QUOTA_CACHE_TTL {
                return Some(quota.clone());
            }
        }
    }

    #[cfg(windows)]
    {
        let mut cmd = std::process::Command::new("powershell");
        cmd.args(&[
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-CimInstance Win32_Process -Filter \"Name LIKE '%language_server%'\" | ForEach-Object { \"$($_.ProcessId)`t$($_.CommandLine)\" }",
        ]);
        cmd.creation_flags(CREATE_NO_WINDOW);

        let output = cmd.output().ok()?;
        let table = String::from_utf8_lossy(&output.stdout);
        let line = table.lines().find(|l| l.contains("--csrf_token"))?;
        let (pid_s, cmdline) = line.split_once('\t')?;
        let pid: u32 = pid_s.trim().parse().ok()?;

        let parts: Vec<&str> = cmdline.split_whitespace().collect();
        let csrf_idx = parts.iter().position(|p| *p == "--csrf_token")?;
        let csrf = parts.get(csrf_idx + 1)?.trim_matches('"').to_string();

        let mut net_cmd = std::process::Command::new("netstat");
        net_cmd.args(&["-ano", "-p", "TCP"]);
        net_cmd.creation_flags(CREATE_NO_WINDOW);

        let net_out = net_cmd.output().ok()?;
        let net_text = String::from_utf8_lossy(&net_out.stdout);
        let pid_s = pid.to_string();
        let mut ports: Vec<u16> = net_text.lines()
            .filter(|l| l.contains("LISTENING"))
            .filter_map(|l| {
                let cols: Vec<&str> = l.split_whitespace().collect();
                if cols.len() < 5 || cols[4] != pid_s { return None; }
                cols[1].rsplit(':').next()?.parse::<u16>().ok()
            })
            .collect();
        ports.sort_unstable();
        ports.dedup();

        for port in ports {
            let url = format!("https://127.0.0.1:{}/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary", port);
            let mut curl = std::process::Command::new("curl.exe");
            curl.args(&[
                "-k", "-s", "--max-time", "2",
                "-X", "POST",
                &url,
                "-H", &format!("x-codeium-csrf-token: {}", csrf),
                "-H", "Content-Type: application/json",
                "-d", "{\"forceRefresh\":true}",
            ]);
            curl.creation_flags(CREATE_NO_WINDOW);

            if let Ok(out) = curl.output() {
                if out.status.success() {
                    let resp_str = String::from_utf8_lossy(&out.stdout);
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&resp_str) {
                        if let Some(resp) = val.get("response") {
                            let mut q = AntigravityQuota::default();
                            if let Some(groups) = resp.get("groups").and_then(|g| g.as_array()) {
                                for g in groups {
                                    if let Some(buckets) = g.get("buckets").and_then(|b| b.as_array()) {
                                        for b in buckets {
                                            let b_id = b.get("bucketId").and_then(|id| id.as_str()).unwrap_or("");
                                            let rem = b.get("remainingFraction").and_then(|r| r.as_f64()).unwrap_or(1.0) as f32;
                                            let reset = b.get("resetTime").and_then(|t| t.as_str()).map(format_reset_countdown);
                                            let used = ((1.0 - rem) * 100.0).clamp(0.0, 100.0);

                                            if b_id == "gemini-5h" {
                                                q.gemini_5h_used = Some(used);
                                                q.gemini_5h_reset = reset;
                                            } else if b_id == "gemini-weekly" {
                                                q.gemini_weekly_used = Some(used);
                                                q.gemini_weekly_reset = reset;
                                            } else if b_id == "3p-weekly" {
                                                q.claude_weekly_used = Some(used);
                                                q.claude_weekly_reset = reset;
                                                if rem <= 0.001 {
                                                    q.claude_blocked = true;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            if let Ok(mut guard) = ANTIGRAVITY_CACHE.lock() {
                                *guard = Some((Instant::now(), q.clone()));
                            }
                            return Some(q);
                        }
                    }
                }
            }
        }
    }
    None
}

#[derive(Debug, Clone, Default)]
struct CursorInfo {
    email: Option<String>,
    membership: Option<String>,
    preferred_model: Option<String>,
}

static CURSOR_CACHE: Mutex<Option<(Instant, CursorInfo)>> = Mutex::new(None);

fn fetch_cursor_info() -> CursorInfo {
    if let Ok(guard) = CURSOR_CACHE.lock() {
        if let Some((cached_time, ref info)) = *guard {
            if cached_time.elapsed() < QUOTA_CACHE_TTL {
                return info.clone();
            }
        }
    }

    let mut info = CursorInfo::default();
    let appdata = get_appdata_dir();

    if let Some(ref d) = appdata {
        let settings_path = d.join("Cursor").join("User").join("settings.json");
        if let Ok(c) = std::fs::read_to_string(&settings_path) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&c) {
                info.preferred_model = val.get("cursor.general.preferredModel")
                    .or_else(|| val.get("cursor.chat.defaultModel"))
                    .and_then(|v| v.as_str())
                    .map(String::from);
            }
        }
    }

    let py_cmd = r#"
import sqlite3, os, json
db = os.path.expandvars(r'%APPDATA%\Cursor\User\globalStorage\state.vscdb')
if os.path.exists(db):
    try:
        con = sqlite3.connect(f'file:{db}?mode=ro', uri=True)
        cur = con.cursor()
        email = cur.execute("SELECT value FROM ItemTable WHERE key='cursorAuth/cachedEmail'").fetchone()
        plan = cur.execute("SELECT value FROM ItemTable WHERE key='cursorAuth/stripeMembershipType'").fetchone()
        print(json.dumps({"email": email[0] if email else None, "plan": plan[0] if plan else None}))
    except: pass
"#;
    if let Some(out) = run_hidden("python", &["-c", py_cmd]) {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(out.trim()) {
            info.email = val.get("email").and_then(|e| e.as_str()).map(String::from);
            info.membership = val.get("plan").and_then(|p| p.as_str()).map(String::from);
        }
    }

    if let Ok(mut guard) = CURSOR_CACHE.lock() {
        *guard = Some((Instant::now(), info.clone()));
    }
    info
}

#[derive(Debug, Clone, Default)]
struct CodexInfo {
    model: Option<String>,
    email: Option<String>,
    plan: Option<String>,
    used_percent: Option<f32>,
    resets_at_str: Option<String>,
    total_tokens: u64,
    input_tokens: u64,
    output_tokens: u64,
}

static CODEX_CACHE: Mutex<Option<(Instant, CodexInfo)>> = Mutex::new(None);
const CODEX_CACHE_TTL: Duration = Duration::from_secs(60);

fn fetch_codex_info(home: &std::path::Path) -> Option<CodexInfo> {
    if let Ok(guard) = CODEX_CACHE.lock() {
        if let Some((cached_time, ref info)) = *guard {
            if cached_time.elapsed() < CODEX_CACHE_TTL {
                return Some(info.clone());
            }
        }
    }

    let codex_dir = home.join(".codex");
    if !codex_dir.exists() {
        return None;
    }

    let mut info = CodexInfo::default();

    // 1. Read configured model from config.toml
    let config_path = codex_dir.join("config.toml");
    if let Ok(content) = std::fs::read_to_string(&config_path) {
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("model") && trimmed.contains('=') {
                if let Some((_, val)) = trimmed.split_once('=') {
                    let m = val.trim().trim_matches('"').trim_matches('\'').trim();
                    if !m.is_empty() {
                        info.model = Some(m.to_string());
                        break;
                    }
                }
            }
        }
    }

    // 2. Read email and plan from auth.json
    let auth_path = codex_dir.join("auth.json");
    if let Ok(content) = std::fs::read_to_string(&auth_path) {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(id_tok) = val.get("tokens").and_then(|t| t.get("id_token")).and_then(|t| t.as_str()) {
                let parts: Vec<&str> = id_tok.split('.').collect();
                if parts.len() >= 2 {
                    let mut b64 = parts[1].replace('-', "+").replace('_', "/");
                    while b64.len() % 4 != 0 {
                        b64.push('=');
                    }
                    use base64::Engine;
                    if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(&b64) {
                        if let Ok(jwt_json) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                            if let Some(email) = jwt_json.get("email").and_then(|e| e.as_str()) {
                                info.email = Some(email.to_string());
                            }
                            if let Some(auth_claim) = jwt_json.get("https://api.openai.com/auth") {
                                if let Some(plan) = auth_claim.get("chatgpt_plan_type").and_then(|p| p.as_str()) {
                                    let plan_lower = plan.to_lowercase();
                                    let plan_name = match plan_lower.as_str() {
                                        "go" => "ChatGPT Go",
                                        "plus" => "ChatGPT Plus",
                                        "pro" => "ChatGPT Pro",
                                        "team" => "ChatGPT Team",
                                        _ => plan,
                                    };
                                    info.plan = Some(plan_name.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 3. Scan sessions for latest token_count and rate_limits
    let sessions_dir = codex_dir.join("sessions");
    if sessions_dir.exists() {
        let mut latest_file: Option<(std::time::SystemTime, std::path::PathBuf)> = None;
        let mut stack = vec![sessions_dir];
        while let Some(dir) = stack.pop() {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        stack.push(path);
                    } else if path.extension().map(|e| e == "jsonl").unwrap_or(false) {
                        if let Ok(meta) = path.metadata() {
                            if let Ok(mod_time) = meta.modified() {
                                if latest_file.as_ref().map(|(t, _)| mod_time > *t).unwrap_or(true) {
                                    latest_file = Some((mod_time, path));
                                }
                            }
                        }
                    }
                }
            }
        }

        if let Some((_, file_path)) = latest_file {
            if let Ok(file) = std::fs::File::open(&file_path) {
                use std::io::{Seek, SeekFrom};
                let mut f = file;
                let file_len = f.metadata().map(|m| m.len()).unwrap_or(0);
                let read_len = file_len.min(65536);
                let offset = file_len.saturating_sub(read_len);
                if f.seek(SeekFrom::Start(offset)).is_ok() {
                    let mut buf = Vec::with_capacity(read_len as usize);
                    if f.read_to_end(&mut buf).is_ok() {
                        let text = String::from_utf8_lossy(&buf);
                        for line in text.lines().rev() {
                            if !line.contains("rate_limits") && !line.contains("total_token_usage") {
                                continue;
                            }
                            if let Ok(val) = serde_json::from_str::<serde_json::Value>(line) {
                                if let Some(payload) = val.get("payload") {
                                    if info.used_percent.is_none() {
                                        if let Some(rate_limits) = payload.get("rate_limits") {
                                            if let Some(primary) = rate_limits.get("primary") {
                                                if let Some(used) = primary.get("used_percent").and_then(|u| u.as_f64()) {
                                                    info.used_percent = Some(used as f32);
                                                }
                                                if let Some(resets_at) = primary.get("resets_at").and_then(|r| r.as_u64()) {
                                                    info.resets_at_str = Some(format_unix_countdown(resets_at));
                                                }
                                            }
                                            if info.plan.is_none() {
                                                if let Some(pt) = rate_limits.get("plan_type").and_then(|p| p.as_str()) {
                                                    info.plan = Some(format!("ChatGPT {}", pt));
                                                }
                                            }
                                        }
                                    }
                                    if info.total_tokens == 0 {
                                        if let Some(total_usage) = payload.get("info").and_then(|i| i.get("total_token_usage")) {
                                            info.total_tokens = total_usage.get("total_tokens").and_then(|t| t.as_u64()).unwrap_or(0);
                                            info.input_tokens = total_usage.get("input_tokens").and_then(|t| t.as_u64()).unwrap_or(0);
                                            info.output_tokens = total_usage.get("output_tokens").and_then(|t| t.as_u64()).unwrap_or(0);
                                        }
                                    }
                                    if info.used_percent.is_some() && info.total_tokens > 0 {
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if let Ok(mut guard) = CODEX_CACHE.lock() {
        *guard = Some((Instant::now(), info.clone()));
    }
    Some(info)
}

/// Probes a local TCP port and optionally sends a raw HTTP GET request.
fn probe_local_http(port: u16, path: &str) -> Option<String> {
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
            break; // limit response read to 64KB
        }
    }

    let resp_str = String::from_utf8_lossy(&resp).to_string();
    if let Some(pos) = resp_str.find("\r\n\r\n") {
        Some(resp_str[pos + 4..].to_string())
    } else {
        Some(resp_str)
    }
}

const BROWSER_EXES: &[&str] = &[
    "chrome.exe", "msedge.exe", "firefox.exe", "brave.exe",
    "opera.exe", "vivaldi.exe", "arc.exe", "zen.exe", "thorium.exe",
];

/// Checks if any open browser window has an active tab matching the keywords.
/// Returns Option<(hwnd, window_title)>
fn find_browser_window(keywords: &[&str]) -> Option<(u64, String)> {
    let open_windows = crate::services::window_watcher::enumerate_windows();
    for win in open_windows {
        let exe_lower = win.exe.to_lowercase();
        let is_browser = BROWSER_EXES.iter().any(|b| exe_lower.contains(b));
        if is_browser {
            let title_lower = win.title.to_lowercase();
            for kw in keywords {
                if title_lower.contains(&kw.to_lowercase()) {
                    return Some((win.hwnd, win.title));
                }
            }
        }
    }
    None
}

/// Finds the HWND of a window matching executable or title patterns
fn find_process_window(patterns: &[&str]) -> Option<u64> {
    let open_windows = crate::services::window_watcher::enumerate_windows();
    for win in open_windows {
        let exe_lower = win.exe.to_lowercase();
        let title_lower = win.title.to_lowercase();
        for pat in patterns {
            let p = pat.to_lowercase();
            if exe_lower.contains(&p) || title_lower.contains(&p) {
                return Some(win.hwnd);
            }
        }
    }
    None
}

/// Checks if any open window title or process executable matches a query (case-insensitive)
fn is_process_running(patterns: &[&str]) -> bool {
    find_process_window(patterns).is_some()
}

fn get_home_dir() -> Option<PathBuf> {
    dirs::home_dir()
}

fn get_appdata_dir() -> Option<PathBuf> {
    dirs::data_dir()
}

fn get_localappdata_dir() -> Option<PathBuf> {
    dirs::data_local_dir()
}

/// Aggregated token stats from Claude Code session JSONL files.
#[derive(Default, Debug)]
struct ClaudeTokenStats {
    total_input: u64,
    total_output: u64,
    last_model: Option<String>,
    recent_sessions: usize,
    sessions_today: usize,
    window_input: u64,
    window_output: u64,
}

/// ~400K input tokens per 5h window is a reasonable Claude Pro baseline.
const CLAUDE_WINDOW_LIMIT_TOKENS: u64 = 400_000;

/// Reads real token data from ~/.claude/projects/**/*.jsonl
fn read_claude_token_stats(home: &PathBuf) -> ClaudeTokenStats {
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
                let ts = parsed.get("timestamp").and_then(|t| t.as_u64()).unwrap_or(0);
                if ts >= window_start_ms {
                    stats.window_input += inp;
                    stats.window_output += out;
                }
            }
        }
    }
    stats
}

/// Format token count: 12300 → "12.3K", 1200000 → "1.2M"
fn fmt_tokens(n: u64) -> String {
    if n >= 1_000_000 {
        format!("{:.1}M", n as f64 / 1_000_000.0)
    } else if n >= 1_000 {
        format!("{:.1}K", n as f64 / 1_000.0)
    } else {
        format!("{}", n)
    }
}

/// "claude-opus-4-5-20251101" → "claude-opus-4.5"
fn shorten_model(model: &str) -> String {
    let parts: Vec<&str> = model.split('-').collect();
    // Strip date suffix (8-digit numbers >= 20000000)
    let no_date: Vec<&str> = parts.iter()
        .filter(|p| p.parse::<u64>().map(|n| n < 20_000_000).unwrap_or(true))
        .copied().collect();
    // Merge consecutive single-digit version parts: 4, 5 → 4.5
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

/// Scans all major coding AI assistants and returns their live statuses.
/// Only returns providers that are actually installed or running.
pub fn scan_ai_assistants() -> Vec<AiProviderStatus> {
    // Check in-memory cache
    if let Ok(guard) = AI_CACHE.lock() {
        if let Some((cached_time, ref cached_data)) = *guard {
            if cached_time.elapsed() < CACHE_TTL {
                return cached_data.clone();
            }
        }
    }

    let home = get_home_dir();
    let appdata = get_appdata_dir();
    let localappdata = get_localappdata_dir();

    let mut results = Vec::new();

    // ──────────────────────────────────────────────────────────────────────────
    // 1. CLAUDE CODE & CLAUDE.AI (CLI & Browser)
    // ──────────────────────────────────────────────────────────────────────────
    let claude_json_path = home.as_ref().map(|d| d.join(".claude.json"));
    let claude_config_dir = home.as_ref().map(|d| d.join(".claude"));
    let claude_config_exists = claude_config_dir.as_ref().map(|p| p.exists()).unwrap_or(false);
    let claude_json_exists = claude_json_path.as_ref().map(|p| p.exists()).unwrap_or(false);
    let claude_cli_running = is_process_running(&["claude.exe", "claude-code"]);
    let claude_browser = find_browser_window(&["claude.ai", "claude"]);
    let claude_running = claude_cli_running || claude_browser.is_some();

    if claude_config_exists || claude_json_exists || claude_running {
        // Read account email from .claude.json
        let account_email = if let Some(ref path) = claude_json_path {
            if let Ok(content) = std::fs::read_to_string(path) {
                serde_json::from_str::<serde_json::Value>(&content).ok()
                    .and_then(|j| j.get("oauthAccount")
                        .and_then(|a| a.get("emailAddress"))
                        .and_then(|e| e.as_str())
                        .map(|s| s.to_string()))
            } else { None }
        } else { None };

        // Read REAL token stats from project JSONL files
        let token_stats = if let Some(ref h) = home {
            read_claude_token_stats(h)
        } else {
            ClaudeTokenStats::default()
        };

        // Real model from settings.json or actually used in sessions
        let configured_claude_model = home.as_ref().and_then(|d| {
            let p = d.join(".claude").join("settings.json");
            std::fs::read_to_string(&p).ok().and_then(|c| {
                serde_json::from_str::<serde_json::Value>(&c).ok().and_then(|j| {
                    j.get("model").and_then(|m| m.as_str()).map(|s| s.to_string())
                })
            })
        });

        let active_model = configured_claude_model.map(|m| shorten_model(&m))
            .or_else(|| token_stats.last_model.as_deref().map(shorten_model))
            .or_else(|| Some("claude-code".to_string()));

        // Usage % from 5h rolling window vs ~400K limit
        let usage_pct = if token_stats.window_input > 0 {
            Some((token_stats.window_input as f32 / CLAUDE_WINDOW_LIMIT_TOKENS as f32 * 100.0).min(100.0).max(1.0))
        } else if token_stats.total_input > 0 {
            Some(2.0) // Has history but idle now
        } else {
            None
        };

        let detail = if claude_cli_running {
            if token_stats.window_input > 0 {
                let base = format!("Active CLI · {} in / {} out this window",
                    fmt_tokens(token_stats.window_input), fmt_tokens(token_stats.window_output));
                if let Some(ref email) = account_email {
                    Some(format!("{} · {}", base, email))
                } else { Some(base) }
            } else {
                let base = format!("Active CLI · {} sessions today", token_stats.sessions_today);
                if let Some(ref email) = account_email {
                    Some(format!("{} · {}", base, email))
                } else { Some(base) }
            }
        } else if claude_browser.is_some() {
            Some("Active in browser tab (claude.ai)".to_string())
        } else if token_stats.recent_sessions > 0 {
            let base = format!("{} sessions this week", token_stats.recent_sessions);
            if let Some(ref email) = account_email {
                Some(format!("{} · {}", base, email))
            } else { Some(base) }
        } else {
            Some("Idle — no recent sessions".to_string())
        };

        let session_reset_time = if token_stats.total_input > 0 {
            Some(format!("{} in / {} out total",
                fmt_tokens(token_stats.total_input), fmt_tokens(token_stats.total_output)))
        } else {
            Some("No usage data".to_string())
        };

        results.push(AiProviderStatus {
            id: "claude".to_string(),
            name: "Claude Code".to_string(),
            is_installed: claude_config_exists || claude_json_exists,
            is_running: claude_running,
            active_model,
            session_status: if claude_running { "active".to_string() } else if claude_config_exists || claude_json_exists { "idle".to_string() } else { "offline".to_string() },
            usage_percent: usage_pct,
            detail,
            icon_color: "#da7756".to_string(),
            category: "cli".to_string(),
            session_reset_time,
            all_models_usage_percent: usage_pct,
            all_models_reset_time: Some("~5h rolling window".to_string()),
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. CURSOR (AI Code Editor) — detect via process and install folder
    // ──────────────────────────────────────────────────────────────────────────
    let cursor_installed = localappdata.as_ref().map(|d| d.join("Programs").join("cursor").exists()).unwrap_or(false)
        || appdata.as_ref().map(|d| d.join("Cursor").exists()).unwrap_or(false)
        || is_process_running(&["cursor.exe"]);
    let cursor_running = is_process_running(&["cursor.exe"]);

    if cursor_installed || cursor_running {
        // Read active workspace from Cursor storage.json
        let cursor_workspace = appdata.as_ref().and_then(|d| {
            let path = d.join("Cursor").join("User").join("globalStorage").join("storage.json");
            std::fs::read_to_string(&path).ok().and_then(|content| {
                serde_json::from_str::<serde_json::Value>(&content).ok().and_then(|json| {
                    json.get("profileAssociations")
                        .and_then(|p| p.get("workspaces"))
                        .and_then(|w| {
                            // Get the last key (most recent workspace)
                            w.as_object().and_then(|map| map.keys().last().cloned())
                        })
                        .map(|path_uri| {
                            // Convert file:///d%3A/... to readable path
                            let decoded = path_uri.replace("file:///", "").replace("%3A", ":").replace("%20", " ");
                            decoded.split('/').last().unwrap_or("project").to_string()
                        })
                })
            })
        });

        let cursor_info = fetch_cursor_info();

        let detail = if cursor_running {
            let mut parts = Vec::new();
            if let Some(ref ws) = cursor_workspace {
                parts.push(format!("Editing · {}", ws));
            } else {
                parts.push("Agent Mode · Active".to_string());
            }
            if let Some(ref email) = cursor_info.email {
                parts.push(email.clone());
            }
            if let Some(ref plan) = cursor_info.membership {
                parts.push(format!("{} tier", plan));
            }
            Some(parts.join(" · "))
        } else if let Some(ref email) = cursor_info.email {
            let plan_str = cursor_info.membership.as_deref().unwrap_or("free");
            Some(format!("{} · {} tier", email, plan_str))
        } else {
            Some("Idle — not running".to_string())
        };

        // Try to read Cursor's active model from its settings or cursor_info
        let cursor_model = cursor_info.preferred_model.or_else(|| {
            appdata.as_ref().and_then(|d| {
                let path = d.join("Cursor").join("User").join("settings.json");
                std::fs::read_to_string(&path).ok().and_then(|content| {
                    serde_json::from_str::<serde_json::Value>(&content).ok().and_then(|json| {
                        json.get("cursor.general.preferredModel")
                            .or_else(|| json.get("cursor.chat.defaultModel"))
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string())
                    })
                })
            })
        });

        let session_reset_time = cursor_info.membership.map(|m| format!("{} tier account", m))
            .or_else(|| Some("Free tier".to_string()));

        results.push(AiProviderStatus {
            id: "cursor".to_string(),
            name: "Cursor".to_string(),
            is_installed: cursor_installed,
            is_running: cursor_running,
            active_model: cursor_model.or_else(|| if cursor_running { Some("auto".to_string()) } else { None }),
            session_status: if cursor_running { "active".to_string() } else if cursor_installed { "idle".to_string() } else { "offline".to_string() },
            usage_percent: None,
            detail,
            icon_color: "#ffffff".to_string(),
            category: "editor".to_string(),
            session_reset_time,
            all_models_usage_percent: None,
            all_models_reset_time: None,
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. CHATGPT (OpenAI Desktop & Browser / Codex)
    // ──────────────────────────────────────────────────────────────────────────
    let codex_dir = home.as_ref().map(|d| d.join(".codex"));
    let codex_exists = codex_dir.as_ref().map(|p| p.exists()).unwrap_or(false);
    let chatgpt_browser = find_browser_window(&["chatgpt"]);
    let chatgpt_desktop = is_process_running(&["chatgpt.exe", "codex.exe", "codex-computer-use.exe"]);
    let chatgpt_running = chatgpt_desktop || chatgpt_browser.is_some();
    let chatgpt_installed = codex_exists
        || localappdata.as_ref().map(|d| d.join("Programs").join("ChatGPT").exists() || d.join("OpenAI").join("Codex").exists()).unwrap_or(false)
        || appdata.as_ref().map(|d| d.join("ChatGPT").exists() || d.join("OpenAI").exists()).unwrap_or(false)
        || chatgpt_running;

    if chatgpt_installed || chatgpt_running {
        let codex_info = home.as_ref().and_then(|h| fetch_codex_info(h));

        let active_model = codex_info.as_ref().and_then(|c| c.model.clone())
            .or_else(|| if chatgpt_running { Some("GPT-4o".to_string()) } else { None });

        let usage_percent = codex_info.as_ref().and_then(|c| c.used_percent);

        let mut detail_parts = Vec::new();
        if chatgpt_desktop {
            detail_parts.push("Active desktop session".to_string());
        } else if chatgpt_browser.is_some() {
            detail_parts.push("Active in browser tab".to_string());
        }

        if let Some(ref info) = codex_info {
            if let Some(ref email) = info.email {
                detail_parts.push(email.clone());
            }
            if let Some(ref plan) = info.plan {
                detail_parts.push(plan.clone());
            }
        }

        let detail = if !detail_parts.is_empty() {
            Some(detail_parts.join(" · "))
        } else if chatgpt_running {
            Some("Active session".to_string())
        } else {
            Some("Idle — not running".to_string())
        };

        let session_reset_time = codex_info.as_ref().and_then(|c| c.resets_at_str.as_ref().map(|r| format!("Resets {}", r)))
            .or_else(|| if chatgpt_running { Some("Active quota".to_string()) } else { None });

        let all_models_reset_time = codex_info.as_ref().and_then(|c| {
            if c.total_tokens > 0 {
                Some(format!("{} total tokens", fmt_tokens(c.total_tokens)))
            } else {
                None
            }
        });

        results.push(AiProviderStatus {
            id: "chatgpt".to_string(),
            name: "ChatGPT".to_string(),
            is_installed: chatgpt_installed,
            is_running: chatgpt_running,
            active_model,
            session_status: if chatgpt_running { "active".to_string() } else if chatgpt_installed { "idle".to_string() } else { "offline".to_string() },
            usage_percent,
            detail,
            icon_color: "#10a37f".to_string(),
            category: if chatgpt_browser.is_some() && !chatgpt_desktop { "browser".to_string() } else { "agent".to_string() },
            session_reset_time,
            all_models_usage_percent: None,
            all_models_reset_time,
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 4. GITHUB COPILOT (VS Code extension) — detect via config + vscode
    // ──────────────────────────────────────────────────────────────────────────
    let copilot_config = localappdata.as_ref().map(|d| d.join("github-copilot").exists()).unwrap_or(false)
        || appdata.as_ref().map(|d| d.join("Code").join("User").join("globalStorage").join("github.copilot").exists()).unwrap_or(false)
        || home.as_ref().map(|d| d.join(".config").join("github-copilot").exists()).unwrap_or(false);
    let vscode_running = is_process_running(&["code.exe", "visual studio code"]);

    if copilot_config || (vscode_running && copilot_config) {
        // Try reading active Copilot model from VS Code settings
        let copilot_model = appdata.as_ref().and_then(|d| {
            let path = d.join("Code").join("User").join("settings.json");
            std::fs::read_to_string(&path).ok().and_then(|content| {
                serde_json::from_str::<serde_json::Value>(&content).ok().and_then(|json| {
                    json.get("github.copilot.chat.defaultModel")
                        .or_else(|| json.get("github.copilot.preferredModel"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                })
            })
        });
        results.push(AiProviderStatus {
            id: "copilot".to_string(),
            name: "GitHub Copilot".to_string(),
            is_installed: copilot_config,
            is_running: vscode_running && copilot_config,
            active_model: copilot_model,
            session_status: if vscode_running && copilot_config { "active".to_string() } else if copilot_config { "idle".to_string() } else { "offline".to_string() },
            usage_percent: None, // No local token data
            detail: if vscode_running && copilot_config { Some("VS Code · Autocomplete + Chat".to_string()) } else { Some("VS Code not running".to_string()) },
            icon_color: "#8957e5".to_string(),
            category: "extension".to_string(),
            session_reset_time: Some("No local usage data".to_string()),
            all_models_usage_percent: None,
            all_models_reset_time: None,
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 5. MS COPILOT (Windows Copilot App — mscopilot.exe)
    // ──────────────────────────────────────────────────────────────────────────
    let mscopilot_installed = localappdata.as_ref()
        .map(|d| d.join("Programs").join("Microsoft").join("Copilot").exists()).unwrap_or(false)
        || std::path::Path::new("C:\\Program Files (x86)\\Microsoft\\Copilot\\Application\\mscopilot.exe").exists();
    let mscopilot_running = is_process_running(&["mscopilot"]);

    if mscopilot_installed || mscopilot_running {
        results.push(AiProviderStatus {
            id: "mscopilot".to_string(),
            name: "Microsoft Copilot".to_string(),
            is_installed: mscopilot_installed || mscopilot_running,
            is_running: mscopilot_running,
            active_model: if mscopilot_running { Some("GPT-4o".to_string()) } else { None },
            session_status: if mscopilot_running { "active".to_string() } else { "idle".to_string() },
            usage_percent: None, // No local token data
            detail: if mscopilot_running { Some("Windows Copilot · Active".to_string()) } else { Some("Idle — not running".to_string()) },
            icon_color: "#0078d4".to_string(),
            category: "agent".to_string(),
            session_reset_time: Some("No local usage data".to_string()),
            all_models_usage_percent: None,
            all_models_reset_time: None,
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 6. OLLAMA (Local LLM Server) — probe port 11434
    // ──────────────────────────────────────────────────────────────────────────
    let mut ollama_running = false;
    let mut ollama_model = None;
    let mut ollama_detail = None;

    if let Some(body) = probe_local_http(11434, "/api/ps") {
        ollama_running = true;
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) {
            if let Some(models) = json.get("models").and_then(|m| m.as_array()) {
                if let Some(first) = models.first() {
                    let name = first.get("name").and_then(|n| n.as_str()).unwrap_or("active model");
                    let size_vram = first.get("size_vram").and_then(|v| v.as_u64()).unwrap_or(0);
                    let vram_mb = size_vram / (1024 * 1024);
                    ollama_model = Some(name.to_string());
                    ollama_detail = Some(format!("Loaded · {} MB VRAM", vram_mb));
                }
            }
        }
    }

    if ollama_running && ollama_model.is_none() {
        if let Some(body) = probe_local_http(11434, "/api/tags") {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) {
                if let Some(models) = json.get("models").and_then(|m| m.as_array()) {
                    let count = models.len();
                    ollama_detail = Some(format!("Online · {} models installed", count));
                }
            }
        }
    }

    let ollama_installed = ollama_running
        || localappdata.as_ref().map(|d| d.join("Programs").join("Ollama").exists()).unwrap_or(false)
        || std::path::Path::new("C:\\Users\\hp\\AppData\\Local\\Ollama").exists();

    if ollama_installed || ollama_running {
        results.push(AiProviderStatus {
            id: "ollama".to_string(),
            name: "Ollama".to_string(),
            is_installed: ollama_installed,
            is_running: ollama_running,
            active_model: ollama_model,
            session_status: if ollama_running { "active".to_string() } else if ollama_installed { "idle".to_string() } else { "offline".to_string() },
            usage_percent: None, // No token quota for local models
            detail: if ollama_running { ollama_detail } else { Some("Server offline".to_string()) },
            icon_color: "#e8e8e8".to_string(),
            category: "local_llm".to_string(),
            session_reset_time: Some("Local — no limits".to_string()),
            all_models_usage_percent: None,
            all_models_reset_time: None,
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 7. LM STUDIO — probe port 1234
    // ──────────────────────────────────────────────────────────────────────────
    let mut lmstudio_running = false;
    let mut lmstudio_model = None;
    let mut lmstudio_detail = None;

    if let Some(body) = probe_local_http(1234, "/v1/models") {
        lmstudio_running = true;
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) {
            if let Some(data) = json.get("data").and_then(|d| d.as_array()) {
                if let Some(first) = data.first() {
                    let id = first.get("id").and_then(|i| i.as_str()).unwrap_or("Loaded model");
                    lmstudio_model = Some(id.to_string());
                    lmstudio_detail = Some("Inference server :1234".to_string());
                } else {
                    lmstudio_detail = Some("Running · No model loaded".to_string());
                }
            }
        }
    }

    let lmstudio_installed = lmstudio_running
        || localappdata.as_ref().map(|d| d.join("Programs").join("LM Studio").exists()).unwrap_or(false);

    if lmstudio_installed || lmstudio_running {
        results.push(AiProviderStatus {
            id: "lmstudio".to_string(),
            name: "LM Studio".to_string(),
            is_installed: lmstudio_installed,
            is_running: lmstudio_running,
            active_model: lmstudio_model,
            session_status: if lmstudio_running { "active".to_string() } else if lmstudio_installed { "idle".to_string() } else { "offline".to_string() },
            usage_percent: None, // No token quota for local models
            detail: if lmstudio_running { lmstudio_detail } else { Some("Server offline".to_string()) },
            icon_color: "#a855f7".to_string(),
            category: "local_llm".to_string(),
            session_reset_time: Some("Local — no limits".to_string()),
            all_models_usage_percent: None,
            all_models_reset_time: None,
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 8. WINDSURF (Codeium Editor)
    // ──────────────────────────────────────────────────────────────────────────
    let windsurf_installed = localappdata.as_ref().map(|d| d.join("Programs").join("windsurf").exists()).unwrap_or(false)
        || appdata.as_ref().map(|d| d.join("Windsurf").exists()).unwrap_or(false);
    let windsurf_running = is_process_running(&["windsurf.exe"]);

    if windsurf_installed || windsurf_running {
        results.push(AiProviderStatus {
            id: "windsurf".to_string(),
            name: "Windsurf".to_string(),
            is_installed: windsurf_installed || windsurf_running,
            is_running: windsurf_running,
            active_model: if windsurf_running { Some("cascade".to_string()) } else { None },
            session_status: if windsurf_running { "active".to_string() } else { "idle".to_string() },
            usage_percent: None, // No local token data
            detail: if windsurf_running { Some("Cascade flow active".to_string()) } else { Some("Idle".to_string()) },
            icon_color: "#00b4d8".to_string(),
            category: "editor".to_string(),
            session_reset_time: Some("No local usage data".to_string()),
            all_models_usage_percent: None,
            all_models_reset_time: None,
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 9. DEEPSEEK (Desktop & Browser)
    // ──────────────────────────────────────────────────────────────────────────
    let deepseek_browser = find_browser_window(&["deepseek"]);
    let deepseek_desktop = is_process_running(&["deepseek.exe"]);
    let deepseek_running = deepseek_desktop || deepseek_browser.is_some();

    if deepseek_running {
        results.push(AiProviderStatus {
            id: "deepseek".to_string(),
            name: "DeepSeek".to_string(),
            is_installed: true,
            is_running: true,
            active_model: Some("DeepSeek-R1".to_string()),
            session_status: "active".to_string(),
            usage_percent: None, // No local token data
            detail: if deepseek_browser.is_some() {
                Some("Active in browser tab".to_string())
            } else {
                Some("Active session".to_string())
            },
            icon_color: "#4d6bfe".to_string(),
            category: "browser".to_string(),
            session_reset_time: Some("No local usage data".to_string()),
            all_models_usage_percent: None,
            all_models_reset_time: None,
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 10. GROK (X.ai — Browser & Desktop)
    // ──────────────────────────────────────────────────────────────────────────
    let grok_browser = find_browser_window(&["grok"]);
    let grok_desktop = is_process_running(&["grok.exe"]);
    let grok_running = grok_desktop || grok_browser.is_some();

    if grok_running {
        results.push(AiProviderStatus {
            id: "grok".to_string(),
            name: "Grok".to_string(),
            is_installed: true,
            is_running: true,
            active_model: Some("Grok-2".to_string()),
            session_status: "active".to_string(),
            usage_percent: None, // No local token data
            detail: Some("Grok active in browser".to_string()),
            icon_color: "#ffffff".to_string(),
            category: "browser".to_string(),
            session_reset_time: Some("No local usage data".to_string()),
            all_models_usage_percent: None,
            all_models_reset_time: None,
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 11. KIMI (Moonshot AI — Browser & Desktop)
    // ──────────────────────────────────────────────────────────────────────────
    let kimi_browser = find_browser_window(&["kimi"]);
    let kimi_desktop = is_process_running(&["kimi.exe"]);
    let kimi_running = kimi_desktop || kimi_browser.is_some();

    if kimi_running {
        results.push(AiProviderStatus {
            id: "kimi".to_string(),
            name: "Kimi".to_string(),
            is_installed: true,
            is_running: true,
            active_model: Some("Moonshot Kimi".to_string()),
            session_status: "active".to_string(),
            usage_percent: None, // No local token data
            detail: Some("Kimi active in browser".to_string()),
            icon_color: "#ffffff".to_string(),
            category: "browser".to_string(),
            session_reset_time: Some("No local usage data".to_string()),
            all_models_usage_percent: None,
            all_models_reset_time: None,
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 12. ANTIGRAVITY (Google Antigravity / Gemini)
    // ──────────────────────────────────────────────────────────────────────────
    let antigravity_browser = find_browser_window(&["antigravity", "gemini"]);
    let antigravity_desktop = is_process_running(&["antigravity ide.exe", "antigravity ide", "antigravity.exe", "antigravity"]);
    let antigravity_running = antigravity_desktop || antigravity_browser.is_some();
    let antigravity_installed = localappdata.as_ref().map(|d| d.join("Programs").join("Antigravity IDE").exists()).unwrap_or(false)
        || appdata.as_ref().map(|d| d.join("Antigravity IDE").exists()).unwrap_or(false)
        || home.as_ref().map(|d| d.join(".gemini").join("antigravity-ide").exists()).unwrap_or(false)
        || antigravity_running;

    if antigravity_installed || antigravity_running {
        let quota = fetch_antigravity_quota();

        let (usage_pct, reset_time, all_models_pct, all_models_reset, detail) = if let Some(ref q) = quota {
            let detail_text = if q.claude_blocked {
                format!("Gemini: {:.0}% · Claude/GPT: Weekly limit reached", q.gemini_5h_used.unwrap_or(0.0))
            } else if let Some(w) = q.claude_weekly_used {
                format!("Gemini: {:.0}% · Claude/GPT: {:.0}% used", q.gemini_5h_used.unwrap_or(0.0), w)
            } else {
                "Quota monitored live via local bridge".to_string()
            };
            (
                q.gemini_5h_used,
                q.gemini_5h_reset.clone().or_else(|| Some("5h quota".to_string())),
                q.gemini_weekly_used,
                q.gemini_weekly_reset.clone().or_else(|| Some("Weekly quota".to_string())),
                Some(detail_text),
            )
        } else if antigravity_running {
            (
                None,
                Some("Active session".to_string()),
                None,
                None,
                Some("Antigravity Agent Active".to_string()),
            )
        } else {
            (
                None,
                Some("Not running".to_string()),
                None,
                None,
                Some("Idle — not running".to_string()),
            )
        };

        results.push(AiProviderStatus {
            id: "antigravity".to_string(),
            name: "Antigravity".to_string(),
            is_installed: antigravity_installed,
            is_running: antigravity_running,
            active_model: if antigravity_running { Some("Gemini 3.8 Flash".to_string()) } else { None },
            session_status: if antigravity_running { "active".to_string() } else { "idle".to_string() },
            usage_percent: usage_pct,
            detail,
            icon_color: "#3186ff".to_string(),
            category: "agent".to_string(),
            session_reset_time: reset_time,
            all_models_usage_percent: all_models_pct,
            all_models_reset_time: all_models_reset,
        });
    }

    // Update in-memory cache
    if let Ok(mut guard) = AI_CACHE.lock() {
        *guard = Some((Instant::now(), results.clone()));
    }

    results
}

/// Forces an immediate cache-busting refresh
pub fn refresh_ai_assistants() -> Vec<AiProviderStatus> {
    if let Ok(mut guard) = AI_CACHE.lock() {
        *guard = None;
    }
    scan_ai_assistants()
}

/// Launches or focuses the requested assistant
pub fn launch_ai_assistant(provider_id: &str) {
    match provider_id {
        "cursor" => {
            if let Some(hwnd) = find_process_window(&["cursor.exe"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            let _ = crate::commands::taskbar::launch_app("Cursor.exe".to_string());
        }
        "claude" => {
            if let Some((hwnd, _)) = find_browser_window(&["claude.ai", "claude"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            if let Some(hwnd) = find_process_window(&["claude.exe", "claude-code"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            let home = get_home_dir();
            if home.map(|d| d.join(".claude.json").exists()).unwrap_or(false) {
                let _ = crate::commands::taskbar::launch_app("wt.exe claude".to_string());
            } else {
                let _ = crate::commands::taskbar::launch_app("https://claude.ai".to_string());
            }
        }
        "chatgpt" => {
            if let Some(hwnd) = find_process_window(&["chatgpt.exe"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            if let Some((hwnd, _)) = find_browser_window(&["chatgpt"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            let localappdata = get_localappdata_dir();
            let has_desktop = localappdata.as_ref().map(|d| d.join("Programs").join("ChatGPT").exists()).unwrap_or(false);
            if has_desktop {
                let _ = crate::commands::taskbar::launch_app("ChatGPT.exe".to_string());
            } else {
                let _ = crate::commands::taskbar::launch_app("https://chatgpt.com".to_string());
            }
        }
        "copilot" => {
            if let Some(hwnd) = find_process_window(&["code.exe"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            let _ = crate::commands::taskbar::launch_app("Code.exe".to_string());
        }
        "mscopilot" => {
            if let Some(hwnd) = find_process_window(&["mscopilot"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            if let Some((hwnd, _)) = find_browser_window(&["copilot"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            let _ = crate::commands::taskbar::launch_app("https://copilot.microsoft.com".to_string());
        }
        "windsurf" => {
            if let Some(hwnd) = find_process_window(&["windsurf.exe"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            let _ = crate::commands::taskbar::launch_app("Windsurf.exe".to_string());
        }
        "deepseek" => {
            if let Some((hwnd, _)) = find_browser_window(&["deepseek"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            let _ = crate::commands::taskbar::launch_app("https://chat.deepseek.com".to_string());
        }
        "grok" => {
            if let Some((hwnd, _)) = find_browser_window(&["grok"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            let _ = crate::commands::taskbar::launch_app("https://grok.com".to_string());
        }
        "kimi" => {
            if let Some((hwnd, _)) = find_browser_window(&["kimi"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            let _ = crate::commands::taskbar::launch_app("https://kimi.moonshot.cn".to_string());
        }
        "antigravity" => {
            if let Some(hwnd) = find_process_window(&["antigravity.exe", "antigravity"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            if let Some((hwnd, _)) = find_browser_window(&["gemini", "antigravity"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            let _ = crate::commands::taskbar::launch_app("https://gemini.google.com".to_string());
        }
        "ollama" => {
            let _ = crate::commands::taskbar::launch_app("ollama.exe run llama3.2".to_string());
        }
        "lmstudio" => {
            if let Some(hwnd) = find_process_window(&["lm studio.exe"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            let _ = crate::commands::taskbar::launch_app("LM Studio.exe".to_string());
        }
        _ => {}
    }
}
