import React, { useState, useEffect } from "react";
import { useSettings, THEME_PRESETS } from "../../stores/settingsStore";
import { ThemeId, PinnedApp } from "../../types";
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
  { id: "start", name: "Start Launcher", desc: "Keyboard launcher & quick apps search" },
  { id: "apps", name: "Taskbar Dock Apps", desc: "Pinned & active applications with live snap controls" },
  { id: "media", name: "Media Player", desc: "Soundwave visualizer & playback controls" },
  { id: "sysmon", name: "System Monitor", desc: "Live CPU & RAM hardware gauges" },
  { id: "tray", name: "System Tray", desc: "Settings toggle and notification icons" },
  { id: "clock", name: "Clock & Calendar", desc: "Digital clock with interactive calendar" },
];

export const SettingsFlyout: React.FC<SettingsFlyoutProps> = ({ onClose }) => {
  const { settings, updateSettings, setTheme, toggleWidget } = useSettings();
  const [activeTab, setActiveTab] = useState<"appearance" | "widgets" | "pinned" | "layout" | "about">("appearance");
  const [pinnedApps, setPinnedApps] = useState<PinnedApp[]>([]);
  const [newAppName, setNewAppName] = useState("");
  const [newAppCmd, setNewAppCmd] = useState("");

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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <div className="settings-brand-info">
            <span className="settings-brand-name">Glace</span>
            <span className="settings-brand-badge">v0.2</span>
          </div>
        </div>

        <nav className="settings-nav">
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

          <button
            className={`settings-nav-item ${activeTab === "widgets" ? "settings-nav-item--active" : ""}`}
            onClick={() => setActiveTab("widgets")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect width="7" height="7" x="3" y="3" rx="1" />
              <rect width="7" height="7" x="14" y="3" rx="1" />
              <rect width="7" height="7" x="14" y="14" rx="1" />
              <rect width="7" height="7" x="3" y="14" rx="1" />
            </svg>
            <span>Modules</span>
          </button>

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

          <button
            className={`settings-nav-item ${activeTab === "layout" ? "settings-nav-item--active" : ""}`}
            onClick={() => setActiveTab("layout")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M3 15h18" />
            </svg>
            <span>Layout</span>
          </button>

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
            {activeTab === "widgets" && "Taskbar Modules & Widgets"}
            {activeTab === "pinned" && "Taskbar Pinned Applications"}
            {activeTab === "layout" && "Position & Behavior"}
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
                  const isActive = settings.theme_id === preset.id;
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
                      <div className="theme-pill-text">
                        <span className="theme-pill-name">{preset.name}</span>
                        <span className="theme-pill-desc">{preset.description}</span>
                      </div>
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
                        settings.accent_color === color ? "accent-dot-btn--active" : ""
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
                    value={settings.accent_color}
                    onChange={(e) => updateSettings({ accent_color: e.target.value })}
                    className="accent-hex-input"
                  />
                  <span className="accent-hex-label">{settings.accent_color}</span>
                </div>
              </div>

              <span className="settings-block-label">Glass Geometry & Refraction</span>
              <div className="settings-sliders-box">
                <div className="slider-control-group">
                  <div className="slider-label-row">
                    <span>Corner Radius</span>
                    <span className="slider-value-pill">{settings.corner_radius}px</span>
                  </div>
                  <input
                    type="range"
                    min="8"
                    max="32"
                    value={settings.corner_radius}
                    onChange={(e) => updateSettings({ corner_radius: Number(e.target.value) })}
                    className="styled-slider"
                  />
                </div>

                <div className="slider-control-group">
                  <div className="slider-label-row">
                    <span>Glass Blur Intensity</span>
                    <span className="slider-value-pill">{settings.blur_intensity.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={settings.blur_intensity}
                    onChange={(e) => updateSettings({ blur_intensity: Number(e.target.value) })}
                    className="styled-slider"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Widgets */}
          {activeTab === "widgets" && (
            <div className="settings-section-block">
              <span className="settings-block-label">Taskbar Capsules</span>
              <div className="widget-items-stack">
                {WIDGET_OPTIONS.map((w) => {
                  const isEnabled = settings.enabled_widgets.includes(w.id);
                  return (
                    <div
                      key={w.id}
                      className="widget-row-card icon-hover"
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
            </div>
          )}

          {/* Tab 3: Pinned Apps */}
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
                <button type="submit" className="pinned-submit-btn icon-hover">
                  + Pin to Dock
                </button>
              </form>

              <div className="pinned-header-row">
                <span className="settings-block-label">Current Pinned Apps ({pinnedApps.length})</span>
              </div>

              <div className="pinned-items-list">
                {pinnedApps.map((app) => (
                  <div key={app.id} className="pinned-card-item icon-hover">
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
                      className="pinned-card-unpin icon-hover"
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

          {/* Tab 4: Layout & Behavior */}
          {activeTab === "layout" && (
            <div className="settings-section-block">
              <span className="settings-block-label">Dock Positioning</span>
              <div className="layout-choice-grid">
                {(["bottom", "top", "floating"] as const).map((pos) => {
                  const isActive = settings.bar_position === pos;
                  return (
                    <button
                      key={pos}
                      className={`layout-choice-btn ${isActive ? "layout-choice-btn--active" : ""}`}
                      onClick={() => updateSettings({ bar_position: pos })}
                    >
                      <span className="layout-choice-title">
                        {pos === "bottom" ? "Pinned Bottom" : pos === "top" ? "Pinned Top" : "Floating Island"}
                      </span>
                      <span className="layout-choice-sub">
                        {pos === "bottom" ? "Windows 11 standard" : pos === "top" ? "macOS menu bar style" : "Elevated dock"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <span className="settings-block-label">System Behavior</span>
              <div
                className="widget-row-card icon-hover"
                onClick={() => updateSettings({ autostart: !settings.autostart })}
              >
                <div className="widget-row-meta">
                  <span className="widget-row-name">Launch on Windows Startup</span>
                  <span className="widget-row-desc">Automatically initialize Glace upon user login</span>
                </div>
                <div className={`switch-pill ${settings.autostart ? "switch-pill--on" : ""}`}>
                  <div className="switch-thumb" />
                </div>
              </div>
            </div>
          )}

          {/* Tab 5: About */}
          {activeTab === "about" && (
            <div className="settings-section-block">
              <div className="about-hero-box">
                <div className="about-hero-title">Glace Desktop Environment</div>
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
                className="settings-danger-reset icon-hover"
                onClick={() =>
                  updateSettings({
                    theme_id: "obsidian",
                    accent_color: "#10b981",
                    blur_intensity: 1.0,
                    corner_radius: 20,
                    bar_position: "bottom",
                    enabled_widgets: ["start", "apps", "media", "sysmon", "tray", "clock"],
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
