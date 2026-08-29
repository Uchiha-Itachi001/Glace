import React from "react";
import { WindowInfo } from "../../types";

interface WindowPreviewCardProps {
  win: WindowInfo;
  onFocus: (hwnd: number) => void;
  onClose: (hwnd: number) => void;
}

export const WindowPreviewCard: React.FC<WindowPreviewCardProps> = ({
  win,
  onFocus,
  onClose,
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFocus(win.hwnd);
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose(win.hwnd);
  };

  return (
    <div
      className={`fluent-window-card ${
        win.is_focused ? "fluent-window-card--focused" : ""
      } ${win.is_minimized ? "fluent-window-card--minimized" : ""}`}
      onClick={handleClick}
      title={win.title}
    >
      {/* Card Header with App Icon, Title and Close Button */}
      <div className="fluent-card-header">
        {win.icon_b64 ? (
          <img src={win.icon_b64} alt="" className="fluent-card-icon" draggable={false} />
        ) : (
          <div className="fluent-card-icon-fallback" />
        )}
        <span className="fluent-card-title">{win.title || "Window"}</span>
        <button
          type="button"
          className="fluent-card-close-btn"
          title="Close window"
          onClick={handleClose}
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

      {/* Card Frosted Glass Body */}
      <div className="fluent-card-body">
        <div className="fluent-card-icon-container">
          {win.icon_b64 ? (
            <img
              src={win.icon_b64}
              alt=""
              className="fluent-card-body-icon"
              draggable={false}
            />
          ) : (
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              className="fluent-card-body-icon-svg"
            >
              <rect width="18" height="14" x="3" y="5" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
            </svg>
          )}
        </div>

        <div className="fluent-card-meta">
          <span className="fluent-card-meta-title">{win.title || "Window"}</span>
          <div
            className={`fluent-card-status-badge ${
              win.is_focused
                ? "fluent-card-status-badge--active"
                : win.is_minimized
                ? "fluent-card-status-badge--minimized"
                : ""
            }`}
          >
            <span className="fluent-card-status-dot" />
            <span>
              {win.is_focused
                ? "Active"
                : win.is_minimized
                ? "Minimized"
                : "Running"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
