import type { Aircraft } from "@/types/flights";
import { POSITION_RETENTION } from "./config";

type Raw = Record<string, unknown>;

const number = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const HEADING_FIELDS: ReadonlyArray<[string, string]> = [
  ["track", "Ground track"],
  ["true_heading", "True heading"],
  ["mag_heading", "Magnetic heading"],
];

/**
 * Convert an adsb.lol `/v2/point` response into normalised aircraft rows.
 * @param received Local receive time, epoch seconds.
 */
export function normalize(data: unknown, received: number): Aircraft[] {
  const raw = (data as Raw | null)?.ac;
  if (!Array.isArray(raw)) throw new Error("Provider response has no aircraft array");

  let stamp = number((data as Raw).now);
  stamp = stamp === null ? received : stamp > 1e11 ? stamp / 1000 : stamp;
  stamp = Math.min(stamp, received);

  const result: Aircraft[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const a = entry as Raw;
    const lat = number(a.lat), lon = number(a.lon), age = number(a.seen_pos);
    const ident = a.hex;
    if (typeof ident !== "string" || !ident || lat === null || lon === null || age === null) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180 || age < 0) continue;

    const position = stamp - age;
    if (received - position > POSITION_RETENTION) continue;

    const ground = a.alt_baro === "ground";
    let altitude = number(a.alt_baro);
    if (altitude === null && !ground) altitude = number(a.alt_geom);

    let heading: number | null = null;
    let headingSource = "Heading unavailable";
    for (const [field, label] of HEADING_FIELDS) {
      const value = number(a[field]);
      if (value !== null) {
        heading = ((value % 360) + 360) % 360;
        headingSource = label;
        break;
      }
    }

    result.push({
      id: ident.toLowerCase(),
      lat,
      lng: lon,
      callsign: String(a.flight || "").trim(),
      registration: String(a.r || ""),
      type: String(a.t || ""),
      ground,
      altitude: ground ? 0 : altitude,
      heading,
      headingSource,
      speed: number(a.gs),
      positionTime: Math.round(position * 1000),
    });
  }
  return result;
}
