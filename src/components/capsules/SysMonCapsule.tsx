import React from "react";
import { tauriBridge } from "../../services/tauriBridge";
import { useSettings } from "../../stores/settingsStore";
import { useSystemMetrics } from "../../hooks/useSystemMetrics";

export const SysMonCapsule: React.FC = () => {
  const { settings, setSysMonMode } = useSettings();
  const metrics = useSystemMetrics();

  const mode = settings.sysmon_mode || "cpu_ram";

  const getLoadClass = (val: number) => {
    if (val >= 85) return "sysmon-val--high";
    if (val >= 65) return "sysmon-val--mid";
    return "sysmon-val--normal";
  };

  const handleCycleMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextMode =
      mode === "cpu_ram"
        ? "network"
        : mode === "network"
        ? "both"
        : "cpu_ram";
    setSysMonMode(nextMode);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    tauriBridge.launchApp("taskmgr.exe").catch(console.error);
  };

  const cpuText = `${metrics.cpu_percent}%`;
  const ramText = `${metrics.ram_percent}%`;
  const downText = metrics.net_recv_formatted || "0 B/s";
  const upText = metrics.net_sent_formatted || "0 B/s";

  const fullTooltip = `System Monitor (Click to cycle mode, Right-click for Task Manager)\n• CPU: ${cpuText}\n• RAM: ${ramText} (${(
    metrics.used_ram_mb / 1024
  ).toFixed(1)}GB / ${(metrics.total_ram_mb / 1024).toFixed(0)}GB)\n• Download: ${downText}\n• Upload: ${upText}`;

  return (
    <div
      className={`capsule capsule--compact sysmon-capsule sysmon-capsule--${mode}`}
      onClick={handleCycleMode}
      onContextMenu={handleContextMenu}
      title={fullTooltip}
    >
      <div className="sysmon-metrics">
        {/* CPU & RAM Mode */}
        {(mode === "cpu_ram" || mode === "both") && (
          <>
            <div className="sysmon-item">
              <span className="sysmon-label">CPU</span>
              <span className={`sysmon-value ${getLoadClass(metrics.cpu_percent)}`}>
                {cpuText}
              </span>
            </div>

            <div className="sysmon-divider" />

            <div className="sysmon-item">
              <span className="sysmon-label">RAM</span>
              <span className={`sysmon-value ${getLoadClass(metrics.ram_percent)}`}>
                {ramText}
              </span>
            </div>
          </>
        )}

        {/* Divider between CPU/RAM and Network in 'both' mode */}
        {mode === "both" && <div className="sysmon-divider" />}

        {/* Internet Speed Mode */}
        {(mode === "network" || mode === "both") && (
          <div className="sysmon-net-group">
            {/* Download Speed */}
            <div className="sysmon-item sysmon-net-item" title={`Download: ${downText}`}>
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="sysmon-net-icon sysmon-net-icon--down"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <polyline points="19 12 12 19 5 12" />
              </svg>
              <span className="sysmon-value sysmon-net-val sysmon-net-val--down">
                {downText}
              </span>
            </div>

            <div className="sysmon-divider sysmon-divider--subtle" />

            {/* Upload Speed */}
            <div className="sysmon-item sysmon-net-item" title={`Upload: ${upText}`}>
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="sysmon-net-icon sysmon-net-icon--up"
              >
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
              <span className="sysmon-value sysmon-net-val sysmon-net-val--up">
                {upText}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
