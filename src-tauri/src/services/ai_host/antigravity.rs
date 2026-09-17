use std::sync::Mutex;
use std::time::{Duration, Instant};
use super::helpers::{format_reset_countdown, CREATE_NO_WINDOW};
use super::types::AntigravityInfo;

static ANTIGRAVITY_CACHE: Mutex<Option<(Instant, Option<AntigravityInfo>)>> = Mutex::new(None);
const QUOTA_CACHE_TTL: Duration = Duration::from_secs(30);

pub fn fetch_antigravity_info(running_processes: &std::collections::HashSet<String>) -> Option<AntigravityInfo> {
    if let Ok(guard) = ANTIGRAVITY_CACHE.lock() {
        if let Some((cached_time, ref info)) = *guard {
            if cached_time.elapsed() < QUOTA_CACHE_TTL {
                return info.clone();
            }
        }
    }

    // Fast check: If no running process name contains "language_server", Antigravity LS is not running
    let has_ls = running_processes.iter().any(|p| p.contains("language_server"));
    if !has_ls {
        if let Ok(mut guard) = ANTIGRAVITY_CACHE.lock() {
            *guard = Some((Instant::now(), None));
        }
        return None;
    }

    let result = fetch_antigravity_info_uncached();
    if let Ok(mut guard) = ANTIGRAVITY_CACHE.lock() {
        *guard = Some((Instant::now(), result.clone()));
    }
    result
}

fn fetch_antigravity_info_uncached() -> Option<AntigravityInfo> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

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
            let quota_url = format!("https://127.0.0.1:{}/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary", port);
            let mut curl = std::process::Command::new("curl.exe");
            curl.args(&[
                "-k", "-s", "--max-time", "2",
                "-X", "POST",
                &quota_url,
                "-H", &format!("x-codeium-csrf-token: {}", csrf),
                "-H", "Content-Type: application/json",
                "-d", "{}",
            ]);
            curl.creation_flags(CREATE_NO_WINDOW);

            let quota_val: Option<serde_json::Value> = curl.output().ok().and_then(|out| {
                if out.status.success() {
                    serde_json::from_slice(&out.stdout).ok()
                } else {
                    None
                }
            });

            let Some(val) = quota_val else {
                continue;
            };

            let mut info = AntigravityInfo::default();

            if let Some(resp) = val.get("response") {
                if let Some(groups) = resp.get("groups").and_then(|g| g.as_array()) {
                    // Group 0: Primary models (Gemini)
                    if let Some(g0) = groups.get(0) {
                        if let Some(buckets) = g0.get("buckets").and_then(|b| b.as_array()) {
                            for b in buckets {
                                let b_id = b.get("bucketId").and_then(|id| id.as_str()).unwrap_or("");
                                let window = b.get("window").and_then(|w| w.as_str()).unwrap_or("");
                                let d_name = b.get("displayName").and_then(|d| d.as_str()).unwrap_or("");
                                let clean_name = d_name.trim_end_matches(" Remaining").trim().to_string();
                                let rem = b.get("remainingFraction").and_then(|r| r.as_f64()).unwrap_or(1.0) as f32;
                                let reset = b.get("resetTime").and_then(|t| t.as_str()).map(format_reset_countdown);
                                let rem_pct = (rem * 100.0).clamp(0.0, 100.0);

                                if window == "5h" || b_id.contains("5h") {
                                    info.metric1_name = Some(clean_name);
                                    info.metric1_rem = Some(rem_pct);
                                    info.metric1_reset = reset;
                                } else if window == "weekly" || b_id.contains("weekly") {
                                    info.metric2_name = Some(clean_name);
                                    info.metric2_rem = Some(rem_pct);
                                    info.metric2_reset = reset;
                                }
                            }
                        }
                    }

                    // Group 1+: Secondary models (e.g. Claude & GPT models)
                    if let Some(g1) = groups.get(1) {
                        info.sub_title = g1.get("displayName").and_then(|d| d.as_str()).map(String::from);
                        if let Some(buckets) = g1.get("buckets").and_then(|b| b.as_array()) {
                            let active_b = buckets.iter().find(|b| !b.get("disabled").and_then(|d| d.as_bool()).unwrap_or(false))
                                .or_else(|| buckets.first());

                            if let Some(b) = active_b {
                                let rem = b.get("remainingFraction").and_then(|r| r.as_f64()).unwrap_or(1.0) as f32;
                                let reset_str = b.get("resetTime").and_then(|t| t.as_str()).map(format_reset_countdown)
                                    .unwrap_or_else(|| "soon".to_string());
                                if rem <= 0.001 {
                                    info.sub_note = Some(format!("Weekly limit reached · {}", reset_str));
                                } else {
                                    info.sub_note = Some(format!("{:.0}% Remaining · {}", rem * 100.0, reset_str));
                                }
                            }
                        }
                    }
                }
            }

            // Fetch GetUserStatus for real plan and active model
            let status_url = format!("https://127.0.0.1:{}/exa.language_server_pb.LanguageServerService/GetUserStatus", port);
            let mut curl_status = std::process::Command::new("curl.exe");
            curl_status.args(&[
                "-k", "-s", "--max-time", "2",
                "-X", "POST",
                &status_url,
                "-H", &format!("x-codeium-csrf-token: {}", csrf),
                "-H", "Content-Type: application/json",
                "-d", "{}",
            ]);
            curl_status.creation_flags(CREATE_NO_WINDOW);

            if let Ok(status_out) = curl_status.output() {
                if status_out.status.success() {
                    if let Ok(s_val) = serde_json::from_slice::<serde_json::Value>(&status_out.stdout) {
                        if let Some(u_status) = s_val.get("userStatus") {
                            info.plan_name = u_status.get("userTier")
                                .and_then(|t| t.get("name"))
                                .and_then(|n| n.as_str())
                                .or_else(|| {
                                    u_status.get("planStatus")
                                        .and_then(|p| p.get("planInfo"))
                                        .and_then(|i| i.get("planName"))
                                        .and_then(|n| n.as_str())
                                })
                                .map(String::from);

                            if let Some(cascade) = u_status.get("cascadeModelConfigData") {
                                let default_model = cascade.get("defaultOverrideModelConfig")
                                    .and_then(|d| d.get("modelOrAlias"))
                                    .and_then(|m| m.get("model"))
                                    .and_then(|m| m.as_str());

                                if let Some(target) = default_model {
                                    if let Some(configs) = cascade.get("clientModelConfigs").and_then(|c| c.as_array()) {
                                        for c in configs {
                                            let m_id = c.get("modelOrAlias")
                                                .and_then(|m| m.get("model"))
                                                .and_then(|m| m.as_str());
                                            if m_id == Some(target) {
                                                info.active_model = c.get("label").and_then(|l| l.as_str()).map(String::from);
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

            return Some(info);
        }
    }
    None
}
