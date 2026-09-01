import { useState, useEffect } from "react";
import { WindowInfo } from "../types";
import { tauriBridge } from "../services/tauriBridge";
import { windowThumbnailCache } from "../components/shared/WindowPreviewCard";

export function useWindows() {
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    // Initial fetch
    tauriBridge
      .getOpenWindows()
      .then((initialWindows) => {
        setWindows(initialWindows);
        windowThumbnailCache.prune(initialWindows.map((w) => w.hwnd));
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to get initial open windows:", err);
        setLoading(false);
      });

    // Real-time hook stream
    tauriBridge
      .onWindowsUpdated((updatedWindows) => {
        setWindows(updatedWindows);
        windowThumbnailCache.prune(updatedWindows.map((w) => w.hwnd));
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((err) => {
        console.error("Failed to subscribe to windows-updated:", err);
      });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const focusWindow = (hwnd: number) => {
    tauriBridge.focusWindow(hwnd);
  };

  const minimizeWindow = (hwnd: number) => {
    tauriBridge.minimizeWindow(hwnd);
  };

  const closeWindow = (hwnd: number) => {
    tauriBridge.closeWindow(hwnd);
  };

  return {
    windows,
    loading,
    focusWindow,
    minimizeWindow,
    closeWindow,
  };
}
