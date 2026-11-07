import type { FeedType } from "@/features/cameras/types";

/** Inner SVG markup for each feed type, drawn on a 24×24 grid. */
export const FEED_ICON_PATHS: Record<FeedType, string> = {
  youtube: '<rect x="3" y="5" width="18" height="14" rx="5"/><path d="m10 9 6 3-6 3Z"/>',
  hls: '<rect x="3" y="6" width="12" height="12" rx="3"/><path d="m15 10 6-3v10l-6-3M7 10v4m4-5v6"/>',
  mp4: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 9 5 3-5 3ZM3 8h18M7 4v4m10-4v4"/>',
  snapshot: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="9" r="1.5"/><path d="m3 17 6-5 4 3 3-4 5 6"/>',
  external:
    '<path d="M14 4h6v6m0-6L10 14m0-9H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4"/>',
};

export const FEED_COLORS: Record<FeedType, string> = {
  youtube: "#ff7386",
  hls: "#60e1d1",
  mp4: "#b59aff",
  snapshot: "#ffca76",
  external: "#9eafc7",
};

export const FEED_LABELS: Record<FeedType, string> = {
  youtube: "YouTube",
  hls: "Stream",
  mp4: "Clip",
  snapshot: "Snapshot",
  external: "Source link",
};

export const FEED_TYPES = Object.keys(FEED_ICON_PATHS) as FeedType[];

const asFeedType = (type: string): FeedType => (type in FEED_ICON_PATHS ? (type as FeedType) : "external");

const markerCache = new Map<string, string>();

/** Globe pin image (data URI) for a feed or a cluster of `count` feeds. */
export function feedMarker(type: string, count: number, selected: boolean): string {
  const t = asFeedType(type);
  const label = count > 999 ? `${Math.round(count / 100) / 10}k` : String(count);
  const key = [t, count > 1 ? label : "", selected].join(":");
  const cached = markerCache.get(key);
  if (cached) return cached;

  const color = selected ? "#eeffb1" : FEED_COLORS[t];
  const content =
    count > 1
      ? `<text x="24" y="26" dominant-baseline="middle" text-anchor="middle" fill="${color}" font-family="sans-serif" font-size="13" font-weight="700">${label}</text>`
      : `<g transform="translate(12 12)" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${FEED_ICON_PATHS[t]}</g>`;
  const image =
    "data:image/svg+xml;base64," +
    btoa(
      `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="56" viewBox="0 0 48 56"><path d="M24 53 18 44H14a10 10 0 0 1-10-10V14A10 10 0 0 1 14 4h20a10 10 0 0 1 10 10v20a10 10 0 0 1-10 10H30Z" fill="#0a1929" stroke="${color}" stroke-width="${selected ? 3 : 1.5}"/><rect x="8" y="8" width="32" height="32" rx="9" fill="${color}" opacity=".1"/>${content}</svg>`,
    );
  markerCache.set(key, image);
  return image;
}
