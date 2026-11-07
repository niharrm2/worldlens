import type { ShipCategory } from "@/types/ships";

export const SHIP_COLORS: Record<ShipCategory, string> = {
  cargo: "#7fd36b",
  tanker: "#ff8f6b",
  passenger: "#6bb8ff",
  highspeed: "#ffd36b",
  fishing: "#c99bff",
  service: "#5fe0d0",
  pleasure: "#ff9fd2",
  other: "#c3ced8",
  unknown: "#8796a5",
};

export const SHIP_LABELS: Record<ShipCategory, string> = {
  cargo: "Cargo",
  tanker: "Tanker",
  passenger: "Passenger",
  highspeed: "High-speed craft",
  fishing: "Fishing",
  service: "Tug / pilot / service",
  pleasure: "Sailing / pleasure",
  other: "Other",
  unknown: "Type not reported",
};

export const SHIP_CATEGORIES = Object.keys(SHIP_COLORS) as ShipCategory[];

/** Hull outline pointing north on a 32×32 grid. */
const HULL = "M16 3 22 11V27Q22 29 20 29H12Q10 29 10 27V11Z";

/** Inner SVG markup (no wrapper) for a vessel glyph. */
function glyph(category: ShipCategory, moving: boolean, selected: boolean): string {
  const color = selected ? "#fff2b5" : SHIP_COLORS[category];
  const stroke = selected ? "#ffb000" : "#06121d";
  const ring = selected
    ? '<circle cx="16" cy="16" r="15" fill="#ffd36b" fill-opacity=".12" stroke="#ffd36b" stroke-width="1.2"/>'
    : "";
  return moving
    ? `${ring}<path d="${HULL}" fill="${color}" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round"/><path d="M16 12v11" stroke="${stroke}" stroke-opacity=".55" stroke-width="1.2"/>`
    : `${ring}<circle cx="16" cy="16" r="6" fill="${color}" stroke="${stroke}" stroke-width="1.6"/>`;
}

export function shipSvg(category: ShipCategory, moving: boolean, selected = false): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">${glyph(category, moving, selected)}</svg>`;
}

const cache = new Map<string, string>();

/** Data URI for globe markers; moving vessels are drawn as a hull to be rotated by course. */
export function shipMarker(category: ShipCategory, moving: boolean, selected: boolean): string {
  const key = `${category}:${moving}:${selected}`;
  let uri = cache.get(key);
  if (!uri) {
    uri = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(shipSvg(category, moving, selected));
    cache.set(key, uri);
  }
  return uri;
}
