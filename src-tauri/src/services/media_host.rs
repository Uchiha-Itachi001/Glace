use serde::{Deserialize, Serialize};
use windows::Win32::UI::Input::KeyboardAndMouse::{keybd_event, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP};
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
}

static MEDIA_CACHE: Mutex<MediaCache> = Mutex::new(MediaCache {
    manager: None,
    last_fetch: None,
    cached_session: None,
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
    if size == 0 || size > 5 * 1024 * 1024 {
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

pub fn get_current_media_session() -> Option<MediaSessionInfo> {
    let now = Instant::now();

    // 1. Check TTL cache snapshot (600ms) to serve concurrent UI widgets without COM churn
    if let Ok(guard) = MEDIA_CACHE.lock() {
        if let Some(last_time) = guard.last_fetch {
            if now.duration_since(last_time) < Duration::from_millis(600) {
                return guard.cached_session.clone();
            }
        }
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

    if let Some(mgr) = &cache.manager {
        // Priority 1: Prioritize session that is ACTIVELY PLAYING across all apps & browser tabs
        if let Ok(sessions) = mgr.GetSessions() {
            for session in sessions {
                let is_playing = if let Ok(playback_info) = session.GetPlaybackInfo() {
                    playback_info.PlaybackStatus().map(|s| s == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing).unwrap_or(false)
                } else {
                    false
                };

                if is_playing {
                    if let Ok(props_op) = session.TryGetMediaPropertiesAsync() {
                        if let Ok(props) = props_op.get() {
                            let t = props.Title().map(|s| s.to_string()).unwrap_or_default();
                            let a = props.Artist().map(|s| s.to_string()).unwrap_or_default();
                            if !t.trim().is_empty() || !a.trim().is_empty() {
                                selected_session = Some(session);
                                break;
                            }
                        }
                    }
                }

                if fallback_session.is_none() {
                    if let Ok(props_op) = session.TryGetMediaPropertiesAsync() {
                        if let Ok(props) = props_op.get() {
                            let t = props.Title().map(|s| s.to_string()).unwrap_or_default();
                            let a = props.Artist().map(|s| s.to_string()).unwrap_or_default();
                            if !t.trim().is_empty() || !a.trim().is_empty() {
                                fallback_session = Some(session);
                            }
                        }
                    }
                }
            }
        }

        // Priority 2: If none is playing, fallback to Windows current session or first valid session
        if selected_session.is_none() {
            selected_session = mgr.GetCurrentSession().ok().or(fallback_session);
        }
    }

    let session_info = if let Some(session) = selected_session {
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

        let props = session.TryGetMediaPropertiesAsync().ok().and_then(|op| op.get().ok());
        let (title, artist, album_title, send_thumb_opt) = if let Some(ref p) = props {
            let t = p.Title().map(|s| s.to_string()).unwrap_or_default();
            let a = p.Artist().map(|s| s.to_string()).unwrap_or_default();
            let alb = p.AlbumTitle().map(|s| s.to_string()).ok();
            let thumb = p.Thumbnail().ok().map(SendThumb);
            (t, a, alb, thumb)
        } else {
            (String::new(), String::new(), None, None)
        };

        if title.trim().is_empty() && artist.trim().is_empty() {
            None
        } else {
            let timeline = session.GetTimelineProperties().ok();
            let (current_sec, duration_sec) = if let Some(tl) = timeline {
                let pos = tl.Position().map(|d| (d.Duration / 10_000_000) as u64).unwrap_or(0);
                let end = tl.EndTime().map(|d| (d.Duration / 10_000_000) as u64).unwrap_or(0);
                (pos, end)
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

            Some(MediaSessionInfo {
                title,
                artist,
                album_title,
                is_playing,
                duration_sec,
                current_sec,
                album_art_base64,
            })
        }
    } else {
        None
    };

    cache.last_fetch = Some(now);
    cache.cached_session = session_info.clone();

    session_info
}

pub fn toggle_play_pause() {
    unsafe {
        // VK_MEDIA_PLAY_PAUSE = 0xB3
        keybd_event(0xB3, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0xB3, 0, KEYEVENTF_KEYUP, 0);
    }
}

pub fn next_track() {
    unsafe {
        // VK_MEDIA_NEXT_TRACK = 0xB0
        keybd_event(0xB0, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0xB0, 0, KEYEVENTF_KEYUP, 0);
    }
}

pub fn prev_track() {
    unsafe {
        // VK_MEDIA_PREV_TRACK = 0xB1
        keybd_event(0xB1, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0xB1, 0, KEYEVENTF_KEYUP, 0);
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
