"use client";

import { useDeferredValue, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import { useGlobeStore } from "@/features/globe/store";

import { filterCameras, useCameraStore } from "../store";

/** Filter inputs; the search text is deferred so typing stays responsive over ~200k rows. */
function useFilterInputs() {
  const inputs = useCameraStore(
    useShallow((s) => ({
      cameras: s.cameras,
      filter: s.filter,
      query: s.query,
      country: s.country,
      inView: s.inView,
      directOnly: s.directOnly,
      saved: s.saved,
    })),
  );
  const query = useDeferredValue(inputs.query);
  return useMemo(() => ({ ...inputs, query }), [inputs, query]);
}

/** Cameras drawn on the globe (ignores the "in this view" filter). */
export function useMapCameras() {
  const inputs = useFilterInputs();
  return useMemo(() => filterCameras(inputs), [inputs]);
}

/** Cameras listed in the directory, optionally restricted to the current viewport. */
export function useListCameras() {
  const inputs = useFilterInputs();
  const engine = useGlobeStore((s) => s.engine);
  const moveVersion = useGlobeStore((s) => (inputs.inView ? s.moveVersion : 0));
  return useMemo(
    () => filterCameras(inputs, engine ? (lat, lng) => engine.isInView(lat, lng) : undefined),
    // moveVersion re-evaluates the viewport filter after the globe moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inputs, engine, moveVersion],
  );
}

/** Sorted country names and the count of specified countries. */
export function useCountries() {
  const cameras = useCameraStore((s) => s.cameras);
  return useMemo(() => {
    const all = [...new Set(cameras.map((c) => c.country))].sort();
    return { all, specified: all.filter((c) => c !== "Unspecified").length };
  }, [cameras]);
}
