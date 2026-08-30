/**
 * Album Artwork Resolution Service
 * Automatically fetches high-resolution album/video cover art for playing tracks
 * with in-memory caching, web platform detection, and zero-crash fallback.
 */

const MAX_CACHE_SIZE = 20;
const artCache = new Map<string, string>();
const colorCache = new Map<string, TrackColorTheme>();
const pendingRequests = new Map<string, Promise<string | null>>();

function setBoundedCache<K, V>(map: Map<K, V>, key: K, value: V, maxSize = MAX_CACHE_SIZE) {
  if (map.size >= maxSize) {
    const firstKey = map.keys().next().value;
    if (firstKey !== undefined) map.delete(firstKey);
  }
  map.set(key, value);
}

let sharedCanvas: HTMLCanvasElement | null = null;
function getSharedCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (!sharedCanvas) {
    sharedCanvas = document.createElement("canvas");
    sharedCanvas.width = 24;
    sharedCanvas.height = 24;
  }
  const ctx = sharedCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  return { canvas: sharedCanvas, ctx };
}

export const PLATFORM_BADGES: Record<string, string> = {
  // Video & Social Platforms
  instagram: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="ig" cx="30%" cy="107%" r="150%"><stop offset="0%" stop-color="%23fdf497"/><stop offset="5%" stop-color="%23fdf497"/><stop offset="45%" stop-color="%23fd5949"/><stop offset="60%" stop-color="%23d6249f"/><stop offset="90%" stop-color="%23285AEB"/></radialGradient></defs><rect width="100" height="100" rx="22" fill="url(%23ig)"/><path fill="none" stroke="%23fff" stroke-width="6.5" d="M 28 17 H 72 A 11 11 0 0 1 83 28 V 72 A 11 11 0 0 1 72 83 H 28 A 11 11 0 0 1 17 72 V 28 A 11 11 0 0 1 28 17 Z"/><circle cx="50" cy="50" r="16" fill="none" stroke="%23fff" stroke-width="6.5"/><circle cx="69" cy="31" r="3.5" fill="%23fff"/></svg>',
  facebook: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="%231877F2"/><path fill="%23fff" d="M 64 52 L 66 38 H 53 V 29 C 53 25 55 21 61 21 H 67 V 9 C 66 9 62 8 57 8 C 47 8 40 14 40 25 V 38 H 28 V 52 H 40 V 92 H 53 V 52 Z"/></svg>',
  youtube: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="%230f0f0f"/><rect x="15" y="27" width="70" height="46" rx="14" fill="%23FF0000"/><polygon points="43,38 43,62 64,50" fill="%23fff"/></svg>',
  tiktok: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="%23010101"/><path fill="%2325F4EE" d="M68 34c-4-3-6-7-7-12h-8v42a10 10 0 1 1-7-10c1 0 2 0 3 1v-9a19 19 0 1 0 13 18V45a23 23 0 0 0 15 6v-9a15 15 0 0 1-9-8z"/><path fill="%23FE2C55" d="M65 32a15 15 0 0 1-9-8h-6v42a10 10 0 1 1-7-10c1 0 2 0 3 1v-7a17 17 0 1 0 11 16V43a21 21 0 0 0 15 6v-7a13 13 0 0 1-7-6z"/></svg>',
  twitch: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="%239146FF"/><path fill="%23fff" d="M 22 18 L 18 28 V 74 H 30 V 84 L 40 74 H 49 L 71 52 V 18 H 22 Z M 64 48 L 54 58 H 45 L 37 66 V 58 H 27 V 25 H 64 V 48 Z M 40 34 H 47 V 49 H 40 Z M 55 34 H 62 V 49 H 55 Z"/></svg>',
  twitter: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="%23000000"/><path fill="%23fff" d="M 28 22 L 45 46 L 27 68 H 31 L 47 49 L 59 68 H 73 L 55 42 L 71 22 H 67 L 53 40 L 42 22 Z M 34 25 H 40 L 67 65 H 61 Z"/></svg>',
  x: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="%23000000"/><path fill="%23fff" d="M 28 22 L 45 46 L 27 68 H 31 L 47 49 L 59 68 H 73 L 55 42 L 71 22 H 67 L 53 40 L 42 22 Z M 34 25 H 40 L 67 65 H 61 Z"/></svg>',
  netflix: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="%23141414"/><path fill="%23E50914" d="M28 18h11v64c-3-1-7-2-11-2V18zm33 0h11v62c-4 0-8 1-11 2V18z"/><path fill="%23B81D24" d="M28 18l33 62c4-1 8-1 11-2L39 18H28z"/></svg>',
  spotify: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="%231DB954"/><path fill="%23000" d="M72 45c-15-9-40-10-54-5a4 4 0 0 1-3-8c17-5 44-4 61 6a4 4 0 0 1-4 7zm-1 13c-12-8-32-10-47-5a3 3 0 0 0-2 4 3 3 0 0 0 4 2c12-4 30-2 41 5a3 3 0 0 0 4-6zm-3 12c-11-7-25-8-37-4a3 3 0 0 0-2 4 3 3 0 0 0 4 1c10-3 23-2 32 4a3 3 0 0 0 3-5z"/></svg>',
  soundcloud: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="%23FF5500"/><path fill="%23fff" d="M68 44c-1 0-2 0-3 1-2-9-10-15-20-15-7 0-14 4-17 10v26h40c8 0 14-6 14-11s-6-11-14-11z M22 50h4v16h-4z M14 54h4v12h-4z"/></svg>',

  // Web Browsers
  brave: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23FB542B"/><stop offset="100%" stop-color="%23FF2000"/></linearGradient></defs><rect width="100" height="100" rx="22" fill="url(%23bg)"/><path fill="%23fff" d="M50 18 L68 28 L74 48 L64 74 L50 82 L36 74 L26 48 L32 28 Z M50 25 L36 32 L32 46 L40 66 L50 72 L60 66 L68 46 L64 32 Z M43 45 L50 40 L57 45 L54 55 L46 55 Z"/></svg>',
  edge: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="eg1" cx="65%" cy="30%" r="55%"><stop offset="0%" stop-color="%2300E887"/><stop offset="100%" stop-color="%2300C7FF"/></radialGradient><linearGradient id="eg2" x1="0%" y1="50%" x2="100%" y2="100%"><stop offset="0%" stop-color="%230078D7"/><stop offset="100%" stop-color="%23002050"/></linearGradient></defs><rect width="100" height="100" rx="22" fill="%230c1017"/><path fill="url(%23eg1)" d="M50 18c18 0 32 14 32 32 0 4-1 8-2 11-3-11-13-19-25-19-14 0-26 11-26 25 0 5 1 9 4 13-9-4-15-13-15-24 0-21 14-38 32-38z"/><path fill="url(%23eg2)" d="M55 42c12 0 22 8 25 19-3 12-14 21-27 21-18 0-33-14-33-32 0-3 0-5 1-8 0 14 11 25 25 25 10 0 19-7 21-16-2-6-7-9-12-9z"/></svg>',
  chrome: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="%231a1a1a"/><circle cx="50" cy="50" r="32" fill="%23fff"/><path fill="%23EA4335" d="M50 18 A32 32 0 0 1 78 34 L50 50 Z"/><path fill="%23FBBC05" d="M78 34 A32 32 0 0 1 50 82 L50 50 Z"/><path fill="%2334A853" d="M50 82 A32 32 0 0 1 22 34 L50 50 Z"/><path fill="%234285F4" d="M22 34 A32 32 0 0 1 50 18 L50 50 Z"/><circle cx="50" cy="50" r="14" fill="%23fff"/><circle cx="50" cy="50" r="11" fill="%234285F4"/></svg>',
  firefox: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="ffg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23FF9400"/><stop offset="50%" stop-color="%23FF3D00"/><stop offset="100%" stop-color="%238000FF"/></linearGradient></defs><rect width="100" height="100" rx="22" fill="%2318002a"/><circle cx="50" cy="50" r="32" fill="url(%23ffg)"/><circle cx="54" cy="46" r="22" fill="%2318002a"/><path fill="%23FF9400" d="M54 26c10 5 16 15 16 26 0 14-11 26-26 26-6 0-12-2-16-6 10 3 20-1 25-10 4-8 1-17-5-23 2-5 4-9 6-13z"/></svg>',
  opera: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="%23121212"/><path fill="%23FF1B2D" d="M50 16c-19 0-34 15-34 34s15 34 34 34 34-15 34-34-15-34-34-34zm0 56c-10 0-18-10-18-22s8-22 18-22 18 10 18 22-8 22-18 22z"/></svg>',
  arc: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="arcg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23FF5B84"/><stop offset="100%" stop-color="%235655FE"/></linearGradient></defs><rect width="100" height="100" rx="22" fill="url(%23arcg)"/><circle cx="50" cy="50" r="22" fill="%23fff"/><circle cx="50" cy="50" r="14" fill="url(%23arcg)"/></svg>',
  vivaldi: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="%23EF3939"/><path fill="%23fff" d="M32 30h12l12 28 12-28h12L62 70H50L32 30z"/></svg>',
  // Local Media Players & Desktop Applications
  vlc: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="%23FF8800"/><path fill="%23fff" d="M46 16 h8 l4 20 h-16 z M38 42 h24 l4 16 h-32 z M30 64 h40 l5 18 h-50 z"/><rect x="20" y="80" width="60" height="8" rx="4" fill="%23fff"/></svg>',
  "vlc media player": 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="%23FF8800"/><path fill="%23fff" d="M46 16 h8 l4 20 h-16 z M38 42 h24 l4 16 h-32 z M30 64 h40 l5 18 h-50 z"/><rect x="20" y="80" width="60" height="8" rx="4" fill="%23fff"/></svg>',
  "media player": 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="mpg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23FF5E62"/><stop offset="100%" stop-color="%23FF9966"/></linearGradient></defs><rect width="100" height="100" rx="22" fill="url(%23mpg)"/><circle cx="50" cy="50" r="28" fill="%23fff"/><polygon points="44,38 44,62 64,50" fill="%23FF5E62"/></svg>',
  "windows media player": 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="wmpg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%230078D7"/><stop offset="100%" stop-color="%2300C7FF"/></linearGradient></defs><rect width="100" height="100" rx="22" fill="url(%23wmpg)"/><circle cx="50" cy="50" r="28" fill="%23fff"/><polygon points="44,38 44,62 64,50" fill="%230078D7"/></svg>',
  "movies & tv": 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="%230078D7"/><rect x="20" y="24" width="60" height="52" rx="8" fill="%23fff"/><polygon points="44,40 44,60 62,50" fill="%230078D7"/></svg>',
  "mpc-hc": 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="%231E293B"/><rect x="20" y="24" width="60" height="52" rx="8" fill="%2338BDF8"/><polygon points="44,40 44,60 62,50" fill="%230F172A"/></svg>',
  potplayer: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="%23F59E0B"/><circle cx="50" cy="50" r="26" fill="%23fff"/><polygon points="44,40 44,60 62,50" fill="%23F59E0B"/></svg>',
  mpv: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="%234B1D6D"/><circle cx="50" cy="50" r="26" fill="%23fff"/><polygon points="44,40 44,60 62,50" fill="%234B1D6D"/></svg>',
  foobar2000: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="%2322C55E"/><circle cx="50" cy="50" r="26" fill="%23fff"/><path fill="%2322C55E" d="M46 36 v28 a6 6 0 1 1 -6 -6 c2 0 4 1 6 2 V42 h14 v18 a6 6 0 1 1 -6 -6 c2 0 4 1 6 2 V36 Z"/></svg>',
  aimp: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="%23EA580C"/><circle cx="50" cy="50" r="26" fill="%23fff"/><polygon points="44,40 44,60 62,50" fill="%23EA580C"/></svg>',
  musicbee: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="%23EAB308"/><circle cx="50" cy="50" r="26" fill="%231E293B"/><path fill="%23EAB308" d="M46 36 v28 a6 6 0 1 1 -6 -6 c2 0 4 1 6 2 V42 h14 v18 a6 6 0 1 1 -6 -6 c2 0 4 1 6 2 V36 Z"/></svg>',
  "local media": "/albumcover-placeholder.png",
};

export function detectPlatformBadge(title: string, artist?: string): string | null {
  const normTitle = title.toLowerCase().replace(/^\(\d+\+?\)\s*/, "").trim();
  const normArtist = (artist || "").toLowerCase().trim();

  // 1. Direct artist match (e.g. Brave, Chrome, Spotify, Instagram, Edge, VLC, Media Player)
  for (const [key, badge] of Object.entries(PLATFORM_BADGES)) {
    if (normArtist === key) return badge;
  }

  // 2. Pure exact application name match on title
  const PURE_APP_NAMES = [
    "instagram", "facebook", "tiktok", "twitter", "x", "reddit",
    "twitch", "netflix", "spotify", "brave", "edge", "microsoft edge",
    "chrome", "google chrome", "firefox", "opera", "arc", "vivaldi", "soundcloud",
    "vlc", "vlc media player", "media player", "windows media player", "movies & tv",
    "mpc-hc", "mpc-be", "potplayer", "mpv", "foobar2000", "aimp", "musicbee", "local media"
  ];
  
  if (PURE_APP_NAMES.includes(normTitle)) {
    const key = normTitle.replace("microsoft ", "").replace("google ", "");
    return PLATFORM_BADGES[key] || PLATFORM_BADGES[normTitle] || null;
  }

  return null;
}

export function detectFallbackBadge(title: string, artist?: string): string | null {
  const normTitle = title.toLowerCase().replace(/^\(\d+\+?\)\s*/, "").trim();
  const normArtist = (artist || "").toLowerCase().trim();
  const combined = `${normTitle} ${normArtist}`;

  if (combined.includes("youtube")) return PLATFORM_BADGES.youtube;
  if (combined.includes("facebook")) return PLATFORM_BADGES.facebook;
  if (combined.includes("instagram")) return PLATFORM_BADGES.instagram;
  if (combined.includes("tiktok")) return PLATFORM_BADGES.tiktok;
  if (combined.includes("twitch")) return PLATFORM_BADGES.twitch;
  if (combined.includes("netflix")) return PLATFORM_BADGES.netflix;
  if (combined.includes("soundcloud")) return PLATFORM_BADGES.soundcloud;
  if (combined.includes("vlc")) return PLATFORM_BADGES.vlc;
  if (combined.includes("media player") || combined.includes("movies & tv") || combined.includes("zune")) return PLATFORM_BADGES["media player"];
  if (combined.includes("mpc")) return PLATFORM_BADGES["mpc-hc"];
  if (combined.includes("potplayer")) return PLATFORM_BADGES.potplayer;
  if (combined.includes("mpv")) return PLATFORM_BADGES.mpv;
  if (combined.includes("foobar")) return PLATFORM_BADGES.foobar2000;
  if (combined.includes("aimp")) return PLATFORM_BADGES.aimp;
  if (combined.includes("musicbee")) return PLATFORM_BADGES.musicbee;
  if (combined.includes("brave")) return PLATFORM_BADGES.brave;
  if (combined.includes("edge")) return PLATFORM_BADGES.edge;
  if (combined.includes("chrome")) return PLATFORM_BADGES.chrome;
  if (combined.includes("firefox")) return PLATFORM_BADGES.firefox;
  if (combined.includes("opera")) return PLATFORM_BADGES.opera;
  if (combined.includes("arc")) return PLATFORM_BADGES.arc;
  if (combined.includes("vivaldi")) return PLATFORM_BADGES.vivaldi;

  return null;
}

function cleanQueryString(title: string, artist?: string): string {
  let cleanedTitle = title
    .replace(/^\(\d+\+?\)\s*/, "")
    .replace(/\s*-\s*(youtube|facebook|instagram|tiktok|twitch|netflix|brave|edge|chrome|firefox|opera|vlc|mpc-hc|potplayer|mpv|foobar2000|aimp)$/i, "")
    .replace(/\s*\|\s*(youtube|facebook|instagram|tiktok|twitch|netflix|brave|edge|chrome|firefox|opera|vlc|mpc-hc|potplayer|mpv|foobar2000|aimp)$/i, "")
    .replace(/\s*\([^)]*(official|video|audio|lyrics|from|feat|ft\.|remix|version|ost|hd|4k)[^)]*\)/gi, "")
    .replace(/\s*\[[^\]]*(official|video|audio|lyrics|from|feat|ft\.|remix|version|ost|hd|4k|foobar2000)[^\]]*\]/gi, "")
    .replace(/\.(mp3|mp4|mkv|wav|flac|avi|mov|webm|m4a|aac|opus|ogg|wma|wmv|m4v)/gi, "")
    .trim();

  let cleanedArtist = (artist || "")
    .replace(/\s*(feat\.|ft\.|with|,|&)\s*.*/gi, "")
    .trim();

  if (!cleanedArtist && cleanedTitle.includes(" - ")) {
    const parts = cleanedTitle.split(" - ");
    if (parts.length >= 2) {
      cleanedArtist = parts[0].trim();
      cleanedTitle = parts.slice(1).join(" - ").trim();
    }
  }

  if (cleanedArtist && !cleanedTitle.toLowerCase().includes(cleanedArtist.toLowerCase())) {
    return `${cleanedTitle} ${cleanedArtist}`;
  }
  return cleanedTitle;
}

export async function fetchAlbumArt(title: string, artist?: string): Promise<string | null> {
  const t = title.trim();
  const a = (artist || "").trim();
  if (!t) return null;

  const cacheKey = `${t}:::${a}`.toLowerCase();
  if (artCache.has(cacheKey)) {
    return artCache.get(cacheKey) || null;
  }

  // 1. Direct match for exact platform tab (e.g. "Instagram", "Facebook", "Brave")
  const platformBadge = detectPlatformBadge(t, a);
  if (platformBadge) {
    setBoundedCache(artCache, cacheKey, platformBadge);
    return platformBadge;
  }

  // 2. Ignore generic web application names if no valid song query exists
  const GENERIC_WEB_APPS = ["instagram", "facebook", "tiktok", "twitter", "reddit", "twitch", "whatsapp", "discord", "chrome", "edge", "firefox", "brave", "opera", "meet", "zoom", "teams"];
  const simpleWord = t.toLowerCase().replace(/^\(\d+\+?\)\s*/, "").trim();
  if (GENERIC_WEB_APPS.includes(simpleWord) && (!a || a === "home" || a === "m83")) {
    const fallback = detectFallbackBadge(t, a);
    if (fallback) setBoundedCache(artCache, cacheKey, fallback);
    return fallback;
  }

  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey)!;
  }

  const fetchPromise = (async () => {
    try {
      const searchTerm = cleanQueryString(t, a);
      if (searchTerm && searchTerm.length >= 2) {
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&entity=song&limit=1`;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (data.resultCount > 0 && data.results?.[0]?.artworkUrl100) {
            const highResUrl = data.results[0].artworkUrl100.replace("100x100bb.jpg", "300x300bb.jpg");
            setBoundedCache(artCache, cacheKey, highResUrl);
            return highResUrl;
          }
        }
      }

      // Secondary Fallback: Deezer Public API
      if (searchTerm && searchTerm.length >= 3) {
        const deezerUrl = `https://api.deezer.com/search?q=${encodeURIComponent(searchTerm)}&limit=1`;
        try {
          const deezerRes = await fetch(deezerUrl);
          if (deezerRes.ok) {
            const deezerData = await deezerRes.json();
            if (deezerData.data?.[0]?.album?.cover_medium) {
              const deezerArt = deezerData.data[0].album.cover_medium;
              setBoundedCache(artCache, cacheKey, deezerArt);
              return deezerArt;
            }
          }
        } catch {
          // Ignore Deezer CORS
        }
      }

      // If online music search found no match, use platform or browser fallback badge
      const fallbackBadge = detectFallbackBadge(t, a);
      if (fallbackBadge) {
        setBoundedCache(artCache, cacheKey, fallbackBadge);
        return fallbackBadge;
      }

      return null;
    } catch {
      return detectFallbackBadge(t, a);
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, fetchPromise);
  const result = await fetchPromise;
  if (result) {
    setBoundedCache(artCache, cacheKey, result);
  }
  return result;
}

export interface TrackColorTheme {
  waveColor: string;
  waveGradient: string;
  waveGradientTop: string;
  waveGradientBottom: string;
  glowColor: string;
}

export async function extractDominantColor(imageUrl: string): Promise<TrackColorTheme | null> {
  if (!imageUrl) return null;
  if (colorCache.has(imageUrl)) {
    return colorCache.get(imageUrl)!;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const shared = getSharedCanvas();
        if (!shared) return resolve(null);

        const { canvas, ctx } = shared;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let rTotal = 0, gTotal = 0, bTotal = 0, count = 0;
        let maxSaturation = 0;
        let bestColor = { r: 244, g: 63, b: 94 };

        for (let i = 0; i < imageData.length; i += 4) {
          const r = imageData[i];
          const g = imageData[i + 1];
          const b = imageData[i + 2];
          const a = imageData[i + 3];

          if (a < 128) continue;
          const brightness = (r + g + b) / 3;
          if (brightness < 30 || brightness > 235) continue;

          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const saturation = (max - min) / (max || 1);

          if (saturation > maxSaturation) {
            maxSaturation = saturation;
            bestColor = { r, g, b };
          }

          rTotal += r;
          gTotal += g;
          bTotal += b;
          count++;
        }

        const chosen = maxSaturation > 0.2 ? bestColor : (count > 0 ? {
          r: Math.round(rTotal / count),
          g: Math.round(gTotal / count),
          b: Math.round(bTotal / count),
        } : bestColor);

        const boost = (val: number) => Math.min(255, Math.max(30, Math.round(val * 1.12)));
        const finalR = boost(chosen.r);
        const finalG = boost(chosen.g);
        const finalB = boost(chosen.b);

        const topR = Math.min(255, Math.round(finalR * 0.40 + 255 * 0.60));
        const topG = Math.min(255, Math.round(finalG * 0.40 + 255 * 0.60));
        const topB = Math.min(255, Math.round(finalB * 0.40 + 255 * 0.60));

        const botR = Math.max(15, Math.round(finalR * 0.88));
        const botG = Math.max(15, Math.round(finalG * 0.88));
        const botB = Math.max(15, Math.round(finalB * 0.88));

        const waveGradientTop = `rgb(${topR}, ${topG}, ${topB})`;
        const waveGradientBottom = `rgb(${botR}, ${botG}, ${botB})`;
        const waveGradient = `linear-gradient(180deg, ${waveGradientTop} 0%, ${waveGradientBottom} 100%)`;

        const result: TrackColorTheme = {
          waveColor: `rgb(${finalR}, ${finalG}, ${finalB})`,
          waveGradient,
          waveGradientTop,
          waveGradientBottom,
          glowColor: `rgba(${finalR}, ${finalG}, ${finalB}, 0.55)`,
        };

        setBoundedCache(colorCache, imageUrl, result);
        resolve(result);
      } catch {
        resolve(null);
      } finally {
        img.onload = null;
        img.onerror = null;
        img.src = "";
      }
    };
    img.onerror = () => {
      img.onload = null;
      img.onerror = null;
      img.src = "";
      resolve(null);
    };
    img.src = imageUrl;
  });
}

export const albumArtService = {
  fetchAlbumArt,
  extractDominantColor,
  getColorCached: (imageUrl?: string): TrackColorTheme | null => {
    if (!imageUrl) return null;
    return colorCache.get(imageUrl) || null;
  },
  getCached: (title: string, artist?: string) => {
    const cacheKey = `${title.trim()}:::${(artist || "").trim()}`.toLowerCase();
    return artCache.get(cacheKey) || null;
  },
};

