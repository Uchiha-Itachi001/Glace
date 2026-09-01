import React, { useMemo, useState, useEffect } from "react";
import { WindowInfo } from "../../types";
import { tauriBridge } from "../../services/tauriBridge";

interface WindowPreviewCardProps {
  win: WindowInfo;
  onFocus: (hwnd: number) => void;
  onClose: (hwnd: number) => void;
}

// Persistent In-Memory Map Cache: stores window snapshots until the window/app is closed or terminated
class PersistentWindowThumbnailCache {
  private store = new Map<number, string>();

  get(hwnd: number): string | null {
    return this.store.get(hwnd) ?? null;
  }

  set(hwnd: number, data: string): void {
    if (!hwnd || !data) return;
    this.store.set(hwnd, data);
  }

  has(hwnd: number): boolean {
    return this.store.has(hwnd);
  }

  delete(hwnd: number): void {
    this.store.delete(hwnd);
  }

  prune(activeHwnds: Iterable<number>): void {
    const activeSet = new Set(activeHwnds);
    for (const hwnd of this.store.keys()) {
      if (!activeSet.has(hwnd)) {
        this.store.delete(hwnd);
      }
    }
  }

  clear(): void {
    this.store.clear();
  }
}

export const windowThumbnailCache = new PersistentWindowThumbnailCache();

export const WindowPreviewCard: React.FC<WindowPreviewCardProps> = ({
  win,
  onFocus,
  onClose,
}) => {
  // Initialize with cached snapshot for 0ms instant display without gray flash
  const [liveThumb, setLiveThumb] = useState<string | null>(() => {
    return win.hwnd ? windowThumbnailCache.get(win.hwnd) : null;
  });

  useEffect(() => {
    let isMounted = true;
    if (win.hwnd) {
      const cached = windowThumbnailCache.get(win.hwnd);
      if (cached && !liveThumb) {
        setLiveThumb(cached);
      }

      tauriBridge.getWindowThumbnail(win.hwnd).then((thumb) => {
        if (thumb) {
          windowThumbnailCache.set(win.hwnd, thumb);
          if (isMounted) setLiveThumb(thumb);
        } else {
          // If window is minimized or inactive, retain the last known snapshot
          const existing = windowThumbnailCache.get(win.hwnd);
          if (existing && isMounted) {
            setLiveThumb(existing);
          }
        }
      }).catch(() => {});
    }

    return () => {
      isMounted = false;
    };
  }, [win.hwnd]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFocus(win.hwnd);
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (win.hwnd) {
      windowThumbnailCache.delete(win.hwnd);
    }
    onClose(win.hwnd);
  };

  // Detect window category for tailored miniature fallback viewport styling
  const { appType, cleanUrl, accentHue } = useMemo(() => {
    const title = (win.title || "").toLowerCase();
    const exe = (win.exe || "").toLowerCase();

    if (/msedge|chrome|brave|opera|vivaldi|firefox|arc|zen|floorp|waterfox/i.test(exe) || /edge|chrome|brave|firefox|opera|browser/i.test(title)) {
      let url = "https://";
      if (title.includes("youtube")) url = "youtube.com";
      else if (title.includes("github")) url = "github.com";
      else if (title.includes("google")) url = "google.com";
      else if (title.includes("pinterest")) url = "pinterest.com";
      else if (title.includes("reddit")) url = "reddit.com";
      else if (title.includes("chatgpt") || title.includes("openai")) url = "chatgpt.com";
      else url = "web.browser/tab";
      return { appType: "browser" as const, cleanUrl: url, accentHue: "#0078d4" };
    }

    if (/code|cursor|windsurf|terminal|powershell|cmd|devenv|vsim|bash|nvim/i.test(exe) || /visual studio|code|terminal|powershell|cmd|\.ts|\.rs|\.js|\.py|\.tsx/i.test(title)) {
      return { appType: "code" as const, cleanUrl: "workspace.ts", accentHue: "#38bdf8" };
    }

    if (/explorer/i.test(exe) || /file explorer|this pc|downloads|documents|desktop/i.test(title)) {
      return { appType: "explorer" as const, cleanUrl: "C:\\Windows\\System32", accentHue: "#f59e0b" };
    }

    if (/spotify|vlc|music|media|netflix|disney/i.test(title) || /spotify|vlc/i.test(exe)) {
      return { appType: "media" as const, cleanUrl: "Now Playing", accentHue: "#10b981" };
    }

    return { appType: "general" as const, cleanUrl: win.title || "Application", accentHue: "#a855f7" };
  }, [win.title, win.exe]);

  return (
    <div
      className={`fluent-window-card ${
        win.is_focused ? "fluent-window-card--focused" : ""
      } ${win.is_minimized ? "fluent-window-card--minimized" : ""}`}
      onClick={handleClick}
      title={win.title}
    >
      {/* 1. Header Bar: App Icon, Window Title & Close Button */}
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

      {/* 2. Live Window Screen Thumbnail Viewport */}
      <div className={`fluent-screen-viewport ${liveThumb ? "fluent-screen-viewport--live" : `fluent-screen-viewport--${appType}`}`}>
        {liveThumb ? (
          <div className="mini-live-screen-container">
            <img src={liveThumb} alt="" className="mini-live-screen-img" draggable={false} />
            <div className="mini-canvas-overlay">
              <span className="mini-switch-pill">
                {win.is_focused ? "Active Window" : win.is_minimized ? "Restore Window" : "Switch Window"}
              </span>
            </div>
          </div>
        ) : (
          <>
            {/* Mini Window Titlebar / Chrome */}
            <div className="mini-window-titlebar">
              <div className="mini-window-dots">
                <span className="mini-dot mini-dot--close" />
                <span className="mini-dot mini-dot--min" />
                <span className="mini-dot mini-dot--max" />
              </div>

              <div className="mini-address-pill">
                <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect width="18" height="11" x="3" y="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span className="mini-address-text">{cleanUrl}</span>
              </div>
            </div>

            {/* Mini Screen Canvas Content */}
            <div className="mini-screen-canvas">
              {/* Subtle Ambient Radial Glow */}
              <div
                className="mini-canvas-glow"
                style={{ background: `radial-gradient(circle at center, ${accentHue}28 0%, transparent 70%)` }}
              />

              {appType === "browser" && (
                <div className="mini-browser-layout">
                  <div className="mini-browser-hero">
                    <div className="mini-hero-line mini-hero-line--long" />
                    <div className="mini-hero-line mini-hero-line--short" />
                  </div>
                  <div className="mini-browser-cards">
                    <div className="mini-wire-card" />
                    <div className="mini-wire-card" />
                    <div className="mini-wire-card" />
                  </div>
                </div>
              )}

              {appType === "code" && (
                <div className="mini-code-layout">
                  <div className="mini-code-line"><span className="mini-code-kw">import</span> <span className="mini-code-var">&#123; app &#125;</span></div>
                  <div className="mini-code-line"><span className="mini-code-fn">export</span> <span className="mini-code-kw">const</span> view = () =&gt; &#123;</div>
                  <div className="mini-code-line mini-code-line--indent"><span className="mini-code-var">render</span>(<span className="mini-code-str">&quot;glace&quot;</span>);</div>
                  <div className="mini-code-line">&#125;</div>
                </div>
              )}

              {appType === "explorer" && (
                <div className="mini-explorer-layout">
                  <div className="mini-explorer-sidebar">
                    <div className="mini-tree-item" />
                    <div className="mini-tree-item" />
                    <div className="mini-tree-item" />
                  </div>
                  <div className="mini-explorer-files">
                    <div className="mini-file-chip" />
                    <div className="mini-file-chip" />
                    <div className="mini-file-chip" />
                    <div className="mini-file-chip" />
                  </div>
                </div>
              )}

              {(appType === "general" || appType === "media") && (
                <div className="mini-general-layout">
                  <div className="mini-general-hero" />
                  <div className="mini-general-bars">
                    <div className="mini-gen-bar" style={{ width: "85%" }} />
                    <div className="mini-gen-bar" style={{ width: "60%" }} />
                    <div className="mini-gen-bar" style={{ width: "75%" }} />
                  </div>
                </div>
              )}

              {/* Centered Glowing App Brand Watermark */}
              {win.icon_b64 && (
                <div className="mini-canvas-watermark">
                  <img src={win.icon_b64} alt="" className="mini-watermark-img" draggable={false} />
                </div>
              )}

              {/* Hover Status Badge */}
              <div className="mini-canvas-overlay">
                <span className="mini-switch-pill">
                  {win.is_focused ? "Active Window" : win.is_minimized ? "Restore Window" : "Switch Window"}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
