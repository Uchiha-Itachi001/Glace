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

export const BROWSER_EXE_REGEX =
  /msedge|chrome|brave|opera|vivaldi|firefox|arc|zen|thorium|waterfox|librewolf|floorp|chromium|yandex|duckduckgo|tor/i;

export const BROWSER_SUFFIX_REGEX =
  /\s*-\s*(Google Chrome|Microsoft Edge|Brave|Mozilla Firefox|Firefox|Opera|Opera GX|Vivaldi|Arc|Zen Browser|Zen|Thorium|Waterfox|LibreWolf|Floorp|Chromium|Yandex|DuckDuckGo|Tor Browser|Edge)$/i;

function isRegularBrowserWindow(win: WindowInfo): boolean {
  const exe = (win.exe || "").toLowerCase();
  if (!BROWSER_EXE_REGEX.test(exe)) return false;

  const title = (win.title || "").trim();
  if (!title) return true; // Blank new windows belong to the browser

  const titleLower = title.toLowerCase();

  // 1. Edge
  if (/msedge|edge/i.test(exe)) {
    return (
      titleLower.includes("edge") ||
      titleLower === "new tab" ||
      titleLower.startsWith("inprivate")
    );
  }

  // 2. Chrome
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
    return (
      titleLower.includes("firefox") ||
      titleLower.includes("mozilla") ||
      titleLower === "new tab" ||
      titleLower.includes("private browsing")
    );
  }

  // 5. Opera
  if (/opera/i.test(exe)) {
    return titleLower.includes("opera") || titleLower === "new tab";
  }

  // 6. Vivaldi
  if (/vivaldi/i.test(exe)) {
    return titleLower.includes("vivaldi") || titleLower === "new tab";
  }

  // 7. Arc
  if (/arc/i.test(exe)) {
    return titleLower.includes("arc") || titleLower === "new tab";
  }

  // 8. Zen
  if (/zen/i.test(exe)) {
    return titleLower.includes("zen") || titleLower === "new tab";
  }

  // 9. Thorium / Chromium / Yandex / Waterfox / Floorp / LibreWolf / Tor / DuckDuckGo
  if (/thorium|chromium|yandex|waterfox|floorp|librewolf|tor|duckduckgo/i.test(exe)) {
    return BROWSER_SUFFIX_REGEX.test(title) || titleLower === "new tab";
  }

  return false;
}

export function getCleanAppTitle(rawTitle: string): string {
  let title = rawTitle.trim();
  // Strip notification badges e.g. "(1) ", "[5] "
  title = title.replace(/^[\(\[]\d+\+?[\)\]]\s*/, "");
  // Strip profile suffixes e.g. " - Person 1", " - Profile 1", " - Default", " - Work", " - Personal"
  title = title.replace(/\s*-\s*(Person\s*\d+|Profile\s*\d+|Default|Personal|Work)$/i, "");
  // Strip browser suffixes
  title = title.replace(BROWSER_SUFFIX_REGEX, "");
  return title.trim() || rawTitle;
}

export const SYSTEM_FLUENT_ICONS: Record<string, string> = {
  settings: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="setGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%230086F0"/><stop offset="100%" stop-color="%23005FB8"/></linearGradient><linearGradient id="innerGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%2338BDF8"/><stop offset="100%" stop-color="%230284C7"/></linearGradient></defs><rect width="100" height="100" rx="22" fill="url(%23setGrad)"/><path fill="%23ffffff" d="M50 22c2.2 0 4 1.8 4 4v1.2c2.4 1 4.6 2.3 6.5 4l.9-.9c1.6-1.6 4.1-1.6 5.7 0l3.6 3.6c1.6 1.6 1.6 4.1 0 5.7l-.9.9c1.7 1.9 3 4.1 4 6.5h1.2c2.2 0 4 1.8 4 4v5c0 2.2-1.8 4-4 4h-1.2c-1 2.4-2.3 4.6-4 6.5l.9.9c1.6 1.6 1.6 4.1 0 5.7l-3.6 3.6c-1.6 1.6-4.1 1.6-5.7 0l-.9-.9c-1.9 1.7-4.1 3-6.5 4v1.2c0 2.2-1.8 4-4 4h-5c-2.2 0-4-1.8-4-4v-1.2c-2.4-1-4.6-2.3-6.5-4l-.9.9c-1.6 1.6-4.1 1.6-5.7 0l-3.6-3.6c-1.6-1.6-1.6-4.1 0-5.7l.9-.9c-1.7-1.9-3-4.1-4-6.5h-1.2c-2.2 0-4-1.8-4-4v-5c0-2.2 1.8-4 4-4h1.2c1-2.4 2.3-4.6 4-6.5l-.9-.9c-1.6-1.6-1.6-4.1 0-5.7l3.6-3.6c1.6-1.6 4.1-1.6 5.7 0l.9.9c1.9-1.7 4.1-3 6.5-4v-1.2c0-2.2 1.8-4 4-4h5zm-2.5 16c-8 0-14.5 6.5-14.5 14.5s6.5 14.5 14.5 14.5 14.5-6.5 14.5-14.5-6.5-14.5-14.5-14.5z"/><circle cx="47.5" cy="52.5" r="7" fill="url(%23innerGrad)"/></svg>',
  calculator: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="calcGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%230284C7"/><stop offset="100%" stop-color="%230369A1"/></linearGradient></defs><rect width="100" height="100" rx="22" fill="url(%23calcGrad)"/><rect x="24" y="20" width="52" height="18" rx="4" fill="%23082F49"/><rect x="24" y="44" width="12" height="10" rx="3" fill="%23BAE6FD"/><rect x="44" y="44" width="12" height="10" rx="3" fill="%23BAE6FD"/><rect x="64" y="44" width="12" height="10" rx="3" fill="%2338BDF8"/><rect x="24" y="58" width="12" height="10" rx="3" fill="%23BAE6FD"/><rect x="44" y="58" width="12" height="10" rx="3" fill="%23BAE6FD"/><rect x="64" y="58" width="12" height="10" rx="3" fill="%2338BDF8"/><rect x="24" y="72" width="12" height="10" rx="3" fill="%23BAE6FD"/><rect x="44" y="72" width="12" height="10" rx="3" fill="%23BAE6FD"/><rect x="64" y="72" width="12" height="10" rx="3" fill="%23F97316"/></svg>',
  terminal: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="%2318181B"/><path fill="none" stroke="%234ADE80" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" d="M30 32 L48 50 L30 68"/><line x1="56" y1="68" x2="72" y2="68" stroke="%23F4F4F5" stroke-width="8" stroke-linecap="round"/></svg>',
  taskmgr: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="tmGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23059669"/><stop offset="100%" stop-color="%23047857"/></linearGradient></defs><rect width="100" height="100" rx="22" fill="url(%23tmGrad)"/><path fill="none" stroke="%23ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" d="M20 54 L36 54 L44 30 L54 70 L62 44 L70 54 L80 54"/></svg>',
};

export function resolveAppIcon(exe?: string, title?: string, rawIcon?: string): string {
  // If Rust already extracted an authentic native image (e.g. Settings PNG from C:\Windows\ImmersiveControlPanel\images), use it directly!
  if (rawIcon && rawIcon.startsWith("data:image/png;base64,")) {
    return rawIcon;
  }

  const exeLower = (exe || "").toLowerCase();
  const titleLower = (title || "").toLowerCase();

  // 1. Windows Settings fallback
  if (exeLower.includes("systemsettings") || exeLower.includes("immersivecontrolpanel") || titleLower === "settings") {
    return rawIcon || SYSTEM_FLUENT_ICONS.settings;
  }

  // 2. Calculator fallback
  if (exeLower.includes("calculator") || titleLower === "calculator") {
    return rawIcon || SYSTEM_FLUENT_ICONS.calculator;
  }

  // 3. Windows Terminal fallback
  if (exeLower.includes("windowsterminal") || exeLower === "wt.exe" || titleLower.includes("terminal")) {
    return rawIcon || SYSTEM_FLUENT_ICONS.terminal;
  }

  // 4. Task Manager fallback
  if (exeLower.includes("taskmgr") || titleLower === "task manager") {
    return rawIcon || SYSTEM_FLUENT_ICONS.taskmgr;
  }

  return rawIcon || "";
}

/**
 * Purely dynamic PWA / Web App name extractor.
 * Parses dynamic browser page/track titles by stripping noise and splitting on standard title delimiters.
 * Works universally for ANY current or future web app without hardcoded dictionaries.
 */
export function extractWebAppName(rawTitle: string): string {
  let title = (rawTitle || "").trim();
  if (!title) return "Web App";

  // 1. Strip leading notification counters e.g. "(1) ", "[5] ", "(99+) "
  title = title.replace(/^[\(\[]\d+\+?[\)\]]\s*/, "");

  // 2. Strip browser profile suffixes e.g. " - Person 1", " - Profile 1", " - Default", " - Work", " - Personal"
  title = title.replace(/\s*-\s*(Person\s*\d+|Profile\s*\d+|Default|Personal|Work)$/i, "");

  // 3. Strip browser name suffixes e.g. " - Google Chrome", " - Microsoft Edge", " - Brave"
  title = title.replace(/\s*-\s*(Google Chrome|Microsoft Edge|Brave|Mozilla Firefox|Opera|Vivaldi|Edge)$/i, "");
  title = title.trim();

  // 4. Dynamic Delimiter Parsing:
  // Pattern A: "Page/Track Name | App Name" (e.g. "YouTube Music - Song Title | YouTube Music", "Issue 42 | Linear", "Design | Figma")
  if (title.includes(" | ")) {
    const parts = title.split(" | ").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const candidate = parts[parts.length - 1];
      if (candidate.length <= 40) return candidate;
    }
  }

  // Pattern B: "Track/Page Title - App Name" (e.g. "Pavazha Malli - YouTube Music", "Inbox - Gmail", "General - Discord")
  if (title.includes(" - ")) {
    const parts = title.split(" - ").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const candidate = parts[parts.length - 1];
      if (candidate.length <= 40) return candidate;
    }
  }

  // Pattern C: "AppName: Page Title" (e.g. "WhatsApp: New Message", "Slack: channel")
  if (title.includes(": ")) {
    const parts = title.split(": ").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const candidate = parts[0];
      if (candidate.length <= 40) return candidate;
    }
  }

  return title || "Web App";
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

  // If this window is a PWA / standalone Web App (e.g. YouTube Music, WhatsApp, Claude)
  if (isBrowserProcess && isPwa) {
    // If pinned item is the generic browser (e.g. Edge / Chrome / Brave), DO NOT capture the PWA!
    if (isPinnedBrowser) {
      return 0;
    }

    const winAppName = extractWebAppName(win.title || "");
    const winAppNameNorm = normalizeName(winAppName);

    // Exact Web App Match (e.g. Pinned "YouTube Music" vs Window "YouTube Music")
    if (pinnedTitleNorm === winAppNameNorm || targetStemNorm === winAppNameNorm) {
      return 350;
    }

    // Guard against cross-app false collision (e.g. Pinned "YouTube" capturing "YouTube Music" window):
    if (pinnedTitleNorm === "youtube" && winAppNameNorm.includes("youtubemusic")) {
      return 0;
    }
    if (pinnedTitleNorm.includes("youtubemusic") && winAppNameNorm === "youtube") {
      return 0;
    }
    if (pinnedTitleNorm === "googledrive" && winAppNameNorm.includes("googledocs")) {
      return 0;
    }
    if (pinnedTitleNorm === "googledocs" && winAppNameNorm.includes("googledrive")) {
      return 0;
    }

    // Partial prefix match ONLY if the web app name is not an entirely different app
    if (pinnedTitleNorm && winAppNameNorm) {
      if (winAppNameNorm.startsWith(pinnedTitleNorm) || pinnedTitleNorm.startsWith(winAppNameNorm)) {
        return 280;
      }
      if (cleanWinTitleNorm === pinnedTitleNorm || winTitleNorm === pinnedTitleNorm) {
        return 250;
      }
      if (cleanWinTitleNorm.includes(pinnedTitleNorm) || pinnedTitleNorm.includes(cleanWinTitleNorm)) {
        return 180;
      }
    }

    if (targetStemNorm && (winAppNameNorm.includes(targetStemNorm) || targetStemNorm.includes(winAppNameNorm))) {
      return 220;
    }
  }

  // 1. Non-PWA browser process matching against specific pinned shortcut
  if (isBrowserProcess && !isPinnedBrowser && !isPwa) {
    if (pinnedTitleNorm && (winTitleNorm || cleanWinTitleNorm)) {
      if (cleanWinTitleNorm === pinnedTitleNorm || winTitleNorm === pinnedTitleNorm) return 300;
    }
  }

  // 2. If this is the main pinned browser (e.g. Edge, Chrome, Brave):
  if (isPinnedBrowser && winExeNorm && pinnedExeNorm && winExeNorm === pinnedExeNorm) {
    // If the window is a dedicated PWA / Web App, do NOT claim it under the browser!
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
    let unlistenWindows: (() => void) | undefined;
    let unlistenPins: (() => void) | undefined;

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
        unlistenWindows = fn;
      })
      .catch((err) => {
        console.error("Failed to subscribe to windows-updated:", err);
      });

    tauriBridge
      .onPinnedAppsUpdated((updatedPins) => {
        setPinnedApps(updatedPins);
      })
      .then((fn) => {
        unlistenPins = fn;
      })
      .catch((err) => {
        console.error("Failed to subscribe to pinned-apps-updated:", err);
      });

    return () => {
      if (unlistenWindows) unlistenWindows();
      if (unlistenPins) unlistenPins();
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
        const title = pinned.title || getCleanAppTitle(activeWin.title);
        const exe = pinned.exe || activeWin.exe;

        items.push({
          id: pinned.id,
          title,
          exe,
          icon_b64: resolveAppIcon(exe, title, pinned.icon_b64 || activeWin.icon_b64),
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
          icon_b64: resolveAppIcon(pinned.exe, pinned.title, pinned.icon_b64),
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
        // Standalone Web App / PWA: group by its canonical extracted app name (e.g. "YouTube Music", "Instagram", "WhatsApp")
        const canonicalAppName = extractWebAppName(win.title || "");
        groupKey = `pwa-${win.exe}-${canonicalAppName}`.toLowerCase();
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

      const title = isPwa ? extractWebAppName(activeWin.title || "") : getCleanAppTitle(activeWin.title);
      const id = `running-${groupKey}`;

      items.push({
        id,
        title,
        exe: activeWin.exe,
        icon_b64: resolveAppIcon(activeWin.exe, title, activeWin.icon_b64),
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
