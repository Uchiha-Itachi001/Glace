import React, { useState, useMemo, useEffect, useRef } from "react";
import { tauriBridge } from "../../services/tauriBridge";
import { useSettings } from "../../stores/settingsStore";

interface PinnedApp {
  id: string;
  name: string;
  category: "Developer" | "Web" | "System" | "Utilities" | "Media";
  cmd: string;
  iconSvg: React.ReactNode;
}

interface StartLauncherFlyoutProps {
  onClose: () => void;
}

const APPS: PinnedApp[] = [
  {
    id: "explorer",
    name: "File Explorer",
    category: "System",
    cmd: "explorer",
    iconSvg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
        <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
      </svg>
    ),
  },
  {
    id: "browser",
    name: "Browser",
    category: "Web",
    cmd: "msedge",
    iconSvg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
  },
  {
    id: "terminal",
    name: "Windows Terminal",
    category: "Developer",
    cmd: "wt",
    iconSvg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    ),
  },
  {
    id: "vscode",
    name: "VS Code",
    category: "Developer",
    cmd: "code",
    iconSvg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    id: "settings",
    name: "Windows Settings",
    category: "System",
    cmd: "ms-settings:",
    iconSvg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    id: "taskmgr",
    name: "Task Manager",
    category: "System",
    cmd: "taskmgr",
    iconSvg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="2">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
  },
  {
    id: "calc",
    name: "Calculator",
    category: "Utilities",
    cmd: "calc",
    iconSvg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
        <rect width="16" height="20" x="4" y="2" rx="2" />
        <line x1="8" x2="16" y1="6" y2="6" />
        <line x1="16" x2="16" y1="14" y2="18" />
        <path d="M8 10h.01" />
        <path d="M12 10h.01" />
        <path d="M16 10h.01" />
      </svg>
    ),
  },
  {
    id: "notepad",
    name: "Notepad",
    category: "Utilities",
    cmd: "notepad",
    iconSvg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    ),
  },
  {
    id: "spotify",
    name: "Spotify / Music",
    category: "Media",
    cmd: "spotify",
    iconSvg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M8 15c2.5-1 5.5-1 8 0" />
        <path d="M7 12c3.5-1.5 7.5-1.5 10 0" />
        <path d="M6 9c4.5-2 9.5-2 12 0" />
      </svg>
    ),
  },
];

const CATEGORIES = ["All", "Developer", "Web", "System", "Utilities", "Media"] as const;

export const StartLauncherFlyout: React.FC<StartLauncherFlyoutProps> = ({ onClose }) => {
  const { settings } = useSettings();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [showPowerMenu, setShowPowerMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const barAlign = settings?.bar_alignment || "center";
  const barPos = settings?.bar_position || "bottom";

  // Evaluate instant math expression
  const mathResult = useMemo(() => {
    const trimmed = search.trim();
    if (/^[\d\s+\-*/%^().]+$/.test(trimmed) && /[\d]/.test(trimmed) && /[+\-*/%]/.test(trimmed)) {
      try {
        // Safe math evaluation
        const sanitized = trimmed.replace(/\^/g, "**");
        const res = Function(`"use strict"; return (${sanitized})`)();
        if (typeof res === "number" && !isNaN(res) && isFinite(res)) {
          return res;
        }
      } catch {
        return null;
      }
    }
    return null;
  }, [search]);

  // Check if shell command runner prefix is used (e.g. `> cmd`)
  const isCommandRunner = search.trim().startsWith(">");
  const commandToRun = isCommandRunner ? search.trim().slice(1).trim() : "";

  const filteredApps = useMemo(() => {
    if (isCommandRunner || mathResult !== null) return [];
    let list = APPS;
    if (activeCategory !== "All") {
      list = list.filter((app) => app.category === activeCategory);
    }
    if (!search.trim()) return list;
    const query = search.toLowerCase();
    return list.filter(
      (app) =>
        app.name.toLowerCase().includes(query) ||
        app.category.toLowerCase().includes(query) ||
        app.cmd.toLowerCase().includes(query)
    );
  }, [search, activeCategory, isCommandRunner, mathResult]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredApps, search, activeCategory]);

  const handleLaunch = (cmd: string) => {
    tauriBridge.launchApp(cmd).catch(console.error);
    onClose();
  };

  const handlePowerAction = (action: "lock" | "sleep" | "restart" | "shutdown") => {
    tauriBridge.powerAction(action).catch(console.error);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filteredApps.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % filteredApps.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filteredApps.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + filteredApps.length) % filteredApps.length);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (mathResult !== null) {
        navigator.clipboard.writeText(String(mathResult));
        onClose();
      } else if (isCommandRunner && commandToRun) {
        handleLaunch(commandToRun);
      } else if (filteredApps[selectedIndex]) {
        handleLaunch(filteredApps[selectedIndex].cmd);
      }
    }
  };

  return (
    <div
      className={`launcher-flyout flyout-enter launcher-flyout--align-${barAlign} launcher-flyout--pos-${barPos}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Search Input Bar */}
      <div className="launcher-search-container">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--glace-accent)"
          strokeWidth="2.5"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search apps, calc (e.g. 42*8), run (> cmd)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          className="launcher-search-input"
        />
        {search && (
          <button className="launcher-clear-btn" onClick={() => setSearch("")}>
            ✕
          </button>
        )}
      </div>

      {/* Category Pills */}
      {!search && (
        <div className="launcher-category-bar">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={`launcher-category-chip ${
                activeCategory === cat ? "launcher-category-chip--active" : ""
              }`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Instant Math Result Card */}
      {mathResult !== null && (
        <div
          className="launcher-calc-card flyout-enter"
          onClick={() => {
            navigator.clipboard.writeText(String(mathResult));
            onClose();
          }}
          title="Click or press Enter to copy result"
        >
          <div className="calc-expr">{search} =</div>
          <div className="calc-result">{mathResult}</div>
          <span className="calc-hint">Press ↵ Enter to copy</span>
        </div>
      )}

      {/* Command Runner Card */}
      {isCommandRunner && (
        <div
          className="launcher-command-card flyout-enter"
          onClick={() => commandToRun && handleLaunch(commandToRun)}
        >
          <div className="command-icon">⚡</div>
          <div className="command-info">
            <span className="command-title">Run Shell Command</span>
            <span className="command-str">{commandToRun || "type a command..."}</span>
          </div>
          <span className="calc-hint">Press ↵ Enter</span>
        </div>
      )}

      {/* Apps Section Header */}
      {!isCommandRunner && mathResult === null && (
        <>
          <div className="launcher-section-header">
            <span>{search ? "Search Results" : "Applications"}</span>
            <button
              className="launcher-native-start-btn icon-hover"
              onClick={() => {
                tauriBridge.openStartMenu();
                onClose();
              }}
              title="Open Native Windows Start"
            >
              Windows Start ↗
            </button>
          </div>

          {/* Apps Grid */}
          <div className="launcher-apps-grid">
            {filteredApps.map((app, idx) => (
              <div
                key={app.id}
                className={`launcher-app-tile icon-hover ${
                  selectedIndex === idx ? "launcher-app-tile--selected" : ""
                }`}
                onClick={() => handleLaunch(app.cmd)}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div className="launcher-app-icon">{app.iconSvg}</div>
                <span className="launcher-app-name">{app.name}</span>
                <span className="launcher-app-category">{app.category}</span>
              </div>
            ))}

            {filteredApps.length === 0 && (
              <div className="launcher-empty">
                <span>No matching apps found</span>
                <span className="launcher-empty-sub">Type &gt; to execute a command</span>
              </div>
            )}
          </div>
        </>
      )}

      <div className="calendar-divider" />

      {/* Footer & Power Controls */}
      <div className="launcher-footer">
        <div className="launcher-user-info">
          <div className="launcher-avatar">
            <span>✨</span>
          </div>
          <span className="launcher-username">Glace Desktop</span>
        </div>

        <div className="launcher-power-container">
          <button
            className={`launcher-power-btn icon-hover ${
              showPowerMenu ? "launcher-power-btn--active" : ""
            }`}
            onClick={() => setShowPowerMenu(!showPowerMenu)}
            title="Power options"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
              <line x1="12" y1="2" x2="12" y2="12" />
            </svg>
          </button>

          {showPowerMenu && (
            <div className="launcher-power-menu flyout-enter">
              <button
                className="launcher-power-menu-item"
                onClick={() => handlePowerAction("lock")}
              >
                🔒 Lock
              </button>
              <button
                className="launcher-power-menu-item"
                onClick={() => handlePowerAction("sleep")}
              >
                🌙 Sleep
              </button>
              <button
                className="launcher-power-menu-item"
                onClick={() => handlePowerAction("restart")}
              >
                🔄 Restart
              </button>
              <button
                className="launcher-power-menu-item launcher-power-menu-item--danger"
                onClick={() => handlePowerAction("shutdown")}
              >
                ⏻ Shut Down
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
