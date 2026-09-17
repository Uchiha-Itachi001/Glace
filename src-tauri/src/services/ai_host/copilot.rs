use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use super::helpers::{format_reset_countdown, get_appdata_dir, run_hidden, CREATE_NO_WINDOW};
use super::types::CopilotInfo;

static GITHUB_TOKEN_CACHE: Mutex<Option<(Instant, Option<String>)>> = Mutex::new(None);
const GITHUB_TOKEN_TTL: Duration = Duration::from_secs(60);

const QUOTA_CACHE_TTL: Duration = Duration::from_secs(30);

fn parse_gh_token_from_file(path: &Path) -> Option<String> {
    let content = std::fs::read_to_string(path).ok()?;
    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("oauth_token:") {
            let tok = rest.trim().trim_matches('"').trim_matches('\'').trim();
            if !tok.is_empty() {
                return Some(tok.to_string());
            }
        }
    }
    None
}

pub fn get_github_token() -> Option<String> {
    if let Ok(guard) = GITHUB_TOKEN_CACHE.lock() {
        if let Some((cached_time, ref tok)) = *guard {
            if cached_time.elapsed() < GITHUB_TOKEN_TTL {
                return tok.clone();
            }
        }
    }

    let token = get_github_token_uncached();
    if let Ok(mut guard) = GITHUB_TOKEN_CACHE.lock() {
        *guard = Some((Instant::now(), token.clone()));
    }
    token
}

fn get_github_token_uncached() -> Option<String> {
    // 1. Direct file read (0.05ms) from ~/.config/gh/hosts.yml or %APPDATA%\GitHub CLI\hosts.yml
    if let Some(home) = dirs::home_dir() {
        let p = home.join(".config").join("gh").join("hosts.yml");
        if let Some(tok) = parse_gh_token_from_file(&p) {
            return Some(tok);
        }
    }
    if let Some(appdata) = dirs::data_dir() {
        let p = appdata.join("GitHub CLI").join("hosts.yml");
        if let Some(tok) = parse_gh_token_from_file(&p) {
            return Some(tok);
        }
    }

    // 2. Direct 'gh auth token' execution
    if let Some(t) = run_hidden("gh", &["auth", "token"]) {
        let trimmed = t.trim();
        if !trimmed.is_empty() && !trimmed.contains("error") && !trimmed.contains("not logged") {
            return Some(trimmed.to_string());
        }
    }

    // 3. Direct path to GitHub CLI on Windows
    let standard_gh = "C:\\Program Files\\GitHub CLI\\gh.exe";
    if Path::new(standard_gh).exists() {
        if let Some(t) = run_hidden(standard_gh, &["auth", "token"]) {
            let trimmed = t.trim();
            if !trimmed.is_empty() && !trimmed.contains("error") && !trimmed.contains("not logged") {
                return Some(trimmed.to_string());
            }
        }
    }

    None
}

pub fn clean_copilot_model_name(raw: &str) -> String {
    let clean = raw.strip_prefix("copilotcli/").unwrap_or(raw);
    match clean {
        "claude-sonnet-4.6" | "claude-sonnet-4-6" => "Claude Sonnet 4.6".to_string(),
        "claude-opus-4.6" | "claude-opus-4-6" => "Claude Opus 4.6".to_string(),
        "claude-3.7-sonnet" | "claude-3-7-sonnet" => "Claude 3.7 Sonnet".to_string(),
        "claude-3.5-sonnet" | "claude-3-5-sonnet" => "Claude 3.5 Sonnet".to_string(),
        "gpt-4o" => "GPT-4o".to_string(),
        "gpt-4o-mini" => "GPT-4o mini".to_string(),
        "o1" => "o1".to_string(),
        "o3-mini" => "o3-mini".to_string(),
        other => {
            let parts: Vec<String> = other.split(&['-', '/'][..])
                .map(|p| {
                    let mut chars = p.chars();
                    match chars.next() {
                        None => String::new(),
                        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                    }
                })
                .collect();
            parts.join(" ")
        }
    }
}

static COPILOT_CACHE: Mutex<Option<(Instant, Option<CopilotInfo>)>> = Mutex::new(None);

pub fn fetch_copilot_info() -> Option<CopilotInfo> {
    if let Ok(guard) = COPILOT_CACHE.lock() {
        if let Some((cached_time, ref info)) = *guard {
            if cached_time.elapsed() < QUOTA_CACHE_TTL {
                return info.clone();
            }
        }
    }

    let result = fetch_copilot_info_uncached();
    if let Ok(mut guard) = COPILOT_CACHE.lock() {
        *guard = Some((Instant::now(), result.clone()));
    }
    result
}

fn fetch_copilot_info_uncached() -> Option<CopilotInfo> {
    let token = get_github_token()?;
    let mut curl = std::process::Command::new("curl.exe");
    curl.args(&[
        "-s", "--max-time", "3",
        "https://api.github.com/copilot_internal/user",
        "-H", &format!("Authorization: Bearer {}", token.trim()),
        "-H", "User-Agent: GithubCopilot/1.0",
        "-H", "Accept: application/json",
    ]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        curl.creation_flags(CREATE_NO_WINDOW);
    }

    let output = curl.output().ok()?;
    if !output.status.success() {
        return None;
    }

    let json: serde_json::Value = serde_json::from_slice(&output.stdout).ok()?;
    let mut info = CopilotInfo::default();

    info.username = json.get("login").and_then(|v| v.as_str()).map(String::from);

    let sku = json.get("access_type_sku").and_then(|v| v.as_str()).unwrap_or("");
    let plan = json.get("copilot_plan").and_then(|v| v.as_str()).unwrap_or("");
    info.plan_name = Some(match sku {
        "free_educational_quota" => "Copilot Education".to_string(),
        "free" => "Copilot Free".to_string(),
        _ => match plan {
            "individual" => "Copilot Pro".to_string(),
            "business" => "Copilot Business".to_string(),
            "enterprise" => "Copilot Enterprise".to_string(),
            _ => "GitHub Copilot".to_string(),
        },
    });

    if let Some(reset_utc) = json.get("quota_reset_date_utc").and_then(|v| v.as_str()) {
        info.resets_at_str = Some(format_reset_countdown(reset_utc));
    } else if let Some(reset_date) = json.get("quota_reset_date").and_then(|v| v.as_str()) {
        let rfc = format!("{}T00:00:00Z", reset_date);
        info.resets_at_str = Some(format_reset_countdown(&rfc));
    }

    if let Some(snapshots) = json.get("quota_snapshots").and_then(|v| v.as_object()) {
        if let Some(prem) = snapshots.get("premium_interactions") {
            let rem_pct = prem.get("percent_remaining").and_then(|v| v.as_f64()).map(|f| f as f32);
            let used = prem.get("credits_used").and_then(|v| v.as_u64());
            let ent = prem.get("entitlement").and_then(|v| v.as_u64());
            let rem = prem.get("remaining").and_then(|v| v.as_u64());

            info.remaining_percent = rem_pct;
            if let Some(rem_p) = rem_pct {
                info.used_percent = Some((100.0 - rem_p).clamp(0.0, 100.0));
            }
            info.credits_used = used;
            info.credits_entitlement = ent;
            info.credits_remaining = rem;
        } else if let Some(chat) = snapshots.get("chat") {
            let rem_pct = chat.get("percent_remaining").and_then(|v| v.as_f64()).map(|f| f as f32);
            info.remaining_percent = rem_pct;
            if let Some(rem_p) = rem_pct {
                info.used_percent = Some((100.0 - rem_p).clamp(0.0, 100.0));
            }
        }
    }

    let appdata = get_appdata_dir();
    if let Some(ref d) = appdata {
        let settings_path = d.join("Code").join("User").join("settings.json");
        if let Ok(content) = std::fs::read_to_string(&settings_path) {
            if let Ok(settings_json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(model_str) = settings_json.get("github.copilot.chat.defaultModel")
                    .or_else(|| settings_json.get("github.copilot.preferredModel"))
                    .and_then(|v| v.as_str())
                {
                    info.active_model = Some(clean_copilot_model_name(model_str));
                }
                if let Some(inline_en) = settings_json.get("editor.inlineSuggest.enabled").and_then(|v| v.as_bool()) {
                    info.inline_suggestions = inline_en;
                } else {
                    info.inline_suggestions = true;
                }
            }
        }
    }

    if info.active_model.is_none() {
        if let Some(ref d) = appdata {
            let state_path = d.join("Code").join("User").join("globalStorage").join("state.vscdb");
            if state_path.exists() {
                let py_cmd = r#"
import sqlite3, os
db = os.path.expandvars(r'%APPDATA%\Code\User\globalStorage\state.vscdb')
if os.path.exists(db):
    try:
        con = sqlite3.connect(f'file:{db}?mode=ro&immutable=1', uri=True)
        cur = con.cursor()
        for k in ['chat.currentLanguageModel.panel.copilotcli', 'chat.currentLanguageModel.panel.copilot-cloud-agent', 'chat.currentLanguageModel.editor']:
            row = cur.execute("SELECT value FROM ItemTable WHERE key=?", (k,)).fetchone()
            if row and row[0]:
                print(row[0])
                break
    except: pass
"#;
                if let Some(out) = run_hidden("python", &["-c", py_cmd]) {
                    let m = out.trim().trim_matches('"');
                    if !m.is_empty() {
                        info.active_model = Some(clean_copilot_model_name(m));
                    }
                }
            }
        }
    }

    if info.active_model.is_none() {
        info.active_model = Some("Claude Sonnet 4.6".to_string());
    }

    Some(info)
}
