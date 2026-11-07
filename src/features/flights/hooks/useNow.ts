"use client";

import { useSyncExternalStore } from "react";

/**
 * Current time, re-rendering every `intervalMs` while `enabled`.
 * Returns 0 during prerender/hydration so no wall-clock value is baked into the static HTML.
 */
export function useNow(intervalMs = 1000, enabled = true): number {
  return useSyncExternalStore(
    (onChange) => {
      if (!enabled) return () => {};
      const timer = setInterval(onChange, intervalMs);
      return () => clearInterval(timer);
    },
    () => (enabled ? Math.floor(Date.now() / intervalMs) * intervalMs : 0),
    () => 0,
  );
}
