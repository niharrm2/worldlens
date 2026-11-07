"use client";

import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import { useMapCameras } from "@/features/cameras/hooks/useCameraViews";
import { useCameraStore } from "@/features/cameras/store";
import { matchingAircraft, useFlightStore } from "@/features/flights/store";
import { useGlobeStore } from "@/features/globe/store";
import { useSatelliteStore } from "@/features/satellites/store";
import { useShellStore } from "@/features/shell/store";
import { matchingShips, useShipStore } from "@/features/ships/store";
import { useEarthOverlays } from "@/features/earth/hooks/useEarthOverlays";

const NO_SATELLITES = { points: [], selectedId: null, selectedPosition: null, path: [] };

/** Declaratively pushes each feature's data to the globe engine. */
export function useGlobeLayers() {
  const engine = useGlobeStore((s) => s.engine);
  const mode = useShellStore((s) => s.mode);
  // "Globe only" hides every data layer; nothing is pushed to the engine while it is on.
  const globeOnly = useShellStore((s) => s.globeOnly);
  const layerMode = globeOnly ? null : mode;

  // Cameras
  const mapCameras = useMapCameras();
  const selectedCamera = useCameraStore((s) => s.selectedId);
  const showSatelliteCameras = useSatelliteStore((s) => s.showCameras);
  const camerasVisible = layerMode === "cameras" || (layerMode === "satellites" && showSatelliteCameras);

  useEffect(() => {
    engine?.setCameraRows(mapCameras, selectedCamera);
  }, [engine, mapCameras, selectedCamera]);

  useEffect(() => {
    engine?.setCameraVisibility(camerasVisible);
  }, [engine, camerasVisible]);

  // Satellites
  const satellites = useSatelliteStore(
    useShallow((s) => ({
      points: s.points,
      selectedId: s.selectedId,
      selectedPosition: s.detail?.point ?? null,
      path: s.showPath ? s.path : NO_SATELLITES.path,
    })),
  );
  useEffect(() => {
    engine?.setSatellites(layerMode === "satellites" ? satellites : NO_SATELLITES);
  }, [engine, layerMode, satellites]);

  // Flights
  const flightInputs = useFlightStore(
    useShallow((s) => ({
      aircraft: s.aircraft,
      includeCached: s.includeCached,
      includeGround: s.includeGround,
      query: s.query,
      now: s.now,
    })),
  );
  const selectedFlight = useFlightStore((s) => s.selectedId);
  const flights = useMemo(() => matchingAircraft(flightInputs), [flightInputs]);
  useEffect(() => {
    if (layerMode === "flights") engine?.setFlights(flights, selectedFlight);
    else engine?.setFlights([], null);
  }, [engine, layerMode, flights, selectedFlight]);

  // Ships
  const shipInputs = useShipStore(
    useShallow((s) => ({ ships: s.ships, query: s.query, category: s.category, movingOnly: s.movingOnly })),
  );
  const selectedShip = useShipStore((s) => s.selectedId);
  const ships = useMemo(() => matchingShips(shipInputs), [shipInputs]);
  useEffect(() => {
    if (layerMode === "ships") engine?.setShips(ships, selectedShip);
    else engine?.setShips([], null);
  }, [engine, layerMode, ships, selectedShip]);

  // Earth data
  useEarthOverlays(engine, layerMode === "earth" ? "planet" : layerMode === "movement" ? "movement" : null);
}
