import "server-only";

import GtfsRealtimeBindings from "gtfs-realtime-bindings";

import type {
  Balloon,
  BalloonTrackPoint,
  BikeData,
  BikeStationRow,
  BikeVehicleRow,
  Launch,
  MovementDataMap,
  Train,
  TransitData,
  TransitRow,
} from "@/types/earth";

import { cached, getJson, num, USER_AGENT, type Fetched } from "./cache";
import { fetchGliders } from "./ogn";

const MIN = 60_000;
type Source<K extends keyof MovementDataMap> = { ttl: number; fetch: () => Promise<Fetched<MovementDataMap[K]>> };

// ---- SondeHub weather balloons (community-received radiosonde telemetry) ---------

interface SondeFrame {
  serial?: string;
  type?: string;
  subtype?: string;
  lat?: number;
  lon?: number;
  alt?: number;
  vel_v?: number;
  vel_h?: number;
  heading?: number;
  temp?: number;
  humidity?: number;
  frequency?: number;
  datetime?: string;
}

const SONDEHUB = "https://api.v2.sondehub.org";

const balloons: Source<"balloons"> = {
  ttl: MIN,
  async fetch() {
    // Latest frame per sonde heard in the last 3 hours, keyed by serial.
    const data = await getJson<Record<string, SondeFrame>>(`${SONDEHUB}/sondes?last=10800`, 40_000);
    const items: Balloon[] = [];
    for (const [key, f] of Object.entries(data)) {
      const lat = num(f.lat), lng = num(f.lon), alt = num(f.alt);
      if (lat === null || lng === null || alt === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
      items.push({
        serial: f.serial || key,
        type: [f.type, f.subtype].filter(Boolean).join(" ") || "Radiosonde",
        lat,
        lng,
        alt,
        climb: num(f.vel_v),
        speed: num(f.vel_h),
        heading: num(f.heading),
        temp: num(f.temp),
        humidity: num(f.humidity),
        frequency: num(f.frequency),
        time: Date.parse(f.datetime ?? "") || Date.now(),
      });
    }
    return { items, dataTime: Math.max(0, ...items.map((b) => b.time)) || Date.now() };
  },
};

/** Flight trail for one sonde (cached briefly per serial). */
export function balloonTrack(serial: string) {
  return cached<BalloonTrackPoint[]>(`balloon:${serial}`, MIN, async () => {
    const frames = await getJson<SondeFrame[]>(`${SONDEHUB}/sonde/${encodeURIComponent(serial)}`, 40_000);
    const points = frames
      .map((f): BalloonTrackPoint | null => {
        const lat = num(f.lat), lng = num(f.lon), alt = num(f.alt);
        const t = Date.parse(f.datetime ?? "");
        return lat !== null && lng !== null && alt !== null && t ? [lat, lng, alt, t] : null;
      })
      .filter((p): p is BalloonTrackPoint => p !== null)
      .sort((a, b) => a[3] - b[3]);
    // Thin long flights to ≤ 600 points.
    const step = Math.max(1, Math.ceil(points.length / 600));
    return { items: points.filter((_, i) => i % step === 0 || i === points.length - 1), dataTime: Date.now() };
  });
}

// ---- Fintraffic Digitraffic rail (Finland) ----------------------------------------

const RAIL = "https://rata.digitraffic.fi/api/v1";
const RAIL_HEADERS = { "Accept-Encoding": "gzip", "Digitraffic-User": "WorldLens/1.0", Accept: "application/json" };

async function railJson<T>(path: string): Promise<T> {
  const response = await fetch(`${RAIL}${path}`, { headers: RAIL_HEADERS, signal: AbortSignal.timeout(30_000), cache: "no-store" });
  if (!response.ok) throw new Error(`Digitraffic rail returned HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

interface TimeTableRow {
  type: "ARRIVAL" | "DEPARTURE";
  stationShortCode: string;
  commercialStop?: boolean;
  actualTime?: string;
  differenceInMinutes?: number;
  liveEstimateTime?: string;
}

interface LiveTrain {
  trainNumber: number;
  departureDate: string;
  trainType: string;
  commuterLineID: string;
  operatorShortCode: string;
  cancelled: boolean;
  timeTableRows: TimeTableRow[];
}

const trains: Source<"trains"> = {
  ttl: 20_000,
  async fetch() {
    const stations = await cached("rail-stations", 24 * 60 * MIN, async () => {
      const list = await railJson<{ stationShortCode: string; stationName: string }[]>("/metadata/stations");
      return { items: Object.fromEntries(list.map((s) => [s.stationShortCode, s.stationName.replace(/ asema$/, "")])), dataTime: Date.now() };
    });
    const live = await cached("rail-live", MIN, async () => ({
      items: await railJson<LiveTrain[]>("/live-trains?version=0"),
      dataTime: Date.now(),
    }));
    const locations = await railJson<
      { trainNumber: number; departureDate: string; speed: number; timestamp: string; location: { coordinates: [number, number] } }[]
    >("/train-locations/latest/");

    const name = (code: string | undefined) => (code ? (stations.items[code] ?? code) : "");
    const byKey = new Map(live.items.map((t) => [`${t.departureDate}/${t.trainNumber}`, t]));
    const items: Train[] = locations.map((l) => {
      const t = byKey.get(`${l.departureDate}/${l.trainNumber}`);
      const rows = t?.timeTableRows ?? [];
      const done = rows.filter((r) => r.actualTime);
      const next = rows.find((r) => !r.actualTime && r.commercialStop !== false && r.type === "ARRIVAL");
      const delay = done.length ? (done[done.length - 1].differenceInMinutes ?? null) : null;
      return {
        id: `${l.departureDate}/${l.trainNumber}`,
        number: l.trainNumber,
        type: t?.trainType ?? "",
        commuterLine: t?.commuterLineID ?? "",
        operator: t?.operatorShortCode ?? "",
        from: name(rows[0]?.stationShortCode),
        to: name(rows[rows.length - 1]?.stationShortCode),
        nextStation: name(next?.stationShortCode),
        delay,
        cancelled: t?.cancelled ?? false,
        speed: l.speed,
        lat: l.location.coordinates[1],
        lng: l.location.coordinates[0],
        time: Date.parse(l.timestamp) || Date.now(),
      };
    });
    return { items, dataTime: Math.max(0, ...items.map((t) => t.time)) || Date.now() };
  },
};

// ---- GTFS-Realtime vehicle positions (buses, trams, metro) --------------------------

interface TransitFeed {
  id: string;
  name: string;
  url: string;
  license: string;
}

/** Open, key-free feeds. Add more with TRANSIT_FEEDS='[{"id","name","url","license"}]'. */
const BUILT_IN_FEEDS: TransitFeed[] = [
  { id: "hsl", name: "Helsinki region · HSL", url: "https://realtime.hsl.fi/realtime/vehicle-positions/v2/hsl", license: "CC BY 4.0, Helsinki Region Transport" },
  { id: "mbta", name: "Boston · MBTA", url: "https://cdn.mbta.com/realtime/VehiclePositions.pb", license: "MBTA Developer license" },
  { id: "seq", name: "South East Queensland · Translink", url: "https://gtfsrt.api.translink.com.au/api/realtime/SEQ/VehiclePositions", license: "CC BY 4.0, State of Queensland" },
];

function transitFeeds(): TransitFeed[] {
  try {
    const extra = JSON.parse(process.env.TRANSIT_FEEDS || "[]") as TransitFeed[];
    return [...BUILT_IN_FEEDS, ...extra.filter((f) => f.id && f.url)];
  } catch {
    return BUILT_IN_FEEDS;
  }
}

const STATUS = ["Arriving at", "Stopped at", "In transit to"];

const transit: Source<"transit"> = {
  ttl: 20_000,
  async fetch() {
    const feeds = transitFeeds();
    const vehicles: TransitRow[] = [];
    const summary: TransitData["feeds"] = [];
    let latest = 0;
    await Promise.all(
      feeds.map(async (feed, index) => {
        try {
          const response = await fetch(feed.url, {
            headers: { "User-Agent": USER_AGENT },
            signal: AbortSignal.timeout(20_000),
            cache: "no-store",
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const message = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(await response.arrayBuffer()));
          let count = 0;
          for (const entity of message.entity) {
            const v = entity.vehicle;
            const p = v?.position;
            if (!v || !p || !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) continue;
            const time = Number(v.timestamp ?? 0);
            latest = Math.max(latest, time);
            vehicles.push([
              Math.round(p.latitude * 1e5) / 1e5,
              Math.round(p.longitude * 1e5) / 1e5,
              p.bearing ?? null,
              p.speed != null ? Math.round(p.speed * 10) / 10 : null,
              v.trip?.routeId ?? "",
              index,
              v.vehicle?.label || v.vehicle?.id || entity.id,
              v.currentStatus != null ? (STATUS[v.currentStatus as number] ?? "") : "",
              v.stopId ?? "",
              time,
            ]);
            count++;
          }
          summary[index] = { id: feed.id, name: feed.name, license: feed.license, count, error: "" };
        } catch (error) {
          summary[index] = { id: feed.id, name: feed.name, license: feed.license, count: 0, error: (error as Error).message };
        }
      }),
    );
    if (!vehicles.length) throw new Error("No transit feed responded");
    return { items: { feeds: summary, vehicles }, dataTime: latest ? latest * 1000 : Date.now() };
  },
};

// ---- GBFS shared bikes and scooters ----------------------------------------------------

interface BikeSystem {
  id: string;
  name: string;
  city: string;
  url: string;
}

const BIKE_SYSTEMS: BikeSystem[] = [
  { id: "citibike", name: "Citi Bike", city: "New York", url: "https://gbfs.citibikenyc.com/gbfs/2.3/gbfs.json" },
  { id: "divvy", name: "Divvy", city: "Chicago", url: "https://gbfs.divvybikes.com/gbfs/2.3/gbfs.json" },
  { id: "baywheels", name: "Bay Wheels", city: "San Francisco Bay Area", url: "https://gbfs.baywheels.com/gbfs/2.3/gbfs.json" },
  { id: "capital", name: "Capital Bikeshare", city: "Washington, DC", url: "https://gbfs.capitalbikeshare.com/gbfs/2.3/gbfs.json" },
  { id: "bixi", name: "BIXI", city: "Montréal", url: "https://gbfs.velobixi.com/gbfs/gbfs.json" },
  { id: "toronto", name: "Bike Share Toronto", city: "Toronto", url: "https://tor.publicbikesystem.net/ube/gbfs/v1/" },
  { id: "oslo", name: "Oslo Bysykkel", city: "Oslo", url: "https://gbfs.urbansharing.com/oslobysykkel.no/gbfs.json" },
  { id: "velib", name: "Vélib' Métropole", city: "Paris", url: "https://velib-metropole-opendata.smovengo.cloud/opendata/Velib_Metropole/gbfs.json" },
  { id: "dott-paris", name: "Dott", city: "Paris", url: "https://gbfs.api.ridedott.com/public/v2/paris/gbfs.json" },
  { id: "dott-brussels", name: "Dott", city: "Brussels", url: "https://gbfs.api.ridedott.com/public/v2/brussels/gbfs.json" },
];

type GbfsFeeds = Record<string, string>;

/** Reject if `work` takes longer than `ms`, so one slow provider cannot stall the response. */
function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function gbfsFeeds(system: BikeSystem): Promise<GbfsFeeds> {
  const result = await cached(`gbfs:${system.id}`, 6 * 60 * MIN, async () => {
    const root = await getJson<{ data: Record<string, { feeds: { name: string; url: string }[] }> | { feeds: { name: string; url: string }[] } }>(system.url);
    const data = root.data as Record<string, { feeds?: { name: string; url: string }[] }>;
    const lang = data.en ?? Object.values(data).find((d) => Array.isArray(d?.feeds)) ?? (root.data as { feeds?: { name: string; url: string }[] });
    return { items: Object.fromEntries((lang.feeds ?? []).map((f) => [f.name, f.url])), dataTime: Date.now() };
  });
  return result.items;
}

interface GbfsStationInfo { station_id: string; name: string; lat: number; lon: number }
interface GbfsStationStatus { station_id: string; num_bikes_available?: number; num_docks_available?: number; is_renting?: boolean | number }
interface GbfsVehicle { lat: number; lon: number; vehicle_type_id?: string; current_range_meters?: number; is_disabled?: boolean | number; is_reserved?: boolean | number }

const bikes: Source<"bikes"> = {
  ttl: MIN,
  async fetch() {
    const stations: BikeStationRow[] = [];
    const vehicles: BikeVehicleRow[] = [];
    const systems: BikeData["systems"] = [];
    await Promise.all(
      BIKE_SYSTEMS.map(async (system, index) => {
        const entry = { id: system.id, name: system.name, city: system.city, stations: 0, vehicles: 0, error: "" };
        systems[index] = entry;
        const feeds = await withTimeout(gbfsFeeds(system), 20_000, system.name).catch((error: Error) => {
          entry.error = error.message;
          return null;
        });
        if (!feeds) return;

        // Docking stations and free-floating vehicles load independently with their own time limits.
        const loadStations = async () => {
          // Dott publishes thousands of virtual parking zones as "stations"; show its scooters only.
          if (system.id.startsWith("dott") || !feeds.station_information || !feeds.station_status) return [];
          const info = await cached(`gbfs-info:${system.id}`, 60 * MIN, async () => ({
            items: (await getJson<{ data: { stations: GbfsStationInfo[] } }>(feeds.station_information, 30_000)).data.stations,
            dataTime: Date.now(),
          }));
          const status = (await getJson<{ data: { stations: GbfsStationStatus[] } }>(feeds.station_status, 30_000)).data.stations;
          const byId = new Map(status.map((s) => [s.station_id, s]));
          const rows: BikeStationRow[] = [];
          for (const s of info.items) {
            const st = byId.get(s.station_id);
            if (!st || !Number.isFinite(s.lat) || !Number.isFinite(s.lon) || st.is_renting === false || st.is_renting === 0) continue;
            rows.push([s.lat, s.lon, st.num_bikes_available ?? 0, st.num_docks_available ?? 0, index, s.name]);
          }
          return rows;
        };
        const loadVehicles = async () => {
          const free = feeds.vehicle_status ?? feeds.free_bike_status;
          if (!free) return [];
          const body = await getJson<{ data: { bikes?: GbfsVehicle[]; vehicles?: GbfsVehicle[] } }>(free, 30_000);
          const rows: BikeVehicleRow[] = [];
          for (const v of body.data.bikes ?? body.data.vehicles ?? []) {
            if (!Number.isFinite(v.lat) || !Number.isFinite(v.lon) || v.is_disabled || v.is_reserved) continue;
            const scooter = /scoot/i.test(v.vehicle_type_id ?? "") || system.id.startsWith("dott");
            rows.push([
              Math.round(v.lat * 1e5) / 1e5,
              Math.round(v.lon * 1e5) / 1e5,
              index,
              scooter ? 1 : 0,
              v.current_range_meters ? Math.round(v.current_range_meters / 100) / 10 : null,
            ]);
          }
          return rows;
        };
        const [stationResult, vehicleResult] = await Promise.allSettled([
          withTimeout(loadStations(), 35_000, `${system.name} stations`),
          withTimeout(loadVehicles(), 35_000, `${system.name} vehicles`),
        ]);
        if (stationResult.status === "fulfilled") {
          stations.push(...stationResult.value);
          entry.stations = stationResult.value.length;
        }
        if (vehicleResult.status === "fulfilled") {
          vehicles.push(...vehicleResult.value);
          entry.vehicles = vehicleResult.value.length;
        }
        const failed = [stationResult, vehicleResult]
          .filter((r): r is PromiseRejectedResult => r.status === "rejected")
          .map((r) => (r.reason as Error).message);
        entry.error = failed.join("; ");
      }),
    );
    return { items: { systems, stations, vehicles }, dataTime: Date.now() };
  },
};

// ---- Launch Library 2 rocket launches -------------------------------------------------

interface LlLaunch {
  id: string;
  name: string;
  net: string;
  status?: { name?: string; abbrev?: string };
  launch_service_provider?: { name?: string };
  rocket?: { configuration?: { full_name?: string; name?: string } };
  mission?: { name?: string; description?: string; orbit?: { name?: string } } | null;
  pad?: { name?: string; latitude?: number | string; longitude?: number | string; location?: { name?: string } };
  vid_urls?: { url: string; title?: string }[];
  vidURLs?: { url: string; title?: string }[];
  image?: string | { image_url?: string } | null;
  webcast_live?: boolean;
}

const launches: Source<"launches"> = {
  // The free API tier allows ~15 requests per hour; one shared fetch every 30 min.
  ttl: 30 * MIN,
  async fetch() {
    const data = await getJson<{ results: LlLaunch[] }>(
      "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=40&mode=detailed&hide_recent_previous=true",
      40_000,
    );
    const items: Launch[] = [];
    for (const l of data.results) {
      const lat = num(l.pad?.latitude), lng = num(l.pad?.longitude);
      if (lat === null || lng === null) continue;
      items.push({
        id: l.id,
        name: l.name,
        net: Date.parse(l.net) || 0,
        status: l.status?.name ?? "Unknown",
        statusAbbrev: l.status?.abbrev ?? "",
        provider: l.launch_service_provider?.name ?? "",
        rocket: l.rocket?.configuration?.full_name || l.rocket?.configuration?.name || "",
        mission: l.mission?.name ?? "",
        missionDescription: l.mission?.description ?? "",
        orbit: l.mission?.orbit?.name ?? "",
        pad: l.pad?.name ?? "",
        location: l.pad?.location?.name ?? "",
        lat,
        lng,
        webcasts: (l.vid_urls ?? l.vidURLs ?? []).map((v) => ({ url: v.url, title: v.title || "Webcast" })),
        image: typeof l.image === "string" ? l.image : (l.image?.image_url ?? ""),
        live: !!l.webcast_live,
      });
    }
    return { items, dataTime: Date.now() };
  },
};

// ---- Open Glider Network ------------------------------------------------------------------

const gliders: Source<"gliders"> = { ttl: 15_000, fetch: fetchGliders };

export const MOVEMENT_SOURCES: { [K in keyof MovementDataMap]: Source<K> } = {
  gliders,
  balloons,
  trains,
  transit,
  bikes,
  launches,
};
