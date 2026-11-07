/** Normalised aircraft position served by `/api/flights`. */
export interface Aircraft {
  id: string;
  lat: number;
  lng: number;
  callsign: string;
  registration: string;
  type: string;
  ground: boolean;
  altitude: number | null;
  heading: number | null;
  headingSource: string;
  speed: number | null;
  /** Epoch milliseconds of the reported position. */
  positionTime: number;
}

export interface ScanStatus {
  completedRegions: number;
  totalRegions: number;
  requestsCompleted: number;
  error: string;
  retryAfter: number;
  mode: "rolling-regional-scan";
}

export interface FlightsResponse {
  aircraft: Aircraft[];
  observedAt: number;
  assembledAt: number;
  cacheSeconds: number;
  stale: boolean;
  scan: ScanStatus;
}

/** A sample point on the regional scan grid: [latitude, longitude]. */
export type Region = readonly [number, number];
