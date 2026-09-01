import { useState, useEffect, useMemo, useCallback } from "react";
import { DockAppItem, PinnedApp, WindowInfo } from "../types";
import { tauriBridge } from "../services/tauriBridge";
import { windowThumbnailCache } from "../components/shared/WindowPreviewCard";

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

export function getBrowserDisplayName(exe?: string): string {
  const exeLower = (exe || "").toLowerCase();
  if (exeLower.includes("msedge") || exeLower.includes("edge")) return "Microsoft Edge";
  if (exeLower.includes("chrome")) return "Google Chrome";
  if (exeLower.includes("brave")) return "Brave";
  if (exeLower.includes("firefox")) return "Firefox";
  if (exeLower.includes("opera")) return "Opera";
  if (exeLower.includes("vivaldi")) return "Vivaldi";
  if (exeLower.includes("arc")) return "Arc";
  if (exeLower.includes("zen")) return "Zen Browser";
  if (exeLower.includes("thorium")) return "Thorium";
  if (exeLower.includes("waterfox")) return "Waterfox";
  if (exeLower.includes("librewolf")) return "LibreWolf";
  if (exeLower.includes("floorp")) return "Floorp";
  if (exeLower.includes("chromium")) return "Chromium";
  if (exeLower.includes("yandex")) return "Yandex";
  if (exeLower.includes("duckduckgo")) return "DuckDuckGo";
  if (exeLower.includes("tor")) return "Tor Browser";
  return "Browser";
}

export function isRegularBrowserWindow(win: WindowInfo): boolean {
  const exe = (win.exe || "").toLowerCase();
  if (!BROWSER_EXE_REGEX.test(exe)) return false;
  return !isStandalonePwaWindow(win);
}

/**
 * Detects if a window is an installed PWA (Progressive Web App) or standalone Web App.
 * Chromium / Edge launches standalone PWAs without browser tab navigation or browser name suffixes.
 */
export function isStandalonePwaWindow(win: WindowInfo): boolean {
  const exe = (win.exe || "").toLowerCase();
  if (!BROWSER_EXE_REGEX.test(exe)) return false;

  const rawTitle = (win.title || "").trim();
  if (!rawTitle) return false;

  // 1. Regular browser windows explicitly end with the browser name suffix
  // e.g. "Google Antigravity - Person 1 - Microsoft Edge" or "(27) YouTube - Microsoft Edge"
  if (BROWSER_SUFFIX_REGEX.test(rawTitle)) {
    return false;
  }

  // 2. Filter out internal browser utility popups/windows
  const lower = rawTitle.toLowerCase();
  if (
    lower === "developer tools" ||
    lower.startsWith("devtools -") ||
    lower === "settings" ||
    lower === "downloads" ||
    lower === "extensions" ||
    lower === "history" ||
    lower === "task manager" ||
    lower === "about"
  ) {
    return false;
  }

  // Window runs under a browser process (e.g. msedge.exe) but has no browser suffix -> Installed Web App / PWA
  return true;
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
  settings:
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="win11_gear" x1="15%" y1="10%" x2="85%" y2="90%"><stop offset="0%" stop-color="%2300A2FF"/><stop offset="35%" stop-color="%230078D4"/><stop offset="70%" stop-color="%23005A9E"/><stop offset="100%" stop-color="%23004578"/></linearGradient><radialGradient id="win11_hub" cx="45%" cy="40%" r="60%"><stop offset="0%" stop-color="%2370E4FF"/><stop offset="50%" stop-color="%230086F0"/><stop offset="85%" stop-color="%23004E8C"/><stop offset="100%" stop-color="%23002D54"/></radialGradient><linearGradient id="win11_hole" x1="30%" y1="20%" x2="70%" y2="80%"><stop offset="0%" stop-color="%23002244"/><stop offset="100%" stop-color="%23003A70"/></linearGradient></defs><path fill="url(%23win11_gear)" d="M28.6 4.7c1.8-1 5-1 6.8 0l2.2 5.5c1.7.6 3.2 1.4 4.6 2.4l5.8-1.6c1.7.8 3.1 2 4.2 3.4l-1.8 5.8c1.1 1.4 2 2.9 2.6 4.6l5.5 2.2c1 1.8 1 5 0 6.8l-5.5 2.2c-.6 1.7-1.4 3.2-2.6 4.6l1.8 5.8c-1.1 1.4-2.5 2.6-4.2 3.4l-5.8-1.6c-1.4 1-2.9 1.8-4.6 2.4l-2.2 5.5c-1.8 1-5 1-6.8 0l-2.2-5.5c-1.7-.6-3.2-1.4-4.6-2.4l-5.8 1.6c-1.7-.8-3.1-2-4.2-3.4l1.8-5.8c-1.1-1.4-2-2.9-2.6-4.6l-5.5-2.2c-1-1.8-1-5 0-6.8l5.5-2.2c.6-1.7 1.4-3.2 2.6-4.6l-1.8-5.8c1.1-1.4 2.5-2.6 4.2-3.4l5.8 1.6c1.4-1 2.9-1.8 4.6-2.4l2.2-5.5z"/><circle cx="32" cy="32" r="14" fill="url(%23win11_hub)"/><circle cx="32" cy="32" r="7" fill="url(%23win11_hole)"/></svg>',
  calculator: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="calcGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%230284C7"/><stop offset="100%" stop-color="%230369A1"/></linearGradient></defs><rect width="100" height="100" rx="22" fill="url(%23calcGrad)"/><rect x="24" y="20" width="52" height="18" rx="4" fill="%23082F49"/><rect x="24" y="44" width="12" height="10" rx="3" fill="%23BAE6FD"/><rect x="44" y="44" width="12" height="10" rx="3" fill="%23BAE6FD"/><rect x="64" y="44" width="12" height="10" rx="3" fill="%2338BDF8"/><rect x="24" y="58" width="12" height="10" rx="3" fill="%23BAE6FD"/><rect x="44" y="58" width="12" height="10" rx="3" fill="%23BAE6FD"/><rect x="64" y="58" width="12" height="10" rx="3" fill="%2338BDF8"/><rect x="24" y="72" width="12" height="10" rx="3" fill="%23BAE6FD"/><rect x="44" y="72" width="12" height="10" rx="3" fill="%23BAE6FD"/><rect x="64" y="72" width="12" height="10" rx="3" fill="%23F97316"/></svg>',
  terminal: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="%2318181B"/><path fill="none" stroke="%234ADE80" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" d="M30 32 L48 50 L30 68"/><line x1="56" y1="68" x2="72" y2="68" stroke="%23F4F4F5" stroke-width="8" stroke-linecap="round"/></svg>',
  taskmgr: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="tmGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23059669"/><stop offset="100%" stop-color="%23047857"/></linearGradient></defs><rect width="100" height="100" rx="22" fill="url(%23tmGrad)"/><path fill="none" stroke="%23ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" d="M20 54 L36 54 L44 30 L54 70 L62 44 L70 54 L80 54"/></svg>',
};

export function resolveAppIcon(exe?: string, title?: string, rawIcon?: string): string {
  const exeLower = (exe || "").toLowerCase();
  const titleLower = (title || "").toLowerCase();

  const isGenericPlaceholder = (icon?: string) => {
    if (!icon) return true;
    return icon.startsWith("data:image/png;base64,iVBORw0KGgo");
  };

  if (
    exeLower.includes("systemsettings") ||
    exeLower.includes("immersivecontrolpanel") ||
    titleLower === "settings" ||
    titleLower.startsWith("settings")
  ) {
    if (rawIcon && !isGenericPlaceholder(rawIcon) && rawIcon.startsWith("data:image/svg+xml")) {
      return rawIcon;
    }
    return SYSTEM_FLUENT_ICONS.settings;
  }

  if (exeLower.includes("calculator") || titleLower === "calculator") {
    if (rawIcon && !isGenericPlaceholder(rawIcon)) {
      return rawIcon;
    }
    return SYSTEM_FLUENT_ICONS.calculator;
  }

  if (exeLower.includes("windowsterminal") || exeLower === "wt.exe" || titleLower.includes("terminal")) {
    if (rawIcon && !isGenericPlaceholder(rawIcon)) {
      return rawIcon;
    }
    return SYSTEM_FLUENT_ICONS.terminal;
  }

  if (exeLower.includes("taskmgr") || titleLower === "task manager") {
    if (rawIcon && !isGenericPlaceholder(rawIcon)) {
      return rawIcon;
    }
    return SYSTEM_FLUENT_ICONS.taskmgr;
  }

  if (rawIcon && (rawIcon.startsWith("data:image/png;base64,") || rawIcon.startsWith("data:image/svg+xml"))) {
    return rawIcon;
  }

  return rawIcon || "";
}

export function extractWebAppName(rawTitle: string): string {
  let title = (rawTitle || "").trim();
  if (!title) return "Web App";

  title = title.replace(/^[\(\[]\d+\+?[\)\]]\s*/, "");
  title = title.replace(/\s*-\s*(Person\s*\d+|Profile\s*\d+|Default|Personal|Work)$/i, "");
  title = title.replace(BROWSER_SUFFIX_REGEX, "");
  title = title.trim();

  const cleanPart = (p: string) =>
    p
      .replace(/^[\(\[]\d+\+?[\)\]]\s*/, "")
      .replace(/\s*[\(\[]\d+\+?[\)\]]$/, "")
      .trim();

  if (title.includes(" | ")) {
    const parts = title.split(" | ").map(cleanPart).filter(Boolean);
    if (parts.length >= 2) {
      const candidate = parts[parts.length - 1];
      if (candidate.length <= 40) return candidate;
    }
  }

  if (title.includes(" - ")) {
    const parts = title.split(" - ").map(cleanPart).filter(Boolean);
    if (parts.length >= 2) {
      if (normalizeName(parts[0]) === normalizeName(parts[parts.length - 1])) {
        return parts[0];
      }
      const candidate = parts[parts.length - 1];
      if (candidate.length <= 40) return candidate;
    }
  }

  if (title.includes(": ")) {
    const parts = title.split(": ").map(cleanPart).filter(Boolean);
    if (parts.length >= 2) {
      const candidate = parts[0];
      if (candidate.length <= 40) return candidate;
    }
  }

  return cleanPart(title) || "Web App";
}

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

  const isBrowserProcess = BROWSER_EXE_REGEX.test(win.exe || "");
  const isPinnedBrowser =
    BROWSER_EXE_REGEX.test(pinned.exe || "") &&
    /edge|chrome|brave|opera|vivaldi|firefox|browser|arc|zen|waterfox|thorium|chromium/i.test(
      pinned.title || targetStemNorm || ""
    );

  const isDedicatedPwaShortcut =
    isBrowserProcess &&
    !isPinnedBrowser &&
    (Boolean(pinnedTitleNorm) || Boolean(targetStemNorm));

  if (isDedicatedPwaShortcut) {
    const winAppName = extractWebAppName(win.title || "");
    const winAppNameNorm = normalizeName(winAppName);

    if (
      (pinnedTitleNorm && (pinnedTitleNorm === winAppNameNorm || pinnedTitleNorm === cleanWinTitleNorm || pinnedTitleNorm === winTitleNorm)) ||
      (targetStemNorm && (targetStemNorm === winAppNameNorm || targetStemNorm === cleanWinTitleNorm || targetStemNorm === winTitleNorm))
    ) {
      return 350;
    }

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

    if (pinnedTitleNorm && winAppNameNorm) {
      if (winAppNameNorm.startsWith(pinnedTitleNorm) || pinnedTitleNorm.startsWith(winAppNameNorm)) {
        return 280;
      }
      if (cleanWinTitleNorm.includes(pinnedTitleNorm) || pinnedTitleNorm.includes(cleanWinTitleNorm)) {
        return 180;
      }
    }

    if (targetStemNorm && (winAppNameNorm.includes(targetStemNorm) || targetStemNorm.includes(winAppNameNorm))) {
      return 220;
    }
  }

  if (isPinnedBrowser && winExeNorm && pinnedExeNorm && winExeNorm === pinnedExeNorm) {
    if (isStandalonePwaWindow(win)) {
      return 0;
    }

    const hasDedicatedPwaMatch = allPinned.some((p) => {
      if (p.id === pinned.id) return false;
      const pTitle = normalizeName(p.title || "");
      const pTarget = normalizeName((p.lnk_path || "").split(/[\\/]/).pop() || "");
      const isOtherDedicated = !/edge|chrome|brave|opera|vivaldi|firefox|browser|arc|zen/i.test(p.title || pTarget);
      if (!isOtherDedicated) return false;

      const winAppNameNorm = normalizeName(extractWebAppName(win.title || ""));
      return (
        (pTitle && (winAppNameNorm === pTitle || cleanWinTitleNorm === pTitle || winTitleNorm === pTitle)) ||
        (pTarget && (winAppNameNorm === pTarget || cleanWinTitleNorm === pTarget || winTitleNorm === pTarget))
      );
    });

    if (!hasDedicatedPwaMatch) {
      return 200;
    }
    return 0;
  }

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

  if (winExeNorm && pinnedExeNorm) {
    if (winExeNorm === pinnedExeNorm) {
      return 200;
    }
    if (targetStemNorm && winExeNorm === targetStemNorm) {
      return 180;
    }
    return 0;
  }

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

  useEffect(() => {
    let unlistenWindows: (() => void) | undefined;
    let unlistenPins: (() => void) | undefined;

    Promise.all([tauriBridge.getPinnedApps(), tauriBridge.getOpenWindows()])
      .then(([pinned, wins]) => {
        setPinnedApps(pinned);
        setWindows(wins);
        windowThumbnailCache.prune(wins.map((w) => w.hwnd));
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to initialize apps & windows:", err);
        setLoading(false);
      });

    tauriBridge
      .onWindowsUpdated((updatedWindows) => {
        setWindows(updatedWindows);
        windowThumbnailCache.prune(updatedWindows.map((w) => w.hwnd));
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

  const dockApps = useMemo<DockAppItem[]>(() => {
    const items: DockAppItem[] = [];
    const matchedHwnds = new Set<number>();

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
        const isBrowser = BROWSER_EXE_REGEX.test(activeWin.exe || "");
        const isPwa = isStandalonePwaWindow(activeWin);
        const title = pinned.title || (isPwa ? extractWebAppName(activeWin.title || "") : isBrowser ? getBrowserDisplayName(activeWin.exe) : getCleanAppTitle(activeWin.title));
        const exe = pinned.exe || activeWin.exe;

        items.push({
          id: pinned.id,
          title,
          exe,
          icon_b64: activeWin.icon_b64 || resolveAppIcon(exe, title, pinned.icon_b64 || activeWin.icon_b64),
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

    // 2. Process remaining unpinned running windows (group browsers by exe, PWAs by app name, non-browsers by app)
    const remainingWins = windows.filter((w) => !matchedHwnds.has(w.hwnd));
    const groupedApps = new Map<string, WindowInfo[]>();

    for (const win of remainingWins) {
      const isPwa = isStandalonePwaWindow(win);
      const isBrowser = BROWSER_EXE_REGEX.test(win.exe || "");
      let groupKey: string;

      if (isPwa) {
        // Group each standalone PWA individually by its clean Web App Name (e.g. "pwa-pinterest", "pwa-youtubemusic")
        const appName = extractWebAppName(win.title || "");
        groupKey = `pwa-${normalizeName(appName || win.title || `hwnd-${win.hwnd}`)}`;
      } else if (isBrowser) {
        // Group all standard windows/tabs of this browser under the browser executable
        groupKey = (win.exe || "").toLowerCase();
      } else {
        groupKey = (win.exe || win.title || `hwnd-${win.hwnd}`).toLowerCase();
      }

      const list = groupedApps.get(groupKey) || [];
      list.push(win);
      groupedApps.set(groupKey, list);
    }

    for (const [groupKey, wins] of groupedApps.entries()) {
      const activeWin = wins.find((w) => w.is_focused) || wins[0];
      const isPwa = groupKey.startsWith("pwa-") || isStandalonePwaWindow(activeWin);
      const isBrowser = BROWSER_EXE_REGEX.test(activeWin.exe || "");

      const title = isPwa
        ? extractWebAppName(activeWin.title || "")
        : isBrowser
        ? getBrowserDisplayName(activeWin.exe)
        : getCleanAppTitle(activeWin.title);
      const id = `running-${groupKey}`;

      items.push({
        id,
        title,
        exe: activeWin.exe,
        icon_b64: activeWin.icon_b64 || resolveAppIcon(activeWin.exe, title, activeWin.icon_b64),
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
