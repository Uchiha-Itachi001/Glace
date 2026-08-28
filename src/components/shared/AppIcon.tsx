import React from "react";
import { DockAppItem } from "../../types";
import { WindowContextMenu } from "./WindowContextMenu";
import { tauriBridge } from "../../services/tauriBridge";

interface AppIconProps {
  app: DockAppItem;
  index?: number;
  onClick: (app: DockAppItem) => void;
  onPin?: (app: DockAppItem) => void;
  onUnpin?: (id: string) => void;
  isHovered?: boolean;
  isContextMenuOpen?: boolean;
  isAnyContextMenuOpen?: boolean;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
  onOpenContextMenu?: () => void;
  onCloseContextMenu?: () => void;
}

export const AppIcon = React.memo<AppIconProps>(
  ({
    app,
    index = 0,
    onClick,
    onPin,
    onUnpin,
    isHovered = false,
    isContextMenuOpen = false,
    isAnyContextMenuOpen = false,
    onHoverStart,
    onHoverEnd,
    onOpenContextMenu,
    onCloseContextMenu,
  }) => {
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
      if (onHoverStart) onHoverStart();
    };

    const handleMouseLeave = () => {
      if (onHoverEnd) onHoverEnd();
    };

    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick(app);
    };

    const handleWindowCardClick = (e: React.MouseEvent, hwnd: number) => {
      e.stopPropagation();
      tauriBridge.focusWindow(hwnd).catch(console.error);
    };

    const handleCloseWindow = (e: React.MouseEvent, hwnd: number) => {
      e.stopPropagation();
      tauriBridge.closeWindow(hwnd).catch(console.error);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (onOpenContextMenu) {
        onOpenContextMenu();
      }
    };

    return (
      <div
        className={`app-icon-container ${app.is_focused ? "app-icon--focused" : ""} ${
          app.is_minimized ? "app-icon--minimized" : ""
        } ${!app.is_running ? "app-icon--idle" : "app-icon--running"} ${
          hasMultipleWindows ? "app-icon--stacked" : ""
        }`}
        style={{ "--item-index": index } as React.CSSProperties}
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

        {/* Hover Previews & Tooltips (Suppressed if any context menu is open) */}
        {isHovered && !isAnyContextMenuOpen && (
          <div
            className="fluent-dock-preview-container"
            onClick={(e) => e.stopPropagation()}
          >
            {hasMultipleWindows ? (
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
                        <img src={win.icon_b64} alt="" className="fluent-card-icon" />
                      ) : (
                        <div className="fluent-card-icon-fallback" />
                      )}
                      <span className="fluent-card-title">{win.title}</span>
                      <button
                        className="fluent-card-close-btn"
                        title="Close window"
                        onClick={(e) => handleCloseWindow(e, win.hwnd)}
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
        {isContextMenuOpen && (
          <WindowContextMenu
            item={app}
            onClose={onCloseContextMenu || (() => {})}
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
      prev.isHovered === next.isHovered &&
      prev.isContextMenuOpen === next.isContextMenuOpen &&
      prev.isAnyContextMenuOpen === next.isAnyContextMenuOpen &&
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

