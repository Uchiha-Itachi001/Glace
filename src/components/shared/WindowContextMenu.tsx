import React, { useEffect, useRef } from "react";
import { DockAppItem } from "../../types";
import { tauriBridge } from "../../services/tauriBridge";

interface WindowContextMenuProps {
  item: DockAppItem;
  onClose: () => void;
}

export const WindowContextMenu: React.FC<WindowContextMenuProps> = ({
  item,
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

  const isBrowser =
    (item.exe && /msedge|chrome|brave|opera|vivaldi|firefox|arc|zen|thorium|waterfox|librewolf|floorp|chromium|yandex|duckduckgo|tor/i.test(item.exe)) ||
    (item.title && /chrome|edge|brave|firefox|opera|vivaldi|arc|zen|browser/i.test(item.title));

  const handleNewWindow = (e: React.MouseEvent) => {
    e.stopPropagation();
    const cmd = item.lnk_path || item.exe || item.title;
    tauriBridge.launchApp(cmd);
    onClose();
  };

  const handleIncognitoWindow = (e: React.MouseEvent) => {
    e.stopPropagation();
    let cmd = item.lnk_path || item.exe || item.title;
    if (/chrome|brave|opera|vivaldi|arc|thorium|chromium|yandex/i.test(cmd)) {
      cmd = `${cmd} --incognito`;
    } else if (/msedge|edge/i.test(cmd)) {
      cmd = `${cmd} -inprivate`;
    } else if (/firefox|zen|waterfox|librewolf|floorp|tor/i.test(cmd)) {
      cmd = `${cmd} -private-window`;
    }
    tauriBridge.launchApp(cmd);
    onClose();
  };

  const handleFocusOrLaunch = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.is_running && item.hwnd !== undefined) {
      tauriBridge.focusWindow(item.hwnd);
    } else {
      const cmd = item.lnk_path || item.exe || item.title;
      tauriBridge.launchApp(cmd);
    }
    onClose();
  };

  const handleEndTask = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.windows && item.windows.length > 0) {
      item.windows.forEach((w) => tauriBridge.terminateWindowProcess(w.hwnd));
    } else if (item.hwnd !== undefined) {
      tauriBridge.terminateWindowProcess(item.hwnd);
    }
    onClose();
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
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
      className="fluent-jumplist"
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

      {/* 4. End task & Close window if running */}
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
