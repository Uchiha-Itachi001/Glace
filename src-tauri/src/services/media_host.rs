use serde::{Deserialize, Serialize};
use windows::Win32::UI::Input::KeyboardAndMouse::{keybd_event, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP};
use windows::Media::Control::{
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

    let session_opt = if let Some(mgr) = &cache.manager {
        mgr.GetCurrentSession().ok()
    } else {
        None
    };

    let session_info = if let Some(session) = session_opt {
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
        let (title, artist, album_title) = if let Some(p) = props {
            let t = p.Title().map(|s| s.to_string()).unwrap_or_default();
            let a = p.Artist().map(|s| s.to_string()).unwrap_or_default();
            let alb = p.AlbumTitle().map(|s| s.to_string()).ok();
            (t, a, alb)
        } else {
            (String::new(), String::new(), None)
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

            Some(MediaSessionInfo {
                title,
                artist,
                album_title,
                is_playing,
                duration_sec,
                current_sec,
                album_art_base64: None,
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
