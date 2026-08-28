import React from "react";
import { tauriBridge } from "../../services/tauriBridge";
import { useFlyout } from "../../stores/flyoutStore";
import { useSettings, DEFAULT_TRAY_ITEMS } from "../../stores/settingsStore";
import { useSystemMetrics } from "../../hooks/useSystemMetrics";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";
import { WifiIcon } from "../common/WifiIcon";

export const TrayCapsule: React.FC = () => {
  const { activeFlyout, toggleFlyout } = useFlyout();
  const { settings } = useSettings();
  const { networkState } = useNetworkStatus();

  const trayItems = settings?.tray_items || DEFAULT_TRAY_ITEMS;
  const isItemVisible = (id: string) => trayItems.includes(id);

  // Subscribe to shared metrics pool only if quick_settings indicator is visible
  const systemMetrics = useSystemMetrics(isItemVisible("quick_settings"));


  const handleSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFlyout("settings", 520);
  };

  const handleSettingsContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    tauriBridge.openWindowsSettings().catch(console.error);
  };

  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    tauriBridge.openTrayOverflow().catch(console.error);
  };

  const handleKeyboardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    tauriBridge.openTouchKeyboard().catch(console.error);
  };

  const handleWidgetsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    tauriBridge.openWidgetsPanel().catch(console.error);
  };

  const handleLanguageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    tauriBridge.toggleInputLanguage().catch(console.error);
  };

  const handleQuickSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    tauriBridge.openQuickSettings().catch(console.error);
  };

  const batteryPercent = systemMetrics?.battery_percent ?? 100;
  const isCharging = systemMetrics?.is_charging ?? false;
  const hasBattery = systemMetrics?.has_battery ?? true;

  const batteryColor =
    batteryPercent <= 15
      ? "#ef4444"
      : batteryPercent <= 25
      ? "#f59e0b"
      : "#22c55e";

  const fillWidth = Math.max(2, Math.min(15, (batteryPercent / 100) * 15));

  const wifiTitle =
    networkState === "connected"
      ? "Internet Access: Connected"
      : networkState === "connecting"
      ? "Wi-Fi: Connecting..."
      : "No Internet Access: Disconnected";

  return (
    <div className="capsule capsule--compact tray-capsule">
      <div className="tray-list">
        {/* Glace App Settings Gear Button */}
        {isItemVisible("gear") && (
          <div
            className={`tray-settings-btn icon-hover ${activeFlyout === "settings" ? "tray-settings-btn--active" : ""}`}
            onClick={handleSettingsClick}
            onContextMenu={handleSettingsContextMenu}
            title="Glace Settings (Right-click: Windows Settings)"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
        )}

        {/* Windows 11 Tray Overflow Chevron Button */}
        {isItemVisible("overflow") && (
          <div
            className="tray-chevron-btn icon-hover"
            onClick={handleChevronClick}
            title="Show hidden icons (Win + B)"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </div>
        )}

        {/* Windows 11 Touch Keyboard Button */}
        {isItemVisible("touch_keyboard") && (
          <div
            className="tray-tool-btn icon-hover"
            onClick={handleKeyboardClick}
            title="Touch Keyboard"
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
              <rect x="2" y="4" width="20" height="16" rx="2.5" />
              <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M18 12h.01M8 16h8" />
            </svg>
          </div>
        )}

        {/* Windows 11 Widgets Panel Button */}
        {isItemVisible("widgets") && (
          <div
            className="tray-tool-btn icon-hover"
            onClick={handleWidgetsClick}
            title="Widgets (Win + W)"
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
              <rect x="3" y="3" width="7" height="9" rx="1.5" />
              <rect x="14" y="3" width="7" height="5" rx="1.5" />
              <rect x="14" y="12" width="7" height="9" rx="1.5" />
              <rect x="3" y="16" width="7" height="5" rx="1.5" />
            </svg>
          </div>
        )}

        {/* Windows 11 Active Input Language Badge */}
        {isItemVisible("language") && (
          <div
            className="tray-lang-pill icon-hover"
            onClick={handleLanguageClick}
            title="Keyboard Language: Click or Win+Space to switch"
          >
            <span className="tray-lang-top">ENG</span>
            <span className="tray-lang-bot">IN</span>
          </div>
        )}

        {/* Windows 11 Unified Quick Settings Indicators Pill (WiFi, Volume, Battery) */}
        {isItemVisible("quick_settings") && (
          <div
            className="tray-system-indicators icon-hover"
            onClick={handleQuickSettingsClick}
            title={`Network, Sound, Battery (${batteryPercent}%${isCharging ? ", Charging" : ""}) - Click for Control Center`}
          >
            {/* Windows 11 Fluent Dynamic Wi-Fi (Connected / Connecting / Disconnected) */}
            <div className="fluent-indicator-icon" title={wifiTitle}>
              <WifiIcon state={networkState} size={15} />
            </div>

            {/* Windows 11 Fluent Volume */}
            <div className="fluent-indicator-icon" title="Speakers: 75%">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            </div>

            {/* Windows 11 Fluent Battery */}
            {hasBattery && (
              <div className="fluent-battery-wrapper" title={`Battery status: ${batteryPercent}% available${isCharging ? " (plugged in)" : ""}`}>
                <svg width="22" height="12" viewBox="0 0 22 12" className="fluent-battery-svg">
                  {/* Outer Rounded Shell */}
                  <rect x="0.6" y="0.6" width="18" height="10.8" rx="3" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  {/* Positive Terminal Nub */}
                  <path d="M 19.4 4 C 20.2 4 20.8 4.6 20.8 5.4 L 20.8 6.6 C 20.8 7.4 20.2 8 19.4 8 Z" fill="currentColor" />
                  {/* Filled Level Bar */}
                  <rect
                    x="2.2"
                    y="2.2"
                    width={fillWidth}
                    height="7.6"
                    rx="1.8"
                    fill={batteryColor}
                  />
                  {/* Centered Charging Lightning Bolt */}
                  {isCharging && (
                    <path
                      d="M 10.5 1.5 L 6.8 6.5 L 10 6.5 L 9 10.5 L 13.2 5.5 L 10 5.5 Z"
                      fill="#ffffff"
                      stroke="#000000"
                      strokeWidth="0.4"
                    />
                  )}
                </svg>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
