import React, { useState } from "react";
import { SystemMetrics } from "../../types";

interface QuickSettingsFlyoutProps {
  systemStatus: SystemMetrics | null;
  onClose: () => void;
}

export const QuickSettingsFlyout: React.FC<QuickSettingsFlyoutProps> = ({
  systemStatus,
  onClose,
}) => {
  const [volume, setVolume] = useState<number>(75);
  const [brightness, setBrightness] = useState<number>(85);
  const [wifiEnabled, setWifiEnabled] = useState<boolean>(true);
  const [bluetoothEnabled, setBluetoothEnabled] = useState<boolean>(true);
  const [dndEnabled, setDndEnabled] = useState<boolean>(false);
  const [nightLight, setNightLight] = useState<boolean>(false);

  return (
    <div className="quick-settings-flyout flyout-enter" onClick={(e) => e.stopPropagation()}>
      <div className="qs-header">
        <span className="qs-title">Control Center</span>
        <button className="calendar-close-btn icon-hover" onClick={onClose}>
          ✕
        </button>
      </div>

      {/* Quick Toggle Tiles */}
      <div className="qs-tiles-grid">
        <div
          className={`qs-tile ${wifiEnabled ? "qs-tile--active" : ""}`}
          onClick={() => setWifiEnabled(!wifiEnabled)}
        >
          <div className="qs-tile-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12.55a11 11 0 0 1 14.08 0" />
              <path d="M1.42 9a16 16 0 0 1 21.16 0" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
          </div>
          <div className="qs-tile-labels">
            <span className="qs-tile-name">Wi-Fi</span>
            <span className="qs-tile-sub">{wifiEnabled ? "Connected" : "Off"}</span>
          </div>
        </div>

        <div
          className={`qs-tile ${bluetoothEnabled ? "qs-tile--active" : ""}`}
          onClick={() => setBluetoothEnabled(!bluetoothEnabled)}
        >
          <div className="qs-tile-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m7 7 10 10-5 5V2l5 5L7 17" />
            </svg>
          </div>
          <div className="qs-tile-labels">
            <span className="qs-tile-name">Bluetooth</span>
            <span className="qs-tile-sub">{bluetoothEnabled ? "On" : "Off"}</span>
          </div>
        </div>

        <div
          className={`qs-tile ${dndEnabled ? "qs-tile--active" : ""}`}
          onClick={() => setDndEnabled(!dndEnabled)}
        >
          <div className="qs-tile-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            </svg>
          </div>
          <div className="qs-tile-labels">
            <span className="qs-tile-name">Focus</span>
            <span className="qs-tile-sub">{dndEnabled ? "Do Not Disturb" : "Off"}</span>
          </div>
        </div>

        <div
          className={`qs-tile ${nightLight ? "qs-tile--active" : ""}`}
          onClick={() => setNightLight(!nightLight)}
        >
          <div className="qs-tile-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
            </svg>
          </div>
          <div className="qs-tile-labels">
            <span className="qs-tile-name">Night Light</span>
            <span className="qs-tile-sub">{nightLight ? "Warm" : "Off"}</span>
          </div>
        </div>
      </div>

      {/* Hardware Status Strip */}
      {systemStatus && (
        <div className="qs-hardware-strip">
          <div className="qs-hardware-pill">
            <span>RAM</span>
            <strong>{systemStatus.ram_percent}%</strong>
          </div>
          <div className="qs-hardware-pill">
            <span>CPU</span>
            <strong>{systemStatus.cpu_percent}%</strong>
          </div>
          {systemStatus.has_battery && (
            <div className="qs-hardware-pill">
              <span>Battery</span>
              <strong>
                {systemStatus.battery_percent}% {systemStatus.is_charging ? "⚡" : ""}
              </strong>
            </div>
          )}
        </div>
      )}

      <div className="calendar-divider" />

      {/* Volume Slider */}
      <div className="qs-slider-group">
        <div className="qs-slider-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            {volume > 0 && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}
            {volume > 50 && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />}
          </svg>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="qs-slider"
        />
        <span className="qs-slider-val">{volume}%</span>
      </div>

      {/* Brightness Slider */}
      <div className="qs-slider-group">
        <div className="qs-slider-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          </svg>
        </div>
        <input
          type="range"
          min="10"
          max="100"
          value={brightness}
          onChange={(e) => setBrightness(Number(e.target.value))}
          className="qs-slider"
        />
        <span className="qs-slider-val">{brightness}%</span>
      </div>
    </div>
  );
};
