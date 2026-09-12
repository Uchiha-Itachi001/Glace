import React, { useState, useEffect } from "react";
import { useSettings } from "../../stores/settingsStore";
import { useMediaSession } from "../../hooks/useMediaSession";
import { windowExpansion } from "../../services/windowExpansion";

const WAVEFORM_BARS = [
  8, 14, 10, 18, 22, 16, 12, 20, 24, 18, 14, 22, 16, 12, 18, 22, 26, 20, 15, 12, 16, 22, 18, 12, 16, 20, 24, 18, 14, 10, 16, 20, 14, 10, 8, 6,
];

export const MediaCapsule: React.FC = () => {
  const { settings } = useSettings();
  const isMediaBarEnabled = (settings?.enabled_widgets ?? []).includes("media") && settings?.media_location !== "notch";
  const mediaStyle = settings?.taskbar_media_style || "cover_pill";

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
  const [isLiked, setIsLiked] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);

  const clampedProgress = Math.min(100, Math.max(0, Number.isFinite(progress) ? progress : 0));

  const displayTitle = liveSession?.title?.trim() || (liveSession ? "Connecting Audio..." : "No Media Playing");
  const displayArtist = liveSession?.artist?.trim() || (liveSession ? "Resolving Stream..." : "Play music or video");
  const albumArt = liveSession?.album_art_base64 || "/albumcover-placeholder.png";

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
    // In live cover pill mode, never open the flyout
    if (mediaStyle === "cover_pill") return;

    if (!showControls) {
      setShowControls(true);
      // Window expansion matching horizontal pill card height
      const requestH = mediaStyle === "waveform_deck" ? 175 : mediaStyle === "perimeter_card" ? 165 : 165;
      windowExpansion.request("media-capsule", requestH);
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

  const onDirectPlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleTogglePlay(e);
  };

  const onDirectNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleNext(e);
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

  // SVG Circular progress arc calculations for Cover Pill
  const ringRadius = 13;
  const ringCircumference = 2 * Math.PI * ringRadius; // ~81.68
  const clampedProgress = Math.min(100, Math.max(0, progress));
  const strokeOffset = ringCircumference - (ringCircumference * clampedProgress) / 100;


  return (
    <div className="media-capsule-wrapper">
      {/* ── Pop-up Media Controls Flyout (Active Section) ── */}
      {showControls && mediaStyle !== "cover_pill" && (
        <>
          {mediaStyle === "waveform_deck" ? (
            /* ── Design: Golden Waveform Deck (Compact & Snug) ── */
            <div
              className="media-controls-flyout media-flyout--waveform"
              onClick={(e) => e.stopPropagation()}
              style={{
                ["--wave-color" as any]: dynamicColor.waveColor,
                ["--wave-gradient" as any]: dynamicColor.waveGradient,
                ["--wave-glow" as any]: dynamicColor.glowColor,
              }}
            >
              {/* Top Main Row: Album Art + Info + Waveform Scrubber */}
              <div className="waveform-deck-main-row">
                <div className="waveform-deck-art-box">
                  <img
                    src={albumArt}
                    alt="Album Art"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/albumcover-placeholder.png";
                    }}
                  />
                </div>

                <div className="waveform-deck-right-col">
                  {/* Header: NOW PLAYING Tag + Like Heart Button */}
                  <div className="waveform-deck-header">
                    <div className="waveform-deck-now-playing-tag">
                      <span className="waveform-tag-bars">ılılı</span>
                      <span>NOW PLAYING</span>
                    </div>

                    <button
                      className={`waveform-like-btn ${isLiked ? "waveform-like-btn--active" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsLiked(!isLiked);
                      }}
                      title="Favorite"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                      </svg>
                    </button>
                  </div>

                  {/* Title & Artist */}
                  <div className="waveform-deck-meta">
                    <span className="waveform-deck-title" title={displayTitle}>{displayTitle}</span>
                    <span className="waveform-deck-artist" title={displayArtist}>{displayArtist}</span>
                  </div>

                  {/* Interactive Soundwave Equalizer Scrubber */}
                  <div className="waveform-scrubber-container" onClick={handleScrubberClick} title="Seek Position">
                    <div className="waveform-bars-track">
                      {WAVEFORM_BARS.map((height, i) => {
                        const isFilled = (i / WAVEFORM_BARS.length) * 100 <= progress;
                        return (
                          <span
                            key={i}
                            className={`waveform-bar ${isFilled ? "waveform-bar--filled" : ""}`}
                            style={{ height: `${Math.round(height * 0.75)}px` }}
                          />
                        );
                      })}
                    </div>
                    <div className="waveform-time-row">
                      <span>{formatTime(currentSec)}</span>
                      <span>{formatTime(durationSec)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Transport Controls Bar */}
              <div className="waveform-deck-transport">
                <button
                  className={`waveform-ctrl-btn ${isShuffle ? "waveform-ctrl-btn--active" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsShuffle(!isShuffle);
                  }}
                  title="Shuffle"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 3 21 3 21 8" />
                    <line x1="4" y1="20" x2="21" y2="3" />
                    <polyline points="21 16 21 21 16 21" />
                    <line x1="15" y1="15" x2="21" y2="21" />
                    <line x1="4" y1="4" x2="9" y2="9" />
                  </svg>
                </button>

                <button
                  className="waveform-ctrl-btn"
                  onClick={handlePrev}
                  title="Previous Track"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                  </svg>
                </button>

                {/* Glowing Radiant Play/Pause Button */}
                <button
                  className="waveform-play-btn"
                  onClick={handleTogglePlay}
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" rx="1.5" />
                      <rect x="14" y="4" width="4" height="16" rx="1.5" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: "1.5px" }}>
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>

                <button
                  className="waveform-ctrl-btn"
                  onClick={handleNext}
                  title="Next Track"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                  </svg>
                </button>

                <button
                  className="waveform-ctrl-btn"
                  onClick={focusMediaApp}
                  title="Open Playing App"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" />
                    <polygon points="12 15 17 21 7 21 12 15" />
                  </svg>
                </button>
              </div>
            </div>
          ) : mediaStyle === "perimeter_card" ? (
            /* ── Design: Capsule Pill Card (Clean, Focused, Working Controls Only) ── */
            <div
              className="media-controls-flyout media-flyout--salmon-pill"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Main Card Body */}
              <div className="salmon-card-body">
                {/* Left/Center: Track Info + High-Contrast Scrubber + Centered Transport */}
                <div className="salmon-card-main">
                  {/* Top Meta Area */}
                  <div className="salmon-header-row">
                    <div className="salmon-title-block" onClick={focusMediaApp} title="Open Playing App">
                      <span className="salmon-source-badge">
                        {liveSession?.artist ? "NOW PLAYING" : "AUDIO DECK"}
                      </span>
                      <span className="salmon-track-title" title={displayTitle}>
                        {displayTitle}
                      </span>
                      <span className="salmon-track-artist" title={displayArtist}>
                        {displayArtist}
                      </span>
                    </div>
                  </div>

                  {/* Scrubber Container (High-Contrast, Clearly Visible Track & Knob) */}
                  <div className="salmon-scrubber-wrapper">
                    <div
                      className="salmon-scrubber-track"
                      onClick={handleScrubberClick}
                      title="Seek Position"
                    >
                      <div
                        className="salmon-scrubber-fill"
                        style={{ width: `${clampedProgress}%` }}
                      />
                      <div
                        className="salmon-scrubber-knob"
                        style={{ left: `${clampedProgress}%` }}
                      />
                    </div>

                    {/* Timestamp Row */}
                    <div className="salmon-time-row">
                      <span>{formatTime(currentSec)}</span>
                      <span>{formatTime(durationSec)}</span>
                    </div>
                  </div>

                  {/* Core Working Transport Buttons: Prev, Play/Pause, Next */}
                  <div className="salmon-transport-row">
                    {/* Previous */}
                    <button
                      className="salmon-nav-btn"
                      onClick={handlePrev}
                      title="Previous Track"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M11 6v12l-8.5-6L11 6zm8.5 0v12l-8.5-6 8.5-6z" />
                      </svg>
                    </button>

                    {/* Play / Pause Circular Button */}
                    <button
                      className="salmon-play-btn"
                      onClick={handleTogglePlay}
                      title={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="6" y="4" width="4" height="16" rx="1.5" />
                          <rect x="14" y="4" width="4" height="16" rx="1.5" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: "2px" }}>
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </button>

                    {/* Next */}
                    <button
                      className="salmon-nav-btn"
                      onClick={handleNext}
                      title="Next Track"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M4.5 6v12l8.5-6-8.5-6zm8.5 0v12l8.5-6-8.5-6z" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Right Side: Circular Artwork Medallion */}
                <div
                  className="salmon-art-disc-wrap"
                  onClick={focusMediaApp}
                  title="Open Playing App"
                >
                  <div className="salmon-art-disc">
                    <img
                      src={albumArt}
                      alt="Album Art"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/albumcover-placeholder.png";
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : mediaStyle === "vinyl" ? (
            /* ── Design: Vinyl Deck Floating Card (Compact & Snug) ── */
            <div
              className="media-controls-flyout media-flyout--vinyl"
              onClick={(e) => e.stopPropagation()}
              style={{
                ["--wave-color" as any]: dynamicColor.waveColor,
                ["--wave-gradient" as any]: dynamicColor.waveGradient,
                ["--wave-glow" as any]: dynamicColor.glowColor,
              }}
            >
              <div className="vinyl-card-top-deck">
                <div className="vinyl-floating-box">
                  <div className={`vinyl-disc ${isPlaying ? "vinyl-disc--spinning" : ""}`}>
                    <div className="vinyl-groove-rings" />
                    <div className="vinyl-label-art">
                      <img
                        src={albumArt}
                        alt="Album Art"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "/albumcover-placeholder.png";
                        }}
                      />
                    </div>
                    <div className="vinyl-center-spindle" />
                  </div>
                </div>

                <div className="vinyl-deck-info">
                  <span className="vinyl-deck-title" title={displayTitle}>{displayTitle}</span>
                  <span className="vinyl-deck-artist" title={displayArtist}>{displayArtist}</span>

                  <div className="vinyl-deck-scrubber" onClick={handleScrubberClick} title="Seek Track">
                    <div className="vinyl-scrubber-track">
                      <div className="vinyl-scrubber-fill" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="vinyl-time-row">
                      <span>{formatTime(currentSec)}</span>
                      <span>{formatTime(durationSec)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="vinyl-bottom-controls-strip">
                <button
                  className="vinyl-ctrl-btn"
                  onClick={handlePrev}
                  title="Previous Track"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11 5.5a1.2 1.2 0 0 0-1.85-.98L2.3 9.7a1.2 1.2 0 0 0 0 1.96l6.85 5.18A1.2 1.2 0 0 0 11 15.86V5.5zm11 0a1.2 1.2 0 0 0-1.85-.98L13.3 9.7a1.2 1.2 0 0 0 0 1.96l6.85 5.18A1.2 1.2 0 0 0 22 15.86V5.5z" />
                  </svg>
                </button>

                <button
                  className="vinyl-ctrl-btn vinyl-ctrl-btn--play"
                  onClick={handleTogglePlay}
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="5.5" y="4" width="4.5" height="16" rx="1.6" />
                      <rect x="14" y="4" width="4.5" height="16" rx="1.6" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 4.5a1.5 1.5 0 0 1 2.3-1.28l12 7.5a1.5 1.5 0 0 1 0 2.56l-12 7.5A1.5 1.5 0 0 1 6 19.5V4.5z" />
                    </svg>
                  )}
                </button>

                <button
                  className="vinyl-ctrl-btn"
                  onClick={handleNext}
                  title="Next Track"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2 5.5a1.2 1.2 0 0 1 1.85-.98L10.7 9.7a1.2 1.2 0 0 1 0 1.96l-6.85 5.18A1.2 1.2 0 0 1 2 15.86V5.5zm11 0a1.2 1.2 0 0 1 1.85-.98L21.7 9.7a1.2 1.2 0 0 1 0 1.96l-6.85 5.18A1.2 1.2 0 0 1 13 15.86V5.5z" />
                  </svg>
                </button>

                <button
                  className="vinyl-ctrl-btn vinyl-ctrl-btn--aux"
                  onClick={focusMediaApp}
                  title="Open Source Media App"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </button>

                <button
                  className={`vinyl-ctrl-btn vinyl-ctrl-btn--aux ${isMuted ? "media-flyout-btn--muted" : ""}`}
                  onClick={onMuteClick}
                  title={isMuted ? "Unmute Sound" : "Mute Sound"}
                >
                  {isMuted ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <line x1="23" y1="9" x2="17" y2="15" />
                      <line x1="17" y1="9" x2="23" y2="15" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* ── Design: Classic Floating Controller Card ── */
            <div
              className="media-controls-flyout"
              onClick={(e) => e.stopPropagation()}
              style={{
                ["--wave-color" as any]: dynamicColor.waveColor,
                ["--wave-gradient" as any]: dynamicColor.waveGradient,
                ["--wave-glow" as any]: dynamicColor.glowColor,
              }}
            >
              <div className="media-flyout-top">
                <div className="media-flyout-art">
                  <img
                    src={albumArt}
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

              <div className="media-flyout-scrubber-row">
                <span className="media-flyout-time">{formatTime(currentSec)}</span>
                <div className="media-flyout-track" onClick={handleScrubberClick}>
                  <div className="media-flyout-fill" style={{ width: `${progress}%` }} />
                  <div className="media-flyout-thumb" style={{ left: `${progress}%` }} />
                </div>
                <span className="media-flyout-time">{formatTime(durationSec)}</span>
              </div>

              <div className="media-flyout-buttons">
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

                <button
                  className="media-flyout-btn"
                  onClick={handlePrev}
                  title="Previous Track"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22 5.5a1.2 1.2 0 0 0-1.85-.98L13.3 9.7a1.2 1.2 0 0 0 0 1.96l6.85 5.18A1.2 1.2 0 0 0 22 15.86V5.5zm-11 0a1.2 1.2 0 0 0-1.85-.98L2.3 9.7a1.2 1.2 0 0 0 0 1.96l6.85 5.18A1.2 1.2 0 0 0 11 15.86V5.5z" />
                  </svg>
                </button>

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

                <button
                  className="media-flyout-btn"
                  onClick={handleNext}
                  title="Next Track"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2 5.5a1.2 1.2 0 0 1 1.85-.98L10.7 9.7a1.2 1.2 0 0 1 0 1.96l-6.85 5.18A1.2 1.2 0 0 1 2 15.86V5.5zm11 0a1.2 1.2 0 0 1 1.85-.98L21.7 9.7a1.2 1.2 0 0 1 0 1.96l-6.85 5.18A1.2 1.2 0 0 1 13 15.86V5.5z" />
                  </svg>
                </button>

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
        </>
      )}

      {/* ── Main Taskbar Dock Widget (Inactive Section - Fully Matched to Active Flyout) ── */}
      {mediaStyle === "cover_pill" ? (
        /* ── Design 2: Live Cover Capsule (Direct controls, never opens flyout) ── */
        <div
          className="capsule media-capsule media-capsule--cover-pill"
          onClick={onDirectPlayPause}
          title={`${displayTitle} • ${displayArtist} (Click to Play/Pause)`}
        >
          <div
            className="media-cover-pill-bg"
            style={{ backgroundImage: `url(${albumArt})` }}
          />
          <div className="media-cover-pill-overlay" />

          <div className="media-cover-pill-info">
            <span className="media-cover-pill-title">{displayTitle}</span>
          </div>

          <div className="media-cover-pill-actions">
            <button
              className="media-cover-ring-btn"
              onClick={onDirectPlayPause}
              title={isPlaying ? "Pause" : "Play"}
            >
              <svg className="media-cover-ring-svg" viewBox="0 0 32 32">
                <circle
                  className="media-cover-ring-track"
                  cx="16"
                  cy="16"
                  r={ringRadius}
                />
                <circle
                  className="media-cover-ring-fill"
                  cx="16"
                  cy="16"
                  r={ringRadius}
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={strokeOffset}
                  transform="rotate(-90 16 16)"
                />
              </svg>
              <div className="media-cover-ring-icon">
                {isPlaying ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" rx="1.5" />
                    <rect x="14" y="4" width="4" height="16" rx="1.5" />
                  </svg>
                ) : (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: "1.5px" }}>
                    <path d="M7 4.5a1 1 0 0 1 1.55-.83l11 7.5a1 1 0 0 1 0 1.66l-11 7.5A1 1 0 0 1 7 19.5V4.5z" />
                  </svg>
                )}
              </div>
            </button>

            <button
              className="media-cover-skip-btn"
              onClick={onDirectNext}
              title="Next Track"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 4.5a1 1 0 0 1 1.55-.83l10 6.5a1 1 0 0 1 0 1.66l-10 6.5A1 1 0 0 1 5 17.5V4.5z" />
                <rect x="18" y="4" width="2.5" height="16" rx="1" />
              </svg>
            </button>
          </div>
        </div>
      ) : mediaStyle === "waveform_deck" ? (
        /* ── Design: Golden Waveform Dock Capsule (Matching Active Section) ── */
        <div
          className={`capsule media-capsule media-capsule--waveform ${
            showControls ? "media-capsule--active-flyout" : ""
          }`}
          style={{
            ["--wave-color" as any]: dynamicColor.waveColor,
            ["--wave-gradient" as any]: dynamicColor.waveGradient,
            ["--wave-glow" as any]: dynamicColor.glowColor,
          }}
          onClick={handleToggleFlyout}
          title="Click to open Waveform Deck"
        >
          <div className="waveform-dock-thumb">
            <img
              src={albumArt}
              alt="Album Art"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/albumcover-placeholder.png";
              }}
            />
          </div>

          <div className="media-info">
            <span className="media-title">{displayTitle}</span>
            <span className="media-artist">{displayArtist}</span>
          </div>

          {/* Mini Soundwave Equalizer Bars (100% matched to active waveform flyout) */}
          <div className="waveform-dock-mini-bars">
            {WAVEFORM_BARS.slice(0, 8).map((h, i) => {
              const isFilled = (i / 8) * 100 <= progress;
              return (
                <span
                  key={i}
                  className={`waveform-dock-bar ${isFilled ? "waveform-dock-bar--filled" : ""}`}
                  style={{ height: `${Math.round(h * 0.5)}px` }}
                />
              );
            })}
          </div>

          {/* Actions: Skip + Glowing Radiant Accent Play Button (Matched to active section) */}
          <div className="waveform-dock-actions">
            <button
              className="waveform-dock-skip-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleNext(e);
              }}
              title="Next Track"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>
            <button
              className="waveform-dock-play-btn"
              onClick={onDirectPlayPause}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1.5" />
                  <rect x="14" y="4" width="4" height="16" rx="1.5" />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: "1px" }}>
                  <path d="M7 4.5a1 1 0 0 1 1.55-.83l11 7.5a1 1 0 0 1 0 1.66l-11 7.5A1 1 0 0 1 7 19.5V4.5z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      ) : mediaStyle === "perimeter_card" ? (
        /* ── Design: Capsule Pill Dock Widget ── */
        <div
          className={`capsule media-capsule media-capsule--salmon-pill ${
            showControls ? "media-capsule--active-flyout" : ""
          }`}
          onClick={handleToggleFlyout}
          title="Click to open Pill Deck"
        >
          <div className="salmon-dock-art-disc">
            <img
              src={albumArt}
              alt="Album Art"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/albumcover-placeholder.png";
              }}
            />
          </div>

          <div className="media-info">
            <span className="media-title">{displayTitle}</span>
            <span className="media-artist">{displayArtist}</span>
          </div>

          <div className="salmon-dock-actions">
            <button
              className="salmon-dock-play-btn"
              onClick={onDirectPlayPause}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1.5" />
                  <rect x="14" y="4" width="4" height="16" rx="1.5" />
                </svg>
              ) : (
                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: "1px" }}>
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            <button
              className="salmon-dock-next-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleNext(e);
              }}
              title="Next Track"
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4.5 6v12l8.5-6-8.5-6zm8.5 0v12l8.5-6-8.5-6z" />
              </svg>
            </button>
          </div>

          {/* Bottom coral progress fill */}
          <div className="salmon-dock-progress-track">
            <div
              className="salmon-dock-progress-fill"
              style={{ width: `${clampedProgress}%` }}
            />
          </div>
        </div>
      ) : mediaStyle === "vinyl" ? (
        /* ── Design 1: Vinyl Deck Turntable Dock Capsule (Matching Active Vinyl Record) ── */
        <div
          className={`capsule media-capsule media-capsule--vinyl ${
            showControls ? "media-capsule--active-flyout" : ""
          }`}
          style={{
            ["--wave-color" as any]: dynamicColor.waveColor,
            ["--wave-gradient" as any]: dynamicColor.waveGradient,
            ["--wave-glow" as any]: dynamicColor.glowColor,
          }}
          onClick={handleToggleFlyout}
          title="Click to open Vinyl Player"
        >
          <div className="media-mini-vinyl-deck">
            <div className={`media-mini-vinyl-disc ${isPlaying ? "media-mini-vinyl-disc--spinning" : ""}`}>
              <div className="media-mini-vinyl-art">
                <img
                  src={albumArt}
                  alt="Album Art"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/albumcover-placeholder.png";
                  }}
                />
              </div>
              <div className="media-mini-vinyl-spindle" />
            </div>
          </div>

          <div className="media-info">
            <span className="media-title">{displayTitle}</span>
            <span className="media-artist">{displayArtist}</span>
          </div>

          <button
            className="media-vinyl-dock-play-btn"
            onClick={onDirectPlayPause}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1.5" />
                <rect x="14" y="4" width="4" height="16" rx="1.5" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 4.5a1 1 0 0 1 1.55-.83l11 7.5a1 1 0 0 1 0 1.66l-11 7.5A1 1 0 0 1 7 19.5V4.5z" />
              </svg>
            )}
          </button>

          <div className="media-progress-bar">
            <div className="media-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : (
        /* ── Design: Classic Waveform Pill ── */
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
            <div className="media-album-thumb">
              <img
                src={albumArt}
                alt="Album Art"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/albumcover-placeholder.png";
                }}
              />
            </div>

            <div className="media-info">
              <span className="media-title">{displayTitle}</span>
              <span className="media-artist">{displayArtist}</span>
            </div>

            <div className={`media-equalizer ${isPlaying ? "media-equalizer--playing" : ""}`}>
              <span className="eq-bar eq-bar-1" />
              <span className="eq-bar eq-bar-2" />
              <span className="eq-bar eq-bar-3" />
            </div>
          </div>

          <div className="media-progress-bar">
            <div className="media-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
    </div>
  );
};
