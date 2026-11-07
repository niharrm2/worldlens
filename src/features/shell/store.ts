import { create } from "zustand";

import { resizeGlobe } from "@/features/globe/store";

export type AppMode = "cameras" | "satellites" | "flights" | "ships" | "earth" | "movement";
export type DialogId = "sources" | "feed" | "wall";

interface ShellState {
  mode: AppMode;
  /** Panels open on demand (dock buttons, clicks on the globe). Kept for the layout CSS. */
  panelsEnabled: boolean;
  directoryOpen: boolean;
  detailOpen: boolean;
  toolsOpen: boolean;
  dialog: DialogId | null;
  /** Hide every data layer and marker, leaving the bare globe. */
  globeOnly: boolean;
  /** In-app full screen (all controls hidden) — used when browser full screen is unavailable. */
  immersive: boolean;
  toastText: string;
  /** In-progress first loads: key → human label ("ships", "earthquakes"…). */
  loadingTasks: Record<string, string>;
  toastVisible: boolean;

  setMode(mode: AppMode): void;
  showDirectory(open?: boolean): void;
  showDetail(): void;
  closeDirectory(): void;
  closeDetail(): void;
  toggleTools(): void;
  hidePanels(): void;
  openDialog(dialog: DialogId): void;
  closeDialog(): void;
  toggleGlobeOnly(): void;
  setImmersive(on: boolean): void;
  notify(text: string): void;
  startLoading(key: string, label: string): void;
  finishLoading(key: string): void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useShellStore = create<ShellState>((set, get) => ({
  mode: "cameras",
  panelsEnabled: true,
  directoryOpen: false,
  detailOpen: false,
  toolsOpen: false,
  dialog: null,
  globeOnly: false,
  immersive: false,
  toastText: "",
  loadingTasks: {},
  toastVisible: false,

  setMode: (mode) => set({ mode }),

  showDirectory(open = true) {
    set({ directoryOpen: get().panelsEnabled && open });
    resizeGlobe();
  },

  showDetail() {
    if (!get().panelsEnabled) return;
    set({ detailOpen: true, ...(window.innerWidth < 760 ? { directoryOpen: false } : {}) });
    resizeGlobe();
  },

  closeDirectory() {
    set({ directoryOpen: false });
    resizeGlobe();
  },

  closeDetail() {
    set({ detailOpen: false });
    resizeGlobe();
  },

  toggleTools() {
    if (get().panelsEnabled) set({ toolsOpen: !get().toolsOpen });
  },

  hidePanels() {
    set({ directoryOpen: false, detailOpen: false, toolsOpen: false });
    resizeGlobe();
  },

  openDialog(dialog) {
    if (get().panelsEnabled) set({ dialog });
  },

  closeDialog: () => set({ dialog: null }),

  toggleGlobeOnly() {
    const globeOnly = !get().globeOnly;
    set({ globeOnly });
    if (globeOnly) get().hidePanels();
  },

  setImmersive(immersive) {
    set({ immersive });
    if (immersive) get().hidePanels();
    else resizeGlobe();
  },

  notify(text) {
    set({ toastText: text, toastVisible: true });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toastVisible: false }), 5000);
  },

  startLoading(key, label) {
    if (get().loadingTasks[key] !== label) set({ loadingTasks: { ...get().loadingTasks, [key]: label } });
  },

  finishLoading(key) {
    if (!(key in get().loadingTasks)) return;
    set({ loadingTasks: Object.fromEntries(Object.entries(get().loadingTasks).filter(([k]) => k !== key)) });
  },
}));

export const notify = (text: string) => useShellStore.getState().notify(text);

/** Show the top loader for `label` while `work` runs (used for first loads, not background refreshes). */
export async function trackLoading<T>(key: string, label: string, work: Promise<T>): Promise<T> {
  const shell = useShellStore.getState();
  shell.startLoading(key, label);
  try {
    return await work;
  } finally {
    useShellStore.getState().finishLoading(key);
  }
}
