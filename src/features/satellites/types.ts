export type OrbitClass = "leo" | "meo" | "geo" | "gso" | "heo";
export type OrbitFilter = "all" | OrbitClass;

/** Validated CCSDS OMM record (CelesTrak JSON format). */
export interface OmmRecord {
  OBJECT_NAME: string;
  OBJECT_ID?: string;
  NORAD_CAT_ID: number;
  EPOCH: string;
  MEAN_MOTION: number;
  ECCENTRICITY: number;
  INCLINATION: number;
  RA_OF_ASC_NODE: number;
  ARG_OF_PERICENTER: number;
  MEAN_ANOMALY: number;
  BSTAR: number;
  MEAN_MOTION_DOT: number;
  MEAN_MOTION_DDOT: number;
  [key: string]: unknown;
}

export interface OrbitInfo {
  type: OrbitClass;
  /** Minutes. */
  period: number;
  apogee: number;
  perigee: number;
}

export interface SatelliteRecord extends OmmRecord {
  orbit: OrbitInfo;
}

export interface OrbitalDataset {
  source: string;
  fetchedAt: string;
  records: unknown[];
}

/** Geodetic position: degrees, kilometres, km/s. */
export interface SatellitePosition {
  lat: number;
  lng: number;
  alt: number;
  speed: number;
}

export interface SatellitePoint extends SatellitePosition {
  id: number;
  type: OrbitClass;
  stale: boolean;
}

export type OrbitPathPoint = (SatellitePosition & { time: number }) | null;

export type WorkerRequest =
  | { type: "init"; records: OmmRecord[] }
  | { type: "tick"; time: number; filter: OrbitFilter; ids: number[] | null }
  | { type: "select"; id: number; time: number }
  | { type: "detail"; time: number };

export type WorkerResponse =
  | { type: "ready"; count: number }
  | { type: "positions"; time: number; points: SatellitePoint[]; failed: number; stale: number }
  | { type: "selected"; id: number; time: number; point: SatellitePosition | null; path: OrbitPathPoint[] }
  | { type: "detail"; id: number; time: number; point: SatellitePosition | null }
  | { type: "error"; message: string };
