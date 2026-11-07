import type { GlobeEngine, GlobeEvents } from "../types";
import { CanvasGlobe } from "./canvas-globe";
import { CesiumGlobe } from "./cesium-globe";
import { loadCesium } from "./load-cesium";

/** Create the Cesium globe, falling back to the canvas renderer when WebGL/Cesium is unavailable. */
export async function createGlobe(container: HTMLElement, events: GlobeEvents): Promise<GlobeEngine> {
  try {
    const Cesium = await loadCesium();
    return new CesiumGlobe(Cesium, container, events);
  } catch (error) {
    console.warn("[WorldLens] Falling back to the compatibility globe:", error);
    return new CanvasGlobe(container, events);
  }
}
