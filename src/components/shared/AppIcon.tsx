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
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
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
    // Expand region for all apps — needed for both preview cards AND tooltip popup
    tauriBridge.setWindowHeight(true, 240).catch(console.error);

    if (app.is_running && windowList.length > 0) {
      // Fetch live window thumbnail screenshot
      windowList.forEach((win) => {
        if (win.hwnd && !thumbnails[win.hwnd]) {
          tauriBridge.getWindowThumbnail(win.hwnd).then((thumb) => {
            if (thumb) {
              setThumbnails((prev) => ({ ...prev, [win.hwnd]: thumb }));
            }
          }).catch(console.error);
        }
      });
    }
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = window.setTimeout(() => {
      setIsHovered(false);
      if (!contextMenuPos) {
        tauriBridge.setWindowHeight(false).catch(console.error);
      }
    }, 120);
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

  const handleWindowCardClick = (e: React.MouseEvent, hwnd: number) => {
    e.stopPropagation();
    setIsHovered(false);
    tauriBridge.setWindowHeight(false).catch(console.error);
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

      {/* Fluent Hover Flyout Preview & Tooltip */}
      {isHovered && !contextMenuPos && (
        <div
          className="fluent-dock-preview-container"
          onClick={(e) => e.stopPropagation()}
        >
          {app.is_running && windowList.length > 0 ? (
            <div className="fluent-window-cards-row">
              {windowList.map((win) => (
                <div
                  key={win.hwnd}
                  className={`fluent-window-card ${
                    win.is_focused ? "fluent-window-card--focused" : ""
                  }`}
                  onClick={(e) => handleWindowCardClick(e, win.hwnd)}
                >
                  <div className="fluent-card-header">
                    {win.icon_b64 ? (
                      <img
                        src={win.icon_b64}
                        alt=""
                        className="fluent-card-icon"
                      />
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
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>

                  {/* Window Thumbnail Preview Body */}
                  <div className="fluent-card-thumbnail-container">
                    {thumbnails[win.hwnd] ? (
                      <img
                        src={thumbnails[win.hwnd]}
                        alt=""
                        className="fluent-card-thumbnail-img"
                        draggable={false}
                      />
                    ) : (
                      <div className="fluent-card-thumbnail-fallback">
                        {win.icon_b64 ? (
                          <img
                            src={win.icon_b64}
                            alt=""
                            className="fluent-card-thumbnail-fallback-icon"
                            draggable={false}
                          />
                        ) : (
                          <svg
                            width="28"
                            height="28"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            className="fluent-card-thumbnail-fallback-svg"
                          >
                            <rect width="18" height="18" x="3" y="3" rx="2" />
                            <path d="M3 9h18" />
                            <path d="M9 21V9" />
                          </svg>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
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
          onClose={handleCloseContextMenu}
          onPin={onPin}
          onUnpin={onUnpin}
        />
      )}
    </div>
  );
};
