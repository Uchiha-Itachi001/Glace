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

static AI_CACHE: Mutex<Option<(Instant, Vec<AiProviderStatus>)>> = Mutex::new(None);
const CACHE_TTL: Duration = Duration::from_millis(1500);

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
    dirs::data_dir() // %APPDATA% on Windows
}

fn get_localappdata_dir() -> Option<PathBuf> {
    dirs::data_local_dir() // %LOCALAPPDATA% on Windows
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
    let claude_config_exists = claude_json_path.as_ref().map(|p| p.exists()).unwrap_or(false);
    let claude_dir_exists = home.as_ref().map(|d| d.join(".claude").exists()).unwrap_or(false);
    let claude_cli_running = is_process_running(&["claude.exe", "claude-code"]);
    let claude_browser = find_browser_window(&["claude.ai", "claude"]);
    let claude_running = claude_cli_running || claude_browser.is_some();

    if claude_config_exists || claude_dir_exists || claude_running {
        // Read account email from .claude.json if available
        let (account_email, primary_key_exists) = if let Some(ref path) = claude_json_path {
            if let Ok(content) = std::fs::read_to_string(path) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                    let email = json.get("oauthAccount")
                        .and_then(|a| a.get("emailAddress"))
                        .and_then(|e| e.as_str())
                        .map(|s| s.to_string());
                    let has_key = json.get("primaryApiKey")
                        .and_then(|k| k.as_str())
                        .map(|k| !k.is_empty())
                        .unwrap_or(false);
                    (email, has_key)
                } else {
                    (None, false)
                }
            } else {
                (None, false)
            }
        } else {
            (None, false)
        };

        // Count today's sessions from history.jsonl
        let today_sessions = home.as_ref().and_then(|d| {
            let hist = d.join(".claude").join("history.jsonl");
            std::fs::read_to_string(&hist).ok().map(|content| {
                let today_ms = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64;
                let day_start_ms = today_ms - (today_ms % 86_400_000);
                content.lines()
                    .filter_map(|l| serde_json::from_str::<serde_json::Value>(l).ok())
                    .filter(|j| {
                        j.get("timestamp")
                            .and_then(|t| t.as_u64())
                            .map(|t| t >= day_start_ms)
                            .unwrap_or(false)
                    })
                    .count()
            })
        }).unwrap_or(0);

        let detail = if claude_cli_running {
            if let Some(ref email) = account_email {
                Some(format!("Active CLI · {} sessions today · {}", today_sessions, email))
            } else {
                Some(format!("Active CLI · {} sessions today", today_sessions))
            }
        } else if claude_browser.is_some() {
            Some("Active in browser tab (claude.ai)".to_string())
        } else if let Some(ref email) = account_email {
            Some(format!("{} sessions today · {}", today_sessions, email))
        } else {
            Some("Idle — not running".to_string())
        };

        let usage_pct = if claude_browser.is_some() && !claude_cli_running && !claude_config_exists {
            Some(20.0)
        } else if primary_key_exists || claude_config_exists {
            // Rough heuristic: more sessions → higher shown usage
            let pct = (today_sessions * 15).min(95) as f32;
            Some(if pct < 5.0 { 5.0 } else { pct })
        } else {
            None
        };

        results.push(AiProviderStatus {
            id: "claude".to_string(),
            name: "Claude Code".to_string(),
            is_installed: claude_config_exists || claude_dir_exists,
            is_running: claude_running,
            active_model: Some("claude-sonnet-4-5".to_string()),
            session_status: if claude_running { "active".to_string() } else if claude_config_exists { "idle".to_string() } else { "offline".to_string() },
            usage_percent: usage_pct,
            detail,
            icon_color: "#da7756".to_string(), // Anthropic brand orange-terracotta
            category: "cli".to_string(),
            session_reset_time: if today_sessions > 0 { Some(format!("{} msgs today", today_sessions)) } else { Some("No activity today".to_string()) },
            all_models_usage_percent: usage_pct,
            all_models_reset_time: Some("Resets at midnight".to_string()),
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

        let detail = if cursor_running {
            if let Some(ref ws) = cursor_workspace {
                Some(format!("Editing · {}", ws))
            } else {
                Some("Agent Mode · Active".to_string())
            }
        } else {
            Some("Idle — not running".to_string())
        };

        results.push(AiProviderStatus {
            id: "cursor".to_string(),
            name: "Cursor".to_string(),
            is_installed: cursor_installed,
            is_running: cursor_running,
            active_model: if cursor_running { Some("claude-sonnet-4-5".to_string()) } else { None },
            session_status: if cursor_running { "active".to_string() } else if cursor_installed { "idle".to_string() } else { "offline".to_string() },
            usage_percent: if cursor_running { Some(65.0) } else { Some(0.0) },
            detail,
            icon_color: "#ffffff".to_string(), // Cursor white
            category: "editor".to_string(),
            session_reset_time: Some("Monthly fast requests".to_string()),
            all_models_usage_percent: Some(40.0),
            all_models_reset_time: Some("Resets 1st of month".to_string()),
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. CHATGPT (OpenAI Desktop & Browser)
    // ──────────────────────────────────────────────────────────────────────────
    let chatgpt_browser = find_browser_window(&["chatgpt"]);
    let chatgpt_desktop = is_process_running(&["chatgpt.exe"]);
    let chatgpt_running = chatgpt_desktop || chatgpt_browser.is_some();
    let chatgpt_installed = localappdata.as_ref().map(|d| d.join("Programs").join("ChatGPT").exists()).unwrap_or(false)
        || appdata.as_ref().map(|d| d.join("ChatGPT").exists() || d.join("OpenAI").exists()).unwrap_or(false)
        || chatgpt_running;

    if chatgpt_installed || chatgpt_running {
        let detail = if chatgpt_desktop {
            Some("Active desktop session".to_string())
        } else if chatgpt_browser.is_some() {
            Some("Active in browser tab".to_string())
        } else {
            Some("Idle — not running".to_string())
        };

        results.push(AiProviderStatus {
            id: "chatgpt".to_string(),
            name: "ChatGPT".to_string(),
            is_installed: chatgpt_installed,
            is_running: chatgpt_running,
            active_model: if chatgpt_running { Some("GPT-4o".to_string()) } else { None },
            session_status: if chatgpt_running { "active".to_string() } else { "idle".to_string() },
            usage_percent: if chatgpt_running { Some(45.0) } else { Some(0.0) },
            detail,
            icon_color: "#10a37f".to_string(), // OpenAI green
            category: if chatgpt_browser.is_some() && !chatgpt_desktop { "browser".to_string() } else { "agent".to_string() },
            session_reset_time: Some("Unlimited (Pro/Web)".to_string()),
            all_models_usage_percent: Some(20.0),
            all_models_reset_time: Some("Resets tomorrow".to_string()),
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
        results.push(AiProviderStatus {
            id: "copilot".to_string(),
            name: "GitHub Copilot".to_string(),
            is_installed: copilot_config,
            is_running: vscode_running && copilot_config,
            active_model: if vscode_running && copilot_config { Some("GPT-4o / claude-3.5".to_string()) } else { None },
            session_status: if vscode_running && copilot_config { "active".to_string() } else if copilot_config { "idle".to_string() } else { "offline".to_string() },
            usage_percent: if vscode_running && copilot_config { Some(35.0) } else { Some(0.0) },
            detail: if vscode_running && copilot_config { Some("VS Code · Autocomplete + Chat".to_string()) } else { Some("VS Code not running".to_string()) },
            icon_color: "#8957e5".to_string(), // GitHub purple
            category: "extension".to_string(),
            session_reset_time: Some("Daily quota".to_string()),
            all_models_usage_percent: Some(25.0),
            all_models_reset_time: Some("Unlimited completions".to_string()),
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
            usage_percent: if mscopilot_running { Some(55.0) } else { Some(0.0) },
            detail: if mscopilot_running { Some("Windows Copilot · Active".to_string()) } else { Some("Idle — not running".to_string()) },
            icon_color: "#0078d4".to_string(), // Microsoft blue
            category: "agent".to_string(),
            session_reset_time: Some("Unlimited (M365)".to_string()),
            all_models_usage_percent: Some(30.0),
            all_models_reset_time: Some("M365 subscription".to_string()),
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
            usage_percent: if ollama_running { Some(80.0) } else { None },
            detail: if ollama_running { ollama_detail } else { Some("Server offline".to_string()) },
            icon_color: "#e8e8e8".to_string(), // Ollama light gray/white
            category: "local_llm".to_string(),
            session_reset_time: Some("Local — no limits".to_string()),
            all_models_usage_percent: Some(0.0),
            all_models_reset_time: Some("No quota".to_string()),
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
            usage_percent: if lmstudio_running { Some(75.0) } else { None },
            detail: if lmstudio_running { lmstudio_detail } else { Some("Server offline".to_string()) },
            icon_color: "#a855f7".to_string(),
            category: "local_llm".to_string(),
            session_reset_time: Some("Local — no limits".to_string()),
            all_models_usage_percent: Some(0.0),
            all_models_reset_time: Some("No quota".to_string()),
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
            active_model: if windsurf_running { Some("Cascade / claude-3.5".to_string()) } else { None },
            session_status: if windsurf_running { "active".to_string() } else { "idle".to_string() },
            usage_percent: if windsurf_running { Some(50.0) } else { Some(0.0) },
            detail: if windsurf_running { Some("Cascade flow active".to_string()) } else { Some("Idle".to_string()) },
            icon_color: "#00b4d8".to_string(),
            category: "editor".to_string(),
            session_reset_time: Some("Resets monthly".to_string()),
            all_models_usage_percent: Some(30.0),
            all_models_reset_time: Some("Flow credits active".to_string()),
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
            usage_percent: Some(40.0),
            detail: if deepseek_browser.is_some() {
                Some("Active in browser tab".to_string())
            } else {
                Some("Active session".to_string())
            },
            icon_color: "#4d6bfe".to_string(),
            category: "browser".to_string(),
            session_reset_time: Some("Free / Uncapped".to_string()),
            all_models_usage_percent: Some(15.0),
            all_models_reset_time: Some("Daily quota".to_string()),
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
            usage_percent: Some(30.0),
            detail: Some("Grok active in browser".to_string()),
            icon_color: "#ffffff".to_string(),
            category: "browser".to_string(),
            session_reset_time: Some("X Premium".to_string()),
            all_models_usage_percent: Some(10.0),
            all_models_reset_time: Some("Hourly quota".to_string()),
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
            usage_percent: Some(25.0),
            detail: Some("Kimi active in browser".to_string()),
            icon_color: "#ffffff".to_string(),
            category: "browser".to_string(),
            session_reset_time: Some("Moonshot AI".to_string()),
            all_models_usage_percent: Some(10.0),
            all_models_reset_time: Some("Daily quota".to_string()),
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 12. ANTIGRAVITY (Google Antigravity / Gemini)
    // ──────────────────────────────────────────────────────────────────────────
    let antigravity_browser = find_browser_window(&["antigravity", "gemini"]);
    let antigravity_desktop = is_process_running(&["antigravity.exe", "antigravity ide", "antigravity"]);
    let antigravity_running = antigravity_desktop || antigravity_browser.is_some();
    let antigravity_installed = localappdata.as_ref().map(|d| d.join("Programs").join("Antigravity IDE").exists()).unwrap_or(false)
        || antigravity_running;

    if antigravity_installed || antigravity_running {
        results.push(AiProviderStatus {
            id: "antigravity".to_string(),
            name: "Antigravity".to_string(),
            is_installed: antigravity_installed,
            is_running: antigravity_running,
            active_model: if antigravity_running { Some("Gemini 2.5 Flash".to_string()) } else { None },
            session_status: if antigravity_running { "active".to_string() } else { "idle".to_string() },
            usage_percent: if antigravity_running { Some(50.0) } else { Some(0.0) },
            detail: if antigravity_running {
                if antigravity_browser.is_some() && !antigravity_desktop {
                    Some("Gemini active in browser".to_string())
                } else {
                    Some("Antigravity Agent Active".to_string())
                }
            } else {
                Some("Idle — not running".to_string())
            },
            icon_color: "#3186ff".to_string(),
            category: "agent".to_string(),
            session_reset_time: Some("Google DeepMind".to_string()),
            all_models_usage_percent: Some(20.0),
            all_models_reset_time: Some("Workspace session".to_string()),
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
