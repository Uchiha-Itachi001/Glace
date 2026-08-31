use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WindowInfo {
    pub hwnd: u64,
    pub title: String,
    pub exe: String,
    pub icon_b64: String,
    pub is_focused: bool,
    pub is_minimized: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TrayIcon {
    pub id: u32,
    pub tooltip: String,
    pub icon_b64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AppResourceUsage {
    pub rust_ram_mb: f64,
    pub webview_ram_mb: f64,
    pub total_ram_mb: f64,
    pub system_total_ram_mb: u64,
    pub system_used_ram_mb: u64,
    pub system_ram_percent: u8,
    pub system_cpu_percent: u8,
    pub uptime_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SystemMetrics {
    pub ram_percent: u8,
    pub total_ram_mb: u64,
    pub used_ram_mb: u64,
    pub cpu_percent: u8,
    pub battery_percent: u8,
    pub is_charging: bool,
    pub has_battery: bool,
    pub net_recv_speed_bps: u64,
    pub net_sent_speed_bps: u64,
    pub net_recv_formatted: String,
    pub net_sent_formatted: String,
    pub net_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PinnedApp {
    pub id: String,
    pub title: String,
    pub exe: String,
    pub lnk_path: String,
    pub icon_b64: String,
}

fn default_sysmon_mode() -> String {
    "cpu_ram".into()
}

fn default_tray_items() -> Vec<String> {
    vec![
        "gear".into(),
        "overflow".into(),
        "keyboard".into(),
        "widgets".into(),
        "language".into(),
        "quick_settings".into(),
    ]
}

fn default_true() -> bool {
    true
}

fn default_media_location() -> String {
    "notch".into()
}

fn default_bar_alignment() -> String {
    "center".into()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BluetoothDevice {
    pub id: String,
    pub name: String,
    pub connected: bool,
    pub battery_percent: Option<u8>,
    pub device_type: String,
}

fn default_margin_top() -> u32 {
    0
}

fn default_margin_bottom() -> u32 {
    48
}

fn default_margin_zero() -> u32 {
    0
}

fn default_notch_peek_key() -> String {
    "shift".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub theme_id: String,
    pub accent_color: String,
    pub blur_intensity: f32,
    pub corner_radius: u32,
    pub bar_position: String,
    #[serde(default = "default_bar_alignment")]
    pub bar_alignment: String,
    pub capsule_order: Vec<String>,
    pub enabled_widgets: Vec<String>,
    #[serde(default = "default_true")]
    pub autostart: bool,
    pub monitor: String,
    #[serde(default)]
    pub pinned_apps: Vec<PinnedApp>,
    #[serde(default = "default_sysmon_mode")]
    pub sysmon_mode: String,
    #[serde(default = "default_tray_items")]
    pub tray_items: Vec<String>,
    #[serde(default = "default_true")]
    pub enable_dynamic_island: bool,
    #[serde(default = "default_true")]
    pub island_show_media: bool,
    #[serde(default = "default_true")]
    pub island_show_bluetooth: bool,
    #[serde(default = "default_true")]
    pub island_show_hardware: bool,
    #[serde(default = "default_true")]
    pub island_show_battery: bool,
    #[serde(default = "default_media_location")]
    pub media_location: String,
    #[serde(default = "default_notch_peek_key")]
    pub notch_peek_key: String,
    #[serde(default = "default_margin_top")]
    pub margin_top: u32,
    #[serde(default = "default_margin_bottom")]
    pub margin_bottom: u32,
    #[serde(default = "default_margin_zero")]
    pub margin_left: u32,
    #[serde(default = "default_margin_zero")]
    pub margin_right: u32,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme_id: "obsidian".into(),
            accent_color: "#10b981".into(),
            blur_intensity: 1.0,
            corner_radius: 20,
            bar_position: "bottom".into(),
            bar_alignment: "center".into(),
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
                "sysmon".into(),
                "tray".into(),
                "clock".into(),
            ],
            autostart: true,
            monitor: "primary".into(),
            pinned_apps: Vec::new(),
            sysmon_mode: "cpu_ram".into(),
            tray_items: default_tray_items(),
            enable_dynamic_island: true,
            island_show_media: true,
            island_show_bluetooth: true,
            island_show_hardware: true,
            island_show_battery: true,
            media_location: "notch".into(),
            notch_peek_key: "shift".into(),
            margin_top: 0,
            margin_bottom: 48,
            margin_left: 0,
            margin_right: 0,
        }
    }
}


