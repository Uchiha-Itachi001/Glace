import "./styles/tokens.css";
import "./styles/themes.css";
import "./styles/capsule.css";
import "./styles/animations.css";

import { useSettings } from "./stores/settingsStore";
import { StartCapsule } from "./components/capsules/StartCapsule";
import { AppsCapsule } from "./components/capsules/AppsCapsule";
import { MediaCapsule } from "./components/capsules/MediaCapsule";
import { SysMonCapsule } from "./components/capsules/SysMonCapsule";
import { TrayCapsule } from "./components/capsules/TrayCapsule";
import { ClockCapsule } from "./components/capsules/ClockCapsule";

export default function App() {
  const { settings } = useSettings();
  const { enabled_widgets, bar_position } = settings;

  const isEnabled = (id: string) => enabled_widgets.includes(id);

  return (
    <div id="glace-app-root">
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
