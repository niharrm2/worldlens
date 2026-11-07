/** Public provider catalogues that can be refreshed from the browser. */
import type { Camera } from "../types";
import { normalizeCaltrans, normalizeSingapore, normalizeTfl } from "./camera-core";

export interface RefreshJob {
  id: "tfl" | "singapore" | "caltrans";
  district?: number;
  url: string;
  normalize: (data: never) => Camera[];
}

export const SINGAPORE_TRAFFIC_URL = "https://api.data.gov.sg/v1/transport/traffic-images";

export function refreshJobs(now: string): RefreshJob[] {
  return [
    { id: "tfl", url: "https://api.tfl.gov.uk/Place/Type/JamCam", normalize: (d: never) => normalizeTfl(d, now) },
    { id: "singapore", url: SINGAPORE_TRAFFIC_URL, normalize: (d: never) => normalizeSingapore(d, now) },
    ...Array.from({ length: 12 }, (_, i): RefreshJob => ({
      id: "caltrans",
      district: i + 1,
      url: `https://cwwp2.dot.ca.gov/data/d${i + 1}/cctv/cctvStatusD${String(i + 1).padStart(2, "0")}.json`,
      normalize: (d: never) => normalizeCaltrans((d as { data: never }).data, now),
    })),
  ];
}

export const SOURCE_CARDS = [
  { id: "tfl", name: "Transport for London", description: "London traffic snapshots and short clips.", url: "https://tfl.gov.uk/info-for/open-data-users/our-open-data" },
  { id: "caltrans", name: "Caltrans · 12 districts", description: "California highway video listings and snapshots.", url: "https://cwwp2.dot.ca.gov/documentation/cctv/cctv.htm" },
  { id: "singapore", name: "LTA / data.gov.sg", description: "Singapore traffic images, when supplied by the API.", url: "https://data.gov.sg/collections/354/view" },
  { id: "youtube", name: "YouTube · curated broadcasts", description: "Live and embeddable when checked; approximate place markers.", url: "https://www.youtube.com/" },
] as const;
