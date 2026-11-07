/** Validation and provider normalisation for camera records. */
import type { Camera, PlayableFeedType } from "../types";

type Row = Record<string, unknown>;

const clean = (value: unknown, max = 200) => String(value ?? "").trim().slice(0, max);

const PLAYABLE: PlayableFeedType[] = ["youtube", "hls", "mp4", "snapshot"];

/** Returns the normalised URL if it is HTTPS without embedded credentials, else "". */
export function httpsUrl(value: unknown): string {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

export function youtubeId(value: unknown): string | null {
  try {
    const url = new URL(String(value));
    const host = url.hostname.replace(/^www\./, "");
    let id: string | null | undefined;
    if (host === "youtu.be") id = url.pathname.slice(1);
    else if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
      id = url.searchParams.get("v") || url.pathname.match(/^\/(?:live|embed|shorts)\/([^/?]+)/)?.[1];
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id || "") ? id! : null;
  } catch {
    return null;
  }
}

export function isValidCamera(c: Partial<Camera> | null | undefined): c is Camera {
  return (
    !!c &&
    typeof c.id === "string" &&
    c.id.length > 0 &&
    c.id.length <= 180 &&
    typeof c.name === "string" &&
    c.name.length > 0 &&
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lng) &&
    Math.abs(c.lat!) <= 85 &&
    Math.abs(c.lng!) <= 180 &&
    PLAYABLE.includes(c.type as PlayableFeedType) &&
    !!httpsUrl(c.url) &&
    (c.type !== "youtube" || !!youtubeId(c.url))
  );
}

/** Normalise a user-imported catalogue (array, `{cameras}` or GeoJSON FeatureCollection). */
export function normalizeImport(input: unknown): Camera[] {
  const data = input as Row;
  let rows: Row[];
  if (data?.type === "FeatureCollection") {
    rows = (data.features as Row[]).map((feature) => {
      const geometry = feature.geometry as { type?: string; coordinates: number[] } | undefined;
      if (geometry?.type !== "Point") throw new Error("Imported camera GeoJSON must contain Points.");
      return { ...(feature.properties as Row), lat: geometry.coordinates[1], lng: geometry.coordinates[0] };
    });
  } else {
    rows = (Array.isArray(input) ? input : data?.cameras) as Row[];
  }
  if (!Array.isArray(rows) || !rows.length || rows.length > 50_000) {
    throw new Error("Import 1–50,000 camera records per file.");
  }
  return rows.map((r, i) => {
    const camera: Camera = {
      id: clean(r.id || `import-${i}`, 180),
      name: clean(r.name || r.title, 120),
      city: clean(r.city, 80),
      country: clean(r.country || "Unspecified", 80),
      lat: Number(r.lat),
      lng: Number(r.lng ?? r.lon),
      type: clean(r.type) as Camera["type"],
      url: httpsUrl(r.url),
      image: httpsUrl(r.image) || "",
      provider: clean(r.provider || "Imported catalog", 100),
      sourceUrl: httpsUrl(r.sourceUrl) || httpsUrl(r.url),
      source: "import",
      category: clean(r.category || "Public camera", 80),
      locationPrecision: "User-supplied location",
      checkedAt: new Date().toISOString(),
      status: "unknown",
    };
    if (!isValidCamera(camera)) {
      throw new Error(`Invalid camera at row ${i + 1}. Check coordinates, HTTPS URL, title and type.`);
    }
    return camera;
  });
}

interface TflPlace {
  id: string;
  commonName: string;
  lat: number;
  lon: number;
  additionalProperties?: { key: string; value: string; modified?: string }[];
}

export function normalizeTfl(rows: TflPlace[], time: string): Camera[] {
  return rows
    .map((r): Camera => {
      const p = Object.fromEntries((r.additionalProperties || []).map((x) => [x.key, x.value]));
      return {
        id: `tfl-${r.id}`,
        name: r.commonName,
        city: "London",
        country: "United Kingdom",
        lat: r.lat,
        lng: r.lon,
        type: p.videoUrl ? "mp4" : "snapshot",
        url: httpsUrl(p.videoUrl) || httpsUrl(p.imageUrl),
        image: httpsUrl(p.imageUrl),
        provider: "Transport for London",
        source: "tfl",
        sourceUrl: "https://tfl.gov.uk/traffic/status/",
        category: "Traffic",
        locationPrecision: "Provider coordinates",
        checkedAt: time,
        status: p.available === "true" ? "provider-available" : "provider-unavailable",
        providerModified: r.additionalProperties?.[0]?.modified || null,
        note: "TfL JamCam: periodically refreshed stills and short clips, not continuous live video.",
      };
    })
    .filter(isValidCamera);
}

interface CaltransRow {
  cctv: {
    index: string;
    inService: string;
    recordTimestamp?: { recordEpoch?: string };
    location: {
      district: string;
      locationName: string;
      nearbyPlace?: string;
      county?: string;
      latitude: string;
      longitude: string;
    };
    imageData: { streamingVideoURL?: string; static: { currentImageURL: string } };
  };
}

export function normalizeCaltrans(rows: CaltransRow[], time: string): Camera[] {
  return rows
    .map(({ cctv: c }): Camera => {
      const l = c.location;
      const d = c.imageData;
      const stream = httpsUrl(d.streamingVideoURL);
      return {
        id: `caltrans-${l.district}-${c.index}`,
        name: l.locationName,
        city: l.nearbyPlace || l.county || "California",
        country: "United States",
        lat: Number(l.latitude),
        lng: Number(l.longitude),
        type: stream ? "hls" : "snapshot",
        url: stream || httpsUrl(d.static.currentImageURL),
        image: httpsUrl(d.static.currentImageURL),
        provider: `Caltrans · District ${l.district}`,
        source: "caltrans",
        district: Number(l.district),
        sourceUrl: "https://quickmap.dot.ca.gov/",
        category: "Traffic",
        locationPrecision: "Provider coordinates",
        checkedAt: time,
        status: c.inService === "true" ? "provider-available" : "provider-unavailable",
        providerModified: c.recordTimestamp?.recordEpoch
          ? new Date(Number(c.recordTimestamp.recordEpoch) * 1000).toISOString()
          : null,
        note: "Provider-listed HLS video with snapshot fallback. Individual streams may be unavailable; a catalog entry is not a playback guarantee.",
      };
    })
    .filter(isValidCamera);
}

interface SingaporeResponse {
  items?: {
    cameras?: {
      camera_id: string;
      image: string;
      timestamp: string;
      location: { latitude: number; longitude: number };
    }[];
  }[];
}

export function normalizeSingapore(data: SingaporeResponse, time: string): Camera[] {
  return (data.items?.[0]?.cameras || [])
    .map(
      (c): Camera => ({
        id: `sg-${c.camera_id}`,
        name: `Traffic camera ${c.camera_id}`,
        city: "Singapore",
        country: "Singapore",
        lat: c.location.latitude,
        lng: c.location.longitude,
        type: "snapshot",
        url: httpsUrl(c.image),
        image: httpsUrl(c.image),
        provider: "LTA / data.gov.sg",
        source: "singapore",
        sourceUrl: "https://data.gov.sg/collections/354/view",
        category: "Traffic",
        locationPrecision: "Provider coordinates",
        checkedAt: time,
        imageTimestamp: c.timestamp,
        status: "provider-available",
        note: "Periodically updated traffic image, not continuous video. Image URLs change when the catalog refreshes.",
      }),
    )
    .filter(isValidCamera);
}

/** Merge by id; incoming records replace existing ones. */
export function mergeCameras(existing: Camera[], incoming: Camera[]): Camera[] {
  const byId = new Map(existing.map((c) => [c.id, c]));
  for (const c of incoming) byId.set(c.id, c);
  return [...byId.values()];
}
