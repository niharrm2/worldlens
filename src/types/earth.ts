export type EarthLayerId =
  | MovementLayerId
  | PlanetExtraLayerId
  | "earthquakes"
  | "fires"
  | "weather"
  | "airquality"
  | "clouds"
  | "rainfall"
  | "aurora"
  | "events"
  | "ocean"
  | "buoys";

/** Envelope for every `/api/earth/[layer]` response. */
export interface EarthPayload<T> {
  /** Time the underlying data refers to (epoch ms). */
  dataTime: number;
  /** When the server last fetched the provider (epoch ms). */
  fetchedAt: number;
  /** True when serving a previous snapshot after a provider error. */
  stale: boolean;
  error: string;
  items: T;
}

export interface Earthquake {
  id: string;
  lat: number;
  lng: number;
  /** Kilometres. */
  depth: number;
  mag: number;
  magType: string;
  time: number;
  place: string;
  url: string;
  tsunami: boolean;
  felt: number | null;
  alert: string | null;
}

/** [lat, lng, detections, maxFrp (MW), latest detection (epoch ms)] in a 0.25° cell. */
export type FireCell = [number, number, number, number, number];

export interface WeatherCell {
  lat: number;
  lng: number;
  /** °C */
  temperature: number;
  /** km/h */
  windSpeed: number;
  /** Degrees the wind blows FROM. */
  windDirection: number;
  /** hPa */
  pressure: number;
}

export interface AirQualityCell {
  lat: number;
  lng: number;
  pm25: number | null;
  dust: number | null;
  ozone: number | null;
  aqi: number | null;
}

export interface OceanCell {
  lat: number;
  lng: number;
  /** Metres. */
  waveHeight: number | null;
  /** Degrees waves come FROM. */
  waveDirection: number | null;
  /** km/h */
  currentSpeed: number | null;
  /** Degrees the current flows TOWARDS. */
  currentDirection: number | null;
}

export interface AuroraData {
  forecastTime: number;
  /** [lng (0–359), lat, probability %], only cells with probability ≥ 3. */
  cells: [number, number, number][];
}

export interface EarthEvent {
  id: string;
  title: string;
  category: string;
  categoryTitle: string;
  link: string;
  sources: { id: string; url: string }[];
  /** Chronological track; polygons are reduced to their centroid. */
  track: { date: number; lat: number; lng: number; magnitude: number | null; unit: string | null }[];
}

export interface Buoy {
  id: string;
  lat: number;
  lng: number;
  time: number;
  windDirection: number | null;
  /** m/s */
  windSpeed: number | null;
  gust: number | null;
  /** Metres. */
  waveHeight: number | null;
  /** Seconds. */
  dominantPeriod: number | null;
  waveDirection: number | null;
  pressure: number | null;
  airTemp: number | null;
  waterTemp: number | null;
  dewPoint: number | null;
}

/** Latest available times for the GIBS imagery layers. */
export interface ImageryInfo {
  clouds: { layer: string; latestDate: string; format: string; matrixSet: string; maxLevel: number };
  rainfall: { layer: string; latestTime: string; stepMinutes: number; format: string; matrixSet: string; maxLevel: number };
}

export interface EarthDataMap extends MovementDataMap, PlanetExtraDataMap {
  earthquakes: Earthquake[];
  fires: FireCell[];
  weather: WeatherCell[];
  airquality: AirQualityCell[];
  aurora: AuroraData;
  events: EarthEvent[];
  ocean: OceanCell[];
  buoys: Buoy[];
  imagery: ImageryInfo;
}

export type EarthDataId = keyof EarthDataMap;

// ---- Movement layers ----------------------------------------------------------

export type MovementLayerId = "balloons" | "trains" | "transit" | "bikes" | "launches" | "gliders";

export interface Balloon {
  serial: string;
  type: string;
  lat: number;
  lng: number;
  /** Metres. */
  alt: number;
  /** Vertical speed, m/s (positive = rising). */
  climb: number | null;
  /** Horizontal speed, m/s. */
  speed: number | null;
  heading: number | null;
  temp: number | null;
  humidity: number | null;
  frequency: number | null;
  time: number;
}

/** [lat, lng, alt (m), time (epoch ms)] */
export type BalloonTrackPoint = [number, number, number, number];

export interface Train {
  id: string;
  number: number;
  type: string;
  commuterLine: string;
  operator: string;
  from: string;
  to: string;
  nextStation: string;
  /** Minutes late at the latest reported station (negative = early). */
  delay: number | null;
  cancelled: boolean;
  /** km/h */
  speed: number;
  lat: number;
  lng: number;
  time: number;
}

/** [lat, lng, bearing, speed (m/s), route, feedIndex, label, status, stopId, time (epoch s)] */
export type TransitRow = [number, number, number | null, number | null, string, number, string, string, string, number];

export interface TransitData {
  feeds: { id: string; name: string; license: string; count: number; error: string }[];
  vehicles: TransitRow[];
}

/** [lat, lng, bikesAvailable, docksAvailable, systemIndex, name] */
export type BikeStationRow = [number, number, number, number, number, string];
/** [lat, lng, systemIndex, kind (0 bike, 1 scooter), rangeKm] */
export type BikeVehicleRow = [number, number, number, number, number | null];

export interface BikeData {
  systems: { id: string; name: string; city: string; stations: number; vehicles: number; error: string }[];
  stations: BikeStationRow[];
  vehicles: BikeVehicleRow[];
}

export interface Launch {
  id: string;
  name: string;
  /** Planned launch time (epoch ms). */
  net: number;
  status: string;
  statusAbbrev: string;
  provider: string;
  rocket: string;
  mission: string;
  missionDescription: string;
  orbit: string;
  pad: string;
  location: string;
  lat: number;
  lng: number;
  webcasts: { url: string; title: string }[];
  image: string;
  live: boolean;
}

/** Open Glider Network aircraft, already filtered by OGN privacy rules on the server. */
export interface Glider {
  /** Opaque, stable ID (never the device address). */
  id: string;
  lat: number;
  lng: number;
  /** Metres. */
  alt: number;
  course: number | null;
  /** km/h */
  speed: number | null;
  /** m/s */
  climb: number | null;
  aircraftType: string;
  /** Empty unless the owner allows identification in the OGN DDB. */
  registration: string;
  cn: string;
  model: string;
  identified: boolean;
  registered: boolean;
  time: number;
}

export interface MovementDataMap {
  gliders: Glider[];
  balloons: Balloon[];
  trains: Train[];
  transit: TransitData;
  bikes: BikeData;
  launches: Launch[];
}

// ---- Planet additions: news, outages, day/night, solar, ocean heat, sea ice ----------

export type PlanetExtraLayerId = "news" | "outages" | "daynight" | "solar" | "oceanheat" | "seaice";

export interface NewsPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Number of articles mentioning the place in the window. */
  count: number;
  articles: { title: string; url: string }[];
  /** "mentioned": geocoded place named in the news; "publisher": grouped by the outlet's country. */
  basis: "mentioned" | "publisher";
}

export interface OutageCountry {
  code: string;
  name: string;
  lat: number;
  lng: number;
  /** IODA overall outage score (relative severity). */
  score: number;
  events: number;
  alerts: { time: number; datasource: string; level: string; value: number | null; expected: number | null }[];
}

export interface SolarWeather {
  /** Latest 1-minute real-time solar wind values (null when the instrument is offline). */
  wind: { time: number; speed: number | null; density: number | null; temperature: number | null };
  mag: { time: number; bt: number | null; bz: number | null };
  /** Last 6 hours, 10-minute means: [time, speed, bz]. */
  series: [number, number | null, number | null][];
  /** Planetary Kp, last 24 hours: [time, kp]. */
  kp: [number, number][];
  scales: { r: string; s: string; g: string; rText: string; sText: string; gText: string };
}

export interface SeaIceStats {
  hemisphere: "north" | "south";
  /** Daily extent, last 45 days: [date (YYYY-MM-DD), million km²]. */
  series: [string, number][];
  /** 1981–2010 median for the same day of year, aligned with `series`. */
  median: (number | null)[];
}

export type OceanHeatVariable = "anomaly" | "dhw" | "sst";

export interface OceanHeatInfo {
  /** Latest available Coral Reef Watch day (YYYY-MM-DD) per product. */
  latest: Record<OceanHeatVariable, string>;
}

export interface OceanHeatPoint {
  date: string;
  lat: number;
  lng: number;
  anomaly: number | null;
  dhw: number | null;
  sst: number | null;
}

export interface PlanetExtraDataMap {
  news: NewsPlace[];
  outages: OutageCountry[];
  solar: SolarWeather;
  seaice: { north: SeaIceStats; south: SeaIceStats; imagery: { layer: string; latestDate: string; matrixSet: string } };
  oceanheat: OceanHeatInfo;
}
