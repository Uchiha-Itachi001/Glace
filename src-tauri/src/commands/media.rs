use crate::services::media_host;

#[tauri::command]
pub fn media_toggle_play_pause() {
    media_host::toggle_play_pause();
}

#[tauri::command]
pub fn media_next_track() {
    media_host::next_track();
}

#[tauri::command]
pub fn media_prev_track() {
    media_host::prev_track();
}

#[tauri::command]
pub fn media_volume_up() {
    media_host::volume_up();
}

#[tauri::command]
pub fn media_volume_down() {
    media_host::volume_down();
}

#[tauri::command]
pub fn media_volume_mute() {
    media_host::volume_mute();
}

#[tauri::command]
pub fn media_seek(position_sec: u64) {
    media_host::seek_media(position_sec);
}

#[tauri::command]
pub fn media_focus_app() {
    media_host::focus_media_app();
}

#[tauri::command]
pub fn get_media_session_info() -> Option<media_host::MediaSessionInfo> {
    media_host::get_current_media_session()
}
