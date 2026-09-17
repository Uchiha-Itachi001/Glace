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
    pub category: String, // "editor", "cli", "local_llm", "agent", "desktop", "browser", "extension"
    pub session_reset_time: Option<String>,
    pub all_models_usage_percent: Option<f32>,
    pub all_models_reset_time: Option<String>,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub total_input_tokens: Option<u64>,
    pub total_output_tokens: Option<u64>,
    pub usage_source: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Default)]
pub struct AntigravityInfo {
    pub plan_name: Option<String>,
    pub active_model: Option<String>,
    pub metric1_name: Option<String>,
    pub metric1_rem: Option<f32>,
    pub metric1_reset: Option<String>,
    pub metric2_name: Option<String>,
    pub metric2_rem: Option<f32>,
    pub metric2_reset: Option<String>,
    pub sub_title: Option<String>,
    pub sub_note: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct CursorInfo {
    pub email: Option<String>,
    pub membership: Option<String>,
    pub preferred_model: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct CodexInfo {
    pub model: Option<String>,
    pub email: Option<String>,
    pub plan: Option<String>,
    pub used_percent: Option<f32>,
    pub resets_at_str: Option<String>,
    pub total_tokens: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
}

#[derive(Debug, Clone, Default)]
pub struct CopilotInfo {
    pub plan_name: Option<String>,
    pub active_model: Option<String>,
    pub username: Option<String>,
    pub used_percent: Option<f32>,
    pub remaining_percent: Option<f32>,
    pub resets_at_str: Option<String>,
    pub credits_used: Option<u64>,
    pub credits_entitlement: Option<u64>,
    pub credits_remaining: Option<u64>,
    pub inline_suggestions: bool,
}

#[derive(Default, Debug, Clone)]
pub struct ClaudeTokenStats {
    pub total_input: u64,
    pub total_output: u64,
    pub last_model: Option<String>,
    pub recent_sessions: usize,
    pub sessions_today: usize,
    pub window_input: u64,
    pub window_output: u64,
}
