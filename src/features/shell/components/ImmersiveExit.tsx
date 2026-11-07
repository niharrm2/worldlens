"use client";

import { useShellStore } from "../store";

/** The only control shown in in-app full screen. */
export function ImmersiveExit() {
  const immersive = useShellStore((s) => s.immersive);
  if (!immersive) return null;
  return (
    <button className="immersive-exit" onClick={() => useShellStore.getState().setImmersive(false)}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 3v5H3m13-5v5h5M3 16h5v5m13-5h-5v5" />
      </svg>
      Exit full screen
    </button>
  );
}
