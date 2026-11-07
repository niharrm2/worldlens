"use client";

import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";

import type { OverlaySpec } from "@/features/globe/overlays";
import type { GlobeEngine } from "@/features/globe/types";
import type { EarthDataMap, EarthLayerId } from "@/types/earth";

import { EARTH_LAYERS } from "../lib/layers";
import { ALL_OVERLAY_KEYS, buildOverlays, type OverlayInputs } from "../lib/overlays";
import { groupOf, RAIN_FRAMES, useEarthStore, type LayerGroup } from "../store";

/** Inputs each layer depends on; a layer is rebuilt only when one of these changes. */
function layerDeps(layer: EarthLayerId, input: OverlayInputs): unknown[] {
  const selectedHere = input.selected?.layer === layer ? input.selected.id : null;
  switch (layer) {
    case "weather":
      return [input.data.weather, input.weatherVariable];
    case "airquality":
      return [input.data.airquality, input.airVariable];
    case "clouds":
      return [input.data.imagery, input.cloudsDaysAgo];
    case "rainfall":
      return [input.data.imagery, input.rainFrame];
    case "daynight":
      return [input.sunTime];
    case "solar":
      return [input.data.aurora, input.enabled.includes("aurora")];
    case "oceanheat":
      return [input.data.oceanheat, input.oceanVariable, input.oceanDaysAgo];
    case "seaice":
      return [input.data.seaice, input.seaIceDaysAgo];
    case "balloons":
      return [input.data.balloons, selectedHere, selectedHere ? input.tracks[selectedHere] : null];
    default:
      return [input.data[layer as keyof EarthDataMap], selectedHere];
  }
}

const sameDeps = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x, i) => Object.is(x, b[i]));

/** Pushes the enabled layers of the active group (Earth or Movement option) to the globe; clears the rest. */
export function useEarthOverlays(engine: GlobeEngine | null, group: LayerGroup | null) {
  const active = group !== null;
  const s = useEarthStore(
    useShallow((x) => ({
      enabled: x.enabled,
      data: x.data,
      weatherVariable: x.weatherVariable,
      airVariable: x.airVariable,
      cloudsDaysAgo: x.cloudsDaysAgo,
      rainFrame: x.rainFrame,
      selected: x.selected,
      tracks: x.tracks,
      oceanVariable: x.oceanVariable,
      oceanDaysAgo: x.oceanDaysAgo,
      seaIceDaysAgo: x.seaIceDaysAgo,
      sunTime: x.sunTime,
    })),
  );
  const built = useRef(new Map<EarthLayerId, { deps: unknown[]; specs: Record<string, OverlaySpec | null> }>());
  const applied = useRef(new Map<string, OverlaySpec | null>());
  const appliedTo = useRef<GlobeEngine | null>(null);

  useEffect(() => {
    if (!engine) return;
    // A new engine starts empty.
    if (appliedTo.current !== engine) {
      applied.current.clear();
      appliedTo.current = engine;
    }
    const data = Object.fromEntries(Object.entries(s.data).map(([k, v]) => [k, v?.items])) as Partial<EarthDataMap>;
    const input: OverlayInputs = { ...s, data };
    const next: Record<string, OverlaySpec | null> = Object.fromEntries(ALL_OVERLAY_KEYS.map((k) => [k, null]));

    if (active) {
      for (const def of EARTH_LAYERS) {
        if (!s.enabled.includes(def.id) || groupOf(def.id) !== group) continue;
        const deps = layerDeps(def.id, input);
        let entry = built.current.get(def.id);
        if (!entry || !sameDeps(entry.deps, deps)) {
          entry = { deps, specs: buildOverlays(def.id, input) };
          built.current.set(def.id, entry);
        }
        Object.assign(next, entry.specs);
      }
    }

    for (const [key, spec] of Object.entries(next)) {
      if (applied.current.get(key) === spec) continue;
      applied.current.set(key, spec);
      engine.setOverlay(key, spec);
    }
  }, [engine, s, active, group]);

  // Day/night clock: tick every minute while the layer is shown.
  const sunOn = group === "planet" && s.enabled.includes("daynight");
  useEffect(() => {
    if (!sunOn) return;
    useEarthStore.getState().tickSun();
    const timer = setInterval(() => useEarthStore.getState().tickSun(), 60_000);
    return () => clearInterval(timer);
  }, [sunOn]);

  // Rain animation.
  const rainOn = group === "planet" && s.enabled.includes("rainfall");
  const playing = useEarthStore((x) => x.rainPlaying);
  useEffect(() => {
    if (!rainOn || !playing) return;
    const timer = setInterval(() => {
      const { rainFrame } = useEarthStore.getState();
      useEarthStore.setState({ rainFrame: (rainFrame + 1) % RAIN_FRAMES });
    }, 900);
    return () => clearInterval(timer);
  }, [rainOn, playing]);

  // Periodic refresh of enabled datasets (the server caches upstream calls).
  useEffect(() => {
    if (!active) return;
    useEarthStore.getState().refreshDue();
    const timer = setInterval(() => useEarthStore.getState().refreshDue(), 30_000);
    return () => clearInterval(timer);
  }, [active, group, s.enabled]);
}
