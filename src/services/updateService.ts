import { UpdateInfo } from "../types";

export const CURRENT_APP_VERSION = "0.3.2";
export const GITHUB_REPO = "Uchiha-Itachi001/Glace";

const CACHE_KEY = "glace_update_cache";
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

interface CachedUpdateData {
  timestamp: number;
  info: UpdateInfo;
}

/**
 * Parses and compares semver-like strings (e.g. "0.3.2" > "0.3.1", "v1.0.0" > "0.3.1")
 * Returns true if remote is strictly greater than current.
 */
export function isRemoteNewer(current: string, remote: string): boolean {
  const clean = (v: string) => v.replace(/^v/i, "").trim();
  const cParts = clean(current).split(".").map((n) => parseInt(n, 10) || 0);
  const rParts = clean(remote).split(".").map((n) => parseInt(n, 10) || 0);

  const maxLen = Math.max(cParts.length, rParts.length);
  for (let i = 0; i < maxLen; i++) {
    const c = cParts[i] ?? 0;
    const r = rParts[i] ?? 0;
    if (r > c) return true;
    if (r < c) return false;
  }
  return false;
}

/**
 * Checks GitHub Releases API for newer version of Glace.
 */
export async function checkForUpdate(force = false): Promise<UpdateInfo> {
  // Check cached result if not forced
  if (!force) {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed: CachedUpdateData = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
          const hasUpdate = isRemoteNewer(CURRENT_APP_VERSION, parsed.info?.latestVersion || "");
          return {
            ...parsed.info,
            currentVersion: CURRENT_APP_VERSION,
            hasUpdate,
          };
        }
      }
    } catch {
      // Ignore cache errors
    }
  }

  const defaultResult: UpdateInfo = {
    hasUpdate: false,
    currentVersion: CURRENT_APP_VERSION,
    latestVersion: CURRENT_APP_VERSION,
    releaseUrl: `https://github.com/${GITHUB_REPO}/releases`,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: {
        Accept: "application/vnd.github.v3+json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      // If 404 (no releases yet) or rate limited, return fallback
      return defaultResult;
    }

    const data = await res.json();
    const rawTag = (data.tag_name || "").trim();
    const latestVersion = rawTag.replace(/^v/i, "") || CURRENT_APP_VERSION;
    const hasUpdate = isRemoteNewer(CURRENT_APP_VERSION, latestVersion);

    // Find installer asset if available (.exe or .msi)
    let downloadUrl = data.html_url || `https://github.com/${GITHUB_REPO}/releases`;
    if (Array.isArray(data.assets)) {
      const exeAsset = data.assets.find((a: { name?: string; browser_download_url?: string }) =>
        a.name?.endsWith(".exe") || a.name?.endsWith(".msi")
      );
      if (exeAsset?.browser_download_url) {
        downloadUrl = exeAsset.browser_download_url;
      }
    }

    const updateInfo: UpdateInfo = {
      hasUpdate,
      currentVersion: CURRENT_APP_VERSION,
      latestVersion,
      releaseUrl: data.html_url || `https://github.com/${GITHUB_REPO}/releases`,
      releaseNotes: data.body || "",
      publishedAt: data.published_at || "",
      downloadUrl,
    };

    // Save to cache
    try {
      const cachePayload: CachedUpdateData = {
        timestamp: Date.now(),
        info: updateInfo,
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cachePayload));
    } catch {
      // Ignore storage errors
    }

    return updateInfo;
  } catch (err) {
    console.warn("Glace update check skipped or offline:", err);
    return defaultResult;
  }
}
