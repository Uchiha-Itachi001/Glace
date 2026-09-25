import { useState, useEffect } from "react";

export type NetworkState = "connected" | "connecting" | "disconnected";

export function useNetworkStatus(): {
  networkState: NetworkState;
  isOnline: boolean;
  setNetworkState: (state: NetworkState) => void;
  checkConnection: () => Promise<void>;
} {
  const [networkState, setNetworkState] = useState<NetworkState>(() => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return "disconnected";
    }
    return "connected";
  });

  const checkConnection = async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setNetworkState("disconnected");
      return;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      // Lightweight probe against public captive portal endpoint
      await fetch("https://www.msftconnecttest.com/connecttest.txt", {
        method: "HEAD",
        mode: "no-cors",
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timeoutId);
      setNetworkState("connected");
    } catch {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setNetworkState("disconnected");
      } else {
        // Still connected to local network
        setNetworkState("connected");
      }
    }
  };

  useEffect(() => {
    const handleOnline = () => {
      setNetworkState("connecting");
      const timer = setTimeout(() => {
        setNetworkState("connected");
      }, 1000);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setNetworkState("disconnected");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Run initial probe
    checkConnection();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return {
    networkState,
    isOnline: networkState === "connected",
    setNetworkState,
    checkConnection,
  };
}
