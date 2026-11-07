import type { Camera } from "@/features/cameras/types";
import type { OrbitPathPoint, SatellitePoint, SatellitePosition } from "@/features/satellites/types";
import type { Aircraft } from "@/types/flights";
import type { Ship } from "@/types/ships";

import type { OverlaySpec } from "./overlays";

export type LatLng = readonly [lat: number, lng: number];

export interface FlyOptions {
  /** Seconds. */
  duration?: number;
}

export interface GlobeHover {
  text: string;
  x: number;
  y: number;
}

/** Events raised by an engine back to the application. */
export interface GlobeEvents {
  onCameraSelect(id: string): void;
  onSatelliteSelect(id: number): void;
  onFlightSelect(id: string): void;
  onShipSelect(id: string): void;
  onOverlaySelect(overlay: string, item: string): void;
  /** Click on the globe surface where no marker was hit. */
  onGlobeClick(lat: number, lng: number): void;
  onMoveEnd(): void;
  onViewCount(count: number): void;
  onHover(hover: GlobeHover | null): void;
  onError(message: string): void;
}

export interface SatelliteLayerData {
  points: SatellitePoint[];
  selectedId: number | null;
  /** Fresher position for the selected satellite (updated every second). */
  selectedPosition: SatellitePosition | null;
  path: OrbitPathPoint[];
}

/** Rendering backend for the interactive globe (Cesium WebGL or 2D canvas fallback). */
export interface GlobeEngine {
  readonly kind: "cesium" | "canvas";
  setCameraRows(rows: Camera[], selectedId: string | null): void;
  setCameraVisibility(show: boolean): void;
  setSatellites(data: SatelliteLayerData): void;
  setFlights(aircraft: Aircraft[], selectedId: string | null): void;
  setShips(ships: Ship[], selectedId: string | null): void;
  /** Add, replace or (with null) remove a named overlay. */
  setOverlay(key: string, spec: OverlaySpec | null): void;
  flyTo(target: LatLng, zoom?: number, options?: FlyOptions): void;
  setView(target: LatLng, zoom: number): void;
  zoomBy(delta: number): void;
  toggleTilt(): void;
  setNight(night: boolean): void;
  getZoom(): number;
  getCenter(): { lat: number; lng: number };
  isInView(lat: number, lng: number): boolean;
  resize(): void;
  destroy(): void;
}

export const WORLD_VIEW = { center: [19, 18] as LatLng, zoom: 2 };
export const ORBIT_VIEW = { center: [15, 18] as LatLng, zoom: -0.4 };
