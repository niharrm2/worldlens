import { PROVIDER_RADIUS_NM, PROVIDER_URL, REQUEST_TIMEOUT_MS, USER_AGENT } from "./config";

/** Non-2xx response from the upstream provider. */
export class ProviderHttpError extends Error {
  constructor(public readonly status: number, public readonly retryAfter: number | null) {
    super(`adsb.lol returned HTTP ${status}`);
    this.name = "ProviderHttpError";
  }
}

export type RegionFetcher = (lat: number, lon: number) => Promise<unknown>;

/** Query the documented public adsb.lol point endpoint. */
export const fetchRegion: RegionFetcher = async (lat, lon) => {
  const response = await fetch(`${PROVIDER_URL}/${lat}/${lon}/${PROVIDER_RADIUS_NM}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) {
    const retryAfter = Number.parseFloat(response.headers.get("Retry-After") ?? "");
    throw new ProviderHttpError(response.status, Number.isFinite(retryAfter) ? retryAfter : null);
  }
  return response.json();
};
