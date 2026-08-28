import React, { useState, useEffect } from "react";
import { useSettings, THEME_PRESETS } from "../../stores/settingsStore";
import { ThemeId, PinnedApp, BarAlignment } from "../../types";
import { tauriBridge } from "../../services/tauriBridge";

interface SettingsFlyoutProps {
  onClose: () => void;
}

const ACCENT_PRESETS = [
  "#10b981", // Emerald
  "#06b6d4", // Cyan
  "#cba6f7", // Mauve
  "#88c0d0", // Frost
  "#38bdf8", // Sky
  "#f59e0b", // Amber
  "#ec4899", // Pink
  "#84cc16", // Lime
  "#a855f7", // Purple
];

const WIDGET_OPTIONS = [
  { id: "start", name: "Start Launcher Button", desc: "Windows Start menu & launcher button" },
  { id: "apps", name: "Taskbar Dock Apps", desc: "Pinned & active running applications" },
  { id: "media", name: "Media Player Capsule", desc: "Soundwave visualizer & track controls" },
  { id: "sysmon", name: "System Monitor", desc: "Live CPU, RAM & Internet Speed telemetry" },
  { id: "tray", name: "System Tray & Indicators", desc: "Settings shortcut and notification area" },
  { id: "clock", name: "Clock & Calendar", desc: "Digital clock with interactive calendar flyout" },
];

const SYSMON_MODES: {
  id: "cpu_ram" | "network" | "both";
  name: string;
  badge: string;
  desc: string;
}[] = [
  {
    id: "cpu_ram",
    name: "CPU & RAM",
    badge: "CPU 45% | RAM 60%",
    desc: "Real-time processor & memory load",
  },
  {
    id: "network",
    name: "Internet Speed",
    badge: "↓ 2.4 MB/s | ↑ 350 KB/s",
    desc: "Real-time download & upload bandwidth",
  },
  {
    id: "both",
    name: "Combined (All-in-One)",
    badge: "CPU · RAM · Net",
    desc: "Show CPU, RAM, and Net speed together",
  },
];

const TRAY_ITEM_OPTIONS = [
  {
    id: "gear",
    name: "Glace Settings Gear",
    desc: "Shortcut button to open the Glace settings flyout",
  },
  {
    id: "overflow",
    name: "Notification Area Overflow (^)",
    desc: "Flyout menu for hidden background application icons",
  },
  {
    id: "quick_settings",
    name: "Quick Settings Indicators",
    desc: "Wi-Fi internet, Volume audio, and Battery indicators",
  },
  {
    id: "language",
    name: "Input Language Switcher",
    desc: "Active keyboard input method indicator (ENG / IN)",
  },
  {
    id: "widgets",
    name: "Windows Widgets & Copilot",
    desc: "Windows widgets board and Copilot launcher button",
  },
  {
    id: "keyboard",
    name: "Touch Keyboard Launcher",
    desc: "Windows on-screen virtual touch keyboard button",
  },
];

const MEDIA_LOCATIONS: { id: "notch" | "taskbar" | "none"; name: string; badge: string; desc: string }[] = [
  {
    id: "notch",
    name: "Top Dynamic Notch",
    badge: "Default",
    desc: "Active playing media lives in the top dynamic island; taskbar stays minimal",
  },
  {
    id: "taskbar",
    name: "Bottom Taskbar Dock",
    badge: "Dock",
    desc: "Active playing media lives in the bottom taskbar cluster with controls",
  },
  {
    id: "none",
    name: "Disabled",
    badge: "Off",
    desc: "Hide media player and soundwave indicators from both notch and taskbar",
  },
];

export const SettingsFlyout: React.FC<SettingsFlyoutProps> = ({ onClose }) => {
  const { settings, updateSettings, setTheme, toggleWidget, toggleTrayItem, setSysMonMode, setMediaLocation } = useSettings();
  const [activeTab, setActiveTab] = useState<"appearance" | "taskbar" | "island" | "tray" | "pinned" | "about">("appearance");
  const [pinnedApps, setPinnedApps] = useState<PinnedApp[]>([]);
  const [newAppName, setNewAppName] = useState("");
  const [newAppCmd, setNewAppCmd] = useState("");

  const currentTheme = settings?.theme_id || "obsidian";
  const currentAccent = settings?.accent_color || "#10b981";
  const currentRadius = settings?.corner_radius ?? 20;
  const currentBlur = settings?.blur_intensity ?? 1.0;
  const currentBarPos = settings?.bar_position || "bottom";
  const currentBarAlign = (settings?.bar_alignment || "center") as BarAlignment;
  const enabledWidgets = settings?.enabled_widgets || ["start", "apps", "sysmon", "tray", "clock"];
  const enabledTrayItems = settings?.tray_items || [
    "gear",
    "overflow",
    "keyboard",
    "widgets",
    "language",
    "quick_settings",
  ];
  const currentSysmonMode = settings?.sysmon_mode || "cpu_ram";
  const currentMediaLocation = settings?.media_location || "notch";
  const currentAutostart = settings?.autostart ?? false;
  const islandEnabled = settings?.enable_dynamic_island ?? true;
  const islandShowMedia = currentMediaLocation === "notch" && (settings?.island_show_media ?? true);
  const islandShowHardware = settings?.island_show_hardware ?? true;
  const islandShowBattery = settings?.island_show_battery ?? true;
  const currentMarginTop = settings?.margin_top ?? 32;
  const currentMarginBottom = settings?.margin_bottom ?? 48;
  const currentMarginLeft = settings?.margin_left ?? 0;
  const currentMarginRight = settings?.margin_right ?? 0;

  useEffect(() => {
    tauriBridge.getPinnedApps().then(setPinnedApps).catch(console.error);
  }, []);

  const handleAddPinnedApp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAppName.trim() && !newAppCmd.trim()) return;

    const title = newAppName.trim() || newAppCmd.trim();
    const cmd = newAppCmd.trim() || newAppName.trim();
    const id = title.toLowerCase().replace(/[^a-z0-9]/g, "-");

    const app: PinnedApp = {
      id,
      title,
      exe: cmd,
      lnk_path: cmd,
      icon_b64: "",
    };

    tauriBridge.pinApp(app).then(() => {
      setPinnedApps((prev) => [...prev.filter((p) => p.id !== id), app]);
      setNewAppName("");
      setNewAppCmd("");
    });
  };

  const handleUnpinApp = (id: string) => {
    tauriBridge.unpinApp(id).then(() => {
      setPinnedApps((prev) => prev.filter((p) => p.id !== id));
    });
  };

  return (
    <div className="settings-flyout flyout-enter" onClick={(e) => e.stopPropagation()}>
      {/* Left Sidebar Navigation */}
      <aside className="settings-sidebar">
        <div className="settings-brand">
          <div className="settings-brand-icon">
            <img src="/logo.png" alt="Glace" className="settings-brand-img" />
          </div>
          <div className="settings-brand-info">
            <span className="settings-brand-name">Glace</span>
            <span className="settings-brand-badge">v0.2</span>
          </div>
        </div>

        <nav className="settings-nav">
          {/* Tab 1: Appearance */}
          <button
            className={`settings-nav-item ${activeTab === "appearance" ? "settings-nav-item--active" : ""}`}
            onClick={() => setActiveTab("appearance")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
              <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
              <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
              <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.563C22 6.5 17.5 2 12 2Z" />
            </svg>
            <span>Appearance</span>
          </button>

          {/* Tab 2: Taskbar & Dock */}
          <button
            className={`settings-nav-item ${activeTab === "taskbar" ? "settings-nav-item--active" : ""}`}
            onClick={() => setActiveTab("taskbar")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect width="20" height="15" x="2" y="4.5" rx="2.5" />
              <path d="M6 15.5h12" />
              <circle cx="8" cy="15.5" r="0.8" fill="currentColor" />
              <circle cx="12" cy="15.5" r="0.8" fill="currentColor" />
              <circle cx="16" cy="15.5" r="0.8" fill="currentColor" />
            </svg>
            <span>Taskbar & Dock</span>
          </button>

          {/* Tab 3: Dynamic Island */}
          <button
            className={`settings-nav-item ${activeTab === "island" ? "settings-nav-item--active" : ""}`}
            onClick={() => setActiveTab("island")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect width="18" height="9" x="3" y="7.5" rx="4.5" />
              <circle cx="7.5" cy="12" r="1.5" fill="currentColor" />
            </svg>
            <span>Dynamic Island</span>
          </button>

          {/* Tab 4: Status & Tray */}
          <button
            className={`settings-nav-item ${activeTab === "tray" ? "settings-nav-item--active" : ""}`}
            onClick={() => setActiveTab("tray")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 21v-7" />
              <path d="M4 10V3" />
              <path d="M12 21v-9" />
              <path d="M12 8V3" />
              <path d="M20 21v-5" />
              <path d="M20 12V3" />
              <path d="M1 14h6" />
              <path d="M9 8h6" />
              <path d="M17 16h6" />
            </svg>
            <span>Status & Tray</span>
          </button>

          {/* Tab 5: Pinned Apps */}
          <button
            className={`settings-nav-item ${activeTab === "pinned" ? "settings-nav-item--active" : ""}`}
            onClick={() => setActiveTab("pinned")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="17" x2="12" y2="22" />
              <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
            </svg>
            <span>Pinned Apps</span>
          </button>

          {/* Tab 6: About */}
          <button
            className={`settings-nav-item ${activeTab === "about" ? "settings-nav-item--active" : ""}`}
            onClick={() => setActiveTab("about")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            <span>About</span>
          </button>
        </nav>
      </aside>

      {/* Right Content View */}
      <main className="settings-main-content">
        <div className="settings-top-bar">
          <h4 className="settings-pane-title">
            {activeTab === "appearance" && "Appearance & Themes"}
            {activeTab === "taskbar" && "Taskbar & Dock Configuration"}
            {activeTab === "island" && "Dynamic Island (Top Notch Hub)"}
            {activeTab === "tray" && "Status Bar & System Tray"}
            {activeTab === "pinned" && "Taskbar Pinned Applications"}
            {activeTab === "about" && "System & Environment"}
          </h4>
          <button className="settings-close-circle icon-hover" onClick={onClose} title="Close Settings">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="settings-scroll-area">
          {/* Tab 1: Appearance */}
          {activeTab === "appearance" && (
            <div className="settings-section-block">
              <span className="settings-block-label">Theme Presets</span>
              <div className="theme-grid-cards">
                {THEME_PRESETS.map((preset) => {
                  const isActive = currentTheme === preset.id;
                  return (
                    <div
                      key={preset.id}
                      className={`theme-pill-card ${isActive ? "theme-pill-card--active" : ""}`}
                      onClick={() => setTheme(preset.id as ThemeId)}
                    >
                      <div
                        className="theme-pill-swatch"
                        style={{ background: preset.previewGradient }}
                      >
                        <div
                          className="theme-pill-dot"
                          style={{ background: preset.accent }}
                        />
                      </div>
                      <span className="theme-pill-name">{preset.name}</span>
                      {isActive && (
                        <div className="theme-pill-check">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <span className="settings-block-label">Accent Highlight</span>
              <div className="accent-picker-row">
                <div className="accent-swatches-list">
                  {ACCENT_PRESETS.map((color) => (
                    <button
                      key={color}
                      className={`accent-dot-btn ${
                        currentAccent === color ? "accent-dot-btn--active" : ""
                      }`}
                      style={{ background: color }}
                      onClick={() => updateSettings({ accent_color: color })}
                      title={color}
                    />
                  ))}
                </div>
                <div className="accent-native-wrapper" title="Custom Hex Picker">
                  <input
                    type="color"
                    value={currentAccent}
                    onChange={(e) => updateSettings({ accent_color: e.target.value })}
                    className="accent-hex-input"
                  />
                  <span className="accent-hex-label">{currentAccent}</span>
                </div>
              </div>

              <span className="settings-block-label">Glass Geometry & Refraction</span>
              <div className="geometry-controls-container">
                {/* Corner Radius Card */}
                <div className="geometry-card">
                  <div className="geometry-card-header">
                    <div className="geometry-card-left">
                      <div className="geometry-icon-box">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect width="18" height="18" x="3" y="3" rx="5" />
                        </svg>
                      </div>
                      <div className="geometry-titles">
                        <span className="geometry-title">Capsule Curvature</span>
                        <span className="geometry-desc">Taskbar dock border radius and corner smoothness</span>
                      </div>
                    </div>
                    <span className="geometry-val-badge">{currentRadius}px</span>
                  </div>

                  <div className="glace-slider-wrapper">
                    <input
                      type="range"
                      min="8"
                      max="32"
                      value={currentRadius}
                      onChange={(e) => updateSettings({ corner_radius: Number(e.target.value) })}
                      className="glace-range-slider"
                      style={{
                        background: `linear-gradient(to right, var(--glace-accent) 0%, var(--glace-accent) ${
                          ((currentRadius - 8) / (32 - 8)) * 100
                        }%, rgba(255, 255, 255, 0.12) ${
                          ((currentRadius - 8) / (32 - 8)) * 100
                        }%, rgba(255, 255, 255, 0.12) 100%)`,
                      }}
                    />
                  </div>

                  <div className="geometry-presets-row">
                    {[
                      { val: 8, label: "8px Square" },
                      { val: 14, label: "14px Subtle" },
                      { val: 20, label: "20px Balanced" },
                      { val: 28, label: "28px Full Pill" },
                    ].map((p) => (
                      <button
                        key={p.val}
                        type="button"
                        className={`geometry-preset-chip ${
                          currentRadius === p.val ? "geometry-preset-chip--active" : ""
                        }`}
                        onClick={() => updateSettings({ corner_radius: p.val })}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Glass Blur Intensity Card */}
                <div className="geometry-card">
                  <div className="geometry-card-header">
                    <div className="geometry-card-left">
                      <div className="geometry-icon-box">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 2v2" />
                          <path d="m4.93 4.93 1.41 1.41" />
                          <path d="M20 12h2" />
                          <path d="m19.07 4.93-1.41 1.41" />
                          <path d="M15.93 15.93 12 22l-3.93-6.07A8 8 0 1 1 15.93 15.93z" />
                        </svg>
                      </div>
                      <div className="geometry-titles">
                        <span className="geometry-title">Backdrop Blur & Frosting</span>
                        <span className="geometry-desc">Glass refraction, diffusion depth, and saturation</span>
                      </div>
                    </div>
                    <span className="geometry-val-badge">
                      {currentBlur.toFixed(1)}x · {Math.round(28 * currentBlur)}px
                    </span>
                  </div>

                  <div className="glace-slider-wrapper">
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={currentBlur}
                      onChange={(e) => updateSettings({ blur_intensity: Number(e.target.value) })}
                      className="glace-range-slider"
                      style={{
                        background: `linear-gradient(to right, var(--glace-accent) 0%, var(--glace-accent) ${
                          ((currentBlur - 0.5) / (2.0 - 0.5)) * 100
                        }%, rgba(255, 255, 255, 0.12) ${
                          ((currentBlur - 0.5) / (2.0 - 0.5)) * 100
                        }%, rgba(255, 255, 255, 0.12) 100%)`,
                      }}
                    />
                  </div>

                  <div className="geometry-presets-row">
                    {[
                      { val: 0.5, label: "0.5x Crystal" },
                      { val: 1.0, label: "1.0x Balanced" },
                      { val: 1.5, label: "1.5x Frosted" },
                      { val: 2.0, label: "2.0x Deep Obsidian" },
                    ].map((p) => (
                      <button
                        key={p.val}
                        type="button"
                        className={`geometry-preset-chip ${
                          Math.abs(currentBlur - p.val) < 0.05 ? "geometry-preset-chip--active" : ""
                        }`}
                        onClick={() => updateSettings({ blur_intensity: p.val })}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live Interactive Glass Preview */}
                <div className="geometry-live-preview-box">
                  <div className="geometry-preview-label">Live Dock Glass & Curvature Preview</div>
                  <div
                    className="geometry-preview-capsule"
                    style={{
                      borderRadius: `${currentRadius}px`,
                      backdropFilter: `blur(${Math.round(28 * currentBlur)}px) saturate(${Math.round(140 + 50 * currentBlur)}%)`,
                      WebkitBackdropFilter: `blur(${Math.round(28 * currentBlur)}px) saturate(${Math.round(140 + 50 * currentBlur)}%)`,
                    }}
                  >
                    <div className="geometry-preview-capsule-left">
                      <div className="geometry-preview-dot" />
                      <span className="geometry-preview-text">Glace Live Glass Refraction</span>
                    </div>
                    <span style={{ fontSize: "10px", color: "var(--glace-text-secondary)" }}>
                      r: {currentRadius}px · b: {Math.round(28 * currentBlur)}px
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Taskbar & Dock */}
          {activeTab === "taskbar" && (
            <div className="settings-section-block">
              {/* Taskbar Alignment Selector */}
              <span className="settings-block-label">Taskbar Dock Alignment</span>
              <div className="layout-choice-grid">
                {([
                  { id: "left", title: "Left Aligned", sub: "Classic Windows 10 style" },
                  { id: "center", title: "Centered Dock", sub: "Windows 11 / macOS style" },
                  { id: "right", title: "Right Aligned", sub: "Clustered next to tray" },
                ] as const).map((item) => {
                  const isActive = currentBarAlign === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`layout-choice-btn ${isActive ? "layout-choice-btn--active" : ""}`}
                      onClick={() => updateSettings({ bar_alignment: item.id })}
                    >
                      <span className="layout-choice-title">{item.title}</span>
                      <span className="layout-choice-sub">{item.sub}</span>
                    </button>
                  );
                })}
              </div>

              {/* Desktop Layout Style */}
              <span className="settings-block-label" style={{ marginTop: "14px" }}>
                Desktop Layout Style
              </span>
              <div className="layout-choice-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <button
                  type="button"
                  className={`layout-choice-btn ${currentBarPos !== "macos" && currentBarPos !== "top" ? "layout-choice-btn--active" : ""}`}
                  onClick={() => updateSettings({ bar_position: "windows", margin_top: 32, margin_bottom: 48 })}
                >
                  <span className="layout-choice-title">Windows Style</span>
                  <span className="layout-choice-sub">Unified bottom taskbar with apps, start & tray</span>
                </button>
                <button
                  type="button"
                  className={`layout-choice-btn ${currentBarPos === "macos" || currentBarPos === "top" ? "layout-choice-btn--active" : ""}`}
                  onClick={() => updateSettings({ bar_position: "macos", margin_top: 32, margin_bottom: 48 })}
                >
                  <span className="layout-choice-title">macOS Style</span>
                  <span className="layout-choice-sub">Bottom app dock + Top menu bar with status & clock</span>
                </button>
              </div>

              {/* App Screen Bounds & Desktop Work Area Margins */}
              <div style={{ marginTop: "16px" }}>
                <span className="settings-block-label" style={{ margin: 0 }}>
                  Active App Screen Bounds & Desktop Margins
                </span>
                <span style={{ fontSize: "11px", color: "var(--glace-text-muted)", display: "block", marginTop: "2px", marginBottom: "8px" }}>
                  Restricts maximized & snapped apps to prevent overlapping custom top, bottom, left, or right spaces
                </span>
              </div>

              {/* Margins Sliders Grid */}
              <div className="margin-controls-grid">
                {/* Top Margin */}
                <div className="geometry-slider-card">
                  <div className="geometry-slider-header">
                    <div className="geometry-meta">
                      <div className="geometry-icon">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="18 15 12 9 6 15" />
                        </svg>
                      </div>
                      <div>
                        <span className="geometry-title">Top Margin (Notch / Top Area)</span>
                        <span className="geometry-desc">Reserved height at the top edge</span>
                      </div>
                    </div>
                    <span className="geometry-val-badge">{currentMarginTop}px</span>
                  </div>
                  <div className="glace-slider-wrapper">
                    <input
                      type="range"
                      min="0"
                      max="150"
                      step="2"
                      value={currentMarginTop}
                      onChange={(e) => updateSettings({ margin_top: Number(e.target.value) })}
                      className="glace-range-slider"
                      style={{
                        background: `linear-gradient(to right, var(--glace-accent) 0%, var(--glace-accent) ${
                          (currentMarginTop / 150) * 100
                        }%, rgba(255, 255, 255, 0.12) ${
                          (currentMarginTop / 150) * 100
                        }%, rgba(255, 255, 255, 0.12) 100%)`,
                      }}
                    />
                  </div>
                </div>

                {/* Bottom Margin */}
                <div className="geometry-slider-card">
                  <div className="geometry-slider-header">
                    <div className="geometry-meta">
                      <div className="geometry-icon">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                      <div>
                        <span className="geometry-title">Bottom Margin (Taskbar Dock)</span>
                        <span className="geometry-desc">Reserved height for bottom dock</span>
                      </div>
                    </div>
                    <span className="geometry-val-badge">{currentMarginBottom}px</span>
                  </div>
                  <div className="glace-slider-wrapper">
                    <input
                      type="range"
                      min="0"
                      max="150"
                      step="2"
                      value={currentMarginBottom}
                      onChange={(e) => updateSettings({ margin_bottom: Number(e.target.value) })}
                      className="glace-range-slider"
                      style={{
                        background: `linear-gradient(to right, var(--glace-accent) 0%, var(--glace-accent) ${
                          (currentMarginBottom / 150) * 100
                        }%, rgba(255, 255, 255, 0.12) ${
                          (currentMarginBottom / 150) * 100
                        }%, rgba(255, 255, 255, 0.12) 100%)`,
                      }}
                    />
                  </div>
                </div>

                {/* Left Margin */}
                <div className="geometry-slider-card">
                  <div className="geometry-slider-header">
                    <div className="geometry-meta">
                      <div className="geometry-icon">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="15 18 9 12 15 6" />
                        </svg>
                      </div>
                      <div>
                        <span className="geometry-title">Left Margin (Sidebar / Gap)</span>
                        <span className="geometry-desc">Reserved space on the left screen edge</span>
                      </div>
                    </div>
                    <span className="geometry-val-badge">{currentMarginLeft}px</span>
                  </div>
                  <div className="glace-slider-wrapper">
                    <input
                      type="range"
                      min="0"
                      max="200"
                      step="4"
                      value={currentMarginLeft}
                      onChange={(e) => updateSettings({ margin_left: Number(e.target.value) })}
                      className="glace-range-slider"
                      style={{
                        background: `linear-gradient(to right, var(--glace-accent) 0%, var(--glace-accent) ${
                          (currentMarginLeft / 200) * 100
                        }%, rgba(255, 255, 255, 0.12) ${
                          (currentMarginLeft / 200) * 100
                        }%, rgba(255, 255, 255, 0.12) 100%)`,
                      }}
                    />
                  </div>
                </div>

                {/* Right Margin */}
                <div className="geometry-slider-card">
                  <div className="geometry-slider-header">
                    <div className="geometry-meta">
                      <div className="geometry-icon">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </div>
                      <div>
                        <span className="geometry-title">Right Margin (Sidebar / Gap)</span>
                        <span className="geometry-desc">Reserved space on the right screen edge</span>
                      </div>
                    </div>
                    <span className="geometry-val-badge">{currentMarginRight}px</span>
                  </div>
                  <div className="glace-slider-wrapper">
                    <input
                      type="range"
                      min="0"
                      max="200"
                      step="4"
                      value={currentMarginRight}
                      onChange={(e) => updateSettings({ margin_right: Number(e.target.value) })}
                      className="glace-range-slider"
                      style={{
                        background: `linear-gradient(to right, var(--glace-accent) 0%, var(--glace-accent) ${
                          (currentMarginRight / 200) * 100
                        }%, rgba(255, 255, 255, 0.12) ${
                          (currentMarginRight / 200) * 100
                        }%, rgba(255, 255, 255, 0.12) 100%)`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Quick Margin Presets & Live Visual Monitor */}
              <div className="geometry-presets-row" style={{ marginTop: "8px" }}>
                {[
                  { label: "Recommended (32/48)", top: 32, bottom: 48, left: 0, right: 0 },
                  { label: "Bespoke Gaps (44/56/16/16)", top: 44, bottom: 56, left: 16, right: 16 },
                  { label: "Wide Sidebars (40/50/60/60)", top: 40, bottom: 50, left: 60, right: 60 },
                  { label: "Zero Margins (0/0)", top: 0, bottom: 0, left: 0, right: 0 },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className="geometry-preset-chip"
                    onClick={() => updateSettings({ margin_top: p.top, margin_bottom: p.bottom, margin_left: p.left, margin_right: p.right })}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Live Desktop Monitor Preview */}
              <div className="margin-live-monitor-box">
                <div className="geometry-preview-label">Live Active App Workspace Diagram</div>
                <div className="margin-screen-monitor-frame">
                  {/* Top Notch Inset Bar */}
                  {currentMarginTop > 0 && (
                    <div
                      className="margin-inset-indicator margin-inset-indicator--top"
                      style={{ height: `${Math.max(8, Math.round((currentMarginTop / 150) * 28))}px` }}
                    >
                      <span>Top Reserved: {currentMarginTop}px</span>
                    </div>
                  )}

                  {/* Middle Row with Left, App Workspace, and Right */}
                  <div className="margin-monitor-middle-row">
                    {currentMarginLeft > 0 && (
                      <div
                        className="margin-inset-indicator margin-inset-indicator--left"
                        style={{ width: `${Math.max(12, Math.round((currentMarginLeft / 200) * 45))}px` }}
                      >
                        <span>{currentMarginLeft}px</span>
                      </div>
                    )}

                    <div className="margin-active-app-workspace">
                      <div className="margin-app-mock-window">
                        <div className="margin-mock-titlebar">
                          <div className="margin-mock-dots">
                            <span /><span /><span />
                          </div>
                          <span className="margin-mock-title">Active App / Browser / Editor</span>
                        </div>
                        <div className="margin-mock-body">
                          <span>Maximized Windows restricted inside this area</span>
                        </div>
                      </div>
                    </div>

                    {currentMarginRight > 0 && (
                      <div
                        className="margin-inset-indicator margin-inset-indicator--right"
                        style={{ width: `${Math.max(12, Math.round((currentMarginRight / 200) * 45))}px` }}
                      >
                        <span>{currentMarginRight}px</span>
                      </div>
                    )}
                  </div>

                  {/* Bottom Dock Inset Bar */}
                  {currentMarginBottom > 0 && (
                    <div
                      className="margin-inset-indicator margin-inset-indicator--bottom"
                      style={{ height: `${Math.max(8, Math.round((currentMarginBottom / 150) * 28))}px` }}
                    >
                      <span>Bottom Dock: {currentMarginBottom}px</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Media Player Active Location Preference */}
              <span className="settings-block-label" style={{ marginTop: "14px" }}>
                Media Player Active Location (Single Active Module)
              </span>
              <div className="sysmon-mode-options-grid">
                {MEDIA_LOCATIONS.map((loc) => {
                  const isSelected = currentMediaLocation === loc.id;
                  return (
                    <div
                      key={loc.id}
                      className={`sysmon-mode-card ${
                        isSelected ? "sysmon-mode-card--active" : ""
                      }`}
                      onClick={() => setMediaLocation(loc.id)}
                    >
                      <div className="sysmon-mode-header">
                        <span className="sysmon-mode-name">{loc.name}</span>
                        <span className="sysmon-mode-badge">{loc.badge}</span>
                      </div>
                      <span className="sysmon-mode-desc">{loc.desc}</span>
                      {isSelected && (
                        <div className="sysmon-mode-check">
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Taskbar Capsules Visibility */}
              <span className="settings-block-label" style={{ marginTop: "14px" }}>
                Taskbar Capsules & Sections
              </span>
              <div className="widget-items-stack">
                {WIDGET_OPTIONS.map((w) => {
                  const isEnabled = w.id === "media"
                    ? currentMediaLocation === "taskbar"
                    : enabledWidgets.includes(w.id);
                  return (
                    <div
                      key={w.id}
                      className="widget-row-card"
                      onClick={() => {
                        if (w.id === "media") {
                          setMediaLocation(currentMediaLocation === "taskbar" ? "notch" : "taskbar");
                        } else {
                          toggleWidget(w.id);
                        }
                      }}
                    >
                      <div className="widget-row-meta">
                        <span className="widget-row-name">{w.name}</span>
                        <span className="widget-row-desc">
                          {w.id === "media"
                            ? currentMediaLocation === "taskbar"
                              ? "Active in Taskbar dock (Dynamic Notch media is dormant)"
                              : currentMediaLocation === "notch"
                              ? "Active in Top Dynamic Notch (Click to move into Taskbar)"
                              : "Currently disabled in both Taskbar and Notch"
                            : w.desc}
                        </span>
                      </div>
                      <div className={`switch-pill ${isEnabled ? "switch-pill--on" : ""}`}>
                        <div className="switch-thumb" />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* System Startup */}
              <span className="settings-block-label" style={{ marginTop: "14px" }}>
                System Startup
              </span>
              <div
                className="widget-row-card"
                onClick={() => updateSettings({ autostart: !currentAutostart })}
              >
                <div className="widget-row-meta">
                  <span className="widget-row-name">Launch on Windows Startup</span>
                  <span className="widget-row-desc">Automatically initialize Glace upon user login</span>
                </div>
                <div className={`switch-pill ${currentAutostart ? "switch-pill--on" : ""}`}>
                  <div className="switch-thumb" />
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Dynamic Island */}
          {activeTab === "island" && (
            <div className="settings-section-block">
              <span className="settings-block-label">Dynamic Island (Top Notch Hub)</span>
              <div className="widget-items-stack">
                <div
                  className="widget-row-card"
                  onClick={() => updateSettings({ enable_dynamic_island: !islandEnabled })}
                >
                  <div className="widget-row-meta">
                    <span className="widget-row-name">Enable Top Dynamic Island</span>
                    <span className="widget-row-desc">Ambient top notch for music visualizer, hardware telemetry, and notifications</span>
                  </div>
                  <div className={`switch-pill ${islandEnabled ? "switch-pill--on" : ""}`}>
                    <div className="switch-thumb" />
                  </div>
                </div>

                {islandEnabled && (
                  <>
                    <div
                      className="widget-row-card"
                      onClick={() => setMediaLocation(currentMediaLocation === "notch" ? "taskbar" : "notch")}
                    >
                      <div className="widget-row-meta">
                        <span className="widget-row-name">Live Media Activity HUD</span>
                        <span className="widget-row-desc">
                          {currentMediaLocation === "notch"
                            ? "Active in Dynamic Notch (Taskbar dock media is dormant)"
                            : "Click to route active music player & soundwave to Dynamic Notch"}
                        </span>
                      </div>
                      <div className={`switch-pill ${currentMediaLocation === "notch" ? "switch-pill--on" : ""}`}>
                        <div className="switch-thumb" />
                      </div>
                    </div>

                    <div
                      className="widget-row-card"
                      onClick={() => updateSettings({ island_show_hardware: !islandShowHardware })}
                    >
                      <div className="widget-row-meta">
                        <span className="widget-row-name">Hardware Quick Metrics</span>
                        <span className="widget-row-desc">Show CPU load, RAM usage, and live Internet bandwidth in expanded notch</span>
                      </div>
                      <div className={`switch-pill ${islandShowHardware ? "switch-pill--on" : ""}`}>
                        <div className="switch-thumb" />
                      </div>
                    </div>

                    <div
                      className="widget-row-card"
                      onClick={() => updateSettings({ island_show_battery: !islandShowBattery })}
                    >
                      <div className="widget-row-meta">
                        <span className="widget-row-name">Battery & Power Status</span>
                        <span className="widget-row-desc">Display battery level and charging indicator in compact notch</span>
                      </div>
                      <div className={`switch-pill ${islandShowBattery ? "switch-pill--on" : ""}`}>
                        <div className="switch-thumb" />
                      </div>
                    </div>

                    {/* Window Overlap & Top Margin Clearance */}
                    <span className="settings-block-label" style={{ marginTop: "14px" }}>
                      Notch Screen Clearance & Window Overlap
                    </span>

                    <div
                      className="widget-row-card"
                      onClick={() => updateSettings({ margin_top: currentMarginTop === 0 ? 32 : 0 })}
                    >
                      <div className="widget-row-meta">
                        <span className="widget-row-name">Allow Windows to Overlap Notch</span>
                        <span className="widget-row-desc">
                          {currentMarginTop === 0
                            ? "Overlap Active: Maximized windows fill the entire screen behind the notch"
                            : "Clearance Active: Desktop reserved so maximized windows start below the notch"}
                        </span>
                      </div>
                      <div className={`switch-pill ${currentMarginTop === 0 ? "switch-pill--on" : ""}`}>
                        <div className="switch-thumb" />
                      </div>
                    </div>

                    <div className="geometry-slider-card" style={{ marginTop: "6px" }}>
                      <div className="geometry-slider-header">
                        <div className="geometry-meta">
                          <div className="geometry-icon">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="18 15 12 9 6 15" />
                            </svg>
                          </div>
                          <div>
                            <span className="geometry-title">Top Screen Margin Offset</span>
                            <span className="geometry-desc">
                              {currentMarginTop === 0
                                ? "0px — Full overlay (Windows maximize underneath)"
                                : `${currentMarginTop}px — Windows restricted below notch`}
                            </span>
                          </div>
                        </div>
                        <span className="geometry-val-badge">{currentMarginTop}px</span>
                      </div>
                      <div className="glace-slider-wrapper">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="2"
                          value={currentMarginTop}
                          onChange={(e) => updateSettings({ margin_top: Number(e.target.value) })}
                          className="glace-range-slider"
                          style={{
                            background: `linear-gradient(to right, var(--glace-accent) 0%, var(--glace-accent) ${
                              (currentMarginTop / 100) * 100
                            }%, rgba(255, 255, 255, 0.12) ${
                              (currentMarginTop / 100) * 100
                            }%, rgba(255, 255, 255, 0.12) 100%)`,
                          }}
                        />
                      </div>

                      <div className="geometry-presets-row" style={{ marginTop: "10px" }}>
                        {[
                          { val: 0, label: "0px (Overlap)" },
                          { val: 28, label: "28px (Flush)" },
                          { val: 32, label: "32px (Default)" },
                          { val: 48, label: "48px (macOS Top)" },
                        ].map((p) => (
                          <button
                            key={p.val}
                            type="button"
                            className={`geometry-preset-chip ${
                              currentMarginTop === p.val ? "geometry-preset-chip--active" : ""
                            }`}
                            onClick={() => updateSettings({ margin_top: p.val })}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Tab 4: Status & Tray */}
          {activeTab === "tray" && (
            <div className="settings-section-block">
              {/* System Monitor Mode Chooser */}
              <span className="settings-block-label">
                System Monitor Display Preference
              </span>
              <div className="sysmon-mode-options-grid">
                {SYSMON_MODES.map((m) => {
                  const isSelected = currentSysmonMode === m.id;
                  return (
                    <div
                      key={m.id}
                      className={`sysmon-mode-card ${
                        isSelected ? "sysmon-mode-card--active" : ""
                      }`}
                      onClick={() => setSysMonMode(m.id)}
                    >
                      <div className="sysmon-mode-header">
                        <span className="sysmon-mode-name">{m.name}</span>
                        <span className="sysmon-mode-badge">{m.badge}</span>
                      </div>
                      <span className="sysmon-mode-desc">{m.desc}</span>
                      {isSelected && (
                        <div className="sysmon-mode-check">
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Tray & Status Bar Items Chooser */}
              <span className="settings-block-label" style={{ marginTop: "16px" }}>
                Tray & Status Bar Icons
              </span>
              <div className="widget-items-stack">
                {TRAY_ITEM_OPTIONS.map((item) => {
                  const isEnabled = enabledTrayItems.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      className="widget-row-card"
                      onClick={() => toggleTrayItem(item.id)}
                    >
                      <div className="widget-row-meta">
                        <span className="widget-row-name">{item.name}</span>
                        <span className="widget-row-desc">{item.desc}</span>
                      </div>
                      <div className={`switch-pill ${isEnabled ? "switch-pill--on" : ""}`}>
                        <div className="switch-thumb" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tab 5: Pinned Apps */}
          {activeTab === "pinned" && (
            <div className="settings-section-block">
              <span className="settings-block-label">Pin New Application</span>
              <form className="pinned-form-box" onSubmit={handleAddPinnedApp}>
                <div className="pinned-inputs-row">
                  <input
                    type="text"
                    placeholder="App Name (e.g. Spotify)"
                    value={newAppName}
                    onChange={(e) => setNewAppName(e.target.value)}
                    className="pinned-styled-input"
                  />
                  <input
                    type="text"
                    placeholder="Executable or Path (e.g. spotify.exe)"
                    value={newAppCmd}
                    onChange={(e) => setNewAppCmd(e.target.value)}
                    className="pinned-styled-input"
                  />
                </div>
                <button type="submit" className="pinned-submit-btn">
                  + Pin to Dock
                </button>
              </form>

              <div className="pinned-header-row">
                <span className="settings-block-label">Current Pinned Apps ({pinnedApps.length})</span>
              </div>

              <div className="pinned-items-list">
                {pinnedApps.map((app) => (
                  <div key={app.id} className="pinned-card-item">
                    <div className="pinned-card-left">
                      {app.icon_b64 ? (
                        <img src={app.icon_b64} alt="" className="pinned-card-icon" />
                      ) : (
                        <div className="pinned-card-fallback">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect width="18" height="18" x="3" y="3" rx="2" />
                          </svg>
                        </div>
                      )}
                      <div className="pinned-card-meta">
                        <span className="pinned-card-name">{app.title}</span>
                        <span className="pinned-card-path">{app.exe || app.lnk_path}</span>
                      </div>
                    </div>
                    <button
                      className="pinned-card-unpin"
                      onClick={() => handleUnpinApp(app.id)}
                      title="Unpin application"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                {pinnedApps.length === 0 && (
                  <div className="pinned-empty-box">
                    No pinned apps. Right-click any active app in the dock or add above.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 6: About */}
          {activeTab === "about" && (
            <div className="settings-section-block">
              <div className="about-hero-box">
                <div className="about-hero-brand">
                  <img src="/logo.png" alt="Glace Logo" className="about-hero-logo" />
                  <div className="about-hero-titles">
                    <div className="about-hero-title">Glace Desktop Environment</div>
                    <span className="about-hero-edition">v0.2.0 · Glass Edition</span>
                  </div>
                </div>
                <p className="about-hero-desc">
                  Ultra-fast, customizable taskbar and widget environment for Windows built with Tauri v2, Win32 APIs, and React 19.
                </p>
                <div className="about-specs-grid">
                  <div className="about-spec-item">
                    <span className="about-spec-key">Core</span>
                    <span className="about-spec-val">Rust 1.98 · Tauri v2</span>
                  </div>
                  <div className="about-spec-item">
                    <span className="about-spec-key">Frontend</span>
                    <span className="about-spec-val">React 19 · Vite 7</span>
                  </div>
                  <div className="about-spec-item">
                    <span className="about-spec-key">Windowing</span>
                    <span className="about-spec-val">Win32 DWM + Shell Hook</span>
                  </div>
                  <div className="about-spec-item">
                    <span className="about-spec-key">Theming</span>
                    <span className="about-spec-val">Live CSS Tokens Engine</span>
                  </div>
                </div>
              </div>

              <button
                className="settings-danger-reset"
                onClick={() =>
                  updateSettings({
                    theme_id: "obsidian",
                    accent_color: "#10b981",
                    blur_intensity: 1.0,
                    corner_radius: 20,
                    bar_position: "bottom",
                    bar_alignment: "center",
                    enabled_widgets: ["start", "apps", "sysmon", "tray", "clock"],
                    sysmon_mode: "cpu_ram",
                  })
                }
              >
                ↺ Reset All Settings to Factory Defaults
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
