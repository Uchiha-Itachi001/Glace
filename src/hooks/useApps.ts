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

  // Construct unified dock items with multi-window grouping
  const dockApps = useMemo<DockAppItem[]>(() => {
    const items: DockAppItem[] = [];
    const matchedHwnds = new Set<number>();

    // 1. Process all pinned apps in order
    for (const pinned of pinnedApps) {
      // Find ALL matching running windows for this pinned app
      const matchedWins = windows.filter(
        (w) => !matchedHwnds.has(w.hwnd) && doesWindowMatchPinned(w, pinned)
      );

      if (matchedWins.length > 0) {
        matchedWins.forEach((w) => matchedHwnds.add(w.hwnd));
        const activeWin = matchedWins.find((w) => w.is_focused) || matchedWins[0];

        items.push({
          id: pinned.id,
          title: activeWin.title || pinned.title,
          exe: activeWin.exe || pinned.exe,
          icon_b64: activeWin.icon_b64 || pinned.icon_b64,
          is_pinned: true,
          is_running: true,
          is_focused: matchedWins.some((w) => w.is_focused),
          is_minimized: matchedWins.every((w) => w.is_minimized),
          hwnd: activeWin.hwnd,
          lnk_path: pinned.lnk_path,
          windows: matchedWins,
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
          windows: [],
        });
      }
    }

    // 2. Process remaining running windows (group by exe/title)
    const remainingWins = windows.filter((w) => !matchedHwnds.has(w.hwnd));
    const groupedByExe = new Map<string, WindowInfo[]>();

    for (const win of remainingWins) {
      const key = (win.exe || win.title || `hwnd-${win.hwnd}`).toLowerCase();
      const list = groupedByExe.get(key) || [];
      list.push(win);
      groupedByExe.set(key, list);
    }

    for (const wins of groupedByExe.values()) {
      const activeWin = wins.find((w) => w.is_focused) || wins[0];
      const id = `running-${activeWin.hwnd}`;

      items.push({
        id,
        title: activeWin.title,
        exe: activeWin.exe,
        icon_b64: activeWin.icon_b64,
        is_pinned: false,
        is_running: true,
        is_focused: wins.some((w) => w.is_focused),
        is_minimized: wins.every((w) => w.is_minimized),
        hwnd: activeWin.hwnd,
        windows: wins,
      });
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
