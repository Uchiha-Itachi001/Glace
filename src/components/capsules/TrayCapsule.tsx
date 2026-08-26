import React, { useState, useEffect } from "react";
import { TrayIcon, SystemMetrics } from "../../types";
import { tauriBridge } from "../../services/tauriBridge";

export const TrayCapsule: React.FC = () => {
  const [icons, setIcons] = useState<TrayIcon[]>([]);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);

  useEffect(() => {
    tauriBridge.getTrayIcons().then(setIcons).catch(console.error);
    tauriBridge.getSystemMetrics().then(setSystemMetrics).catch(console.error);

    const interval = setInterval(() => {
      tauriBridge.getSystemMetrics().then(setSystemMetrics).catch(console.error);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Directly opens native Windows Settings (Win + I)
    tauriBridge.openWindowsSettings().catch(console.error);
  };

  const handleQuickSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Directly opens native Windows Quick Settings (Win + A)
    tauriBridge.openQuickSettings().catch(console.error);
  };

  return (
    <div className="capsule capsule--compact tray-capsule">
      <div className="tray-list">
        {/* Windows Settings Gear Button */}
        <div
          className="tray-settings-btn icon-hover"
          onClick={handleSettingsClick}
          title="Windows Settings (Win + I)"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </div>

        {/* Chevron Button */}
        <div
          className="tray-chevron-btn icon-hover"
          onClick={handleQuickSettingsClick}
          title="Show hidden icons"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </div>

        {/* Visible Running Notification Tray Icons */}
        {icons.slice(0, 3).map((item) => (
          <div key={item.id} className="tray-item icon-hover" title={item.tooltip}>
            {item.icon_b64 ? (
              <img src={item.icon_b64} alt={item.tooltip} className="tray-icon-img" />
            ) : (
              <div className="tray-icon-fallback" />
            )}
          </div>
        ))}

        {/* Official Windows 11 Quick Settings Indicators (WiFi, Audio, Battery) */}
        <div
          className="tray-system-indicators icon-hover"
          onClick={handleQuickSettingsClick}
          title="Quick Settings / Control Center (Win + A)"
        >
          {/* Windows Wi-Fi Fluent Icon */}
          <div className="indicator-icon" title="Network">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.55a11 11 0 0 1 14.08 0" />
              <path d="M1.42 9a16 16 0 0 1 21.16 0" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <circle cx="12" cy="20" r="1" fill="currentColor" />
            </svg>
          </div>

          {/* Windows Audio Fluent Icon */}
          <div className="indicator-icon" title="Sound Volume">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          </div>

          {/* Windows Battery Fluent Icon */}
          {systemMetrics?.has_battery && (
            <div className="indicator-icon battery-indicator" title={`Battery: ${systemMetrics.battery_percent}%`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect width="16" height="10" x="2" y="7" rx="2" ry="2" />
                <line x1="21" x2="21" y1="10" y2="14" strokeWidth="2" />
              </svg>
              {systemMetrics.is_charging && <span className="battery-bolt">⚡</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
