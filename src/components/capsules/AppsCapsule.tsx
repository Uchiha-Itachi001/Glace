import React, { useState, useRef, useEffect, useMemo } from "react";
import { useApps } from "../../hooks/useApps";
import { useSettings } from "../../stores/settingsStore";
import { AppIcon } from "../shared/AppIcon";
import { windowExpansion } from "../../services/windowExpansion";

export const AppsCapsule: React.FC = () => {
  const { dockApps, loading, launchOrFocus, pinApp, unpinApp } = useApps();
  const { settings } = useSettings();

  const [activeContextMenuAppId, setActiveContextMenuAppId] = useState<string | null>(null);
  const [hoveredAppId, setHoveredAppId] = useState<string | null>(null);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const [maxVisibleApps, setMaxVisibleApps] = useState<number>(10);
  const collapseTimeoutRef = useRef<number | null>(null);

  // Dynamically compute how many app icons fit without overlapping right widgets
  useEffect(() => {
    const updateMaxApps = () => {
      const screenW = window.innerWidth || 1920;
      const isMediaInTaskbar = settings?.media_location === "taskbar";
      const mediaW = isMediaInTaskbar ? 220 : 0;
      const startW = (settings?.enabled_widgets || []).includes("start") ? 46 : 0;

      // Approximate space taken by right widgets (Sysmon ~130px, Tray ~160px, Clock ~110px)
      let rightW = 0;
      const enabled = settings?.enabled_widgets || ["start", "apps", "sysmon", "tray", "clock"];
      if (enabled.includes("sysmon")) rightW += 135;
      if (enabled.includes("tray")) rightW += 165;
      if (enabled.includes("clock")) rightW += 115;
      if (rightW === 0) rightW = 80;

      const barAlign = settings?.bar_alignment || "center";
      let availableW = screenW - rightW - startW - mediaW - 60;

      if (barAlign === "center") {
        // In center alignment, center area cannot exceed: screenW - 2 * (rightW + margin)
        // This ensures the centered apps cluster NEVER touches or collides with the right section!
        const maxCenterW = Math.max(200, screenW - 2 * (rightW + 36));
        availableW = Math.min(availableW, maxCenterW - startW - mediaW);
      }

      const iconW = 44; // 40px icon + 4px gap
      // Subtract space for the overflow ellipsis button if needed
      const calculatedMax = Math.max(2, Math.floor((availableW - 36) / iconW));
      setMaxVisibleApps(calculatedMax);
    };

    updateMaxApps();
    window.addEventListener("resize", updateMaxApps);
    return () => window.removeEventListener("resize", updateMaxApps);
  }, [settings?.media_location, settings?.enabled_widgets, settings?.bar_alignment]);

  // Split apps into visible vs overflow
  const { visibleApps, overflowApps } = useMemo(() => {
    if (dockApps.length <= maxVisibleApps) {
      return { visibleApps: dockApps, overflowApps: [] };
    }
    return {
      visibleApps: dockApps.slice(0, maxVisibleApps),
      overflowApps: dockApps.slice(maxVisibleApps),
    };
  }, [dockApps, maxVisibleApps]);

  const handleIconMouseEnter = (appId: string) => {
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = null;
    }
    setHoveredAppId(appId);
    if (activeContextMenuAppId && activeContextMenuAppId !== appId) {
      setActiveContextMenuAppId(null);
      windowExpansion.release("apps-context");
    }
    windowExpansion.request("apps-hover", activeContextMenuAppId ? 360 : 220);
  };

  const handleIconMouseLeave = (appId: string) => {
    if (collapseTimeoutRef.current) clearTimeout(collapseTimeoutRef.current);
    collapseTimeoutRef.current = window.setTimeout(() => {
      setHoveredAppId((current) => (current === appId ? null : current));
      windowExpansion.release("apps-hover");
    }, 180);
  };

  const handleOpenContextMenu = (appId: string) => {
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = null;
    }
    setActiveContextMenuAppId(appId);
    windowExpansion.request("apps-context", 360);
  };

  const handleCloseContextMenu = () => {
    setActiveContextMenuAppId(null);
    windowExpansion.release("apps-context");
  };

  const handleIconClick = (app: Parameters<typeof launchOrFocus>[0]) => {
    setActiveContextMenuAppId(null);
    setIsOverflowOpen(false);
    windowExpansion.release("apps-context");
    windowExpansion.release("apps-overflow");
    windowExpansion.release("apps-hover");
    launchOrFocus(app);
  };

  const toggleOverflow = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextState = !isOverflowOpen;
    setIsOverflowOpen(nextState);
    if (nextState) {
      windowExpansion.request("apps-overflow", 320);
    } else {
      windowExpansion.release("apps-overflow");
    }
  };

  return (
    <>
      {/* Context Menu Backdrop */}
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

      {/* Overflow Flyout Backdrop */}
      {isOverflowOpen && (
        <div
          className="jumplist-backdrop"
          onClick={() => {
            setIsOverflowOpen(false);
            windowExpansion.release("apps-overflow");
          }}
        />
      )}

      <div className="capsule apps-capsule">
        <div className="apps-list">
          {loading && dockApps.length === 0 ? (
            <div className="apps-skeleton-list">
              <div className="app-icon-skeleton" />
              <div className="app-icon-skeleton" />
              <div className="app-icon-skeleton" />
              <div className="app-icon-skeleton" />
            </div>
          ) : (
            visibleApps.map((app, index) => (
              <AppIcon
                key={app.id}
                app={app}
                index={index}
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
            ))
          )}

          {/* Ellipsis Overflow Button when apps exceed space */}
          {overflowApps.length > 0 && (
            <div
              className={`apps-overflow-btn icon-hover ${
                isOverflowOpen ? "apps-overflow-btn--active" : ""
              }`}
              onClick={toggleOverflow}
              title={`Show ${overflowApps.length} more running applications`}
            >
              <div className="apps-overflow-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="5" cy="12" r="2.2" />
                  <circle cx="12" cy="12" r="2.2" />
                  <circle cx="19" cy="12" r="2.2" />
                </svg>
              </div>
              <span className="apps-overflow-badge">+{overflowApps.length}</span>
            </div>
          )}

          {!loading && dockApps.length === 0 && (
            <div className="apps-empty">No apps pinned</div>
          )}
        </div>

        {/* Overflow Apps Flyout */}
        {isOverflowOpen && overflowApps.length > 0 && (
          <div
            className="apps-overflow-flyout flyout-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="apps-overflow-header">
              <span className="apps-overflow-title">
                More Apps ({overflowApps.length})
              </span>
              <button
                className="apps-overflow-close"
                onClick={() => {
                  setIsOverflowOpen(false);
                  windowExpansion.release("apps-overflow");
                }}
              >
                ✕
              </button>
            </div>
            <div className="apps-overflow-grid">
              {overflowApps.map((app, index) => (
                <AppIcon
                  key={app.id}
                  app={app}
                  index={index}
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
            </div>
          </div>
        )}
      </div>
    </>
  );
};
