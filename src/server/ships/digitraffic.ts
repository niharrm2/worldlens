import "server-only";

import { aisCourse, aisHeading, aisSpeed, aisText, finite, navStatusText, shipCategory, validPosition } from "@/lib/ais";
import type { ShipDetail } from "@/types/ships";

/**
 * Fintraffic Digitraffic Marine — Finnish coastal AIS network (open data, CC BY 4.0).
 * The provider requires gzip and asks clients to identify themselves.
 */
const API = "https://meri.digitraffic.fi/api/ais/v1";
const HEADERS = { "Accept-Encoding": "gzip", "Digitraffic-User": "WorldLens/1.0", Accept: "application/json" };
const LOCATION_TTL_MS = 30_000;
const VESSEL_TTL_MS = 10 * 60_000;

interface LocationFeature {
  mmsi: number;
  geometry: { coordinates: [number, number] };
  properties: { mmsi: number; sog?: number; cog?: number; navStat?: number; heading?: number; timestampExternal?: number };
}

interface Vessel {
  mmsi: number;
  name?: string;
  callSign?: string;
  imo?: number;
  destination?: string;
  shipType?: number;
  /** Decimetres. */
  draught?: number;
  referencePointA?: number;
  referencePointB?: number;
  referencePointC?: number;
  referencePointD?: number;
}

interface State {
  ships: ShipDetail[];
  at: number;
  vessels: Map<number, Vessel>;
  vesselsAt: number;
  error: string;
  pending: Promise<void> | null;
}

const g = globalThis as typeof globalThis & { __worldlensDigitraffic?: State };
const state = (g.__worldlensDigitraffic ??= { ships: [], at: 0, vessels: new Map(), vesselsAt: 0, error: "", pending: null });

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`, { headers: HEADERS, signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (!response.ok) throw new Error(`Digitraffic returned HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export function toDetail(f: LocationFeature, v: Vessel | undefined): ShipDetail | null {
  const [lng, lat] = f.geometry?.coordinates ?? [];
  const p = f.properties ?? ({} as LocationFeature["properties"]);
  const mmsi = finite(p.mmsi ?? f.mmsi);
  if (mmsi === null || !validPosition(lat, lng)) return null;
  const a = finite(v?.referencePointA), b = finite(v?.referencePointB);
  const c = finite(v?.referencePointC), d = finite(v?.referencePointD);
  const shipType = finite(v?.shipType);
  const draught = finite(v?.draught);
  return {
    id: String(mmsi),
    mmsi,
    lat,
    lng,
    speed: aisSpeed(p.sog),
    course: aisCourse(p.cog),
    heading: aisHeading(p.heading),
    shipType,
    category: shipCategory(shipType),
    name: aisText(v?.name),
    positionTime: finite(p.timestampExternal) ?? Date.now(),
    navStatus: navStatusText(finite(p.navStat)),
    callSign: aisText(v?.callSign),
    imo: finite(v?.imo) || null,
    destination: aisText(v?.destination),
    draught: draught ? draught / 10 : null,
    length: a !== null && b !== null && a + b > 0 ? a + b : null,
    width: c !== null && d !== null && c + d > 0 ? c + d : null,
    source: "digitraffic",
  };
}

async function refresh() {
  const now = Date.now();
  if (now - state.vesselsAt > VESSEL_TTL_MS) {
    try {
      const vessels = await get<Vessel[]>("/vessels");
      state.vessels = new Map(vessels.map((v) => [v.mmsi, v]));
      state.vesselsAt = now;
    } catch {
      // Positions remain useful without names; retry metadata next time.
    }
  }
  try {
    const locations = await get<{ features: LocationFeature[] }>("/locations");
    state.ships = (locations.features ?? [])
      .map((f) => toDetail(f, state.vessels.get(f.properties?.mmsi ?? f.mmsi)))
      .filter((s): s is ShipDetail => s !== null);
    state.error = "";
  } catch (error) {
    state.error = (error as Error).message;
  }
  state.at = Date.now();
}

/** Finnish coastal vessels, refreshed at most every 30 s; keeps the last good list on failure. */
export async function getDigitrafficShips(): Promise<{ ships: ShipDetail[]; error: string }> {
  if (Date.now() - state.at >= LOCATION_TTL_MS) {
    state.pending ??= refresh().finally(() => {
      state.pending = null;
    });
    await state.pending;
  }
  return { ships: state.ships, error: state.error };
}
