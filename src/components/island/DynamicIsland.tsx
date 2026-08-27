import React, { useState, useEffect, useRef } from "react";
import { useSettings } from "../../stores/settingsStore";
import { useSystemMetrics } from "../../hooks/useSystemMetrics";
import { tauriBridge } from "../../services/tauriBridge";
import { MediaSessionInfo } from "../../types";

const DEMO_TRACKS = [
  {
    title: "Midnight City",
    artist: "M83",
    durationSec: 243,
  },
  {
    title: "Resonance",
    artist: "HOME",
    durationSec: 212,
  },
  {
    title: "Starboy",
    artist: "The Weeknd & Daft Punk",
    durationSec: 230,
  },
];

export const DynamicIsland: React.FC = () => {
  const { settings } = useSettings();
  const metrics = useSystemMetrics();
  const [expanded, setExpanded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [trackIndex, setTrackIndex] = useState(0);
  const [currentSec, setCurrentSec] = useState(65);
  const [timeStr, setTimeStr] = useState("");
  const [liveMedia, setLiveMedia] = useState<MediaSessionInfo | null>(null);
  const collapseTimeoutRef = useRef<number | null>(null);

  const isIslandEnabled = settings?.enable_dynamic_island ?? true;
  const showMedia = settings?.island_show_media ?? true;
  const showHardware = settings?.island_show_hardware ?? true;
  const showBattery = settings?.island_show_battery ?? true;

  const currentTrack = DEMO_TRACKS[trackIndex];

  // Synchronize Windows desktop Work Area with Dynamic Notch status
  useEffect(() => {
    tauriBridge.updateWorkArea(isIslandEnabled).catch(console.error);
    return () => {
      tauriBridge.updateWorkArea(false).catch(console.error);
    };
  }, [isIslandEnabled]);

  // Live Clock (10s interval is ultra lightweight)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  // Auto-Detect Windows Global System Media Transport (Spotify, Apple Music, YouTube, VLC)
  useEffect(() => {
    if (!showMedia) return;
    let isMounted = true;
    const pollMedia = async () => {
      try {
        const session = await tauriBridge.getMediaSessionInfo();
        if (isMounted) {
          setLiveMedia(session);
          if (session) {
            setIsPlaying(session.is_playing);
            if (session.current_sec > 0) {
              setCurrentSec(session.current_sec);
            }
          }
        }
      } catch (err) {
        console.error("Error polling media session:", err);
      }
    };
    pollMedia();
    const interval = setInterval(pollMedia, 1500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [showMedia]);

  // Media Progress Ticker
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentSec((prev) => (prev >= (liveMedia?.duration_sec || currentTrack.durationSec) ? 0 : prev + 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, liveMedia?.duration_sec, currentTrack.durationSec]);

  if (!isIslandEnabled) return null;

  const activeTitle = liveMedia?.title || currentTrack.title;
  const activeArtist = liveMedia?.artist || currentTrack.artist;
  const activeIsPlaying = liveMedia ? liveMedia.is_playing : isPlaying;
  const activeDuration = liveMedia && liveMedia.duration_sec > 0 ? liveMedia.duration_sec : currentTrack.durationSec;
  const activeCurrentSec = currentSec > activeDuration ? activeDuration : currentSec;
  const progressPercent = activeDuration > 0 ? (activeCurrentSec / activeDuration) * 100 : 0;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const formatNegativeTime = (current: number, total: number) => {
    const remaining = total > current ? total - current : 0;
    return `-${formatTime(remaining)}`;
  };

  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = null;
    }
    setExpanded(true);
    tauriBridge.setWindowHeight(true, 220).catch(console.error);
  };

  const handleCollapse = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpanded(false);
    tauriBridge.setWindowHeight(false).catch(console.error);
  };

  const handleTogglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPlaying(!isPlaying);
    tauriBridge.toggleMediaPlayPause().catch(console.error);
  };

  const handleNextTrack = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTrackIndex((prev) => (prev + 1) % DEMO_TRACKS.length);
    setCurrentSec(0);
    tauriBridge.mediaNextTrack().catch(console.error);
  };

  const handlePrevTrack = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTrackIndex((prev) => (prev - 1 + DEMO_TRACKS.length) % DEMO_TRACKS.length);
    setCurrentSec(0);
    tauriBridge.mediaPrevTrack().catch(console.error);
  };

  const handleScrubberClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    setCurrentSec(Math.floor(pct * activeDuration));
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.deltaY < 0) {
      tauriBridge.mediaVolumeUp().catch(console.error);
    } else if (e.deltaY > 0) {
      tauriBridge.mediaVolumeDown().catch(console.error);
    }
  };

  const batteryPct = metrics?.battery_percent ?? 100;
  const isCharging = metrics?.is_charging ?? false;

  const modeClass = expanded
    ? "dynamic-notch--expanded"
    : showMedia && activeIsPlaying
    ? "dynamic-notch--activity"
    : "dynamic-notch--compact";

  return (
    <>
      {/* Click-outside backdrop when expanded */}
      {expanded && <div className="island-backdrop" onClick={() => handleCollapse()} />}

      <div className="dynamic-notch-wrapper">
        {/* Left Concave Wing Ear */}
        <div className="notch-ear notch-ear--left" />

        {/* Dynamic Notch Pitch-Black Hub */}
        <div className={`dynamic-notch ${modeClass}`} onClick={handleExpand} onWheel={handleWheel}>
          {/* ─── State 1: Compact Notch (Clean Time & Battery - Zero Fake Camera) ─── */}
          {!expanded && (!showMedia || !activeIsPlaying) && (
            <div className="notch-compact-layout">
              <div className="notch-compact-left">
                <span className="notch-compact-time">{timeStr || "08:09 PM"}</span>
              </div>

              {showBattery && (
                <div className="notch-compact-right">
                  <div className="notch-battery-icon">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="#38bdf8">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                  </div>
                  <span>{batteryPct}%</span>
                </div>
              )}
            </div>
          )}

          {/* ─── State 2: Live Activity Notch (Mini Playing State - Exact Image 1 Match) ─── */}
          {!expanded && showMedia && activeIsPlaying && (
            <div className="notch-activity-layout">
              <div className="notch-activity-left">
                <div className="notch-album-thumb">
                  {liveMedia?.album_art_base64 ? (
                    <img src={liveMedia.album_art_base64} alt="Album Art" />
                  ) : (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="#ffffff">
                      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </div>
              </div>

              <div className="notch-activity-right">
                <div className="notch-equalizer-wave">
                  <span className="notch-wave-bar" />
                  <span className="notch-wave-bar" />
                  <span className="notch-wave-bar" />
                  <span className="notch-wave-bar" />
                </div>
              </div>
            </div>
          )}

          {/* ─── State 3: Full Expanded Notch Card (Exact Match to User Reference) ── */}
          {expanded && (
            <div className="notch-expanded-card" onClick={(e) => e.stopPropagation()}>
              {/* Row 1: Album Art + Track Info + Top-Right Waveform */}
              <div className="notch-card-top-row">
                <div className="notch-card-media-left">
                  <div className="notch-card-art">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="#ffffff">
                      <path d="M9 18V5l12-2v13" />
                      <circle cx="6" cy="18" r="3" />
                      <circle cx="18" cy="16" r="3" />
                    </svg>
                  </div>
                  <div className="notch-card-text">
                    <span className="notch-card-title">{activeTitle}</span>
                    <span className="notch-card-artist">{activeArtist}</span>
                  </div>
                </div>

                <div className="notch-card-wave-right">
                  <div className={`notch-equalizer-wave ${!activeIsPlaying ? "notch-equalizer-wave--paused" : ""}`}>
                    <span className="notch-wave-bar" />
                    <span className="notch-wave-bar" />
                    <span className="notch-wave-bar" />
                    <span className="notch-wave-bar" />
                  </div>
                </div>
              </div>

              {/* Row 2: Scrubber Track with Inline Timestamps */}
              <div className="notch-card-scrubber-row">
                <span className="notch-time-label">
                  {formatNegativeTime(activeCurrentSec, activeDuration)}
                </span>
                <div className="notch-scrubber-track" onClick={handleScrubberClick}>
                  <div className="notch-scrubber-fill" style={{ width: `${progressPercent}%` }} />
                  <div className="notch-scrubber-thumb" style={{ left: `${progressPercent}%` }} />
                </div>
                <span className="notch-time-label">{formatTime(activeDuration)}</span>
              </div>

              {/* Row 3: 5 Evenly Distributed Playback Controls */}
              <div className="notch-card-controls-row">
                {/* 1. Shuffle */}
                <button
                  className={`notch-btn-icon ${isShuffle ? "notch-btn-icon--active" : ""}`}
                  onClick={() => setIsShuffle(!isShuffle)}
                  title="Shuffle"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 3 21 3 21 8" />
                    <line x1="4" y1="20" x2="21" y2="3" />
                    <polyline points="21 16 21 21 16 21" />
                    <line x1="15" y1="15" x2="21" y2="21" />
                    <line x1="4" y1="4" x2="9" y2="9" />
                  </svg>
                </button>

                {/* 2. Previous Track */}
                <button className="notch-btn-icon" onClick={handlePrevTrack} title="Previous">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M23.84,6.47l.05,11.53c0,1.07-1.45,1.68-2.45,1.02l-8.86-5.79c-.8-.52-.8-1.53,0-2.05l8.81-5.74c1-.65,2.46-.04,2.46,1.03Z" />
                    <path d="M11.93,6.47l.05,11.53c0,1.07-1.45,1.68-2.45,1.02L.67,13.23c-.8-.52-.8-1.53,0-2.05l8.81-5.74c1-.65,2.46-.04,2.46,1.03Z" />
                  </svg>
                </button>

                {/* 3. Play / Pause Button */}
                <button
                  className="notch-btn-icon notch-btn-icon--play"
                  onClick={handleTogglePlay}
                  title={activeIsPlaying ? "Pause" : "Play"}
                >
                  {activeIsPlaying ? (
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                      <rect x="5" y="3" width="5" height="18" rx="1.5" />
                      <rect x="14" y="3" width="5" height="18" rx="1.5" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                      <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
                    </svg>
                  )}
                </button>

                {/* 4. Next Track */}
                <button className="notch-btn-icon" onClick={handleNextTrack} title="Next">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M.12,17.5l-.05-11.11c0-1.03,1.45-1.61,2.45-.98l8.86,5.58c.8.5.8,1.48,0,1.98l-8.81,5.53c-1,.63-2.46.04-2.46-.99Z" />
                    <path d="M12.03,17.5l-.05-11.11c0-1.03,1.45-1.61,2.45-.98l8.86,5.58c.8.5.8,1.48,0,1.98l-8.81,5.53c-1,.63-2.46.04-2.46-.99Z" />
                  </svg>
                </button>

                {/* 5. Playlist / List */}
                <button className="notch-btn-icon" onClick={handleCollapse} title="Queue">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <rect x="3" y="6" width="18" height="2" rx="1" />
                    <rect x="3" y="11" width="18" height="2" rx="1" />
                    <rect x="3" y="16" width="18" height="2" rx="1" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Concave Wing Ear */}
        <div className="notch-ear notch-ear--right" />
      </div>
    </>
  );
};
