import "./styles/tokens.css";
import "./styles/themes.css";
import "./styles/capsule.css";
import "./styles/animations.css";
import "./styles/island.css";

import { useSettings } from "./stores/settingsStore";
import { useFlyout } from "./stores/flyoutStore";

import { DynamicIsland } from "./components/island/DynamicIsland";
import { StartCapsule } from "./components/capsules/StartCapsule";
import { AppsCapsule } from "./components/capsules/AppsCapsule";
import { MediaCapsule } from "./components/capsules/MediaCapsule";
import { SysMonCapsule } from "./components/capsules/SysMonCapsule";
import { TrayCapsule } from "./components/capsules/TrayCapsule";
import { ClockCapsule } from "./components/capsules/ClockCapsule";

import { SettingsFlyout } from "./components/overlays/SettingsFlyout";
import { CalendarFlyout } from "./components/overlays/CalendarFlyout";
import { StartLauncherFlyout } from "./components/overlays/StartLauncherFlyout";

export default function App() {
  const { settings } = useSettings();
  const { activeFlyout, closeFlyout } = useFlyout();

  const enabled_widgets = settings?.enabled_widgets || ["start", "apps", "sysmon", "tray", "clock"];
  const bar_position = settings?.bar_position || "bottom";
  const bar_alignment = settings?.bar_alignment || "center";
  const isEnabled = (id: string) => enabled_widgets.includes(id);

  // At a time only one media section is active (Notch by default, or Taskbar when chosen)
  const isTaskbarMediaActive = (settings?.media_location ?? "notch") === "taskbar";

  // Single connected cluster holding Windows Start, Media (when in dock), and Apps
  const renderAppsCluster = () => (
    <div className="taskbar-apps-cluster" id="taskbar-apps-cluster">
      {isEnabled("start") && <StartCapsule />}
      {isTaskbarMediaActive && <MediaCapsule />}
      {isEnabled("apps") && <AppsCapsule />}
    </div>
  );

  // Status cluster holding System Monitor, System Tray, and Clock
  const renderStatusCluster = () => (
    <div className="taskbar-status-cluster" id="taskbar-status-cluster">
      {isEnabled("sysmon") && <SysMonCapsule />}
      {isEnabled("tray") && <TrayCapsule />}
      {isEnabled("clock") && <ClockCapsule />}
    </div>
  );

  return (
    <div id="glace-app-root">
      {/* Top Notch Dynamic Island */}
      <DynamicIsland />

      {/* Invisible Flyout Backdrop to dismiss panels when clicking outside */}
      {activeFlyout !== null && (
        <div className="flyout-backdrop" onClick={closeFlyout} />
      )}

      {/* Flyout Panels */}
      {activeFlyout === "settings" && <SettingsFlyout onClose={closeFlyout} />}
      {activeFlyout === "calendar" && <CalendarFlyout onClose={closeFlyout} />}
      {activeFlyout === "start" && <StartLauncherFlyout onClose={closeFlyout} />}

      {/* Taskbar Bar */}
      <main
        id="taskbar-bar"
        className={`bar-pos--${bar_position || "bottom"} bar-align--${bar_alignment || "center"}`}
      >
        {/* Left Section: Apps (in left align) OR Status (in right align) */}
        <div className="taskbar-left taskbar-section taskbar-section--left">
          {bar_alignment === "left" && renderAppsCluster()}
          {bar_alignment === "right" && renderStatusCluster()}
        </div>

        {/* Center Section: Apps (in center align) */}
        <div className="taskbar-center taskbar-section taskbar-section--center">
          {bar_alignment === "center" && renderAppsCluster()}
        </div>

        {/* Right Section: Status (in left/center align) OR Apps (in right align) */}
        <div className="taskbar-right taskbar-section taskbar-section--right">
          {(bar_alignment === "left" || bar_alignment === "center") && renderStatusCluster()}
          {bar_alignment === "right" && renderAppsCluster()}
        </div>
      </main>
    </div>
  );
}
