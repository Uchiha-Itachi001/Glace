use serde::{Deserialize, Serialize};
use windows::core::BOOL;
use windows::Win32::Foundation::{HWND, LPARAM};
use windows::Win32::UI::Input::KeyboardAndMouse::{keybd_event, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP};
use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowTextW, GetWindowThreadProcessId, IsWindow, IsWindowVisible};
use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession,
    GlobalSystemMediaTransportControlsSessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaSessionInfo {
    pub title: String,
    pub artist: String,
    pub album_title: Option<String>,
    pub is_playing: bool,
    pub duration_sec: u64,
    pub current_sec: u64,
    pub album_art_base64: Option<String>,
}

use std::sync::Mutex;
use std::time::{Duration, Instant};

struct MediaCache {
    manager: Option<GlobalSystemMediaTransportControlsSessionManager>,
    last_fetch: Option<Instant>,
    cached_session: Option<MediaSessionInfo>,
    active_session: Option<GlobalSystemMediaTransportControlsSession>,
    active_app_id: String,
    active_title: String,
}

static MEDIA_CACHE: Mutex<MediaCache> = Mutex::new(MediaCache {
    manager: None,
    last_fetch: None,
    cached_session: None,
    active_session: None,
    active_app_id: String::new(),
    active_title: String::new(),
});

struct SendThumb(windows::Storage::Streams::IRandomAccessStreamReference);
unsafe impl Send for SendThumb {}
unsafe impl Sync for SendThumb {}

impl SendThumb {
    pub fn extract(&self) -> Option<String> {
        extract_thumbnail_base64(&self.0)
    }
}

struct ArtCacheEntry {
    title: String,
    artist: String,
    art_base64: Option<String>,
}

static ART_CACHE: Mutex<Option<ArtCacheEntry>> = Mutex::new(None);
static ART_FETCHING_KEY: Mutex<Option<(String, String)>> = Mutex::new(None);

fn extract_thumbnail_base64(thumb_ref: &windows::Storage::Streams::IRandomAccessStreamReference) -> Option<String> {
    use base64::engine::general_purpose::STANDARD as BASE64;
    use base64::Engine;
    use windows::Storage::Streams::DataReader;

    let stream = thumb_ref.OpenReadAsync().ok()?.get().ok()?;
    let size = stream.Size().ok()? as usize;
    if size == 0 || size > 8 * 1024 * 1024 {
        return None;
    }

    let reader = DataReader::CreateDataReader(&stream).ok()?;
    let load_op = reader.LoadAsync(size as u32).ok()?;
    let loaded = load_op.get().ok()?;
    if (loaded as usize) < size {
        return None;
    }

    let mut bytes = vec![0u8; size];
    reader.ReadBytes(&mut bytes).ok()?;

    let mime = if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        "image/png"
    } else if bytes.starts_with(&[0x52, 0x49, 0x46, 0x46]) {
        "image/webp"
    } else {
        "image/jpeg"
    };

    Some(format!("data:{};base64,{}", mime, BASE64.encode(&bytes)))
}

/// Clean local file paths, file extensions, and formatting from raw song/video titles
pub fn clean_media_title(raw: &str) -> String {
    let mut title = raw.trim();

    // 1. Strip file URI prefix
    if title.starts_with("file:///") {
        title = title.trim_start_matches("file:///");
    }

    // 2. If title is a full file path (e.g. C:\Downloads\Video.mp4 or /path/to/song.mp3), extract filename
    if let Some(pos) = title.rfind(['\\', '/']) {
        title = &title[pos + 1..];
    }

    // 3. Strip common audio & video file extensions
    let extensions = [
        ".mp3", ".mp4", ".mkv", ".wav", ".flac", ".avi", ".mov", ".webm",
        ".m4a", ".aac", ".opus", ".ogg", ".wma", ".wmv", ".m4v", ".3gp",
        ".ts", ".m2ts", ".vob", ".iso"
    ];
    let mut title_owned = title.to_string();
    for ext in extensions {
        if title_owned.to_lowercase().ends_with(ext) {
            let len = title_owned.len() - ext.len();
            title_owned.truncate(len);
            break;
        }
    }

    // 4. Strip browser download duplicate counters e.g. " [1]", " (1)", " [2]" from end of filename
    let trimmed = title_owned.trim();
    if let Some(stripped) = trimmed.strip_suffix(']') {
        if let Some(pos) = stripped.rfind('[') {
            let inner = &stripped[pos + 1..];
            if inner.chars().all(|c| c.is_ascii_digit()) {
                title_owned = stripped[..pos].trim().to_string();
            }
        }
    } else if let Some(stripped) = trimmed.strip_suffix(')') {
        if let Some(pos) = stripped.rfind('(') {
            let inner = &stripped[pos + 1..];
            if inner.chars().all(|c| c.is_ascii_digit()) {
                title_owned = stripped[..pos].trim().to_string();
            }
        }
    }

    // 5. Replace underscores with spaces if no space exists (e.g. My_Cool_Track -> My Cool Track)
    if title_owned.contains('_') && !title_owned.contains(' ') {
        title_owned = title_owned.replace('_', " ");
    }

    title_owned.trim().to_string()
}

/// Helper to parse "Artist - Title" strings from window titles
fn parse_artist_title(raw_track: &str, default_player: &str) -> (String, String) {
    if let Some((a, t)) = raw_track.split_once(" - ") {
        let clean_a = a.trim().to_string();
        let clean_t = clean_media_title(t);
        if !clean_t.is_empty() && !clean_a.is_empty() {
            return (clean_a, clean_t);
        }
    }
    let clean = clean_media_title(raw_track);
    (default_player.to_string(), clean)
}

/// Derive user-friendly application / service names from SourceAppUserModelId
fn get_friendly_source_name(app_id: &str) -> String {
    let lower = app_id.to_lowercase();
    if lower.contains("zunemusic") || lower.contains("mediaplayer") {
        "Media Player".to_string()
    } else if lower.contains("zunevideo") || lower.contains("movies") {
        "Movies & TV".to_string()
    } else if lower.contains("spotify") {
        "Spotify".to_string()
    } else if lower.contains("vlc") {
        "VLC media player".to_string()
    } else if lower.contains("chrome") {
        "Chrome".to_string()
    } else if lower.contains("edge") || lower.contains("edg") {
        "Edge".to_string()
    } else if lower.contains("brave") {
        "Brave".to_string()
    } else if lower.contains("firefox") {
        "Firefox".to_string()
    } else if lower.contains("opera") {
        "Opera".to_string()
    } else if lower.contains("wmplayer") {
        "Windows Media Player".to_string()
    } else if !app_id.trim().is_empty() {
        if let Some(pos) = app_id.find('!') {
            app_id[pos + 1..].replace(".App", "").replace(".exe", "")
        } else {
            app_id.replace(".exe", "")
        }
    } else {
        "Local Media".to_string()
    }
}

struct LocalMediaWin {
    exe: String,
    title: String,
}

/// Win32 Local Media Player Fallback Scanner (VLC, MPC-HC, MPV, PotPlayer, foobar2000, AIMP, WMP, KMPlayer, MusicBee, GOM)
/// Scans all top-level windows directly so background/unfocused playback is always detected
fn scan_win32_media_players() -> Option<MediaSessionInfo> {
    let mut media_windows: Vec<LocalMediaWin> = Vec::new();

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        if !IsWindow(Some(hwnd)).as_bool() {
            return BOOL(1);
        }

        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return BOOL(1);
        }

        let (exe_name, _) = crate::services::window_watcher::get_window_exe_path(hwnd);
        let exe_lower = exe_name.to_lowercase();

        let is_media_app = exe_lower == "vlc.exe"
            || exe_lower.starts_with("mpc-hc")
            || exe_lower.starts_with("mpc-be")
            || exe_lower.starts_with("potplayer")
            || exe_lower == "mpv.exe"
            || exe_lower == "foobar2000.exe"
            || exe_lower == "aimp.exe"
            || exe_lower == "wmplayer.exe"
            || exe_lower == "musicbee.exe"
            || exe_lower.starts_with("kmplayer")
            || exe_lower.starts_with("gom");

        if is_media_app {
            let mut title_buf = [0u16; 512];
            let len = GetWindowTextW(hwnd, &mut title_buf);
            if len > 0 {
                let title = String::from_utf16_lossy(&title_buf[..len as usize]);
                let list = &mut *(lparam.0 as *mut Vec<LocalMediaWin>);
                list.push(LocalMediaWin {
                    exe: exe_lower,
                    title,
                });
            }
        }

        BOOL(1)
    }

    unsafe {
        let _ = EnumWindows(Some(enum_proc), LPARAM(&mut media_windows as *mut _ as isize));
    }

    for win in media_windows {
        let exe_lower = win.exe;
        let title_raw = win.title.trim();
        if title_raw.is_empty() {
            continue;
        }

        if exe_lower == "vlc.exe" {
            // Idle state: "VLC media player"
            if title_raw.eq_ignore_ascii_case("VLC media player") {
                continue;
            }
            let track_raw = title_raw.trim_end_matches(" - VLC media player").trim();
            let (artist, title) = parse_artist_title(track_raw, "VLC media player");
            if !title.is_empty() {
                return Some(MediaSessionInfo {
                    title,
                    artist,
                    album_title: None,
                    is_playing: true,
                    duration_sec: 0,
                    current_sec: 0,
                    album_art_base64: None,
                });
            }
        } else if exe_lower.starts_with("mpc-hc") || exe_lower.starts_with("mpc-be") {
            if title_raw.eq_ignore_ascii_case("Media Player Classic Home Cinema")
                || title_raw.eq_ignore_ascii_case("MPC-HC")
                || title_raw.eq_ignore_ascii_case("MPC-BE")
            {
                continue;
            }
            let track_raw = title_raw
                .trim_end_matches(" - MPC-HC")
                .trim_end_matches(" - MPC-BE")
                .trim();
            let (artist, title) = parse_artist_title(track_raw, "MPC-HC");
            if !title.is_empty() {
                return Some(MediaSessionInfo {
                    title,
                    artist,
                    album_title: None,
                    is_playing: true,
                    duration_sec: 0,
                    current_sec: 0,
                    album_art_base64: None,
                });
            }
        } else if exe_lower.starts_with("potplayer") {
            if title_raw.eq_ignore_ascii_case("PotPlayer")
                || title_raw.eq_ignore_ascii_case("Daum PotPlayer")
            {
                continue;
            }
            let track_raw = title_raw
                .trim_end_matches(" - PotPlayer")
                .trim_end_matches(" - Daum PotPlayer")
                .trim();
            let (artist, title) = parse_artist_title(track_raw, "PotPlayer");
            if !title.is_empty() {
                return Some(MediaSessionInfo {
                    title,
                    artist,
                    album_title: None,
                    is_playing: true,
                    duration_sec: 0,
                    current_sec: 0,
                    album_art_base64: None,
                });
            }
        } else if exe_lower == "mpv.exe" {
            if title_raw.eq_ignore_ascii_case("mpv") {
                continue;
            }
            let track_raw = title_raw
                .trim_start_matches("mpv - ")
                .trim_end_matches(" - mpv")
                .trim();
            let (artist, title) = parse_artist_title(track_raw, "mpv");
            if !title.is_empty() {
                return Some(MediaSessionInfo {
                    title,
                    artist,
                    album_title: None,
                    is_playing: true,
                    duration_sec: 0,
                    current_sec: 0,
                    album_art_base64: None,
                });
            }
        } else if exe_lower == "foobar2000.exe" {
            if title_raw.eq_ignore_ascii_case("foobar2000") {
                continue;
            }
            let track_raw = title_raw.trim_end_matches(" [foobar2000]").trim();
            let (artist, title) = parse_artist_title(track_raw, "foobar2000");
            if !title.is_empty() {
                return Some(MediaSessionInfo {
                    title,
                    artist,
                    album_title: None,
                    is_playing: true,
                    duration_sec: 0,
                    current_sec: 0,
                    album_art_base64: None,
                });
            }
        } else if exe_lower == "aimp.exe" {
            if title_raw.eq_ignore_ascii_case("AIMP") {
                continue;
            }
            let track_raw = title_raw.trim_end_matches(" - AIMP").trim();
            let (artist, title) = parse_artist_title(track_raw, "AIMP");
            if !title.is_empty() {
                return Some(MediaSessionInfo {
                    title,
                    artist,
                    album_title: None,
                    is_playing: true,
                    duration_sec: 0,
                    current_sec: 0,
                    album_art_base64: None,
                });
            }
        } else if exe_lower == "wmplayer.exe" {
            if title_raw.eq_ignore_ascii_case("Windows Media Player") {
                continue;
            }
            let track_raw = title_raw.trim_end_matches(" - Windows Media Player").trim();
            let (artist, title) = parse_artist_title(track_raw, "Windows Media Player");
            if !title.is_empty() {
                return Some(MediaSessionInfo {
                    title,
                    artist,
                    album_title: None,
                    is_playing: true,
                    duration_sec: 0,
                    current_sec: 0,
                    album_art_base64: None,
                });
            }
        } else if exe_lower == "musicbee.exe" {
            if title_raw.eq_ignore_ascii_case("MusicBee") {
                continue;
            }
            let track_raw = title_raw.trim_end_matches(" - MusicBee").trim();
            let (artist, title) = parse_artist_title(track_raw, "MusicBee");
            if !title.is_empty() {
                return Some(MediaSessionInfo {
                    title,
                    artist,
                    album_title: None,
                    is_playing: true,
                    duration_sec: 0,
                    current_sec: 0,
                    album_art_base64: None,
                });
            }
        } else if exe_lower.starts_with("kmplayer") {
            if title_raw.eq_ignore_ascii_case("KMPlayer") {
                continue;
            }
            let track_raw = title_raw.trim_end_matches(" - KMPlayer").trim();
            let (artist, title) = parse_artist_title(track_raw, "KMPlayer");
            if !title.is_empty() {
                return Some(MediaSessionInfo {
                    title,
                    artist,
                    album_title: None,
                    is_playing: true,
                    duration_sec: 0,
                    current_sec: 0,
                    album_art_base64: None,
                });
            }
        } else if exe_lower.starts_with("gom") {
            if title_raw.eq_ignore_ascii_case("GOM Player") {
                continue;
            }
            let track_raw = title_raw.trim_end_matches(" - GOM Player").trim();
            let (artist, title) = parse_artist_title(track_raw, "GOM Player");
            if !title.is_empty() {
                return Some(MediaSessionInfo {
                    title,
                    artist,
                    album_title: None,
                    is_playing: true,
                    duration_sec: 0,
                    current_sec: 0,
                    album_art_base64: None,
                });
            }
        }
    }

    None
}

pub fn get_current_media_session() -> Option<MediaSessionInfo> {
    let now = Instant::now();

    // 1. Check TTL cache snapshot (450ms) to serve concurrent UI widgets without COM churn
    if let Ok(guard) = MEDIA_CACHE.lock() {
        if let Some(last_time) = guard.last_fetch {
            if now.duration_since(last_time) < Duration::from_millis(450) {
                return guard.cached_session.clone();
            }
        }
    }

    // Ensure COM apartment is initialized on calling thread
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }

    let mut cache = MEDIA_CACHE.lock().ok()?;

    // 2. Reuse cached session manager or request a new one
    if cache.manager.is_none() {
        if let Ok(async_op) = GlobalSystemMediaTransportControlsSessionManager::RequestAsync() {
            if let Ok(mgr) = async_op.get() {
                cache.manager = Some(mgr);
            }
        }
    }

    let mut selected_session: Option<GlobalSystemMediaTransportControlsSession> = None;
    let mut fallback_session: Option<GlobalSystemMediaTransportControlsSession> = None;

    let mgr_opt = cache.manager.clone();
    if let Some(mgr) = mgr_opt {
        // Priority 1: Prioritize session that is ACTIVELY PLAYING across all apps & local players
        if let Ok(sessions) = mgr.GetSessions() {
            for session in sessions {
                let is_playing = if let Ok(playback_info) = session.GetPlaybackInfo() {
                    playback_info
                        .PlaybackStatus()
                        .map(|s| s == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing)
                        .unwrap_or(false)
                } else {
                    false
                };

                let props_opt = session.TryGetMediaPropertiesAsync().ok().and_then(|op| op.get().ok());
                let t = props_opt.as_ref().and_then(|p| p.Title().ok()).map(|s| s.to_string()).unwrap_or_default();
                let a = props_opt.as_ref().and_then(|p| p.Artist().ok()).map(|s| s.to_string()).unwrap_or_default();
                let has_title_or_artist = !t.trim().is_empty() || !a.trim().is_empty();

                if is_playing && (has_title_or_artist || session.SourceAppUserModelId().is_ok()) {
                    selected_session = Some(session);
                    break;
                }

                if fallback_session.is_none() && has_title_or_artist {
                    fallback_session = Some(session);
                }
            }
        } else {
            // Invalidate stale manager if GetSessions fails
            cache.manager = None;
        }

        // Priority 2: Fallback to Windows current session or first valid session
        if selected_session.is_none() {
            selected_session = mgr.GetCurrentSession().ok().or(fallback_session);
        }
    }

    let mut session_info: Option<MediaSessionInfo> = None;
    let mut resolved_app_id = String::new();
    let mut resolved_title = String::new();

    if let Some(ref session) = selected_session {
        let playback_info = session.GetPlaybackInfo().ok();
        let is_playing = if let Some(info) = playback_info {
            if let Ok(status) = info.PlaybackStatus() {
                status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing
            } else {
                false
            }
        } else {
            false
        };

        let app_id = session.SourceAppUserModelId().map(|s| s.to_string()).unwrap_or_default();
        let props = session.TryGetMediaPropertiesAsync().ok().and_then(|op| op.get().ok());

        let (raw_title, raw_artist, album_title, send_thumb_opt) = if let Some(ref p) = props {
            let t = p.Title().map(|s| s.to_string()).unwrap_or_default();
            let a = p.Artist().map(|s| s.to_string()).unwrap_or_default();
            let alb = p.AlbumTitle().map(|s| s.to_string()).ok();
            let thumb = p.Thumbnail().ok().map(SendThumb);
            (t, a, alb, thumb)
        } else {
            (String::new(), String::new(), None, None)
        };

        // Extract clean title with local path/extension filtering
        let title = if !raw_title.trim().is_empty() {
            clean_media_title(&raw_title)
        } else if let Some(ref alb) = album_title {
            if !alb.trim().is_empty() {
                clean_media_title(alb)
            } else {
                get_friendly_source_name(&app_id)
            }
        } else {
            get_friendly_source_name(&app_id)
        };

        resolved_app_id = app_id.clone();
        resolved_title = title.clone();

        // Extract clean artist or fallback to application/source name
        let artist = if !raw_artist.trim().is_empty() {
            raw_artist.trim().to_string()
        } else {
            get_friendly_source_name(&app_id)
        };

        if !title.trim().is_empty() || is_playing {
            let timeline = session.GetTimelineProperties().ok();
            let (current_sec, duration_sec) = if let Some(tl) = timeline {
                let start_ticks = tl.StartTime().map(|d| d.Duration).unwrap_or(0);
                let end_ticks = tl.EndTime().map(|d| d.Duration).unwrap_or(0);
                let pos_ticks = tl.Position().map(|d| d.Duration).unwrap_or(0);
                let last_updated = tl.LastUpdatedTime().map(|d| d.UniversalTime).unwrap_or(0);

                let duration_ticks = if end_ticks > start_ticks {
                    end_ticks - start_ticks
                } else if let Ok(max_seek) = tl.MaxSeekTime() {
                    max_seek.Duration
                } else {
                    0
                };

                let duration_sec = if duration_ticks > 0 {
                    (duration_ticks / 10_000_000) as u64
                } else {
                    0
                };

                let mut current_ticks = if pos_ticks >= start_ticks {
                    pos_ticks - start_ticks
                } else {
                    pos_ticks
                };

                // If playing and LastUpdatedTime is valid, project forward with real elapsed wall clock time
                if is_playing && last_updated > 0 {
                    let now_filetime = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| (d.as_nanos() / 100) as i64 + 116_444_736_000_000_000)
                        .unwrap_or(0);

                    if now_filetime > last_updated {
                        let elapsed = now_filetime - last_updated;
                        current_ticks += elapsed;
                    }
                }

                if duration_ticks > 0 && current_ticks > duration_ticks {
                    current_ticks = duration_ticks;
                }

                let current_sec = if current_ticks > 0 {
                    (current_ticks / 10_000_000) as u64
                } else {
                    0
                };

                (current_sec, duration_sec)
            } else {
                (0, 0)
            };

            // Check if we already have the thumbnail in cache
            let mut album_art_base64: Option<String> = None;
            let mut needs_fetch = false;

            if let Ok(art_guard) = ART_CACHE.lock() {
                if let Some(ref entry) = *art_guard {
                    if entry.title == title && entry.artist == artist {
                        album_art_base64 = entry.art_base64.clone();
                    } else {
                        needs_fetch = true;
                    }
                } else {
                    needs_fetch = true;
                }
            }

            // Spawn non-blocking background thread to extract thumbnail without stalling UI
            if needs_fetch {
                if let Some(send_thumb) = send_thumb_opt {
                    let key = (title.clone(), artist.clone());
                    let mut should_spawn = false;
                    if let Ok(mut fetch_guard) = ART_FETCHING_KEY.lock() {
                        if *fetch_guard != Some(key.clone()) {
                            *fetch_guard = Some(key);
                            should_spawn = true;
                        }
                    }

                    if should_spawn {
                        let t_clone = title.clone();
                        let a_clone = artist.clone();
                        std::thread::spawn(move || {
                            unsafe {
                                let _ = windows::Win32::System::Com::CoInitializeEx(
                                    None,
                                    windows::Win32::System::Com::COINIT_MULTITHREADED,
                                );
                            }
                            let art = send_thumb.extract();
                            if let Ok(mut art_guard) = ART_CACHE.lock() {
                                *art_guard = Some(ArtCacheEntry {
                                    title: t_clone,
                                    artist: a_clone,
                                    art_base64: art,
                                });
                            }
                            if let Ok(mut fetch_guard) = ART_FETCHING_KEY.lock() {
                                *fetch_guard = None;
                            }
                        });
                    }
                }
            }

            session_info = Some(MediaSessionInfo {
                title,
                artist,
                album_title,
                is_playing,
                duration_sec,
                current_sec,
                album_art_base64,
            });
        }
    }

    // 3. Priority Arbitration between WinRT GSMTC and Win32 Media Players
    let win32_media = scan_win32_media_players();

    let final_session = match (session_info, win32_media) {
        (Some(gsmtc), Some(w32)) => {
            if gsmtc.is_playing && !gsmtc.title.is_empty() {
                Some(gsmtc)
            } else if w32.is_playing && !w32.title.is_empty() {
                // Actively playing Win32 player (e.g. VLC playing in background) overrides paused/idle GSMTC session!
                Some(w32)
            } else {
                Some(gsmtc)
            }
        }
        (Some(gsmtc), None) => {
            if !gsmtc.title.is_empty() || gsmtc.is_playing {
                Some(gsmtc)
            } else {
                None
            }
        }
        (None, Some(w32)) => Some(w32),
        (None, None) => None,
    };

    cache.last_fetch = Some(now);
    cache.cached_session = final_session.clone();
    cache.active_session = selected_session;
    cache.active_app_id = resolved_app_id;
    cache.active_title = resolved_title;

    final_session
}

pub fn toggle_play_pause() {
    let mut sent = false;
    if let Ok(guard) = MEDIA_CACHE.lock() {
        if let Some(ref session) = guard.active_session {
            if let Ok(op) = session.TryTogglePlayPauseAsync() {
                if let Ok(success) = op.get() {
                    sent = success;
                }
            }
        }
        if !sent {
            if let Some(ref mgr) = guard.manager {
                if let Ok(session) = mgr.GetCurrentSession() {
                    if let Ok(op) = session.TryTogglePlayPauseAsync() {
                        if let Ok(success) = op.get() {
                            sent = success;
                        }
                    }
                }
            }
        }
    }
    if !sent {
        unsafe {
            // VK_MEDIA_PLAY_PAUSE = 0xB3 fallback
            keybd_event(0xB3, 0, KEYBD_EVENT_FLAGS(0), 0);
            keybd_event(0xB3, 0, KEYEVENTF_KEYUP, 0);
        }
    }
}

pub fn next_track() {
    let mut sent = false;
    if let Ok(guard) = MEDIA_CACHE.lock() {
        if let Some(ref session) = guard.active_session {
            if let Ok(op) = session.TrySkipNextAsync() {
                if let Ok(success) = op.get() {
                    sent = success;
                }
            }
        }
        if !sent {
            if let Some(ref mgr) = guard.manager {
                if let Ok(session) = mgr.GetCurrentSession() {
                    if let Ok(op) = session.TrySkipNextAsync() {
                        if let Ok(success) = op.get() {
                            sent = success;
                        }
                    }
                }
            }
        }
    }
    if !sent {
        unsafe {
            // VK_MEDIA_NEXT_TRACK = 0xB0 fallback
            keybd_event(0xB0, 0, KEYBD_EVENT_FLAGS(0), 0);
            keybd_event(0xB0, 0, KEYEVENTF_KEYUP, 0);
        }
    }
}

pub fn prev_track() {
    let mut sent = false;
    if let Ok(guard) = MEDIA_CACHE.lock() {
        if let Some(ref session) = guard.active_session {
            if let Ok(op) = session.TrySkipPreviousAsync() {
                if let Ok(success) = op.get() {
                    sent = success;
                }
            }
        }
        if !sent {
            if let Some(ref mgr) = guard.manager {
                if let Ok(session) = mgr.GetCurrentSession() {
                    if let Ok(op) = session.TrySkipPreviousAsync() {
                        if let Ok(success) = op.get() {
                            sent = success;
                        }
                    }
                }
            }
        }
    }
    if !sent {
        unsafe {
            // VK_MEDIA_PREV_TRACK = 0xB1 fallback
            keybd_event(0xB1, 0, KEYBD_EVENT_FLAGS(0), 0);
            keybd_event(0xB1, 0, KEYEVENTF_KEYUP, 0);
        }
    }
}

pub fn volume_up() {
    unsafe {
        // VK_VOLUME_UP = 0xAF
        keybd_event(0xAF, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0xAF, 0, KEYEVENTF_KEYUP, 0);
    }
}

pub fn volume_down() {
    unsafe {
        // VK_VOLUME_DOWN = 0xAE
        keybd_event(0xAE, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0xAE, 0, KEYEVENTF_KEYUP, 0);
    }
}

pub fn volume_mute() {
    unsafe {
        // VK_VOLUME_MUTE = 0xAD
        keybd_event(0xAD, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0xAD, 0, KEYEVENTF_KEYUP, 0);
    }
}

pub fn seek_media(position_sec: u64) {
    if let Ok(guard) = MEDIA_CACHE.lock() {
        let ticks = (position_sec as i64) * 10_000_000;
        let mut sought = false;
        if let Some(ref session) = guard.active_session {
            if session.TryChangePlaybackPositionAsync(ticks).is_ok() {
                sought = true;
            }
        }
        if !sought {
            if let Some(ref mgr) = guard.manager {
                if let Ok(session) = mgr.GetCurrentSession() {
                    let _ = session.TryChangePlaybackPositionAsync(ticks);
                }
            }
        }
    }
}

pub fn focus_media_app() {
    let mut app_id = String::new();
    let mut session_title = String::new();

    if let Ok(guard) = MEDIA_CACHE.lock() {
        if !guard.active_app_id.is_empty() || !guard.active_title.is_empty() {
            app_id = guard.active_app_id.to_lowercase();
            session_title = guard.active_title.to_lowercase();
        } else if let Some(ref mgr) = guard.manager {
            if let Ok(session) = mgr.GetCurrentSession() {
                if let Ok(src) = session.SourceAppUserModelId() {
                    app_id = src.to_string().to_lowercase();
                }
                if let Ok(media_props) = session.TryGetMediaPropertiesAsync().and_then(|op| op.get()) {
                    if let Ok(t) = media_props.Title() {
                        session_title = t.to_string().to_lowercase();
                    }
                }
            }
        }
    }

    struct FinderState {
        app_id: String,
        session_title: String,
        found_hwnd: Option<HWND>,
    }

    let mut state = FinderState {
        app_id,
        session_title,
        found_hwnd: None,
    };

    unsafe extern "system" fn enum_win(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let state = &mut *(lparam.0 as *mut FinderState);
        if !IsWindow(Some(hwnd)).as_bool() || !IsWindowVisible(hwnd).as_bool() {
            return BOOL(1);
        }

        let (exe_name, _) = crate::services::window_watcher::get_window_exe_path(hwnd);
        let exe_lower = exe_name.to_lowercase();

        let mut title_buf = [0u16; 512];
        let len = GetWindowTextW(hwnd, &mut title_buf);
        let win_title = if len > 0 {
            String::from_utf16_lossy(&title_buf[..len as usize]).to_lowercase()
        } else {
            String::new()
        };

        // Priority 1: Direct window title match with playing track/video (e.g. YouTube Music tab, PWA window, Spotify title)
        let matched = if !state.session_title.is_empty() && !win_title.is_empty() && win_title.contains(&state.session_title) {
            true
        // Priority 2: Standalone dedicated media players (VLC, Spotify, PotPlayer, MPV, foobar2000, AIMP, MusicBee)
        } else if exe_lower == "spotify.exe" || exe_lower == "vlc.exe" || exe_lower.starts_with("potplayer") || exe_lower == "mpv.exe" || exe_lower == "musicbee.exe" || exe_lower == "aimp.exe" {
            true
        // Priority 3: AppUserModelID / executable match (only if title matches or non-generic browser)
        } else if !state.app_id.is_empty() && (state.app_id.contains(&exe_lower) || (!exe_lower.is_empty() && state.app_id.contains(&exe_lower.replace(".exe", "")))) {
            let is_browser = exe_lower.contains("chrome") || exe_lower.contains("edge") || exe_lower.contains("brave") || exe_lower.contains("opera") || exe_lower.contains("vivaldi") || exe_lower.contains("firefox");
            if is_browser {
                win_title.contains("music") || win_title.contains("youtube") || win_title.contains("spotify") || win_title.contains("sound")
            } else {
                true
            }
        } else {
            false
        };

        if matched {
            state.found_hwnd = Some(hwnd);
            return BOOL(0);
        }

        BOOL(1)
    }

    unsafe {
        let _ = EnumWindows(Some(enum_win), LPARAM(&mut state as *mut _ as isize));
    }

    if let Some(hwnd) = state.found_hwnd {
        crate::services::window_watcher::focus_window(hwnd.0 as u64);
    }
}

