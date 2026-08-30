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
let lastTitle = "";
let lastArtist = "";
let lastArtUrl = "";

function notifyListeners() {
  listeners.forEach((fn) => fn(currentState));
}

function updatePlaybackTicker() {
  if (currentState.isPlaying && currentState.hasLiveMedia) {
    if (progressTimer === null) {
      progressTimer = window.setInterval(() => {
        if (!currentState.isPlaying || !currentState.hasLiveMedia) {
          if (progressTimer !== null) {
            clearInterval(progressTimer);
            progressTimer = null;
          }
          return;
        }

        const duration = currentState.durationSec;
        let nextSec = currentState.currentSec + 1;
        if (duration > 0 && nextSec > duration) {
          nextSec = duration;
        }
        const pct = duration > 0 ? (nextSec / duration) * 100 : 0;

        currentState = {
          ...currentState,
          currentSec: nextSec,
          progressPercent: pct,
        };
        notifyListeners();
      }, 1000);
    }
  } else {
    if (progressTimer !== null) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
  }
}

async function fetchAndUpdate() {
  if (listeners.size === 0) {
    stopPolling();
    return;
  }

  try {
    const session = await tauriBridge.getMediaSessionInfo();
    if (!session || (!session.title?.trim() && !session.artist?.trim())) {
      if (currentState.hasLiveMedia) {
        lastTitle = "";
        lastArtist = "";
        lastArtUrl = "";
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
          if (fetchedArt && currentState.liveMedia?.title === titleKey) {
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

    currentState = {
      liveMedia: { ...session, album_art_base64: art },
      dynamicTheme: theme,
      isPlaying: session.is_playing,
      currentSec,
      durationSec: duration,
      progressPercent,
      hasLiveMedia: true,
    };

    notifyListeners();
    updatePlaybackTicker();
  } catch (err) {
    console.error("Error polling media session:", err);
  }
}

function startPolling() {
  if (pollTimer !== null || listeners.size === 0) return;
  fetchAndUpdate();
  // Shared coordinated 1500ms poll across both Dynamic Island and Taskbar media capsules
  pollTimer = window.setInterval(fetchAndUpdate, 1500);
}

function stopPolling() {
  if (pollTimer !== null && listeners.size === 0) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (progressTimer !== null && listeners.size === 0) {
    clearInterval(progressTimer);
    progressTimer = null;
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
    tauriBridge.toggleMediaPlayPause().catch(console.error);
  }, []);

  const nextTrack = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    tauriBridge.mediaNextTrack().catch(console.error);
  }, []);

  const prevTrack = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    tauriBridge.mediaPrevTrack().catch(console.error);
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
    currentState = {
      ...currentState,
      currentSec: boundedSec,
      progressPercent: pct,
    };
    notifyListeners();
    tauriBridge.mediaSeek(boundedSec).catch(console.error);
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
  };
}
