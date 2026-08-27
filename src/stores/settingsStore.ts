import { useState, useEffect, useCallback } from "react";
import { Settings, ThemeId, ThemePreset } from "../types";
import { tauriBridge } from "../services/tauriBridge";

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "obsidian",
    name: "Obsidian Dark",
    description: "Deep obsidian glass with vivid emerald glow",
    accent: "#10b981",
    secondary: "#34d399",
    bgBase: "#060a12",
    bgCapsule: "rgba(13, 20, 36, 0.78)",
    border: "rgba(255, 255, 255, 0.12)",
    previewGradient: "linear-gradient(135deg, #060a12 0%, #10b981 100%)",
  },
  {
    id: "cyberpunk",
    name: "Seelen Cyberpunk",
    description: "High-contrast neon cyan & magenta night style",
    accent: "#06b6d4",
    secondary: "#ec4899",
    bgBase: "#0a0714",
    bgCapsule: "rgba(22, 13, 43, 0.82)",
    border: "rgba(6, 182, 212, 0.3)",
    previewGradient: "linear-gradient(135deg, #0a0714 0%, #06b6d4 50%, #ec4899 100%)",
  },
  {
    id: "catppuccin",
    name: "Catppuccin Mocha",
    description: "Cozy pastel mauve and sapphire lavender tones",
    accent: "#cba6f7",
    secondary: "#89b4fa",
    bgBase: "#181825",
    bgCapsule: "rgba(30, 30, 46, 0.84)",
    border: "rgba(203, 166, 247, 0.2)",
    previewGradient: "linear-gradient(135deg, #1e1e2e 0%, #cba6f7 100%)",
  },
  {
    id: "nord",
    name: "Nord Frost",
    description: "Arctic cold palette with icy blue highlights",
    accent: "#88c0d0",
    secondary: "#81a1c1",
    bgBase: "#242933",
    bgCapsule: "rgba(46, 52, 64, 0.82)",
    border: "rgba(136, 192, 208, 0.22)",
    previewGradient: "linear-gradient(135deg, #2e3440 0%, #88c0d0 100%)",
  },
  {
    id: "glass",
    name: "Liquid Glass",
    description: "Maximum crystal refraction and specular borders",
    accent: "#38bdf8",
    secondary: "#7dd3fc",
    bgBase: "#030712",
    bgCapsule: "rgba(255, 255, 255, 0.08)",
    border: "rgba(255, 255, 255, 0.25)",
    previewGradient: "linear-gradient(135deg, rgba(255,255,255,0.15) 0%, #38bdf8 100%)",
  },
  {
    id: "sunset",
    name: "Sunset Amber",
    description: "Warm golden twilight with espresso glass",
    accent: "#f59e0b",
    secondary: "#fb923c",
    bgBase: "#120906",
    bgCapsule: "rgba(36, 20, 14, 0.82)",
    border: "rgba(245, 158, 11, 0.24)",
    previewGradient: "linear-gradient(135deg, #120906 0%, #f59e0b 100%)",
  },
];

export const DEFAULT_TRAY_ITEMS = [
  "gear",
  "overflow",
  "keyboard",
  "widgets",
  "language",
  "quick_settings",
];

const DEFAULT_SETTINGS: Settings = {
  theme_id: "obsidian",
  accent_color: "#10b981",
  blur_intensity: 1.0,
  corner_radius: 20,
  bar_position: "bottom",
  bar_alignment: "center",
  capsule_order: ["start", "apps", "media", "sysmon", "tray", "clock"],
  enabled_widgets: ["start", "apps", "sysmon", "tray", "clock"],
  autostart: false,
  monitor: "primary",
  sysmon_mode: "cpu_ram",
  tray_items: DEFAULT_TRAY_ITEMS,
  enable_dynamic_island: true,
  island_show_media: true,
  island_show_bluetooth: true,
  island_show_hardware: true,
  island_show_battery: true,
  media_location: "notch",
};

let globalSettings: Settings = DEFAULT_SETTINGS;
const listeners = new Set<(settings: Settings) => void>();

function notify(newSettings: Settings) {
  globalSettings = newSettings;
  applyThemeToDOM(newSettings);
  listeners.forEach((fn) => fn(newSettings));
}

export function applyThemeToDOM(settings: Settings) {
  const root = document.documentElement;
  root.setAttribute("data-theme", settings.theme_id);

  if (settings.accent_color) {
    root.style.setProperty("--glace-accent", settings.accent_color);
    root.style.setProperty(
      "--glace-accent-dim",
      `${settings.accent_color}33`
    );
    root.style.setProperty(
      "--glace-accent-glow",
      `${settings.accent_color}66`
    );
  }

  if (settings.corner_radius) {
    root.style.setProperty(
      "--glace-radius-capsule",
      `${settings.corner_radius}px`
    );
  }

  if (settings.blur_intensity) {
    const blurPx = Math.round(28 * settings.blur_intensity);
    const sat = Math.round(180 * settings.blur_intensity);
    root.style.setProperty(
      "--glace-blur",
      `blur(${blurPx}px) saturate(${sat}%)`
    );
  }
}

export function useSettings() {
  const [settings, setSettingsState] = useState<Settings>(globalSettings);

  useEffect(() => {
    // Initial fetch from backend
    tauriBridge.getSettings().then((loaded) => {
      if (loaded && loaded.theme_id) {
        notify({ ...DEFAULT_SETTINGS, ...loaded });
      }
    }).catch(console.error);

    const handler = (newSettings: Settings) => {
      setSettingsState(newSettings);
    };

    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  const updateSettings = useCallback((updater: Partial<Settings> | ((prev: Settings) => Settings)) => {
    const next = typeof updater === "function" ? updater(globalSettings) : { ...globalSettings, ...updater };
    notify(next);
    tauriBridge.saveSettings(next).catch(console.error);
  }, []);

  const setTheme = useCallback((theme_id: ThemeId) => {
    const preset = THEME_PRESETS.find((p) => p.id === theme_id);
    updateSettings((prev) => ({
      ...prev,
      theme_id,
      accent_color: preset ? preset.accent : prev.accent_color,
    }));
  }, [updateSettings]);

  const setMediaLocation = useCallback((location: "notch" | "taskbar" | "none") => {
    updateSettings((prev) => {
      const currentList = prev.enabled_widgets || DEFAULT_SETTINGS.enabled_widgets;
      let enabled_widgets = currentList;

      if (location === "taskbar") {
        if (!enabled_widgets.includes("media")) {
          enabled_widgets = [...enabled_widgets, "media"];
        }
      } else {
        enabled_widgets = enabled_widgets.filter((w) => w !== "media");
      }

      return {
        ...prev,
        media_location: location,
        island_show_media: location === "notch",
        enabled_widgets,
      };
    });
  }, [updateSettings]);

  const toggleWidget = useCallback((widgetId: string) => {
    updateSettings((prev) => {
      if (widgetId === "media") {
        const isTaskbar = prev.media_location === "taskbar";
        const nextLocation = isTaskbar ? "notch" : "taskbar";
        const currentList = prev.enabled_widgets || DEFAULT_SETTINGS.enabled_widgets;
        const enabled_widgets = nextLocation === "taskbar"
          ? [...currentList.filter((w) => w !== "media"), "media"]
          : currentList.filter((w) => w !== "media");

        return {
          ...prev,
          media_location: nextLocation,
          island_show_media: nextLocation === "notch",
          enabled_widgets,
        };
      }

      const currentList = prev.enabled_widgets || DEFAULT_SETTINGS.enabled_widgets;
      const exists = currentList.includes(widgetId);
      const enabled_widgets = exists
        ? currentList.filter((w) => w !== widgetId)
        : [...currentList, widgetId];
      return { ...prev, enabled_widgets };
    });
  }, [updateSettings]);

  const toggleTrayItem = useCallback((itemId: string) => {
    updateSettings((prev) => {
      const currentList = prev.tray_items || DEFAULT_TRAY_ITEMS;
      const exists = currentList.includes(itemId);
      const tray_items = exists
        ? currentList.filter((id) => id !== itemId)
        : [...currentList, itemId];
      return { ...prev, tray_items };
    });
  }, [updateSettings]);

  const setSysMonMode = useCallback((mode: "cpu_ram" | "network" | "both") => {
    updateSettings({ sysmon_mode: mode });
  }, [updateSettings]);

  return {
    settings,
    updateSettings,
    setTheme,
    toggleWidget,
    toggleTrayItem,
    setSysMonMode,
    setMediaLocation,
    presets: THEME_PRESETS,
  };
}
