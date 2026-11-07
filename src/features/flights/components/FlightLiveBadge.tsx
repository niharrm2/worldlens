"use client";

import { useMemo } from "react";

import { resizeGlobe } from "@/features/globe/store";
import { useShellStore } from "@/features/shell/store";

import { useNow } from "../hooks/useNow";
import { recentAircraft, useFlightStore } from "../store";

/** Floating scan status on the map while the flights layer is active. */
export function FlightLiveBadge() {
  const active = useShellStore((s) => s.mode === "flights");
  const aircraft = useFlightStore((s) => s.aircraft);
  const includeCached = useFlightStore((s) => s.includeCached);
  const lastData = useFlightStore((s) => s.lastData);
  const failed = useFlightStore((s) => s.failed);
  const paused = useFlightStore((s) => s.paused);
  const listNow = useFlightStore((s) => s.now);
  const now = useNow(1000, active);

  const count = useMemo(() => recentAircraft({ aircraft, includeCached, now: listNow }).length, [aircraft, includeCached, listNow]);
  const delayed = !!lastData && (lastData.stale || failed || now - lastData.observedAt > 60_000);
  const prefix = !lastData ? "○ CONNECTING · " : paused ? "Ⅱ PAUSED · " : delayed ? "● DELAYED · " : "● SCANNING · ";

  return (
    <button
      className="flight-livebadge"
      hidden={!active}
      title="Open flight explorer"
      onClick={() => {
        useShellStore.getState().showDirectory();
        resizeGlobe();
      }}
    >
      {prefix}
      {count.toLocaleString()} aircraft
    </button>
  );
}
