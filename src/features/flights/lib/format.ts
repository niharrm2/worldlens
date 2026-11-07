import type { Aircraft } from "@/types/flights";

export const flightLabel = (a: Aircraft) => a.callsign || a.registration || a.id.toUpperCase();

export const altitudeText = (a: Aircraft, unavailable = "Altitude unavailable") =>
  a.ground ? "Ground" : a.altitude == null ? unavailable : `${a.altitude.toLocaleString()} ft`;

export function ageText(seconds: number) {
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
