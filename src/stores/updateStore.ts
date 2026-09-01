import { useState, useEffect, useCallback } from "react";
import { UpdateInfo } from "../types";
import { checkForUpdate, CURRENT_APP_VERSION, isRemoteNewer } from "../services/updateService";

interface UpdateState {
  updateInfo: UpdateInfo | null;
  isChecking: boolean;
  error: string | null;
}

let state: UpdateState = {
  updateInfo: null,
  isChecking: false,
  error: null,
};

const listeners = new Set<(s: UpdateState) => void>();

function notify() {
  listeners.forEach((fn) => fn(state));
}

async function runCheck(force = false) {
  if (state.isChecking) return;
  state = { ...state, isChecking: true, error: null };
  notify();

  try {
    const info = await checkForUpdate(force);
    state = { ...state, updateInfo: info, isChecking: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to check for updates";
    state = { ...state, isChecking: false, error: msg };
  }
  notify();
}

// Auto-check once on app startup immediately
if (!state.updateInfo && !state.isChecking) {
  runCheck(false);
}

export function useUpdate() {
  const [current, setCurrent] = useState<UpdateState>(state);

  useEffect(() => {
    const handler = (next: UpdateState) => setCurrent(next);
    listeners.add(handler);
    if (!state.updateInfo && !state.isChecking) {
      runCheck(false);
    }
    return () => {
      listeners.delete(handler);
    };
  }, []);

  const check = useCallback((force = true) => {
    return runCheck(force);
  }, []);

  return {
    updateInfo: current.updateInfo,
    isChecking: current.isChecking,
    error: current.error,
    currentVersion: CURRENT_APP_VERSION,
    hasUpdate: Boolean(current.updateInfo?.latestVersion && isRemoteNewer(CURRENT_APP_VERSION, current.updateInfo.latestVersion)),
    check,
  };
}
