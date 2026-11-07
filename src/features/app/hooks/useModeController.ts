"use client";

import { useEffect, useRef } from "react";

import { useCameraStore } from "@/features/cameras/store";
import { useFlightStore } from "@/features/flights/store";
import { useGlobeStore } from "@/features/globe/store";
import { ORBIT_VIEW, WORLD_VIEW } from "@/features/globe/types";
import { useSatelliteStore } from "@/features/satellites/store";
import { useShellStore, type AppMode } from "@/features/shell/store";
import { SHIPS_VIEW, useShipStore } from "@/features/ships/store";
import { useEarthStore } from "@/features/earth/store";
import { getSearchParam, updateSearchParams } from "@/lib/browser";

/** Initial layer from `?layer=`; the flight layer is the default view. */
function initialMode(): AppMode {
  const layer = getSearchParam("layer");
  if (layer === "satellites") return "satellites";
  if (layer === "ships") return "ships";
  if (layer === "earth") return "earth";
  if (layer === "movement") return "movement";
  if (!layer || layer === "flights") return "flights";
  return "cameras";
}

/** Applies the side effects of switching between the camera, satellite and flight layers. */
export function useModeController() {
  const mode = useShellStore((s) => s.mode);
  const engine = useGlobeStore((s) => s.engine);
  const previousMode = useRef<AppMode | null>(null);
  const flownMode = useRef<AppMode>("cameras");

  useEffect(() => {
    useEarthStore.getState().initFromUrl();
    useShellStore.getState().setMode(initialMode());
  }, []);

  // Layer state, media, data loading and the URL.
  useEffect(() => {
    const from = previousMode.current;
    previousMode.current = mode;
    // First render precedes reading ?layer=; leave the URL untouched until then.
    if (from === null || from === mode) return;

    if (mode !== "cameras") useCameraStore.getState().stopMedia();
    if (from === "flights") useFlightStore.getState().cancel();
    if (from === "ships") useShipStore.getState().cancel();

    if (mode === "satellites") {
      useSatelliteStore.getState().activate();
      updateSearchParams({ layer: "satellites" });
    } else if (mode === "flights") {
      void useFlightStore.getState().refresh();
      updateSearchParams({ layer: "flights", satellite: null });
    } else if (mode === "ships") {
      void useShipStore.getState().refresh();
      updateSearchParams({ layer: "ships", satellite: null });
    } else if (mode === "earth" || mode === "movement") {
      const earth = useEarthStore.getState();
      updateSearchParams({ layer: mode, satellite: null, ...earth.urlParams() });
      earth.refreshDue();
    } else {
      updateSearchParams({ layer: null, satellite: null, earth: null, move: null });
    }
  }, [mode]);

  // Camera framing, once the engine exists.
  useEffect(() => {
    if (!engine || flownMode.current === mode) return;
    flownMode.current = mode;
    if (mode === "satellites") engine.flyTo(ORBIT_VIEW.center, ORBIT_VIEW.zoom, { duration: 1.3 });
    else if (mode === "ships") engine.flyTo(SHIPS_VIEW.center, SHIPS_VIEW.zoom, { duration: 1.3 });
    else engine.flyTo(WORLD_VIEW.center, WORLD_VIEW.zoom);
  }, [engine, mode]);
}
