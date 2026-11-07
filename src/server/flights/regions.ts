import type { Region } from "@/types/flights";

const round4 = (value: number) => Math.round(value * 1e4) / 1e4;

/** Major hubs scanned first so every continent shows aircraft quickly. */
const SEEDS: Region[] = [
  [51.5, 0], [40.7, -74], [28.6, 77.2], [35.7, 139.7],
  [-33.9, 151.2], [25.2, 55.3], [1.3, 103.8], [34, -118],
  [-23.5, -46.6], [-26.2, 28], [39.9, 116.4], [41, 29],
];

/**
 * Five-degree spherical grid: the corner distance stays below the public 250 NM radius.
 * Latitudes and longitudes are interleaved so all continents appear progressively.
 */
export function buildRegions(): Region[] {
  const grid: Region[] = [];
  for (let i = 0; i < 36; i++) {
    const lat = -87.5 + i * 5;
    const count = Math.max(1, Math.ceil((360 * Math.cos((lat * Math.PI) / 180)) / 5));
    for (let j = 0; j < count; j++) {
      grid.push([round4(lat), round4(-180 + ((j + 0.5) * 360) / count)]);
    }
  }
  const stride = (offset: number) => grid.filter((_, index) => index % 4 === offset);
  return [...SEEDS, ...stride(0), ...stride(1), ...stride(2), ...stride(3)];
}
