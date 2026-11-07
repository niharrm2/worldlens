import "server-only";

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Aircraft, FlightsResponse, Region } from "@/types/flights";
import {
  CACHE_TTL,
  CHECKPOINT_PATH,
  CLIENT_IDLE_TIMEOUT,
  INITIAL_REQUEST_INTERVAL,
  POSITION_RETENTION,
} from "./config";
import { normalize } from "./normalize";
import { fetchRegion, ProviderHttpError, type RegionFetcher } from "./provider";
import { buildRegions } from "./regions";

/** Seconds since the epoch. */
const systemClock = () => Date.now() / 1000;

interface Checkpoint {
  aircraft: Aircraft[];
  last_success?: number;
  cursor?: number;
  visited?: number[];
}

/**
 * Paced, cached rolling scan of public adsb.lol regional responses.
 * One scanner is shared by every browser tab; inactive sessions stop upstream traffic.
 */
export class FlightScanner {
  private readonly regions: Region[] = buildRegions();
  private aircraft = new Map<string, Aircraft>();
  private visited = new Set<number>();
  private regionCache = new Map<number, [received: number, data: unknown]>();
  private cursor = 0;
  private lastSuccess = 0;
  private lastClient = 0;
  private error = "";
  private blockedUntil = 0;
  private failures = 0;
  private requestInterval = INITIAL_REQUEST_INTERVAL;
  private memo: FlightsResponse | null = null;
  private memoAt = 0;
  private savedAt = 0;
  private running = false;

  constructor(
    private readonly fetchRegionData: RegionFetcher = fetchRegion,
    private readonly clock: () => number = systemClock,
    private readonly checkpointPath: string = CHECKPOINT_PATH,
  ) {
    this.restore();
  }

  private restore() {
    try {
      const saved = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as Checkpoint;
      const now = this.clock();
      for (const a of saved.aircraft) {
        const age = now - a.positionTime / 1000;
        if (age >= 0 && age < POSITION_RETENTION) this.aircraft.set(a.id, a);
      }
      this.lastSuccess = saved.last_success ?? 0;
      this.cursor = Math.max(0, Math.trunc(saved.cursor ?? 0));
      this.visited = new Set(saved.visited ?? []);
      if (this.aircraft.size) {
        this.blockedUntil = now + 60;
        this.requestInterval = 5;
        this.error = "Restored cached positions. Scan resumes after a short cooldown.";
      }
    } catch {
      // No checkpoint or unreadable checkpoint: start fresh.
    }
  }

  private checkpoint(received: number) {
    mkdirSync(path.dirname(this.checkpointPath), { recursive: true });
    const temp = `${this.checkpointPath}.tmp`;
    const body: Checkpoint = {
      aircraft: [...this.aircraft.values()],
      last_success: received,
      cursor: this.cursor,
      visited: [...this.visited].sort((a, b) => a - b),
    };
    writeFileSync(temp, JSON.stringify(body), "utf8");
    renameSync(temp, this.checkpointPath);
    this.savedAt = received;
  }

  /** Fetch (or reuse) one region and merge its aircraft. */
  async step(): Promise<void> {
    const now = this.clock();
    if (now < this.blockedUntil) return;
    const index = this.cursor % this.regions.length;
    const cached = this.regionCache.get(index);

    try {
      const reused = cached !== undefined && now - cached[0] < CACHE_TTL;
      const data = reused ? cached[1] : await this.fetchRegionData(...this.regions[index]);
      const received = reused ? cached[0] : this.clock();
      const rows = normalize(data, received);

      this.regionCache.set(index, [received, data]);
      for (const [key, [at]] of this.regionCache) {
        if (received - at >= CACHE_TTL) this.regionCache.delete(key);
      }
      for (const a of rows) {
        const old = this.aircraft.get(a.id);
        if (!old || a.positionTime >= old.positionTime) this.aircraft.set(a.id, a);
      }
      for (const [id, a] of this.aircraft) {
        if (received - a.positionTime / 1000 >= POSITION_RETENTION) this.aircraft.delete(id);
      }
      this.visited.add(index);
      this.cursor += 1;
      this.lastSuccess = received;
      this.error = "";
      this.failures = 0;
      if (received - this.savedAt >= CACHE_TTL) this.checkpoint(received);
    } catch (exc) {
      this.failures += 1;
      let delay = Math.min(300, 30 * 2 ** Math.min(this.failures - 1, 4));
      if (exc instanceof ProviderHttpError) {
        if (exc.status === 429) this.requestInterval = Math.min(60, Math.max(5, this.requestInterval * 2));
        if (exc.retryAfter !== null) delay = Math.max(delay, exc.retryAfter);
        if (exc.status === 401 || exc.status === 403) delay = Math.max(delay, 600);
        this.error = `adsb.lol returned HTTP ${exc.status}. Scan paused before retrying.`;
      } else {
        this.error = "Provider request failed. Retaining cached positions; scan will retry.";
      }
      this.blockedUntil = this.clock() + delay;
      this.memo = null;
    }
  }

  /** Merged response, memoised for CACHE_TTL seconds. Also marks a client as active. */
  response(): FlightsResponse {
    const now = this.clock();
    this.lastClient = now;
    if (this.memo === null || now - this.memoAt >= CACHE_TTL) {
      this.memoAt = now;
      this.memo = {
        aircraft: [...this.aircraft.values()].filter((a) => now - a.positionTime / 1000 < POSITION_RETENTION),
        observedAt: this.lastSuccess * 1000,
        assembledAt: now * 1000,
        cacheSeconds: CACHE_TTL,
        stale: Boolean(this.error) || now - this.lastSuccess > 60,
        scan: {
          completedRegions: this.visited.size,
          totalRegions: this.regions.length,
          requestsCompleted: this.cursor,
          error: this.error,
          retryAfter: Math.max(0, Math.ceil(this.blockedUntil - now)),
          mode: "rolling-regional-scan",
        },
      };
    }
    return this.memo;
  }

  /** Start the background loop (idempotent). */
  start() {
    if (this.running) return;
    this.running = true;
    const loop = async () => {
      const start = this.clock();
      if (start - this.lastClient < CLIENT_IDLE_TIMEOUT) await this.step();
      const wait = Math.max(0.1, this.requestInterval - (this.clock() - start));
      setTimeout(loop, wait * 1000).unref?.();
    };
    void loop();
  }
}
