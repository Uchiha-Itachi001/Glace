import React, { useState, useEffect } from "react";
import { MediaTrack, MediaSessionInfo } from "../../types";
import { tauriBridge } from "../../services/tauriBridge";
import { useSettings } from "../../stores/settingsStore";
import { albumArtService, TrackColorTheme } from "../../services/albumArtService";

const DEMO_PLAYLIST: MediaTrack[] = [
  {
    title: "Midnight City",
    artist: "M83",
    isPlaying: false,
    progressPercent: 45,
    durationSec: 243,
    currentSec: 109,
  },
  {
    title: "Resonance",
    artist: "HOME",
    isPlaying: false,
    progressPercent: 62,
    durationSec: 212,
    currentSec: 131,
  },
];

export const MediaCapsule: React.FC = () => {
  const { settings } = useSettings();
  const isMediaBarEnabled = (settings?.enabled_widgets ?? []).includes("media") && settings?.media_location !== "notch";

  const [trackIndex, setTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const [liveSession, setLiveSession] = useState<MediaSessionInfo | null>(null);
  const [dynamicColor, setDynamicColor] = useState<TrackColorTheme | null>(null);

  const fallbackTrack = DEMO_PLAYLIST[trackIndex];

  // Poll media session periodically only when media capsule is active on taskbar
  useEffect(() => {
    if (!isMediaBarEnabled) return;
    let isMounted = true;
    const fetchSession = async () => {
      try {
        const session = await tauriBridge.getMediaSessionInfo();
        if (isMounted) {
          if (session) {
            let art = session.album_art_base64;
            if (!art) {
              art = albumArtService.getCached(session.title, session.artist) || undefined;
              if (!art) {
                albumArtService.fetchAlbumArt(session.title, session.artist).then((fetchedArt) => {
                  if (fetchedArt && isMounted) {
                    setLiveSession((prev) => (prev && prev.title === session.title ? { ...prev, album_art_base64: fetchedArt } : prev));
                  }
                });
              }
            }
            setLiveSession({ ...session, album_art_base64: art });
            setIsPlaying(session.is_playing);
            if (session.duration_sec > 0) {
              setProgress(Math.min(100, Math.round((session.current_sec * 100) / session.duration_sec)));
            }
          } else {
            setLiveSession(null);
          }
        }
      } catch {
        // Ignore
      }
    };

    fetchSession();
    const timer = setInterval(fetchSession, 1500);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [isMediaBarEnabled]);

  // Extract vibrant theme colors from album art
  useEffect(() => {
    const artUrl = liveSession?.album_art_base64;
    if (!artUrl) {
      setDynamicColor(null);
      return;
    }
    const cached = albumArtService.getColorCached(artUrl);
    if (cached) {
      setDynamicColor(cached);
      return;
    }
    albumArtService.extractDominantColor(artUrl).then((color) => {
      if (color) {
        setDynamicColor(color);
      }
    });
  }, [liveSession?.album_art_base64]);

  const handleTogglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPlaying(!isPlaying);
    tauriBridge.toggleMediaPlayPause().catch(console.error);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTrackIndex((prev) => (prev + 1) % DEMO_PLAYLIST.length);
    tauriBridge.mediaNextTrack().catch(console.error);
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTrackIndex((prev) => (prev - 1 + DEMO_PLAYLIST.length) % DEMO_PLAYLIST.length);
    tauriBridge.mediaPrevTrack().catch(console.error);
  };

  const displayTitle = liveSession?.title || fallbackTrack.title;
  const displayArtist = liveSession?.artist || fallbackTrack.artist;

  return (
    <div
      className={`capsule capsule--compact media-capsule ${
        showControls ? "media-capsule--expanded" : ""
      }`}
      style={{
        ["--wave-color" as any]: dynamicColor?.waveColor,
        ["--wave-gradient" as any]: dynamicColor?.waveGradient,
        ["--wave-glow" as any]: dynamicColor?.glowColor,
      }}
      onClick={() => setShowControls(!showControls)}
      title="Media Player"
    >
      <div className="media-content">
        {/* Album Artwork Thumbnail */}
        {liveSession?.album_art_base64 ? (
          <div className="media-album-thumb">
            <img src={liveSession.album_art_base64} alt="Album Art" />
          </div>
        ) : (
          /* Animated Equalizer Waveform */
          <div className={`media-equalizer ${isPlaying ? "media-equalizer--playing" : ""}`}>
            <span className="eq-bar eq-bar-1" />
            <span className="eq-bar eq-bar-2" />
            <span className="eq-bar eq-bar-3" />
            <span className="eq-bar eq-bar-4" />
          </div>
        )}

        {/* Track Details */}
        <div className="media-info">
          <span className="media-title">{displayTitle}</span>
          <span className="media-artist">{displayArtist}</span>
        </div>

        {/* Mini Waveform next to track details if album thumbnail is displayed */}
        {Boolean(liveSession?.album_art_base64) && (
          <div className={`media-equalizer ${isPlaying ? "media-equalizer--playing" : ""}`}>
            <span className="eq-bar eq-bar-1" />
            <span className="eq-bar eq-bar-2" />
            <span className="eq-bar eq-bar-3" />
          </div>
        )}

        {/* Quick Media Controls */}
        <div className="media-controls" onClick={(e) => e.stopPropagation()}>
          <button
            className="media-btn icon-hover"
            onClick={handlePrev}
            title="Previous track"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="19 20 9 12 19 4 19 20" />
              <line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="3" />
            </svg>
          </button>

          <button
            className="media-btn media-btn--play icon-hover"
            onClick={handleTogglePlay}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
          </button>

          <button
            className="media-btn icon-hover"
            onClick={handleNext}
            title="Next track"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 4 15 12 5 20 5 4" />
              <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="3" />
            </svg>
          </button>
        </div>
      </div>

      {/* Progress Line */}
      <div className="media-progress-bar">
        <div className="media-progress-fill" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
};

