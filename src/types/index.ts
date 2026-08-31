export interface WindowInfo {
  hwnd: number;
  title: string;
  exe: string;
  icon_b64: string;
  is_focused: boolean;
  is_minimized: boolean;
}

export interface TrayIcon {
  id: number;
  tooltip: string;
  icon_b64: string;
}

export interface AppResourceUsage {
  rust_ram_mb: number;
  webview_ram_mb: number;
  total_ram_mb: number;
  system_total_ram_mb: number;
  system_used_ram_mb: number;
  system_ram_percent: number;
  system_cpu_percent: number;
  uptime_seconds: number;
}

export interface SystemMetrics {
  ram_percent: number;
  total_ram_mb: number;
  used_ram_mb: number;
  cpu_percent: number;
  battery_percent: number;
  is_charging: boolean;
  has_battery: boolean;
  net_recv_speed_bps?: number;
  net_sent_speed_bps?: number;
  net_recv_formatted?: string;
  net_sent_formatted?: string;
  net_type?: "ethernet" | "wifi" | "disconnected" | "unknown";
}

// Backwards compatibility alias
export type SystemStatus = SystemMetrics;

export type SysMonMode = "cpu_ram" | "network" | "both";

export type ThemeId =
  | "obsidian"
  | "cyberpunk"
  | "catppuccin"
  | "nord"
  | "glass"
  | "sunset";

export interface ThemePreset {
  id: ThemeId;
  name: string;
  description: string;
  accent: string;
  secondary: string;
  bgBase: string;
  bgCapsule: string;
  border: string;
  previewGradient: string;
}

export interface PinnedApp {
  id: string;
  title: string;
  exe: string;
  lnk_path: string;
  icon_b64: string;
}

export interface DockAppItem {
  id: string;
  title: string;
  exe: string;
  icon_b64: string;
  is_pinned: boolean;
  is_running: boolean;
  is_focused: boolean;
  is_minimized: boolean;
  hwnd?: number;
  lnk_path?: string;
  windows?: WindowInfo[];
}

export type MediaLocation = "notch" | "taskbar" | "none";
export type BarAlignment = "center" | "left" | "right";
export type NotchPeekKey = "shift" | "ctrl" | "space" | "tab";

export interface Settings {
  theme_id: ThemeId;
  accent_color: string;
  blur_intensity: number;
  corner_radius: number;
  bar_position: "windows" | "macos" | "bottom" | "top";
  bar_alignment?: BarAlignment;
  capsule_order: string[];
  enabled_widgets: string[];
  autostart: boolean;
  monitor: string;
  pinned_apps?: PinnedApp[];
  sysmon_mode?: SysMonMode;
  tray_items?: string[];
  enable_dynamic_island?: boolean;
  island_show_media?: boolean;
  island_show_bluetooth?: boolean;
  island_show_hardware?: boolean;
  island_show_battery?: boolean;
  media_location?: MediaLocation;
  notch_peek_key?: NotchPeekKey;
  margin_top?: number;
  margin_bottom?: number;
  margin_left?: number;
  margin_right?: number;
}

export interface BluetoothDevice {
  id: string;
  name: string;
  connected: boolean;
  battery_percent: number | null;
  device_type: "audio" | "headset" | "keyboard" | "mouse" | "phone" | "generic";
  icon?: string;
}

export interface MediaTrack {
  title: string;
  artist: string;
  albumArt?: string;
  isPlaying: boolean;
  progressPercent: number;
  durationSec: number;
  currentSec: number;
}

export interface MediaSessionInfo {
  title: string;
  artist: string;
  album_title?: string;
  is_playing: boolean;
  duration_sec: number;
  current_sec: number;
  album_art_base64?: string;
}

