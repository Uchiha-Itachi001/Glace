import React from "react";
import { useApps } from "../../hooks/useApps";
import { AppIcon } from "../shared/AppIcon";

export const AppsCapsule: React.FC = () => {
  const { dockApps, loading, launchOrFocus, pinApp, unpinApp } = useApps();

  return (
    <div className="capsule apps-capsule">
      <div className="apps-list">
        {dockApps.map((app) => (
          <AppIcon
            key={app.id}
            app={app}
            onClick={launchOrFocus}
            onPin={pinApp}
            onUnpin={unpinApp}
          />
        ))}

        {!loading && dockApps.length === 0 && (
          <div className="apps-empty">No apps pinned</div>
        )}
      </div>
    </div>
  );
};
