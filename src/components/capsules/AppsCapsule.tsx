import React from "react";
import { useWindows } from "../../hooks/useWindows";
import { AppIcon } from "../shared/AppIcon";

export const AppsCapsule: React.FC = () => {
  const { windows, loading, focusWindow, minimizeWindow, closeWindow } = useWindows();

  return (
    <div className="capsule apps-capsule">
      <div className="apps-list">
        {windows.map((win) => (
          <AppIcon
            key={win.hwnd}
            window={win}
            onFocus={focusWindow}
            onMinimize={minimizeWindow}
            onClose={closeWindow}
          />
        ))}

        {!loading && windows.length === 0 && (
          <div className="apps-empty">No running apps</div>
        )}
      </div>
    </div>
  );
};
