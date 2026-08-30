import React, { useState, useEffect } from "react";
import { useSettings } from "../../stores/settingsStore";
import { useMediaSession } from "../../hooks/useMediaSession";
import { windowExpansion } from "../../services/windowExpansion";

export const MediaCapsule: React.FC = () => {
  const { settings } = useSettings();
  const isMediaBarEnabled = (settings?.enabled_widgets ?? []).includes("media") && settings?.media_location !== "notch";

  const {
    liveMedia: liveSession,
    dynamicTheme,
    isPlaying,
    currentSec,
    durationSec,
    progressPercent: progress,
    togglePlay: handleTogglePlay,
    nextTrack: handleNext,
    prevTrack: handlePrev,
    toggleMute: handleToggleMute,
    seekTrack,
    focusMediaApp,
  } = useMediaSession(isMediaBarEnabled);

  const [showControls, setShowControls] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const displayTitle = liveSession?.title?.trim() || (liveSession ? "Connecting Audio..." : "No Media Playing");
  const displayArtist = liveSession?.artist?.trim() || (liveSession ? "Resolving Stream..." : "Play music or video");

  // Dynamic vibrant palette shifting on every track like the Notch
  const getDynamicColor = (title: string, artist: string) => {
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
      glowColor: `hsla(${hue}, 88%, 58%, 0.45)`,
    };
  };

  const dynamicColor = dynamicTheme || getDynamicColor(displayTitle, displayArtist);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const handleToggleFlyout = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!showControls) {
      setShowControls(true);
      windowExpansion.request("media-capsule", 240);
    } else {
      setShowControls(false);
      windowExpansion.release("media-capsule");
    }
  };

  const handleScrubberClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (durationSec <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const ratio = rect.width > 0 ? clickX / rect.width : 0;
    seekTrack(Math.round(ratio * durationSec));
  };

  const onMuteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMuted(!isMuted);
    handleToggleMute(e);
  };

  // Close flyout when clicking outside
  useEffect(() => {
    if (!showControls) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".media-capsule-wrapper")) {
        setShowControls(false);
        windowExpansion.release("media-capsule");
      }
    };
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, [showControls]);

  // Clean up window expansion on unmount
  useEffect(() => {
    return () => {
      windowExpansion.release("media-capsule");
    };
  }, []);

  return (
    <div className="media-capsule-wrapper">
      {/* Pop-up Bounce Media Controls Card */}
      {showControls && (
        <div
          className="media-controls-flyout"
          onClick={(e) => e.stopPropagation()}
          style={{
            ["--wave-color" as any]: dynamicColor.waveColor,
            ["--wave-gradient" as any]: dynamicColor.waveGradient,
            ["--wave-glow" as any]: dynamicColor.glowColor,
          }}
        >
          {/* Top Row: Art + Info + Equalizer */}
          <div className="media-flyout-top">
            <div className="media-flyout-art">
              <img
                src={liveSession?.album_art_base64 || "/albumcover-placeholder.png"}
                alt="Album Art"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/albumcover-placeholder.png";
                }}
              />
            </div>
            <div className="media-flyout-details">
              <span className="media-flyout-title">{displayTitle}</span>
              <span className="media-flyout-artist">{displayArtist}</span>
            </div>
            <div className={`media-equalizer ${isPlaying ? "media-equalizer--playing" : ""}`}>
              <span className="eq-bar eq-bar-1" />
              <span className="eq-bar eq-bar-2" />
              <span className="eq-bar eq-bar-3" />
              <span className="eq-bar eq-bar-4" />
            </div>
          </div>

          {/* Middle Row: Scrubber */}
          <div className="media-flyout-scrubber-row">
            <span className="media-flyout-time">{formatTime(currentSec)}</span>
            <div className="media-flyout-track" onClick={handleScrubberClick}>
              <div className="media-flyout-fill" style={{ width: `${progress}%` }} />
              <div className="media-flyout-thumb" style={{ left: `${progress}%` }} />
            </div>
            <span className="media-flyout-time">{formatTime(durationSec)}</span>
          </div>

          {/* Bottom Row: 5 Playback & App Controls */}
          <div className="media-flyout-buttons">
            {/* 1. Open Source Media App (Far Left) */}
            <button
              className="media-flyout-btn"
              onClick={focusMediaApp}
              title="Open Playing App"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </button>

            {/* 2. Previous Track */}
            <button
              className="media-flyout-btn"
              onClick={handlePrev}
              title="Previous Track"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22 5.5a1.2 1.2 0 0 0-1.85-.98L13.3 9.7a1.2 1.2 0 0 0 0 1.96l6.85 5.18A1.2 1.2 0 0 0 22 15.86V5.5zm-11 0a1.2 1.2 0 0 0-1.85-.98L2.3 9.7a1.2 1.2 0 0 0 0 1.96l6.85 5.18A1.2 1.2 0 0 0 11 15.86V5.5z" />
              </svg>
            </button>

            {/* 3. Play / Pause (Prominent Center Button) */}
            <button
              className="media-flyout-btn media-flyout-btn--play"
              onClick={handleTogglePlay}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="5.5" y="3.5" width="4.5" height="17" rx="1.8" />
                  <rect x="14" y="3.5" width="4.5" height="17" rx="1.8" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 4.5a1.5 1.5 0 0 1 2.3-1.28l12 7.5a1.5 1.5 0 0 1 0 2.56l-12 7.5A1.5 1.5 0 0 1 6 19.5V4.5z" />
                </svg>
              )}
            </button>

            {/* 4. Next Track */}
            <button
              className="media-flyout-btn"
              onClick={handleNext}
              title="Next Track"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2 5.5a1.2 1.2 0 0 1 1.85-.98L10.7 9.7a1.2 1.2 0 0 1 0 1.96l-6.85 5.18A1.2 1.2 0 0 1 2 15.86V5.5zm11 0a1.2 1.2 0 0 1 1.85-.98L21.7 9.7a1.2 1.2 0 0 1 0 1.96l-6.85 5.18A1.2 1.2 0 0 1 13 15.86V5.5z" />
              </svg>
            </button>

            {/* 5. System Audio Mute / Unmute (Far Right) */}
            <button
              className={`media-flyout-btn ${isMuted ? "media-flyout-btn--muted" : ""}`}
              onClick={onMuteClick}
              title={isMuted ? "Unmute Sound" : "Mute Sound"}
            >
              {isMuted ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Main Taskbar Compact Media Capsule (Fixed Size, Title + Animated Waveform Only) */}
      <div
        className={`capsule capsule--compact media-capsule ${
          showControls ? "media-capsule--active-flyout" : ""
        }`}
        style={{
          ["--wave-color" as any]: dynamicColor.waveColor,
          ["--wave-gradient" as any]: dynamicColor.waveGradient,
          ["--wave-glow" as any]: dynamicColor.glowColor,
        }}
        onClick={handleToggleFlyout}
        title="Click to open Media Controls"
      >
        <div className="media-content">
          {/* Album Artwork Thumbnail */}
          <div className="media-album-thumb">
            <img
              src={liveSession?.album_art_base64 || "/albumcover-placeholder.png"}
              alt="Album Art"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/albumcover-placeholder.png";
              }}
            />
          </div>

          {/* Track Details */}
          <div className="media-info">
            <span className="media-title">{displayTitle}</span>
            <span className="media-artist">{displayArtist}</span>
          </div>

          {/* Live Equalizer Animation Bars */}
          <div className={`media-equalizer ${isPlaying ? "media-equalizer--playing" : ""}`}>
            <span className="eq-bar eq-bar-1" />
            <span className="eq-bar eq-bar-2" />
            <span className="eq-bar eq-bar-3" />
          </div>
        </div>

        {/* Progress Line */}
        <div className="media-progress-bar">
          <div className="media-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
};

