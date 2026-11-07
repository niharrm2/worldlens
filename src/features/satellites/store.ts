import { create } from "zustand";

import { getGlobe } from "@/features/globe/store";
import { ORBIT_VIEW } from "@/features/globe/types";
import { useShellStore } from "@/features/shell/store";
import { getSearchParam, readStorage, updateSearchParams, writeStorage } from "@/lib/browser";
import { formatIsoUtc } from "@/lib/format";

import { classifyOrbit, normalizeOmm } from "./lib/orbit";
import type {
  OrbitalDataset,
  OrbitFilter,
  OrbitPathPoint,
  SatellitePoint,
  SatellitePosition,
  SatelliteRecord,
  WorkerRequest,
  WorkerResponse,
} from "./types";

const SNAPSHOT_URL = "/data/satellites/active.json";
const CACHE_NAME = "worldlens-orbits-v1";
const ATTEMPT_KEY = "worldlens-sat-attempt";
const CELESTRAK_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json";
const REFRESH_LIMIT_MS = 2 * 60 * 60 * 1000;
export const SAT_PAGE_SIZE = 60;

interface SatelliteState {
  records: SatelliteRecord[];
  byId: Map<number, SatelliteRecord>;
  dataset: OrbitalDataset | null;
  loaded: boolean;
  loadFailed: boolean;
  ready: boolean;
  points: SatellitePoint[];
  selectedId: number | null;
  /** Latest single-satellite calculation (refreshed every second). */
  detail: { time: number; point: SatellitePosition | null } | null;
  path: OrbitPathPoint[];
  pathComputedAt: number | null;
  paused: boolean;
  frozenTime: number | null;
  query: string;
  filter: OrbitFilter;
  listLimit: number;
  showCameras: boolean;
  showPath: boolean;
  refreshing: boolean;
  clockText: string;
  refreshStatus: string;

  activate(): void;
  tick(): void;
  select(id: number, reveal?: boolean): void;
  refreshSelected(kind: "select" | "detail"): void;
  setQuery(query: string): void;
  setFilter(filter: OrbitFilter): void;
  showMore(): void;
  setShowCameras(show: boolean): void;
  setShowPath(show: boolean): void;
  togglePause(): void;
  locateSelected(): void;
  refreshFromProvider(): Promise<void>;
  importFile(file: File): Promise<void>;
}

// ---- Worker plumbing (client only) -------------------------------------------

let worker: Worker | null = null;
let busy = false;
let tickQueued = false;
let loading = false;

const isActive = () => useShellStore.getState().mode === "satellites";
const post = (message: WorkerRequest) => worker?.postMessage(message);

export function matchingSatellites(s: Pick<SatelliteState, "records" | "query" | "filter">): SatelliteRecord[] {
  const term = s.query.trim().toLowerCase();
  return s.records.filter(
    (r) =>
      (s.filter === "all" || r.orbit.type === s.filter) &&
      (!term || `${r.OBJECT_NAME} ${r.NORAD_CAT_ID}`.toLowerCase().includes(term)),
  );
}

const rank = (r: SatelliteRecord) => (/ISS \(ZARYA\)/.test(r.OBJECT_NAME) ? 0 : /GOES|INSAT|METEOSAT/.test(r.OBJECT_NAME) ? 1 : 2);

export const useSatelliteStore = create<SatelliteState>((set, get) => {
  const stamp = () => (get().paused ? get().frozenTime! : Date.now());

  function onWorkerMessage(d: WorkerResponse) {
    switch (d.type) {
      case "ready": {
        set({ ready: true });
        const link = Number(getSearchParam("satellite"));
        const { byId, records } = get();
        get().select(byId.has(link) ? link : records[0].NORAD_CAT_ID, false);
        get().tick();
        break;
      }
      case "positions": {
        busy = false;
        useShellStore.getState().finishLoading("satellites");
        if (!isActive()) return;
        set({
          points: d.points,
          clockText: `${get().paused ? "PAUSED · " : "CALCULATED · "}${formatIsoUtc(d.time)}`,
          refreshStatus: `${d.points.length.toLocaleString()} plotted · ${d.failed} unavailable predictions · ${d.stale} with elements older than 7 days`,
        });
        if (tickQueued) {
          tickQueued = false;
          get().tick();
        }
        break;
      }
      case "selected":
      case "detail": {
        if (d.id !== get().selectedId) return;
        set({
          detail: { time: d.time, point: d.point },
          ...(d.type === "selected" ? { path: d.path, pathComputedAt: d.time } : {}),
        });
        break;
      }
      case "error":
        busy = false;
        useShellStore.getState().finishLoading("satellites");
        set({ refreshStatus: `Calculation error: ${d.message}` });
        break;
    }
  }

  function install(data: OrbitalDataset) {
    if (!Array.isArray(data.records)) throw new Error("Expected OMM records");
    const seen = new Set<number>();
    const records: SatelliteRecord[] = [];
    for (const raw of data.records) {
      const r = normalizeOmm(raw);
      if (r && !seen.has(r.NORAD_CAT_ID)) {
        seen.add(r.NORAD_CAT_ID);
        records.push({ ...r, orbit: classifyOrbit(r) });
      }
    }
    if (!records.length) throw new Error("No valid orbital records found");
    records.sort((a, b) => rank(a) - rank(b) || a.OBJECT_NAME.localeCompare(b.OBJECT_NAME));

    busy = false;
    set({
      records,
      byId: new Map(records.map((r) => [r.NORAD_CAT_ID, r])),
      dataset: data,
      loaded: true,
      loadFailed: false,
      ready: false,
      points: [],
      path: [],
    });

    worker?.terminate();
    worker = new Worker(new URL("./workers/propagation.worker.ts", import.meta.url), { type: "module" });
    worker.onerror = () => {
      busy = false;
      useShellStore.getState().finishLoading("satellites");
      set({ ready: false, refreshStatus: "Orbital calculation worker failed. Reload the page to restart." });
    };
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => onWorkerMessage(e.data);
    post({ type: "init", records });
  }

  async function load() {
    if (loading) return;
    loading = true;
    // Shown until the first positions are calculated (download + worker start-up).
    useShellStore.getState().startLoading("satellites", "satellite orbits");
    try {
      let data: OrbitalDataset | null = null;
      try {
        const cached = await (await caches.open(CACHE_NAME)).match(SNAPSHOT_URL);
        if (cached) data = await cached.json();
      } catch {
        // Cache Storage unavailable.
      }
      if (!data) {
        const response = await fetch(SNAPSHOT_URL);
        if (!response.ok) throw new Error("Snapshot download failed");
        data = await response.json();
      }
      install(data!);
    } catch {
      set({
        loadFailed: true,
      });
      useShellStore.getState().finishLoading("satellites");
      set({
        refreshStatus: "Could not load the snapshot. Use Refresh orbital data or import OMM JSON.",
      });
    } finally {
      loading = false;
    }
  }

  return {
    records: [],
    byId: new Map(),
    dataset: null,
    loaded: false,
    loadFailed: false,
    ready: false,
    points: [],
    selectedId: null,
    detail: null,
    path: [],
    pathComputedAt: null,
    paused: false,
    frozenTime: null,
    query: "",
    filter: "all",
    listLimit: SAT_PAGE_SIZE,
    showCameras: false,
    showPath: true,
    refreshing: false,
    clockText: "Waiting for orbital data…",
    refreshStatus: "",

    activate() {
      if (!get().loaded) void load();
      else get().tick();
    },

    tick() {
      if (!isActive() || !get().ready || document.hidden) return;
      if (busy) {
        tickQueued = true;
        return;
      }
      busy = true;
      const state = get();
      post({
        type: "tick",
        time: stamp(),
        filter: state.filter,
        ids: state.query.trim() ? matchingSatellites(state).map((r) => r.NORAD_CAT_ID) : null,
      });
    },

    select(id, reveal = true) {
      if (reveal) useShellStore.getState().showDetail();
      const record = get().byId.get(Number(id));
      if (!record || !get().ready) return;
      set({ selectedId: record.NORAD_CAT_ID, detail: null, path: [], pathComputedAt: null });
      post({ type: "select", id: record.NORAD_CAT_ID, time: stamp() });
      updateSearchParams({ satellite: String(record.NORAD_CAT_ID) });
    },

    refreshSelected(kind) {
      const { ready, selectedId, paused } = get();
      if (!isActive() || !ready || selectedId === null || paused || document.hidden) return;
      if (kind === "select") post({ type: "select", id: selectedId, time: Date.now() });
      else post({ type: "detail", time: Date.now() });
    },

    setQuery(query) {
      set({ query, listLimit: SAT_PAGE_SIZE });
      get().tick();
    },

    setFilter(filter) {
      set({ filter, listLimit: SAT_PAGE_SIZE });
      get().tick();
    },

    showMore: () => set({ listLimit: get().listLimit + SAT_PAGE_SIZE }),
    setShowCameras: (showCameras) => set({ showCameras }),
    setShowPath: (showPath) => set({ showPath }),

    togglePause() {
      const paused = !get().paused;
      set({ paused, frozenTime: paused ? Date.now() : null });
      get().tick();
      const { selectedId } = get();
      if (selectedId !== null) post({ type: "select", id: selectedId, time: stamp() });
    },

    locateSelected() {
      const { detail, points, selectedId } = get();
      const p = detail?.point || points.find((x) => x.id === selectedId);
      if (p) getGlobe()?.flyTo([p.lat, p.lng], p.alt > 20_000 ? ORBIT_VIEW.zoom : p.alt > 2000 ? 1 : 4, { duration: 1.3 });
    },

    async refreshFromProvider() {
      const lastAttempt = readStorage<number>(ATTEMPT_KEY, 0);
      const last = Math.max(lastAttempt, +new Date(get().dataset?.fetchedAt || 0));
      if (Date.now() - last < REFRESH_LIMIT_MS) {
        set({
          refreshStatus:
            "Provider refresh is limited to once per 2 hours. The stored data continues to propagate locally.",
        });
        return;
      }
      writeStorage(ATTEMPT_KEY, Date.now());
      set({ refreshing: true, refreshStatus: "Requesting fresh CelesTrak OMM data…" });
      try {
        const response = await fetch(CELESTRAK_URL, { signal: AbortSignal.timeout(30_000) });
        if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
        const rows = await response.json();
        if (!Array.isArray(rows)) throw new Error("Unexpected response");
        const data: OrbitalDataset = { source: CELESTRAK_URL, fetchedAt: new Date().toISOString(), records: rows };
        install(data);
        try {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(
            SNAPSHOT_URL,
            new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } }),
          );
        } catch {
          // Cache Storage unavailable.
        }
        set({ refreshStatus: "Updated orbital elements successfully." });
      } catch {
        set({
          refreshStatus:
            "Provider refresh unavailable (network, CORS or provider limits). Retained the existing snapshot; no automatic retries.",
        });
      } finally {
        set({ refreshing: false });
      }
    },

    async importFile(file) {
      try {
        if (file.size > 25 * 1024 * 1024) throw new Error("Choose a file under 25 MB");
        const data = JSON.parse(await file.text());
        install({
          source: "user-import",
          fetchedAt: new Date().toISOString(),
          records: Array.isArray(data) ? data : data.records,
        });
      } catch (error) {
        set({ refreshStatus: `Import failed: ${(error as Error).message}` });
      }
    },
  };
});
