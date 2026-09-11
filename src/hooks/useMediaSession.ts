import { useState, useEffect, useCallback } from "react";
import { MediaSessionInfo } from "../types";
import { tauriBridge } from "../services/tauriBridge";
import { albumArtService, TrackColorTheme } from "../services/albumArtService";

export interface MediaSessionState {
  liveMedia: MediaSessionInfo | null;
  dynamicTheme: TrackColorTheme | null;
  isPlaying: boolean;
  currentSec: number;
  durationSec: number;
  progressPercent: number;
  hasLiveMedia: boolean;
}

const DEFAULT_STATE: MediaSessionState = {
  liveMedia: null,
  dynamicTheme: null,
  isPlaying: false,
  currentSec: 0,
  durationSec: 0,
  progressPercent: 0,
  hasLiveMedia: false,
};

let currentState: MediaSessionState = DEFAULT_STATE;
const listeners = new Set<(state: MediaSessionState) => void>();
let pollTimer: number | null = null;
let progressTimer: number | null = null;
let unlistenMediaEvents: (() => void) | null = null;
let lastTitle = "";
let lastArtist = "";
let lastArtUrl = "";

// Zero-drift high precision timeline anchor
let anchorPositionSec = 0;
let anchorTimestamp = performance.now();
let optimisticPlayState: { target: boolean; expiresAt: number } | null = null;

function notifyListeners() {
  listeners.forEach((fn) => fn(currentState));
}

function updatePlaybackTicker() {
  if (currentState.isPlaying && currentState.hasLiveMedia && currentState.durationSec > 0) {
    if (progressTimer === null) {
      progressTimer = window.setInterval(() => {
        if (!currentState.isPlaying || !currentState.hasLiveMedia || currentState.durationSec <= 0) {
          if (progressTimer !== null) {
            clearInterval(progressTimer);
            progressTimer = null;
          }
          return;
        }

        const duration = currentState.durationSec;
        const elapsed = (performance.now() - anchorTimestamp) / 1000;
        const exactSec = Math.min(duration, Math.max(0, anchorPositionSec + elapsed));
        const pct = duration > 0 ? (exactSec / duration) * 100 : 0;

        currentState = {
          ...currentState,
          currentSec: Math.floor(exactSec),
          progressPercent: pct,
        };
        notifyListeners();
      }, 250);
    }
  } else {
    if (progressTimer !== null) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
  }
}

function processIncomingSession(session: MediaSessionInfo | null) {
  if (!session || (!session.title?.trim() && !session.artist?.trim())) {
    if (currentState.hasLiveMedia) {
      lastTitle = "";
      lastArtist = "";
      lastArtUrl = "";
      anchorPositionSec = 0;
      anchorTimestamp = performance.now();
      currentState = DEFAULT_STATE;
      notifyListeners();
      updatePlaybackTicker();
    }
    return;
  }

  let art = session.album_art_base64;
  const titleKey = session.title || "";
  const artistKey = session.artist || "";

  if (!art) {
    art = albumArtService.getCached(titleKey, artistKey) || undefined;
    if (!art && (titleKey !== lastTitle || artistKey !== lastArtist)) {
      albumArtService.fetchAlbumArt(titleKey, artistKey).then((fetchedArt) => {
        if (fetchedArt && currentState.liveMedia?.title === titleKey && !currentState.liveMedia?.album_art_base64) {
          currentState = {
            ...currentState,
            liveMedia: { ...currentState.liveMedia, album_art_base64: fetchedArt },
          };
          notifyListeners();
        }
      });
    }
  }

  lastTitle = titleKey;
  lastArtist = artistKey;

  // Theme color resolution
  let theme = currentState.dynamicTheme;
  const currentArt = art || "";
  if (currentArt !== lastArtUrl) {
    lastArtUrl = currentArt;
    if (currentArt) {
      const cachedColor = albumArtService.getColorCached(currentArt);
      if (cachedColor) {
        theme = cachedColor;
      } else {
        albumArtService.extractDominantColor(currentArt).then((extracted) => {
          if (extracted) {
            currentState = { ...currentState, dynamicTheme: extracted };
            notifyListeners();
          }
        });
      }
    } else {
      theme = null;
    }
  }

  const duration = session.duration_sec > 0 ? session.duration_sec : 0;
  const currentSec = session.current_sec > 0 ? Math.min(duration || session.current_sec, session.current_sec) : 0;
  const progressPercent = duration > 0 ? (currentSec / duration) * 100 : 0;

  // Calibrate high-precision timeline anchor
  anchorPositionSec = session.position_ms !== undefined && session.position_ms !== null
    ? session.position_ms / 1000
    : currentSec;
  anchorTimestamp = performance.now();

  let isPlaying = session.is_playing;
  if (optimisticPlayState) {
    if (performance.now() < optimisticPlayState.expiresAt) {
      if (session.is_playing === optimisticPlayState.target) {
        optimisticPlayState = null;
      } else {
        isPlaying = optimisticPlayState.target;
      }
    } else {
      optimisticPlayState = null;
    }
  }

  currentState = {
    liveMedia: { ...session, album_art_base64: art },
    dynamicTheme: theme,
    isPlaying,
    currentSec,
    durationSec: duration,
    progressPercent,
    hasLiveMedia: true,
  };

  notifyListeners();
  updatePlaybackTicker();
}

async function fetchAndUpdate() {
  if (listeners.size === 0) {
    stopPolling();
    return;
  }

  try {
    const session = await tauriBridge.getMediaSessionInfo();
    processIncomingSession(session);
  } catch (err) {
    console.error("Error polling media session:", err);
  }
}

async function startPolling() {
  if (listeners.size === 0) return;

  // Register real-time Tauri event listener if not already active
  if (!unlistenMediaEvents) {
    try {
      const unlisten = await tauriBridge.onMediaSessionUpdated((session) => {
        processIncomingSession(session);
      });
      unlistenMediaEvents = unlisten;
    } catch (err) {
      console.error("Failed to subscribe to media events:", err);
    }
  }

  fetchAndUpdate();

  // Fail-safe relaxed backup poll every 3s
  if (pollTimer === null) {
    pollTimer = window.setInterval(fetchAndUpdate, 3000);
  }
}

function stopPolling() {
  if (listeners.size === 0) {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (progressTimer !== null) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
    if (unlistenMediaEvents) {
      unlistenMediaEvents();
      unlistenMediaEvents = null;
    }
  }
}

export function useMediaSession(enabled: boolean = true) {
  const [state, setState] = useState<MediaSessionState>(currentState);

  useEffect(() => {
    if (!enabled) return;

    listeners.add(setState);
    startPolling();

    return () => {
      listeners.delete(setState);
      stopPolling();
    };
  }, [enabled]);

  const togglePlay = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const nextPlaying = !currentState.isPlaying;
    optimisticPlayState = {
      target: nextPlaying,
      expiresAt: performance.now() + 850,
    };
    if (nextPlaying) {
      anchorTimestamp = performance.now();
    } else {
      anchorPositionSec = currentState.currentSec;
    }
    currentState = {
      ...currentState,
      isPlaying: nextPlaying,
    };
    notifyListeners();
    updatePlaybackTicker();
    tauriBridge.toggleMediaPlayPause().catch(console.error);
  }, []);

  const nextTrack = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    tauriBridge.mediaNextTrack().catch(console.error);
    setTimeout(fetchAndUpdate, 100);
    setTimeout(fetchAndUpdate, 350);
  }, []);

  const prevTrack = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    tauriBridge.mediaPrevTrack().catch(console.error);
    setTimeout(fetchAndUpdate, 100);
    setTimeout(fetchAndUpdate, 350);
  }, []);

  const toggleMute = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    tauriBridge.mediaVolumeMute().catch(console.error);
  }, []);

  const volumeUp = useCallback(() => {
    tauriBridge.mediaVolumeUp().catch(console.error);
  }, []);

  const volumeDown = useCallback(() => {
    tauriBridge.mediaVolumeDown().catch(console.error);
  }, []);

  const seekTrack = useCallback((sec: number) => {
    const duration = currentState.durationSec;
    const boundedSec = duration > 0 ? Math.max(0, Math.min(duration, sec)) : Math.max(0, sec);
    const pct = duration > 0 ? (boundedSec / duration) * 100 : 0;
    anchorPositionSec = boundedSec;
    anchorTimestamp = performance.now();
    currentState = {
      ...currentState,
      currentSec: boundedSec,
      progressPercent: pct,
    };
    notifyListeners();
    tauriBridge.mediaSeek(boundedSec).catch(console.error);
  }, []);

  const focusMediaApp = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    tauriBridge.focusMediaApp().catch(console.error);
  }, []);

  return {
    ...state,
    togglePlay,
    nextTrack,
    prevTrack,
    toggleMute,
    volumeUp,
    volumeDown,
    seekTrack,
    focusMediaApp,
  };
}
