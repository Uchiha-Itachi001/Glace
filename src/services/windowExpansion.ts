import { tauriBridge } from "./tauriBridge";

export type ExpansionSource =
  | "flyout"
  | "island"
  | "apps-hover"
  | "apps-context"
  | "apps-overflow";

const activeExpansions = new Map<ExpansionSource, number>();

export const windowExpansion = {
  request(source: ExpansionSource, heightPx = 520) {
    activeExpansions.set(source, heightPx);
    this.sync();
  },

  release(source: ExpansionSource) {
    activeExpansions.delete(source);
    this.sync();
  },

  isExpanded(): boolean {
    return activeExpansions.size > 0;
  },

  hasSource(source: ExpansionSource): boolean {
    return activeExpansions.has(source);
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
