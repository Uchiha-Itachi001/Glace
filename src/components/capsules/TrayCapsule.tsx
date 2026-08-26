import React, { useState, useEffect } from "react";
import { TrayIcon, SystemMetrics } from "../../types";
import { tauriBridge } from "../../services/tauriBridge";
import { useFlyout } from "../../stores/flyoutStore";

export const TrayCapsule: React.FC = () => {
  const [icons, setIcons] = useState<TrayIcon[]>([]);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const { activeFlyout, toggleFlyout } = useFlyout();

  useEffect(() => {
    tauriBridge.getTrayIcons().then(setIcons).catch(console.error);
    tauriBridge.getSystemMetrics().then(setSystemMetrics).catch(console.error);

    const interval = setInterval(() => {
      tauriBridge.getSystemMetrics().then(setSystemMetrics).catch(console.error);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="capsule capsule--compact tray-capsule">
      <div className="tray-list">
        {/* Settings Button */}
        <div
          className={`tray-settings-btn icon-hover ${
            activeFlyout === "settings" ? "tray-settings-btn--active" : ""
          }`}
          onClick={(e) => {
            e.stopPropagation();
            toggleFlyout("settings", 600);
          }}
          title="Glace Settings & Customizer"
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

        {/* Chevron Button for Tray Overflow */}
        <div
          className={`tray-chevron-btn icon-hover ${
            activeFlyout === "overflow" ? "tray-chevron-btn--active" : ""
          }`}
          onClick={(e) => {
            e.stopPropagation();
            toggleFlyout("overflow", 350);
          }}
          title="Hidden icons"
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

        {/* Visible Tray Icons */}
        {icons.slice(0, 3).map((item) => (
          <div key={item.id} className="tray-item icon-hover" title={item.tooltip}>
            {item.icon_b64 ? (
              <img src={item.icon_b64} alt={item.tooltip} className="tray-icon-img" />
            ) : (
              <div className="tray-icon-fallback" />
            )}
          </div>
        ))}

        {/* Interactive Quick Settings Button (Indicators) */}
        <div
          className={`tray-system-indicators icon-hover ${
            activeFlyout === "quick-settings" ? "tray-system-indicators--active" : ""
          }`}
          onClick={(e) => {
            e.stopPropagation();
            toggleFlyout("quick-settings", 480);
          }}
          title="Control Center (Sound, Network, Battery)"
        >
          <div className="indicator-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12.55a11 11 0 0 1 14.08 0" />
              <path d="M1.42 9a16 16 0 0 1 21.16 0" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
          </div>
          <div className="indicator-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          </div>
          {systemMetrics?.has_battery && (
            <div className="indicator-icon battery-indicator" title={`${systemMetrics.battery_percent}%`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect width="16" height="10" x="2" y="7" rx="2" ry="2" />
                <line x1="22" x2="22" y1="11" y2="13" />
              </svg>
              {systemMetrics.is_charging && <span className="battery-bolt">⚡</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
