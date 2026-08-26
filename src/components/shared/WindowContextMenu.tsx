import React, { useEffect, useRef } from "react";
import { DockAppItem } from "../../types";
import { tauriBridge } from "../../services/tauriBridge";

interface WindowContextMenuProps {
  item: DockAppItem;
  x: number;
  onClose: () => void;
  onPin?: (item: DockAppItem) => void;
  onUnpin?: (id: string) => void;
}

export const WindowContextMenu: React.FC<WindowContextMenuProps> = ({
  item,
  x,
  onClose,
  onPin,
  onUnpin,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [onClose]);

  const handleLaunch = () => {
    const cmd = item.lnk_path || item.exe || item.title;
    tauriBridge.launchApp(cmd);
    onClose();
  };

  const handleSnap = (
    position:
      | "left"
      | "right"
      | "top-left"
      | "top-right"
      | "bottom-left"
      | "bottom-right"
      | "maximize"
      | "restore"
      | "center"
  ) => {
    if (item.hwnd !== undefined) {
      tauriBridge.snapWindow(item.hwnd, position);
    }
    onClose();
  };

  const handleFocus = () => {
    if (item.hwnd !== undefined) {
      tauriBridge.focusWindow(item.hwnd);
    }
    onClose();
  };

  const handleMinimize = () => {
    if (item.hwnd !== undefined) {
      tauriBridge.minimizeWindow(item.hwnd);
    }
    onClose();
  };

  const handleClose = () => {
    if (item.hwnd !== undefined) {
      tauriBridge.closeWindow(item.hwnd);
    }
    onClose();
  };

  const handleTogglePin = () => {
    if (item.is_pinned) {
      if (onUnpin) onUnpin(item.id);
    } else {
      if (onPin) onPin(item);
    }
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="window-context-menu flyout-enter"
      style={{
        left: Math.max(10, Math.min(window.innerWidth - 240, x - 100)),
        bottom: 60,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="wcm-header">
        {item.icon_b64 ? (
          <img src={item.icon_b64} alt="" className="wcm-icon" />
        ) : (
          <div className="wcm-icon-fallback" />
        )}
        <div className="wcm-info">
          <span className="wcm-title">{item.title || "Application"}</span>
          <span className="wcm-exe">{item.exe || (item.is_pinned ? "Pinned Shortcut" : "Application")}</span>
        </div>
      </div>

      <div className="calendar-divider" />

      {/* If Running: Snap Grid Options */}
      {item.is_running && (
        <>
          <div className="wcm-section-label">Tile & Snap Layouts</div>
          <div className="wcm-snap-grid">
            <button
              className="wcm-snap-btn icon-hover"
              onClick={() => handleSnap("left")}
              title="Snap Left (Half Screen)"
            >
              <span className="wcm-snap-glyph">◧</span>
              <span>Left</span>
            </button>

            <button
              className="wcm-snap-btn icon-hover"
              onClick={() => handleSnap("right")}
              title="Snap Right (Half Screen)"
            >
              <span className="wcm-snap-glyph">◨</span>
              <span>Right</span>
            </button>

            <button
              className="wcm-snap-btn icon-hover"
              onClick={() => handleSnap("top-left")}
              title="Quarter Top-Left"
            >
              <span className="wcm-snap-glyph">◸</span>
              <span>Top-L</span>
            </button>

            <button
              className="wcm-snap-btn icon-hover"
              onClick={() => handleSnap("top-right")}
              title="Quarter Top-Right"
            >
              <span className="wcm-snap-glyph">◹</span>
              <span>Top-R</span>
            </button>

            <button
              className="wcm-snap-btn icon-hover"
              onClick={() => handleSnap("bottom-left")}
              title="Quarter Bottom-Left"
            >
              <span className="wcm-snap-glyph">◺</span>
              <span>Bot-L</span>
            </button>

            <button
              className="wcm-snap-btn icon-hover"
              onClick={() => handleSnap("bottom-right")}
              title="Quarter Bottom-Right"
            >
              <span className="wcm-snap-glyph">◿</span>
              <span>Bot-R</span>
            </button>

            <button
              className="wcm-snap-btn icon-hover"
              onClick={() => handleSnap("maximize")}
              title="Maximize Window"
            >
              <span className="wcm-snap-glyph">🗖</span>
              <span>Max</span>
            </button>

            <button
              className="wcm-snap-btn icon-hover"
              onClick={() => handleSnap("center")}
              title="Center Float"
            >
              <span className="wcm-snap-glyph">⧉</span>
              <span>Center</span>
            </button>
          </div>

          <div className="calendar-divider" />

          {/* Running Window Actions */}
          <div className="wcm-actions">
            <button className="wcm-action-btn icon-hover" onClick={handleFocus}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              <span>Bring to Front</span>
            </button>
            <button className="wcm-action-btn icon-hover" onClick={handleMinimize}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Minimize Window</span>
            </button>
            <button
              className="wcm-action-btn wcm-action-btn--danger icon-hover"
              onClick={handleClose}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
              <span>Close Window</span>
            </button>
          </div>

          <div className="calendar-divider" />
        </>
      )}

      {/* If Not Running: Launch Option */}
      {!item.is_running && (
        <div className="wcm-actions">
          <button className="wcm-action-btn icon-hover" onClick={handleLaunch}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <span>Open {item.title}</span>
          </button>
        </div>
      )}

      {/* Pin / Unpin Taskbar Options */}
      <div className="wcm-actions">
        <button className="wcm-action-btn icon-hover" onClick={handleTogglePin}>
          {item.is_pinned ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="2" y1="2" x2="22" y2="22" />
                <path d="M12 17v5" />
                <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11" />
                <path d="M15 9.34V5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v1.34" />
              </svg>
              <span>Unpin from taskbar</span>
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="17" x2="12" y2="22" />
                <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
              </svg>
              <span>Pin to taskbar</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
