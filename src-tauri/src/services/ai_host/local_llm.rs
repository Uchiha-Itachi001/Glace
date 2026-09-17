use std::collections::HashSet;
use std::path::PathBuf;
use super::helpers::probe_local_http;
use super::types::AiProviderStatus;

pub fn scan_ollama(
    running_processes: &HashSet<String>,
    localappdata: Option<&PathBuf>,
) -> Option<AiProviderStatus> {
    let mut ollama_running = false;
    let mut ollama_model = None;
    let mut ollama_detail = None;

    let ollama_proc = running_processes.iter().any(|p| p.contains("ollama"));
    if ollama_proc {
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
    }

    let ollama_installed = ollama_running
        || localappdata.map(|d| d.join("Programs").join("Ollama").exists()).unwrap_or(false);

    if ollama_installed || ollama_running {
        Some(AiProviderStatus {
            id: "ollama".to_string(),
            name: "Ollama".to_string(),
            is_installed: ollama_installed,
            is_running: ollama_running,
            active_model: ollama_model,
            session_status: if ollama_running { "active".to_string() } else if ollama_installed { "idle".to_string() } else { "offline".to_string() },
            usage_percent: None,
            detail: if ollama_running { ollama_detail } else { Some("Server offline".to_string()) },
            icon_color: "#e8e8e8".to_string(),
            category: "local_llm".to_string(),
            session_reset_time: Some("Local — no limits".to_string()),
            all_models_usage_percent: None,
            all_models_reset_time: None,
            input_tokens: None,
            output_tokens: None,
            total_input_tokens: None,
            total_output_tokens: None,
            usage_source: Some("Ollama exposes loaded models, not cumulative token usage.".to_string()),
            tags: vec!["Local server".to_string(), "Local model".to_string()],
        })
    } else {
        None
    }
}

pub fn scan_lmstudio(
    running_processes: &HashSet<String>,
    localappdata: Option<&PathBuf>,
) -> Option<AiProviderStatus> {
    let mut lmstudio_running = false;
    let mut lmstudio_model = None;
    let mut lmstudio_detail = None;

    let lmstudio_proc = running_processes.iter().any(|p| p.contains("lmstudio") || p.contains("lm studio"));
    if lmstudio_proc {
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
    }

    let lmstudio_installed = lmstudio_running
        || localappdata.map(|d| d.join("Programs").join("LM Studio").exists()).unwrap_or(false);

    if lmstudio_installed || lmstudio_running {
        Some(AiProviderStatus {
            id: "lmstudio".to_string(),
            name: "LM Studio".to_string(),
            is_installed: lmstudio_installed,
            is_running: lmstudio_running,
            active_model: lmstudio_model,
            session_status: if lmstudio_running { "active".to_string() } else if lmstudio_installed { "idle".to_string() } else { "offline".to_string() },
            usage_percent: None,
            detail: if lmstudio_running { lmstudio_detail } else { Some("Server offline".to_string()) },
            icon_color: "#a855f7".to_string(),
            category: "local_llm".to_string(),
            session_reset_time: Some("Local — no limits".to_string()),
            all_models_usage_percent: None,
            all_models_reset_time: None,
            input_tokens: None,
            output_tokens: None,
            total_input_tokens: None,
            total_output_tokens: None,
            usage_source: Some("LM Studio exposes loaded models, not cumulative token usage.".to_string()),
            tags: vec!["Local server".to_string(), "Local model".to_string()],
        })
    } else {
        None
    }
}
