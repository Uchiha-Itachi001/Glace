import React, { useState, useRef } from "react";
import { DockAppItem } from "../../types";
import { WindowContextMenu } from "./WindowContextMenu";
import { tauriBridge } from "../../services/tauriBridge";

interface AppIconProps {
  app: DockAppItem;
  onClick: (app: DockAppItem) => void;
  onPin?: (app: DockAppItem) => void;
  onUnpin?: (id: string) => void;
}

export const AppIcon = React.memo<AppIconProps>(
  ({ app, onClick, onPin, onUnpin }) => {
    const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
    const [isHovered, setIsHovered] = useState(false);
    const hoverTimeoutRef = useRef<number | null>(null);

    const windowList =
      app.windows && app.windows.length > 0
        ? app.windows
        : app.is_running && app.hwnd
        ? [
            {
              hwnd: app.hwnd,
              title: app.title,
              exe: app.exe,
              icon_b64: app.icon_b64,
              is_focused: app.is_focused,
              is_minimized: app.is_minimized,
            },
          ]
        : [];

    const hasMultipleWindows = windowList.length > 1;

    const handleMouseEnter = () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      setIsHovered(true);
      // Expand region slightly for floating tooltip
      tauriBridge.setWindowHeight(true, 80).catch(console.error);
    };

    const handleMouseLeave = () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = window.setTimeout(() => {
        setIsHovered(false);
        if (!contextMenuPos) {
          tauriBridge.setWindowHeight(false).catch(console.error);
        }
      }, 100);
    };

    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      setContextMenuPos(null);
      setIsHovered(false);
      tauriBridge.setWindowHeight(false).catch(console.error);
      onClick(app);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsHovered(false);
      setContextMenuPos({ x: e.clientX, y: e.clientY });
      tauriBridge.setWindowHeight(true, 360).catch(console.error);
    };

    const handleCloseContextMenu = () => {
      setContextMenuPos(null);
      tauriBridge.setWindowHeight(false).catch(console.error);
    };

    return (
      <div
        className={`app-icon-container ${app.is_focused ? "app-icon--focused" : ""} ${
          app.is_minimized ? "app-icon--minimized" : ""
        } ${!app.is_running ? "app-icon--idle" : "app-icon--running"} ${
          hasMultipleWindows ? "app-icon--stacked" : ""
        }`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="app-icon-body">
          {app.icon_b64 ? (
            <img
              src={app.icon_b64}
              alt=""
              className="app-icon-img"
              draggable={false}
            />
          ) : (
            <div className="app-icon-fallback">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--glace-accent)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M3 9h18" />
                <path d="M9 21V9" />
              </svg>
            </div>
          )}
        </div>

        {/* Focus & Running Indicator Pills */}
        {hasMultipleWindows ? (
          <div className="stacked-indicators-row">
            {windowList.map((win, idx) => (
              <div
                key={win.hwnd || idx}
                className={`stacked-dot ${
                  win.is_focused ? "stacked-dot--focused" : "stacked-dot--open"
                }`}
              />
            ))}
          </div>
        ) : app.is_focused ? (
          <div className="active-indicator" />
        ) : app.is_running ? (
          <div className="open-indicator" />
        ) : null}

        {/* Clean Floating Tooltip Pill */}
        {isHovered && !contextMenuPos && (
          <div
            className="fluent-dock-preview-container"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="fluent-simple-tooltip">
              <span className="fluent-simple-tooltip-text">{app.title}</span>
            </div>
          </div>
        )}

        {/* Right-click Context Menu */}
        {contextMenuPos && (
          <WindowContextMenu
            item={app}
            x={contextMenuPos.x}
            onClose={handleCloseContextMenu}
            onPin={onPin}
            onUnpin={onUnpin}
          />
        )}
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.app.id === next.app.id &&
      prev.app.is_focused === next.app.is_focused &&
      prev.app.is_minimized === next.app.is_minimized &&
      prev.app.is_running === next.app.is_running &&
      prev.app.title === next.app.title &&
      prev.app.icon_b64 === next.app.icon_b64 &&
      prev.app.hwnd === next.app.hwnd &&
      (prev.app.windows?.length ?? 0) === (next.app.windows?.length ?? 0)
    );
  }
);

