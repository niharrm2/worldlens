import { create } from "zustand";

import { getGlobe } from "@/features/globe/store";
import { useShellStore } from "@/features/shell/store";
import type { Aircraft, FlightsResponse } from "@/types/flights";

const FLIGHTS_URL = "/api/flights";
const POLL_MS = 20_000;
const RETRY_MS = 60_000;
export const FLIGHT_PAGE_SIZE = 60;

interface FlightState {
  aircraft: Aircraft[];
  lastData: FlightsResponse | null;
  /** True after a failed refresh until the next successful one. */
  failed: boolean;
  selectedId: string | null;
  loading: boolean;
  paused: boolean;
  query: string;
  includeCached: boolean;
  includeGround: boolean;
  limit: number;
  statusText: string;
  /** Reference time for position ages in lists; ticks every 15 s. */
  now: number;

  refresh(): Promise<void>;
  schedule(delay?: number): void;
  cancel(): void;
  select(id: string): void;
  togglePause(): void;
  setQuery(query: string): void;
  setIncludeCached(value: boolean): void;
  setIncludeGround(value: boolean): void;
  showMore(): void;
  locateSelected(): void;
  touch(): void;
}

let timer: ReturnType<typeof setTimeout> | undefined;
const isActive = () => useShellStore.getState().mode === "flights";

export const useFlightStore = create<FlightState>((set, get) => ({
  aircraft: [],
  lastData: null,
  failed: false,
  selectedId: null,
  loading: false,
  paused: false,
  query: "",
  includeCached: true,
  includeGround: true,
  limit: FLIGHT_PAGE_SIZE,
  statusText: "Connecting to the worldwide feed…",
  now: Date.now(),

  async refresh() {
    if (!isActive() || get().paused || document.hidden || get().loading) return;
    set({ loading: true });
    // Only the first load shows the top loader; background refreshes stay silent.
    if (!get().lastData) useShellStore.getState().startLoading("flights", "live flights");
    let delay = POLL_MS;
    try {
      const response = await fetch(FLIGHTS_URL, { signal: AbortSignal.timeout(25_000), cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as FlightsResponse;
      if (!Array.isArray(data.aircraft)) throw new Error("Invalid feed");
      const scan = data.scan;
      set({
        aircraft: data.aircraft,
        lastData: data,
        failed: false,
        now: Date.now(),
        statusText:
          `${scan?.error ? `${scan.error} ` : "Rolling worldwide scan · "}${scan?.completedRegions || 0} / ${scan?.totalRegions || 0} regions visited · cache 20s. ` +
          (data.observedAt ? `Last received ${new Date(data.observedAt).toUTCString()}` : "Waiting for first region."),
      });
    } catch {
      delay = RETRY_MS;
      set({
        failed: true,
        now: Date.now(),
        statusText: `Local flight service unavailable. Retrying in 60s. ${
          get().aircraft.length ? "Retaining cached positions with their original ages." : "No positions loaded."
        }`,
      });
    } finally {
      set({ loading: false });
      useShellStore.getState().finishLoading("flights");
      get().schedule(delay);
    }
  },

  schedule(delay = POLL_MS) {
    clearTimeout(timer);
    if (isActive() && !get().paused && !document.hidden) timer = setTimeout(() => void get().refresh(), delay);
  },

  cancel: () => clearTimeout(timer),

  select(id) {
    set({ selectedId: id });
    useShellStore.getState().showDetail();
  },

  togglePause() {
    const paused = !get().paused;
    set({
      paused,
      statusText: paused ? "Refresh paused. Position ages continue to increase." : "Resuming live feed…",
    });
    if (paused) clearTimeout(timer);
    else void get().refresh();
  },

  setQuery: (query) => set({ query, limit: FLIGHT_PAGE_SIZE }),
  setIncludeCached: (includeCached) => set({ includeCached }),
  setIncludeGround: (includeGround) => set({ includeGround }),
  showMore: () => set({ limit: get().limit + FLIGHT_PAGE_SIZE }),

  locateSelected() {
    const a = get().aircraft.find((x) => x.id === get().selectedId);
    if (a) getGlobe()?.flyTo([a.lat, a.lng], 7, { duration: 1.2 });
  },

  touch: () => set({ now: Date.now() }),
}));

/** Positions within the retention window chosen by the user. */
export function recentAircraft(s: Pick<FlightState, "aircraft" | "includeCached" | "now">): Aircraft[] {
  const window = s.includeCached ? 3_600_000 : 300_000;
  return s.aircraft.filter((a) => s.now - a.positionTime <= window);
}

export function matchingAircraft(
  s: Pick<FlightState, "aircraft" | "includeCached" | "includeGround" | "query" | "now">,
): Aircraft[] {
  const term = s.query.trim().toLowerCase();
  return recentAircraft(s).filter(
    (a) =>
      (s.includeGround || !a.ground) &&
      (!term || `${a.callsign} ${a.registration} ${a.id}`.toLowerCase().includes(term)),
  );
}
