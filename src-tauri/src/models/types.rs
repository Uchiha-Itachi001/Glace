use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowInfo {
    pub hwnd: u64,
    pub title: String,
    pub exe: String,
    pub icon_b64: String,
    pub is_focused: bool,
    pub is_minimized: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrayIcon {
    pub id: u32,
    pub tooltip: String,
    pub icon_b64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemMetrics {
    pub ram_percent: u8,
    pub total_ram_mb: u64,
    pub used_ram_mb: u64,
    pub cpu_percent: u8,
    pub battery_percent: u8,
    pub is_charging: bool,
    pub has_battery: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub theme_id: String,
    pub accent_color: String,
    pub blur_intensity: f32,
    pub corner_radius: u32,
    pub bar_position: String,
    pub capsule_order: Vec<String>,
    pub enabled_widgets: Vec<String>,
    pub autostart: bool,
    pub monitor: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme_id: "obsidian".into(),
            accent_color: "#10b981".into(),
            blur_intensity: 1.0,
            corner_radius: 20,
            bar_position: "bottom".into(),
            capsule_order: vec![
                "start".into(),
                "apps".into(),
                "media".into(),
                "sysmon".into(),
                "tray".into(),
                "clock".into(),
            ],
            enabled_widgets: vec![
                "start".into(),
                "apps".into(),
                "media".into(),
                "sysmon".into(),
                "tray".into(),
                "clock".into(),
            ],
            autostart: false,
            monitor: "primary".into(),
        }
    }
}

