import type { BadgeShape, GlyphId } from "@/lib/icons/map-glyphs";

/**
 * Declarative overlay descriptions. Features build these from their data; each globe engine
 * decides how to draw them. The canvas fallback supports points, cells and arrows only.
 */

export interface OverlayPoint {
  id?: string;
  lat: number;
  lng: number;
  /** Metres above the surface. */
  alt?: number;
  /** Pixels. */
  size: number;
  /** CSS colour (alpha allowed). */
  color: string;
  outline?: string;
  /** Animate a gentle pulse (e.g. very recent earthquakes). */
  pulse?: boolean;
  label?: string;
  /** Draw as an icon badge (glyph on `color`) instead of a plain dot; `size` is the badge size. */
  icon?: { glyph: GlyphId; shape?: BadgeShape; selected?: boolean };
}

export interface OverlayCell {
  id?: string;
  /** Cell centre. */
  lat: number;
  lng: number;
  color: string;
  label?: string;
}

export interface OverlayArrow {
  lat: number;
  lng: number;
  /** Degrees clockwise from north the arrow points to. */
  bearing: number;
  color: string;
  /** Pixels. */
  size: number;
}

/** Wind or current vector at a grid cell centre (m/s, east and north components). */
export interface VectorSample {
  lat: number;
  lng: number;
  u: number;
  v: number;
}

export type OverlaySpec =
  | { kind: "points"; points: OverlayPoint[] }
  | { kind: "cells"; step: number; opacity: number; cells: OverlayCell[] }
  | { kind: "arrows"; arrows: OverlayArrow[] }
  | {
      kind: "tiles";
      url: string;
      maxLevel: number;
      opacity: number;
      credit: string;
      /** Geographic (EPSG:4326, 512 px) tiles instead of Web Mercator — needed to reach the poles. */
      geographic?: boolean;
    }
  /** One equirectangular image over a lon/lat rectangle (degrees). */
  | { kind: "image"; url: string; west: number; south: number; east: number; north: number; opacity: number; credit: string }
  /** Sunlit/night shading of the globe for `time` (epoch ms). */
  | { kind: "lighting"; time: number }
  | { kind: "frames"; urls: string[]; frame: number; maxLevel: number; opacity: number; credit: string }
  | { kind: "particles"; step: number; samples: VectorSample[]; color: string };

/** Pick payload attached to selectable overlay items. */
export interface OverlayPickId {
  overlay: string;
  item: string;
  label?: string;
}

export const isOverlayPick = (id: unknown): id is OverlayPickId =>
  !!id && typeof id === "object" && "overlay" in id && "item" in id;

/** Bilinear lookup over a regular lat/lng grid of vectors (missing cells count as calm). */
export function createVectorField(step: number, samples: VectorSample[]) {
  const lat0 = Math.min(...samples.map((s) => s.lat));
  const lng0 = Math.min(...samples.map((s) => s.lng));
  const rows = Math.round((Math.max(...samples.map((s) => s.lat)) - lat0) / step) + 1;
  const cols = Math.round(360 / step);
  const u = new Float32Array(rows * cols);
  const v = new Float32Array(rows * cols);
  for (const s of samples) {
    const r = Math.round((s.lat - lat0) / step);
    const c = ((Math.round((s.lng - lng0) / step) % cols) + cols) % cols;
    u[r * cols + c] = s.u;
    v[r * cols + c] = s.v;
  }
  const at = (r: number, c: number, arr: Float32Array) =>
    r < 0 || r >= rows ? 0 : arr[r * cols + (((c % cols) + cols) % cols)];
  return {
    latMin: lat0 - step / 2,
    latMax: lat0 + (rows - 0.5) * step,
    sample(lat: number, lng: number): [number, number] {
      const y = (lat - lat0) / step;
      const x = (lng - lng0) / step;
      const r = Math.floor(y), c = Math.floor(x);
      const fy = y - r, fx = x - c;
      const lerp = (arr: Float32Array) =>
        (at(r, c, arr) * (1 - fx) + at(r, c + 1, arr) * fx) * (1 - fy) +
        (at(r + 1, c, arr) * (1 - fx) + at(r + 1, c + 1, arr) * fx) * fy;
      return [lerp(u), lerp(v)];
    },
  };
}
