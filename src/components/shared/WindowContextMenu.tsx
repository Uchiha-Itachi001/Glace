import React, { useEffect, useRef } from "react";
import { DockAppItem } from "../../types";
import { tauriBridge } from "../../services/tauriBridge";

interface WindowContextMenuProps {
  item: DockAppItem;
  x?: number;
  onClose: () => void;
  onPin?: (item: DockAppItem) => void;
  onUnpin?: (id: string) => void;
}

export const WindowContextMenu: React.FC<WindowContextMenuProps> = ({
  item,
  x: _x,
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

  const isBrowser =
    (item.exe && /chrome|msedge|brave|firefox|opera/i.test(item.exe)) ||
    (item.title && /chrome|edge|brave|browser/i.test(item.title));

  const handleNewWindow = () => {
    const cmd = item.lnk_path || item.exe || item.title;
    tauriBridge.launchApp(cmd);
    onClose();
  };

  const handleIncognitoWindow = () => {
    let cmd = item.lnk_path || item.exe || item.title;
    if (/chrome|msedge|brave/i.test(cmd)) {
      cmd = `${cmd} --incognito`;
    }
    tauriBridge.launchApp(cmd);
    onClose();
  };

  const handleFocusOrLaunch = () => {
    if (item.is_running && item.hwnd !== undefined) {
      tauriBridge.focusWindow(item.hwnd);
    } else {
      const cmd = item.lnk_path || item.exe || item.title;
      tauriBridge.launchApp(cmd);
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

  const handleEndTask = () => {
    if (item.windows && item.windows.length > 0) {
      item.windows.forEach((w) => tauriBridge.closeWindow(w.hwnd));
    } else if (item.hwnd !== undefined) {
      tauriBridge.closeWindow(item.hwnd);
    }
    onClose();
  };

  const handleClose = () => {
    if (item.windows && item.windows.length > 0) {
      item.windows.forEach((w) => tauriBridge.closeWindow(w.hwnd));
    } else if (item.hwnd !== undefined) {
      tauriBridge.closeWindow(item.hwnd);
    }
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fluent-jumplist flyout-enter"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="jumplist-header-label">Tasks</div>

      {/* 1. New Window Action */}
      <button className="jumplist-item icon-hover" onClick={handleNewWindow}>
        {item.icon_b64 ? (
          <img src={item.icon_b64} alt="" className="jumplist-item-icon" />
        ) : (
          <div className="jumplist-item-icon-fallback" />
        )}
        <span className="jumplist-item-label">New window</span>
      </button>

      {/* 2. Browser Incognito Shortcut if applicable */}
      {isBrowser && (
        <button className="jumplist-item icon-hover" onClick={handleIncognitoWindow}>
          <div className="jumplist-item-icon-svg">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 12h20M12 2a5 5 0 0 0-5 5v1h10V7a5 5 0 0 0-5-5zM6 16a3 3 0 1 0 6 0 3 3 0 1 0-6 0zm6 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0z" />
            </svg>
          </div>
          <span className="jumplist-item-label">New Incognito window</span>
        </button>
      )}

      <div className="jumplist-divider" />

      {/* 3. Main App Focus / Launch */}
      <button className="jumplist-item icon-hover" onClick={handleFocusOrLaunch}>
        {item.icon_b64 ? (
          <img src={item.icon_b64} alt="" className="jumplist-item-icon" />
        ) : (
          <div className="jumplist-item-icon-fallback" />
        )}
        <span className="jumplist-item-label">{item.title || "Application"}</span>
      </button>

      {/* 4. Pin / Unpin from Taskbar */}
      <button className="jumplist-item icon-hover" onClick={handleTogglePin}>
        <div className="jumplist-item-icon-svg">
          {item.is_pinned ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="2" y1="2" x2="22" y2="22" />
              <path d="M12 17v5" />
              <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11" />
              <path d="M15 9.34V5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v1.34" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="17" x2="12" y2="22" />
              <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
            </svg>
          )}
        </div>
        <span className="jumplist-item-label">
          {item.is_pinned ? "Unpin from taskbar" : "Pin to taskbar"}
        </span>
      </button>

      {/* 5. End task & Close window if running */}
      {item.is_running && (
        <>
          <button className="jumplist-item icon-hover" onClick={handleEndTask}>
            <div className="jumplist-item-icon-svg">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
              </svg>
            </div>
            <span className="jumplist-item-label">End task</span>
          </button>

          <button className="jumplist-item icon-hover" onClick={handleClose}>
            <div className="jumplist-item-icon-svg">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <span className="jumplist-item-label">
              {item.windows && item.windows.length > 1 ? "Close all windows" : "Close window"}
            </span>
          </button>
        </>
      )}
    </div>
  );
};
