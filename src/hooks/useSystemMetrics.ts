import { useState, useEffect } from "react";
import { SystemMetrics } from "../types";
import { tauriBridge } from "../services/tauriBridge";

const DEFAULT_METRICS: SystemMetrics = {
  ram_percent: 42,
  total_ram_mb: 16384,
  used_ram_mb: 6880,
  cpu_percent: 15,
  battery_percent: 100,
  is_charging: true,
  has_battery: true,
  net_recv_speed_bps: 0,
  net_sent_speed_bps: 0,
  net_recv_formatted: "0 B/s",
  net_sent_formatted: "0 B/s",
};

let currentMetrics: SystemMetrics = DEFAULT_METRICS;
const listeners = new Set<(metrics: SystemMetrics) => void>();
let pollTimer: number | null = null;

function fetchAndUpdate() {
  if (listeners.size === 0) {
    stopPolling();
    return;
  }

  tauriBridge
    .getSystemMetrics()
    .then((metrics) => {
      currentMetrics = metrics;
      listeners.forEach((fn) => fn(metrics));
    })
    .catch(console.error);
}

function startPolling() {
  if (pollTimer !== null || listeners.size === 0) return;
  fetchAndUpdate();
  // Single coordinated 2-second poll across entire application
  pollTimer = window.setInterval(fetchAndUpdate, 2000);
}

function stopPolling() {
  if (pollTimer !== null && listeners.size === 0) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function useSystemMetrics(enabled: boolean = true): SystemMetrics {
  const [metrics, setMetrics] = useState<SystemMetrics>(currentMetrics);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    listeners.add(setMetrics);
    startPolling();

    return () => {
      listeners.delete(setMetrics);
      stopPolling();
    };
  }, [enabled]);

  return metrics;
}
