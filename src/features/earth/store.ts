import { create } from "zustand";

import { useShellStore } from "@/features/shell/store";
import { getSearchParam, updateSearchParams } from "@/lib/browser";
import type {
  BalloonTrackPoint,
  EarthDataId,
  EarthDataMap,
  EarthLayerId,
  EarthPayload,
  OceanHeatPoint,
  OceanHeatVariable,
} from "@/types/earth";

import { EARTH_LAYER_IDS, EARTH_LAYERS, layerDef, type EarthLayerDef } from "./lib/layers";

export type WeatherVariable = "temperature" | "pressure";
export type AirVariable = "aqi" | "pm25" | "dust" | "ozone";
export type LoadStatus = "idle" | "loading" | "ready" | "error";

type DataState = { [K in EarthDataId]?: EarthPayload<EarthDataMap[K]> };

interface EarthState {
  enabled: EarthLayerId[];
  data: DataState;
  status: Partial<Record<EarthDataId, LoadStatus>>;
  errors: Partial<Record<EarthDataId, string>>;
  loadedAt: Partial<Record<EarthDataId, number>>;
  selected: { layer: EarthLayerId; id: string } | null;
  /** Flight trails by balloon serial (null while loading or unavailable). */
  tracks: Record<string, BalloonTrackPoint[] | null>;
  weatherVariable: WeatherVariable;
  airVariable: AirVariable;
  /** 0 = latest daily mosaic. */
  cloudsDaysAgo: number;
  rainFrame: number;
  rainPlaying: boolean;
  oceanVariable: OceanHeatVariable;
  /** 0 = latest Coral Reef Watch day. */
  oceanDaysAgo: number;
  /** 0 = latest sea-ice day. */
  seaIceDaysAgo: number;
  /** Clock for the day/night layer (epoch ms, ticks every minute while shown). */
  sunTime: number;
  /** Coral Reef Watch values at the last clicked location. */
  oceanPoint: { key: string; value: OceanHeatPoint | null; loading: boolean } | null;

  initFromUrl(): void;
  /** Query parameters describing the active group's switches. */
  urlParams(): Record<string, string | null>;
  toggle(id: EarthLayerId): void;
  /** Switch several layers on or off at once (e.g. a whole group). */
  setEnabled(ids: EarthLayerId[], on: boolean): void;
  load(id: EarthDataId, force?: boolean): Promise<void>;
  refreshDue(): void;
  select(layer: EarthLayerId, id: string): void;
  setWeatherVariable(v: WeatherVariable): void;
  setAirVariable(v: AirVariable): void;
  setCloudsDaysAgo(days: number): void;
  setRainFrame(frame: number): void;
  toggleRainPlaying(): void;
  setOceanVariable(v: OceanHeatVariable): void;
  setOceanDaysAgo(days: number): void;
  setSeaIceDaysAgo(days: number): void;
  tickSun(): void;
  /** Globe click on empty surface: location card (sun times, ocean values). */
  selectLocation(lat: number, lng: number): void;
}

/** Datasets a layer needs; layers computed in the browser (day/night) need none. */
export const layerData = (def: EarthLayerDef): EarthDataId[] => (def.local ? [] : [def.data, ...(def.extraData ?? [])]);

/** Date `daysAgo` before an ISO date (YYYY-MM-DD). */
export function shiftIsoDate(isoDate: string, daysAgo: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export const RAIN_FRAMES = 8;
export type LayerGroup = "planet" | "movement";
export const groupOf = (id: EarthLayerId): LayerGroup => layerDef(id).group ?? "planet";
const URL_PARAM: Record<LayerGroup, string> = { planet: "earth", movement: "move" };
/** Every layer starts on, so each shows its markers, legend and live status straight away. */
const DEFAULTS: Record<LayerGroup, EarthLayerId[]> = {
  planet: EARTH_LAYERS.filter((l) => (l.group ?? "planet") === "planet").map((l) => l.id),
  movement: EARTH_LAYERS.filter((l) => l.group === "movement").map((l) => l.id),
};

/** Group whose layers are live for the current dock option, if any. */
export function activeGroup(): LayerGroup | null {
  const mode = useShellStore.getState().mode;
  return mode === "earth" ? "planet" : mode === "movement" ? "movement" : null;
}

export const useEarthStore = create<EarthState>((set, get) => {
  const syncUrl = () => {
    if (activeGroup()) updateSearchParams(get().urlParams());
  };

  return {
    enabled: [...DEFAULTS.planet, ...DEFAULTS.movement],
    data: {},
    status: {},
    errors: {},
    loadedAt: {},
    selected: null,
    tracks: {},
    weatherVariable: "temperature",
    airVariable: "aqi",
    cloudsDaysAgo: 0,
    rainFrame: RAIN_FRAMES - 1,
    rainPlaying: true,
    oceanVariable: "anomaly",
    oceanDaysAgo: 0,
    seaIceDaysAgo: 0,
    sunTime: 0,
    oceanPoint: null,

    initFromUrl() {
      // Each group reads its own parameter; a missing one keeps that group's defaults.
      const enabled: EarthLayerId[] = [];
      for (const group of ["planet", "movement"] as LayerGroup[]) {
        const param = getSearchParam(URL_PARAM[group]);
        const ids =
          param === null
            ? DEFAULTS[group]
            : param.split(",").filter((x): x is EarthLayerId => EARTH_LAYER_IDS.includes(x as EarthLayerId));
        enabled.push(...ids.filter((id) => groupOf(id) === group));
      }
      set({ enabled });
    },

    urlParams() {
      const group = activeGroup();
      const params: Record<string, string | null> = { earth: null, move: null };
      // An empty value (not a missing one) keeps "all off" across reloads.
      if (group) params[URL_PARAM[group]] = get().enabled.filter((id) => groupOf(id) === group).join(",");
      return params;
    },

    toggle(id) {
      const enabled = get().enabled.includes(id) ? get().enabled.filter((x) => x !== id) : [...get().enabled, id];
      set({ enabled, ...(get().selected?.layer === id ? { selected: null } : {}) });
      syncUrl();
      if (enabled.includes(id)) for (const d of layerData(layerDef(id))) void get().load(d);
    },

    setEnabled(ids, on) {
      const current = get().enabled;
      const enabled = on ? [...current, ...ids.filter((id) => !current.includes(id))] : current.filter((id) => !ids.includes(id));
      const selected = get().selected;
      set({ enabled, ...(selected && !enabled.includes(selected.layer) ? { selected: null } : {}) });
      syncUrl();
      if (on) for (const id of ids) for (const d of layerData(layerDef(id))) void get().load(d);
    },

    async load(id, force = false) {
      if (get().status[id] === "loading") return;
      if (!force && get().status[id] === "ready") return;
      set({ status: { ...get().status, [id]: "loading" } });
      // First load of a dataset shows the top loader with the layer names that use it.
      const firstLoad = !get().data[id];
      if (firstLoad) {
        const names = EARTH_LAYERS.filter((l) => layerData(l).includes(id) && get().enabled.includes(l.id)).map((l) => l.title.toLowerCase());
        useShellStore.getState().startLoading(`earth:${id}`, names.join(" and ") || id);
      }
      try {
        const response = await fetch(`/api/earth/${id}`, { cache: "no-store", signal: AbortSignal.timeout(90_000) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
        set({
          data: { ...get().data, [id]: body },
          status: { ...get().status, [id]: "ready" },
          errors: { ...get().errors, [id]: body.stale ? body.error : "" },
          loadedAt: { ...get().loadedAt, [id]: Date.now() },
        });
      } catch (error) {
        set({
          status: { ...get().status, [id]: get().data[id] ? "ready" : "error" },
          errors: { ...get().errors, [id]: (error as Error).message || "Request failed" },
          loadedAt: { ...get().loadedAt, [id]: Date.now() },
        });
      } finally {
        if (firstLoad) useShellStore.getState().finishLoading(`earth:${id}`);
      }
    },

    /** Re-request datasets whose refresh interval has elapsed (server caches upstream). */
    refreshDue() {
      const group = activeGroup();
      if (!group || document.hidden) return;
      const { enabled, loadedAt } = get();
      for (const def of EARTH_LAYERS) {
        if (!enabled.includes(def.id) || groupOf(def.id) !== group) continue;
        for (const d of layerData(def)) {
          const at = loadedAt[d];
          if (at === undefined) void get().load(d);
          else if (Date.now() - at > def.refreshMs) void get().load(d, true);
        }
      }
    },

    select(layer, id) {
      set({ selected: { layer, id } });
      useShellStore.getState().showDetail();
      if (layer === "balloons" && !(id in get().tracks)) {
        set({ tracks: { ...get().tracks, [id]: null } });
        fetch(`/api/earth/balloons/${encodeURIComponent(id)}`, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((body: EarthPayload<BalloonTrackPoint[]> | null) => {
            if (body?.items) set({ tracks: { ...get().tracks, [id]: body.items } });
          })
          .catch(() => {});
      }
    },

    setWeatherVariable: (weatherVariable) => set({ weatherVariable }),
    setAirVariable: (airVariable) => set({ airVariable }),
    setCloudsDaysAgo: (cloudsDaysAgo) => set({ cloudsDaysAgo }),
    setRainFrame: (rainFrame) => set({ rainFrame, rainPlaying: false }),
    toggleRainPlaying: () => set({ rainPlaying: !get().rainPlaying }),
    setOceanVariable: (oceanVariable) => set({ oceanVariable, oceanDaysAgo: 0 }),
    setOceanDaysAgo: (oceanDaysAgo) => set({ oceanDaysAgo }),
    setSeaIceDaysAgo: (seaIceDaysAgo) => set({ seaIceDaysAgo }),
    tickSun: () => set({ sunTime: Math.floor(Date.now() / 60_000) * 60_000 }),

    selectLocation(lat, lng) {
      const { enabled, data, oceanDaysAgo, oceanVariable } = get();
      const sun = enabled.includes("daynight");
      const ocean = enabled.includes("oceanheat");
      if (!sun && !ocean) return;
      const id = `${lat.toFixed(3)},${lng.toFixed(3)}`;
      get().select(sun ? "daynight" : "oceanheat", id);
      const latest = data.oceanheat?.items.latest[oceanVariable];
      if (!ocean || !latest) {
        set({ oceanPoint: null });
        return;
      }
      const date = shiftIsoDate(latest, oceanDaysAgo);
      const key = `${id}@${date}`;
      set({ oceanPoint: { key, value: null, loading: true } });
      fetch(`/api/earth/oceanheat/point?lat=${lat}&lng=${lng}&date=${date}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((value: OceanHeatPoint | null) => {
          if (get().oceanPoint?.key === key) set({ oceanPoint: { key, value, loading: false } });
        })
        .catch(() => {
          if (get().oceanPoint?.key === key) set({ oceanPoint: { key, value: null, loading: false } });
        });
    },
  };
});
