/** Playable feed formats plus `external` for source-link-only entries. */
export type FeedType = "youtube" | "hls" | "mp4" | "snapshot" | "external";
export type PlayableFeedType = Exclude<FeedType, "external">;

export type CameraSource = "tfl" | "caltrans" | "singapore" | "youtube" | "argus" | "import" | "custom" | (string & {});

export type CameraFilter = "all" | "youtube" | "traffic" | "saved";

export interface Camera {
  id: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  type: FeedType;
  url: string;
  image: string;
  provider: string;
  source: CameraSource;
  sourceUrl: string;
  category: string;
  locationPrecision?: string;
  checkedAt: string;
  status: string;
  note?: string;
  providerModified?: string | null;
  district?: number;
  imageTimestamp?: string;
  timeZone?: string;
  /** Snapshot refresh period (ms). */
  refreshInterval?: number;

  // Argus atlas entries, hydrated lazily from detail shards.
  upstreamIndex?: number;
  upstreamId?: string;
  directEligible?: boolean;
  /** Index-only record whose media details have not been loaded yet. */
  catalogOnly?: boolean;
  /** False when the entry exposes only an original source link. */
  mediaReady?: boolean;
}

export interface CameraCatalog {
  generatedAt: string;
  cameras: Camera[];
}

/** Columnar Argus index (`/data/atlas/index.json`). */
export interface AtlasIndex {
  count: number;
  generated: string;
  importedAt: string;
  chunk: number;
  keep: number[];
  lat: number[];
  lon: number[];
  src: number[];
  srcDict: string[];
  cc: number[];
  ccDict: string[];
  ft: number[];
  ftDict: string[];
  eligible: number[];
  youtube?: Record<number, unknown> | unknown[];
  audit: {
    upstreamRecords: number;
    addedRecords: number;
    directListedCandidates: number;
  };
}

export interface AtlasLabels {
  count: number;
  generated: string;
  name: string[];
  city: number[];
  cityDict: string[];
}

export interface AtlasDetailChunk {
  from: number;
  id: string[];
  feed: string[];
  stream: string[];
  ur: number[];
}
