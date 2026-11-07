import type { Camera } from "../types";

export function feedKind(c: Pick<Camera, "type">): string {
  switch (c.type) {
    case "external": return "Source page";
    case "youtube": return "YouTube";
    case "snapshot": return "Snapshot";
    case "mp4": return "Video clip";
    default: return "HLS video";
  }
}

export const badgeClass = (c: Camera) => (c.type === "youtube" ? "youtube" : "traffic");

export const cameraLocation = (c: Camera) => (c.city ? `${c.city}, ` : "") + c.country;

export function cameraCoordinates(c: Camera): string {
  const approx = c.source === "argus";
  const digits = approx ? 2 : 4;
  return `${c.lat.toFixed(digits)}°, ${c.lng.toFixed(digits)}°${approx ? " · approx." : ""}`;
}

const COUNTRY_ZONES: Record<string, string> = {
  "United Kingdom": "Europe/London",
  Singapore: "Asia/Singapore",
};

export function localClock(c: Camera): string {
  const timeZone = c.timeZone || COUNTRY_ZONES[c.country];
  if (!timeZone) return "";
  try {
    return new Date().toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" }) + " local";
  } catch {
    return "";
  }
}

export function posterStatus(c: Camera, checked: string): string {
  if (c.type === "youtube") {
    return c.status === "live-at-check"
      ? `Live at catalog check: ${checked}. Open player to check now.`
      : "Historical YouTube reference · current live status is unknown.";
  }
  return c.status === "provider-unavailable"
    ? "Provider marked this camera unavailable; you can still try it."
    : "Provider-listed feed · current playback not yet checked.";
}
