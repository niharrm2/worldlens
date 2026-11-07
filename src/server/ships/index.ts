import "server-only";

import type { ShipDetail, ShipRow, ShipsResponse } from "@/types/ships";

import { getAisStream } from "./aisstream";
import { getDigitrafficShips } from "./digitraffic";

const SNAPSHOT_TTL_MS = 15_000;

interface Merged {
  byId: Map<string, ShipDetail>;
  response: ShipsResponse;
  at: number;
}

const g = globalThis as typeof globalThis & { __worldlensShips?: Merged | null };

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;

/** Fill blank metadata on `primary` from `other` (same vessel seen by both networks). */
function combine(primary: ShipDetail, other: ShipDetail): ShipDetail {
  const merged = { ...primary } as Record<string, unknown>;
  for (const [key, value] of Object.entries(other)) {
    if (merged[key] === null || merged[key] === "") merged[key] = value;
  }
  return merged as unknown as ShipDetail;
}

async function build(): Promise<Merged> {
  const stream = getAisStream();
  stream?.touch();
  const digitraffic = await getDigitrafficShips();

  const byId = new Map<string, ShipDetail>();
  for (const ship of [...(stream?.snapshot() ?? []), ...digitraffic.ships]) {
    const existing = byId.get(ship.id);
    if (!existing) byId.set(ship.id, ship);
    else byId.set(ship.id, ship.positionTime >= existing.positionTime ? combine(ship, existing) : combine(existing, ship));
  }

  // Named vessels first, alphabetically — the client lists rows in this order.
  const ships = [...byId.values()].sort(
    (a, b) => Number(!a.name) - Number(!b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : a.mmsi - b.mmsi),
  );
  const now = Date.now();
  const rows: ShipRow[] = ships.map((s) => [
    s.mmsi,
    round(s.lat, 5),
    round(s.lng, 5),
    s.speed === null ? null : round(s.speed, 1),
    s.course === null ? null : Math.round(s.course),
    s.heading,
    s.shipType,
    Math.max(0, Math.round((now - s.positionTime) / 1000)),
    s.name,
  ]);

  return {
    byId,
    at: now,
    response: {
      assembledAt: now,
      cacheSeconds: SNAPSHOT_TTL_MS / 1000,
      rows,
      sources: {
        aisstream: stream
          ? { ok: stream.connected && !stream.error, count: stream.count, message: stream.status() }
          : { ok: false, count: 0, message: "Worldwide feed disabled: set AISSTREAM_API_KEY on the server." },
        digitraffic: {
          ok: !digitraffic.error,
          count: digitraffic.ships.length,
          message: digitraffic.error || "Finnish coastal network",
        },
      },
    },
  };
}

let pending: Promise<Merged> | null = null;

async function merged(): Promise<Merged> {
  const cached = g.__worldlensShips;
  if (cached && Date.now() - cached.at < SNAPSHOT_TTL_MS) {
    getAisStream()?.touch();
    return cached;
  }
  pending ??= build()
    .then((result) => (g.__worldlensShips = result))
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** Compact worldwide snapshot, shared by all clients for 15 s. */
export async function getShipsSnapshot(): Promise<ShipsResponse> {
  return (await merged()).response;
}

/** Full record for one vessel from the latest snapshot. */
export async function getShipDetail(id: string): Promise<ShipDetail | null> {
  return (await merged()).byId.get(id) ?? null;
}
