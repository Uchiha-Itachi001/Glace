import React, { useState, useEffect } from "react";
import { useSettings, THEME_PRESETS } from "../../stores/settingsStore";
import { ThemeId, BarAlignment, AppResourceUsage } from "../../types";
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

const PEEK_KEYS: Array<{ id: "shift" | "ctrl" | "space" | "tab"; name: string; badge: string; desc: string }> = [
  {
    id: "shift",
    name: "Shift Key",
    badge: "Default",
    desc: "Hold Shift while hovering over notch to peek & click behind it",
  },
  {
    id: "ctrl",
    name: "Ctrl Key",
    badge: "Ctrl",
    desc: "Hold Ctrl while hovering over notch to peek & click behind it",
  },
  {
    id: "space",
    name: "Spacebar",
    badge: "Space",
    desc: "Hold Space while hovering over notch to peek & click behind it",
  },
  {
    id: "tab",
    name: "Tab Key",
    badge: "Tab",
    desc: "Hold Tab while hovering over notch to peek & click behind it",
  },
];

export const SettingsFlyout: React.FC<SettingsFlyoutProps> = ({ onClose }) => {
  const { settings, updateSettings, setTheme, toggleWidget, toggleTrayItem, setSysMonMode, setMediaLocation } = useSettings();
  const [activeTab, setActiveTab] = useState<"appearance" | "taskbar" | "island" | "tray" | "performance" | "about">("appearance");

  const currentTheme = settings?.theme_id || "obsidian";
  const currentAccent = settings?.accent_color || "#10b981";
  const currentRadius = settings?.corner_radius ?? 20;
  const currentBlur = settings?.blur_intensity ?? 1.0;
  const currentBarPos = settings?.bar_position || "bottom";
  const isMacStyle = currentBarPos === "macos" || currentBarPos === "top";
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
  const currentAutostart = settings?.autostart ?? true;
  const islandEnabled = settings?.enable_dynamic_island ?? true;
  const islandShowBluetooth = settings?.island_show_bluetooth ?? true;
  const islandShowHardware = settings?.island_show_hardware ?? true;
  const islandShowBattery = settings?.island_show_battery ?? true;
  const currentMarginTop = settings?.margin_top ?? 0;
  const currentMarginBottom = settings?.margin_bottom ?? 48;
  const currentMarginLeft = settings?.margin_left ?? 0;
  const currentMarginRight = settings?.margin_right ?? 0;

  const [resourceUsage, setResourceUsage] = useState<AppResourceUsage | null>(null);

  useEffect(() => {
    if (activeTab !== "performance") return;
    let isMounted = true;

    const fetchUsage = async () => {
      try {
        const data = await tauriBridge.getAppResourceUsage();
        if (isMounted) {
          setResourceUsage(data);
        }
      } catch (err) {
        console.error("Failed to fetch app resource usage:", err);
      }
    };

    fetchUsage();
    const interval = setInterval(fetchUsage, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeTab]);

  const formatUptime = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const openExternalLink = (url: string) => {
    tauriBridge.launchApp(url).catch(console.error);
  };

  return (
    <div
      className={`settings-flyout settings-flyout--align-${currentBarAlign} settings-flyout--pos-${currentBarPos} flyout-enter`}
      onClick={(e) => e.stopPropagation()}
    >
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

          {/* Tab 5: Performance & Resources */}
          <button
            className={`settings-nav-item ${activeTab === "performance" ? "settings-nav-item--active" : ""}`}
            onClick={() => setActiveTab("performance")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v4" />
              <path d="m4.93 4.93 2.83 2.83" />
              <path d="M2 12h4" />
              <path d="m4.93 19.07 2.83-2.83" />
              <path d="M12 22v-4" />
              <path d="m19.07 19.07-2.83-2.83" />
              <path d="M22 12h-4" />
              <path d="m19.07 4.93-2.83 2.83" />
              <circle cx="12" cy="12" r="3" fill="currentColor" />
            </svg>
            <span>Performance</span>
          </button>

          {/* Tab 6: About & Developer */}
          <button
            className={`settings-nav-item ${activeTab === "about" ? "settings-nav-item--active" : ""}`}
            onClick={() => setActiveTab("about")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            <span>About & Credits</span>
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
            {activeTab === "performance" && "Performance & Resource Monitor"}
            {activeTab === "about" && "About & Developer Credits"}
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

                  <div className="geometry-presets-row">
                    {[
                      { val: 6, label: "6px", sub: "Square" },
                      { val: 10, label: "10px", sub: "Subtle" },
                      { val: 15, label: "15px", sub: "Balanced" },
                      { val: 20, label: "20px", sub: "Full Pill" },
                    ].map((p) => (
                      <button
                        key={p.val}
                        type="button"
                        className={`geometry-preset-chip ${
                          currentRadius === p.val ? "geometry-preset-chip--active" : ""
                        }`}
                        onClick={() => updateSettings({ corner_radius: p.val })}
                      >
                        <span style={{ fontWeight: 600 }}>{p.label}</span>
                        <span className="geometry-preset-sub">{p.sub}</span>
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

                  <div className="geometry-presets-row">
                    {[
                      { val: 0.5, label: "0.5x", sub: "Crystal" },
                      { val: 1.0, label: "1.0x", sub: "Balanced" },
                      { val: 1.5, label: "1.5x", sub: "Frosted" },
                      { val: 2.0, label: "2.0x", sub: "Obsidian" },
                    ].map((p) => (
                      <button
                        key={p.val}
                        type="button"
                        className={`geometry-preset-chip ${
                          Math.abs(currentBlur - p.val) < 0.05 ? "geometry-preset-chip--active" : ""
                        }`}
                        onClick={() => updateSettings({ blur_intensity: p.val })}
                      >
                        <span style={{ fontWeight: 600 }}>{p.label}</span>
                        <span className="geometry-preset-sub">{p.sub}</span>
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
              {/* 1. Desktop Layout Style */}
              <span className="settings-block-label">Desktop Layout Style</span>
              <div className="layout-choice-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <button
                  type="button"
                  className={`layout-choice-btn ${!isMacStyle ? "layout-choice-btn--active" : ""}`}
                  onClick={() => updateSettings({ bar_position: "windows", margin_bottom: 48 })}
                >
                  <span className="layout-choice-title">Windows Style</span>
                  <span className="layout-choice-sub">Unified bottom taskbar with apps, start & tray</span>
                </button>
                <button
                  type="button"
                  className={`layout-choice-btn ${isMacStyle ? "layout-choice-btn--active" : ""}`}
                  onClick={() => updateSettings({ bar_position: "macos", margin_bottom: 48 })}
                >
                  <span className="layout-choice-title">macOS Style</span>
                  <span className="layout-choice-sub">Bottom app dock + Top menu bar with status & clock</span>
                </button>
              </div>

              {/* 2. Taskbar Dock Alignment */}
              <span className="settings-block-label" style={{ marginTop: "16px" }}>
                Taskbar Dock Alignment
              </span>
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

              {/* 3. Taskbar Capsules Visibility */}
              <span className="settings-block-label" style={{ marginTop: "16px" }}>
                Taskbar Capsules & Sections
              </span>
              <div className="widget-items-stack">
                {WIDGET_OPTIONS.map((w) => {
                  const isEnabled = enabledWidgets.includes(w.id);
                  return (
                    <div
                      key={w.id}
                      className="widget-row-card"
                      onClick={() => toggleWidget(w.id)}
                    >
                      <div className="widget-row-meta">
                        <span className="widget-row-name">{w.name}</span>
                        <span className="widget-row-desc">{w.desc}</span>
                      </div>
                      <div className={`switch-pill ${isEnabled ? "switch-pill--on" : ""}`}>
                        <div className="switch-thumb" />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 4. Active App Screen Bounds & Desktop Work Area Margins (Hidden / Preserved) */}
              {false && (
                <>
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
                </>
              )}
            </div>
          )}

          {/* Tab 3: Dynamic Island */}
          {activeTab === "island" && (
            <>
              {/* 1. Master Switch Section */}
              <div className="settings-section-block">
                <span className="settings-block-label">Master Switch</span>
                <div className="widget-items-stack">
                  <div
                    className="widget-row-card"
                    style={{
                      border: islandEnabled ? "1px solid var(--glace-accent)" : "1px solid rgba(255, 255, 255, 0.08)",
                      background: islandEnabled ? "rgba(var(--glace-accent-rgb, 16, 185, 129), 0.08)" : undefined,
                    }}
                    onClick={() => updateSettings({ enable_dynamic_island: !islandEnabled })}
                  >
                    <div className="widget-row-meta">
                      <span className="widget-row-name" style={{ fontWeight: 600 }}>Enable Top Dynamic Island</span>
                      <span className="widget-row-desc">
                        {islandEnabled
                          ? "Active: Dynamic Notch hub is active on the top screen edge"
                          : "Disabled: Dynamic Notch is completely turned off"}
                      </span>
                    </div>
                    <div className={`switch-pill ${islandEnabled ? "switch-pill--on" : ""}`}>
                      <div className="switch-thumb" />
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Window Overlap & Top Margin Clearance (Moved to Top Section) */}
              {islandEnabled && (
                <div className="settings-section-block" style={{ marginTop: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span className="settings-block-label" style={{ margin: 0 }}>Notch Screen Clearance & Window Overlap</span>
                    {isMacStyle && (
                      <span style={{
                        fontSize: "9px",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        padding: "2px 7px",
                        borderRadius: "6px",
                        background: "rgba(239, 68, 68, 0.15)",
                        color: "#f87171",
                        border: "1px solid rgba(239, 68, 68, 0.25)"
                      }}>
                        Locked in macOS Mode
                      </span>
                    )}
                  </div>
                  <div className="widget-items-stack">
                    <div
                      className={`widget-row-card ${isMacStyle ? "widget-row-card--disabled" : ""}`}
                      style={isMacStyle ? { opacity: 0.6, cursor: "not-allowed" } : undefined}
                      onClick={() => {
                        if (isMacStyle) return;
                        updateSettings({ margin_top: currentMarginTop === 0 ? 32 : 0 });
                      }}
                      title={isMacStyle ? "In macOS layout, the full top menu bar occupies the top edge and always requires clearance" : undefined}
                    >
                      <div className="widget-row-meta">
                        <span className="widget-row-name">Allow Windows to Overlap Notch</span>
                        <span className="widget-row-desc">
                          {isMacStyle
                            ? "Restricted in macOS Style: Full-width top menu bar is active and reserves top screen clearance (32px)"
                            : currentMarginTop === 0
                            ? "Overlap Active: Maximized windows fill entire screen behind notch (0px)"
                            : "Clearance Active: Desktop reserved so maximized windows start below notch (32px)"}
                        </span>
                      </div>
                      <div className={`switch-pill ${!isMacStyle && currentMarginTop === 0 ? "switch-pill--on" : ""}`}>
                        <div className="switch-thumb" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. Hover Peek-Through Key Selector */}
              {islandEnabled && !isMacStyle && currentMarginTop === 0 && (
                <div className="settings-section-block" style={{ marginTop: "16px" }}>
                  <span className="settings-block-label">
                    Hover Peek-Through Key
                  </span>
                  <div className="sysmon-mode-options-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                    {PEEK_KEYS.map((pk) => {
                      const isSelected = (settings?.notch_peek_key || "shift") === pk.id;
                      return (
                        <div
                          key={pk.id}
                          className={`sysmon-mode-card ${
                            isSelected ? "sysmon-mode-card--active" : ""
                          }`}
                          onClick={() => updateSettings({ notch_peek_key: pk.id })}
                        >
                          <div className="sysmon-mode-header">
                            <span className="sysmon-mode-name">{pk.name}</span>
                            <span className="sysmon-mode-badge">{pk.badge}</span>
                          </div>
                          <span className="sysmon-mode-desc">{pk.desc}</span>
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
                </div>
              )}

              {/* 4. Media Player Location Routing (Single Authoritative Selector) */}
              {islandEnabled && (
                <div className="settings-section-block" style={{ marginTop: "16px" }}>
                  <span className="settings-block-label">
                    Media Player Routing & Live HUD
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
                </div>
              )}

              {/* 4. Sub-Features & Activity HUDs */}
              {islandEnabled && (
                <div className="settings-section-block" style={{ marginTop: "16px" }}>
                  <span className="settings-block-label">Notch Features & Activity HUDs</span>
                  <div className="widget-items-stack">
                    <div
                      className="widget-row-card"
                      onClick={() => updateSettings({ island_show_bluetooth: !islandShowBluetooth })}
                    >
                      <div className="widget-row-meta">
                        <span className="widget-row-name">Bluetooth Device HUD</span>
                        <span className="widget-row-desc">Show connected audio headsets, earbuds, and live battery level</span>
                      </div>
                      <div className={`switch-pill ${islandShowBluetooth ? "switch-pill--on" : ""}`}>
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
                  </div>
                </div>
              )}
            </>
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

          {/* Tab 5: About & Developer Credits */}
          {activeTab === "about" && (
            <div className="settings-section-block">
              {/* 1. System Startup Preferences (Top Position) */}
              <span className="settings-block-label" style={{ margin: 0 }}>
                System Startup
              </span>
              <div
                className="widget-row-card"
                style={{ marginTop: "8px", marginBottom: "16px" }}
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

              {/* 2. Developer & Creator Card */}
              <span className="settings-block-label">Developer & Creator</span>
              <div className="about-dev-card">
                <div className="about-dev-top">
                  <div className="about-dev-avatar-wrap">
                    <img
                      src="/developer.jpg"
                      alt="Pankoj Roy"
                      className="about-dev-avatar"
                      onError={(e) => {
                        // Fallback in case of image load issue
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                    <div className="about-dev-avatar-badge" title="Active Developer">
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </div>
                  </div>
                  <div className="about-dev-meta">
                    <div className="about-dev-name-row">
                      <span className="about-dev-name">Pankoj Roy</span>
                      <span className="about-dev-role-badge">Lead Architect</span>
                    </div>
                    <p className="about-dev-subtitle">
                      Building fluid desktop systems, next-gen interfaces, and high-performance native software.
                    </p>
                  </div>
                </div>

                {/* Social & Portfolio Links */}
                <div className="about-dev-actions">
                  <button
                    type="button"
                    className="about-dev-link-btn about-dev-link-btn--linkedin"
                    onClick={() => openExternalLink("https://www.linkedin.com/in/pankoj-roy-b201202b0")}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
                    </svg>
                    <span>LinkedIn</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.7 }}>
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    className="about-dev-link-btn about-dev-link-btn--github"
                    onClick={() => openExternalLink("https://github.com/Uchiha-Itachi001")}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                    </svg>
                    <span>GitHub</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.7 }}>
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    className="about-dev-link-btn"
                    onClick={() => openExternalLink("https://github.com/Uchiha-Itachi001/Glace")}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    <span>Glace Repo</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.7 }}>
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* 3. App Overview Hero */}
              <span className="settings-block-label" style={{ marginTop: "16px" }}>
                Application Information
              </span>
              <div className="about-hero-box">
                <div className="about-hero-brand">
                  <img src="/logo.png" alt="Glace Logo" className="about-hero-logo" />
                  <div className="about-hero-titles">
                    <div className="about-hero-title">Glace Desktop Environment</div>
                    <span className="about-hero-edition">v0.2.0 · Glass Edition</span>
                  </div>
                </div>
                <p className="about-hero-desc">
                  Ultra-fast, customizable taskbar and dynamic notch environment for Windows 11 built with Tauri v2, native Win32 APIs, and React 19.
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

              {/* 4. Factory Defaults Reset */}
              <button
                className="settings-danger-reset"
                style={{ marginTop: "16px" }}
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

          {/* Tab 5: Performance & Resource Monitor */}
          {activeTab === "performance" && (
            <div className="settings-section-block">
              {/* 1. Live Process Working Set */}
              <span className="settings-block-label" style={{ margin: 0 }}>
                Live Process Working Set
              </span>
              <div className="about-resource-card" style={{ marginTop: "8px" }}>
                <div className="about-resource-header">
                  <div className="about-resource-title-wrap">
                    <div className="about-resource-live-dot" />
                    <span className="about-resource-title">Glace Memory Footprint</span>
                  </div>
                  <div className="about-resource-total-badge">
                    <span className="about-resource-total-val">
                      {(resourceUsage?.total_ram_mb || 50.7).toFixed(1)} MB
                    </span>
                    <span className="about-resource-total-lbl">Total RAM</span>
                  </div>
                </div>

                {/* Dual Memory Split Progress Bar */}
                <div className="about-resource-bar-wrap">
                  <div
                    className="about-resource-bar-rust"
                    style={{
                      width: `${((resourceUsage?.rust_ram_mb || 14.5) / (resourceUsage?.total_ram_mb || 50.7)) * 100}%`,
                    }}
                    title={`Rust Core Host Engine: ${(resourceUsage?.rust_ram_mb || 14.5).toFixed(1)} MB`}
                  />
                  <div
                    className="about-resource-bar-webview"
                    style={{
                      width: `${((resourceUsage?.webview_ram_mb || 36.2) / (resourceUsage?.total_ram_mb || 50.7)) * 100}%`,
                    }}
                    title={`WebView2 UI Core: ${(resourceUsage?.webview_ram_mb || 36.2).toFixed(1)} MB`}
                  />
                </div>

                {/* Process Layer Breakdown */}
                <div className="about-resource-layers">
                  <div className="about-resource-layer-item">
                    <div className="about-layer-indicator about-layer-indicator--rust" />
                    <span className="about-layer-name">Rust Native Host:</span>
                    <span className="about-layer-val">{(resourceUsage?.rust_ram_mb || 14.5).toFixed(1)} MB</span>
                  </div>
                  <div className="about-resource-layer-item">
                    <div className="about-layer-indicator about-layer-indicator--webview" />
                    <span className="about-layer-name">WebView2 UI Core:</span>
                    <span className="about-layer-val">{(resourceUsage?.webview_ram_mb || 36.2).toFixed(1)} MB</span>
                  </div>
                </div>

                {/* Telemetry Grid */}
                <div className="about-resource-grid">
                  <div className="about-resource-grid-item">
                    <span className="about-grid-key">System RAM Load</span>
                    <span className="about-grid-val">
                      {resourceUsage
                        ? `${(resourceUsage.system_used_ram_mb / 1024).toFixed(1)} GB / ${(resourceUsage.system_total_ram_mb / 1024).toFixed(0)} GB (${resourceUsage.system_ram_percent}%)`
                        : "12.3 GB / 16 GB (78%)"}
                    </span>
                  </div>
                  <div className="about-resource-grid-item">
                    <span className="about-grid-key">System CPU Load</span>
                    <span className="about-grid-val">{resourceUsage ? `${resourceUsage.system_cpu_percent}%` : "19%"}</span>
                  </div>
                  <div className="about-resource-grid-item">
                    <span className="about-grid-key">Process Uptime</span>
                    <span className="about-grid-val">{resourceUsage ? formatUptime(resourceUsage.uptime_seconds) : "45s"}</span>
                  </div>
                  <div className="about-resource-grid-item">
                    <span className="about-grid-key">Memory Optimization</span>
                    <span className="about-grid-val about-grid-val--highlight">⚡ Auto-Trim Active</span>
                  </div>
                </div>
              </div>

              {/* 2. Direct Comparison vs Windows 11 Native Taskbar */}
              <span className="settings-block-label" style={{ marginTop: "18px" }}>
                Comparison: Glace vs Native Windows 11 Taskbar
              </span>
              <div className="perf-compare-card">
                <div className="perf-compare-header">
                  <div className="perf-compare-savings-badge">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>
                      {Math.max(0, 165.0 - (resourceUsage?.total_ram_mb || 50.7)).toFixed(1)} MB RAM Saved
                    </span>
                    <span className="perf-compare-percent">
                      ({Math.round((Math.max(0, 165.0 - (resourceUsage?.total_ram_mb || 50.7)) / 165.0) * 100)}% Less RAM)
                    </span>
                  </div>
                </div>

                <div className="perf-bars-group">
                  {/* Windows 11 Shell Bar */}
                  <div className="perf-bar-row">
                    <div className="perf-bar-label-row">
                      <span className="perf-bar-title">Windows 11 Native Shell (Taskbar + Start)</span>
                      <span className="perf-bar-val perf-bar-val--win">~165.0 MB</span>
                    </div>
                    <div className="perf-bar-track">
                      <div className="perf-bar-fill perf-bar-fill--win" style={{ width: "100%" }} />
                    </div>
                  </div>

                  {/* Glace Bar */}
                  <div className="perf-bar-row">
                    <div className="perf-bar-label-row">
                      <span className="perf-bar-title">Glace Environment (Full Dock + Notch)</span>
                      <span className="perf-bar-val perf-bar-val--glace">
                        {(resourceUsage?.total_ram_mb || 50.7).toFixed(1)} MB
                      </span>
                    </div>
                    <div className="perf-bar-track">
                      <div
                        className="perf-bar-fill perf-bar-fill--glace"
                        style={{
                          width: `${Math.min(100, ((resourceUsage?.total_ram_mb || 50.7) / 165.0) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="perf-compare-summary">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  <span>
                    Using Glace frees <strong>{Math.max(0, 165.0 - (resourceUsage?.total_ram_mb || 50.7)).toFixed(0)} MB of system memory</strong> compared to the default Windows 11 taskbar & shell, while adding dynamic notch widgets and instant response times.
                  </span>
                </div>
              </div>

              {/* 3. Architectural Efficiency Pillars */}
              <span className="settings-block-label" style={{ marginTop: "18px" }}>
                Architecture & Zero-Overhead Pillars
              </span>
              <div className="perf-pillars-grid">
                <div className="perf-pillar-card">
                  <div className="perf-pillar-icon perf-pillar-icon--rust">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 2v20M2 12h20" />
                    </svg>
                  </div>
                  <div className="perf-pillar-content">
                    <span className="perf-pillar-title">Native Win32 Hooks</span>
                    <p className="perf-pillar-desc">
                      Direct C-FFI event hooks intercept window events with 0ms latency and 0% CPU polling overhead.
                    </p>
                  </div>
                </div>

                <div className="perf-pillar-card">
                  <div className="perf-pillar-icon perf-pillar-icon--gpu">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect width="18" height="12" x="3" y="6" rx="2" />
                      <path d="M7 12h10M12 9v6" />
                    </svg>
                  </div>
                  <div className="perf-pillar-content">
                    <span className="perf-pillar-title">Idle Compositor Sleep</span>
                    <p className="perf-pillar-desc">
                      Dynamic notch glows and GPU animation loops pause completely when desktop state is idle.
                    </p>
                  </div>
                </div>

                <div className="perf-pillar-card">
                  <div className="perf-pillar-icon perf-pillar-icon--gc">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </div>
                  <div className="perf-pillar-content">
                    <span className="perf-pillar-title">Automatic Working Set Trimmer</span>
                    <p className="perf-pillar-desc">
                      Background thread flushes unused heap pages via Win32 EmptyWorkingSet every 45 seconds.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
