pub mod antigravity;
pub mod chatgpt;
pub mod claude;
pub mod codex;
pub mod copilot;
pub mod cursor;
pub mod helpers;
pub mod local_llm;
pub mod types;

use std::sync::Mutex;
use std::time::{Duration, Instant};

pub use types::*;

use antigravity::fetch_antigravity_info;
use chatgpt::{find_chatgpt_browser_window, get_chatgpt_desktop_exe, is_chatgpt_desktop_installed};
use claude::{
    find_claude_browser_window, fmt_tokens, get_claude_desktop_exe, is_claude_desktop_installed,
    read_claude_token_stats, shorten_model,
};
use codex::fetch_codex_info;
use copilot::fetch_copilot_info;
use cursor::fetch_cursor_info;
use helpers::{
    add_browser_provider, find_browser_window, find_process_window, get_appdata_dir,
    get_home_dir, get_localappdata_dir, get_running_process_names, is_named_process_running,
    is_process_running,
};
use local_llm::{scan_lmstudio, scan_ollama};

static AI_CACHE: Mutex<Option<(Instant, Vec<AiProviderStatus>)>> = Mutex::new(None);
const CACHE_TTL: Duration = Duration::from_millis(1500);

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

    let open_windows = crate::services::window_watcher::enumerate_windows();
    let running_processes = get_running_process_names();

    let home = get_home_dir();
    let appdata = get_appdata_dir();
    let localappdata = get_localappdata_dir();

    let mut results = Vec::new();

    // ──────────────────────────────────────────────────────────────────────────
    // 1. CLAUDE CODE (CLI / agent harness)
    // ──────────────────────────────────────────────────────────────────────────
    let claude_json_path = home.as_ref().map(|d| d.join(".claude.json"));
    let claude_config_dir = home.as_ref().map(|d| d.join(".claude"));
    let claude_config_exists = claude_config_dir.as_ref().map(|p| p.exists()).unwrap_or(false);
    let claude_json_exists = claude_json_path.as_ref().map(|p| p.exists()).unwrap_or(false);
    let claude_cli_running = is_process_running(&open_windows, &["claude-code"])
        || is_named_process_running(&running_processes, "claude-code.exe");
    let claude_running = claude_cli_running;

    if claude_config_exists || claude_json_exists || claude_running {
        let account_email = if let Some(ref path) = claude_json_path {
            if let Ok(content) = std::fs::read_to_string(path) {
                serde_json::from_str::<serde_json::Value>(&content).ok()
                    .and_then(|j| j.get("oauthAccount")
                        .and_then(|a| a.get("emailAddress"))
                        .and_then(|e| e.as_str())
                        .map(|s| s.to_string()))
            } else { None }
        } else { None };

        let token_stats = if let Some(ref h) = home {
            read_claude_token_stats(h)
        } else {
            ClaudeTokenStats::default()
        };

        let configured_claude_model = home.as_ref().and_then(|d| {
            let p = d.join(".claude").join("settings.json");
            std::fs::read_to_string(&p).ok().and_then(|c| {
                serde_json::from_str::<serde_json::Value>(&c).ok().and_then(|j| {
                    j.get("model").and_then(|m| m.as_str()).map(|s| s.to_string())
                })
            })
        });

        let active_model = token_stats.last_model.as_deref().map(shorten_model)
            .or_else(|| configured_claude_model.map(|m| shorten_model(&m)));

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
            id: "claude-code".to_string(),
            name: "Claude Code".to_string(),
            is_installed: claude_config_exists || claude_json_exists,
            is_running: claude_running,
            active_model,
            session_status: if claude_running { "active".to_string() } else if claude_config_exists || claude_json_exists { "idle".to_string() } else { "offline".to_string() },
            usage_percent: None,
            detail,
            icon_color: "#da7756".to_string(),
            category: "cli".to_string(),
            session_reset_time,
            all_models_usage_percent: None,
            all_models_reset_time: None,
            input_tokens: (token_stats.window_input > 0).then_some(token_stats.window_input),
            output_tokens: (token_stats.window_output > 0).then_some(token_stats.window_output),
            total_input_tokens: (token_stats.total_input > 0).then_some(token_stats.total_input),
            total_output_tokens: (token_stats.total_output > 0).then_some(token_stats.total_output),
            usage_source: Some("Claude Code session logs · rolling 5 hours and local history".to_string()),
            tags: vec!["CLI".to_string(), "Agent harness".to_string(), "Local logs".to_string()],
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // CLAUDE (Desktop App & Browser Web Chat)
    // ──────────────────────────────────────────────────────────────────────────
    let claude_desktop_installed = is_claude_desktop_installed();
    let claude_desktop_win = find_process_window(&open_windows, &["claude.exe", "claude desktop"]);
    let claude_desktop_running = claude_desktop_win.is_some() || is_named_process_running(&running_processes, "claude.exe");
    let claude_browser = find_claude_browser_window(&open_windows);
    let claude_app_running = claude_desktop_running || claude_browser.is_some();

    if claude_desktop_installed || claude_app_running {
        let (session_status, detail, category, surface_tag) = if claude_desktop_running {
            ("active".to_string(), Some("Claude Desktop · Active".to_string()), "desktop".to_string(), "Desktop".to_string())
        } else if claude_browser.is_some() {
            ("active".to_string(), Some("Active in browser tab".to_string()), "browser".to_string(), "Web".to_string())
        } else {
            ("idle".to_string(), Some("Desktop app installed".to_string()), "desktop".to_string(), "Desktop".to_string())
        };

        results.push(AiProviderStatus {
            id: "claude".to_string(),
            name: "Claude".to_string(),
            is_installed: claude_desktop_installed || claude_app_running,
            is_running: claude_app_running,
            active_model: None,
            session_status,
            usage_percent: None,
            detail,
            icon_color: "#da7756".to_string(),
            category,
            session_reset_time: if claude_app_running { Some("Active session".to_string()) } else { Some("Idle — not running".to_string()) },
            all_models_usage_percent: None,
            all_models_reset_time: None,
            input_tokens: None,
            output_tokens: None,
            total_input_tokens: None,
            total_output_tokens: None,
            usage_source: Some("Claude Desktop / Web does not expose local token metrics.".to_string()),
            tags: vec![surface_tag, "Desktop / Web".to_string()],
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. CURSOR (AI Code Editor)
    // ──────────────────────────────────────────────────────────────────────────
    let cursor_installed = localappdata.as_ref().map(|d| d.join("Programs").join("cursor").exists()).unwrap_or(false)
        || appdata.as_ref().map(|d| d.join("Cursor").exists()).unwrap_or(false)
        || is_process_running(&open_windows, &["cursor.exe"]);
    let cursor_running = is_process_running(&open_windows, &["cursor.exe"]);

    if cursor_installed || cursor_running {
        let cursor_workspace = appdata.as_ref().and_then(|d| {
            let path = d.join("Cursor").join("User").join("globalStorage").join("storage.json");
            std::fs::read_to_string(&path).ok().and_then(|content| {
                serde_json::from_str::<serde_json::Value>(&content).ok().and_then(|json| {
                    json.get("profileAssociations")
                        .and_then(|p| p.get("workspaces"))
                        .and_then(|w| {
                            w.as_object().and_then(|map| map.keys().last().cloned())
                        })
                        .map(|path_uri| {
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
            active_model: cursor_model,
            session_status: if cursor_running { "active".to_string() } else if cursor_installed { "idle".to_string() } else { "offline".to_string() },
            usage_percent: None,
            detail,
            icon_color: "#ffffff".to_string(),
            category: "editor".to_string(),
            session_reset_time,
            all_models_usage_percent: None,
            all_models_reset_time: None,
            input_tokens: None,
            output_tokens: None,
            total_input_tokens: None,
            total_output_tokens: None,
            usage_source: Some("Cursor does not expose token usage in its local data.".to_string()),
            tags: vec!["IDE".to_string(), "Local config".to_string()],
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. CODEX (CLI / local agent telemetry)
    // ──────────────────────────────────────────────────────────────────────────
    let codex_dir = home.as_ref().map(|d| d.join(".codex"));
    let codex_exists = codex_dir.as_ref().map(|p| p.exists()).unwrap_or(false);
    let codex_running = is_process_running(&open_windows, &["codex.exe", "codex-computer-use.exe"])
        || is_named_process_running(&running_processes, "codex.exe");
    let codex_installed = codex_exists
        || localappdata.as_ref().map(|d| d.join("OpenAI").join("Codex").exists()).unwrap_or(false)
        || codex_running;

    if codex_installed || codex_running {
        let codex_info = home.as_ref().and_then(|h| fetch_codex_info(h));

        let active_model = codex_info.as_ref().and_then(|c| c.model.clone());
        let usage_percent = codex_info.as_ref().and_then(|c| c.used_percent);

        let mut detail_parts = Vec::new();
        if codex_running {
            detail_parts.push("Active local agent".to_string());
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
        } else if codex_running {
            Some("Active session".to_string())
        } else {
            Some("Idle — not running".to_string())
        };

        let session_reset_time = codex_info.as_ref().and_then(|c| c.resets_at_str.as_ref().map(|r| format!("Resets {}", r)))
            .or_else(|| if codex_running { Some("Quota status unavailable".to_string()) } else { None });

        let all_models_reset_time = codex_info.as_ref().and_then(|c| {
            if c.total_tokens > 0 {
                Some(format!("{} total tokens", fmt_tokens(c.total_tokens)))
            } else {
                None
            }
        });

        results.push(AiProviderStatus {
            id: "codex".to_string(),
            name: "Codex".to_string(),
            is_installed: codex_installed,
            is_running: codex_running,
            active_model,
            session_status: if codex_running { "active".to_string() } else if codex_installed { "idle".to_string() } else { "offline".to_string() },
            usage_percent,
            detail,
            icon_color: "#10a37f".to_string(),
            category: "cli".to_string(),
            session_reset_time,
            all_models_usage_percent: None,
            all_models_reset_time,
            input_tokens: codex_info.as_ref().and_then(|c| (c.input_tokens > 0).then_some(c.input_tokens)),
            output_tokens: codex_info.as_ref().and_then(|c| (c.output_tokens > 0).then_some(c.output_tokens)),
            total_input_tokens: None,
            total_output_tokens: None,
            usage_source: codex_info.as_ref().map(|_| "Codex session telemetry and provider-reported rate limits.".to_string()),
            tags: vec!["CLI".to_string(), "Agent harness".to_string(), "Local telemetry".to_string()],
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // CHATGPT (Desktop App & Browser Web Chat)
    // ──────────────────────────────────────────────────────────────────────────
    let chatgpt_desktop_installed = is_chatgpt_desktop_installed();
    let chatgpt_desktop_win = find_process_window(&open_windows, &["chatgpt.exe", "chatgpt"]);
    let chatgpt_desktop_running = chatgpt_desktop_win.is_some() || is_named_process_running(&running_processes, "chatgpt.exe");
    let chatgpt_browser = find_chatgpt_browser_window(&open_windows);
    let chatgpt_app_running = chatgpt_desktop_running || chatgpt_browser.is_some();

    if chatgpt_desktop_installed || chatgpt_app_running {
        let (session_status, detail, category, surface_tag) = if chatgpt_desktop_running {
            ("active".to_string(), Some("ChatGPT Desktop · Active".to_string()), "desktop".to_string(), "Desktop".to_string())
        } else if chatgpt_browser.is_some() {
            ("active".to_string(), Some("Active in browser tab".to_string()), "browser".to_string(), "Web".to_string())
        } else {
            ("idle".to_string(), Some("Desktop app installed".to_string()), "desktop".to_string(), "Desktop".to_string())
        };

        results.push(AiProviderStatus {
            id: "chatgpt".to_string(),
            name: "ChatGPT".to_string(),
            is_installed: chatgpt_desktop_installed || chatgpt_app_running,
            is_running: chatgpt_app_running,
            active_model: None,
            session_status,
            usage_percent: None,
            detail,
            icon_color: "#10a37f".to_string(),
            category,
            session_reset_time: if chatgpt_app_running { Some("Active session".to_string()) } else { Some("Idle — not running".to_string()) },
            all_models_usage_percent: None,
            all_models_reset_time: None,
            input_tokens: None,
            output_tokens: None,
            total_input_tokens: None,
            total_output_tokens: None,
            usage_source: Some("ChatGPT Desktop / Web does not expose local token metrics.".to_string()),
            tags: vec![surface_tag, "Desktop / Web".to_string()],
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 4. GITHUB COPILOT (VS Code extension)
    // ──────────────────────────────────────────────────────────────────────────
    let copilot_config = localappdata.as_ref().map(|d| d.join("github-copilot").exists()).unwrap_or(false)
        || appdata.as_ref().map(|d| d.join("Code").join("User").join("globalStorage").join("github.copilot").exists()).unwrap_or(false)
        || home.as_ref().map(|d| d.join(".config").join("github-copilot").exists()).unwrap_or(false)
        || home.as_ref().map(|d| d.join(".copilot").exists()).unwrap_or(false);
    let vscode_running = is_process_running(&open_windows, &["code.exe", "visual studio code"]);

    if copilot_config || (vscode_running && copilot_config) {
        let info = fetch_copilot_info();

        let (usage_pct, reset_time, detail, active_model, tags) = if let Some(ref inf) = info {
            let mut t = vec![
                "IDE extension".to_string(),
                "VS Code".to_string(),
            ];
            if inf.remaining_percent.is_some() {
                t.push("quota:remaining".to_string());
            }
            t.push("metric1:Credits".to_string());

            if let Some(ref plan) = inf.plan_name {
                t.push(format!("note_title:{}", plan));
            } else {
                t.push("note_title:Copilot Plan".to_string());
            }

            let mut note_parts = Vec::new();
            if let (Some(used), Some(total)) = (inf.credits_used, inf.credits_entitlement) {
                note_parts.push(format!("{} / {} credits used", used, total));
            } else if let Some(rem) = inf.remaining_percent {
                note_parts.push(format!("{:.0}% credits remaining", rem));
            }
            if inf.inline_suggestions {
                note_parts.push("Inline Suggestions: Enabled".to_string());
            }
            if !note_parts.is_empty() {
                t.push(format!("note:{}", note_parts.join(" · ")));
            }

            let detail_str = if vscode_running {
                inf.plan_name.clone().map(|p| format!("VS Code · {}", p))
                    .unwrap_or_else(|| "VS Code · Autocomplete + Chat".to_string())
            } else {
                "VS Code not running".to_string()
            };

            (
                inf.remaining_percent.or(inf.used_percent),
                inf.resets_at_str.clone(),
                Some(detail_str),
                inf.active_model.clone(),
                t,
            )
        } else if vscode_running && copilot_config {
            (
                None,
                Some("VS Code · Active".to_string()),
                Some("VS Code · Autocomplete + Chat".to_string()),
                None,
                vec!["IDE extension".to_string(), "VS Code".to_string()],
            )
        } else {
            (
                None,
                Some("Idle — not running".to_string()),
                Some("VS Code not running".to_string()),
                None,
                vec!["IDE extension".to_string(), "VS Code".to_string()],
            )
        };

        results.push(AiProviderStatus {
            id: "copilot".to_string(),
            name: "GitHub Copilot".to_string(),
            is_installed: copilot_config,
            is_running: vscode_running && copilot_config,
            active_model,
            session_status: if vscode_running && copilot_config { "active".to_string() } else if copilot_config { "idle".to_string() } else { "offline".to_string() },
            usage_percent: usage_pct,
            detail,
            icon_color: "#8957e5".to_string(),
            category: "extension".to_string(),
            session_reset_time: reset_time,
            all_models_usage_percent: None,
            all_models_reset_time: None,
            input_tokens: None,
            output_tokens: None,
            total_input_tokens: None,
            total_output_tokens: None,
            usage_source: Some("GitHub Copilot Live Quota API".to_string()),
            tags,
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 5. MS COPILOT (Windows Copilot App — mscopilot.exe)
    // ──────────────────────────────────────────────────────────────────────────
    let mscopilot_installed = localappdata.as_ref()
        .map(|d| d.join("Programs").join("Microsoft").join("Copilot").exists()).unwrap_or(false)
        || std::path::Path::new("C:\\Program Files (x86)\\Microsoft\\Copilot\\Application\\mscopilot.exe").exists();
    let mscopilot_running = is_process_running(&open_windows, &["mscopilot"]);

    if mscopilot_installed || mscopilot_running {
        results.push(AiProviderStatus {
            id: "mscopilot".to_string(),
            name: "Microsoft Copilot".to_string(),
            is_installed: mscopilot_installed || mscopilot_running,
            is_running: mscopilot_running,
            active_model: None,
            session_status: if mscopilot_running { "active".to_string() } else { "idle".to_string() },
            usage_percent: None,
            detail: if mscopilot_running { Some("Windows Copilot · Active".to_string()) } else { Some("Idle — not running".to_string()) },
            icon_color: "#0078d4".to_string(),
            category: "agent".to_string(),
            session_reset_time: Some("No local usage data".to_string()),
            all_models_usage_percent: None,
            all_models_reset_time: None,
            input_tokens: None,
            output_tokens: None,
            total_input_tokens: None,
            total_output_tokens: None,
            usage_source: Some("Microsoft Copilot does not expose token usage in its local data.".to_string()),
            tags: vec!["Desktop".to_string()],
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 6. OLLAMA (Local LLM Server)
    // ──────────────────────────────────────────────────────────────────────────
    if let Some(status) = scan_ollama(&running_processes, localappdata.as_ref()) {
        results.push(status);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 7. LM STUDIO (Local LLM Server)
    // ──────────────────────────────────────────────────────────────────────────
    if let Some(status) = scan_lmstudio(&running_processes, localappdata.as_ref()) {
        results.push(status);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 8. WINDSURF (Codeium Editor)
    // ──────────────────────────────────────────────────────────────────────────
    let windsurf_installed = localappdata.as_ref().map(|d| d.join("Programs").join("windsurf").exists()).unwrap_or(false)
        || appdata.as_ref().map(|d| d.join("Windsurf").exists()).unwrap_or(false);
    let windsurf_running = is_process_running(&open_windows, &["windsurf.exe"]);

    if windsurf_installed || windsurf_running {
        results.push(AiProviderStatus {
            id: "windsurf".to_string(),
            name: "Windsurf".to_string(),
            is_installed: windsurf_installed || windsurf_running,
            is_running: windsurf_running,
            active_model: None,
            session_status: if windsurf_running { "active".to_string() } else { "idle".to_string() },
            usage_percent: None,
            detail: if windsurf_running { Some("Cascade flow active".to_string()) } else { Some("Idle".to_string()) },
            icon_color: "#00b4d8".to_string(),
            category: "editor".to_string(),
            session_reset_time: Some("No local usage data".to_string()),
            all_models_usage_percent: None,
            all_models_reset_time: None,
            input_tokens: None,
            output_tokens: None,
            total_input_tokens: None,
            total_output_tokens: None,
            usage_source: Some("Windsurf does not expose token usage in its local data.".to_string()),
            tags: vec!["IDE".to_string()],
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 9. DEEPSEEK (Desktop & Browser)
    // ──────────────────────────────────────────────────────────────────────────
    let deepseek_browser = find_browser_window(&open_windows, &["deepseek"]);
    let deepseek_desktop = is_process_running(&open_windows, &["deepseek.exe"]);
    let deepseek_running = deepseek_desktop || deepseek_browser.is_some();

    if deepseek_running {
        results.push(AiProviderStatus {
            id: "deepseek".to_string(),
            name: "DeepSeek".to_string(),
            is_installed: true,
            is_running: true,
            active_model: None,
            session_status: "active".to_string(),
            usage_percent: None,
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
            input_tokens: None,
            output_tokens: None,
            total_input_tokens: None,
            total_output_tokens: None,
            usage_source: Some("DeepSeek browser sessions do not provide local token telemetry.".to_string()),
            tags: vec!["Web".to_string()],
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 10. GROK (X.ai — Browser & Desktop)
    // ──────────────────────────────────────────────────────────────────────────
    let grok_browser = find_browser_window(&open_windows, &["grok"]);
    let grok_desktop = is_process_running(&open_windows, &["grok.exe"]);
    let grok_running = grok_desktop || grok_browser.is_some();

    if grok_running {
        results.push(AiProviderStatus {
            id: "grok".to_string(),
            name: "Grok".to_string(),
            is_installed: true,
            is_running: true,
            active_model: None,
            session_status: "active".to_string(),
            usage_percent: None,
            detail: Some("Grok active in browser".to_string()),
            icon_color: "#ffffff".to_string(),
            category: "browser".to_string(),
            session_reset_time: Some("No local usage data".to_string()),
            all_models_usage_percent: None,
            all_models_reset_time: None,
            input_tokens: None,
            output_tokens: None,
            total_input_tokens: None,
            total_output_tokens: None,
            usage_source: Some("Grok browser sessions do not provide local token telemetry.".to_string()),
            tags: vec!["Web".to_string()],
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 11. KIMI (Moonshot AI — Browser & Desktop)
    // ──────────────────────────────────────────────────────────────────────────
    let kimi_browser = find_browser_window(&open_windows, &["kimi"]);
    let kimi_desktop = is_process_running(&open_windows, &["kimi.exe"]);
    let kimi_running = kimi_desktop || kimi_browser.is_some();

    if kimi_running {
        results.push(AiProviderStatus {
            id: "kimi".to_string(),
            name: "Kimi".to_string(),
            is_installed: true,
            is_running: true,
            active_model: None,
            session_status: "active".to_string(),
            usage_percent: None,
            detail: Some("Kimi active in browser".to_string()),
            icon_color: "#ffffff".to_string(),
            category: "browser".to_string(),
            session_reset_time: Some("No local usage data".to_string()),
            all_models_usage_percent: None,
            all_models_reset_time: None,
            input_tokens: None,
            output_tokens: None,
            total_input_tokens: None,
            total_output_tokens: None,
            usage_source: Some("Kimi browser sessions do not provide local token telemetry.".to_string()),
            tags: vec!["Web".to_string()],
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 12. ADDITIONAL CLOUD ASSISTANTS (Browser / Desktop)
    // ──────────────────────────────────────────────────────────────────────────
    add_browser_provider(&open_windows, &mut results, "perplexity", "Perplexity", &["perplexity.ai", "perplexity"], &["perplexity.exe"], "#20b8cd");
    add_browser_provider(&open_windows, &mut results, "gemini", "Gemini", &["gemini.google.com", "gemini"], &[], "#4285f4");
    add_browser_provider(&open_windows, &mut results, "glm", "GLM (Z.ai)", &["chat.z.ai", "glm"], &[], "#2563eb");
    add_browser_provider(&open_windows, &mut results, "minimax", "MiniMax", &["minimax.io", "minimax"], &[], "#f97316");
    add_browser_provider(&open_windows, &mut results, "meta-ai", "Meta AI", &["meta.ai"], &[], "#0866ff");

    // ──────────────────────────────────────────────────────────────────────────
    // 13. ANTIGRAVITY IDE
    // ──────────────────────────────────────────────────────────────────────────
    let antigravity_browser = find_browser_window(&open_windows, &["antigravity"]);
    let antigravity_desktop = is_process_running(&open_windows, &["antigravity ide.exe", "antigravity ide", "antigravity.exe", "antigravity"])
        || is_named_process_running(&running_processes, "antigravity.exe")
        || is_named_process_running(&running_processes, "antigravity ide.exe");
    let antigravity_installed = localappdata.as_ref().map(|d| d.join("Programs").join("Antigravity IDE").exists()).unwrap_or(false)
        || appdata.as_ref().map(|d| d.join("Antigravity IDE").exists()).unwrap_or(false)
        || home.as_ref().map(|d| d.join(".gemini").join("antigravity-ide").exists()).unwrap_or(false)
        || antigravity_desktop;

    if antigravity_installed || antigravity_desktop || antigravity_browser.is_some() {
        let info = fetch_antigravity_info(&running_processes);
        let antigravity_running = antigravity_desktop || antigravity_browser.is_some() || info.is_some();

        let (usage_pct, reset_time, all_models_pct, all_models_reset, detail, active_model, tags) = if let Some(ref inf) = info {
            let mut t = vec![
                "IDE".to_string(),
                "quota:remaining".to_string(),
            ];
            if let Some(ref m1) = inf.metric1_name {
                t.push(format!("metric1:{}", m1));
            }
            if let Some(ref m2) = inf.metric2_name {
                t.push(format!("metric2:{}", m2));
            }
            if let Some(ref st) = inf.sub_title {
                t.push(format!("note_title:{}", st));
            }
            if let Some(ref sn) = inf.sub_note {
                t.push(format!("note:{}", sn));
            }

            (
                inf.metric1_rem,
                inf.metric1_reset.clone(),
                inf.metric2_rem,
                inf.metric2_reset.clone(),
                inf.plan_name.clone().or_else(|| Some("Antigravity Agent Active".to_string())),
                inf.active_model.clone(),
                t,
            )
        } else if antigravity_running {
            (
                None,
                Some("Active session".to_string()),
                None,
                None,
                Some("Antigravity Agent Active".to_string()),
                None,
                vec!["IDE".to_string()],
            )
        } else {
            (
                None,
                Some("Not running".to_string()),
                None,
                None,
                Some("Idle — not running".to_string()),
                None,
                vec!["IDE".to_string()],
            )
        };

        results.push(AiProviderStatus {
            id: "antigravity".to_string(),
            name: "Antigravity".to_string(),
            is_installed: antigravity_installed || antigravity_running,
            is_running: antigravity_running,
            active_model,
            session_status: if antigravity_running { "active".to_string() } else { "idle".to_string() },
            usage_percent: usage_pct,
            detail,
            icon_color: "#3186ff".to_string(),
            category: "agent".to_string(),
            session_reset_time: reset_time,
            all_models_usage_percent: all_models_pct,
            all_models_reset_time: all_models_reset,
            input_tokens: None,
            output_tokens: None,
            total_input_tokens: None,
            total_output_tokens: None,
            tags,
            usage_source: info.map(|_| "Dynamic quota returned by Antigravity language server.".to_string()),
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
    let open_windows = crate::services::window_watcher::enumerate_windows();
    match provider_id {
        "cursor" => {
            if let Some(hwnd) = find_process_window(&open_windows, &["cursor.exe"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            let _ = crate::commands::taskbar::launch_app("Cursor.exe".to_string());
        }
        "claude-code" => {
            if let Some(hwnd) = find_process_window(&open_windows, &["claude.exe", "claude-code"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            let _ = crate::commands::taskbar::launch_app("wt.exe claude".to_string());
        }
        "claude" => {
            if let Some(hwnd) = find_process_window(&open_windows, &["claude.exe", "claude desktop"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            if let Some((hwnd, _)) = find_claude_browser_window(&open_windows) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            if let Some(path) = get_claude_desktop_exe() {
                let _ = crate::commands::taskbar::launch_app(path.to_string_lossy().to_string());
                return;
            }
            let _ = crate::commands::taskbar::launch_app("https://claude.ai".to_string());
        }
        "codex" => {
            if let Some(hwnd) = find_process_window(&open_windows, &["codex.exe", "codex-computer-use.exe"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            let _ = crate::commands::taskbar::launch_app("wt.exe codex".to_string());
        }
        "chatgpt" => {
            if let Some(hwnd) = find_process_window(&open_windows, &["chatgpt.exe", "chatgpt"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            if let Some((hwnd, _)) = find_chatgpt_browser_window(&open_windows) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            if let Some(path) = get_chatgpt_desktop_exe() {
                let _ = crate::commands::taskbar::launch_app(path.to_string_lossy().to_string());
                return;
            }
            if is_chatgpt_desktop_installed() {
                let _ = crate::commands::taskbar::launch_app("chatgpt://".to_string());
                return;
            }
            let _ = crate::commands::taskbar::launch_app("https://chatgpt.com".to_string());
        }
        "copilot" => {
            if let Some(hwnd) = find_process_window(&open_windows, &["code.exe"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            let _ = crate::commands::taskbar::launch_app("Code.exe".to_string());
        }
        "mscopilot" => {
            if let Some(hwnd) = find_process_window(&open_windows, &["mscopilot"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            if let Some((hwnd, _)) = find_browser_window(&open_windows, &["copilot"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            let _ = crate::commands::taskbar::launch_app("https://copilot.microsoft.com".to_string());
        }
        "windsurf" => {
            if let Some(hwnd) = find_process_window(&open_windows, &["windsurf.exe"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            let _ = crate::commands::taskbar::launch_app("Windsurf.exe".to_string());
        }
        "deepseek" => {
            if let Some((hwnd, _)) = find_browser_window(&open_windows, &["deepseek"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            let _ = crate::commands::taskbar::launch_app("https://chat.deepseek.com".to_string());
        }
        "grok" => {
            if let Some((hwnd, _)) = find_browser_window(&open_windows, &["grok"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            let _ = crate::commands::taskbar::launch_app("https://grok.com".to_string());
        }
        "kimi" => {
            if let Some((hwnd, _)) = find_browser_window(&open_windows, &["kimi"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            let _ = crate::commands::taskbar::launch_app("https://kimi.moonshot.cn".to_string());
        }
        "perplexity" => {
            if let Some((hwnd, _)) = find_browser_window(&open_windows, &["perplexity.ai"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            let _ = crate::commands::taskbar::launch_app("https://www.perplexity.ai".to_string());
        }
        "gemini" => {
            if let Some((hwnd, _)) = find_browser_window(&open_windows, &["gemini.google.com"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            let _ = crate::commands::taskbar::launch_app("https://gemini.google.com".to_string());
        }
        "glm" => {
            if let Some((hwnd, _)) = find_browser_window(&open_windows, &["chat.z.ai", "glm"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            let _ = crate::commands::taskbar::launch_app("https://chat.z.ai".to_string());
        }
        "minimax" => {
            if let Some((hwnd, _)) = find_browser_window(&open_windows, &["minimax.io", "minimax"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            let _ = crate::commands::taskbar::launch_app("https://www.minimax.io".to_string());
        }
        "meta-ai" => {
            if let Some((hwnd, _)) = find_browser_window(&open_windows, &["meta.ai"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            let _ = crate::commands::taskbar::launch_app("https://www.meta.ai".to_string());
        }
        "antigravity" => {
            if let Some(hwnd) = find_process_window(&open_windows, &["antigravity.exe", "antigravity"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            if let Some((hwnd, _)) = find_browser_window(&open_windows, &["gemini", "antigravity"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            let _ = crate::commands::taskbar::launch_app("https://gemini.google.com".to_string());
        }
        "ollama" => {
            let _ = crate::commands::taskbar::launch_app("ollama.exe run llama3.2".to_string());
        }
        "lmstudio" => {
            if let Some(hwnd) = find_process_window(&open_windows, &["lm studio.exe"]) {
                crate::services::window_watcher::focus_window(hwnd);
                return;
            }
            let _ = crate::commands::taskbar::launch_app("LM Studio.exe".to_string());
        }
        _ => {}
    }
}
