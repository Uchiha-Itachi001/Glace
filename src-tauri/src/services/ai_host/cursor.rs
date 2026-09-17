use std::sync::Mutex;
use std::time::{Duration, Instant};
use super::helpers::{get_appdata_dir, run_hidden};
use super::types::CursorInfo;

static CURSOR_CACHE: Mutex<Option<(Instant, CursorInfo)>> = Mutex::new(None);
const QUOTA_CACHE_TTL: Duration = Duration::from_secs(30);

pub fn fetch_cursor_info() -> CursorInfo {
    if let Ok(guard) = CURSOR_CACHE.lock() {
        if let Some((cached_time, ref info)) = *guard {
            if cached_time.elapsed() < QUOTA_CACHE_TTL {
                return info.clone();
            }
        }
    }

    let mut info = CursorInfo::default();
    let appdata = get_appdata_dir();

    if let Some(ref d) = appdata {
        let settings_path = d.join("Cursor").join("User").join("settings.json");
        if let Ok(c) = std::fs::read_to_string(&settings_path) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&c) {
                info.preferred_model = val.get("cursor.general.preferredModel")
                    .or_else(|| val.get("cursor.chat.defaultModel"))
                    .and_then(|v| v.as_str())
                    .map(String::from);
            }
        }

        let db = d.join("Cursor").join("User").join("globalStorage").join("state.vscdb");
        if db.exists() {
            let py_cmd = r#"
import sqlite3, os, json
db = os.path.expandvars(r'%APPDATA%\Cursor\User\globalStorage\state.vscdb')
if os.path.exists(db):
    try:
        con = sqlite3.connect(f'file:{db}?mode=ro', uri=True)
        cur = con.cursor()
        email = cur.execute("SELECT value FROM ItemTable WHERE key='cursorAuth/cachedEmail'").fetchone()
        plan = cur.execute("SELECT value FROM ItemTable WHERE key='cursorAuth/stripeMembershipType'").fetchone()
        print(json.dumps({"email": email[0] if email else None, "plan": plan[0] if plan else None}))
    except: pass
"#;
            if let Some(out) = run_hidden("python", &["-c", py_cmd]) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(out.trim()) {
                    info.email = val.get("email").and_then(|e| e.as_str()).map(String::from);
                    info.membership = val.get("plan").and_then(|p| p.as_str()).map(String::from);
                }
            }
        }
    }

    if let Ok(mut guard) = CURSOR_CACHE.lock() {
        *guard = Some((Instant::now(), info.clone()));
    }
    info
}
