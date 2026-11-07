"use client";

import { resizeGlobe } from "@/features/globe/store";
import { useShellStore } from "@/features/shell/store";

import { useShipStore } from "../store";

/** Floating feed status on the map while the ships layer is active. */
export function ShipLiveBadge() {
  const active = useShellStore((s) => s.mode === "ships");
  const count = useShipStore((s) => s.ships.length);
  const lastData = useShipStore((s) => s.lastData);
  const failed = useShipStore((s) => s.failed);
  const paused = useShipStore((s) => s.paused);

  const prefix = !lastData ? "○ CONNECTING · " : paused ? "Ⅱ PAUSED · " : failed ? "● DELAYED · " : "● LIVE AIS · ";

  return (
    <button
      className="flight-livebadge"
      hidden={!active}
      title="Open ship explorer"
      onClick={() => {
        useShellStore.getState().showDirectory();
        resizeGlobe();
      }}
    >
      {prefix}
      {count.toLocaleString()} vessels
    </button>
  );
}
