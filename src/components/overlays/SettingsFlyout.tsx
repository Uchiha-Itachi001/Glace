import React, { useState } from "react";
import { useSettings, THEME_PRESETS } from "../../stores/settingsStore";
import { ThemeId } from "../../types";

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
  { id: "apps", name: "Active Windows", desc: "Running applications with live snap controls" },
  { id: "media", name: "Media Player", desc: "Soundwave visualizer & playback controls" },
  { id: "sysmon", name: "System Monitor", desc: "Live CPU & RAM hardware gauges" },
  { id: "tray", name: "Control Center & Tray", desc: "Quick toggles, sliders, and hidden icons" },
  { id: "clock", name: "Clock & Calendar", desc: "Digital clock with interactive calendar flyout" },
];

export const SettingsFlyout: React.FC<SettingsFlyoutProps> = ({ onClose }) => {
  const { settings, updateSettings, setTheme, toggleWidget } = useSettings();
  const [activeTab, setActiveTab] = useState<"appearance" | "widgets" | "layout" | "about">("appearance");

  return (
    <div className="settings-flyout flyout-enter" onClick={(e) => e.stopPropagation()}>
      {/* Settings Header */}
      <div className="settings-header">
        <div className="settings-title-group">
          <span className="settings-icon">⚙️</span>
          <div>
            <h3 className="settings-title">Glace Customizer</h3>
            <span className="settings-subtitle">Desktop Environment Settings</span>
          </div>
        </div>
        <button className="calendar-close-btn icon-hover" onClick={onClose}>
          ✕
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="settings-tabs">
        <button
          className={`settings-tab-btn ${activeTab === "appearance" ? "settings-tab-btn--active" : ""}`}
          onClick={() => setActiveTab("appearance")}
        >
          🎨 Appearance
        </button>
        <button
          className={`settings-tab-btn ${activeTab === "widgets" ? "settings-tab-btn--active" : ""}`}
          onClick={() => setActiveTab("widgets")}
        >
          🧩 Widgets
        </button>
        <button
          className={`settings-tab-btn ${activeTab === "layout" ? "settings-tab-btn--active" : ""}`}
          onClick={() => setActiveTab("layout")}
        >
          📐 Layout
        </button>
        <button
          className={`settings-tab-btn ${activeTab === "about" ? "settings-tab-btn--active" : ""}`}
          onClick={() => setActiveTab("about")}
        >
          ℹ️ About
        </button>
      </div>

      <div className="calendar-divider" />

      {/* Tab 1: Appearance & Theming */}
      {activeTab === "appearance" && (
        <div className="settings-tab-content">
          <div className="settings-section-title">Theme Presets</div>
          <div className="theme-cards-grid">
            {THEME_PRESETS.map((preset) => {
              const isActive = settings.theme_id === preset.id;
              return (
                <div
                  key={preset.id}
                  className={`theme-card ${isActive ? "theme-card--active" : ""}`}
                  onClick={() => setTheme(preset.id as ThemeId)}
                >
                  <div
                    className="theme-card-preview"
                    style={{ background: preset.previewGradient }}
                  >
                    <div
                      className="theme-card-dot"
                      style={{ background: preset.accent }}
                    />
                  </div>
                  <div className="theme-card-info">
                    <span className="theme-card-name">{preset.name}</span>
                    <span className="theme-card-desc">{preset.description}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="calendar-divider" />

          {/* Accent Color Customization */}
          <div className="settings-section-title">Custom Accent Color</div>
          <div className="accent-color-picker">
            <div className="accent-swatches">
              {ACCENT_PRESETS.map((color) => (
                <button
                  key={color}
                  className={`accent-swatch-dot ${
                    settings.accent_color === color ? "accent-swatch-dot--selected" : ""
                  }`}
                  style={{ background: color }}
                  onClick={() => updateSettings({ accent_color: color })}
                  title={color}
                />
              ))}
            </div>
            <input
              type="color"
              value={settings.accent_color}
              onChange={(e) => updateSettings({ accent_color: e.target.value })}
              className="accent-native-input"
              title="Custom hex color"
            />
          </div>

          <div className="calendar-divider" />

          {/* Corner Radius & Blur Sliders */}
          <div className="settings-slider-row">
            <div className="settings-slider-header">
              <span>Capsule Corner Radius</span>
              <span className="settings-slider-val">{settings.corner_radius}px</span>
            </div>
            <input
              type="range"
              min="8"
              max="32"
              value={settings.corner_radius}
              onChange={(e) => updateSettings({ corner_radius: Number(e.target.value) })}
              className="qs-slider"
            />
          </div>

          <div className="settings-slider-row">
            <div className="settings-slider-header">
              <span>Glass Blur Intensity</span>
              <span className="settings-slider-val">{settings.blur_intensity.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={settings.blur_intensity}
              onChange={(e) => updateSettings({ blur_intensity: Number(e.target.value) })}
              className="qs-slider"
            />
          </div>
        </div>
      )}

      {/* Tab 2: Widgets Management */}
      {activeTab === "widgets" && (
        <div className="settings-tab-content">
          <div className="settings-section-title">Taskbar Modules & Widgets</div>
          <div className="widget-toggle-list">
            {WIDGET_OPTIONS.map((w) => {
              const isEnabled = settings.enabled_widgets.includes(w.id);
              return (
                <div key={w.id} className="widget-toggle-item icon-hover" onClick={() => toggleWidget(w.id)}>
                  <div className="widget-toggle-info">
                    <span className="widget-toggle-name">{w.name}</span>
                    <span className="widget-toggle-desc">{w.desc}</span>
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

      {/* Tab 3: Layout & Geometry */}
      {activeTab === "layout" && (
        <div className="settings-tab-content">
          <div className="settings-section-title">Taskbar Bar Position</div>
          <div className="layout-modes-grid">
            {(["bottom", "top", "floating"] as const).map((pos) => {
              const isActive = settings.bar_position === pos;
              return (
                <button
                  key={pos}
                  className={`layout-mode-btn ${isActive ? "layout-mode-btn--active" : ""}`}
                  onClick={() => updateSettings({ bar_position: pos })}
                >
                  <span className="layout-mode-name">
                    {pos === "bottom" ? "Pinned Bottom" : pos === "top" ? "Pinned Top" : "Floating Island"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 4: About & System */}
      {activeTab === "about" && (
        <div className="settings-tab-content">
          <div className="about-card">
            <div className="about-badge">Glace Desktop Environment</div>
            <p className="about-text">
              A high-performance custom desktop environment and taskbar for Windows inspired by Seelen-UI.
            </p>
            <div className="about-meta">
              <span>Architecture: Tauri v2 + Win32 + React 19</span>
              <span>Theming: CSS Variable Engine (6 Presets)</span>
              <span>Version: 0.2.0 (Seelen-UI Suite)</span>
            </div>
          </div>

          <div className="calendar-divider" />

          <button
            className="settings-reset-btn icon-hover"
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
            ↺ Reset All to Defaults
          </button>
        </div>
      )}
    </div>
  );
};
