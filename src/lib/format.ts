/** "06 Nov, 20:15 UTC" style timestamp, or "Not checked". */
export function formatShortUtc(value: string | number | null | undefined): string {
  const date = new Date(value ?? NaN);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("en-GB", {
        timeZone: "UTC",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }) + " UTC"
    : "Not checked";
}

/** "2026-11-06 20:15:00 UTC" style timestamp, or "Unknown". */
export function formatIsoUtc(value: string | number | null | undefined): string {
  const date = new Date(value ?? NaN);
  return Number.isFinite(date.getTime())
    ? date.toISOString().replace("T", " ").replace(".000Z", " UTC")
    : "Unknown";
}
