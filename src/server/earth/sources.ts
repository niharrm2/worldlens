import "server-only";

import type {
  AirQualityCell,
  AuroraData,
  Buoy,
  EarthDataMap,
  EarthEvent,
  Earthquake,
  FireCell,
  ImageryInfo,
  OceanCell,
  WeatherCell,
} from "@/types/earth";

import { getJson, getText, num, type Fetched } from "./cache";
import { MOVEMENT_SOURCES } from "./movement";
import { PLANET_EXTRA_SOURCES } from "./planet-extra";
import { fetchCurrent, globalGrid } from "./open-meteo";

const MIN = 60_000;
const HOUR = 60 * MIN;

type Source<K extends keyof EarthDataMap> = { ttl: number; fetch: () => Promise<Fetched<EarthDataMap[K]>> };

// ---- USGS earthquakes --------------------------------------------------------

interface UsgsFeature {
  id: string;
  geometry: { coordinates: [number, number, number] };
  properties: {
    mag: number | null;
    magType: string | null;
    place: string | null;
    time: number;
    url: string;
    tsunami: number;
    felt: number | null;
    alert: string | null;
  };
}

const earthquakes: Source<"earthquakes"> = {
  ttl: MIN,
  async fetch() {
    const data = await getJson<{ metadata: { generated: number }; features: UsgsFeature[] }>(
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
    );
    const items: Earthquake[] = data.features
      .filter((f) => f.properties.mag !== null)
      .map((f) => ({
        id: f.id,
        lng: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        depth: f.geometry.coordinates[2] ?? 0,
        mag: f.properties.mag!,
        magType: f.properties.magType ?? "",
        time: f.properties.time,
        place: f.properties.place ?? "Unknown location",
        url: f.properties.url,
        tsunami: f.properties.tsunami === 1,
        felt: f.properties.felt,
        alert: f.properties.alert,
      }));
    return { items, dataTime: data.metadata.generated };
  },
};

// ---- NASA FIRMS active fires (public 24 h VIIRS NOAA-20 file, no key) ---------

const FIRE_CELL = 0.25;

const fires: Source<"fires"> = {
  ttl: 30 * MIN,
  async fetch() {
    const csv = await getText(
      "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_24h.csv",
      60_000,
    );
    const lines = csv.split("\n");
    const header = lines[0].split(",");
    const col = (name: string) => header.indexOf(name);
    const [iLat, iLng, iDate, iTime, iFrp, iConf] = ["latitude", "longitude", "acq_date", "acq_time", "frp", "confidence"].map(col);
    const bins = new Map<string, FireCell>();
    let latest = 0;
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(",");
      if (c.length < header.length || c[iConf] === "low") continue;
      const lat = Number(c[iLat]);
      const lng = Number(c[iLng]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const hhmm = c[iTime].padStart(4, "0");
      const time = Date.parse(`${c[iDate]}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`) || 0;
      latest = Math.max(latest, time);
      const frp = Number(c[iFrp]) || 0;
      const key = `${Math.floor(lat / FIRE_CELL)}:${Math.floor(lng / FIRE_CELL)}`;
      const cell = bins.get(key);
      if (!cell) {
        bins.set(key, [
          (Math.floor(lat / FIRE_CELL) + 0.5) * FIRE_CELL,
          (Math.floor(lng / FIRE_CELL) + 0.5) * FIRE_CELL,
          1,
          frp,
          time,
        ]);
      } else {
        cell[2]++;
        cell[3] = Math.max(cell[3], frp);
        cell[4] = Math.max(cell[4], time);
      }
    }
    const items = [...bins.values()].map(
      ([lat, lng, n, frp, t]): FireCell => [Math.round(lat * 1000) / 1000, Math.round(lng * 1000) / 1000, n, Math.round(frp * 10) / 10, t],
    );
    return { items, dataTime: latest || Date.now() };
  },
};

// ---- Open-Meteo grids ----------------------------------------------------------

const weather: Source<"weather"> = {
  ttl: 3 * HOUR,
  async fetch() {
    const points = globalGrid(10);
    const { values, time } = await fetchCurrent("https://api.open-meteo.com/v1/forecast", points, [
      "temperature_2m",
      "wind_speed_10m",
      "wind_direction_10m",
      "pressure_msl",
    ]);
    const items: WeatherCell[] = [];
    points.forEach((p, i) => {
      const v = values[i];
      if (!v || v.temperature_2m === null || v.wind_speed_10m === null || v.wind_direction_10m === null) return;
      items.push({
        lat: p.lat,
        lng: p.lng,
        temperature: v.temperature_2m,
        windSpeed: v.wind_speed_10m,
        windDirection: v.wind_direction_10m,
        pressure: v.pressure_msl ?? NaN,
      });
    });
    return { items, dataTime: time };
  },
};

const airquality: Source<"airquality"> = {
  ttl: 4 * HOUR,
  async fetch() {
    const points = globalGrid(15);
    const { values, time } = await fetchCurrent("https://air-quality-api.open-meteo.com/v1/air-quality", points, [
      "pm2_5",
      "dust",
      "ozone",
      "us_aqi",
    ]);
    const items: AirQualityCell[] = points.map((p, i) => ({
      lat: p.lat,
      lng: p.lng,
      pm25: values[i]?.pm2_5 ?? null,
      dust: values[i]?.dust ?? null,
      ozone: values[i]?.ozone ?? null,
      aqi: values[i]?.us_aqi ?? null,
    }));
    return { items: items.filter((c) => c.aqi !== null || c.pm25 !== null), dataTime: time };
  },
};

const ocean: Source<"ocean"> = {
  ttl: 4 * HOUR,
  async fetch() {
    const points = globalGrid(10);
    const { values, time } = await fetchCurrent("https://marine-api.open-meteo.com/v1/marine", points, [
      "wave_height",
      "wave_direction",
      "ocean_current_velocity",
      "ocean_current_direction",
    ]);
    const items: OceanCell[] = [];
    points.forEach((p, i) => {
      const v = values[i];
      if (!v || (v.wave_height === null && v.ocean_current_velocity === null)) return; // land
      items.push({
        lat: p.lat,
        lng: p.lng,
        waveHeight: v.wave_height,
        waveDirection: v.wave_direction,
        currentSpeed: v.ocean_current_velocity,
        currentDirection: v.ocean_current_direction,
      });
    });
    return { items, dataTime: time };
  },
};

// ---- NOAA SWPC aurora -------------------------------------------------------------

const aurora: Source<"aurora"> = {
  ttl: 5 * MIN,
  async fetch() {
    const data = await getJson<{ "Observation Time": string; "Forecast Time": string; coordinates: [number, number, number][] }>(
      "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json",
    );
    const items: AuroraData = {
      forecastTime: Date.parse(data["Forecast Time"]) || Date.now(),
      cells: data.coordinates.filter((c) => c[2] >= 3),
    };
    return { items, dataTime: Date.parse(data["Observation Time"]) || Date.now() };
  },
};

// ---- NASA EONET natural events ------------------------------------------------------

interface EonetGeometry {
  date: string;
  type: "Point" | "Polygon";
  coordinates: number[] | number[][][];
  magnitudeValue: number | null;
  magnitudeUnit: string | null;
}

function centroid(g: EonetGeometry): [number, number] | null {
  if (g.type === "Point") {
    const [lng, lat] = g.coordinates as number[];
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
  }
  const ring = (g.coordinates as number[][][])[0] ?? [];
  if (!ring.length) return null;
  const sum = ring.reduce((a, [lng, lat]) => [a[0] + lat, a[1] + lng], [0, 0]);
  return [sum[0] / ring.length, sum[1] / ring.length];
}

const events: Source<"events"> = {
  ttl: 10 * MIN,
  async fetch() {
    const data = await getJson<{
      events: {
        id: string;
        title: string;
        link: string;
        categories: { id: string; title: string }[];
        sources: { id: string; url: string }[];
        geometry: EonetGeometry[];
      }[];
    }>("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30");
    const items: EarthEvent[] = data.events
      .map((e) => ({
        id: e.id,
        title: e.title,
        category: e.categories[0]?.id ?? "other",
        categoryTitle: e.categories[0]?.title ?? "Other",
        link: e.link,
        sources: e.sources ?? [],
        track: e.geometry
          .map((g) => {
            const c = centroid(g);
            return c
              ? { date: Date.parse(g.date) || 0, lat: c[0], lng: c[1], magnitude: g.magnitudeValue, unit: g.magnitudeUnit }
              : null;
          })
          .filter((p): p is NonNullable<typeof p> => p !== null)
          .sort((a, b) => a.date - b.date),
      }))
      .filter((e) => e.track.length > 0);
    return { items, dataTime: Date.now() };
  },
};

// ---- NOAA NDBC buoys --------------------------------------------------------------

const buoys: Source<"buoys"> = {
  ttl: 10 * MIN,
  async fetch() {
    const text = await getText("https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt");
    const v = (s: string | undefined) => (s === undefined || s === "MM" ? null : num(s));
    const items: Buoy[] = [];
    let latest = 0;
    for (const line of text.split("\n")) {
      if (!line.trim() || line.startsWith("#")) continue;
      const c = line.trim().split(/\s+/);
      if (c.length < 19) continue;
      const lat = Number(c[1]);
      const lng = Number(c[2]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const time = Date.UTC(+c[3], +c[4] - 1, +c[5], +c[6], +c[7]);
      latest = Math.max(latest, time);
      items.push({
        id: c[0],
        lat,
        lng,
        time,
        windDirection: v(c[8]),
        windSpeed: v(c[9]),
        gust: v(c[10]),
        waveHeight: v(c[11]),
        dominantPeriod: v(c[12]),
        waveDirection: v(c[14]),
        pressure: v(c[15]),
        airTemp: v(c[17]),
        waterTemp: v(c[18]),
        dewPoint: v(c[19]),
      });
    }
    return { items, dataTime: latest || Date.now() };
  },
};

// ---- NASA GIBS imagery availability ---------------------------------------------------

const CLOUDS_LAYER = "VIIRS_NOAA20_CorrectedReflectance_TrueColor";
const RAIN_LAYER = "IMERG_Precipitation_Rate_30min";

const imagery: Source<"imagery"> = {
  ttl: HOUR,
  async fetch() {
    const xml = await getText("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml", 60_000);
    const layer = (id: string) => {
      const start = xml.indexOf(`<ows:Identifier>${id}</ows:Identifier>`);
      if (start < 0) throw new Error(`GIBS layer ${id} not found`);
      const block = xml.slice(xml.lastIndexOf("<Layer>", start), xml.indexOf("</Layer>", start));
      const pick = (re: RegExp) => block.match(re)?.[1] ?? "";
      const values = [...block.matchAll(/<Value>(.*?)<\/Value>/g)].map((m) => m[1]);
      const matrixSet = pick(/<TileMatrixSet>(.*?)<\/TileMatrixSet>/);
      return {
        format: pick(/<Format>(.*?)<\/Format>/),
        matrixSet,
        maxLevel: Number(matrixSet.match(/Level(\d+)/)?.[1] ?? 6),
        latest: values.at(-1)?.split("/")[1] ?? pick(/<Default>(.*?)<\/Default>/),
      };
    };
    const clouds = layer(CLOUDS_LAYER);
    const rain = layer(RAIN_LAYER);
    const items: ImageryInfo = {
      clouds: { layer: CLOUDS_LAYER, latestDate: clouds.latest, format: clouds.format, matrixSet: clouds.matrixSet, maxLevel: clouds.maxLevel },
      rainfall: {
        layer: RAIN_LAYER,
        latestTime: rain.latest,
        stepMinutes: 30,
        format: rain.format,
        matrixSet: rain.matrixSet,
        maxLevel: rain.maxLevel,
      },
    };
    return { items, dataTime: Date.parse(rain.latest) || Date.now() };
  },
};

export const EARTH_SOURCES: { [K in keyof EarthDataMap]: Source<K> } = {
  ...MOVEMENT_SOURCES,
  ...PLANET_EXTRA_SOURCES,
  earthquakes,
  fires,
  weather,
  airquality,
  aurora,
  events,
  ocean,
  buoys,
  imagery,
};
