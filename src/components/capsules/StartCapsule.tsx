import React, { useState, useRef, useEffect } from "react";
import { tauriBridge } from "../../services/tauriBridge";
import { useFlyout } from "../../stores/flyoutStore";
import { windowExpansion } from "../../services/windowExpansion";

export const StartCapsule: React.FC = () => {
  const { openFlyout } = useFlyout();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;
    windowExpansion.request("start-context", 280);

    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
        windowExpansion.release("start-context");
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      windowExpansion.release("start-context");
    };
  }, [isMenuOpen]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isMenuOpen) {
      setIsMenuOpen(false);
      windowExpansion.release("start-context");
      return;
    }
    // Directly opens the native Windows Start Menu
    tauriBridge.openStartMenu().catch(console.error);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsMenuOpen((prev) => !prev);
  };

  return (
    <div className="start-capsule-container" style={{ position: "relative" }}>
      <div
        className="capsule capsule--compact start-capsule icon-hover"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        title="Start (Right-click for Quick Menu)"
      >
        <div className="start-icon-wrapper">
          {/* Official Windows 11 4-Tile Fluent Logo */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            className="start-windows-glyph"
          >
            <rect x="2.5" y="2.5" width="8.8" height="8.8" rx="1.2" fill="#00a4ef" />
            <rect x="12.7" y="2.5" width="8.8" height="8.8" rx="1.2" fill="#00a4ef" />
            <rect x="2.5" y="12.7" width="8.8" height="8.8" rx="1.2" fill="#00a4ef" />
            <rect x="12.7" y="12.7" width="8.8" height="8.8" rx="1.2" fill="#00a4ef" />
          </svg>
        </div>
      </div>

      {isMenuOpen && (
        <div
          ref={menuRef}
          className="start-context-menu"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="start-context-header">
            <span className="start-context-title">Quick Actions</span>
          </div>

          <button
            className="start-menu-item"
            onClick={() => {
              setIsMenuOpen(false);
              windowExpansion.release("start-context");
              openFlyout("settings", 520);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Glace Settings</span>
          </button>

          <button
            className="start-menu-item"
            onClick={() => {
              setIsMenuOpen(false);
              windowExpansion.release("start-context");
              tauriBridge.openWindowsSettings();
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect width="20" height="14" x="2" y="3" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <span>Windows Settings</span>
          </button>

          <button
            className="start-menu-item"
            onClick={() => {
              setIsMenuOpen(false);
              windowExpansion.release("start-context");
              tauriBridge.launchApp("taskmgr.exe");
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            <span>Task Manager</span>
          </button>

          <div className="start-menu-divider" />

          <button
            className="start-menu-item start-menu-item--danger"
            onClick={() => {
              setIsMenuOpen(false);
              windowExpansion.release("start-context");
              tauriBridge.quitApp();
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
              <line x1="12" y1="2" x2="12" y2="12" />
            </svg>
            <span>Exit Glace</span>
          </button>
        </div>
      )}
    </div>
  );
};
