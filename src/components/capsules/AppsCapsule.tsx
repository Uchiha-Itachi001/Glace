import React, { useState, useRef } from "react";
import { useApps } from "../../hooks/useApps";
import { AppIcon } from "../shared/AppIcon";
import { tauriBridge } from "../../services/tauriBridge";

export const AppsCapsule: React.FC = () => {
  const { dockApps, loading, launchOrFocus, pinApp, unpinApp } = useApps();
  const [activeContextMenuAppId, setActiveContextMenuAppId] = useState<string | null>(null);
  const [hoveredAppId, setHoveredAppId] = useState<string | null>(null);
  const collapseTimeoutRef = useRef<number | null>(null);

  const handleIconMouseEnter = (appId: string) => {
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = null;
    }
    setHoveredAppId(appId);
    if (activeContextMenuAppId && activeContextMenuAppId !== appId) {
      setActiveContextMenuAppId(null);
    }
    tauriBridge.setWindowHeight(true, activeContextMenuAppId ? 360 : 220).catch(console.error);
  };

  const handleIconMouseLeave = (appId: string) => {
    if (collapseTimeoutRef.current) clearTimeout(collapseTimeoutRef.current);
    collapseTimeoutRef.current = window.setTimeout(() => {
      setHoveredAppId((current) => (current === appId ? null : current));
      if (!activeContextMenuAppId) {
        tauriBridge.setWindowHeight(false).catch(console.error);
      }
    }, 180);
  };

  const handleOpenContextMenu = (appId: string) => {
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = null;
    }
    setActiveContextMenuAppId(appId);
    tauriBridge.setWindowHeight(true, 360).catch(console.error);
  };

  const handleCloseContextMenu = () => {
    setActiveContextMenuAppId(null);
    if (!hoveredAppId) {
      tauriBridge.setWindowHeight(false).catch(console.error);
    } else {
      tauriBridge.setWindowHeight(true, 220).catch(console.error);
    }
  };

  const handleIconClick = (app: Parameters<typeof launchOrFocus>[0]) => {
    setActiveContextMenuAppId(null);
    launchOrFocus(app);
  };

  return (
    <>
      {activeContextMenuAppId !== null && (
        <div
          className="jumplist-backdrop"
          onClick={handleCloseContextMenu}
          onContextMenu={(e) => {
            e.preventDefault();
            handleCloseContextMenu();
          }}
        />
      )}
      <div className="capsule apps-capsule">
        <div className="apps-list">
          {dockApps.map((app) => (
            <AppIcon
              key={app.id}
              app={app}
              onClick={handleIconClick}
              onPin={pinApp}
              onUnpin={unpinApp}
              isHovered={hoveredAppId === app.id}
              isContextMenuOpen={activeContextMenuAppId === app.id}
              isAnyContextMenuOpen={activeContextMenuAppId !== null}
              onHoverStart={() => handleIconMouseEnter(app.id)}
              onHoverEnd={() => handleIconMouseLeave(app.id)}
              onOpenContextMenu={() => handleOpenContextMenu(app.id)}
              onCloseContextMenu={handleCloseContextMenu}
            />
          ))}

          {!loading && dockApps.length === 0 && (
            <div className="apps-empty">No apps pinned</div>
          )}
        </div>
      </div>
    </>
  );
};
