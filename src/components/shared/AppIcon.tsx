import React, { useState } from "react";
import { WindowInfo } from "../../types";
import { WindowContextMenu } from "./WindowContextMenu";

interface AppIconProps {
  window: WindowInfo;
  onFocus: (hwnd: number) => void;
  onMinimize: (hwnd: number) => void;
  onClose: (hwnd: number) => void;
}

export const AppIcon: React.FC<AppIconProps> = ({
  window: win,
  onFocus,
  onMinimize,
}) => {
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (contextMenuPos) {
      setContextMenuPos(null);
      return;
    }
    if (win.is_focused && !win.is_minimized) {
      onMinimize(win.hwnd);
    } else {
      onFocus(win.hwnd);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  };

  return (
    <div
      className={`app-icon-container ${win.is_focused ? "app-icon--focused" : ""} ${
        win.is_minimized ? "app-icon--minimized" : ""
      }`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      title={win.title}
    >
      <div className="app-icon-body icon-hover">
        {win.icon_b64 ? (
          <img
            src={win.icon_b64}
            alt={win.title}
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

      {/* Focus Indicator Pill */}
      {win.is_focused && <div className="active-indicator" />}
      {!win.is_focused && !win.is_minimized && <div className="open-indicator" />}

      {/* Hover Tooltip with App Info */}
      {showTooltip && !contextMenuPos && (
        <div className="app-icon-tooltip flyout-enter">
          <span className="tooltip-title">{win.title}</span>
          {win.exe && <span className="tooltip-exe">{win.exe}</span>}
        </div>
      )}

      {/* Full Window Snapping & Controls Context Menu */}
      {contextMenuPos && (
        <WindowContextMenu
          window={win}
          x={contextMenuPos.x}
          y={contextMenuPos.y}
          onClose={() => setContextMenuPos(null)}
        />
      )}
    </div>
  );
};
