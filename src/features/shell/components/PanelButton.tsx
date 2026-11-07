"use client";

import { useShellStore, type AppMode } from "../store";

const LABELS: Record<AppMode, string> = {
  cameras: "Camera list",
  satellites: "Satellite list",
  flights: "Flight list",
  ships: "Ship list",
  earth: "Earth layers",
  movement: "Movement layers",
};

/** Opens the side panel for the current layer. Hidden while the panel is open (it has its own close button). */
export function PanelButton() {
  const mode = useShellStore((s) => s.mode);
  const open = useShellStore((s) => s.directoryOpen);
  const showDirectory = useShellStore((s) => s.showDirectory);
  return (
    <button
      className="panel-button"
      hidden={open}
      aria-expanded={open}
      aria-controls="explorer-panel"
      onClick={() => showDirectory(true)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6h16M4 12h16M4 18h10" />
      </svg>
      {LABELS[mode]}
    </button>
  );
}
