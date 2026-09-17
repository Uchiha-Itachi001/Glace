import React, { useState, useEffect } from "react";
import { useSettings } from "../../stores/settingsStore";
import { useFlyout } from "../../stores/flyoutStore";
import { useBluetooth } from "../../hooks/useBluetooth";
import { useSystemMetrics } from "../../hooks/useSystemMetrics";
import { windowExpansion } from "../../services/windowExpansion";
import { useMediaSession } from "../../hooks/useMediaSession";
import { tauriBridge } from "../../services/tauriBridge";

export const DynamicIsland: React.FC = () => {
  const { settings } = useSettings();
  const { activeFlyout, openFlyout } = useFlyout();
  const isFlyoutOpen = activeFlyout !== null;
  const barPosition = settings?.bar_position || "bottom";
  const isMacStyle = barPosition === "macos" || barPosition === "top";
  const isIslandEnabled = settings?.enable_dynamic_island ?? true;
  const showMedia = isIslandEnabled && (settings?.media_location ?? "notch") === "notch" && (settings?.island_show_media ?? true);
  const showBluetooth = isIslandEnabled && (settings?.island_show_bluetooth ?? true);
  const showHardware = isIslandEnabled && (settings?.island_show_hardware ?? true);
  const showBattery = isIslandEnabled && (settings?.island_show_battery ?? true);
  const mediaBgMode = settings?.island_media_bg_mode || "black";

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

  // Single combined tick state: one React update per second instead of two separate ones
  const [tick, setTick] = useState<{ date: Date; uptimeSec: number }>(() => ({
    date: new Date(),
    uptimeSec: 4980,
  }));
  const clockDate = tick.date;
  const sessionUptimeSec = tick.uptimeSec;
  const currentTime = clockDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((prev) => ({ date: new Date(), uptimeSec: prev.uptimeSec + 1 }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const [expandedType, setExpandedType] = useState<"media" | "bluetooth" | "hardware" | null>(null);
  const [islandTab, setIslandTab] = useState<"dashboard" | "media" | "performance" | "controls">("dashboard");
  const [dashVolume, setDashVolume] = useState<number>(65);
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
        if (payload.is_down) {
          setIsNotchHovered(payload.in_notch);
        } else {
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
    if (typeof secs !== "number" || isNaN(secs) || secs < 0) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const handleExpandMedia = (e?: React.MouseEvent) => {
    if (isFlyoutOpen) return;
    if (e) e.stopPropagation();
    try {
      setExpandedType("media");
      windowExpansion.request("island", 220);
    } catch (err) {
      console.error("[DynamicIsland] Failed to expand media:", err);
    }
  };

  const handleExpandBluetooth = (e?: React.MouseEvent) => {
    if (isFlyoutOpen) return;
    if (e) e.stopPropagation();
    try {
      setExpandedType("bluetooth");
      windowExpansion.request("island", 180);
    } catch (err) {
      console.error("[DynamicIsland] Failed to expand bluetooth:", err);
    }
  };

  const handleExpandHardware = (e?: React.MouseEvent) => {
    if (isFlyoutOpen) return;
    if (e) e.stopPropagation();
    try {
      setExpandedType("hardware");
      setIslandTab("dashboard");
      windowExpansion.request("island", 260);
    } catch (err) {
      console.error("[DynamicIsland] Failed to expand hardware:", err);
    }
  };

  const handleCollapse = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedType(null);
    windowExpansion.release("island");
  };

  // Collapse island immediately when flyout (settings, calendar, etc.) is open
  useEffect(() => {
    if (isFlyoutOpen && expandedType !== null) {
      handleCollapse();
    }
  }, [isFlyoutOpen, expandedType]);

  // Sync expandedType when windowExpansion is released externally (e.g. backdrop or transparent space click)
  useEffect(() => {
    const unsub = windowExpansion.subscribe((isExpanded) => {
      if (!isExpanded && expandedType !== null) {
        setExpandedType(null);
      }
    });
    return unsub;
  }, [expandedType]);

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
  const trackTheme = {
    waveColor: dynamicTheme?.waveColor || fallbackTheme.waveColor,
    waveGradient: dynamicTheme?.waveGradient || fallbackTheme.waveGradient,
    waveGradientTop: dynamicTheme?.waveGradientTop || fallbackTheme.waveGradientTop,
    waveGradientBottom: dynamicTheme?.waveGradientBottom || fallbackTheme.waveGradientBottom,
    glowColor: dynamicTheme?.glowColor || fallbackTheme.glowColor,
  };

  // Circular ring calculation for Image 1: 42px SVG (radius 17)
  const ringRadius = 17;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const displayRingPct = btBatteryPct ?? 100;
  const ringOffset = ringCircumference - (displayRingPct / 100) * ringCircumference;

  // Mini circular ring calculation for Image 2 & 3: 13px SVG (radius 4.2)
  const miniRadius = 4.2;
  const miniCircumference = 2 * Math.PI * miniRadius;
  const miniOffset = miniCircumference - (displayRingPct / 100) * miniCircumference;

  const polarToCartesian = (cx: number, cy: number, r: number, angleInDegrees: number) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: cx + r * Math.cos(angleInRadians),
      y: cy + r * Math.sin(angleInRadians),
    };
  };

  const describeArc = (cx: number, cy: number, r: number, startAngle: number, sweepAngle: number) => {
    if (sweepAngle <= 0.5) return "";
    const actualSweep = Math.min(sweepAngle, 359.99);
    const endAngle = startAngle + actualSweep;
    const start = polarToCartesian(cx, cy, r, startAngle);
    const end = polarToCartesian(cx, cy, r, endAngle);
    const largeArcFlag = actualSweep > 180 ? 1 : 0;
    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  };

  const renderTelemetryGauge = (
    primaryVal: string,
    primaryLabel: string,
    primaryPercent: number,
    secondaryVal: string,
    secondaryLabel: string,
    secondaryPercent: number,
    key: string
  ) => {
    const cx = 66;
    const cy = 66;
    const r = 48;

    // Top Arc: starts at 255° (approx 8:30) and sweeps 215° clockwise to 110° (approx 3:40)
    const topStart = 255;
    const topTotalSweep = 215;
    const topClampedPct = Math.max(0, Math.min(100, primaryPercent)) / 100;
    const topActiveSweep = Math.max(2, topTotalSweep * topClampedPct);

    // Bottom Arc: starts at 165° (approx 5:30) and sweeps 60° clockwise to 225° (approx 7:30)
    const bottomStart = 165;
    const bottomTotalSweep = 60;
    const bottomClampedPct = Math.max(0, Math.min(100, secondaryPercent)) / 100;
    const bottomActiveSweep = Math.max(2, bottomTotalSweep * bottomClampedPct);

    return (
      <div className="notch-telemetry-gauge" key={key}>
        <div className="notch-gauge-circle-wrap">
          <svg className="notch-gauge-svg" viewBox="0 0 132 132">
            {/* Top Arc Track (Pale coral/rose from Caelestia Shell design) */}
            <path
              d={describeArc(cx, cy, r, topStart, topTotalSweep)}
              fill="none"
              stroke="rgba(254, 205, 211, 0.42)"
              strokeWidth="5"
              strokeLinecap="round"
            />
            {/* Top Arc Active Progress */}
            <path
              d={describeArc(cx, cy, r, topStart, topActiveSweep)}
              fill="none"
              stroke="#f87171"
              strokeWidth="5.5"
              strokeLinecap="round"
            />

            {/* Bottom Arc Track (Pale rust/terracotta from Caelestia Shell design) */}
            <path
              d={describeArc(cx, cy, r, bottomStart, bottomTotalSweep)}
              fill="none"
              stroke="rgba(194, 65, 12, 0.28)"
              strokeWidth="5"
              strokeLinecap="round"
            />
            {/* Bottom Arc Active Progress */}
            <path
              d={describeArc(cx, cy, r, bottomStart, bottomActiveSweep)}
              fill="none"
              stroke="#c2410c"
              strokeWidth="5.5"
              strokeLinecap="round"
            />
          </svg>

          {/* Center Main Metric */}
          <div className="notch-gauge-center-content">
            <span className="notch-gauge-primary-val">{primaryVal}</span>
            <span className="notch-gauge-primary-lbl">{primaryLabel}</span>
          </div>

          {/* Bottom Right Secondary Metric */}
          <div className="notch-gauge-secondary-content">
            <span className="notch-gauge-secondary-val">{secondaryVal}</span>
            <span className="notch-gauge-secondary-lbl">{secondaryLabel}</span>
          </div>
        </div>
      </div>
    );
  };

  const getCalendarDays = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const todayDate = date.getDate();

    const firstDay = new Date(year, month, 1);
    let firstDayIndex = firstDay.getDay() - 1;
    if (firstDayIndex === -1) firstDayIndex = 6;

    const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days: { day: number; isCurrentMonth: boolean; isToday: boolean }[] = [];

    for (let i = firstDayIndex - 1; i >= 0; i--) {
      days.push({
        day: daysInPrevMonth - i,
        isCurrentMonth: false,
        isToday: false,
      });
    }

    for (let d = 1; d <= daysInCurrentMonth; d++) {
      days.push({
        day: d,
        isCurrentMonth: true,
        isToday: d === todayDate,
      });
    }

    const targetLength = days.length > 35 ? 42 : 35;
    let nextMonthDay = 1;
    while (days.length < targetLength) {
      days.push({
        day: nextMonthDay++,
        isCurrentMonth: false,
        isToday: false,
      });
    }

    return days;
  };

  const formatUptime = (totalSec: number) => {
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    if (hours === 0) {
      return `up ${minutes} minute${minutes === 1 ? "" : "s"}`;
    }
    return `up ${hours} hour${hours === 1 ? "" : "s"}, ${minutes} minute${minutes === 1 ? "" : "s"}`;
  };

  const rawHours = clockDate.getHours();
  const hours12 = (rawHours % 12 || 12).toString().padStart(2, "0");
  const clockMin = clockDate.getMinutes().toString().padStart(2, "0");
  const clockSec = clockDate.getSeconds();
  const ampm = rawHours >= 12 ? "PM" : "AM";
  const weekdayFull = clockDate.toLocaleDateString("en-US", { weekday: "long" });
  const monthDay = clockDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const monthYearStr = clockDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const calendarDays = getCalendarDays(clockDate);
  const totalUptimeSec = systemMetrics?.uptime_seconds && systemMetrics.uptime_seconds > 0 ? systemMetrics.uptime_seconds : sessionUptimeSec;
  const uptimeFormatted = formatUptime(totalUptimeSec);

  const getGreeting = () => {
    const h = clockDate.getHours();
    if (h < 12) return "Good Morning";
    if (h < 17) return "Good Afternoon";
    return "Good Evening";
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

  const renderNotchBgCover = (isMedia = false) => {
    const showCover = isMedia && mediaBgMode === "cover" && Boolean(liveMedia?.album_art_base64);
    if (!showCover) return null;
    return (
      <div className="notch-bg-cover notch-bg-cover--media" aria-hidden="true">
        <img
          src={liveMedia?.album_art_base64}
          alt=""
          className="notch-media-thumbnail-bg"
          draggable={false}
        />
        <div className="notch-media-thumbnail-overlay" />
      </div>
    );
  };

  return (
    <>
      {/* Backdrop for click-outside collapse */}
      {expandedType !== null && (
        <div className="island-backdrop" onClick={() => handleCollapse()} />
      )}

      <div
        className={`dynamic-notch-wrapper ${isShiftPeek ? "dynamic-notch-wrapper--peek-through" : ""} ${
          isFlyoutOpen ? "dynamic-notch-wrapper--flyout-open" : ""
        }`}
        onMouseEnter={() => {
          if (!isFlyoutOpen) setIsNotchHovered(true);
        }}
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
            {/* Ambient Background Cover with Top 0% Opacity Mask */}
            {renderNotchBgCover(false)}

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
            {/* Ambient Background Cover with Top 0% Opacity Mask */}
            {renderNotchBgCover(true)}

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

        {/* ─── CASE C: EXPANDED HARDWARE QUICK METRICS CARD (CAELESTIA SHELL TELEMETRY HUB) ─── */}
        {expandedType === "hardware" && (
          <div
            className="dynamic-notch dynamic-notch--hardware-expanded"
            onClick={(e) => e.stopPropagation()}
            style={{
              ["--wave-color" as any]: "#c2410c",
              ["--wave-glow" as any]: "rgba(194, 65, 12, 0.45)",
            }}
          >
            {/* Left Concave Wing Ear */}
            <div className="notch-ear notch-ear--left" />
            {/* Right Concave Wing Ear */}
            <div className="notch-ear notch-ear--right" />
            {/* Moving Light Border Beam */}
            {renderLightBorder()}
            {/* Ambient Background Cover with Top 0% Opacity Mask */}
            {renderNotchBgCover(false)}

            <div className="notch-hardware-card">
              {/* Header Tabs: Dashboard | Media | Performance | Controls */}
              <div className="notch-telemetry-tabs">
                <button
                  type="button"
                  className={`notch-telemetry-tab ${islandTab === "dashboard" ? "notch-telemetry-tab--active" : ""}`}
                  onClick={() => setIslandTab("dashboard")}
                  title="System Dashboard"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1.5" />
                    <rect x="14" y="3" width="7" height="7" rx="1.5" />
                    <rect x="14" y="14" width="7" height="7" rx="1.5" />
                    <rect x="3" y="14" width="7" height="7" rx="1.5" />
                  </svg>
                  <span>Dashboard</span>
                </button>

                <button
                  type="button"
                  className={`notch-telemetry-tab ${islandTab === "media" ? "notch-telemetry-tab--active" : ""}`}
                  onClick={(e) => handleExpandMedia(e)}
                  title="Now Playing Media"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                  <span>Media</span>
                </button>

                <button
                  type="button"
                  className={`notch-telemetry-tab ${islandTab === "performance" ? "notch-telemetry-tab--active" : ""}`}
                  onClick={() => setIslandTab("performance")}
                  title="Hardware Performance"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 14v-4" />
                    <path d="M3.34 19a10 10 0 1 1 17.32 0" />
                  </svg>
                  <span>Performance</span>
                </button>

                <button
                  type="button"
                  className={`notch-telemetry-tab ${islandTab === "controls" ? "notch-telemetry-tab--active" : ""}`}
                  onClick={() => setIslandTab("controls")}
                  title="Quick Controls & Utilities"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  <span>Controls</span>
                </button>
              </div>

              {/* ─── TAB 1: Bento Grid Dashboard (Clock 12h, Glance, Calendar) ─── */}
              {islandTab === "dashboard" && (
                <div className="notch-bento-grid notch-bento-grid--proper">
                  {/* ─── Card 1: 12-Hour Clock ─── */}
                  <div className="bento-card bento-card--clock12">
                    <div className="bento-clock-header">
                      <span className="bento-clock-ampm-badge">{ampm}</span>
                      <span className="bento-clock-tz">12-HOUR</span>
                    </div>

                    <div className="bento-clock-main">
                      <span className="bento-clock-num">{hours12}</span>
                      <div className="bento-clock-dots">
                        <span />
                        <span />
                        <span />
                      </div>
                      <span className="bento-clock-num">{clockMin}</span>
                    </div>

                    <div className="bento-clock-footer">
                      <span className="bento-clock-weekday">{weekdayFull}</span>
                      <span className="bento-clock-date-str">{monthDay}</span>
                      <div className="bento-clock-sec-track">
                        <div className="bento-clock-sec-fill" style={{ width: `${(clockSec / 59) * 100}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* ─── Card 2: Glance (At-a-Glance Hub) ─── */}
                  <div className="bento-card bento-card--glance">
                    {/* Header with Title & Greeting */}
                    <div className="bento-glance-top">
                      <div className="bento-glance-title-row">
                        <span className="bento-glance-dot" />
                        <span className="bento-glance-title">Glance</span>
                      </div>
                      <span className="bento-glance-greeting">{getGreeting()}</span>
                    </div>

                    {/* System Stats Cluster */}
                    <div className="bento-glance-stats bento-glance-stats--expanded">
                      <div className="bento-glance-stat-row">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
                        </svg>
                        <span className="bento-glance-stat-lbl">Windows 11</span>
                        <span className="bento-glance-chip">Pro</span>
                      </div>
                      <div className="bento-glance-stat-row">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <path d="M3 9h18M9 21V9" />
                        </svg>
                        <span className="bento-glance-stat-lbl">Glace Shell</span>
                        <span className="bento-glance-chip">v0.4.5</span>
                      </div>
                      <div className="bento-glance-stat-row">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        <span className="bento-glance-stat-lbl">{uptimeFormatted}</span>
                      </div>
                      <div className="bento-glance-stat-row">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                          <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                          <line x1="6" y1="6" x2="6.01" y2="6" />
                          <line x1="6" y1="18" x2="6.01" y2="18" />
                        </svg>
                        <span className="bento-glance-stat-lbl">RAM {(((systemMetrics?.used_ram_mb ?? 5529)) / 1024).toFixed(1)} GB in use</span>
                      </div>
                    </div>

                    {/* Power & Audio Quick Status */}
                    <div className="bento-glance-footer">
                      <div className="bento-glance-pill" title={`Battery: ${batteryPercent}% ${isCharging ? "(Charging)" : ""}`}>
                        {isCharging ? (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="#22c55e" stroke="#22c55e" strokeWidth="1.5">
                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                          </svg>
                        ) : (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <rect x="1" y="6" width="18" height="12" rx="2" />
                            <line x1="23" y1="11" x2="23" y2="13" />
                          </svg>
                        )}
                        <span>{batteryPercent}%</span>
                      </div>

                      <div
                        className="bento-glance-pill bento-glance-pill--vol"
                        title="Volume (Scroll to adjust)"
                        onWheel={(e) => {
                          if (e.deltaY < 0) {
                            setDashVolume((v) => Math.min(100, v + 5));
                            volumeUp();
                          } else {
                            setDashVolume((v) => Math.max(0, v - 5));
                            volumeDown();
                          }
                        }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                        </svg>
                        <span>{dashVolume}%</span>
                      </div>
                    </div>
                  </div>

                  {/* ─── Card 3: Calendar ─── */}
                  <div className="bento-card bento-card--calendar-full">
                    <div className="bento-cal-header-bar">
                      <div className="bento-cal-title-wrap">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#c2410c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        <span className="bento-cal-month-title">{monthYearStr}</span>
                      </div>
                      <span className="bento-cal-badge-today">TODAY</span>
                    </div>

                    <div className="bento-cal-grid-full">
                      {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
                        <span key={d} className="bento-cal-day-header">{d}</span>
                      ))}
                      {calendarDays.map((item, idx) => (
                        <span
                          key={idx}
                          className={`bento-cal-cell ${!item.isCurrentMonth ? "bento-cal-cell--dim" : ""} ${item.isToday ? "bento-cal-cell--today" : ""}`}
                        >
                          {item.day}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ─── TAB 2: Performance 3 Circular Telemetry Gauges ─── */}
              {islandTab === "performance" && (
                <div className="notch-telemetry-gauges-row">
                  {/* 1. CPU Usage Gauge */}
                  {renderTelemetryGauge(
                    `${systemMetrics?.cpu_percent ?? 0}%`,
                    "CPU Usage",
                    systemMetrics?.cpu_percent ?? 0,
                    systemMetrics?.net_recv_formatted || "0 B/s",
                    "Network",
                    Math.min(100, Math.max(10, systemMetrics?.cpu_percent ?? 0)),
                    "cpu"
                  )}

                  {/* 2. RAM Usage Gauge */}
                  {renderTelemetryGauge(
                    `${systemMetrics?.ram_percent ?? 0}%`,
                    "RAM Usage",
                    systemMetrics?.ram_percent ?? 0,
                    `${(((systemMetrics?.used_ram_mb ?? 5529)) / 1024).toFixed(1)}GiB`,
                    "In Use",
                    systemMetrics?.ram_percent ?? 0,
                    "ram"
                  )}

                  {/* 3. GPU Usage Gauge */}
                  {renderTelemetryGauge(
                    `${systemMetrics?.gpu_percent ?? 6}%`,
                    "GPU Usage",
                    systemMetrics?.gpu_percent ?? 6,
                    `${systemMetrics?.storage_used_gb ?? 256}GiB`,
                    "Storage",
                    Math.round((((systemMetrics?.storage_used_gb ?? 256)) / Math.max(1, systemMetrics?.storage_total_gb ?? 512)) * 100),
                    "gpu"
                  )}
                </div>
              )}

              {/* ─── TAB 4: Controls & Utilities View ─── */}
              {islandTab === "controls" && (
                <div className="notch-controls-view">
                  <div className="notch-controls-grid">
                    {/* 1. Snipping Tool / Screenshot */}
                    <button
                      type="button"
                      className="notch-ctrl-tile"
                      onClick={() => tauriBridge.launchApp("SnippingTool.exe")}
                      title="Capture Screen (Snipping Tool)"
                    >
                      <div className="notch-ctrl-icon-box">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                          <circle cx="12" cy="13" r="4" />
                        </svg>
                      </div>
                      <div className="notch-ctrl-text">
                        <span className="notch-ctrl-title">Screenshot</span>
                        <span className="notch-ctrl-sub">Snipping Tool</span>
                      </div>
                    </button>

                    {/* 2. Task Manager */}
                    <button
                      type="button"
                      className="notch-ctrl-tile"
                      onClick={() => tauriBridge.launchApp("taskmgr.exe")}
                      title="Open Windows Task Manager"
                    >
                      <div className="notch-ctrl-icon-box">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                        </svg>
                      </div>
                      <div className="notch-ctrl-text">
                        <span className="notch-ctrl-title">Task Manager</span>
                        <span className="notch-ctrl-sub">Processes & RAM</span>
                      </div>
                    </button>

                    {/* 3. Audio Mute Toggle */}
                    <button
                      type="button"
                      className={`notch-ctrl-tile ${isMuted ? "notch-ctrl-tile--active" : ""}`}
                      onClick={() => {
                        handleToggleMute();
                        setIsMuted((prev) => !prev);
                      }}
                      title={isMuted ? "Unmute Sound" : "Mute Sound"}
                    >
                      <div className="notch-ctrl-icon-box">
                        {isMuted ? (
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="1" y1="1" x2="23" y2="23" />
                            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                            <line x1="12" y1="19" x2="12" y2="23" />
                            <line x1="8" y1="23" x2="16" y2="23" />
                          </svg>
                        ) : (
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                          </svg>
                        )}
                      </div>
                      <div className="notch-ctrl-text">
                        <span className="notch-ctrl-title">{isMuted ? "Unmute Sound" : "Mute Audio"}</span>
                        <span className="notch-ctrl-sub">{isMuted ? "Audio muted" : `Vol ${dashVolume}%`}</span>
                      </div>
                    </button>

                    {/* 4. Windows Settings */}
                    <button
                      type="button"
                      className="notch-ctrl-tile"
                      onClick={() => tauriBridge.openWindowsSettings()}
                      title="Open Windows Settings"
                    >
                      <div className="notch-ctrl-icon-box">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                          <line x1="8" y1="21" x2="16" y2="21" />
                          <line x1="12" y1="17" x2="12" y2="21" />
                        </svg>
                      </div>
                      <div className="notch-ctrl-text">
                        <span className="notch-ctrl-title">Windows Settings</span>
                        <span className="notch-ctrl-sub">System Setup</span>
                      </div>
                    </button>

                    {/* 5. Glace Customizer */}
                    <button
                      type="button"
                      className="notch-ctrl-tile"
                      onClick={() => {
                        handleCollapse();
                        openFlyout("settings");
                      }}
                      title="Open Glace Preferences"
                    >
                      <div className="notch-ctrl-icon-box">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c2410c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="3" />
                          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                      </div>
                      <div className="notch-ctrl-text">
                        <span className="notch-ctrl-title">Glace Shell</span>
                        <span className="notch-ctrl-sub">Notch & Themes</span>
                      </div>
                    </button>

                    {/* 6. Lock Screen */}
                    <button
                      type="button"
                      className="notch-ctrl-tile"
                      onClick={() => tauriBridge.powerAction("lock")}
                      title="Lock Workstation (Win + L)"
                    >
                      <div className="notch-ctrl-icon-box">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </div>
                      <div className="notch-ctrl-text">
                        <span className="notch-ctrl-title">Lock Screen</span>
                        <span className="notch-ctrl-sub">Lock PC (Win+L)</span>
                      </div>
                    </button>
                  </div>
                </div>
              )}
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
              {/* Ambient Background Cover with Top 0% Opacity Mask */}
              {renderNotchBgCover(splitViewMode === "media_main")}

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
              {/* Ambient Background Cover with Top 0% Opacity Mask */}
              {renderNotchBgCover(splitViewMode !== "media_main")}

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
            {/* Ambient Background Cover with Top 0% Opacity Mask */}
            {renderNotchBgCover(true)}

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
              {/* Ambient Background Cover with Top 0% Opacity Mask */}
              {renderNotchBgCover(false)}

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
              {/* Ambient Background Cover with Top 0% Opacity Mask */}
              {renderNotchBgCover(false)}

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
            {/* Ambient Background Cover with Top 0% Opacity Mask */}
            {renderNotchBgCover(false)}

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
