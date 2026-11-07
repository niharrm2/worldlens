/** AIS (ITU-R M.1371) helpers shared by the server feeds and the browser. */
import type { ShipCategory } from "@/types/ships";

export const NAV_STATUS = [
  "Under way using engine", "At anchor", "Not under command", "Restricted manoeuvrability",
  "Constrained by draught", "Moored", "Aground", "Engaged in fishing", "Under way sailing",
  "Reserved (HSC)", "Reserved (WIG)", "Power-driven vessel towing astern",
  "Power-driven vessel pushing ahead", "Reserved", "AIS-SART active", "Not defined",
];

export const navStatusText = (code: number | null | undefined) => NAV_STATUS[code ?? 15] ?? "Not defined";

/** Ship type code → display category. */
export function shipCategory(type: number | null | undefined): ShipCategory {
  if (!type) return "unknown";
  if (type >= 70 && type <= 79) return "cargo";
  if (type >= 80 && type <= 89) return "tanker";
  if (type >= 60 && type <= 69) return "passenger";
  if (type >= 40 && type <= 49) return "highspeed";
  if (type === 30) return "fishing";
  if ([31, 32, 33, 34, 35, 50, 51, 52, 53, 54, 55, 58].includes(type)) return "service";
  if (type === 36 || type === 37) return "pleasure";
  return "other";
}

export const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** AIS "not available" sentinels → null. */
export const aisSpeed = (v: unknown) => {
  const n = finite(v);
  return n === null || n >= 102.3 ? null : n;
};
export const aisCourse = (v: unknown) => {
  const n = finite(v);
  return n === null || n >= 360 ? null : n;
};
export const aisHeading = (v: unknown) => {
  const n = finite(v);
  return n === null || n >= 360 ? null : n;
};

/** Valid position (AIS uses lat 91 / lon 181 for "not available"). */
export const validPosition = (lat: unknown, lng: unknown): lat is number =>
  typeof lat === "number" &&
  typeof lng === "number" &&
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180 &&
  !(lat === 0 && lng === 0);

/** Trim AIS text fields (which pad with spaces or "@"). */
export const aisText = (v: unknown) =>
  String(v ?? "")
    .replace(/@+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
