import "server-only";

import type { EarthPayload } from "@/types/earth";

interface Entry {
  payload: EarthPayload<unknown> | null;
  at: number;
  pending: Promise<EarthPayload<unknown>> | null;
}

const g = globalThis as typeof globalThis & { __worldlensEarthCache?: Map<string, Entry> };
const entries = (g.__worldlensEarthCache ??= new Map());

export interface Fetched<T> {
  items: T;
  dataTime: number;
}

/**
 * Shared cache for one provider dataset: at most one upstream request per TTL, concurrent
 * callers share it, and the last good snapshot is served (flagged stale) if the provider fails.
 */
export async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<Fetched<T>>): Promise<EarthPayload<T>> {
  let entry = entries.get(key);
  if (!entry) {
    entry = { payload: null, at: 0, pending: null };
    entries.set(key, entry);
  }
  if (entry.payload && Date.now() - entry.at < ttlMs) return entry.payload as EarthPayload<T>;

  const e = entry;
  e.pending ??= fetcher()
    .then(({ items, dataTime }) => {
      e.payload = { items, dataTime, fetchedAt: Date.now(), stale: false, error: "" };
      return e.payload;
    })
    .catch((error: Error) => {
      if (!e.payload) throw error;
      e.payload = { ...e.payload, stale: true, error: error.message || "Provider unavailable" };
      return e.payload;
    })
    .finally(() => {
      e.at = Date.now();
      e.pending = null;
    });
  return e.pending as Promise<EarthPayload<T>>;
}

export const USER_AGENT = "WorldLens/1.0 (+https://github.com/)";

export async function getJson<T>(url: string, timeoutMs = 25_000): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export async function getText(url: string, timeoutMs = 30_000): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
  return response.text();
}

export const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
