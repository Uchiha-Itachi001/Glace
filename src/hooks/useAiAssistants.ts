import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { AiProviderStatus } from "../types";
import { tauriBridge } from "../services/tauriBridge";

export function useAiAssistants(pollActive: boolean = false) {
  const [assistants, setAssistants] = useState<AiProviderStatus[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  const fetchStatus = useCallback(async (isManualRefresh: boolean = false) => {
    if (isManualRefresh) {
      setIsLoading(true);
    }
    try {
      const data = isManualRefresh
        ? await tauriBridge.refreshAiAssistants()
        : await tauriBridge.getAiAssistantsStatus();
      if (isMountedRef.current && Array.isArray(data)) {
        setAssistants(data);
      }
    } catch (err) {
      console.error("[useAiAssistants] Error fetching AI status:", err);
    } finally {
      if (isMountedRef.current && isManualRefresh) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    fetchStatus();

    // Poll every 2s if pollActive (notch expanded), every 4s if idle
    const intervalMs = pollActive ? 2000 : 4000;
    const timer = setInterval(() => {
      fetchStatus(false);
    }, intervalMs);

    return () => {
      isMountedRef.current = false;
      clearInterval(timer);
    };
  }, [pollActive, fetchStatus]);

  const activeAssistants = useMemo(
    () => assistants.filter((a) => a.is_running || a.session_status === "active"),
    [assistants]
  );
  const hasActiveSession = activeAssistants.length > 0;

  const launchAssistant = useCallback(async (id: string) => {
    try {
      await tauriBridge.launchAiAssistant(id);
      setTimeout(() => fetchStatus(true), 600);
    } catch (err) {
      console.error("[useAiAssistants] Error launching assistant:", err);
    }
  }, [fetchStatus]);

  return {
    assistants,
    activeAssistants,
    hasActiveSession,
    isLoading,
    refresh: () => fetchStatus(true),
    launchAssistant,
  };
}
