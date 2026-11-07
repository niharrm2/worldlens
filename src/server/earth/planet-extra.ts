import "server-only";

import type {
  NewsPlace,
  OceanHeatInfo,
  OceanHeatPoint,
  OceanHeatVariable,
  OutageCountry,
  PlanetExtraDataMap,
  SeaIceStats,
  SolarWeather,
} from "@/types/earth";

import { cached, getJson, getText, num, USER_AGENT, type Fetched } from "./cache";

const MIN = 60_000;
const HOUR = 60 * MIN;
type Source<K extends keyof PlanetExtraDataMap> = { ttl: number; fetch: () => Promise<Fetched<PlanetExtraDataMap[K]>> };

// ---- Country centroids (for country-level feeds) --------------------------------------

interface CountryRecord {
  cca2: string;
  latlng: [number, number];
  name: { common: string; official: string };
  altSpellings?: string[];
}

function countryList() {
  return cached("country-list", 30 * 24 * HOUR, async () => ({
    items: await getJson<CountryRecord[]>("https://raw.githubusercontent.com/mledoze/countries/master/countries.json", 60_000),
    dataTime: Date.now(),
  }));
}

async function countryCentroids(): Promise<Map<string, [number, number]>> {
  const { items } = await countryList();
  return new Map(items.map((c) => [c.cca2, c.latlng]));
}

/** Lower-case country names (common, official, alternates) → code and centroid. */
async function countryNames(): Promise<Map<string, { code: string; lat: number; lng: number }>> {
  const { items } = await countryList();
  const map = new Map<string, { code: string; lat: number; lng: number }>();
  for (const c of items) {
    const value = { code: c.cca2, lat: c.latlng[0], lng: c.latlng[1] };
    for (const n of [c.name.common, c.name.official, ...(c.altSpellings ?? [])]) map.set(n.toLowerCase(), value);
  }
  return map;
}

// ---- GDELT geographic news -------------------------------------------------------------

interface GdeltFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: { name?: string; count?: number; html?: string };
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** Articles' coordinates from the GDELT GEO API (geocoded mentions). */
async function newsFromGeo(): Promise<NewsPlace[]> {
  const data = await getJson<{ features?: GdeltFeature[] }>(
    "https://api.gdeltproject.org/api/v2/geo/geo?query=sourcelang:english&mode=PointData&format=GeoJSON&timespan=24h&maxpoints=500",
    25_000,
  );
  const items: NewsPlace[] = [];
  for (const [i, f] of (data.features ?? []).entries()) {
    const [lng, lat] = f.geometry?.coordinates ?? [];
    if (lat === undefined || lng === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const articles = [...(f.properties?.html ?? "").matchAll(/<a href="([^"]+)"[^>]*title="([^"]*)"/g)]
      .slice(0, 8)
      .map((m) => ({ url: decode(m[1]), title: decode(m[2]) }))
      .filter((a) => /^https?:\/\//.test(a.url));
    items.push({ id: `g${i}`, name: f.properties?.name ?? "Unknown place", lat, lng, count: f.properties?.count ?? articles.length, articles, basis: "mentioned" });
  }
  if (!items.length) throw new Error("GDELT GEO returned no places");
  return items;
}

/** Fallback: latest GDELT DOC headlines grouped by the publishing country (no event coordinates). */
async function newsFromDoc(): Promise<NewsPlace[]> {
  const query = "(earthquake OR flood OR storm OR wildfire OR election OR protest OR conflict OR outbreak OR economy)";
  const data = await getJson<{ articles?: { url: string; title: string; sourcecountry?: string; seendate?: string }[] }>(
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&format=json&maxrecords=250&timespan=24h&sort=datedesc`,
    40_000,
  );
  const countries = await countryNames();
  const groups = new Map<string, NewsPlace>();
  for (const a of data.articles ?? []) {
    const country = a.sourcecountry ? countries.get(a.sourcecountry.toLowerCase()) : undefined;
    if (!country || !/^https?:\/\//.test(a.url)) continue;
    const place =
      groups.get(country.code) ??
      groups.set(country.code, { id: `c${country.code}`, name: a.sourcecountry!, lat: country.lat, lng: country.lng, count: 0, articles: [], basis: "publisher" }).get(country.code)!;
    place.count++;
    if (place.articles.length < 8) place.articles.push({ url: a.url, title: decode(a.title) });
  }
  return [...groups.values()];
}

const news: Source<"news"> = {
  ttl: 15 * MIN,
  async fetch() {
    let items: NewsPlace[];
    try {
      items = await newsFromGeo();
    } catch {
      items = await newsFromDoc();
    }
    return { items, dataTime: Date.now() };
  },
};

// ---- IODA internet outages ---------------------------------------------------------------

const IODA = "https://api.ioda.inetintel.cc.gatech.edu/v2/outages";

const outages: Source<"outages"> = {
  ttl: 5 * MIN,
  async fetch() {
    const until = Math.floor(Date.now() / 1000);
    const from = until - 24 * 3600;
    const [summary, alerts, centroids] = await Promise.all([
      getJson<{ data: { scores: { overall: number }; event_cnt: number; entity: { code: string; name: string } }[] }>(
        `${IODA}/summary?entityType=country&from=${from}&until=${until}`,
      ),
      getJson<{
        data: { datasource: string; entity: { code: string }; time: number; level: string; value: number | null; historyValue: number | null }[];
      }>(`${IODA}/alerts?entityType=country&from=${from}&until=${until}&limit=2000`),
      countryCentroids(),
    ]);
    const byCountry = new Map<string, OutageCountry["alerts"]>();
    for (const a of alerts.data) {
      const list = byCountry.get(a.entity.code) ?? [];
      list.push({ time: a.time * 1000, datasource: a.datasource, level: a.level, value: num(a.value), expected: num(a.historyValue) });
      byCountry.set(a.entity.code, list);
    }
    const items: OutageCountry[] = [];
    for (const s of summary.data) {
      const ll = centroids.get(s.entity.code);
      if (!ll) continue;
      items.push({
        code: s.entity.code,
        name: s.entity.name,
        lat: ll[0],
        lng: ll[1],
        score: s.scores.overall,
        events: s.event_cnt,
        alerts: (byCountry.get(s.entity.code) ?? []).sort((a, b) => b.time - a.time).slice(0, 20),
      });
    }
    return { items: items.sort((a, b) => b.score - a.score), dataTime: until * 1000 };
  },
};

// ---- NOAA SWPC space weather -----------------------------------------------------------------

interface RtswWind { time_tag: string; active: boolean; proton_speed: number | null; proton_density: number | null; proton_temperature: number | null }
interface RtswMag { time_tag: string; active: boolean; bt: number | null; bz_gsm: number | null }

const utc = (tag: string) => Date.parse(tag.endsWith("Z") ? tag : `${tag}Z`);

const solar: Source<"solar"> = {
  ttl: MIN,
  async fetch() {
    const [wind, mag, kp, scales] = await Promise.all([
      getJson<RtswWind[]>("https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json", 45_000),
      getJson<RtswMag[]>("https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json", 45_000),
      getJson<{ time_tag: string; Kp: number }[]>("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json"),
      getJson<Record<string, { R: { Scale: string | null; Text: string | null }; S: { Scale: string | null; Text: string | null }; G: { Scale: string | null; Text: string | null } }>>(
        "https://services.swpc.noaa.gov/products/noaa-scales.json",
      ),
    ]);
    // Several spacecraft report; keep the active (primary) one, newest first.
    const activeWind = wind.filter((w) => w.active).sort((a, b) => utc(b.time_tag) - utc(a.time_tag));
    const activeMag = mag.filter((m) => m.active).sort((a, b) => utc(b.time_tag) - utc(a.time_tag));
    const w = activeWind.find((x) => x.proton_speed !== null) ?? activeWind[0];
    const m = activeMag.find((x) => x.bt !== null) ?? activeMag[0];

    // 6-hour series in 10-minute buckets.
    const cutoff = Date.now() - 6 * HOUR;
    const buckets = new Map<number, { s: number[]; b: number[] }>();
    for (const x of activeWind) {
      const t = utc(x.time_tag);
      if (t < cutoff || x.proton_speed === null) continue;
      const k = Math.floor(t / (10 * MIN)) * 10 * MIN;
      (buckets.get(k) ?? buckets.set(k, { s: [], b: [] }).get(k)!).s.push(x.proton_speed);
    }
    for (const x of activeMag) {
      const t = utc(x.time_tag);
      if (t < cutoff || x.bz_gsm === null) continue;
      const k = Math.floor(t / (10 * MIN)) * 10 * MIN;
      (buckets.get(k) ?? buckets.set(k, { s: [], b: [] }).get(k)!).b.push(x.bz_gsm);
    }
    const mean = (a: number[]) => (a.length ? Math.round((a.reduce((p, c) => p + c, 0) / a.length) * 10) / 10 : null);
    const series = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]): [number, number | null, number | null] => [t, mean(v.s), mean(v.b)]);

    const now = scales["0"];
    const items: SolarWeather = {
      wind: { time: w ? utc(w.time_tag) : 0, speed: w?.proton_speed ?? null, density: w?.proton_density ?? null, temperature: w?.proton_temperature ?? null },
      mag: { time: m ? utc(m.time_tag) : 0, bt: m?.bt ?? null, bz: m?.bz_gsm ?? null },
      series,
      kp: kp.slice(-8).map((k): [number, number] => [utc(k.time_tag), k.Kp]),
      scales: {
        r: now?.R.Scale ?? "0", s: now?.S.Scale ?? "0", g: now?.G.Scale ?? "0",
        rText: now?.R.Text ?? "none", sText: now?.S.Text ?? "none", gText: now?.G.Text ?? "none",
      },
    };
    return { items, dataTime: Math.max(items.wind.time, items.mag.time) || Date.now() };
  },
};

// ---- NSIDC Sea Ice Index + GIBS sea-ice imagery ----------------------------------------------

const NSIDC = "https://noaadata.apps.nsidc.org/NOAA/G02135";
const SEA_ICE_LAYER = "GHRSST_L4_MUR_Sea_Ice_Concentration";

async function seaIceHemisphere(hemisphere: "north" | "south"): Promise<SeaIceStats> {
  const h = hemisphere === "north" ? "N" : "S";
  const [daily, climatology] = await Promise.all([
    getText(`${NSIDC}/${hemisphere}/daily/data/${h}_seaice_extent_daily_v4.0.csv`, 60_000),
    cached(`nsidc-clim-${h}`, 7 * 24 * HOUR, async () => ({
      items: await getText(`${NSIDC}/${hemisphere}/daily/data/${h}_seaice_extent_climatology_1981-2010_v4.0.csv`, 60_000),
      dataTime: Date.now(),
    })),
  ]);
  const rows = daily
    .trim()
    .split("\n")
    .slice(2)
    .map((line) => line.split(",").map((x) => x.trim()))
    .filter((c) => c.length >= 4 && Number.isFinite(Number(c[3])))
    .slice(-45);
  const medianByDoy = new Map<number, number>();
  for (const line of climatology.items.trim().split("\n").slice(2)) {
    const c = line.split(",").map((x) => x.trim());
    if (Number.isFinite(Number(c[0])) && Number.isFinite(Number(c[5]))) medianByDoy.set(Number(c[0]), Number(c[5]));
  }
  const series: [string, number][] = rows.map((c) => [`${c[0]}-${c[1].padStart(2, "0")}-${c[2].padStart(2, "0")}`, Number(c[3])]);
  const median = series.map(([date]) => {
    const d = new Date(`${date}T00:00:00Z`);
    const doy = Math.floor((+d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86_400_000);
    return medianByDoy.get(doy) ?? null;
  });
  return { hemisphere, series, median };
}

async function gibsLatest(layer: string): Promise<{ latestDate: string; matrixSet: string }> {
  const result = await cached(`gibs4326:${layer}`, HOUR, async () => {
    const xml = await getText("https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0/WMTSCapabilities.xml", 60_000);
    const start = xml.indexOf(`<ows:Identifier>${layer}</ows:Identifier>`);
    if (start < 0) throw new Error(`GIBS layer ${layer} not found`);
    const block = xml.slice(xml.lastIndexOf("<Layer>", start), xml.indexOf("</Layer>", start));
    const values = [...block.matchAll(/<Value>(.*?)<\/Value>/g)].map((m) => m[1]);
    return {
      items: {
        latestDate: values.at(-1)?.split("/")[1] ?? "",
        matrixSet: block.match(/<TileMatrixSet>(.*?)<\/TileMatrixSet>/)?.[1] ?? "2km",
      },
      dataTime: Date.now(),
    };
  });
  return result.items;
}

const seaice: Source<"seaice"> = {
  ttl: 3 * HOUR,
  async fetch() {
    const [north, south, imagery] = await Promise.all([seaIceHemisphere("north"), seaIceHemisphere("south"), gibsLatest(SEA_ICE_LAYER)]);
    const last = north.series.at(-1)?.[0];
    return { items: { north, south, imagery: { layer: SEA_ICE_LAYER, ...imagery } }, dataTime: last ? Date.parse(`${last}T12:00:00Z`) : Date.now() };
  },
};

// ---- NOAA Coral Reef Watch (CoastWatch ERDDAP) --------------------------------------------------

const ERDDAP = "https://coastwatch.noaa.gov/erddap/griddap";
export const CRW: Record<OceanHeatVariable, { dataset: string; variable: string; colorBar: string; units: string }> = {
  anomaly: { dataset: "noaacrwsstanomalyDaily", variable: "sea_surface_temperature_anomaly", colorBar: "BlueWhiteRed|||-4|4|", units: "°C" },
  dhw: { dataset: "noaacrwdhwDaily", variable: "degree_heating_week", colorBar: "WhiteRedBlack|||0|16|", units: "°C-weeks" },
  sst: { dataset: "noaacrwsstDaily", variable: "analysed_sst", colorBar: "Rainbow|||-2|32|", units: "°C" },
};

async function crwLatest(v: OceanHeatVariable): Promise<string> {
  const info = await getJson<{ table: { rows: string[][] } }>(`https://coastwatch.noaa.gov/erddap/info/${CRW[v].dataset}/index.json`, 40_000);
  const range = info.table.rows.find((r) => r[0] === "attribute" && r[1] === "time" && r[2] === "actual_range")?.[4] ?? "";
  const end = Number(range.split(",").at(-1));
  return Number.isFinite(end) ? new Date(end * 1000).toISOString().slice(0, 10) : "";
}

const oceanheat: Source<"oceanheat"> = {
  ttl: 3 * HOUR,
  async fetch() {
    const [anomaly, dhw, sst] = await Promise.all([crwLatest("anomaly"), crwLatest("dhw"), crwLatest("sst")]);
    const items: OceanHeatInfo = { latest: { anomaly, dhw, sst } };
    return { items, dataTime: Date.parse(`${anomaly}T12:00:00Z`) || Date.now() };
  },
};

/** Global PNG (transparent over land) for one Coral Reef Watch product and day, 0.2° resolution. */
export function oceanHeatImage(v: OceanHeatVariable, date: string): Promise<ArrayBuffer> {
  return cached(`crw-img:${v}:${date}`, 6 * HOUR, async () => {
    const c = CRW[v];
    const q = `${c.variable}[(${date}T12:00:00Z)][(89.975):4:(-89.975)][(-179.975):4:(179.975)]`;
    const url = `${ERDDAP}/${c.dataset}.transparentPng?${encodeURIComponent(q)}&.colorBar=${encodeURIComponent(c.colorBar)}`;
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(90_000), cache: "no-store" });
    if (!response.ok) throw new Error(`Coral Reef Watch returned HTTP ${response.status}`);
    return { items: await response.arrayBuffer(), dataTime: Date.now() };
  }).then((p) => p.items);
}

/** Values of all three products at one point (nearest 5 km cell). */
export async function oceanHeatPoint(lat: number, lng: number, date: string): Promise<OceanHeatPoint> {
  const value = async (v: OceanHeatVariable) => {
    const c = CRW[v];
    try {
      const q = `${c.variable}[(${date}T12:00:00Z)][(${lat.toFixed(3)})][(${lng.toFixed(3)})]`;
      const body = await getJson<{ table: { rows: (string | number | null)[][] } }>(`${ERDDAP}/${c.dataset}.json?${encodeURIComponent(q)}`, 30_000);
      return num(body.table.rows[0]?.[3]);
    } catch {
      return null; // date not yet available for this product, or land
    }
  };
  const [anomaly, dhw, sst] = await Promise.all([value("anomaly"), value("dhw"), value("sst")]);
  return { date, lat, lng, anomaly, dhw, sst };
}

export const PLANET_EXTRA_SOURCES: { [K in keyof PlanetExtraDataMap]: Source<K> } = {
  news,
  outages,
  solar,
  seaice,
  oceanheat,
};
