use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use super::helpers::format_unix_countdown;
use super::types::CodexInfo;

static CODEX_CACHE: Mutex<Option<(Instant, CodexInfo)>> = Mutex::new(None);
const CODEX_CACHE_TTL: Duration = Duration::from_secs(60);

pub fn fetch_codex_info(home: &Path) -> Option<CodexInfo> {
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
