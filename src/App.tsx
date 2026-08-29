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
import { tauriBridge } from "./services/tauriBridge";

export default function App() {
  const { settings } = useSettings();
  const { activeFlyout, closeFlyout } = useFlyout();

  const enabled_widgets = settings?.enabled_widgets || ["start", "apps", "sysmon", "tray", "clock"];
  const bar_position = settings?.bar_position || "bottom";
  const isMacStyle = bar_position === "macos" || bar_position === "top";
  const bar_alignment = settings?.bar_alignment || "center";
  const isEnabled = (id: string) => enabled_widgets.includes(id);

  // At a time only one media section is active (Notch by default, or Taskbar when chosen)
  const isTaskbarMediaActive = (settings?.media_location ?? "notch") === "taskbar";

  // Single connected cluster holding Windows Start, Media (when in dock), and Apps
  const renderAppsCluster = (isRightAlign = false) => (
    <div className="taskbar-apps-cluster" id="taskbar-apps-cluster">
      {isRightAlign ? (
        <>
          {isEnabled("apps") && <AppsCapsule />}
          {isTaskbarMediaActive && <MediaCapsule />}
          {isEnabled("start") && <StartCapsule />}
        </>
      ) : (
        <>
          {isEnabled("start") && <StartCapsule />}
          {isTaskbarMediaActive && <MediaCapsule />}
          {isEnabled("apps") && <AppsCapsule />}
        </>
      )}
    </div>
  );

  // Status cluster:
  // - In left/center mode: Tray -> Clock (Clock rightmost)
  // - In right align mode: Clock (leftmost) -> Tray -> SysMon
  const renderStatusCluster = (alignment: "left" | "center" | "right") => (
    <div className="taskbar-status-cluster" id="taskbar-status-cluster">
      {alignment === "right" ? (
        <>
          {isEnabled("clock") && <ClockCapsule />}
          {isEnabled("tray") && <TrayCapsule />}
          {isEnabled("sysmon") && <SysMonCapsule />}
        </>
      ) : alignment === "left" ? (
        <>
          {isEnabled("sysmon") && <SysMonCapsule />}
          {isEnabled("tray") && <TrayCapsule />}
          {isEnabled("clock") && <ClockCapsule />}
        </>
      ) : (
        <>
          {isEnabled("tray") && <TrayCapsule />}
          {isEnabled("clock") && <ClockCapsule />}
        </>
      )}
    </div>
  );

  return (
    <div id="glace-app-root" className={isMacStyle ? "glace-layout--macos" : "glace-layout--windows"}>
      {/* macOS Top Menu & Status Bar (rendered in macOS mode) */}
      {isMacStyle ? (
        <header id="glace-top-bar" className="macos-top-bar">
          <div className="macos-top-bar-left">
            <button
              type="button"
              className="macos-apple-logo-btn"
              onClick={() => tauriBridge.openStartMenu().catch(console.error)}
              title="Start Menu (Win)"
            >
              <img src="/logo.png" alt="Glace" className="macos-brand-icon" />
            </button>
            <span className="macos-brand-title">Glace</span>
            {isEnabled("sysmon") && <SysMonCapsule />}
          </div>

          <div className="macos-top-bar-center">
            {/* Top Notch Dynamic Island */}
            <DynamicIsland />
          </div>

          <div className="macos-top-bar-right">
            {isEnabled("tray") && <TrayCapsule />}
            {isEnabled("clock") && <ClockCapsule />}
          </div>
        </header>
      ) : (
        /* Windows Mode: Top Notch Dynamic Island */
        <DynamicIsland />
      )}

      {/* Invisible Flyout Backdrop to dismiss panels when clicking outside */}
      {activeFlyout !== null && (
        <div className="flyout-backdrop" onClick={closeFlyout} />
      )}

      {/* Flyout Panels */}
      {activeFlyout === "settings" && <SettingsFlyout onClose={closeFlyout} />}
      {activeFlyout === "calendar" && <CalendarFlyout onClose={closeFlyout} />}

      {/* Bottom Taskbar / macOS Dock */}
      <main
        id="taskbar-bar"
        className={`bar-pos--${bar_position} bar-align--${bar_alignment} ${
          isMacStyle ? "taskbar-bar--macos-dock" : "taskbar-bar--windows"
        }`}
      >
        {isMacStyle ? (
          /* macOS Mode: Bottom Dock holds only Start + Media + Apps directly */
          renderAppsCluster(false)
        ) : (
          /* Windows Mode: Unified taskbar holding Apps & Status clusters */
          <>
            {/* Left Section: SysMon in center align, Apps in left align, Status in right align */}
            <div className="taskbar-left taskbar-section taskbar-section--left">
              {bar_alignment === "left" && renderAppsCluster(false)}
              {bar_alignment === "center" && isEnabled("sysmon") && <SysMonCapsule />}
              {bar_alignment === "right" && renderStatusCluster("right")}
            </div>

            {/* Center Section: Apps (in center align) */}
            <div className="taskbar-center taskbar-section taskbar-section--center">
              {bar_alignment === "center" && renderAppsCluster(false)}
            </div>

            {/* Right Section: Status (in left/center align) OR Apps (in right align) */}
            <div className="taskbar-right taskbar-section taskbar-section--right">
              {bar_alignment === "left" && renderStatusCluster("left")}
              {bar_alignment === "center" && renderStatusCluster("center")}
              {bar_alignment === "right" && renderAppsCluster(true)}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
