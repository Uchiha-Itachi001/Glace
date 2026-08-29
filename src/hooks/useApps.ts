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

export function isPwaWindow(win: WindowInfo): boolean {
  const exe = (win.exe || "").toLowerCase();
  const isBrowser = /msedge|chrome|brave|opera|vivaldi/i.test(exe);
  if (!isBrowser) return false;

  const titleNorm = normalizeName(win.title || "");
  if (!titleNorm) return false;

  // Standard browser windows always contain the browser branding in their title (e.g. "microsoftedge", "edge", "googlechrome", "chrome", "brave", "opera", "vivaldi")
  if (exe.includes("msedge") && (titleNorm.includes("microsoftedge") || titleNorm.includes("edge"))) {
    return false;
  }
  if (exe.includes("chrome") && (titleNorm.includes("googlechrome") || titleNorm.includes("chrome"))) {
    return false;
  }
  if (exe.includes("brave") && titleNorm.includes("brave")) {
    return false;
  }
  if (exe.includes("opera") && titleNorm.includes("opera")) {
    return false;
  }
  if (exe.includes("vivaldi") && titleNorm.includes("vivaldi")) {
    return false;
  }

  // Standalone installed PWA / Web App windows (Manus, Claude, DeepSeek, YouTube Music, WhatsApp, etc.) have no browser branding in their title
  return true;
}

/**
 * Dynamically computes a match confidence score between a running window and a pinned app.
 * Completely automated: zero hardcoded application names.
 */
function computeWindowMatchScore(win: WindowInfo, pinned: PinnedApp): number {
  if (!win.exe && !win.title) return 0;

  const winExeNorm = normalizeName(win.exe || "");
  const winTitleNorm = normalizeName(win.title || "");
  const pinnedExeNorm = normalizeName(pinned.exe || "");
  const pinnedTitleNorm = normalizeName(pinned.title || "");
  const pinnedIdNorm = normalizeName(pinned.id || "");
  const pinnedLnkNorm = normalizeName(pinned.lnk_path || "");

  const winIsPwa = isPwaWindow(win);
  const pinnedIsBrowser =
    /msedge|chrome|brave|opera|vivaldi|firefox/i.test(pinned.exe || "") &&
    /edge|chrome|brave|opera|vivaldi|firefox|browser/i.test(pinned.title || "");

  // If this window is a PWA (e.g. Manus, Claude, DeepSeek, YouTube Music, WhatsApp, etc.):
  if (winIsPwa) {
    // 1. Generic browser pinned app should NEVER claim a standalone PWA window!
    if (pinnedIsBrowser) {
      return 0;
    }

    // 2. Direct or substring match on PWA name gets top priority
    if (pinnedTitleNorm && winTitleNorm) {
      if (winTitleNorm === pinnedTitleNorm) return 300;
      if (winTitleNorm.startsWith(pinnedTitleNorm) || pinnedTitleNorm.startsWith(winTitleNorm)) return 250;
      if (winTitleNorm.includes(pinnedTitleNorm) || pinnedTitleNorm.includes(winTitleNorm)) return 200;
    }

    // 3. PWA shortcut LNK path / AppUserModelID match
    if (pinnedLnkNorm && winTitleNorm && pinnedLnkNorm.includes(winTitleNorm)) {
      return 220;
    }
  }

  // If window is a standard browser window (not PWA), strongly match the pinned browser item
  if (!winIsPwa && pinnedIsBrowser) {
    if (winExeNorm && pinnedExeNorm && winExeNorm === pinnedExeNorm) {
      return 200;
    }
  }

  let score = 0;

  // 1. Direct Executable Name Match (e.g. Code.exe == Code.exe)
  if (winExeNorm && pinnedExeNorm && winExeNorm === pinnedExeNorm) {
    score += 100;
  }

  // 2. Direct ID or Lnk Path match
  if (winExeNorm && (winExeNorm === pinnedIdNorm || pinnedLnkNorm.includes(winExeNorm))) {
    score += 80;
  }

  // 3. Exact Title match
  if (winTitleNorm && pinnedTitleNorm && winTitleNorm === pinnedTitleNorm) {
    score += 120;
  }

  // 4. Substring Title Match (longer, more specific titles naturally receive higher score)
  if (winTitleNorm && pinnedTitleNorm) {
    if (winTitleNorm.includes(pinnedTitleNorm)) {
      score += 40 + pinnedTitleNorm.length;
    } else if (pinnedTitleNorm.includes(winTitleNorm) && winTitleNorm.length >= 3) {
      score += 20 + winTitleNorm.length;
    }
  }

  // 5. AppUserModelID / Package / Domain Match (for PWAs and modern Windows packaged apps)
  if (pinned.lnk_path && pinned.lnk_path.includes("!")) {
    const pkgRoot = normalizeName(
      pinned.lnk_path.replace(/^shell:AppsFolder\\/i, "").split("!")[0]
    );
    if (pkgRoot) {
      if (winTitleNorm.includes(pkgRoot) || pkgRoot.includes(winTitleNorm)) {
        score += 50 + Math.min(pkgRoot.length, 25);
      }
      if (winExeNorm.includes(pkgRoot) || pkgRoot.includes(winExeNorm)) {
        score += 60;
      }
    }
  }

  return score;
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
      // Find all running windows where this pinned app is the HIGHEST scoring match
      const matchedWins = windows.filter((w) => {
        if (matchedHwnds.has(w.hwnd)) return false;
        const score = computeWindowMatchScore(w, pinned);
        if (score < 40) return false;

        // Check if any other pinned app has a strictly higher score for this window
        const highestScore = Math.max(...pinnedApps.map((p) => computeWindowMatchScore(w, p)));
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

    // 2. Process remaining running windows (group by exe/title)
    const remainingWins = windows.filter((w) => !matchedHwnds.has(w.hwnd));
    const groupedByExe = new Map<string, WindowInfo[]>();

    for (const win of remainingWins) {
      const key = isPwaWindow(win)
        ? `pwa-${(win.title || "").toLowerCase().trim()}`
        : (win.exe || win.title || `hwnd-${win.hwnd}`).toLowerCase();
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
