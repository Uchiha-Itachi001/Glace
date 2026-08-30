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

function isRegularBrowserWindow(win: WindowInfo): boolean {
  const exe = (win.exe || "").toLowerCase();
  const isBrowser = /msedge|chrome|brave|opera|vivaldi|firefox/i.test(exe);
  if (!isBrowser) return false;

  const title = (win.title || "").trim();
  if (!title) return true; // Blank new windows belong to the browser

  const titleLower = title.toLowerCase();

  // 1. Edge: Any window containing "edge" (e.g. "... - Microsoft Edge", "... - Edge", "InPrivate", "New Tab")
  if (/msedge|edge/i.test(exe)) {
    return (
      titleLower.includes("edge") ||
      titleLower === "new tab" ||
      titleLower.startsWith("inprivate")
    );
  }

  // 2. Chrome: Any window containing "chrome"
  if (/chrome/i.test(exe)) {
    return (
      titleLower.includes("chrome") ||
      titleLower === "new tab" ||
      titleLower.startsWith("incognito")
    );
  }

  // 3. Brave
  if (/brave/i.test(exe)) {
    return titleLower.includes("brave") || titleLower === "new tab";
  }

  // 4. Firefox
  if (/firefox/i.test(exe)) {
    return titleLower.includes("firefox") || titleLower.includes("mozilla") || titleLower === "new tab";
  }

  // 5. Opera
  if (/opera/i.test(exe)) {
    return titleLower.includes("opera") || titleLower === "new tab";
  }

  // 6. Vivaldi
  if (/vivaldi/i.test(exe)) {
    return titleLower.includes("vivaldi") || titleLower === "new tab";
  }

  return false;
}

export function getCleanAppTitle(rawTitle: string): string {
  let title = rawTitle.trim();
  // Strip profile suffixes e.g. " - Person 1", " - Profile 1", " - Default", " - Work", " - Personal"
  title = title.replace(/\s*-\s*(Person\s*\d+|Profile\s*\d+|Default|Personal|Work)$/i, "");
  // Strip browser suffixes
  title = title.replace(/\s*-\s*(Google Chrome|Microsoft Edge|Brave|Mozilla Firefox|Opera|Vivaldi|Edge)$/i, "");
  return title.trim() || rawTitle;
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
  const cleanWinTitleNorm = normalizeName(getCleanAppTitle(win.title || ""));
  const pinnedExeNorm = normalizeName(pinned.exe || "");
  const pinnedTitleNorm = normalizeName(pinned.title || "");

  const targetFileName = (pinned.lnk_path || "").split(/[\\/]/).pop() || "";
  const targetStemNorm = normalizeName(targetFileName);

  const isBrowserProcess = /msedge|chrome|brave|opera|vivaldi|firefox/i.test(win.exe || "");
  const isPinnedBrowser =
    /msedge|chrome|brave|opera|vivaldi|firefox/i.test(pinned.exe || "") &&
    /edge|chrome|brave|opera|vivaldi|firefox|browser/i.test(pinned.title || targetStemNorm || "");

  const isPwa = isBrowserProcess && !isRegularBrowserWindow(win);

  // 1. Check if pinned app is a specific named PWA/shortcut (e.g. Instagram, Claude, WhatsApp, YouTube)
  if (isBrowserProcess && !isPinnedBrowser) {
    if (pinnedTitleNorm && (winTitleNorm || cleanWinTitleNorm)) {
      if (cleanWinTitleNorm === pinnedTitleNorm || winTitleNorm === pinnedTitleNorm) return 300;
      if (
        cleanWinTitleNorm.startsWith(pinnedTitleNorm) ||
        pinnedTitleNorm.startsWith(cleanWinTitleNorm) ||
        winTitleNorm.startsWith(pinnedTitleNorm)
      ) {
        return 250;
      }
      if (
        cleanWinTitleNorm.includes(pinnedTitleNorm) ||
        pinnedTitleNorm.includes(cleanWinTitleNorm)
      ) {
        return 200;
      }
    }
    if (
      targetStemNorm &&
      (cleanWinTitleNorm.includes(targetStemNorm) || targetStemNorm.includes(cleanWinTitleNorm))
    ) {
      return 220;
    }
  }

  // 2. If this is the main pinned browser (e.g. Edge, Chrome, Brave):
  if (isPinnedBrowser && winExeNorm && pinnedExeNorm && winExeNorm === pinnedExeNorm) {
    // If the window is a dedicated PWA / Web App (e.g. Instagram - Person 1), do NOT claim it under the browser!
    if (isPwa) {
      return 0;
    }

    // Regular browser window: check if any other pinned app claims it
    const hasDedicatedPwaMatch = allPinned.some((p) => {
      if (p.id === pinned.id) return false;
      const pTitle = normalizeName(p.title || "");
      const pTarget = normalizeName((p.lnk_path || "").split(/[\\/]/).pop() || "");
      return (
        (pTitle &&
          (winTitleNorm === pTitle ||
            cleanWinTitleNorm === pTitle ||
            winTitleNorm.startsWith(pTitle) ||
            cleanWinTitleNorm.startsWith(pTitle))) ||
        (pTarget && (pTarget.includes(cleanWinTitleNorm) || cleanWinTitleNorm.includes(pTarget)))
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
    if (winTitleNorm === pinnedTitleNorm || cleanWinTitleNorm === pinnedTitleNorm) return 120;
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
          title: pinned.title || getCleanAppTitle(activeWin.title),
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

    // 2. Process remaining unpinned running windows (group standalone PWAs separately from browsers)
    const remainingWins = windows.filter((w) => !matchedHwnds.has(w.hwnd));
    const groupedApps = new Map<string, WindowInfo[]>();

    for (const win of remainingWins) {
      const isBrowser = /msedge|chrome|brave|opera|vivaldi|firefox/i.test(win.exe || "");
      let groupKey: string;

      if (isBrowser && !isRegularBrowserWindow(win)) {
        // Standalone Web App / PWA: group by its clean app title (e.g. "Instagram", "WhatsApp")
        const cleanTitle = getCleanAppTitle(win.title || "Web App");
        groupKey = `pwa-${win.exe}-${cleanTitle}`.toLowerCase();
      } else {
        groupKey = (win.exe || win.title || `hwnd-${win.hwnd}`).toLowerCase();
      }

      const list = groupedApps.get(groupKey) || [];
      list.push(win);
      groupedApps.set(groupKey, list);
    }

    for (const [groupKey, wins] of groupedApps.entries()) {
      const activeWin = wins.find((w) => w.is_focused) || wins[0];
      const isBrowser = /msedge|chrome|brave|opera|vivaldi|firefox/i.test(activeWin.exe || "");
      const isPwa = isBrowser && !isRegularBrowserWindow(activeWin);

      const title = isPwa ? getCleanAppTitle(activeWin.title) : activeWin.title;
      const id = `running-${groupKey}`;

      items.push({
        id,
        title,
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
