import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
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
  const [maxVisibleApps, setMaxVisibleApps] = useState<number>(() => dockApps.length || 20);
  const collapseTimeoutRef = useRef<number | null>(null);

  // Dynamic Real-Time Section Collision Engine
  useEffect(() => {
    const computeCollisionFreeCapacity = () => {
      const taskbarEl = document.getElementById("taskbar-bar");
      const statusClusterEl = document.getElementById("taskbar-status-cluster");
      const appsClusterEl = document.getElementById("taskbar-apps-cluster");

      const screenW = window.innerWidth || (taskbarEl ? taskbarEl.clientWidth : 1920);
      const barAlign = settings?.bar_alignment || "center";
      const isMac = settings?.bar_position === "macos" || settings?.bar_position === "top";

      // If in macOS mode, dock is centered alone at the bottom with 100% full screen width available
      if (isMac) {
        const availableW = screenW - 80;
        const iconW = 40;
        setMaxVisibleApps(Math.max(3, Math.floor(availableW / iconW)));
        return;
      }

      // 1. Measure left-side capsule content boundary (SysMon or rightmost left-side capsule)
      let leftBound = 16;
      const leftCapsules = document.querySelectorAll(".taskbar-left .capsule");
      if (leftCapsules.length > 0) {
        const rightPositions = Array.from(leftCapsules)
          .map((el) => el.getBoundingClientRect().right)
          .filter((pos) => pos > 0 && pos < screenW);
        if (rightPositions.length > 0) {
          leftBound = Math.max(...rightPositions);
        }
      }

      // 2. Measure right-side capsule content boundary (leftmost edge of Tray/Clock)
      let rightBound = screenW - 16;
      const rightCapsules = document.querySelectorAll(".taskbar-right .capsule, .taskbar-status-cluster .capsule");
      if (rightCapsules.length > 0) {
        const leftPositions = Array.from(rightCapsules)
          .map((el) => el.getBoundingClientRect().left)
          .filter((pos) => pos > 0 && pos < screenW);
        if (leftPositions.length > 0) {
          rightBound = Math.min(...leftPositions);
        }
      } else {
        let statusW = 0;
        const enabled = settings?.enabled_widgets || ["start", "apps", "sysmon", "tray", "clock"];
        if (enabled.includes("tray")) {
          const count = (settings?.tray_items || []).length || 5;
          statusW += Math.max(120, count * 36 + 16);
        }
        if (enabled.includes("clock")) {
          statusW += 115;
        }
        rightBound = screenW - statusW - 16;
      }

      // 3. Measure Start button & Media width inside the apps cluster
      let nonAppsW = 0;
      if (appsClusterEl) {
        const startEl = appsClusterEl.querySelector(".start-capsule");
        const mediaEl = appsClusterEl.querySelector(".media-capsule");
        if (startEl) nonAppsW += startEl.getBoundingClientRect().width + 8;
        if (mediaEl) nonAppsW += mediaEl.getBoundingClientRect().width + 8;
      } else {
        if ((settings?.enabled_widgets || []).includes("start")) nonAppsW += 48 + 8;
        if (settings?.media_location === "taskbar") nonAppsW += 220 + 8;
      }

      // Safety buffer gap between sections (24px)
      const safetyGap = 24;
      let maxAllowedAppsWidth = 0;

      if (barAlign === "left") {
        const appsClusterLeft = appsClusterEl ? appsClusterEl.getBoundingClientRect().left : 10;
        const availableSpace = Math.max(80, rightBound - appsClusterLeft - nonAppsW - safetyGap);
        maxAllowedAppsWidth = availableSpace;
      } else if (barAlign === "center") {
        // In center alignment, calculate true symmetric space from center to leftBound and rightBound
        const centerMid = screenW / 2;
        const leftClearance = centerMid - leftBound - (safetyGap / 2);
        const rightClearance = rightBound - centerMid - (safetyGap / 2);
        const halfCenter = Math.max(120, Math.min(leftClearance, rightClearance));
        const maxTotalCenterW = halfCenter * 2;
        maxAllowedAppsWidth = Math.max(80, maxTotalCenterW - nonAppsW);
      } else {
        // Right alignment: Status is on left, apps docked on right
        const availableSpace = Math.max(80, (screenW - 10) - leftBound - nonAppsW - safetyGap);
        maxAllowedAppsWidth = availableSpace;
      }

      const iconW = 40; // 36px icon + 4px gap
      const totalNeededWidth = dockApps.length * iconW + 16;

      // If all dock apps fit inside the available space without collision, show ALL of them!
      if (totalNeededWidth <= maxAllowedAppsWidth) {
        setMaxVisibleApps(dockApps.length);
      } else {
        // When space is constrained, reserve 44px for the overflow ellipsis button
        const fittingApps = Math.max(2, Math.floor((maxAllowedAppsWidth - 44) / iconW));
        setMaxVisibleApps(fittingApps);
      }
    };

    // Run measurement with requestAnimationFrame
    const rafId = requestAnimationFrame(computeCollisionFreeCapacity);

    // Dynamic resize & DOM observer
    window.addEventListener("resize", computeCollisionFreeCapacity);
    const observer = new ResizeObserver(computeCollisionFreeCapacity);

    const taskbarEl = document.getElementById("taskbar-bar");
    const statusEl = document.getElementById("taskbar-status-cluster");
    if (taskbarEl) observer.observe(taskbarEl);
    if (statusEl) observer.observe(statusEl);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", computeCollisionFreeCapacity);
      observer.disconnect();
    };
  }, [
    dockApps.length,
    settings?.bar_alignment,
    settings?.bar_position,
    settings?.media_location,
    settings?.enabled_widgets,
    settings?.sysmon_mode,
    settings?.tray_items,
  ]);

  const isRightAlign = settings?.bar_alignment === "right";

  // Reorder apps based on alignment:
  // - Left & Center: First pinned app (e.g. Store) on left, subsequent apps flow right
  // - Right align: First pinned app (e.g. Store) on right (next to Start button), subsequent apps and new running apps flow left
  const orderedApps = useMemo(() => {
    if (isRightAlign) {
      return [...dockApps].reverse();
    }
    return dockApps;
  }, [dockApps, isRightAlign]);

  // Split apps into visible vs overflow, dynamically prioritizing focused apps into the visible bar
  const { visibleApps, overflowApps } = useMemo(() => {
    if (orderedApps.length <= maxVisibleApps) {
      return { visibleApps: orderedApps, overflowApps: [] };
    }

    if (isRightAlign) {
      // In right align, visible apps are the rightmost ones (closest to Start button)
      const rawVisible = orderedApps.slice(orderedApps.length - maxVisibleApps);
      const rawOverflow = orderedApps.slice(0, orderedApps.length - maxVisibleApps);

      // If the active/focused app is hidden inside overflow, swap it with the last most visible app
      const activeIdxInOverflow = rawOverflow.findIndex((app) => app.is_focused);
      if (activeIdxInOverflow !== -1 && rawVisible.length > 0) {
        const activeApp = rawOverflow[activeIdxInOverflow];
        // In right align, the last most app from the app section (closest to overflow btn) is at index 0
        const displacedApp = rawVisible[0];

        const visible = [...rawVisible];
        visible[0] = activeApp;

        const overflow = [...rawOverflow];
        overflow[activeIdxInOverflow] = displacedApp;

        return { visibleApps: visible, overflowApps: overflow };
      }

      return { visibleApps: rawVisible, overflowApps: rawOverflow };
    }

    // Left & Center alignment
    const rawVisible = orderedApps.slice(0, maxVisibleApps);
    const rawOverflow = orderedApps.slice(maxVisibleApps);

    // If the active/focused app is hidden inside overflow, swap it with the last most visible app
    const activeIdxInOverflow = rawOverflow.findIndex((app) => app.is_focused);
    if (activeIdxInOverflow !== -1 && rawVisible.length > 0) {
      const activeApp = rawOverflow[activeIdxInOverflow];
      // In left/center, the last most app from the visible section is at the end
      const displacedApp = rawVisible[rawVisible.length - 1];

      const visible = [...rawVisible];
      visible[visible.length - 1] = activeApp;

      const overflow = [...rawOverflow];
      overflow[activeIdxInOverflow] = displacedApp;

      return { visibleApps: visible, overflowApps: overflow };
    }

    return { visibleApps: rawVisible, overflowApps: rawOverflow };
  }, [orderedApps, maxVisibleApps, isRightAlign]);

  const handleIconMouseEnter = useCallback((appId: string) => {
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = null;
    }
    setHoveredAppId(appId);
    if (activeContextMenuAppId && activeContextMenuAppId !== appId) {
      setActiveContextMenuAppId(null);
      windowExpansion.release("apps-context");
    }
    windowExpansion.request("apps-hover", activeContextMenuAppId ? 360 : 280);
  }, [activeContextMenuAppId]);

  const handleIconMouseLeave = useCallback((appId: string) => {
    if (collapseTimeoutRef.current) clearTimeout(collapseTimeoutRef.current);
    collapseTimeoutRef.current = window.setTimeout(() => {
      setHoveredAppId((current) => (current === appId ? null : current));
      windowExpansion.release("apps-hover");
    }, 180);
  }, []);

  const handleOpenContextMenu = useCallback((appId: string) => {
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = null;
    }
    setActiveContextMenuAppId(appId);
    windowExpansion.request("apps-context", 360);
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setActiveContextMenuAppId(null);
    windowExpansion.release("apps-context");
  }, []);

  const handleIconClick = useCallback((app: Parameters<typeof launchOrFocus>[0]) => {
    setActiveContextMenuAppId(null);
    setIsOverflowOpen(false);
    windowExpansion.release("apps-context");
    windowExpansion.release("apps-overflow");
    windowExpansion.release("apps-hover");
    launchOrFocus(app);
  }, [launchOrFocus]);

  const toggleOverflow = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOverflowOpen((prev) => {
      const nextState = !prev;
      if (nextState) {
        windowExpansion.request("apps-overflow", 320);
      } else {
        windowExpansion.release("apps-overflow");
      }
      return nextState;
    });
  }, []);

  // Close overflow flyout when clicking outside
  useEffect(() => {
    if (!isOverflowOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Ignore clicks inside the overflow flyout itself, the overflow button, or an active jumplist context menu
      if (
        target.closest(".apps-overflow-flyout") ||
        target.closest(".apps-overflow-btn") ||
        target.closest(".fluent-jumplist")
      ) {
        return;
      }

      setIsOverflowOpen(false);
      windowExpansion.release("apps-overflow");
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOverflowOpen]);

  // Auto-close overflow flyout if apps fit into the dock (e.g. apps closed or space expanded)
  useEffect(() => {
    if (isOverflowOpen && overflowApps.length === 0) {
      setIsOverflowOpen(false);
      windowExpansion.release("apps-overflow");
    }
  }, [isOverflowOpen, overflowApps.length]);

  return (
    <div className="capsule apps-capsule">
      <div className="apps-list">
        {/* Ellipsis Overflow Button on LEFT when in right alignment */}
        {isRightAlign && overflowApps.length > 0 && (
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
              onHoverStart={handleIconMouseEnter}
              onHoverEnd={handleIconMouseLeave}
              onOpenContextMenu={handleOpenContextMenu}
              onCloseContextMenu={handleCloseContextMenu}
            />
          ))
        )}

        {/* Ellipsis Overflow Button on RIGHT when in left/center alignment */}
        {!isRightAlign && overflowApps.length > 0 && (
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
                onHoverStart={handleIconMouseEnter}
                onHoverEnd={handleIconMouseLeave}
                onOpenContextMenu={handleOpenContextMenu}
                onCloseContextMenu={handleCloseContextMenu}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
