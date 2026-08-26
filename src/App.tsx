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

import { SettingsFlyout } from "./components/overlays/SettingsFlyout";
import { CalendarFlyout } from "./components/overlays/CalendarFlyout";
import { StartLauncherFlyout } from "./components/overlays/StartLauncherFlyout";

export default function App() {
  const { settings } = useSettings();
  const { activeFlyout, closeFlyout } = useFlyout();

  const { enabled_widgets, bar_position } = settings;
  const isEnabled = (id: string) => enabled_widgets.includes(id);

  return (
    <div id="glace-app-root">
      {/* Invisible Flyout Backdrop to dismiss panels when clicking outside */}
      {activeFlyout !== null && (
        <div className="flyout-backdrop" onClick={closeFlyout} />
      )}

      {/* Flyout Panels */}
      {activeFlyout === "settings" && (
        <SettingsFlyout onClose={closeFlyout} />
      )}
      {activeFlyout === "calendar" && (
        <CalendarFlyout onClose={closeFlyout} />
      )}
      {activeFlyout === "start" && (
        <StartLauncherFlyout onClose={closeFlyout} />
      )}

      {/* Taskbar Bar */}
      <main id="taskbar-bar" className={`bar-pos--${bar_position || "bottom"}`}>
        {/* Left Section: Start & Media */}
        <div className="taskbar-left taskbar-section taskbar-section--left">
          {isEnabled("start") && <StartCapsule />}
          {isEnabled("media") && <MediaCapsule />}
        </div>

        {/* Center Section: Running & Pinned Applications */}
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
