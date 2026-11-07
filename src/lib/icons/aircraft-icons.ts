/** Shared vector artwork: swept-wing twin-engine jet. */
export type AircraftIconState = "live" | "selected" | "stale";

const JET_PATH =
  "M24 2C22.7 2 22 4.5 22 7L21.6 17 7 27v3l14.2-4.7.2 10.7-5.9 4.5V43l8.5-2.6 8.5 2.6v-2.5L26.6 36l.2-10.7L41 30v-3L26.4 17 26 7c0-2.5-.7-5-2-5Z";

/** Full SVG markup. `gradientId` must be unique within the document. */
export function aircraftSvg(state: AircraftIconState = "live", gradientId = "jet"): string {
  const selected = state === "selected";
  const stale = state === "stale";
  const light = selected ? "#fff4c6" : stale ? "#a0b2c0" : "#f2f8fc";
  const dark = selected ? "#dcaa4c" : stale ? "#6b8091" : "#97b7cb";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="${gradientId}" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${light}"/><stop offset=".47" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs>${
    selected
      ? '<circle cx="24" cy="24" r="22" fill="#f5ce70" fill-opacity=".07" stroke="#f5ce70" stroke-opacity=".55" stroke-width="1"/>'
      : ""
  }<g stroke="#0b2335" stroke-width="1.05" stroke-linejoin="round"><path d="${JET_PATH}" fill="url(#${gradientId})"/><rect x="13.5" y="23" width="3.2" height="8" rx="1.6" fill="${dark}"/><rect x="31.3" y="23" width="3.2" height="8" rx="1.6" fill="${dark}"/></g><path d="M22.7 9.3q1.3-1.3 2.6 0l.3 2.5h-3.2Z" fill="#21465b"/><path d="m9 27 12-7m18 7-12-7M24 15v22" stroke="${dark}" stroke-width=".65" fill="none" opacity=".7"/><path d="M23.2 17v18" stroke="#fff" stroke-opacity=".6" stroke-width=".65"/></svg>`;
}

export function aircraftDataUri(state: AircraftIconState = "live"): string {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(aircraftSvg(state, "jet-marker"));
}
