import { useState, useEffect, useCallback } from "react";
import { tauriBridge } from "../services/tauriBridge";

export type FlyoutType = "start" | "settings" | "quick-settings" | "calendar" | "overflow" | null;

let activeFlyoutState: FlyoutType = null;
const flyoutListeners = new Set<(flyout: FlyoutType) => void>();

function setFlyout(next: FlyoutType, heightPx = 520) {
  activeFlyoutState = next;
  const isExpanded = next !== null;

  flyoutListeners.forEach((fn) => fn(next));
  tauriBridge.setWindowHeight(isExpanded, heightPx).catch(console.error);
}

export function useFlyout() {
  const [activeFlyout, setActive] = useState<FlyoutType>(activeFlyoutState);

  useEffect(() => {
    const handler = (next: FlyoutType) => setActive(next);
    flyoutListeners.add(handler);
    return () => {
      flyoutListeners.delete(handler);
    };
  }, []);

  const openFlyout = useCallback((type: FlyoutType, heightPx = 520) => {
    setFlyout(type, heightPx);
  }, []);

  const closeFlyout = useCallback(() => {
    setFlyout(null);
  }, []);

  const toggleFlyout = useCallback((type: FlyoutType, heightPx = 520) => {
    if (activeFlyoutState === type) {
      setFlyout(null);
    } else {
      setFlyout(type, heightPx);
    }
  }, []);

  return {
    activeFlyout,
    openFlyout,
    closeFlyout,
    toggleFlyout,
  };
}
