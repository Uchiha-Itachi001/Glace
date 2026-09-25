import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSettings } from "../../stores/settingsStore";
import { useFlyout } from "../../stores/flyoutStore";
import { useAiAssistants } from "../../hooks/useAiAssistants";
import { windowExpansion } from "../../services/windowExpansion";
import { tauriBridge } from "../../services/tauriBridge";
import { AiProviderStatus } from "../../types";
import "../../styles/codenotch.css";

/* Provider Vector Logo Glyphs */
const ProviderGlyph: React.FC<{ id: string; color: string; size?: number }> = ({ id, color, size }) => {
  const s = size;
  const [useCustomImg, setUseCustomImg] = useState<boolean>(true);

  if (useCustomImg) {
    return (
      <img
        src={`/ai-icons/${id}.svg`}
        alt={id}
        className="codenotch-provider-glyph"
        style={s ? { width: s, height: s } : undefined}
        onError={() => setUseCustomImg(false)}
      />
    );
  }

  switch (id) {
    case "claude-code":
      // Anthropic Claude Code — Terracotta spark with terminal prompt
      return (
        <svg className="codenotch-provider-glyph" viewBox="0 0 24 24" fill="currentColor" width={s} height={s}>
          <path d="M12.8 2.3c-.4-.5-1.2-.5-1.6 0l-1 1.2c-.2.3-.6.5-1 .4l-1.5-.2c-.6-.1-1.2.3-1.2.9l-.1 1.5c0 .4-.2.8-.5 1l-1.3.8c-.5.4-.5 1.1 0 1.5l1.3.9c.3.2.5.6.5 1l.1 1.5c0 .6.5 1.1 1.2.9l1.5-.2c.4-.1.8.1 1 .4l1 1.2c.4.5 1.2.5 1.6 0l1-1.2c.2-.3.6-.5 1-.4l1.5.2c.6.1 1.2-.3 1.2-.9l.1-1.5c0-.4.2-.8.5-1l1.3-.9c.5-.4.5-1.1 0-1.5l-1.3-.8c-.3-.2-.5-.6-.5-1l-.1-1.5c0-.6-.5-1.1-1.2-.9l-1.5.2c-.4.1-.8-.1-1-.4l-1-1.2z" fill="#da7756"/>
          <path d="M4 17l3 2.5L4 22" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="9" y1="22" x2="13" y2="22" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      );
    case "claude":
      // Anthropic Claude — Official solid brandmark spark
      return (
        <svg className="codenotch-provider-glyph" viewBox="0 0 24 24" fill="currentColor" width={s} height={s}>
          <path d="M13.8 2.3c-.5-.6-1.5-.6-2 0l-1.3 1.6c-.3.4-.8.6-1.3.5L7.2 4.1c-.8-.2-1.5.4-1.5 1.2l-.1 2c0 .5-.3 1-.7 1.3L3.1 9.8c-.7.5-.7 1.5 0 2l1.8 1.2c.4.3.7.8.7 1.3l.1 2c0 .8.7 1.4 1.5 1.2l2-.3c.5-.1 1 .1 1.3.5l1.3 1.6c.5.6 1.5.6 2 0l1.3-1.6c.3-.4.8-.6 1.3-.5l2 .3c.8.2 1.5-.4 1.5-1.2l.1-2c0-.5.3-1 .7-1.3l1.8-1.2c.7-.5.7-1.5 0-2l-1.8-1.2c-.4-.3-.7-.8-.7-1.3l-.1-2c0-.8-.7-1.4-1.5-1.2l-2 .3c-.5.1-1-.1-1.3-.5l-1.3-1.6z"/>
        </svg>
      );
    case "chatgpt":
      // OpenAI Rosette Swirl (ChatGPT Desktop / Web)
      return (
        <svg className="codenotch-provider-glyph" viewBox="0 0 24 24" fill="currentColor" width={s} height={s}>
          <path d="M22.28 9.82a5.98 5.98 0 0 0-.51-4.91 6.05 6.05 0 0 0-6.51-2.9A6.06 6.06 0 0 0 4.98 4.18a5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.51 2.9A5.98 5.98 0 0 0 13.26 24a6.05 6.05 0 0 0 5.77-4.21 5.99 5.99 0 0 0 4-2.9 6.05 6.05 0 0 0-.75-7.07zm-9.02 12.61a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76c.24-.14.39-.4.39-.68v-6.74l2.02 1.17c.02.01.04.03.04.05v5.58a4.5 4.5 0 0 1-4.49 4.5zm-9.66-4.13a4.47 4.47 0 0 1-.53-3.01l.14.08 4.78 2.76a.77.77 0 0 0 .78 0l5.84-3.37v2.33a.08.08 0 0 1-.03.06L9.74 19.95a4.5 4.5 0 0 1-6.14-1.65zM2.34 7.9a4.48 4.48 0 0 1 2.37-1.98V11.6c0 .28.15.53.39.68l5.81 3.35-2.02 1.17a.08.08 0 0 1-.07 0l-4.83-2.79A4.5 4.5 0 0 1 2.34 7.9zm16.1 3.85-6.84-3.37 2.02-1.16a.08.08 0 0 1 .07 0l4.83 2.79a4.5 4.5 0 0 1-.68 8.1v-5.68c0-.28-.15-.53-.4-.68zm2.01-3.02l-.14-.09-4.77-2.78a.78.78 0 0 0-.79 0L9.41 9.23V6.9a.07.07 0 0 1 .03-.06l4.83-2.79a4.5 4.5 0 0 1 6.68 4.66zM8.31 12.86l-2.02-1.16a.08.08 0 0 1-.04-.06V6.07a4.5 4.5 0 0 1 7.38-3.45l-.14.08-4.79 2.76a.79.79 0 0 0-.39.68zm1.1-2.36 2.6-1.5 2.61 1.5v3l-2.61 1.5-2.6-1.5z"/>
        </svg>
      );
    case "codex":
      // OpenAI Codex CLI (Rosette Swirl with CLI terminal prompt indicator)
      return (
        <svg className="codenotch-provider-glyph" viewBox="0 0 24 24" fill="currentColor" width={s} height={s}>
          <path d="M22.28 9.82a5.98 5.98 0 0 0-.51-4.91 6.05 6.05 0 0 0-6.51-2.9A6.06 6.06 0 0 0 4.98 4.18a5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.51 2.9A5.98 5.98 0 0 0 13.26 24a6.05 6.05 0 0 0 5.77-4.21 5.99 5.99 0 0 0 4-2.9 6.05 6.05 0 0 0-.75-7.07zm-9.02 12.61a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76c.24-.14.39-.4.39-.68v-6.74l2.02 1.17c.02.01.04.03.04.05v5.58a4.5 4.5 0 0 1-4.49 4.5zm-9.66-4.13a4.47 4.47 0 0 1-.53-3.01l.14.08 4.78 2.76a.77.77 0 0 0 .78 0l5.84-3.37v2.33a.08.08 0 0 1-.03.06L9.74 19.95a4.5 4.5 0 0 1-6.14-1.65zM2.34 7.9a4.48 4.48 0 0 1 2.37-1.98V11.6c0 .28.15.53.39.68l5.81 3.35-2.02 1.17a.08.08 0 0 1-.07 0l-4.83-2.79A4.5 4.5 0 0 1 2.34 7.9zm16.1 3.85-6.84-3.37 2.02-1.16a.08.08 0 0 1 .07 0l4.83 2.79a4.5 4.5 0 0 1-.68 8.1v-5.68c0-.28-.15-.53-.4-.68zm2.01-3.02l-.14-.09-4.77-2.78a.78.78 0 0 0-.79 0L9.41 9.23V6.9a.07.07 0 0 1 .03-.06l4.83-2.79a4.5 4.5 0 0 1 6.68 4.66zM8.31 12.86l-2.02-1.16a.08.08 0 0 1-.04-.06V6.07a4.5 4.5 0 0 1 7.38-3.45l-.14.08-4.79 2.76a.79.79 0 0 0-.39.68zm1.1-2.36 2.6-1.5 2.61 1.5v3l-2.61 1.5-2.6-1.5z" opacity="0.6"/>
          <path d="M4 17.5l3 2.2L4 22" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="8.5" y1="22" x2="12.5" y2="22" stroke="#ffffff" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      );
    case "cursor":
      // Cursor Geometric Wireframe Prism
      return (
        <svg className="codenotch-provider-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={s} height={s}>
          <polygon points="12,3.5 19.5,7.8 19.5,16.2 12,20.5 4.5,16.2 4.5,7.8" />
          <line x1="12" y1="3.5" x2="12" y2="20.5" />
          <line x1="4.5" y1="7.8" x2="19.5" y2="16.2" />
          <line x1="4.5" y1="16.2" x2="19.5" y2="7.8" />
          <polygon points="12,9.8 13.6,12 12,14.2 10.4,12" fill="currentColor" stroke="none" />
        </svg>
      );
    case "copilot":
      // GitHub Copilot Aviator
      return (
        <svg className="codenotch-provider-glyph" viewBox="0 0 24 24" fill="currentColor" width={s} height={s}>
          <path d="M12 2a5 5 0 0 1 5 5v1h1a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3h-1v1a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-1H3a3 3 0 0 1-3-3v-2a3 3 0 0 1 3-3h1V7a5 5 0 0 1 5-5h3zm-3 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
        </svg>
      );
    case "mscopilot":
      // Microsoft Copilot — official loop ribbon
      return (
        <svg className="codenotch-provider-glyph" viewBox="0 0 24 24" fill="currentColor" width={s} height={s}>
          <path d="M18.8 8.6c-.3-2.1-1.9-3.8-4-4.2-2.5-.5-5 .8-6.1 3.1-.3.6-.1 1.4.5 1.7.6.3 1.4.1 1.7-.5.7-1.6 2.5-2.5 4.3-2.1 1.5.3 2.6 1.5 2.8 3 .2 1.5-.6 2.9-1.9 3.6l-2.8 1.4c-1.8.9-3 2.7-3 4.7v.7c0 .7.6 1.3 1.3 1.3s1.3-.6 1.3-1.3v-.7c0-1.2.7-2.3 1.8-2.8l2.8-1.4c2.1-1.1 3.4-3.3 3.1-5.7z"/>
          <path d="M8.5 17c.8 0 1.5-.7 1.5-1.5s-.7-1.5-1.5-1.5-1.5.7-1.5 1.5.7 1.5 1.5 1.5z" />
          <path d="M5.2 15.4c.3 2.1 1.9 3.8 4 4.2 2.5.5 5-.8 6.1-3.1.3-.6.1-1.4-.5-1.7-.6-.3-1.4-.1-1.7.5-.7 1.6-2.5 2.5-4.3 2.1-1.5-.3-2.6-1.5-2.8-3-.2-1.5.6-2.9 1.9-3.6l2.8-1.4c1.8-.9 3-2.7 3-4.7v-.7c0-.7-.6-1.3-1.3-1.3s-1.3.6-1.3 1.3v.7c0 1.2-.7 2.3-1.8 2.8l-2.8 1.4c-2.1 1.1-3.4 3.3-3.1 5.7z" opacity="0.6"/>
        </svg>
      );
    case "ollama":
      // Llama silhouette
      return (
        <svg className="codenotch-provider-glyph" viewBox="0 0 24 24" fill="currentColor" width={s} height={s}>
          <circle cx="9" cy="9" r="1.5" />
          <path d="M12 3c-1.1 0-2 .9-2 2v2H8c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h1v2c0 .6.4 1 1 1s1-.4 1-1v-2h4v2c0 .6.4 1 1 1s1-.4 1-1v-2h1c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2h-2V5c0-1.1-.9-2-2-2zm-2 6h4v4h-4V9z" />
        </svg>
      );
    case "lmstudio":
      // LM Studio — chat bubble with lightning
      return (
        <svg className="codenotch-provider-glyph" viewBox="0 0 24 24" fill="currentColor" width={s} height={s}>
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-9 11l2-4h-3l1-4 4 6h-3l-1 2z"/>
        </svg>
      );
    case "windsurf":
      // Windsurf — wave/surf icon
      return (
        <svg className="codenotch-provider-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" width={s} height={s}>
          <path d="M3 18 C6 14, 10 12, 14 14 C18 16, 20 14, 21 10" />
          <path d="M3 14 C6 10, 11 8, 16 10" />
          <path d="M3 22 C8 20, 14 20, 21 22" />
        </svg>
      );
    case "antigravity":
      // Antigravity / Gemini — twin sparkle mark
      return (
        <svg className="codenotch-provider-glyph" viewBox="0 0 24 24" fill="currentColor" width={s} height={s}>
          <path d="M12 2L10.5 10.5L2 12L10.5 13.5L12 22L13.5 13.5L22 12L13.5 10.5L12 2Z"/>
          <path d="M5 5L4.3 7.7L2 8L4.3 8.3L5 11L5.7 8.3L8 8L5.7 7.7L5 5Z" opacity="0.6"/>
        </svg>
      );
    default:
      return (
        <span
          className="codenotch-provider-fallback"
          style={{
            color,
            fontSize: s ? Math.round(s * 0.7) : undefined,
          }}
        >
          {id.slice(0, 2).toUpperCase()}
        </span>
      );
  }
};

/* Status dot indicator */
const StatusDot: React.FC<{ status: string }> = ({ status }) => {
  const color = status === "active" ? "#22c55e" : status === "idle" ? "#f59e0b" : "#6b7280";
  return (
    <span
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
      }}
    />
  );
};

/* Dynamic remaining quota color mapping:
   - 0% to 25%: Red (#ef4444)
   - 26% to 75%: Amber / Yellow-Orange (#f59e0b)
   - 76% to 100%: Green (#22c55e)
*/
const getRemainingColor = (percent: number): string => {
  if (percent <= 25) return "#ef4444";
  if (percent <= 75) return "#f59e0b";
  return "#22c55e";
};

export const CodeNotch: React.FC = () => {
  const { settings } = useSettings();
  const { activeFlyout } = useFlyout();
  const isFlyoutOpen = activeFlyout !== null;

  const [hoveredAssistantId, setHoveredAssistantId] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [popoverTop, setPopoverTop] = useState<number>(100);
  const notchRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const collapseTimeoutRef = useRef<number | null>(null);
  const [currentSection, setCurrentSection] = useState<number>(0);

  // MRU (Most Recently Used / Active) ordering: Active/opened AI automatically jumps to position 0 (the top)
  const [mruOrder, setMruOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("glace_codenotch_mru");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const promoteAssistant = useCallback((id: string) => {
    if (!id) return;
    setMruOrder((prev) => {
      if (prev[0] === id) return prev;
      const next = [id, ...prev.filter((item) => item !== id)];
      try {
        localStorage.setItem("glace_codenotch_mru", JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const isEnabled = settings?.enable_codenotch ?? true;
  const position = settings?.codenotch_position === "left" ? "left" : "right";

  const isActive = isHovered && !isFlyoutOpen;

  const { assistants, launchAssistant } = useAiAssistants(
    isHovered || hoveredAssistantId !== null
  );

  // Detect newly launched/running assistants and promote them to the top of the notch
  const prevRunningRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const runningIds = new Set(
      assistants.filter((a) => a.is_running || a.session_status === "active").map((a) => a.id)
    );
    for (const id of runningIds) {
      if (!prevRunningRef.current.has(id)) {
        promoteAssistant(id);
        break;
      }
    }
    prevRunningRef.current = runningIds;
  }, [assistants, promoteAssistant]);

  // Listen for window focus events across the OS: if an AI app is focused, promote it to the top
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    tauriBridge
      .onWindowsUpdated((windows) => {
        const focused = windows.find((w) => w.is_focused && !w.is_minimized);
        if (!focused) return;

        const title = (focused.title || "").toLowerCase();
        const exe = (focused.exe || "").toLowerCase();

        let matchedId: string | null = null;
        if (exe.includes("antigravity") || title.includes("antigravity")) {
          matchedId = "antigravity";
        } else if (exe.includes("cursor") || title.includes("cursor")) {
          matchedId = "cursor";
        } else if (exe.includes("claude") || title.includes("claude")) {
          if (exe.includes("cmd") || exe.includes("powershell") || exe.includes("windowsterminal")) {
            matchedId = "claude-code";
          } else {
            matchedId = "claude";
          }
        } else if (exe.includes("chatgpt") || title.includes("chatgpt")) {
          matchedId = "chatgpt";
        } else if (title.includes("codex")) {
          matchedId = "codex";
        } else if (exe.includes("code") && title.includes("copilot")) {
          matchedId = "copilot";
        } else if (exe.includes("lmstudio") || exe.includes("lm studio")) {
          matchedId = "lmstudio";
        } else if (exe.includes("ollama")) {
          matchedId = "ollama";
        }

        if (matchedId) {
          promoteAssistant(matchedId);
        }
      })
      .then((unsub) => {
        unlisten = unsub;
      })
      .catch(console.error);

    return () => {
      if (unlisten) unlisten();
    };
  }, [promoteAssistant]);

  // Show active/running AIs ordered by MRU (top AI is the most recently opened/active).
  // When no AI is running, returns an empty array so CodeNotch hides completely.
  // CodeNotch only displays when one or more AI assistants are actively open/running.
  const displayAssistants: AiProviderStatus[] = useMemo(() => {
    const active = assistants.filter((a) => a.is_running || a.session_status === "active");

    if (active.length === 0) {
      return [];
    }

    const sortByMru = (list: AiProviderStatus[]) => {
      return [...list].sort((a, b) => {
        const idxA = mruOrder.indexOf(a.id);
        const idxB = mruOrder.indexOf(b.id);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return 0;
      });
    };

    return sortByMru(active);
  }, [assistants, mruOrder]);

  const totalSections = Math.max(1, Math.ceil(displayAssistants.length / 4));

  const selectedAssistant = useMemo(
    () =>
      displayAssistants.find((a) => a.id === hoveredAssistantId) || null,
    [displayAssistants, hoveredAssistantId]
  );

  // Track popover Y alignment relative to the hovered item
  const updatePopoverPosition = (id: string) => {
    const el = itemRefs.current.get(id);
    if (el && notchRef.current) {
      const notchRect = notchRef.current.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const relativeTop = elRect.top - notchRect.top + elRect.height / 2;
      const clampedTop = Math.max(30, Math.min(relativeTop, Math.max(60, notchRect.height - 30)));
      setPopoverTop(clampedTop);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (totalSections <= 1) return;
    e.stopPropagation();
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        top: e.deltaY,
        behavior: "smooth",
      });
    }
  };

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const maxScroll = scrollHeight - clientHeight;
    if (maxScroll <= 0) {
      setCurrentSection(0);
    } else {
      const fraction = scrollTop / maxScroll;
      const section = Math.min(
        totalSections - 1,
        Math.max(0, Math.round(fraction * (totalSections - 1)))
      );
      setCurrentSection(section);
    }

    const currentId = hoveredAssistantId;
    if (currentId) {
      updatePopoverPosition(currentId);
    }
  };

  const scrollToSection = (sectionIndex: number) => {
    if (!scrollContainerRef.current) return;
    const { scrollHeight, clientHeight } = scrollContainerRef.current;
    const maxScroll = scrollHeight - clientHeight;
    if (totalSections > 1 && maxScroll > 0) {
      const targetTop = (sectionIndex / (totalSections - 1)) * maxScroll;
      scrollContainerRef.current.scrollTo({
        top: targetTop,
        behavior: "smooth",
      });
    }
    setCurrentSection(sectionIndex);
  };

  const [isShiftDown, setIsShiftDown] = useState<boolean>(false);
  const [isPeekHovered, setIsPeekHovered] = useState<boolean>(false);

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

  // CodeNotch peek is active ONLY when hovering CodeNotch + peek key is pressed
  const isCodeNotchPeek = isShiftDown && (isHovered || isPeekHovered);

  useEffect(() => {
    tauriBridge.setCodeNotchPeek(isCodeNotchPeek);
  }, [isCodeNotchPeek]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    tauriBridge
      .onNotchShiftState((payload) => {
        setIsShiftDown(payload.is_down);
        if (payload.is_down) {
          setIsPeekHovered(!!payload.in_codenotch);
        } else {
          setIsPeekHovered(false);
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
        setIsPeekHovered(false);
      }
    };

    const handleBlur = () => {
      setIsShiftDown(false);
      setIsPeekHovered(false);
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
  }, [peekKey]);

  const handleMouseEnterNotch = () => {
    if (isFlyoutOpen) return;
    if (collapseTimeoutRef.current) {
      window.clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = null;
    }
    setIsHovered(true);
    if (isShiftDown) {
      setIsPeekHovered(true);
    }
    windowExpansion.request("codenotch", 480);
  };

  const handleMouseLeaveNotch = () => {
    setIsHovered(false);
    if (!isShiftDown) {
      setIsPeekHovered(false);
    }
    if (collapseTimeoutRef.current) window.clearTimeout(collapseTimeoutRef.current);
    collapseTimeoutRef.current = window.setTimeout(() => {
      setHoveredAssistantId(null);
      windowExpansion.release("codenotch");
    }, 220);
  };

  const handleMouseEnterItem = (id: string) => {
    if (isFlyoutOpen) return;
    if (collapseTimeoutRef.current) {
      window.clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = null;
    }
    setIsHovered(true);
    setHoveredAssistantId(id);
    updatePopoverPosition(id);
    windowExpansion.request("codenotch", 480);
  };

  const lastTapRef = useRef<{ id: string; time: number }>({ id: "", time: 0 });
  const lastLaunchRef = useRef<number>(0);

  const triggerLaunch = useCallback(
    async (id: string) => {
      const now = Date.now();
      if (now - lastLaunchRef.current < 400) return;
      lastLaunchRef.current = now;
      lastTapRef.current = { id: "", time: 0 };

      // Simultaneously promote icon to 1st position and open/focus app window
      promoteAssistant(id);
      setIsHovered(true);
      windowExpansion.request("codenotch", 480);
      await launchAssistant(id);
    },
    [promoteAssistant, launchAssistant]
  );

  const handleClickItem = (id: string, e: React.MouseEvent) => {
    if (isFlyoutOpen) return;
    e.stopPropagation();

    const now = Date.now();
    const isDouble =
      e.detail === 2 || (lastTapRef.current.id === id && now - lastTapRef.current.time < 380);
    lastTapRef.current = { id, time: now };

    if (isDouble) {
      triggerLaunch(id);
    }
  };

  const handleDoubleClickItem = (id: string, e: React.MouseEvent) => {
    if (isFlyoutOpen) return;
    e.stopPropagation();
    triggerLaunch(id);
  };

  // Dismiss popover and notch hover when flyout (settings, calendar, etc.) is open
  useEffect(() => {
    if (isFlyoutOpen) {
      setHoveredAssistantId(null);
      setIsHovered(false);
      windowExpansion.release("codenotch");
    }
  }, [isFlyoutOpen]);

  // Synchronize React state with windowExpansion so transparent space clicks never desync
  useEffect(() => {
    const unsubscribe = windowExpansion.subscribe((expanded) => {
      if (!expanded) {
        setHoveredAssistantId(null);
        setIsHovered(false);
      }
    });
    return unsubscribe;
  }, []);

  // Close when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | PointerEvent) => {
      if (notchRef.current && !notchRef.current.contains(e.target as Node)) {
        setHoveredAssistantId(null);
        setIsHovered(false);
        windowExpansion.release("codenotch");
      }
    };
    window.addEventListener("pointerdown", handleOutsideClick, true);
    return () => {
      window.removeEventListener("pointerdown", handleOutsideClick, true);
      if (collapseTimeoutRef.current) window.clearTimeout(collapseTimeoutRef.current);
    };
  }, []);

  // Dismiss popover & release codenotch expansion immediately if window loses focus (e.g. clicking VS Code)
  useEffect(() => {
    const handleBlur = () => {
      if (document.hasFocus && document.hasFocus()) {
        return;
      }
      // If user is currently hovering the notch, or an app was just launched within 2s, keep notch in active state!
      if (notchRef.current?.matches(":hover") || Date.now() - lastLaunchRef.current < 2000) {
        return;
      }
      setHoveredAssistantId(null);
      setIsHovered(false);
      windowExpansion.release("codenotch");
    };
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  // Synchronize exact CodeNotch visibility and assistant count with Rust Win32 GDI region
  useEffect(() => {
    const isVisible = isEnabled && displayAssistants.length > 0;
    tauriBridge.updateCodeNotchState(isVisible, displayAssistants.length).catch(console.error);
  }, [isEnabled, displayAssistants.length]);

  // Release window expansion & reset hover/active state when no active assistants remain
  useEffect(() => {
    if (displayAssistants.length === 0) {
      if (hoveredAssistantId || isHovered) {
        setHoveredAssistantId(null);
        setIsHovered(false);
      }
      windowExpansion.release("codenotch");
    }
  }, [displayAssistants.length, hoveredAssistantId, isHovered]);

  // Clean up on unmount: clear GDI region and release expansion
  useEffect(() => {
    return () => {
      tauriBridge.updateCodeNotchState(false, 0).catch(console.error);
      windowExpansion.release("codenotch");
    };
  }, []);

  // Clear hovered ID if that assistant is no longer active
  useEffect(() => {
    if (hoveredAssistantId && !displayAssistants.some((a) => a.id === hoveredAssistantId)) {
      setHoveredAssistantId(null);
    }
  }, [displayAssistants, hoveredAssistantId]);

  // If disabled or no active AIs, do not show the notch at all
  if (!isEnabled || displayAssistants.length === 0) {
    return null;
  }

  return (
    <div
      ref={notchRef}
      className={`codenotch-vertical-notch codenotch-pos--${position} ${
        isActive ? "codenotch-vertical-notch--active" : ""
      } ${isCodeNotchPeek ? "codenotch-peek-through" : ""} ${
        isFlyoutOpen ? "codenotch-vertical-notch--flyout-open" : ""
      }`}
      onMouseEnter={handleMouseEnterNotch}
      onMouseLeave={handleMouseLeaveNotch}
      onWheel={handleWheel}
    >
      {/* Concave Corner Ears merging smoothly with screen bezel */}
      <svg
        className="codenotch-ear codenotch-ear--top"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <path d="M100,0 A100,100 0 0,1 0,100 L100,100 Z" fill="#000000" />
      </svg>
      <svg
        className="codenotch-ear codenotch-ear--bottom"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <path d="M0,0 A100,100 0 0,1 100,100 L100,0 Z" fill="#000000" />
      </svg>

      {/* Scrollable Viewport wrapping items column */}
      <div
        className="codenotch-items-viewport"
        ref={scrollContainerRef}
        onScroll={handleScroll}
      >
        <div className="codenotch-items-column">
        {displayAssistants.length === 0 && isActive && (
          <div className="codenotch-empty-hint">
            <span style={{ fontSize: 10, color: "#666", textAlign: "center", padding: "4px 6px", lineHeight: 1.3 }}>
              No AI tools detected
            </span>
          </div>
        )}
        {displayAssistants.map((assistant, index) => {
          const isSelected = selectedAssistant?.id === assistant.id;
          const isRemainingMode = assistant.tags?.some((t) => t.toLowerCase().includes("remaining"));
          const percent = Math.round(assistant.usage_percent ?? 0);
          const ringColor = isRemainingMode
            ? getRemainingColor(percent)
            : assistant.icon_color;

          // SVG Ring calculation: Radius r=16.5, C = 2 * PI * 16.5 = 103.67
          const r = 16.5;
          const c = 2 * Math.PI * r;
          const offset = c - (percent / 100) * c;

          return (
            <div
              key={assistant.id}
              ref={(el) => {
                if (el) itemRefs.current.set(assistant.id, el);
                else itemRefs.current.delete(assistant.id);
              }}
              className={`codenotch-ring-item ${isSelected ? "codenotch-ring-item--selected" : ""} ${!assistant.is_running ? "codenotch-ring-item--idle" : ""}`}
              style={{
                "--item-color": ringColor,
                animationDelay: `${index * 45}ms`,
              } as React.CSSProperties}
              title={`${assistant.name}${assistant.is_running ? " (Active)" : ""} — Double-click to ${assistant.is_running ? "focus" : "open"}`}
              onMouseEnter={() => handleMouseEnterItem(assistant.id)}
              onClick={(e) => handleClickItem(assistant.id, e)}
              onDoubleClick={(e) => handleDoubleClickItem(assistant.id, e)}
            >
              {/* Outer Circular Ring Gauge */}
              <div className="codenotch-ring-gauge">
                <svg className="codenotch-ring-svg" width="40" height="40" viewBox="0 0 40 40">
                  {/* Background Track Circle */}
                  <circle
                    cx="20"
                    cy="20"
                    r={r}
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.14)"
                    strokeWidth="3"
                  />
                  {/* Active Colored Arc — show if percent > 0 or if assistant is running */}
                  {(percent > 0 || assistant.is_running) && (
                    <circle
                      cx="20"
                      cy="20"
                      r={r}
                      fill="none"
                      stroke={ringColor}
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={c}
                      strokeDashoffset={assistant.usage_percent != null ? offset : 0}
                      transform="rotate(-90 20 20)"
                      className={assistant.is_running ? "codenotch-ring-arc--active" : ""}
                      opacity={assistant.usage_percent != null ? (assistant.is_running ? 1 : 0.45) : (assistant.is_running ? 0.95 : 0)}
                    />
                  )}
                </svg>

                {/* Inner Icon Badge Circle */}
                <div className="codenotch-inner-badge" style={{ opacity: assistant.is_running ? 1 : 0.5 }}>
                  <ProviderGlyph id={assistant.id} color={assistant.icon_color} />
                </div>
              </div>

              {/* Percentage or Status Label */}
              <span className="codenotch-ring-percent" style={{ color: isRemainingMode ? ringColor : undefined }}>
                {assistant.usage_percent != null ? `${percent}%` : (assistant.is_running ? "active" : "idle")}
              </span>
            </div>
          );
        })}

        </div>
      </div>

      {/* Pagination dots indicating multiple sections/pages to scroll to (active notch only) */}
      {isActive && totalSections > 1 && (
        <div className="codenotch-pagination-dots" onClick={(e) => e.stopPropagation()}>
          {Array.from({ length: totalSections }).map((_, idx) => (
            <button
              key={idx}
              type="button"
              className={`codenotch-page-dot ${currentSection === idx ? "codenotch-page-dot--active" : ""}`}
              onClick={() => scrollToSection(idx)}
              title={`Section ${idx + 1} of ${totalSections}`}
            />
          ))}
        </div>
      )}

      {/* ─── SPEECH BUBBLE POPOVER CARD (Flies out to show details only; does not trap hover) ─── */}
      {selectedAssistant && !isCodeNotchPeek && !isFlyoutOpen && (
        <div
          className="codenotch-speech-bubble"
          style={{ top: `${popoverTop}px` }}
        >
          {/* Triangular pointer pointing to the active circle */}
          <div className="codenotch-bubble-arrow" />

          {/* Animated content container keyed by assistant ID for smooth transitions */}
          <div key={selectedAssistant.id} className="codenotch-bubble-content-animated">
            {/* Header with Icon, Status, Title, Model Chip, and Launch Action */}
            <div className="codenotch-bubble-header">
            <span className="codenotch-bubble-icon" style={{ color: selectedAssistant.icon_color }}>
              <ProviderGlyph id={selectedAssistant.id} color={selectedAssistant.icon_color} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span className="codenotch-bubble-title">{selectedAssistant.name}</span>
                <StatusDot status={selectedAssistant.session_status} />
                {selectedAssistant.active_model && (
                  <span className="codenotch-model-chip-header">
                    {selectedAssistant.active_model}
                  </span>
                )}
              </div>
              {selectedAssistant.detail && (
                <div className="codenotch-bubble-detail">{selectedAssistant.detail}</div>
              )}
            </div>
          </div>

          {/* Metric 1: Primary Rate / Quota Limit */}
          {selectedAssistant.usage_percent != null && (() => {
            const isRemainingMode = selectedAssistant.tags?.some((t) => t.toLowerCase().includes("remaining"));
            const percent = Math.round(selectedAssistant.usage_percent ?? 0);
            const metricName = selectedAssistant.tags?.find((t) => t.startsWith("metric1:"))?.slice(8)
              || (isRemainingMode ? "Rate Limit" : selectedAssistant.category === "cli" ? "Current session" : "Usage Quota");
            const barColor = isRemainingMode
              ? getRemainingColor(percent)
              : (percent > 85 ? "#ef4444" : selectedAssistant.icon_color);

            return (
              <div className="codenotch-metric-block">
                <div className="codenotch-metric-row">
                  <span className="codenotch-metric-name">{metricName}</span>
                  <span className="codenotch-metric-meta">
                    {selectedAssistant.session_reset_time || "—"}
                  </span>
                </div>
                <div className="codenotch-progress-rail">
                  <div
                    className="codenotch-progress-fill"
                    style={{
                      width: `${Math.min(100, Math.max(0, percent))}%`,
                      background: barColor,
                    }}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span
                    className="codenotch-metric-usage"
                    style={{ color: isRemainingMode ? barColor : undefined, fontWeight: 600 }}
                  >
                    {isRemainingMode ? `${percent}% Remaining` : `${percent}% Used`}
                  </span>
                  {isRemainingMode ? (
                    <span style={{ fontSize: 11, color: "#71717a", fontWeight: 500 }}>
                      {100 - percent}% used
                    </span>
                  ) : (
                    selectedAssistant.all_models_reset_time && selectedAssistant.all_models_usage_percent == null && (
                      <span style={{ fontSize: 11, color: "#64748b", marginTop: 4, fontWeight: 500 }}>
                        {selectedAssistant.all_models_reset_time}
                      </span>
                    )
                  )}
                </div>
              </div>
            );
          })()}

          {/* Metric 2: Secondary / Weekly Limit */}
          {selectedAssistant.all_models_usage_percent != null && (() => {
            const isRemainingMode = selectedAssistant.tags?.some((t) => t.toLowerCase().includes("remaining"));
            const weeklyPercent = Math.round(selectedAssistant.all_models_usage_percent ?? 0);
            const metric2Name = selectedAssistant.tags?.find((t) => t.startsWith("metric2:"))?.slice(8)
              || (isRemainingMode ? "Weekly Limit" : "All models");
            const barColor = isRemainingMode
              ? getRemainingColor(weeklyPercent)
              : (weeklyPercent > 85 ? "#ef4444" : "#22c55e");

            return (
              <div className="codenotch-metric-block">
                <div className="codenotch-metric-row">
                  <span className="codenotch-metric-name">{metric2Name}</span>
                  <span className="codenotch-metric-meta">
                    {selectedAssistant.all_models_reset_time || "—"}
                  </span>
                </div>
                <div className="codenotch-progress-rail">
                  <div
                    className="codenotch-progress-fill"
                    style={{
                      width: `${Math.min(100, Math.max(0, weeklyPercent))}%`,
                      background: barColor,
                    }}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span
                    className="codenotch-metric-usage"
                    style={{ color: isRemainingMode ? barColor : undefined, fontWeight: 600 }}
                  >
                    {isRemainingMode ? `${weeklyPercent}% Remaining` : `${weeklyPercent}% Used`}
                  </span>
                  {isRemainingMode && (
                    <span style={{ fontSize: 11, color: "#71717a", fontWeight: 500 }}>
                      {100 - weeklyPercent}% used
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Dynamic Provider Note / Sub-Quota (if provided in tags) */}
          {(() => {
            const note = selectedAssistant.tags?.find((t) => t.startsWith("note:"))?.slice(5);
            const noteTitle = selectedAssistant.tags?.find((t) => t.startsWith("note_title:"))?.slice(11);
            if (!note) return null;
            return (
              <div className="codenotch-metric-block" style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)", paddingTop: 8 }}>
                {noteTitle && (
                  <div className="codenotch-metric-row">
                    <span className="codenotch-metric-name" style={{ fontSize: 11, color: "#a1a1aa" }}>
                      {noteTitle}
                    </span>
                  </div>
                )}
                <div style={{ fontSize: 11, color: "#71717a", marginTop: 2 }}>
                  {note}
                </div>
              </div>
            );
          })()}

            {/* Unmetered / Live Active Session Panel */}
            {selectedAssistant.usage_percent == null && selectedAssistant.all_models_usage_percent == null && (
              <div className="codenotch-unmetered-panel">
                <div className="codenotch-unmetered-badge-row">
                  <div className="codenotch-live-indicator-pill">
                    <span className={`codenotch-pulse-radar ${selectedAssistant.is_running ? "codenotch-pulse-radar--active" : ""}`} />
                    <span className="codenotch-live-indicator-text">
                      {selectedAssistant.is_running
                        ? (selectedAssistant.category === "desktop" ? "Desktop App Active" : "Browser Session")
                        : "Application Standby"}
                    </span>
                  </div>
                  {selectedAssistant.category && (
                    <span className="codenotch-surface-chip">
                      {selectedAssistant.category.toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="codenotch-unmetered-footnote">
                  {selectedAssistant.is_running
                    ? "Live unmetered workspace · Ready to prompt"
                    : "Installed on this system · Ready to launch"}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
