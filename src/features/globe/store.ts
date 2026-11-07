import { create } from "zustand";

import type { GlobeEngine, GlobeHover } from "./types";

interface GlobeState {
  engine: GlobeEngine | null;
  /** Cameras visible in the current viewport. */
  viewCount: number | null;
  hover: GlobeHover | null;
  error: string | null;
  night: boolean;
  /** Increments after every camera move; lets viewport-dependent views recompute. */
  moveVersion: number;
}

export const useGlobeStore = create<GlobeState>(() => ({
  engine: null,
  viewCount: null,
  hover: null,
  error: null,
  night: false,
  moveVersion: 0,
}));

/** Current engine (or null while it loads) for imperative calls outside React render. */
export const getGlobe = () => useGlobeStore.getState().engine;

/** Resize after panel layout changes, on the next frame. */
export function resizeGlobe() {
  requestAnimationFrame(() => getGlobe()?.resize());
}
