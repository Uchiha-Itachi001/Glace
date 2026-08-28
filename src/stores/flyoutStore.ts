import { useState, useEffect, useCallback } from "react";
import { windowExpansion } from "../services/windowExpansion";

export type FlyoutType = "settings" | "quick-settings" | "calendar" | "overflow" | null;

let activeFlyoutState: FlyoutType = null;
const flyoutListeners = new Set<(flyout: FlyoutType) => void>();

function setFlyout(next: FlyoutType, heightPx = 520) {
  activeFlyoutState = next;
  flyoutListeners.forEach((fn) => fn(next));

  if (next !== null) {
    windowExpansion.request("flyout", heightPx);
  } else {
    windowExpansion.release("flyout");
  }
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
