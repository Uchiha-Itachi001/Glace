import { useState, useEffect, useMemo, useCallback } from "react";
import { DockAppItem, PinnedApp, WindowInfo } from "../types";
import { tauriBridge } from "../services/tauriBridge";

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\.exe$/i, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Dynamically computes a match confidence score between a running window and a pinned app.
 * Ensures the main browser always claims all normal browser windows unless a dedicated PWA shortcut specifically matches.
 */
function computeWindowMatchScore(
  win: WindowInfo,
  pinned: PinnedApp,
  allPinned: PinnedApp[]
): number {
  if (!win.exe && !win.title) return 0;

  const winExeNorm = normalizeName(win.exe || "");
  const winTitleNorm = normalizeName(win.title || "");
  const pinnedExeNorm = normalizeName(pinned.exe || "");
  const pinnedTitleNorm = normalizeName(pinned.title || "");

  const targetFileName = (pinned.lnk_path || "").split(/[\\/]/).pop() || "";
  const targetStemNorm = normalizeName(targetFileName);

  const isBrowserProcess = /msedge|chrome|brave|opera|vivaldi|firefox/i.test(win.exe || "");
  const isPinnedBrowser =
    /msedge|chrome|brave|opera|vivaldi|firefox/i.test(pinned.exe || "") &&
    /edge|chrome|brave|opera|vivaldi|firefox|browser/i.test(pinned.title || targetStemNorm || "");

  // 1. Check if pinned app is a specific named PWA/shortcut (e.g. Claude, DeepSeek, YouTube Music, WhatsApp)
  if (isBrowserProcess && !isPinnedBrowser) {
    if (pinnedTitleNorm && winTitleNorm) {
      if (winTitleNorm === pinnedTitleNorm) return 300;
      if (winTitleNorm.startsWith(pinnedTitleNorm) || pinnedTitleNorm.startsWith(winTitleNorm)) return 250;
      if (winTitleNorm.includes(pinnedTitleNorm) || pinnedTitleNorm.includes(winTitleNorm)) return 200;
    }
    if (
      targetStemNorm &&
      winTitleNorm &&
      (targetStemNorm.includes(winTitleNorm) || winTitleNorm.includes(targetStemNorm))
    ) {
      return 220;
    }
  }

  // 2. If this is the main pinned browser (e.g. Edge, Chrome, Brave) and the window belongs to this browser:
  if (isPinnedBrowser && winExeNorm && pinnedExeNorm && winExeNorm === pinnedExeNorm) {
    // Check if any other pinned app is a dedicated PWA matching this specific window title
    const hasDedicatedPwaMatch = allPinned.some((p) => {
      if (p.id === pinned.id) return false;
      const pTitle = normalizeName(p.title || "");
      const pTarget = normalizeName((p.lnk_path || "").split(/[\\/]/).pop() || "");
      return (
        (pTitle &&
          (winTitleNorm === pTitle ||
            winTitleNorm.startsWith(pTitle) ||
            winTitleNorm.includes(pTitle))) ||
        (pTarget && (pTarget.includes(winTitleNorm) || winTitleNorm.includes(pTarget)))
      );
    });

    if (!hasDedicatedPwaMatch) {
      return 200;
    }
    return 0;
  }

  // 3. AppUserModelID / Package Match (for PWAs and modern Windows packaged UWP apps)
  const isAumid = (pinned.lnk_path || "").includes("!");
  if (isAumid) {
    const pkgRoot = normalizeName(
      pinned.lnk_path.replace(/^shell:AppsFolder\\/i, "").split("!")[0]
    );
    if (pkgRoot) {
      if (winExeNorm && (winExeNorm.includes(pkgRoot) || pkgRoot.includes(winExeNorm))) {
        return 200;
      }
      if (winTitleNorm && (winTitleNorm.includes(pkgRoot) || pkgRoot.includes(winTitleNorm))) {
        return 180;
      }
    }
    return 0;
  }

  // 4. Standard Win32 Application Matching:
  if (winExeNorm && pinnedExeNorm) {
    if (winExeNorm === pinnedExeNorm) {
      return 200;
    }
    if (targetStemNorm && winExeNorm === targetStemNorm) {
      return 180;
    }
    return 0;
  }

  // 5. Fallback for title-only items
  if (winTitleNorm && pinnedTitleNorm) {
    if (winTitleNorm === pinnedTitleNorm) return 120;
    if (winTitleNorm.includes(pinnedTitleNorm) || pinnedTitleNorm.includes(winTitleNorm)) {
      return 40;
    }
  }

  return 0;
}

export function useApps() {
  const [pinnedApps, setPinnedApps] = useState<PinnedApp[]>([]);
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Initial fetch and subscription
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    Promise.all([tauriBridge.getPinnedApps(), tauriBridge.getOpenWindows()])
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
      const matchedWins = windows.filter((w) => {
        if (matchedHwnds.has(w.hwnd)) return false;
        const score = computeWindowMatchScore(w, pinned, pinnedApps);
        if (score < 40) return false;

        const highestScore = Math.max(
          ...pinnedApps.map((p) => computeWindowMatchScore(w, p, pinnedApps))
        );
        return score === highestScore;
      });

      if (matchedWins.length > 0) {
        matchedWins.forEach((w) => matchedHwnds.add(w.hwnd));
        const activeWin = matchedWins.find((w) => w.is_focused) || matchedWins[0];

        items.push({
          id: pinned.id,
          title: pinned.title || activeWin.title,
          exe: pinned.exe || activeWin.exe,
          icon_b64: pinned.icon_b64 || activeWin.icon_b64,
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

    // 2. Process remaining unpinned running windows (group by exe/title)
    const remainingWins = windows.filter((w) => !matchedHwnds.has(w.hwnd));
    const groupedByExe = new Map<string, WindowInfo[]>();

    for (const win of remainingWins) {
      const key = (win.exe || win.title || `hwnd-${win.hwnd}`).toLowerCase();
      const list = groupedByExe.get(key) || [];
      list.push(win);
      groupedByExe.set(key, list);
    }

    for (const [groupKey, wins] of groupedByExe.entries()) {
      const activeWin = wins.find((w) => w.is_focused) || wins[0];
      const id = `running-${groupKey}`;

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
      // If the app has multiple windows open, cycle between them or bring the next to front
      if (item.windows && item.windows.length > 1) {
        const focusedIdx = item.windows.findIndex((w) => w.is_focused);
        if (focusedIdx !== -1) {
          const nextIdx = (focusedIdx + 1) % item.windows.length;
          tauriBridge.focusWindow(item.windows[nextIdx].hwnd);
        } else {
          tauriBridge.focusWindow(item.hwnd);
        }
      } else if (item.is_focused && !item.is_minimized) {
        tauriBridge.minimizeWindow(item.hwnd);
      } else {
        tauriBridge.focusWindow(item.hwnd);
      }
    } else {
      // Only launch a new instance when the app is completely closed
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
        if (
          prev.some(
            (p) =>
              p.id === toPin.id ||
              (toPin.exe && p.exe.toLowerCase() === toPin.exe.toLowerCase())
          )
        ) {
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
