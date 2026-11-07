"use client";

import { useEffect, useRef } from "react";

import { useShellStore } from "@/features/shell/store";

import { createGlobe } from "../engine/create-globe";
import { useGlobeStore } from "../store";
import type { GlobeEvents } from "../types";

type SelectHandlers = Pick<GlobeEvents, "onCameraSelect" | "onSatelliteSelect" | "onFlightSelect" | "onShipSelect" | "onOverlaySelect" | "onGlobeClick">;

/** Mounts the globe engine into #map and publishes it to the globe store. */
export function GlobeCanvas(handlers: SelectHandlers) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let engine: Awaited<ReturnType<typeof createGlobe>> | null = null;

    const events: GlobeEvents = {
      onCameraSelect: (id) => handlersRef.current.onCameraSelect(id),
      onSatelliteSelect: (id) => handlersRef.current.onSatelliteSelect(id),
      onFlightSelect: (id) => handlersRef.current.onFlightSelect(id),
      onShipSelect: (id) => handlersRef.current.onShipSelect(id),
      onOverlaySelect: (overlay, item) => handlersRef.current.onOverlaySelect(overlay, item),
      onGlobeClick: (lat, lng) => handlersRef.current.onGlobeClick(lat, lng),
      onMoveEnd: () => useGlobeStore.setState((s) => ({ moveVersion: s.moveVersion + 1 })),
      onViewCount: (viewCount) => useGlobeStore.setState({ viewCount }),
      onHover: (hover) => useGlobeStore.setState({ hover }),
      onError: (error) => useGlobeStore.setState({ error }),
    };

    useShellStore.getState().startLoading("globe", "the 3D globe");
    createGlobe(container, events).then((created) => {
      useShellStore.getState().finishLoading("globe");
      if (disposed) {
        created.destroy();
        return;
      }
      engine = created;
      // Development aid: inspect the live engine from the browser console.
      if (process.env.NODE_ENV !== "production") (window as unknown as { __worldlensGlobe?: unknown }).__worldlensGlobe = created;
      created.setNight(useGlobeStore.getState().night);
      useGlobeStore.setState({ engine: created });
    });

    return () => {
      disposed = true;
      useShellStore.getState().finishLoading("globe");
      engine?.destroy();
      useGlobeStore.setState({ engine: null });
    };
  }, []);

  return <div id="map" ref={containerRef} />;
}
