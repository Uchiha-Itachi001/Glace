use crate::services::ai_host::{self, AiProviderStatus};

#[tauri::command]
pub fn get_ai_assistants_status() -> Vec<AiProviderStatus> {
    ai_host::scan_ai_assistants()
}

#[tauri::command]
pub fn refresh_ai_assistants() -> Vec<AiProviderStatus> {
    ai_host::refresh_ai_assistants()
}

#[tauri::command]
pub fn launch_ai_assistant(provider_id: String) {
    ai_host::launch_ai_assistant(&provider_id);
}
