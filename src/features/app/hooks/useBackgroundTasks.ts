"use client";

import { useEffect } from "react";

import { useCameraStore } from "@/features/cameras/store";
import { useFlightStore } from "@/features/flights/store";
import { useSatelliteStore } from "@/features/satellites/store";
import { useShellStore } from "@/features/shell/store";
import { useShipStore } from "@/features/ships/store";
import { useEarthStore } from "@/features/earth/store";

/** Catalogue bootstrap plus the polling timers of the satellite and flight layers. */
export function useBackgroundTasks() {
  useEffect(() => {
    void useCameraStore.getState().init();
  }, []);

  // Satellites: whole catalogue every 10 s, selected satellite every 1 s, its path every minute.
  useEffect(() => {
    const sat = () => useSatelliteStore.getState();
    const timers = [
      setInterval(() => sat().refreshSelected("select"), 60_000),
      setInterval(() => {
        if (!sat().paused) sat().tick();
      }, 10_000),
      setInterval(() => sat().refreshSelected("detail"), 1000),
    ];
    return () => timers.forEach(clearInterval);
  }, []);

  // Flights: age-dependent views refresh every 15 s.
  useEffect(() => {
    const timer = setInterval(() => {
      if (useShellStore.getState().mode === "flights") useFlightStore.getState().touch();
    }, 15_000);
    return () => clearInterval(timer);
  }, []);

  // Pause polling while the tab is hidden.
  useEffect(() => {
    const onVisibility = () => {
      const flights = useFlightStore.getState();
      const ships = useShipStore.getState();
      if (document.hidden) {
        flights.cancel();
        ships.cancel();
        return;
      }
      if (useShellStore.getState().mode === "ships" && !ships.paused) void ships.refresh();
      useEarthStore.getState().refreshDue();
      useSatelliteStore.getState().tick();
      if (useShellStore.getState().mode === "flights" && !flights.paused) void flights.refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
}
