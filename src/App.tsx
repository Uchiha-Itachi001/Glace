import { useEffect, useState } from "react";
import "./styles/tokens.css";
import "./styles/themes.css";
import "./styles/capsule.css";
import "./styles/animations.css";

import { useSettings } from "./stores/settingsStore";
import { useFlyout } from "./stores/flyoutStore";
import { StartCapsule } from "./components/capsules/StartCapsule";
import { AppsCapsule } from "./components/capsules/AppsCapsule";
import { MediaCapsule } from "./components/capsules/MediaCapsule";
import { SysMonCapsule } from "./components/capsules/SysMonCapsule";
import { TrayCapsule } from "./components/capsules/TrayCapsule";
import { ClockCapsule } from "./components/capsules/ClockCapsule";
import { StartLauncherFlyout } from "./components/overlays/StartLauncherFlyout";
import { SettingsFlyout } from "./components/overlays/SettingsFlyout";
import { QuickSettingsFlyout } from "./components/overlays/QuickSettingsFlyout";
import { CalendarFlyout } from "./components/overlays/CalendarFlyout";
import { tauriBridge } from "./services/tauriBridge";
import { TrayIcon, SystemMetrics } from "./types";

export default function App() {
  const { settings } = useSettings();
  const { enabled_widgets, bar_position } = settings;
  const { activeFlyout, closeFlyout } = useFlyout();
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [icons, setIcons] = useState<TrayIcon[]>([]);

  const isEnabled = (id: string) => enabled_widgets.includes(id);

  useEffect(() => {
    tauriBridge.getSystemMetrics().then(setSystemMetrics).catch(console.error);
    tauriBridge.getTrayIcons().then(setIcons).catch(console.error);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeFlyout();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeFlyout]);

  return (
    <div id="glace-app-root">
      {/* Click-through backdrop to close active flyout */}
      {activeFlyout !== null && (
        <div className="flyout-backdrop" onClick={closeFlyout} />
      )}

      {/* Flyout Overlays (Anchored above the bar) */}
      {activeFlyout === "start" && (
        <StartLauncherFlyout onClose={closeFlyout} />
      )}
      {activeFlyout === "settings" && (
        <SettingsFlyout onClose={closeFlyout} />
      )}
      {activeFlyout === "quick-settings" && (
        <QuickSettingsFlyout
          systemStatus={systemMetrics}
          onClose={closeFlyout}
        />
      )}
      {activeFlyout === "calendar" && (
        <CalendarFlyout onClose={closeFlyout} />
      )}
      {activeFlyout === "overflow" && (
        <div className="tray-overflow-flyout flyout-enter" onClick={(e) => e.stopPropagation()}>
          <div className="tray-overflow-header">
            <span>Hidden Icons</span>
          </div>
          <div className="tray-overflow-grid">
            {icons.length > 0 ? (
              icons.map((item) => (
                <div key={item.id} className="tray-item icon-hover" title={item.tooltip}>
                  {item.icon_b64 ? (
                    <img src={item.icon_b64} alt={item.tooltip} className="tray-icon-img" />
                  ) : (
                    <div className="tray-icon-fallback" />
                  )}
                </div>
              ))
            ) : (
              <span className="tray-empty-text">No hidden icons</span>
            )}
          </div>
        </div>
      )}

      {/* Taskbar Bar */}
      <main id="taskbar-bar" className={`bar-pos--${bar_position || "bottom"}`}>
        {/* Left Section: Start & Media */}
        <div className="taskbar-left taskbar-section taskbar-section--left">
          {isEnabled("start") && <StartCapsule />}
          {isEnabled("media") && <MediaCapsule />}
        </div>

        {/* Center Section: Running Applications */}
        <div className="taskbar-center taskbar-section taskbar-section--center">
          {isEnabled("apps") && <AppsCapsule />}
        </div>

        {/* Right Section: Hardware Monitor, Control Center & Clock */}
        <div className="taskbar-right taskbar-section taskbar-section--right">
          {isEnabled("sysmon") && <SysMonCapsule />}
          {isEnabled("tray") && <TrayCapsule />}
          {isEnabled("clock") && <ClockCapsule />}
        </div>
      </main>
    </div>
  );
}
