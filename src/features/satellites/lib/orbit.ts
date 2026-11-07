/** OMM validation, orbit classification and SGP4 helpers (shared by the UI and the worker). */
import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
  gstime,
  propagate,
  type SatRec,
} from "satellite.js";

import type { OmmRecord, OrbitInfo, OrbitPathPoint, SatellitePosition } from "../types";

export const DAY_MS = 86_400_000;
const EARTH_RADIUS_KM = 6378.137;
const MU = 398600.4418;

export const ORBIT_NAMES = {
  all: "All orbits",
  leo: "Low Earth orbit",
  meo: "Medium Earth orbit",
  geo: "Near-geostationary",
  gso: "Other geosynchronous",
  heo: "High / elliptical",
} as const;

export function epochDate(epoch: string): Date {
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(epoch) ? epoch : `${epoch}Z`);
}

const EXPECTED = { CENTER_NAME: "EARTH", REF_FRAME: "TEME", TIME_SYSTEM: "UTC", MEAN_ELEMENT_THEORY: "SGP4" };
const NUMERIC_FIELDS = [
  "MEAN_MOTION", "ECCENTRICITY", "INCLINATION", "RA_OF_ASC_NODE", "ARG_OF_PERICENTER",
  "MEAN_ANOMALY", "BSTAR", "MEAN_MOTION_DOT", "MEAN_MOTION_DDOT",
] as const;
const OPTIONAL_ZERO = new Set(["BSTAR", "MEAN_MOTION_DOT", "MEAN_MOTION_DDOT"]);

/** Validate and coerce a raw OMM object; returns null when unusable. */
export function normalizeOmm(raw: unknown): OmmRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  for (const [key, expected] of Object.entries(EXPECTED)) {
    if (r[key] && String(r[key]).toUpperCase() !== expected) return null;
  }
  const id = Number(r.NORAD_CAT_ID);
  const epoch = epochDate(String(r.EPOCH || ""));
  if (!Number.isSafeInteger(id) || id <= 0 || id > 999_999_999 || !Number.isFinite(+epoch)) return null;

  const out: Record<string, unknown> = {
    ...r,
    NORAD_CAT_ID: id,
    EPOCH: epoch.toISOString(),
    OBJECT_NAME: String(r.OBJECT_NAME || `NORAD ${id}`).slice(0, 150),
  };
  for (const key of NUMERIC_FIELDS) {
    const value = Number(r[key] ?? (OPTIONAL_ZERO.has(key) ? 0 : NaN));
    if (!Number.isFinite(value)) return null;
    out[key] = value;
  }
  const o = out as OmmRecord;
  if (o.MEAN_MOTION <= 0 || o.MEAN_MOTION > 20 || o.ECCENTRICITY < 0 || o.ECCENTRICITY >= 1) return null;
  if (o.INCLINATION < 0 || o.INCLINATION > 180) return null;
  return o;
}

export function classifyOrbit(r: OmmRecord): OrbitInfo {
  const period = 1440 / r.MEAN_MOTION;
  const a = Math.cbrt(MU / Math.pow((r.MEAN_MOTION * 2 * Math.PI) / 86400, 2));
  const apogee = a * (1 + r.ECCENTRICITY) - EARTH_RADIUS_KM;
  const perigee = a * (1 - r.ECCENTRICITY) - EARTH_RADIUS_KM;
  let type: OrbitInfo["type"];
  if (Math.abs(period - 1436.068) < 15) type = r.INCLINATION < 3 && r.ECCENTRICITY < 0.01 ? "geo" : "gso";
  else if (apogee < 2000) type = "leo";
  else if (perigee >= 2000 && apogee < 35786) type = "meo";
  else type = "heo";
  return { type, period, apogee, perigee };
}

export function positionAt(rec: SatRec, time: Date): SatellitePosition | null {
  try {
    const pv = propagate(rec, time);
    if (!pv?.position || !pv?.velocity || rec.error) return null;
    const geo = eciToGeodetic(pv.position, gstime(time));
    const speed = Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z);
    const lat = degreesLat(geo.latitude);
    const lng = degreesLong(geo.longitude);
    const alt = geo.height;
    if (![lat, lng, alt, speed].every(Number.isFinite) || alt < 80 || alt > 200_000) return null;
    return { lat, lng, alt, speed };
  } catch {
    return null;
  }
}

/** 181 samples over one orbit (capped at 48 h); gaps are null. */
export function orbitPath(rec: SatRec, periodMinutes: number, time: Date): OrbitPathPoint[] {
  const minutes = Math.min(periodMinutes, 2880);
  const points: OrbitPathPoint[] = [];
  for (let i = 0; i <= 180; i++) {
    const at = new Date(+time + (minutes * 60_000 * i) / 180);
    const p = positionAt(rec, at);
    points.push(p ? { ...p, time: +at } : null);
  }
  return points;
}
