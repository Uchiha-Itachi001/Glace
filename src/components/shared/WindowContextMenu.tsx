import React, { useEffect, useRef } from "react";
import { WindowInfo } from "../../types";
import { tauriBridge } from "../../services/tauriBridge";

interface WindowContextMenuProps {
  window: WindowInfo;
  x: number;
  y: number;
  onClose: () => void;
}

export const WindowContextMenu: React.FC<WindowContextMenuProps> = ({
  window: win,
  x,
  y,
  onClose,
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
    tauriBridge.snapWindow(win.hwnd, position);
    onClose();
  };

  const handleFocus = () => {
    tauriBridge.focusWindow(win.hwnd);
    onClose();
  };

  const handleMinimize = () => {
    tauriBridge.minimizeWindow(win.hwnd);
    onClose();
  };

  const handleClose = () => {
    tauriBridge.closeWindow(win.hwnd);
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
        {win.icon_b64 ? (
          <img src={win.icon_b64} alt="" className="wcm-icon" />
        ) : (
          <div className="wcm-icon-fallback" />
        )}
        <div className="wcm-info">
          <span className="wcm-title">{win.title || "Window"}</span>
          <span className="wcm-exe">{win.exe}</span>
        </div>
      </div>

      <div className="calendar-divider" />

      {/* Snap Grid Options */}
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

      {/* Window Actions */}
      <div className="wcm-actions">
        <button className="wcm-action-btn icon-hover" onClick={handleFocus}>
          <span>Bring to Front</span>
        </button>
        <button className="wcm-action-btn icon-hover" onClick={handleMinimize}>
          <span>Minimize Window</span>
        </button>
        <button
          className="wcm-action-btn wcm-action-btn--danger icon-hover"
          onClick={handleClose}
        >
          <span>Close Window</span>
        </button>
      </div>
    </div>
  );
};
