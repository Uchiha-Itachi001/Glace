import React, { useState, useEffect } from "react";
import { MediaTrack } from "../../types";

const DEMO_PLAYLIST: MediaTrack[] = [
  {
    title: "Midnight City",
    artist: "M83",
    isPlaying: true,
    progressPercent: 45,
    durationSec: 243,
    currentSec: 109,
  },
  {
    title: "Resonance",
    artist: "HOME",
    isPlaying: true,
    progressPercent: 62,
    durationSec: 212,
    currentSec: 131,
  },
  {
    title: "Starboy",
    artist: "The Weeknd & Daft Punk",
    isPlaying: true,
    progressPercent: 28,
    durationSec: 230,
    currentSec: 64,
  },
];

export const MediaCapsule: React.FC = () => {
  const [trackIndex, setTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(45);
  const [showControls, setShowControls] = useState(false);

  const currentTrack = DEMO_PLAYLIST[trackIndex];

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setProgress((prev) => (prev >= 100 ? 0 : prev + 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [isPlaying]);

  const handleTogglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPlaying(!isPlaying);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTrackIndex((prev) => (prev + 1) % DEMO_PLAYLIST.length);
    setProgress(0);
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTrackIndex((prev) => (prev - 1 + DEMO_PLAYLIST.length) % DEMO_PLAYLIST.length);
    setProgress(0);
  };

  return (
    <div
      className={`capsule capsule--compact media-capsule ${
        showControls ? "media-capsule--expanded" : ""
      }`}
      onClick={() => setShowControls(!showControls)}
      title="Media Player"
    >
      <div className="media-content">
        {/* Animated Equalizer Waveform */}
        <div className={`media-equalizer ${isPlaying ? "media-equalizer--playing" : ""}`}>
          <span className="eq-bar eq-bar-1" />
          <span className="eq-bar eq-bar-2" />
          <span className="eq-bar eq-bar-3" />
          <span className="eq-bar eq-bar-4" />
        </div>

        {/* Track Details */}
        <div className="media-info">
          <span className="media-title">{currentTrack.title}</span>
          <span className="media-artist">{currentTrack.artist}</span>
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
