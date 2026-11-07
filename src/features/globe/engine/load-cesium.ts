/**
 * Cesium is served as a prebuilt UMD bundle from /public/vendor/cesium (with its static
 * Assets and Widgets) and typed via the `cesium` package's declarations.
 */
import { loadScript } from "@/lib/browser";

export type CesiumModule = typeof import("cesium");

declare global {
  interface Window {
    Cesium?: CesiumModule;
    CESIUM_BASE_URL?: string;
  }
}

export const CESIUM_BASE_URL = "/vendor/cesium/";

export async function loadCesium(): Promise<CesiumModule> {
  window.CESIUM_BASE_URL = CESIUM_BASE_URL;
  await loadScript(`${CESIUM_BASE_URL}Cesium.js`);
  if (!window.Cesium) throw new Error("Cesium failed to initialise");
  return window.Cesium;
}
