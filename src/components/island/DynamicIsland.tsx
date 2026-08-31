import React, { useState, useEffect } from "react";
import { useSettings } from "../../stores/settingsStore";
import { useBluetooth } from "../../hooks/useBluetooth";
import { useSystemMetrics } from "../../hooks/useSystemMetrics";
import { windowExpansion } from "../../services/windowExpansion";
import { useMediaSession } from "../../hooks/useMediaSession";
import { tauriBridge } from "../../services/tauriBridge";

export const DynamicIsland: React.FC = () => {
  const { settings } = useSettings();
  const barPosition = settings?.bar_position || "bottom";
  const isMacStyle = barPosition === "macos" || barPosition === "top";
  const isIslandEnabled = settings?.enable_dynamic_island ?? true;
  const showMedia = isIslandEnabled && (settings?.media_location ?? "notch") === "notch" && (settings?.island_show_media ?? true);
  const showBluetooth = isIslandEnabled && (settings?.island_show_bluetooth ?? true);
  const showHardware = isIslandEnabled && (settings?.island_show_hardware ?? true);
  const showBattery = isIslandEnabled && (settings?.island_show_battery ?? true);

  const bluetooth = useBluetooth();
  const systemMetrics = useSystemMetrics(isIslandEnabled);
  const batteryPercent = systemMetrics?.battery_percent ?? 100;
  const isCharging = Boolean(systemMetrics?.is_charging);

  const {
    liveMedia,
    dynamicTheme,
    isPlaying: activeIsPlaying,
    currentSec: activeCurrentSec,
    durationSec: activeDuration,
    progressPercent,
    hasLiveMedia,
    togglePlay: handleTogglePlay,
    nextTrack: handleNextTrack,
    prevTrack: handlePrevTrack,
    toggleMute: handleToggleMute,
    volumeUp,
    volumeDown,
    seekTrack,
    focusMediaApp,
  } = useMediaSession(showMedia);

  const [currentTime, setCurrentTime] = useState<string>(() => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
  });

  const [cpuHistory, setCpuHistory] = useState<number[]>([12, 16, 14, 20, 15, 18, 22, 19, 14, 16, 12, 10]);
  const [ramHistory, setRamHistory] = useState<number[]>([60, 61, 62, 63, 62, 64, 65, 65, 66, 66, 65, 66]);

  useEffect(() => {
    if (systemMetrics?.cpu_percent !== undefined) {
      setCpuHistory((prev) => [...prev.slice(-14), systemMetrics.cpu_percent]);
    }
    if (systemMetrics?.ram_percent !== undefined) {
      setRamHistory((prev) => [...prev.slice(-14), systemMetrics.ram_percent]);
    }
  }, [systemMetrics?.cpu_percent, systemMetrics?.ram_percent]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true }));
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const [expandedType, setExpandedType] = useState<"media" | "bluetooth" | "hardware" | null>(null);
  const [splitViewMode, setSplitViewMode] = useState<"media_main" | "bt_main">("media_main");
  const [isMuted, setIsMuted] = useState(false);

  const { activeDevice: activeBtDevice, isConnected: isBtConnected } = bluetooth;
  const btBatteryPct = activeBtDevice?.battery_percent ?? null;

  // Media session is active ONLY when a real media player session is detected from Windows
  const hasMediaSession = showMedia && hasLiveMedia;
  // Multi-activity is active when real media exists AND a real bluetooth device is connected!
  const isMultiActivity = hasMediaSession && showBluetooth && isBtConnected && activeBtDevice !== null;

  // Notch is unexpanded in any compact mode (idle, media player, bluetooth status, or split activity)
  const isNotchUnexpanded = expandedType === null;

  const [isShiftDown, setIsShiftDown] = useState(false);
  const [isNotchHovered, setIsNotchHovered] = useState(false);

  // Transparency is active on ANY unexpanded compact notch (idle, media, bluetooth) when hovered + Shift pressed
  const isShiftPeek = !isMacStyle && isNotchUnexpanded && isShiftDown && isNotchHovered;

  useEffect(() => {
    if (isMacStyle) {
      tauriBridge.setNotchPeek(false);
      return;
    }
    tauriBridge.setNotchPeek(isShiftPeek);
  }, [isShiftPeek, isMacStyle]);

  const peekKey = settings?.notch_peek_key || "shift";

  const isMatchingKey = (e: KeyboardEvent, target: string) => {
    switch (target) {
      case "ctrl":
        return e.key === "Control";
      case "space":
        return e.key === " " || e.code === "Space";
      case "tab":
        return e.key === "Tab";
      case "shift":
      default:
        return e.key === "Shift";
    }
  };

  useEffect(() => {
    if (isMacStyle) {
      setIsShiftDown(false);
      return;
    }

    let unlisten: (() => void) | undefined;
    tauriBridge
      .onNotchShiftState((payload) => {
        setIsShiftDown(payload.is_down);
        if (payload.is_down && payload.in_notch) {
          setIsNotchHovered(true);
        } else if (!payload.is_down) {
          setIsNotchHovered(false);
        }
      })
      .then((unsub) => {
        unlisten = unsub;
      })
      .catch(console.error);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isMatchingKey(e, peekKey)) {
        setIsShiftDown(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (isMatchingKey(e, peekKey)) {
        setIsShiftDown(false);
        setIsNotchHovered(false);
      }
    };

    const handleBlur = () => {
      setIsShiftDown(false);
      setIsNotchHovered(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      if (unlisten) unlisten();
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [isMacStyle, peekKey]);

  const activeTitle = liveMedia?.title?.trim() || (hasLiveMedia ? "Connecting Audio..." : "No Media Playing");
  const activeArtist = liveMedia?.artist?.trim() || (hasLiveMedia ? "Resolving Stream..." : "Ready to play");

  if (!isIslandEnabled) {
    return null;
  }

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
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

  const handleExpandHardware = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedType("hardware");
    windowExpansion.request("island", 195);
  };

  const handleCollapse = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedType(null);
    windowExpansion.release("island");
  };

  // Fail-safe outside click dismiss for expanded cards
  useEffect(() => {
    if (expandedType === null) return;

    const handleOutsideClick = (e: MouseEvent | PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest(".dynamic-notch")) {
        handleCollapse();
      }
    };

    window.addEventListener("pointerdown", handleOutsideClick, true);
    return () => {
      window.removeEventListener("pointerdown", handleOutsideClick, true);
    };
  }, [expandedType]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      windowExpansion.release("island");
    };
  }, []);

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

  const handleScrubberClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (activeDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const ratio = rect.width > 0 ? clickX / rect.width : 0;
    const targetSec = Math.round(ratio * activeDuration);
    seekTrack(targetSec);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.deltaY < 0) {
      volumeUp();
    } else if (e.deltaY > 0) {
      volumeDown();
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
  const displayRingPct = btBatteryPct ?? 100;
  const ringOffset = ringCircumference - (displayRingPct / 100) * ringCircumference;

  // Mini circular ring calculation for Image 2 & 3: 13px SVG (radius 4.2)
  const miniRadius = 4.2;
  const miniCircumference = 2 * Math.PI * miniRadius;
  const miniOffset = miniCircumference - (displayRingPct / 100) * miniCircumference;

  const renderSparkline = (data: number[], strokeColor: string, gradientId: string) => {
    const w = 124;
    const h = 24;
    if (!data || data.length === 0) return null;
    const max = 100;
    const min = 0;
    const range = max - min || 1;
    const pts = data.map((v, i) => {
      const x = (i / Math.max(1, data.length - 1)) * w;
      const y = h - ((Math.min(100, Math.max(0, v)) - min) / range) * (h - 6) - 3;
      return { x, y };
    });
    const lineD = pts.reduce((acc, p, i) => (i === 0 ? `M ${p.x.toFixed(1)},${p.y.toFixed(1)}` : `${acc} L ${p.x.toFixed(1)},${p.y.toFixed(1)}`), "");
    const areaD = `${lineD} L ${w},${h} L 0,${h} Z`;

    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible", display: "block" }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.38" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#${gradientId})`} />
        <path d={lineD} fill="none" stroke={strokeColor} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  };

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

      <div
        className={`dynamic-notch-wrapper ${isShiftPeek ? "dynamic-notch-wrapper--peek-through" : ""}`}
        onMouseEnter={() => setIsNotchHovered(true)}
        onMouseLeave={() => {
          if (!isShiftDown) {
            setIsNotchHovered(false);
          }
        }}
      >
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
                <span className="notch-bt-ring-text">
                  {btBatteryPct !== null ? `${btBatteryPct}%` : "--"}
                </span>
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
                  {formatTime(activeCurrentSec)}
                </span>
                <div className="notch-scrubber-track" onClick={handleScrubberClick}>
                  <div className="notch-scrubber-fill" style={{ width: `${progressPercent}%` }} />
                  <div className="notch-scrubber-thumb" style={{ left: `${progressPercent}%` }} />
                </div>
                <span className="notch-time-label">{formatTime(activeDuration)}</span>
              </div>

              {/* Row 3: 5 Playback Controls */}
              <div className="notch-card-controls-row">
                {/* 1. Open Source Media App */}
                <button
                  className="notch-btn-icon"
                  onClick={focusMediaApp}
                  title="Open Playing App"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </button>

                {/* 2. Previous Track */}
                <button className="notch-btn-icon" onClick={handlePrevTrack} title="Previous">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                    <path d="M22 5.5a1.2 1.2 0 0 0-1.85-.98L13.3 9.7a1.2 1.2 0 0 0 0 1.96l6.85 5.18A1.2 1.2 0 0 0 22 15.86V5.5zm-11 0a1.2 1.2 0 0 0-1.85-.98L2.3 9.7a1.2 1.2 0 0 0 0 1.96l6.85 5.18A1.2 1.2 0 0 0 11 15.86V5.5z" />
                  </svg>
                </button>

                {/* 3. Play / Pause Button (Enlarged) */}
                <button
                  className="notch-btn-icon notch-btn-icon--play"
                  onClick={handleTogglePlay}
                  title={activeIsPlaying ? "Pause" : "Play"}
                >
                  {activeIsPlaying ? (
                    <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
                      <rect x="5.5" y="3.5" width="4.5" height="17" rx="1.8" />
                      <rect x="14" y="3.5" width="4.5" height="17" rx="1.8" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
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

                {/* 5. System Audio Mute / Unmute */}
                <button
                  className={`notch-btn-icon ${isMuted ? "notch-btn-icon--active" : ""}`}
                  onClick={(e) => {
                    setIsMuted(!isMuted);
                    handleToggleMute(e);
                  }}
                  title={isMuted ? "Unmute Sound" : "Mute Sound"}
                >
                  {isMuted ? (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <line x1="23" y1="9" x2="17" y2="15" />
                      <line x1="17" y1="9" x2="23" y2="15" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── CASE C: EXPANDED HARDWARE QUICK METRICS CARD ─── */}
        {expandedType === "hardware" && (
          <div
            className="dynamic-notch dynamic-notch--hardware-expanded"
            onClick={(e) => e.stopPropagation()}
            style={{
              ["--wave-color" as any]: "#38bdf8",
              ["--wave-glow" as any]: "rgba(56, 189, 248, 0.4)",
            }}
          >
            {/* Left Concave Wing Ear */}
            <div className="notch-ear notch-ear--left" />
            {/* Right Concave Wing Ear */}
            <div className="notch-ear notch-ear--right" />
            {/* Moving Light Border Beam */}
            {renderLightBorder()}

            <div className="notch-hardware-card">
              {/* Header: Chip Icon + Title + Collapse Button */}
              <div className="notch-hw-header">
                <div className="notch-hw-title-group">
                  <div className="notch-hw-chip-icon">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.2">
                      <rect x="4" y="4" width="16" height="16" rx="2" />
                      <rect x="9" y="9" width="6" height="6" />
                      <line x1="9" y1="1" x2="9" y2="4" />
                      <line x1="15" y1="1" x2="15" y2="4" />
                      <line x1="9" y1="20" x2="9" y2="23" />
                      <line x1="15" y1="20" x2="15" y2="23" />
                      <line x1="20" y1="9" x2="23" y2="9" />
                      <line x1="20" y1="14" x2="23" y2="14" />
                      <line x1="1" y1="9" x2="4" y2="9" />
                      <line x1="1" y1="14" x2="4" y2="14" />
                    </svg>
                  </div>
                  <span className="notch-hw-title">Hardware Telemetry</span>
                </div>

                <button
                  type="button"
                  className="notch-hw-collapse-btn"
                  onClick={handleCollapse}
                  title="Collapse Notch"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
              </div>

              {/* Grid: CPU & RAM Sparkline Cards */}
              <div className="notch-hw-grid">
                {/* CPU Graph Box */}
                <div className="notch-hw-metric-card">
                  <div className="notch-hw-metric-top">
                    <span className="notch-hw-metric-label">CPU Load</span>
                    <span className="notch-hw-metric-val">{systemMetrics.cpu_percent}%</span>
                  </div>
                  <div className="notch-hw-graph-wrap">
                    {renderSparkline(cpuHistory, "#38bdf8", "cpu-spark-grad")}
                  </div>
                </div>

                {/* RAM Graph Box */}
                <div className="notch-hw-metric-card">
                  <div className="notch-hw-metric-top">
                    <span className="notch-hw-metric-label">Memory</span>
                    <span className="notch-hw-metric-val">{systemMetrics.ram_percent}%</span>
                  </div>
                  <div className="notch-hw-graph-wrap">
                    {renderSparkline(ramHistory, "#a855f7", "ram-spark-grad")}
                  </div>
                  <div className="notch-hw-subtext">
                    {((systemMetrics.used_ram_mb || 0) / 1024).toFixed(1)} GB / {((systemMetrics.total_ram_mb || 16384) / 1024).toFixed(0)} GB
                  </div>
                </div>
              </div>

              {/* Bottom Row: Network Speeds & Power Details */}
              <div className="notch-hw-footer">
                <div className="notch-hw-net">
                  <div className="notch-hw-net-item">
                    <span className="notch-hw-net-arrow notch-hw-net-arrow--down">↓</span>
                    <span>{systemMetrics.net_recv_formatted || "0 B/s"}</span>
                  </div>
                  <div className="notch-hw-net-item">
                    <span className="notch-hw-net-arrow notch-hw-net-arrow--up">↑</span>
                    <span>{systemMetrics.net_sent_formatted || "0 B/s"}</span>
                  </div>
                </div>

                {showBattery && (
                  <div className="notch-hw-power">
                    {isCharging && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="#22c55e" stroke="#22c55e" strokeWidth="1.5">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                    )}
                    <span>{batteryPercent}%</span>
                    <span className="notch-hw-power-label">
                      {isCharging ? "AC" : "Batt"}
                    </span>
                  </div>
                )}
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

        {/* ─── CASE D1: SINGLE ACTIVITY MEDIA NOTCH ─── */}
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

              <div className="notch-activity-middle">
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

        {/* ─── CASE D2: DUAL DEFAULT HUB + BLUETOOTH SPLIT NOTCH (When no media is playing) ─── */}
        {expandedType === null && !hasMediaSession && showBluetooth && isBtConnected && activeBtDevice !== null && (
          <div className="notch-split-container">
            {/* 1. Left Pill: Default Time + Battery Hub */}
            <div
              className="dynamic-notch notch-split-main notch-split-main--default"
              onClick={showHardware ? handleExpandHardware : undefined}
              style={{
                ["--wave-color" as any]: "#38bdf8",
                ["--wave-glow" as any]: "rgba(56, 189, 248, 0.45)",
                cursor: showHardware ? "pointer" : "default",
              }}
            >
              {/* Left Concave Wing Ear */}
              <div className="notch-ear notch-ear--left" />
              {/* Right Concave Wing Ear */}
              <div className="notch-ear notch-ear--right" />
              {/* Moving Light Border Beam */}
              {renderLightBorder()}

              <div className="notch-compact-layout" style={{ gap: "8px", padding: "0 8px", width: "auto" }}>
                <span className="notch-compact-time">{currentTime}</span>
                {showBattery && (
                  <div className="notch-compact-right" style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                    {isCharging && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="#22c55e" stroke="#22c55e" strokeWidth="1.5">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                    )}
                    <span>{batteryPercent}%</span>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Right Pill: Centered Bluetooth Battery Ring Meter */}
            <div
              className="dynamic-notch notch-split-secondary"
              onClick={handleExpandBluetooth}
              style={{
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                width: "26px",
                height: "26px",
                minWidth: "26px",
              }}
            >
              {/* Left Concave Wing Ear */}
              <div className="notch-ear notch-ear--left" />
              {/* Right Concave Wing Ear */}
              <div className="notch-ear notch-ear--right" />
              {/* Moving Light Border Beam */}
              {renderLightBorder()}

              <div className="notch-mini-battery-ring" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
                <svg width="14" height="14" viewBox="0 0 14 14" style={{ display: "block" }}>
                  <circle
                    cx="7"
                    cy="7"
                    r={4.5}
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.18)"
                    strokeWidth="2.0"
                  />
                  <circle
                    cx="7"
                    cy="7"
                    r={4.5}
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="2.0"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 4.5}
                    strokeDashoffset={2 * Math.PI * 4.5 - (displayRingPct / 100) * (2 * Math.PI * 4.5)}
                    transform="rotate(-90 7 7)"
                  />
                </svg>
              </div>
            </div>
          </div>
        )}

        {/* ─── CASE E: INACTIVE / IDLE COMPACT NOTCH ─── */}
        {expandedType === null && !isMultiActivity && !hasMediaSession && (!showBluetooth || !isBtConnected || activeBtDevice === null) && (
          <div
            className="dynamic-notch dynamic-notch--compact"
            onClick={showHardware ? handleExpandHardware : undefined}
            style={{
              ["--wave-color" as any]: "#38bdf8",
              ["--wave-glow" as any]: "rgba(56, 189, 248, 0.45)",
              cursor: showHardware ? "pointer" : "default",
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
              {showBattery && (
                <div className="notch-compact-right" style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                  {isCharging && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="#22c55e" stroke="#22c55e" strokeWidth="1.5">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                  )}
                  <span>{batteryPercent}%</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};
