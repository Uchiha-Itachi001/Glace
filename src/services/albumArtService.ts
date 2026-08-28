/**
 * Album Artwork Resolution Service
 * Automatically fetches high-resolution album/video cover art for playing tracks
 * with in-memory caching and zero-crash web-based lookup.
 */

const artCache = new Map<string, string>();
const pendingRequests = new Map<string, Promise<string | null>>();

function cleanQueryString(title: string, artist?: string): string {
  let cleanedTitle = title
    // Remove common video/audio suffixes and metadata noise
    .replace(/\s*\([^)]*(official|video|audio|lyrics|from|feat|ft\.|remix|version|ost)[^)]*\)/gi, "")
    .replace(/\s*\[[^\]]*(official|video|audio|lyrics|from|feat|ft\.|remix|version|ost)[^\]]*\]/gi, "")
    .replace(/\.mp3|\.flac|\.wav|\.m4a/gi, "")
    .trim();

  let cleanedArtist = (artist || "")
    .replace(/\s*(feat\.|ft\.|with|,|&)\s*.*/gi, "")
    .trim();

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

  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey)!;
  }

  const fetchPromise = (async () => {
    try {
      const searchTerm = cleanQueryString(t, a);
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&entity=song&limit=1`;
      
      const response = await fetch(url);
      if (!response.ok) return null;
      
      const data = await response.json();
      if (data.resultCount > 0 && data.results?.[0]?.artworkUrl100) {
        // Upgrade 100x100 thumbnail to 300x300 high-res artwork
        const highResUrl = data.results[0].artworkUrl100.replace("100x100bb.jpg", "300x300bb.jpg");
        artCache.set(cacheKey, highResUrl);
        return highResUrl;
      }

      // Secondary Fallback: Deezer Public API
      const deezerUrl = `https://api.deezer.com/search?q=${encodeURIComponent(searchTerm)}&limit=1`;
      try {
        const deezerRes = await fetch(deezerUrl);
        if (deezerRes.ok) {
          const deezerData = await deezerRes.json();
          if (deezerData.data?.[0]?.album?.cover_medium) {
            const deezerArt = deezerData.data[0].album.cover_medium;
            artCache.set(cacheKey, deezerArt);
            return deezerArt;
          }
        }
      } catch {
        // Ignore Deezer CORS or network issues
      }

      return null;
    } catch (err) {
      console.warn("Could not fetch album artwork:", err);
      return null;
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, fetchPromise);
  const result = await fetchPromise;
  if (result) {
    artCache.set(cacheKey, result);
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

const colorCache = new Map<string, TrackColorTheme>();

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
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);

        canvas.width = 36;
        canvas.height = 36;
        ctx.drawImage(img, 0, 0, 36, 36);

        const imageData = ctx.getImageData(0, 0, 36, 36).data;
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

        // Boost brightness for vivid glow against dark glass
        const boost = (val: number) => Math.min(255, Math.max(30, Math.round(val * 1.12)));
        const finalR = boost(chosen.r);
        const finalG = boost(chosen.g);
        const finalB = boost(chosen.b);

        // Upper color: luminous bright highlight (frosted light tint)
        const topR = Math.min(255, Math.round(finalR * 0.40 + 255 * 0.60));
        const topG = Math.min(255, Math.round(finalG * 0.40 + 255 * 0.60));
        const topB = Math.min(255, Math.round(finalB * 0.40 + 255 * 0.60));

        // Lower color: deep rich saturated tone
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

        colorCache.set(imageUrl, result);
        resolve(result);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
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

