import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { WindowInfo, TrayIcon, SystemMetrics, Settings, PinnedApp, BluetoothDevice } from "../types";

export const tauriBridge = {
  // Window controls
  getOpenWindows: async (): Promise<WindowInfo[]> => {
    try {
      return await invoke<WindowInfo[]>("get_open_windows");
    } catch {
      return [];
    }
  },

  focusWindow: async (hwnd: number): Promise<void> => {
    try {
      await invoke("focus_window", { hwnd });
    } catch (e) {
      console.error("focusWindow error:", e);
    }
  },

  minimizeWindow: async (hwnd: number): Promise<void> => {
    try {
      await invoke("minimize_window", { hwnd });
    } catch (e) {
      console.error("minimizeWindow error:", e);
    }
  },

  closeWindow: async (hwnd: number): Promise<void> => {
    try {
      await invoke("close_window", { hwnd });
    } catch (e) {
      console.error("closeWindow error:", e);
    }
  },

  terminateWindowProcess: async (hwnd: number): Promise<void> => {
    try {
      await invoke("terminate_window_process", { hwnd });
    } catch (e) {
      console.error("terminateWindowProcess error:", e);
    }
  },

  snapWindow: async (
    hwnd: number,
    position:
      | "left"
      | "right"
      | "top-left"
      | "top-right"
      | "bottom-left"
      | "bottom-right"
      | "maximize"
      | "restore"
      | "center"
  ): Promise<void> => {
    try {
      await invoke("snap_window", { hwnd, position });
    } catch (e) {
      console.error("snapWindow error:", e);
    }
  },

  setWindowHeight: async (expanded: boolean, heightPx?: number): Promise<void> => {
    try {
      await invoke("set_window_height", { expanded, heightPx });
    } catch (e) {
      console.error("setWindowHeight error:", e);
    }
  },

  getWindowThumbnail: async (hwnd: number): Promise<string | null> => {
    try {
      return await invoke<string | null>("get_window_thumbnail", { hwnd });
    } catch {
      return null;
    }
  },

  // Shell controls
  openStartMenu: async (): Promise<void> => {
    try {
      await invoke("open_start_menu");
    } catch (e) {
      console.error("openStartMenu error:", e);
    }
  },

  openQuickSettings: async (): Promise<void> => {
    try {
      await invoke("open_quick_settings");
    } catch (e) {
      console.error("openQuickSettings error:", e);
    }
  },

  openCalendarNotifications: async (): Promise<void> => {
    try {
      await invoke("open_calendar_notifications");
    } catch (e) {
      console.error("openCalendarNotifications error:", e);
    }
  },

  openWindowsSettings: async (): Promise<void> => {
    try {
      await invoke("open_windows_settings");
    } catch (e) {
      console.error("openWindowsSettings error:", e);
    }
  },

  openTrayOverflow: async (): Promise<void> => {
    try {
      await invoke("open_tray_overflow");
    } catch (e) {
      console.error("openTrayOverflow error:", e);
    }
  },

  toggleInputLanguage: async (): Promise<void> => {
    try {
      await invoke("toggle_input_language");
    } catch (e) {
      console.error("toggleInputLanguage error:", e);
    }
  },

  openTouchKeyboard: async (): Promise<void> => {
    try {
      await invoke("open_touch_keyboard");
    } catch (e) {
      console.error("openTouchKeyboard error:", e);
    }
  },

  openWidgetsPanel: async (): Promise<void> => {
    try {
      await invoke("open_widgets_panel");
    } catch (e) {
      console.error("openWidgetsPanel error:", e);
    }
  },

  launchApp: async (cmd: string): Promise<void> => {
    try {
      await invoke("launch_app", { cmd });
    } catch (e) {
      console.error("launchApp error:", e);
    }
  },

  powerAction: async (action: "lock" | "sleep" | "restart" | "shutdown"): Promise<void> => {
    try {
      await invoke("power_action", { action });
    } catch (e) {
      console.error("powerAction error:", e);
    }
  },

  toggleMediaPlayPause: async (): Promise<void> => {
    try {
      await invoke("media_toggle_play_pause");
    } catch (e) {
      console.error("mediaTogglePlayPause error:", e);
    }
  },

  mediaNextTrack: async (): Promise<void> => {
    try {
      await invoke("media_next_track");
    } catch (e) {
      console.error("mediaNextTrack error:", e);
    }
  },

  mediaPrevTrack: async (): Promise<void> => {
    try {
      await invoke("media_prev_track");
    } catch (e) {
      console.error("mediaPrevTrack error:", e);
    }
  },

  mediaVolumeUp: async (): Promise<void> => {
    try {
      await invoke("media_volume_up");
    } catch (e) {
      console.error("mediaVolumeUp error:", e);
    }
  },

  mediaVolumeDown: async (): Promise<void> => {
    try {
      await invoke("media_volume_down");
    } catch (e) {
      console.error("mediaVolumeDown error:", e);
    }
  },

  mediaVolumeMute: async (): Promise<void> => {
    try {
      await invoke("media_volume_mute");
    } catch (e) {
      console.error("mediaVolumeMute error:", e);
    }
  },

  getMediaSessionInfo: async (): Promise<MediaSessionInfo | null> => {
    try {
      return await invoke<MediaSessionInfo | null>("get_media_session_info");
    } catch (e) {
      console.error("getMediaSessionInfo error:", e);
      return null;
    }
  },

  updateWorkArea: async (topNotchEnabled: boolean): Promise<void> => {
    try {
      await invoke("update_work_area", { topNotchEnabled });
    } catch (e) {
      console.error("updateWorkArea error:", e);
    }
  },

  hideNativeTaskbar: async (): Promise<void> => {
    try {
      await invoke("hide_native_taskbar");
    } catch (e) {
      console.error("hideNativeTaskbar error:", e);
    }
  },

  restoreNativeTaskbar: async (): Promise<void> => {
    try {
      await invoke("restore_native_taskbar");
    } catch (e) {
      console.error("restoreNativeTaskbar error:", e);
    }
  },

  // Tray & System Status
  getBluetoothDevices: async (): Promise<BluetoothDevice[]> => {
    try {
      return await invoke<BluetoothDevice[]>("get_bluetooth_devices");
    } catch {
      return [];
    }
  },

  getTrayIcons: async (): Promise<TrayIcon[]> => {
    try {
      return await invoke<TrayIcon[]>("get_tray_icons");
    } catch {
      return [];
    }
  },

  getSystemMetrics: async (): Promise<SystemMetrics> => {
    try {
      return await invoke<SystemMetrics>("get_system_metrics");
    } catch {
      return {
        ram_percent: 42,
        total_ram_mb: 16384,
        used_ram_mb: 6880,
        cpu_percent: 18,
        battery_percent: 100,
        is_charging: true,
        has_battery: true,
        net_recv_speed_bps: 0,
        net_sent_speed_bps: 0,
        net_recv_formatted: "0 B/s",
        net_sent_formatted: "0 B/s",
      };
    }
  },

  // Settings
  getSettings: async (): Promise<Settings> => {
    try {
      return await invoke<Settings>("get_settings");
    } catch {
      return {
        theme_id: "obsidian",
        accent_color: "#10b981",
        blur_intensity: 1.0,
        corner_radius: 20,
        bar_position: "bottom",
        capsule_order: ["start", "apps", "media", "sysmon", "tray", "clock"],
        enabled_widgets: ["start", "apps", "media", "sysmon", "tray", "clock"],
        autostart: false,
        monitor: "primary",
        sysmon_mode: "cpu_ram",
      };
    }
  },

  saveSettings: async (settings: Settings): Promise<void> => {
    try {
      await invoke("save_settings", { settings });
    } catch (e) {
      console.error("saveSettings error:", e);
    }
  },

  // Pinned Apps
  getPinnedApps: async (): Promise<PinnedApp[]> => {
    try {
      return await invoke<PinnedApp[]>("get_pinned_apps");
    } catch {
      return [];
    }
  },

  pinApp: async (app: PinnedApp): Promise<void> => {
    try {
      await invoke("pin_app", { app });
    } catch (e) {
      console.error("pinApp error:", e);
    }
  },

  unpinApp: async (id: string): Promise<void> => {
    try {
      await invoke("unpin_app", { id });
    } catch (e) {
      console.error("unpinApp error:", e);
    }
  },

  // Real-time Event Subscriptions
  onWindowsUpdated: (callback: (windows: WindowInfo[]) => void): Promise<UnlistenFn> => {
    return listen<WindowInfo[]>("windows-updated", (event) => {
      callback(event.payload);
    });
  },
};
