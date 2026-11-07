import "server-only";

import { getJson } from "./cache";

/**
 * Open-Meteo accepts many coordinates per request; each location counts toward the free
 * tier's daily call budget, so callers sample a coarse global grid and cache for hours.
 */
const CHUNK = 150;

export interface GridPoint {
  lat: number;
  lng: number;
}

/** Cell centres every `step` degrees, avoiding the poles. */
export function globalGrid(step: number): GridPoint[] {
  const points: GridPoint[] = [];
  for (let lat = -90 + step / 2; lat < 90; lat += step) {
    if (Math.abs(lat) > 82) continue;
    for (let lng = -180 + step / 2; lng < 180; lng += step) points.push({ lat, lng });
  }
  return points;
}

interface CurrentBlock {
  current?: Record<string, number | string | null>;
}

/** Fetch `current` values for every grid point; returns rows aligned with `points`. */
export async function fetchCurrent(
  baseUrl: string,
  points: GridPoint[],
  variables: string[],
): Promise<{ values: (Record<string, number | null> | null)[]; time: number }> {
  const values: (Record<string, number | null> | null)[] = [];
  let time = 0;
  for (let i = 0; i < points.length; i += CHUNK) {
    const chunk = points.slice(i, i + CHUNK);
    const url =
      `${baseUrl}?latitude=${chunk.map((p) => p.lat.toFixed(2)).join(",")}` +
      `&longitude=${chunk.map((p) => p.lng.toFixed(2)).join(",")}` +
      `&current=${variables.join(",")}&timezone=GMT`;
    const result = await getJson<CurrentBlock | CurrentBlock[]>(url, 40_000);
    const blocks = Array.isArray(result) ? result : [result];
    for (const block of blocks) {
      const current = block.current;
      if (!current) {
        values.push(null);
        continue;
      }
      if (typeof current.time === "string") time = Math.max(time, Date.parse(`${current.time}Z`) || 0);
      const row: Record<string, number | null> = {};
      for (const v of variables) row[v] = typeof current[v] === "number" ? (current[v] as number) : null;
      values.push(row);
    }
  }
  return { values, time: time || Date.now() };
}
