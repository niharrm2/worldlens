import { create } from "zustand";

import { getGlobe } from "@/features/globe/store";
import { useShellStore } from "@/features/shell/store";
import { shipCategory } from "@/lib/ais";
import type { Ship, ShipCategory, ShipDetail, ShipsResponse } from "@/types/ships";

import { isMoving } from "./lib/format";

const SHIPS_URL = "/api/ships";
const POLL_MS = 30_000;
const RETRY_MS = 60_000;
export const SHIP_PAGE_SIZE = 60;

/** Default framing when opening the ships layer. */
export const SHIPS_VIEW = { center: [35, 10] as const, zoom: 2.3 };

export type ShipCategoryFilter = "all" | ShipCategory;

interface ShipState {
  ships: Ship[];
  lastData: ShipsResponse | null;
  failed: boolean;
  selectedId: string | null;
  detail: ShipDetail | null;
  detailLoading: boolean;
  loading: boolean;
  paused: boolean;
  query: string;
  category: ShipCategoryFilter;
  movingOnly: boolean;
  limit: number;
  statusText: string;

  refresh(): Promise<void>;
  schedule(delay?: number): void;
  cancel(): void;
  select(id: string): void;
  togglePause(): void;
  setQuery(query: string): void;
  setCategory(category: ShipCategoryFilter): void;
  setMovingOnly(value: boolean): void;
  showMore(): void;
  locateSelected(): void;
}

let timer: ReturnType<typeof setTimeout> | undefined;
const isActive = () => useShellStore.getState().mode === "ships";

/** Expand compact wire rows into ship summaries (ages are relative to `assembledAt`). */
function decode(data: ShipsResponse): Ship[] {
  return data.rows.map(([mmsi, lat, lng, speed, course, heading, shipType, age, name]) => ({
    id: String(mmsi),
    mmsi,
    lat,
    lng,
    speed,
    course,
    heading,
    shipType,
    category: shipCategory(shipType),
    name,
    positionTime: data.assembledAt - age * 1000,
  }));
}

function statusLine(data: ShipsResponse): string {
  const { aisstream, digitraffic } = data.sources;
  return `Worldwide: ${aisstream.message} (${aisstream.count.toLocaleString()} vessels). Finland: ${
    digitraffic.message
  } (${digitraffic.count.toLocaleString()}). Snapshot ${new Date(data.assembledAt).toUTCString()}.`;
}

async function loadDetail(id: string) {
  try {
    const response = await fetch(`/api/ships/${id}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    const detail = response.ok ? ((await response.json()) as ShipDetail) : null;
    if (useShipStore.getState().selectedId === id) useShipStore.setState({ detail, detailLoading: false });
  } catch {
    if (useShipStore.getState().selectedId === id) useShipStore.setState({ detailLoading: false });
  }
}

export const useShipStore = create<ShipState>((set, get) => ({
  ships: [],
  lastData: null,
  failed: false,
  selectedId: null,
  detail: null,
  detailLoading: false,
  loading: false,
  paused: false,
  query: "",
  category: "all",
  movingOnly: false,
  limit: SHIP_PAGE_SIZE,
  statusText: "Connecting to worldwide AIS…",

  async refresh() {
    if (!isActive() || get().paused || document.hidden || get().loading) return;
    set({ loading: true });
    // Only the first load shows the top loader; background refreshes stay silent.
    if (!get().lastData) useShellStore.getState().startLoading("ships", "ship positions");
    let delay = POLL_MS;
    try {
      const response = await fetch(SHIPS_URL, { signal: AbortSignal.timeout(30_000), cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as ShipsResponse;
      if (!Array.isArray(data.rows)) throw new Error("Invalid feed");
      set({
        ships: decode(data),
        lastData: data,
        failed: !data.sources.aisstream.ok && !data.sources.digitraffic.ok,
        statusText: statusLine(data),
      });
      // The worldwide table fills quickly after the stream connects; poll sooner at first.
      if (data.rows.length < 5000) delay = 10_000;
      const { selectedId } = get();
      if (selectedId) void loadDetail(selectedId);
    } catch {
      delay = RETRY_MS;
      set({
        failed: true,
        statusText: `Vessel service unavailable. Retrying in 60s. ${
          get().ships.length ? "Keeping the last positions." : "No positions loaded."
        }`,
      });
    } finally {
      set({ loading: false });
      useShellStore.getState().finishLoading("ships");
      get().schedule(delay);
    }
  },

  schedule(delay = POLL_MS) {
    clearTimeout(timer);
    if (isActive() && !get().paused && !document.hidden) timer = setTimeout(() => void get().refresh(), delay);
  },

  cancel: () => clearTimeout(timer),

  select(id) {
    set({ selectedId: id, detail: null, detailLoading: true });
    useShellStore.getState().showDetail();
    void loadDetail(id);
  },

  togglePause() {
    const paused = !get().paused;
    set({ paused, statusText: paused ? "Refresh paused. Positions are not updating." : "Resuming live feed…" });
    if (paused) clearTimeout(timer);
    else void get().refresh();
  },

  setQuery: (query) => set({ query, limit: SHIP_PAGE_SIZE }),
  setCategory: (category) => set({ category, limit: SHIP_PAGE_SIZE }),
  setMovingOnly: (movingOnly) => set({ movingOnly, limit: SHIP_PAGE_SIZE }),
  showMore: () => set({ limit: get().limit + SHIP_PAGE_SIZE }),

  locateSelected() {
    const ship = get().ships.find((s) => s.id === get().selectedId);
    if (ship) getGlobe()?.flyTo([ship.lat, ship.lng], 10, { duration: 1.2 });
  },
}));

export function matchingShips(s: Pick<ShipState, "ships" | "query" | "category" | "movingOnly">): Ship[] {
  const term = s.query.trim().toLowerCase();
  if (s.category === "all" && !s.movingOnly && !term) return s.ships;
  return s.ships.filter(
    (ship) =>
      (s.category === "all" || ship.category === s.category) &&
      (!s.movingOnly || isMoving(ship)) &&
      (!term || ship.name.toLowerCase().includes(term) || String(ship.mmsi).startsWith(term)),
  );
}
