import React, { useCallback, useRef, useState, useEffect, useMemo } from "react";
import { DockAppItem } from "../../types";
import { WindowContextMenu } from "./WindowContextMenu";
import { WindowPreviewCard } from "./WindowPreviewCard";
import { tauriBridge } from "../../services/tauriBridge";

interface AppIconProps {
  app: DockAppItem;
  index?: number;
  onClick: (app: DockAppItem) => void;
  onPin?: (app: DockAppItem) => void;
  onUnpin?: (id: string) => void;
  isHovered?: boolean;
  isContextMenuOpen?: boolean;
  onHoverStart?: (id: string) => void;
  onHoverEnd?: (id: string) => void;
  onOpenContextMenu?: (id: string) => void;
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
    onHoverStart,
    onHoverEnd,
    onOpenContextMenu,
    onCloseContextMenu,
  }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [previewStyle, setPreviewStyle] = useState<React.CSSProperties>({});

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

    const sortedWindows = useMemo(() => {
      if (!hasMultipleWindows) return windowList;
      const focusedWin = windowList.find((w) => w.is_focused);
      if (!focusedWin) return windowList;
      return [focusedWin, ...windowList.filter((w) => w.hwnd !== focusedWin.hwnd)];
    }, [windowList, hasMultipleWindows]);

    // Viewport Boundary Clamping & Anti-Cutout Calculation
    useEffect(() => {
      if (isHovered && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const screenW = window.innerWidth || document.documentElement.clientWidth;

        const cardCount = windowList.length > 0 ? windowList.length : 1;
        const estimatedCardW = 200;
        const totalEstimatedW = hasMultipleWindows
          ? Math.min(cardCount * (estimatedCardW + 8) + 16, screenW - 32)
          : Math.min(220, screenW - 32);

        const iconCenterX = rect.left + rect.width / 2;
        const idealLeft = iconCenterX - totalEstimatedW / 2;

        // Clamp between 16px from left screen edge and (screenW - totalEstimatedW - 16px) from right screen edge
        const clampedLeft = Math.max(16, Math.min(idealLeft, screenW - totalEstimatedW - 16));
        const relativeLeft = clampedLeft - rect.left;

        setPreviewStyle({
          left: `${relativeLeft}px`,
          transform: "none",
          maxWidth: `calc(100vw - 32px)`,
        });
      } else {
        setPreviewStyle({});
      }
    }, [isHovered, windowList.length, hasMultipleWindows]);

    const handleMouseEnter = useCallback(() => {
      if (onHoverStart) onHoverStart(app.id);
    }, [onHoverStart, app.id]);

    const handleMouseLeave = useCallback(() => {
      if (onHoverEnd) onHoverEnd(app.id);
    }, [onHoverEnd, app.id]);

    const handleClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onClick(app);
      },
      [onClick, app]
    );

    const handleWindowCardClick = useCallback((hwnd: number) => {
      tauriBridge.focusWindow(hwnd).catch(console.error);
    }, []);

    const handleCloseWindow = useCallback((hwnd: number) => {
      tauriBridge.closeWindow(hwnd).catch(console.error);
    }, []);

    const handleContextMenu = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (onOpenContextMenu) {
          onOpenContextMenu(app.id);
        }
      },
      [onOpenContextMenu, app.id]
    );

    return (
      <div
        ref={containerRef}
        className={`app-icon-container ${app.is_focused ? "app-icon--focused" : ""} ${
          app.is_minimized ? "app-icon--minimized" : ""
        } ${!app.is_running ? "app-icon--idle" : "app-icon--running"} ${
          hasMultipleWindows ? "app-icon--has-multiple" : ""
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

          {/* Clean Modern Multi-Window Badge */}
          {hasMultipleWindows && (
            <div className="app-icon-multi-badge" title={`${windowList.length} open windows`}>
              {windowList.length}
            </div>
          )}
        </div>

        {/* Single Clean Focus & Running Indicator Pill */}
        {app.is_focused ? (
          <div className="active-indicator" />
        ) : app.is_running ? (
          <div className="open-indicator" />
        ) : null}

        {/* Hover Window Previews & Tooltips with Anti-Cutoff Clamping */}
        {isHovered && !isContextMenuOpen && (
          <div
            className="fluent-dock-preview-container"
            style={previewStyle}
            onClick={(e) => e.stopPropagation()}
          >
            {hasMultipleWindows ? (
              <div className="fluent-window-cards-row">
                {sortedWindows.map((win) => (
                  <WindowPreviewCard
                    key={win.hwnd}
                    win={win}
                    onFocus={handleWindowCardClick}
                    onClose={handleCloseWindow}
                  />
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
