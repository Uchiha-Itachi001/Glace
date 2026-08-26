import React, { useState } from "react";
import { DockAppItem } from "../../types";
import { WindowContextMenu } from "./WindowContextMenu";

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
  const [showTooltip, setShowTooltip] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (contextMenuPos) {
      setContextMenuPos(null);
      return;
    }
    onClick(app);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  };

  return (
    <div
      className={`app-icon-container ${app.is_focused ? "app-icon--focused" : ""} ${
        app.is_minimized ? "app-icon--minimized" : ""
      } ${!app.is_running ? "app-icon--idle" : "app-icon--running"}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      title={app.title}
    >
      <div className="app-icon-body icon-hover">
        {app.icon_b64 ? (
          <img
            src={app.icon_b64}
            alt={app.title}
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
      {app.is_focused && <div className="active-indicator" />}
      {app.is_running && !app.is_focused && <div className="open-indicator" />}

      {/* Hover Tooltip with App Info */}
      {showTooltip && !contextMenuPos && (
        <div className="app-icon-tooltip flyout-enter">
          <span className="tooltip-title">{app.title}</span>
          {app.exe && <span className="tooltip-exe">{app.exe}</span>}
          {!app.is_running && <span className="tooltip-badge">Pinned</span>}
        </div>
      )}

      {/* Context Menu for Window Controls & Pin/Unpin */}
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
