import React, { useState, useEffect } from "react";
import { SystemMetrics } from "../../types";
import { tauriBridge } from "../../services/tauriBridge";

export const SysMonCapsule: React.FC = () => {
  const [metrics, setMetrics] = useState<SystemMetrics>({
    ram_percent: 44,
    total_ram_mb: 16384,
    used_ram_mb: 7200,
    cpu_percent: 15,
    battery_percent: 100,
    is_charging: true,
    has_battery: true,
  });

  useEffect(() => {
    const fetchMetrics = () => {
      tauriBridge.getSystemMetrics().then(setMetrics).catch(console.error);
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 3000);
    return () => clearInterval(interval);
  }, []);

  const getLoadClass = (val: number) => {
    if (val >= 85) return "sysmon-val--high";
    if (val >= 65) return "sysmon-val--mid";
    return "sysmon-val--normal";
  };

  return (
    <div
      className="capsule capsule--compact sysmon-capsule icon-hover"
      title={`CPU: ${metrics.cpu_percent}% | RAM: ${metrics.ram_percent}% (${(
        metrics.used_ram_mb / 1024
      ).toFixed(1)}GB / ${(metrics.total_ram_mb / 1024).toFixed(0)}GB)`}
    >
      <div className="sysmon-metrics">
        {/* CPU Monitor */}
        <div className="sysmon-item">
          <span className="sysmon-label">CPU</span>
          <span className={`sysmon-value ${getLoadClass(metrics.cpu_percent)}`}>
            {metrics.cpu_percent}%
          </span>
        </div>

        <div className="sysmon-divider" />

        {/* RAM Monitor */}
        <div className="sysmon-item">
          <span className="sysmon-label">RAM</span>
          <span className={`sysmon-value ${getLoadClass(metrics.ram_percent)}`}>
            {metrics.ram_percent}%
          </span>
        </div>
      </div>
    </div>
  );
};
