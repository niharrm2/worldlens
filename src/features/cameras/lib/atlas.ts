/** Argus historical camera index: columnar index → camera rows, plus lazy detail hydration. */
import { fetchJson } from "@/lib/http";

import type { AtlasDetailChunk, AtlasIndex, AtlasLabels, Camera, FeedType } from "../types";
import { httpsUrl, youtubeId } from "./camera-core";

export const ATLAS_INDEX_URL = "/data/atlas/index.json";
export const ATLAS_LABELS_URL = "/data/atlas/labels.json";
const ATLAS_DETAILS_URL = "/data/atlas/details/";
export const ARGUS_URL = "https://github.com/GoSlowPoke168/Argus";

const COUNTRY_ALIASES: Record<string, string> = {
  USA: "US", Alaska: "US", Texas: "US", "New Mexico": "US", Oregon: "US",
  "Eastern DRC": "CD", "the Democratic Republic of Congo": "CD", "South Africa": "ZA",
  "Costa Rica": "CR", Italy: "IT", Kenya: "KE", Germany: "DE", Bangladesh: "BD",
  Indonesia: "ID", Panama: "PA",
};

const countryCache = new Map<string, string>();
let regionNames: Intl.DisplayNames | null = null;

function countryName(code: string): string {
  const cached = countryCache.get(code);
  if (cached) return cached;
  const resolved = COUNTRY_ALIASES[code] || code;
  let name = "Unspecified";
  if (/^[A-Z]{2}$/.test(resolved || "")) {
    try {
      regionNames ??= new Intl.DisplayNames(["en"], { type: "region" });
      name = regionNames.of(resolved) || resolved;
    } catch {
      // Unknown region code.
    }
  }
  countryCache.set(code, name);
  return name;
}

const FORMAT_TYPES: Record<string, FeedType> = {
  image: "snapshot",
  "image/jpeg": "snapshot",
  mjpeg: "snapshot",
  m3u8: "hls",
  mp4: "mp4",
};

function atlasType(index: AtlasIndex, i: number): FeedType {
  if ((index.youtube as Record<number, unknown> | undefined)?.[i]) return "youtube";
  return FORMAT_TYPES[index.ftDict[index.ft[i]]] || "external";
}

export function buildAtlasRows(d: AtlasIndex): Camera[] {
  return d.keep.map((i) => {
    const provider = d.srcDict[d.src[i]].replace(/^opencctv_/, "").replace(/_/g, " ");
    return {
      id: `atlas-${i}`,
      upstreamIndex: i,
      name: `Camera · ${provider}`,
      city: "",
      country: countryName(d.ccDict[d.cc[i]]),
      lat: d.lat[i],
      lng: d.lon[i],
      type: atlasType(d, i),
      url: "",
      image: "",
      provider,
      source: "argus",
      category: /traffic|dot|511|highway|road|cctv|caltrans|tfl|lta/i.test(provider) ? "Traffic" : "Public camera",
      checkedAt: d.generated,
      status: "historical-index",
      directEligible: d.eligible[i] === 1,
      catalogOnly: true,
      locationPrecision: "Approximate upstream index coordinates (rounded to about 0.01°)",
      sourceUrl: ARGUS_URL,
      note: `Historical public-source index from ${d.generated.slice(0, 10)}. Direct-listed flags are not current playback checks.`,
    };
  });
}

export async function loadAtlasLabels(index: AtlasIndex): Promise<AtlasLabels> {
  const labels = await fetchJson<AtlasLabels>(ATLAS_LABELS_URL, 40_000);
  if (labels.count !== index.count || labels.generated !== index.generated) {
    throw new Error("Index/label snapshot mismatch");
  }
  return labels;
}

/** Return a copy of `camera` with its atlas label applied. */
export function applyAtlasLabel(camera: Camera, labels: AtlasLabels): Camera {
  const i = camera.upstreamIndex!;
  return { ...camera, name: labels.name[i] || camera.name, city: labels.cityDict[labels.city[i]] || "" };
}

export function atlasAuditText(index: AtlasIndex): string {
  const a = index.audit;
  return `Argus snapshot: ${index.generated.slice(0, 10)} · ${a.upstreamRecords.toLocaleString()} upstream records → ${a.addedRecords.toLocaleString()} added after URL/ID deduplication and input checks. ${a.directListedCandidates.toLocaleString()} imported entries have direct HTTPS media candidates; these have not all been health-checked. Other entries expose the original source only. Coordinates are approximate. Imported ${new Date(index.importedAt).toLocaleDateString("en-GB")}.`;
}

const detailCache = new Map<number, Promise<AtlasDetailChunk>>();

/** Resolve media details for an index-only atlas camera. Returns a new camera object. */
export async function hydrateCamera(camera: Camera, index: AtlasIndex): Promise<Camera> {
  if (!camera.catalogOnly) return camera;
  const upstream = camera.upstreamIndex!;
  const chunk = Math.floor(upstream / index.chunk);
  let pending = detailCache.get(chunk);
  if (!pending) {
    pending = fetchJson<AtlasDetailChunk>(`${ATLAS_DETAILS_URL}${chunk}.json`, 20_000);
    detailCache.set(chunk, pending);
    if (detailCache.size > 15) detailCache.delete(detailCache.keys().next().value!);
  }
  let detail: AtlasDetailChunk;
  try {
    detail = await pending;
  } catch (error) {
    detailCache.delete(chunk);
    throw error;
  }
  const j = upstream - detail.from;
  if (j < 0 || j >= detail.id.length) throw new Error("Camera detail index mismatch");

  const c: Camera = { ...camera, upstreamId: detail.id[j] };
  const feed = detail.feed[j] || "";
  const stream = detail.stream[j] || "";
  const id = youtubeId(feed) || youtubeId(stream);
  c.sourceUrl = feed || stream || c.sourceUrl;
  c.mediaReady = false;
  if (id) {
    c.type = "youtube";
    c.url = `https://www.youtube.com/watch?v=${id}`;
    c.image = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    c.mediaReady = true;
  } else if (c.directEligible && (["hls", "mp4", "snapshot"] as FeedType[]).includes(c.type)) {
    c.url = httpsUrl(stream) || httpsUrl(feed);
    c.image =
      c.type === "snapshot" ? httpsUrl(feed) : /\.(?:jpe?g|png|webp)(?:\?|$)/i.test(feed) ? httpsUrl(feed) : "";
    c.mediaReady = !!c.url;
  }
  if (!c.mediaReady) c.type = "external";
  c.refreshInterval = Math.max(60_000, Number(detail.ur[j]) || 60_000);
  c.catalogOnly = false;
  return c;
}
