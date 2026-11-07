import path from "node:path";

/** Lifetime of each regional provider response and of the merged API response (seconds). */
export const CACHE_TTL = 20;

/** Positions older than this are discarded (seconds). */
export const POSITION_RETENTION = 3600;

/** Scanning stops when no client has polled `/api/flights` for this long (seconds). */
export const CLIENT_IDLE_TIMEOUT = 45;

/** Initial delay between upstream requests (seconds); grows after HTTP 429. */
export const INITIAL_REQUEST_INTERVAL = 2;

/** Upstream request timeout (milliseconds). */
export const REQUEST_TIMEOUT_MS = 20_000;

export const PROVIDER_URL = "https://api.adsb.lol/v2/point";
export const PROVIDER_RADIUS_NM = 250;
export const USER_AGENT = "WorldLens-local/1.0";

/** Disk checkpoint used to restore positions after a restart. */
export const CHECKPOINT_PATH =
  process.env.WORLDLENS_CACHE_FILE ?? path.join(process.cwd(), ".cache", "flights.json");
