import { create } from "zustand";

import { getGlobe } from "@/features/globe/store";
import { notify, trackLoading, useShellStore } from "@/features/shell/store";
import { downloadJson, getSearchParam, readStorage, updateSearchParams, writeStorage } from "@/lib/browser";
import { formatShortUtc } from "@/lib/format";
import { fetchJson } from "@/lib/http";

import {
  applyAtlasLabel,
  ARGUS_URL,
  ATLAS_INDEX_URL,
  atlasAuditText,
  buildAtlasRows,
  hydrateCamera,
  loadAtlasLabels,
} from "./lib/atlas";
import { httpsUrl, isValidCamera, mergeCameras, normalizeImport, normalizeSingapore, youtubeId } from "./lib/camera-core";
import { refreshJobs, SINGAPORE_TRAFFIC_URL } from "./lib/providers";
import { discoverYoutubeBroadcasts } from "./lib/youtube-discovery";
import type { AtlasIndex, Camera, CameraCatalog, CameraFilter, FeedType } from "./types";

const SAVED_KEY = "worldlens-saved";
const CATALOG_URL = "/data/catalog.json";
export const PAGE_SIZE = 40;

export type SelectionStatus = "ready" | "loading" | "error";

interface CameraState {
  cameras: Camera[];
  selectedId: string | null;
  selectionStatus: SelectionStatus;

  filter: CameraFilter;
  query: string;
  country: string;
  inView: boolean;
  directOnly: boolean;
  pageSize: number;

  saved: Set<string>;
  sourceStates: Record<string, string>;
  catalogTime: string | null;
  catalogStatus: string;
  catalogFailed: boolean;
  atlas: AtlasIndex | null;
  atlasAudit: string;
  refreshing: boolean;
  discovering: boolean;
  discoveryStatus: string;
  wallCameras: Camera[];
  /** Incremented to stop any playing media and return the player to its poster. */
  mediaResetToken: number;

  init(): Promise<void>;
  select(id: string, fly?: boolean): Promise<void>;
  setFilter(filter: CameraFilter): void;
  setQuery(query: string): void;
  setCountry(country: string): void;
  setInView(inView: boolean): void;
  setDirectOnly(directOnly: boolean): void;
  showMore(): void;
  resetFilters(): void;
  toggleSaved(): void;
  stopMedia(): void;
  refreshCatalog(): Promise<void>;
  importCatalog(file: File): Promise<void>;
  addFeed(form: FormData): string | null;
  exportCatalog(): void;
  discoverYoutube(key: string): Promise<void>;
  openWall(): Promise<void>;
  closeWall(): void;
}

let initialized = false;

const findCamera = (cameras: Camera[], id: string | null) => (id ? cameras.find((c) => c.id === id) : undefined);

export const useCameraStore = create<CameraState>((set, get) => {
  /** Status line shown under the directory after the catalogue changes. */
  const countsStatus = () => {
    const { atlas, cameras, catalogTime } = get();
    return atlas ? `Global index · ${cameras.length.toLocaleString()} records` : `Catalog ${formatShortUtc(catalogTime)}`;
  };

  const setCameras = (cameras: Camera[]) => {
    set({ cameras });
    set({ catalogStatus: countsStatus() });
  };

  const replaceCamera = (camera: Camera) =>
    set({ cameras: get().cameras.map((c) => (c.id === camera.id ? camera : c)) });

  const resetPage = { pageSize: PAGE_SIZE };

  async function loadAtlas() {
    const index = await fetchJson<AtlasIndex>(ATLAS_INDEX_URL, 40_000);
    const rows = buildAtlasRows(index);
    set({ atlas: index, atlasAudit: atlasAuditText(index) });
    setCameras(get().cameras.concat(rows));
    set({ catalogStatus: `Global index ready · ${get().cameras.length.toLocaleString()} records` });
    notify(`Global index loaded: ${rows.length.toLocaleString()} additional records.`);

    try {
      const labels = await loadAtlasLabels(index);
      set({
        cameras: get().cameras.map((c) => (c.source === "argus" && c.upstreamIndex !== undefined ? applyAtlasLabel(c, labels) : c)),
      });
    } catch {
      notify("Global locations loaded, but camera names could not load. Reload to retry.");
    }

    const linked = getSearchParam("camera");
    if (linked && get().cameras.some((c) => c.id === linked)) void get().select(linked, false);
  }

  return {
    cameras: [],
    selectedId: null,
    selectionStatus: "ready",
    filter: "all",
    query: "",
    country: "all",
    inView: false,
    directOnly: false,
    pageSize: PAGE_SIZE,
    saved: new Set(),
    sourceStates: {},
    catalogTime: null,
    catalogStatus: "Loading public camera catalogs",
    catalogFailed: false,
    atlas: null,
    atlasAudit: "Loading global index…",
    refreshing: false,
    discovering: false,
    discoveryStatus:
      "Your key is sent only to Google's API. Use an HTTP-referrer-restricted browser key; searches consume your quota.",
    wallCameras: [],
    mediaResetToken: 0,

    async init() {
      // Idempotent: React may run mount effects twice in development.
      if (initialized) return;
      initialized = true;
      set({ saved: new Set(readStorage<string[]>(SAVED_KEY, [])) });
      try {
        const data = await trackLoading("catalog", "the camera catalogue", fetchJson<CameraCatalog>(CATALOG_URL, 15_000));
        set({ catalogTime: data.generatedAt });
        setCameras(data.cameras.filter(isValidCamera));

        const { cameras } = get();
        const requested = getSearchParam("camera");
        const initial = cameras.some((c) => c.id === requested)
          ? requested
          : cameras.find((c) => c.type === "youtube")?.id || cameras[0]?.id;
        if (initial) void get().select(initial, false);

        trackLoading("atlas", "the global camera index", loadAtlas()).catch(() => {
          notify("The expanded index could not load. The initial catalog remains available.");
          set({ atlasAudit: "Expanded index download failed. Reload to retry." });
        });

        const now = new Date().toISOString();
        try {
          const sg = normalizeSingapore(await fetchJson(SINGAPORE_TRAFFIC_URL, 12_000), now);
          if (sg.length) {
            set({ sourceStates: { ...get().sourceStates, singapore: `Refreshed ${formatShortUtc(now)}` } });
            setCameras(mergeCameras(get().cameras.filter((c) => c.source !== "singapore"), sg));
          }
        } catch {
          set({ sourceStates: { ...get().sourceStates, singapore: "Bundled snapshot URLs · refresh may be needed" } });
        }
      } catch {
        set({ catalogFailed: true, catalogStatus: "Catalog unavailable" });
        notify("Catalog could not load. Reload to retry.");
      }
    },

    async select(id, fly = true) {
      if (fly) useShellStore.getState().showDetail();
      set({ selectedId: id });
      const camera = findCamera(get().cameras, id);
      if (!camera) return;

      const globe = getGlobe();
      if (fly && globe && useShellStore.getState().mode !== "satellites") {
        globe.flyTo([camera.lat, camera.lng], Math.max(globe.getZoom(), 12), { duration: 0.6 });
      }

      if (camera.catalogOnly) {
        set({ selectionStatus: "loading" });
        const atlas = get().atlas;
        let hydrated: Camera;
        try {
          if (!atlas) throw new Error("Atlas index not loaded");
          hydrated = await hydrateCamera(camera, atlas);
        } catch {
          if (get().selectedId !== id) return;
          set({ selectionStatus: "error" });
          notify("Camera detail unavailable. Select the camera again to retry.");
          return;
        }
        if (get().selectedId !== id) return;
        replaceCamera(hydrated);
      }
      set({ selectionStatus: "ready" });
      updateSearchParams({ camera: id });
    },

    setFilter: (filter) => set({ filter, ...resetPage }),
    setQuery: (query) => set({ query, ...resetPage }),
    setCountry: (country) => set({ country, ...resetPage }),
    setInView: (inView) => set({ inView, ...resetPage }),
    setDirectOnly: (directOnly) => set({ directOnly, ...resetPage }),
    showMore: () => set({ pageSize: get().pageSize + PAGE_SIZE }),
    resetFilters: () =>
      set({ filter: "all", query: "", country: "all", inView: false, directOnly: false, ...resetPage }),

    toggleSaved() {
      const { selectedId, saved } = get();
      if (!selectedId) return;
      const next = new Set(saved);
      if (next.has(selectedId)) next.delete(selectedId);
      else next.add(selectedId);
      set({ saved: next });
      if (!writeStorage(SAVED_KEY, [...next])) notify("Bookmarks could not be saved on this device.");
    },

    stopMedia: () => set({ mediaResetToken: get().mediaResetToken + 1 }),

    async refreshCatalog() {
      if (get().refreshing) return;
      set({ refreshing: true, catalogStatus: "Refreshing provider catalogs…" });
      const now = new Date().toISOString();
      const jobs = refreshJobs(now);
      const queue = [...jobs];
      const changes: { job: (typeof jobs)[number]; rows: Camera[] }[] = [];
      const errors: Record<string, number> = {};
      let success = 0;

      const worker = async () => {
        while (queue.length) {
          const job = queue.shift()!;
          try {
            const rows = job.normalize((await fetchJson(job.url)) as never);
            if (!rows.length) throw new Error("Empty provider catalog");
            changes.push({ job, rows });
            success++;
          } catch {
            errors[job.id] = (errors[job.id] || 0) + 1;
          }
        }
      };
      await Promise.all([worker(), worker(), worker()]);

      let cameras = get().cameras;
      for (const { job, rows } of changes) {
        cameras = cameras.filter((c) => !(c.source === job.id && (!job.district || c.district === job.district)));
        cameras = mergeCameras(cameras, rows);
      }
      const sourceStates = { ...get().sourceStates };
      for (const id of ["tfl", "singapore", "caltrans"]) {
        sourceStates[id] = errors[id] ? "Some requests failed · kept cached records" : `Refreshed ${formatShortUtc(now)}`;
      }
      set({ sourceStates, refreshing: false, ...(success ? { catalogTime: now } : {}) });
      setCameras(cameras);
      notify(`${success}/${jobs.length} catalog requests refreshed. Failed or blocked sources retain bundled records.`);
    },

    async importCatalog(file) {
      try {
        if (file.size > 30 * 1024 * 1024) throw new Error("Use a catalog smaller than 30 MB.");
        const rows = normalizeImport(JSON.parse(await file.text()));
        setCameras(mergeCameras(get().cameras, rows));
        notify(`${rows.length.toLocaleString()} records imported for this session.`);
      } catch (error) {
        notify((error as Error).message);
      }
    },

    addFeed(form) {
      try {
        const url = form.get("url");
        if (!httpsUrl(url)) throw new Error("Use an HTTPS URL without embedded credentials.");
        const [row] = normalizeImport([
          {
            id: `custom-${crypto.randomUUID()}`,
            name: form.get("name"),
            city: form.get("city"),
            country: form.get("country"),
            lat: form.get("lat"),
            lng: form.get("lng"),
            type: form.get("type"),
            url,
            provider: form.get("provider"),
          },
        ]);
        const camera: Camera = {
          ...row,
          source: "custom",
          category: row.type === "youtube" ? "City view" : "Public camera",
          image: row.type === "youtube" ? `https://i.ytimg.com/vi/${youtubeId(row.url)}/hqdefault.jpg` : row.image,
        };
        setCameras(mergeCameras(get().cameras, [camera]));
        set({ country: "all", query: "", filter: "all", ...resetPage });
        void get().select(camera.id);
        notify("Feed added to this session. Export your catalog to keep it.");
        return null;
      } catch (error) {
        return (error as Error).message;
      }
    },

    exportCatalog() {
      const { cameras, atlas } = get();
      const loaded = cameras.filter((c) => c.url && isValidCamera(c));
      downloadJson("worldlens-loaded-camera-feeds.json", {
        generatedAt: new Date().toISOString(),
        cameras: loaded,
        atlasReference: atlas
          ? {
              source: ARGUS_URL,
              snapshot: atlas.generated,
              indexedRecords: atlas.audit.addedRecords,
              note: "Only resolved supported feeds are included in this export. The complete bundled index and detail shards are available in the source download.",
            }
          : null,
      });
      notify(`Exported ${loaded.length.toLocaleString()} loaded media records; unloaded index references are not expanded.`);
    },

    async discoverYoutube(key) {
      if (!key) {
        set({
          discoveryStatus:
            "Enter your YouTube Data API key to discover new broadcasts. The curated broadcasts need no key.",
        });
        return;
      }
      const globe = getGlobe();
      if (!globe) return;
      const centre = globe.getCenter();
      set({
        discovering: true,
        discoveryStatus: `Searching active, embeddable broadcasts within 500 km of ${centre.lat.toFixed(2)}, ${centre.lng.toFixed(2)}…`,
      });
      try {
        const rows = await discoverYoutubeBroadcasts(centre, key);
        if (rows === null) {
          set({
            discoveryStatus:
              "No geotagged live webcams were returned in this area. Most YouTube broadcasts do not publish coordinates.",
          });
          return;
        }
        setCameras(mergeCameras(get().cameras, rows));
        set({
          discoveryStatus: `Added or refreshed ${rows.length} geotagged broadcasts. Search returns up to 50 results per request, not a complete global directory.`,
        });
      } catch {
        set({
          discoveryStatus:
            "YouTube discovery failed. Check that the Data API is enabled, your browser-key restrictions allow this origin, and quota remains.",
        });
      } finally {
        set({ discovering: false });
      }
    },

    async openWall() {
      get().stopMedia();
      const { selectedId, saved, cameras, atlas } = get();
      const ids = [selectedId, ...saved, ...cameras.filter((c) => c.type === "youtube").map((c) => c.id)];
      const rows = [...new Set(ids)]
        .map((id) => findCamera(cameras, id))
        .filter((c): c is Camera => !!c)
        .slice(0, 4);
      const resolved = await Promise.all(
        rows.map((c) => (c.catalogOnly && atlas ? hydrateCamera(c, atlas).catch(() => c) : c)),
      );
      set({ wallCameras: resolved });
      useShellStore.getState().openDialog("wall");
    },

    closeWall: () => set({ wallCameras: [] }),
  };
});

/** Pure filter used by the directory list (with viewport) and the globe (without). */
export function filterCameras(
  state: Pick<CameraState, "cameras" | "filter" | "query" | "country" | "inView" | "directOnly" | "saved">,
  isInView?: (lat: number, lng: number) => boolean,
): Camera[] {
  const q = state.query.trim().toLowerCase();
  const { filter, country, directOnly, saved } = state;
  return state.cameras.filter(
    (c) =>
      (filter === "all" ||
        (filter === "youtube" && c.type === "youtube") ||
        (filter === "traffic" && c.category === "Traffic") ||
        (filter === "saved" && saved.has(c.id))) &&
      (!directOnly || c.directEligible === true || (c.source !== "argus" && c.status !== "provider-unavailable")) &&
      (country === "all" || c.country === country) &&
      (!q || `${c.name} ${c.city} ${c.country} ${c.provider}`.toLowerCase().includes(q)) &&
      (!isInView || !state.inView || isInView(c.lat, c.lng)),
  );
}

export const selectCurrentCamera = (s: CameraState) => findCamera(s.cameras, s.selectedId);

export const DESTINATIONS: Record<string, { label: string; center?: [number, number]; zoom?: number }> = {
  world: { label: "World", center: [19, 18], zoom: 2 },
  london: { label: "London", center: [51.507, -0.12], zoom: 11 },
  california: { label: "California", center: [36.7, -119.8], zoom: 6 },
  singapore: { label: "Singapore", center: [1.35, 103.82], zoom: 11 },
  youtube: { label: "YouTube around the world ↗" },
};

export type { FeedType };
