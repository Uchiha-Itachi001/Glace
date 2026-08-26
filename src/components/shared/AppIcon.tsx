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

export const AppIcon: React.FC<AppIconProps> = ({
  app,
  onClick,
  onPin,
  onUnpin,
}) => {
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeoutRef = useRef<number | null>(null);

  const windowList = app.windows && app.windows.length > 0 ? app.windows : (app.hwnd ? [{ hwnd: app.hwnd, title: app.title, exe: app.exe, icon_b64: app.icon_b64, is_focused: app.is_focused, is_minimized: app.is_minimized }] : []);
  const hasMultipleWindows = windowList.length > 1;

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = window.setTimeout(() => {
      setIsHovered(true);
    }, 120);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = window.setTimeout(() => {
      setIsHovered(false);
    }, 150);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (contextMenuPos) {
      setContextMenuPos(null);
      return;
    }
    setIsHovered(false);
    onClick(app);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsHovered(false);
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  };

  const handleWindowCardClick = (e: React.MouseEvent, hwnd: number) => {
    e.stopPropagation();
    setIsHovered(false);
    tauriBridge.focusWindow(hwnd);
  };

  const handleWindowCardClose = (e: React.MouseEvent, hwnd: number) => {
    e.stopPropagation();
    tauriBridge.closeWindow(hwnd);
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
      {/* Stacked background plate for multiple window instances */}
      {hasMultipleWindows && <div className="app-icon-stack-plate" />}

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

      {/* Focus & Running Indicator Underline/Pill */}
      {app.is_focused ? (
        <div className="active-indicator" />
      ) : app.is_running ? (
        <div className="open-indicator" />
      ) : null}

      {/* Fluent Hover Flyout Preview & Tooltip */}
      {isHovered && !contextMenuPos && (
        <div
          className="fluent-dock-preview-container"
          onClick={(e) => e.stopPropagation()}
        >
          {app.is_running && windowList.length > 0 ? (
            /* Running Windows Thumbnail / Title Strip */
            <div className="fluent-window-cards-row">
              {windowList.map((win) => (
                <div
                  key={win.hwnd}
                  className={`fluent-window-card ${win.is_focused ? "fluent-window-card--focused" : ""}`}
                  onClick={(e) => handleWindowCardClick(e, win.hwnd)}
                >
                  <div className="fluent-card-header">
                    {win.icon_b64 ? (
                      <img src={win.icon_b64} alt="" className="fluent-card-icon" />
                    ) : (
                      <div className="fluent-card-icon-fallback" />
                    )}
                    <span className="fluent-card-title" title={win.title}>
                      {win.title || app.title}
                    </span>
                    <button
                      className="fluent-card-close-btn"
                      onClick={(e) => handleWindowCardClose(e, win.hwnd)}
                      title="Close window"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Clean Fluent Tooltip for Closed / Pinned Apps */
            <div className="fluent-simple-tooltip">
              <span className="fluent-simple-tooltip-text">{app.title}</span>
            </div>
          )}
        </div>
      )}

      {/* Right-click Context Menu */}
      {contextMenuPos && (
        <WindowContextMenu
          item={app}
          x={contextMenuPos.x}
          onClose={() => setContextMenuPos(null)}
          onPin={onPin}
          onUnpin={onUnpin}
        />
      )}
    </div>
  );
};
