import React, { useState, useEffect } from "react";
import { useSettings } from "../../stores/settingsStore";
import { useBluetooth } from "../../hooks/useBluetooth";
import { useSystemMetrics } from "../../hooks/useSystemMetrics";
import { tauriBridge } from "../../services/tauriBridge";
import { windowExpansion } from "../../services/windowExpansion";
import { MediaSessionInfo } from "../../types";
import { albumArtService, TrackColorTheme } from "../../services/albumArtService";

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
  const isIslandEnabled = settings?.enable_dynamic_island ?? true;
  const showMedia = isIslandEnabled && (settings?.media_location ?? "notch") === "notch" && (settings?.island_show_media ?? true);
  const showBluetooth = isIslandEnabled && (settings?.island_show_bluetooth ?? true);

  const bluetooth = useBluetooth();
  const systemMetrics = useSystemMetrics(isIslandEnabled);
  const batteryPercent = systemMetrics?.battery_percent ?? 100;

  const [currentTime, setCurrentTime] = useState<string>(() => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const [expandedType, setExpandedType] = useState<"media" | "bluetooth" | null>(null);
  const [splitViewMode, setSplitViewMode] = useState<"media_main" | "bt_main">("media_main");
  const [isPlaying, setIsPlaying] = useState(true);
  const [isShuffle, setIsShuffle] = useState(false);
  const [trackIndex, setTrackIndex] = useState(0);
  const [currentSec, setCurrentSec] = useState(65);
  const [liveMedia, setLiveMedia] = useState<MediaSessionInfo | null>(null);
  const [dynamicTheme, setDynamicTheme] = useState<TrackColorTheme | null>(null);

  const currentTrack = DEMO_TRACKS[trackIndex];
  const { activeDevice: activeBtDevice, isConnected: isBtConnected } = bluetooth;
  const btBatteryPct = activeBtDevice?.battery_percent ?? 80;

  // Auto-Detect Windows Global System Media Transport (Only polls when showMedia is active)
  useEffect(() => {
    if (!showMedia) {
      setLiveMedia(null);
      return;
    }
    let isMounted = true;
    const pollMedia = async () => {
      try {
        const session = await tauriBridge.getMediaSessionInfo();
        if (isMounted) {
          if (session && (session.title?.trim() || session.artist?.trim())) {
            let art = session.album_art_base64;
            if (!art) {
              art = albumArtService.getCached(session.title, session.artist) || undefined;
              if (!art) {
                albumArtService.fetchAlbumArt(session.title, session.artist).then((fetchedArt) => {
                  if (fetchedArt && isMounted) {
                    setLiveMedia((prev) => (prev && prev.title === session.title ? { ...prev, album_art_base64: fetchedArt } : prev));
                  }
                });
              }
            }
            setLiveMedia({ ...session, album_art_base64: art });
            if (session.current_sec > 0) {
              setCurrentSec(session.current_sec);
            }
          } else {
            setLiveMedia(null);
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

  // Extract vibrant theme colors from album artwork
  useEffect(() => {
    const artUrl = liveMedia?.album_art_base64;
    if (!artUrl) {
      setDynamicTheme(null);
      return;
    }
    const cached = albumArtService.getColorCached(artUrl);
    if (cached) {
      setDynamicTheme(cached);
      return;
    }
    albumArtService.extractDominantColor(artUrl).then((theme) => {
      if (theme) {
        setDynamicTheme(theme);
      }
    });
  }, [liveMedia?.album_art_base64]);

  const activeIsPlaying = liveMedia ? liveMedia.is_playing : isPlaying;

  // Media Progress Ticker (Only ticks when media is actually playing)
  useEffect(() => {
    if (!showMedia || !activeIsPlaying) return;
    const interval = setInterval(() => {
      setCurrentSec((prev) => (prev >= (liveMedia?.duration_sec || currentTrack.durationSec) ? 0 : prev + 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [showMedia, activeIsPlaying, liveMedia?.duration_sec, currentTrack.durationSec]);

  const hasLiveMedia = liveMedia !== null && (Boolean(liveMedia.title?.trim()) || Boolean(liveMedia.artist?.trim()));
  const activeTitle = liveMedia?.title || (isPlaying ? currentTrack.title : (liveMedia ? "" : currentTrack.title));
  const activeArtist = liveMedia?.artist || (isPlaying ? currentTrack.artist : (liveMedia ? "" : currentTrack.artist));
  const activeDuration = liveMedia && liveMedia.duration_sec > 0 ? liveMedia.duration_sec : currentTrack.durationSec;
  const activeCurrentSec = currentSec > activeDuration ? activeDuration : currentSec;
  const progressPercent = activeDuration > 0 ? (activeCurrentSec / activeDuration) * 100 : 0;

  // Media session is active whenever there is a live media track / app open (playing or paused)
  const hasMediaSession = showMedia && (hasLiveMedia || Boolean(activeTitle));
  // Multi-activity is active when media session exists AND a real bluetooth device is connected!
  const isMultiActivity = hasMediaSession && showBluetooth && isBtConnected && activeBtDevice !== null;

  if (!isIslandEnabled) {
    return null;
  }

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const formatNegativeTime = (current: number, total: number) => {
    const remaining = total > current ? total - current : 0;
    return `-${formatTime(remaining)}`;
  };

  const handleExpandMedia = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedType("media");
    windowExpansion.request("island", 220);
  };

  const handleExpandBluetooth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedType("bluetooth");
    windowExpansion.request("island", 180);
  };

  const handleCollapse = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedType(null);
    windowExpansion.release("island");
  };

  // When clicking the main (left) section: open/expand the active feature
  const handleMainPillClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (splitViewMode === "media_main") {
      handleExpandMedia(e);
    } else {
      handleExpandBluetooth(e);
    }
  };

  // When clicking the secondary (right) section: SWAP PLACES (do not open directly)
  const handleSecondaryPillClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSplitViewMode((prev) => (prev === "media_main" ? "bt_main" : "media_main"));
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

  const getTrackColor = (title: string, artist: string) => {
    let hash = 0;
    const str = `${title}__${artist}`;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const hue = Math.abs(hash) % 360;
    const topColor = `hsl(${hue}, 90%, 82%)`;
    const botColor = `hsl(${hue}, 85%, 46%)`;
    return {
      waveColor: `hsl(${hue}, 88%, 58%)`,
      waveGradient: `linear-gradient(180deg, ${topColor} 0%, ${botColor} 100%)`,
      waveGradientTop: topColor,
      waveGradientBottom: botColor,
      glowColor: `hsla(${hue}, 88%, 58%, 0.45)`,
    };
  };

  const fallbackTheme = getTrackColor(activeTitle, activeArtist);
  const trackTheme = dynamicTheme || fallbackTheme;

  // Circular ring calculation for Image 1: 42px SVG (radius 17)
  const ringRadius = 17;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (btBatteryPct / 100) * ringCircumference;

  // Mini circular ring calculation for Image 2 & 3: 13px SVG (radius 4.2)
  const miniRadius = 4.2;
  const miniCircumference = 2 * Math.PI * miniRadius;
  const miniOffset = miniCircumference - (btBatteryPct / 100) * miniCircumference;

  const renderLightBorder = () => (
    <div className="notch-light-border" aria-hidden="true">
      <div className="notch-stream-half notch-stream--left">
        <div className="notch-stream-comet" />
      </div>
      <div className="notch-stream-half notch-stream--right">
        <div className="notch-stream-comet" />
      </div>
    </div>
  );

  return (
    <>
      {/* Backdrop for click-outside collapse */}
      {expandedType !== null && (
        <div className="island-backdrop" onClick={() => handleCollapse()} />
      )}

      <div className="dynamic-notch-wrapper">
        {/* ─── CASE A: EXPANDED BLUETOOTH CARD ─── */}
        {expandedType === "bluetooth" && (
          <div
            className="dynamic-notch dynamic-notch--bluetooth-expanded"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Left Concave Wing Ear */}
            <div className="notch-ear notch-ear--left" />
            {/* Right Concave Wing Ear */}
            <div className="notch-ear notch-ear--right" />
            {/* Moving Light Border Beam */}
            {renderLightBorder()}

            <div className="notch-bluetooth-expanded-card">
              {/* Left Badge: Dark Circle with Bluetooth Emblem & Side Bars */}
              <div className="notch-bt-badge">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5" />
                  <line x1="1" y1="12" x2="4" y2="12" stroke="#94a3b8" strokeWidth="2" />
                  <line x1="20" y1="12" x2="23" y2="12" stroke="#94a3b8" strokeWidth="2" />
                </svg>
              </div>

              {/* Center / Middle Text Stack */}
              <div className="notch-bt-info">
                <span className="notch-bt-status">Connected</span>
                <span className="notch-bt-name">
                  {activeBtDevice?.name || "Bluetooth Device"}
                </span>
              </div>

              {/* Right: Circular Ring Battery Meter */}
              <div className="notch-bt-battery-ring-container">
                <svg className="notch-bt-ring-svg" width="42" height="42" viewBox="0 0 42 42">
                  <circle
                    cx="21"
                    cy="21"
                    r={ringRadius}
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.12)"
                    strokeWidth="3.2"
                  />
                  <circle
                    cx="21"
                    cy="21"
                    r={ringRadius}
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeDasharray={ringCircumference}
                    strokeDashoffset={ringOffset}
                    transform="rotate(-90 21 21)"
                  />
                </svg>
                <span className="notch-bt-ring-text">{btBatteryPct}%</span>
              </div>
            </div>
          </div>
        )}

        {/* ─── CASE B: EXPANDED MEDIA CARD ─── */}
        {expandedType === "media" && (
          <div
            className="dynamic-notch dynamic-notch--expanded"
            onClick={(e) => e.stopPropagation()}
            onWheel={handleWheel}
            style={{
              ["--wave-color" as any]: trackTheme.waveColor,
              ["--wave-gradient" as any]: trackTheme.waveGradient,
              ["--wave-gradient-top" as any]: trackTheme.waveGradientTop,
              ["--wave-gradient-bottom" as any]: trackTheme.waveGradientBottom,
              ["--wave-glow" as any]: trackTheme.glowColor,
            }}
          >
            {/* Left Concave Wing Ear */}
            <div className="notch-ear notch-ear--left" />
            {/* Right Concave Wing Ear */}
            <div className="notch-ear notch-ear--right" />
            {/* Moving Light Border Beam */}
            {renderLightBorder()}

            <div className="notch-expanded-card">
              {/* Row 1: Album Art + Track Info + Top-Right Waveform */}
              <div className="notch-card-top-row">
                <div className="notch-card-media-left">
                  <div className="notch-card-art">
                    <img
                      src={liveMedia?.album_art_base64 || "/albumcover-placeholder.png"}
                      alt="Album Art"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/albumcover-placeholder.png";
                      }}
                    />
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

              {/* Row 3: 5 Playback Controls (Evenly Clustered & Enlarged) */}
              <div className="notch-card-controls-row">
                {/* 1. Shuffle */}
                <button
                  className={`notch-btn-icon ${isShuffle ? "notch-btn-icon--active" : ""}`}
                  onClick={() => setIsShuffle(!isShuffle)}
                  title="Shuffle"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 3 21 3 21 8" />
                    <line x1="4" y1="20" x2="21" y2="3" />
                    <polyline points="21 16 21 21 16 21" />
                    <line x1="15" y1="15" x2="21" y2="21" />
                    <line x1="4" y1="4" x2="9" y2="9" />
                  </svg>
                </button>

                {/* 2. Previous Track */}
                <button className="notch-btn-icon" onClick={handlePrevTrack} title="Previous">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                    <path d="M22 5.5a1.2 1.2 0 0 0-1.85-.98L13.3 9.7a1.2 1.2 0 0 0 0 1.96l6.85 5.18A1.2 1.2 0 0 0 22 15.86V5.5zm-11 0a1.2 1.2 0 0 0-1.85-.98L2.3 9.7a1.2 1.2 0 0 0 0 1.96l6.85 5.18A1.2 1.2 0 0 0 11 15.86V5.5z" />
                  </svg>
                </button>

                {/* 3. Play / Pause Button */}
                <button
                  className="notch-btn-icon notch-btn-icon--play"
                  onClick={handleTogglePlay}
                  title={activeIsPlaying ? "Pause" : "Play"}
                >
                  {activeIsPlaying ? (
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                      <rect x="5.5" y="3.5" width="4.5" height="17" rx="1.8" />
                      <rect x="14" y="3.5" width="4.5" height="17" rx="1.8" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                      <path d="M6 4.5a1.5 1.5 0 0 1 2.3-1.28l12 7.5a1.5 1.5 0 0 1 0 2.56l-12 7.5A1.5 1.5 0 0 1 6 19.5V4.5z" />
                    </svg>
                  )}
                </button>

                {/* 4. Next Track */}
                <button className="notch-btn-icon" onClick={handleNextTrack} title="Next">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                    <path d="M2 5.5a1.2 1.2 0 0 1 1.85-.98L10.7 9.7a1.2 1.2 0 0 1 0 1.96l-6.85 5.18A1.2 1.2 0 0 1 2 15.86V5.5zm11 0a1.2 1.2 0 0 1 1.85-.98L21.7 9.7a1.2 1.2 0 0 1 0 1.96l-6.85 5.18A1.2 1.2 0 0 1 13 15.86V5.5z" />
                  </svg>
                </button>

                {/* 5. Switch / Collapse */}
                <button className="notch-btn-icon" onClick={handleCollapse} title="Queue">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <circle cx="4.5" cy="6" r="1.5" />
                    <rect x="8.5" y="4.75" width="12" height="2.5" rx="1.25" />
                    <circle cx="4.5" cy="12" r="1.5" />
                    <rect x="8.5" y="10.75" width="12" height="2.5" rx="1.25" />
                    <circle cx="4.5" cy="18" r="1.5" />
                    <rect x="8.5" y="16.75" width="12" height="2.5" rx="1.25" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── CASE C: MULTI-ACTIVITY SPLIT NOTCH ─── */}
        {expandedType === null && isMultiActivity && (
          <div className="notch-split-container">
            {/* 1. Main Left Pill */}
            <div
              className={`dynamic-notch notch-split-main ${
                splitViewMode === "media_main" ? "notch-split-main--media" : "notch-split-main--bluetooth"
              }`}
              onClick={handleMainPillClick}
              onWheel={handleWheel}
              style={{
                ["--wave-color" as any]: trackTheme.waveColor,
                ["--wave-gradient" as any]: trackTheme.waveGradient,
                ["--wave-gradient-top" as any]: trackTheme.waveGradientTop,
                ["--wave-gradient-bottom" as any]: trackTheme.waveGradientBottom,
                ["--wave-glow" as any]: trackTheme.glowColor,
              }}
              title={
                splitViewMode === "media_main"
                  ? `${activeTitle} — Click to expand Media`
                  : `${activeBtDevice?.name || "Bluetooth"} — Click to expand Bluetooth`
              }
            >
              {/* Left Concave Wing Ear */}
              <div className="notch-ear notch-ear--left" />
              {/* Right Concave Wing Ear */}
              <div className="notch-ear notch-ear--right" />
              {/* Moving Light Border Beam */}
              {renderLightBorder()}

              {/* Sub-State: Media on Main Pill */}
              {splitViewMode === "media_main" ? (
                <div className="notch-split-media-layout">
                  <div className="notch-album-thumb">
                    <img
                      src={liveMedia?.album_art_base64 || "/albumcover-placeholder.png"}
                      alt="Album Art"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/albumcover-placeholder.png";
                      }}
                    />
                  </div>

                  <div className={`notch-equalizer-wave ${!activeIsPlaying ? "notch-equalizer-wave--paused" : ""}`}>
                    <span className="notch-wave-bar" />
                    <span className="notch-wave-bar" />
                    <span className="notch-wave-bar" />
                    <span className="notch-wave-bar" />
                  </div>
                </div>
              ) : (
                /* Sub-State: Bluetooth on Main Pill */
                <div className="notch-split-bt-layout">
                  <div className="notch-split-bt-icon">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5" />
                    </svg>
                  </div>

                  <div className="notch-split-bt-name">
                    {activeBtDevice?.name || "Bluetooth Device"}
                  </div>

                  <div className="notch-mini-battery-ring">
                    <svg width="13" height="13" viewBox="0 0 13 13">
                      <circle
                        cx="6.5"
                        cy="6.5"
                        r={miniRadius}
                        fill="none"
                        stroke="rgba(255, 255, 255, 0.18)"
                        strokeWidth="2.0"
                      />
                      <circle
                        cx="6.5"
                        cy="6.5"
                        r={miniRadius}
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="2.0"
                        strokeLinecap="round"
                        strokeDasharray={miniCircumference}
                        strokeDashoffset={miniOffset}
                        transform="rotate(-90 6.5 6.5)"
                      />
                    </svg>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Detached Secondary Right Pill */}
            <div
              className="dynamic-notch notch-split-secondary"
              onClick={handleSecondaryPillClick}
              title={
                splitViewMode === "media_main"
                  ? "Bluetooth active — Click to switch to main"
                  : "Now Playing — Click to switch to main"
              }
            >
              {/* Left Concave Wing Ear */}
              <div className="notch-ear notch-ear--left" />
              {/* Right Concave Wing Ear */}
              <div className="notch-ear notch-ear--right" />
              {/* Moving Light Border Beam */}
              {renderLightBorder()}

              {splitViewMode === "media_main" ? (
                <div className="notch-mini-battery-ring">
                  <svg width="13" height="13" viewBox="0 0 13 13">
                    <circle
                      cx="6.5"
                      cy="6.5"
                      r={miniRadius}
                      fill="none"
                      stroke="rgba(255, 255, 255, 0.18)"
                      strokeWidth="2.0"
                    />
                    <circle
                      cx="6.5"
                      cy="6.5"
                      r={miniRadius}
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth="2.0"
                      strokeLinecap="round"
                      strokeDasharray={miniCircumference}
                      strokeDashoffset={miniOffset}
                      transform="rotate(-90 6.5 6.5)"
                    />
                  </svg>
                </div>
              ) : (
                <div className="notch-album-thumb notch-album-thumb--mini">
                  <img
                    src={liveMedia?.album_art_base64 || "/albumcover-placeholder.png"}
                    alt="Album Art"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/albumcover-placeholder.png";
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── CASE D: SINGLE ACTIVITY NOTCH ─── */}
        {expandedType === null && !isMultiActivity && hasMediaSession && (
          <div
            className="dynamic-notch dynamic-notch--activity"
            onClick={(e) => handleExpandMedia(e)}
            onWheel={handleWheel}
            style={{
              ["--wave-color" as any]: trackTheme.waveColor,
              ["--wave-gradient" as any]: trackTheme.waveGradient,
              ["--wave-gradient-top" as any]: trackTheme.waveGradientTop,
              ["--wave-gradient-bottom" as any]: trackTheme.waveGradientBottom,
              ["--wave-glow" as any]: trackTheme.glowColor,
            }}
          >
            {/* Left Concave Wing Ear */}
            <div className="notch-ear notch-ear--left" />
            {/* Right Concave Wing Ear */}
            <div className="notch-ear notch-ear--right" />
            {/* Moving Light Border Beam */}
            {renderLightBorder()}

            {/* Sub-State: Media Single Activity */}
            <div className="notch-activity-layout">
              <div className="notch-activity-left">
                <div className="notch-album-thumb">
                  <img
                    src={liveMedia?.album_art_base64 || "/albumcover-placeholder.png"}
                    alt="Album Art"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/albumcover-placeholder.png";
                    }}
                  />
                </div>
              </div>

              <div className="notch-activity-middle" title={`${activeTitle} — ${activeArtist}`}>
                <span className="notch-activity-title">{activeTitle}</span>
              </div>

              <div className="notch-activity-right">
                <div className={`notch-equalizer-wave ${!activeIsPlaying ? "notch-equalizer-wave--paused" : ""}`}>
                  <span className="notch-wave-bar" />
                  <span className="notch-wave-bar" />
                  <span className="notch-wave-bar" />
                  <span className="notch-wave-bar" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── CASE E: INACTIVE / IDLE COMPACT NOTCH ─── */}
        {expandedType === null && !isMultiActivity && !hasMediaSession && (
          <div
            className="dynamic-notch dynamic-notch--compact"
            style={{
              ["--wave-color" as any]: "#38bdf8",
              ["--wave-glow" as any]: "rgba(56, 189, 248, 0.45)",
            }}
          >
            {/* Left Concave Wing Ear */}
            <div className="notch-ear notch-ear--left" />
            {/* Right Concave Wing Ear */}
            <div className="notch-ear notch-ear--right" />
            {/* Moving Light Border Beam */}
            {renderLightBorder()}

            <div className="notch-compact-layout">
              <div className="notch-compact-left">
                <span className="notch-compact-time">{currentTime}</span>
              </div>
              <div className="notch-compact-right">
                <span>{batteryPercent}%</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};
