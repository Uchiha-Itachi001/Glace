import React, { useState } from "react";
import { useSettings } from "../../stores/settingsStore";
import { useMediaSession } from "../../hooks/useMediaSession";

export const MediaCapsule: React.FC = () => {
  const { settings } = useSettings();
  const isMediaBarEnabled = (settings?.enabled_widgets ?? []).includes("media") && settings?.media_location !== "notch";

  const {
    liveMedia: liveSession,
    dynamicTheme: dynamicColor,
    isPlaying,
    progressPercent: progress,
    togglePlay: handleTogglePlay,
    nextTrack: handleNext,
    prevTrack: handlePrev,
  } = useMediaSession(isMediaBarEnabled);

  const [showControls, setShowControls] = useState(false);

  const displayTitle = liveSession?.title?.trim() || (liveSession ? "Connecting Audio..." : "No Media Playing");
  const displayArtist = liveSession?.artist?.trim() || (liveSession ? "Resolving Stream..." : "Play music or video");

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

        {/* Mini Waveform next to track details */}
        <div className={`media-equalizer ${isPlaying ? "media-equalizer--playing" : ""}`}>
          <span className="eq-bar eq-bar-1" />
          <span className="eq-bar eq-bar-2" />
          <span className="eq-bar eq-bar-3" />
        </div>

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

