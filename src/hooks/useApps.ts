import { useState, useEffect, useMemo, useCallback } from "react";
import { DockAppItem, PinnedApp, WindowInfo } from "../types";
import { tauriBridge } from "../services/tauriBridge";

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.exe$/i, "")
    .replace(/[^a-z0-9]/g, "");
}

function doesWindowMatchPinned(win: WindowInfo, pinned: PinnedApp): boolean {
  if (!win.exe && !win.title) return false;

  const winExeNorm = normalizeName(win.exe || "");
  const pinnedExeNorm = normalizeName(pinned.exe || "");
  const pinnedIdNorm = normalizeName(pinned.id || "");
  const pinnedTitleNorm = normalizeName(pinned.title || "");

  // 1. Direct exe name match (e.g. chrome.exe == chrome.exe)
  if (winExeNorm && pinnedExeNorm && winExeNorm === pinnedExeNorm) {
    return true;
  }

  // 2. ID match (e.g. google-chrome == googlechrome)
  if (winExeNorm && pinnedIdNorm && (winExeNorm === pinnedIdNorm || pinnedIdNorm.includes(winExeNorm) || winExeNorm.includes(pinnedIdNorm))) {
    return true;
  }

  // 3. Title/Exe crossover (e.g. "Visual Studio Code" and "Code.exe")
  if (winExeNorm && pinnedTitleNorm && (pinnedTitleNorm.includes(winExeNorm) || winExeNorm.includes(pinnedTitleNorm))) {
    return true;
  }

  // 4. Special cases
  if (winExeNorm === "code" && pinnedTitleNorm.includes("code")) return true;
  if (winExeNorm === "codeinsiders" && pinnedTitleNorm.includes("insiders")) return true;
  if (winExeNorm === "msedge" && pinnedTitleNorm.includes("edge")) return true;
  if (winExeNorm === "windowsterminal" && (pinnedTitleNorm.includes("terminal") || pinnedExeNorm.includes("wt"))) return true;
  if (winExeNorm === "explorer" && (pinnedTitleNorm.includes("explorer") || pinnedTitleNorm.includes("files"))) return true;
  if (winExeNorm === "studio64" && pinnedTitleNorm.includes("android")) return true;

  return false;
}

export function useApps() {
  const [pinnedApps, setPinnedApps] = useState<PinnedApp[]>([]);
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Initial fetch and subscription
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    Promise.all([
      tauriBridge.getPinnedApps(),
      tauriBridge.getOpenWindows(),
    ])
      .then(([pinned, wins]) => {
        setPinnedApps(pinned);
        setWindows(wins);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to initialize apps & windows:", err);
        setLoading(false);
      });

    tauriBridge
      .onWindowsUpdated((updatedWindows) => {
        setWindows(updatedWindows);
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((err) => {
        console.error("Failed to subscribe to windows-updated:", err);
      });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Construct unified dock items
  const dockApps = useMemo<DockAppItem[]>(() => {
    const items: DockAppItem[] = [];
    const matchedHwnds = new Set<number>();

    // 1. Process all pinned apps in order
    for (const pinned of pinnedApps) {
      // Find matching running window
      const matchedWin = windows.find(
        (w) => !matchedHwnds.has(w.hwnd) && doesWindowMatchPinned(w, pinned)
      );

      if (matchedWin) {
        matchedHwnds.add(matchedWin.hwnd);
        items.push({
          id: pinned.id,
          title: matchedWin.title || pinned.title,
          exe: matchedWin.exe || pinned.exe,
          icon_b64: matchedWin.icon_b64 || pinned.icon_b64,
          is_pinned: true,
          is_running: true,
          is_focused: matchedWin.is_focused,
          is_minimized: matchedWin.is_minimized,
          hwnd: matchedWin.hwnd,
          lnk_path: pinned.lnk_path,
        });
      } else {
        items.push({
          id: pinned.id,
          title: pinned.title,
          exe: pinned.exe,
          icon_b64: pinned.icon_b64,
          is_pinned: true,
          is_running: false,
          is_focused: false,
          is_minimized: false,
          lnk_path: pinned.lnk_path,
        });
      }
    }

    // 2. Process remaining running windows (new/unpinned open apps)
    for (const win of windows) {
      if (!matchedHwnds.has(win.hwnd)) {
        const id = `running-${win.hwnd}`;
        items.push({
          id,
          title: win.title,
          exe: win.exe,
          icon_b64: win.icon_b64,
          is_pinned: false,
          is_running: true,
          is_focused: win.is_focused,
          is_minimized: win.is_minimized,
          hwnd: win.hwnd,
        });
      }
    }

    return items;
  }, [pinnedApps, windows]);

  const launchOrFocus = useCallback((item: DockAppItem) => {
    if (item.is_running && item.hwnd !== undefined) {
      if (item.is_focused && !item.is_minimized) {
        tauriBridge.minimizeWindow(item.hwnd);
      } else {
        tauriBridge.focusWindow(item.hwnd);
      }
    } else {
      // Launch closed app
      const cmd = item.lnk_path || item.exe || item.title;
      tauriBridge.launchApp(cmd);
    }
  }, []);

  const focusWindow = useCallback((hwnd: number) => {
    tauriBridge.focusWindow(hwnd);
  }, []);

  const minimizeWindow = useCallback((hwnd: number) => {
    tauriBridge.minimizeWindow(hwnd);
  }, []);

  const closeWindow = useCallback((hwnd: number) => {
    tauriBridge.closeWindow(hwnd);
  }, []);

  const pinApp = useCallback((app: PinnedApp | DockAppItem) => {
    const toPin: PinnedApp = {
      id: app.id.replace(/^running-/, ""),
      title: app.title,
      exe: app.exe,
      lnk_path: (app as DockAppItem).lnk_path || "",
      icon_b64: app.icon_b64,
    };

    tauriBridge.pinApp(toPin).then(() => {
      setPinnedApps((prev) => {
        if (prev.some((p) => p.id === toPin.id || (toPin.exe && p.exe.toLowerCase() === toPin.exe.toLowerCase()))) {
          return prev;
        }
        return [...prev, toPin];
      });
    });
  }, []);

  const unpinApp = useCallback((id: string) => {
    tauriBridge.unpinApp(id).then(() => {
      setPinnedApps((prev) => prev.filter((p) => p.id !== id && !id.includes(p.id)));
    });
  }, []);

  return {
    dockApps,
    pinnedApps,
    windows,
    loading,
    launchOrFocus,
    focusWindow,
    minimizeWindow,
    closeWindow,
    pinApp,
    unpinApp,
  };
}
