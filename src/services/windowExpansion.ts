import { tauriBridge } from "./tauriBridge";

export type ExpansionSource =
  | "flyout"
  | "island"
  | "media-capsule"
  | "apps-hover"
  | "apps-context"
  | "apps-overflow";

const activeExpansions = new Map<ExpansionSource, number>();
const listeners = new Set<(isExpanded: boolean) => void>();

function notify() {
  const expanded = activeExpansions.size > 0;
  listeners.forEach((fn) => fn(expanded));
}

export const windowExpansion = {
  request(source: ExpansionSource, heightPx = 520) {
    activeExpansions.set(source, heightPx);
    this.sync();
    notify();
  },

  release(source: ExpansionSource) {
    activeExpansions.delete(source);
    this.sync();
    notify();
  },

  releaseAll() {
    activeExpansions.clear();
    this.sync();
    notify();
  },

  isExpanded(): boolean {
    return activeExpansions.size > 0;
  },

  hasSource(source: ExpansionSource): boolean {
    return activeExpansions.has(source);
  },

  subscribe(fn: (isExpanded: boolean) => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },

  sync() {
    if (activeExpansions.size === 0) {
      tauriBridge.setWindowHeight(false).catch(console.error);
    } else {
      let maxHeight = 220;
      for (const h of activeExpansions.values()) {
        if (h > maxHeight) maxHeight = h;
      }
      tauriBridge.setWindowHeight(true, maxHeight).catch(console.error);
    }
  },
};

// Global safety listeners to prevent hover/window expansion leaks
if (typeof window !== "undefined") {
  window.addEventListener("blur", () => {
    if (activeExpansions.has("apps-hover")) {
      windowExpansion.release("apps-hover");
    }
  });

  document.addEventListener("mouseleave", () => {
    if (activeExpansions.has("apps-hover")) {
      windowExpansion.release("apps-hover");
    }
  });
}

