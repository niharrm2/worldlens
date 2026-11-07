import type { Ship } from "@/types/ships";

/** Vessels slower than this are drawn as stationary. */
export const MOVING_KNOTS = 0.5;

export const isMoving = (s: Ship) => (s.speed ?? 0) >= MOVING_KNOTS;

/** Direction to draw the hull: true heading, else course over ground. */
export const shipBearing = (s: Ship) => s.heading ?? s.course ?? 0;

export const shipLabel = (s: Ship) => s.name || `MMSI ${s.mmsi}`;

export const speedText = (s: Ship) => (s.speed == null ? "Speed unavailable" : `${s.speed.toFixed(1)} kn`);
