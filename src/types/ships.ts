export type ShipCategory =
  | "cargo"
  | "tanker"
  | "passenger"
  | "highspeed"
  | "fishing"
  | "service"
  | "pleasure"
  | "other"
  | "unknown";

export type ShipSource = "aisstream" | "digitraffic";

/** Position summary for every vessel (what the globe and the directory need). */
export interface Ship {
  /** MMSI as a string (stable selection key). */
  id: string;
  mmsi: number;
  lat: number;
  lng: number;
  /** Speed over ground, knots. */
  speed: number | null;
  /** Course over ground, degrees. */
  course: number | null;
  /** True heading, degrees. */
  heading: number | null;
  shipType: number | null;
  category: ShipCategory;
  name: string;
  /** Epoch ms of the position report. */
  positionTime: number;
}

/** Full record for one vessel, served by `/api/ships/[mmsi]`. */
export interface ShipDetail extends Ship {
  navStatus: string;
  callSign: string;
  imo: number | null;
  destination: string;
  /** Metres. */
  draught: number | null;
  length: number | null;
  width: number | null;
  source: ShipSource;
}

/**
 * Compact row on the wire: [mmsi, lat, lng, speed, course, heading, shipType, ageSeconds, name].
 * Keeps a worldwide snapshot (tens of thousands of vessels) small enough to poll.
 */
export type ShipRow = [
  mmsi: number,
  lat: number,
  lng: number,
  speed: number | null,
  course: number | null,
  heading: number | null,
  shipType: number | null,
  ageSeconds: number,
  name: string,
];

export interface ShipFeedStatus {
  ok: boolean;
  count: number;
  message: string;
}

export interface ShipsResponse {
  /** Server time the snapshot was assembled (epoch ms); row ages are relative to it. */
  assembledAt: number;
  cacheSeconds: number;
  sources: Record<ShipSource, ShipFeedStatus>;
  rows: ShipRow[];
}
