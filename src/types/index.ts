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

export interface SystemMetrics {
  ram_percent: number;
  total_ram_mb: number;
  used_ram_mb: number;
  cpu_percent: number;
  battery_percent: number;
  is_charging: boolean;
  has_battery: boolean;
}

// Backwards compatibility alias
export type SystemStatus = SystemMetrics;

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
}

export interface Settings {
  theme_id: ThemeId;
  accent_color: string;
  blur_intensity: number;
  corner_radius: number;
  bar_position: "bottom" | "top" | "floating";
  capsule_order: string[];
  enabled_widgets: string[];
  autostart: boolean;
  monitor: string;
  pinned_apps?: PinnedApp[];
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
