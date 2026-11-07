/** Turn Earth datasets into globe overlay specs. */
import type { OverlayCell, OverlayPoint, OverlaySpec } from "@/features/globe/overlays";
import { EVENT_GLYPHS } from "@/lib/icons/map-glyphs";
import { solarElevation, subsolarPoint, terminator } from "@/lib/sun";
import type { BalloonTrackPoint, EarthDataMap, EarthLayerId, ImageryInfo, OceanHeatVariable } from "@/types/earth";

import {
  aqiColor,
  depthColor,
  dustColor,
  EVENT_COLORS,
  frpColor,
  ozoneColor,
  pm25Color,
  pressureColor,
  temperatureColor,
  waveColor,
} from "./scales";
import type { AirVariable, WeatherVariable } from "../store";
import { RAIN_FRAMES } from "../store";

const HOUR = 3_600_000;
const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";
const GIBS_GEOGRAPHIC = "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best";
const GIBS_CREDIT = "Imagery: NASA GIBS / EOSDIS";

export const cellId = (lat: number, lng: number) => `${lat},${lng}`;

export interface OverlayInputs {
  data: Partial<EarthDataMap>;
  weatherVariable: WeatherVariable;
  airVariable: AirVariable;
  cloudsDaysAgo: number;
  rainFrame: number;
  selected: { layer: EarthLayerId; id: string } | null;
  tracks: Record<string, BalloonTrackPoint[] | null>;
  enabled: EarthLayerId[];
  oceanVariable: OceanHeatVariable;
  oceanDaysAgo: number;
  seaIceDaysAgo: number;
  sunTime: number;
}

/** Date `daysAgo` before an ISO date (YYYY-MM-DD). */
export function shiftDate(isoDate: string, daysAgo: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export function rainTimes(info: ImageryInfo["rainfall"]): string[] {
  const latest = Date.parse(info.latestTime);
  return Array.from({ length: RAIN_FRAMES }, (_, i) =>
    new Date(latest - (RAIN_FRAMES - 1 - i) * info.stepMinutes * 60_000).toISOString().replace(".000Z", "Z"),
  );
}

const ext = (format: string) => (format.includes("png") ? "png" : "jpg");

/** Overlays for one layer, keyed so several overlays can make up a layer (e.g. temperature + wind). */
export function buildOverlays(layer: EarthLayerId, input: OverlayInputs): Record<string, OverlaySpec | null> {
  const { data } = input;
  const now = Date.now();
  switch (layer) {
    case "earthquakes": {
      const quakes = data.earthquakes;
      if (!quakes) return { earthquakes: null };
      const points: OverlayPoint[] = [...quakes]
        .sort((a, b) => a.mag - b.mag)
        .map((q) => ({
          id: q.id,
          lat: q.lat,
          lng: q.lng,
          size: Math.min(30, Math.max(14, 12 + q.mag * 2.5)),
          color: depthColor(q.depth),
          icon: { glyph: "quake", selected: input.selected?.id === q.id },
          pulse: now - q.time < HOUR,
          label: `M${q.mag.toFixed(1)} · ${q.place}`,
        }));
      return { earthquakes: { kind: "points", points } };
    }
    case "fires": {
      const fires = data.fires;
      if (!fires) return { fires: null };
      return {
        fires: {
          kind: "points",
          points: fires.map(([lat, lng, n, frp]) => ({
            id: cellId(lat, lng),
            lat,
            lng,
            size: Math.min(20, 12 + Math.log2(n + 1)),
            color: frpColor(frp),
            icon: { glyph: "fire", selected: input.selected?.layer === "fires" && input.selected.id === cellId(lat, lng) },
            label: `${n} fire detection${n === 1 ? "" : "s"} · max ${frp} MW`,
          })),
        },
      };
    }
    case "weather": {
      const cells = data.weather;
      if (!cells) return { "weather-shade": null, "weather-wind": null };
      const pressure = input.weatherVariable === "pressure";
      const shade: OverlayCell[] = cells
        .filter((c) => !pressure || Number.isFinite(c.pressure))
        .map((c) => ({
          id: cellId(c.lat, c.lng),
          lat: c.lat,
          lng: c.lng,
          color: pressure ? pressureColor(c.pressure) : temperatureColor(c.temperature),
          label: `${c.temperature.toFixed(1)} °C · wind ${Math.round(c.windSpeed)} km/h · ${Math.round(c.pressure)} hPa`,
        }));
      return {
        "weather-shade": { kind: "cells", step: 10, opacity: 0.42, cells: shade },
        "weather-wind": {
          kind: "particles",
          step: 10,
          color: "rgba(255,255,255,0.9)",
          // Direction is where wind blows FROM; convert km/h to m/s east/north components.
          samples: cells.map((c) => {
            const rad = (c.windDirection * Math.PI) / 180;
            const speed = c.windSpeed / 3.6;
            return { lat: c.lat, lng: c.lng, u: -speed * Math.sin(rad), v: -speed * Math.cos(rad) };
          }),
        },
      };
    }
    case "airquality": {
      const cells = data.airquality;
      if (!cells) return { airquality: null };
      const v = input.airVariable;
      const value = (c: (typeof cells)[number]) => (v === "aqi" ? c.aqi : v === "pm25" ? c.pm25 : v === "dust" ? c.dust : c.ozone);
      const color = v === "aqi" ? aqiColor : v === "pm25" ? pm25Color : v === "dust" ? dustColor : ozoneColor;
      return {
        airquality: {
          kind: "cells",
          step: 15,
          opacity: 0.5,
          cells: cells
            .filter((c) => value(c) !== null)
            .map((c) => ({
              id: cellId(c.lat, c.lng),
              lat: c.lat,
              lng: c.lng,
              color: color(value(c)!),
              label: `AQI ${c.aqi ?? "—"} · PM2.5 ${c.pm25 ?? "—"} µg/m³`,
            })),
        },
      };
    }
    case "clouds": {
      const info = data.imagery?.clouds;
      if (!info) return { clouds: null };
      const date = shiftDate(info.latestDate, input.cloudsDaysAgo);
      return {
        clouds: {
          kind: "tiles",
          url: `${GIBS}/${info.layer}/default/${date}/${info.matrixSet}/{z}/{y}/{x}.${ext(info.format)}`,
          maxLevel: info.maxLevel,
          opacity: 0.88,
          credit: GIBS_CREDIT,
        },
      };
    }
    case "rainfall": {
      const info = data.imagery?.rainfall;
      if (!info) return { rainfall: null };
      return {
        rainfall: {
          kind: "frames",
          urls: rainTimes(info).map(
            (t) => `${GIBS}/${info.layer}/default/${t}/${info.matrixSet}/{z}/{y}/{x}.${ext(info.format)}`,
          ),
          frame: input.rainFrame,
          maxLevel: info.maxLevel,
          opacity: 0.85,
          credit: GIBS_CREDIT,
        },
      };
    }
    case "aurora": {
      const aurora = data.aurora;
      if (!aurora) return { aurora: null };
      return {
        aurora: {
          kind: "points",
          points: aurora.cells.map(([lng, lat, p]) => ({
            lat,
            lng: lng > 180 ? lng - 360 : lng,
            alt: 110_000,
            size: 5 + Math.min(5, p / 12),
            color: p >= 50 ? `rgba(255,90,210,${Math.min(0.9, p / 80)})` : `rgba(57,255,136,${Math.min(0.85, 0.12 + p / 50)})`,
          })),
        },
      };
    }
    case "events": {
      const events = data.events;
      if (!events) return { events: null, "events-track": null };
      const selected = input.selected?.layer === "events" ? events.find((e) => e.id === input.selected!.id) : undefined;
      return {
        events: {
          kind: "points",
          points: events.map((e) => {
            const last = e.track[e.track.length - 1];
            return {
              id: e.id,
              lat: last.lat,
              lng: last.lng,
              size: e.id === selected?.id ? 28 : 22,
              color: EVENT_COLORS[e.category] ?? "#cccccc",
              icon: { glyph: EVENT_GLYPHS[e.category] ?? "alert", selected: e.id === selected?.id },
              label: `${e.categoryTitle} · ${e.title}`,
            };
          }),
        },
        "events-track":
          selected && selected.track.length > 1
            ? {
                kind: "points",
                points: selected.track.slice(0, -1).map((p) => ({
                  lat: p.lat,
                  lng: p.lng,
                  size: 5,
                  color: EVENT_COLORS[selected.category] ?? "#cccccc",
                })),
              }
            : null,
      };
    }
    case "ocean": {
      const cells = data.ocean;
      if (!cells) return { "ocean-waves": null, "ocean-currents": null };
      return {
        "ocean-waves": {
          kind: "cells",
          step: 10,
          opacity: 0.45,
          cells: cells
            .filter((c) => c.waveHeight !== null)
            .map((c) => ({
              id: cellId(c.lat, c.lng),
              lat: c.lat,
              lng: c.lng,
              color: waveColor(c.waveHeight!),
              label: `Waves ${c.waveHeight} m · current ${c.currentSpeed ?? "—"} km/h`,
            })),
        },
        "ocean-currents": {
          kind: "arrows",
          arrows: cells
            .filter((c) => c.currentSpeed !== null && c.currentDirection !== null && c.currentSpeed > 0.2)
            .map((c) => ({
              lat: c.lat,
              lng: c.lng,
              bearing: c.currentDirection!,
              color: "#7ff6ff",
              size: Math.min(30, 12 + c.currentSpeed! * 4),
            })),
        },
      };
    }
    case "buoys": {
      const buoys = data.buoys;
      if (!buoys) return { buoys: null };
      return {
        buoys: {
          kind: "points",
          points: buoys.map((b) => ({
            id: b.id,
            lat: b.lat,
            lng: b.lng,
            size: input.selected?.id === b.id ? 24 : 16,
            color: b.waveHeight !== null ? waveColor(b.waveHeight) : "#ffe08a",
            icon: { glyph: "buoy", selected: input.selected?.id === b.id },
            label: `Buoy ${b.id}${b.waveHeight !== null ? ` · waves ${b.waveHeight} m` : ""}${b.waterTemp !== null ? ` · ${b.waterTemp} °C water` : ""}`,
          })),
        },
      };
    }
    case "balloons": {
      const list = data.balloons;
      if (!list) return { balloons: null, "balloons-track": null };
      const sel = input.selected?.layer === "balloons" ? input.selected.id : null;
      const track = sel ? input.tracks[sel] : null;
      return {
        balloons: {
          kind: "points",
          points: list.map((b) => ({
            id: b.serial,
            lat: b.lat,
            lng: b.lng,
            alt: b.alt,
            size: b.serial === sel ? 26 : 19,
            color: b.climb === null ? "#8fa7b5" : b.climb >= 0 ? "#2fb8c9" : "#e58a2b",
            icon: { glyph: "balloon", selected: b.serial === sel },
            label: `${b.serial} · ${(b.alt / 1000).toFixed(1)} km · ${b.climb === null ? "" : `${b.climb > 0 ? "rising" : "falling"} ${Math.abs(b.climb).toFixed(1)} m/s`}`,
          })),
        },
        "balloons-track": track?.length
          ? {
              kind: "points",
              points: track.map(([lat, lng, alt]) => ({ lat, lng, alt, size: 3, color: "rgba(127,246,255,0.75)" })),
            }
          : null,
      };
    }
    case "trains": {
      const list = data.trains;
      if (!list) return { trains: null };
      const sel = input.selected?.layer === "trains" ? input.selected.id : null;
      return {
        trains: {
          kind: "points",
          points: list.map((t) => ({
            id: t.id,
            lat: t.lat,
            lng: t.lng,
            size: t.id === sel ? 28 : 20,
            color: t.cancelled ? "#7b868d" : t.delay === null ? "#5f7f92" : t.delay <= 1 ? "#1fae55" : t.delay <= 5 ? "#d9a21b" : "#e03a3a",
            icon: { glyph: "train", selected: t.id === sel },
            label: `${t.commuterLine ? `${t.commuterLine}-train` : `${t.type} ${t.number}`} · ${t.from} → ${t.to}${t.delay !== null ? ` · ${t.delay > 0 ? `+${t.delay}` : t.delay} min` : ""}`,
          })),
        },
      };
    }
    case "transit": {
      const transit = data.transit;
      if (!transit) return { transit: null };
      const colors = ["#d64f9b", "#e08a1f", "#3f8fd6", "#8a66e0", "#4fa83b"];
      const sel = input.selected?.layer === "transit" ? input.selected.id : null;
      return {
        transit: {
          kind: "points",
          points: transit.vehicles.map(([lat, lng, , , route, feed, label], i) => ({
            id: String(i),
            lat,
            lng,
            size: String(i) === sel ? 22 : 15,
            color: colors[feed % colors.length],
            icon: { glyph: "bus", selected: String(i) === sel },
            label: `${transit.feeds[feed]?.name ?? "Transit"} · route ${route || "—"} · vehicle ${label}`,
          })),
        },
      };
    }
    case "bikes": {
      const bikes = data.bikes;
      if (!bikes) return { "bike-stations": null, "bike-vehicles": null };
      return {
        "bike-stations": {
          kind: "points",
          points: bikes.stations.map(([lat, lng, n, docks, , name], i) => ({
            id: `s${i}`,
            lat,
            lng,
            size: 14,
            color: n === 0 ? "#d63b3b" : n < 3 ? "#d98a1f" : "#1f9e8f",
            icon: { glyph: "bike", shape: "square", selected: input.selected?.layer === "bikes" && input.selected.id === `s${i}` },
            label: `${name} · ${n} bikes · ${docks} free docks`,
          })),
        },
        "bike-vehicles": {
          kind: "points",
          points: bikes.vehicles.map(([lat, lng, , kind, range], i) => ({
            id: `v${i}`,
            lat,
            lng,
            size: 11,
            color: kind === 1 ? "#8a5fd6" : "#3f9a35",
            icon: { glyph: kind === 1 ? "scooter" : "bike", selected: input.selected?.layer === "bikes" && input.selected.id === `v${i}` },
            label: `${kind === 1 ? "Scooter" : "Bike"}${range !== null ? ` · ${range} km range` : ""}`,
          })),
        },
      };
    }
    case "gliders": {
      const list = data.gliders;
      if (!list) return { gliders: null };
      const sel = input.selected?.layer === "gliders" ? input.selected.id : null;
      return {
        gliders: {
          kind: "points",
          points: list.map((a) => ({
            id: a.id,
            lat: a.lat,
            lng: a.lng,
            alt: a.alt,
            size: a.id === sel ? 26 : 18,
            // Thermalling (climbing) aircraft glow warm; sinking ones cool.
            color: a.climb === null ? "#c9a227" : a.climb > 0.5 ? "#e07b12" : a.climb < -0.5 ? "#3f86d6" : "#c9a227",
            icon: { glyph: "glider", selected: a.id === sel },
            label: `${a.identified ? a.registration || a.cn || a.aircraftType : `${a.aircraftType} (anonymous)`} · ${a.alt.toLocaleString()} m${a.climb !== null ? ` · ${a.climb > 0 ? "+" : ""}${a.climb} m/s` : ""}`,
          })),
        },
      };
    }
    case "news": {
      const places = data.news;
      if (!places) return { news: null };
      const sel = input.selected?.layer === "news" ? input.selected.id : null;
      return {
        news: {
          kind: "points",
          points: [...places]
            .sort((a, b) => a.count - b.count)
            .map((p) => ({
              id: p.id,
              lat: p.lat,
              lng: p.lng,
              size: Math.min(30, 14 + Math.log2(p.count + 1) * 2.5),
              color: p.count >= 50 ? "#d9541f" : p.count >= 10 ? "#e08a1f" : "#b58f1c",
              icon: { glyph: "news", selected: p.id === sel },
              label: `${p.name} · ${p.count} article${p.count === 1 ? "" : "s"}`,
            })),
        },
      };
    }
    case "outages": {
      const list = data.outages;
      if (!list) return { outages: null };
      const sel = input.selected?.layer === "outages" ? input.selected.id : null;
      const max = Math.max(1, ...list.map((o) => o.score));
      return {
        outages: {
          kind: "points",
          points: list.map((o) => {
            const severity = Math.log10(o.score + 1) / Math.log10(max + 1); // 0..1 relative
            return {
              id: o.code,
              lat: o.lat,
              lng: o.lng,
              size: 16 + severity * 14,
              color: severity > 0.66 ? "#d63b3b" : severity > 0.33 ? "#e0761f" : "#c9a227",
              icon: { glyph: "outage", selected: o.code === sel },
              pulse: o.alerts.some((a) => a.level === "critical" && Date.now() - a.time < 3 * 3_600_000),
              label: `${o.name} · internet outage (${o.events} event${o.events === 1 ? "" : "s"})`,
            };
          }),
        },
      };
    }
    case "daynight": {
      const time = input.sunTime || Date.now();
      const sun = subsolarPoint(time);
      // Night shade on a 5° grid: clear in daylight, fading in through twilight (0° to −12°).
      const shade: OverlayCell[] = [];
      for (let lat = -87.5; lat < 90; lat += 5) {
        for (let lng = -177.5; lng < 180; lng += 5) {
          const elevation = solarElevation(lat, lng, time);
          if (elevation > 0) continue;
          const alpha = Math.min(0.55, (-elevation / 12) * 0.55);
          shade.push({ lat, lng, color: `rgba(2,8,22,${alpha.toFixed(3)})` });
        }
      }
      return {
        "daynight-shade": { kind: "cells", step: 5, opacity: 1, cells: shade },
        "daynight-light": { kind: "lighting", time },
        "daynight-line": {
          kind: "points",
          points: terminator(time, 1.5).map((p) => ({ lat: p.lat, lng: p.lng, size: 3, color: "rgba(255,211,107,0.85)" })),
        },
        "daynight-sun": {
          kind: "points",
          points: [
            {
              id: "sun",
              lat: sun.lat,
              lng: sun.lng,
              size: 26,
              color: "#e0a81f",
              icon: { glyph: "sun" },
              label: `Sun overhead · ${sun.lat.toFixed(1)}°, ${sun.lng.toFixed(1)}° · elevation ${solarElevation(sun.lat, sun.lng, time).toFixed(0)}°`,
            },
          ],
        },
      };
    }
    case "solar": {
      // The Aurora layer already draws the oval; avoid drawing it twice.
      if (input.enabled.includes("aurora") || !data.aurora) return { "solar-aurora": null };
      const aurora = buildOverlays("aurora", input).aurora;
      return { "solar-aurora": aurora ?? null };
    }
    case "oceanheat": {
      const latest = data.oceanheat?.latest[input.oceanVariable];
      if (!latest) return { oceanheat: null };
      const date = shiftDate(latest, input.oceanDaysAgo);
      return {
        oceanheat: {
          kind: "image",
          url: `/api/earth/oceanheat/image?var=${input.oceanVariable}&date=${date}`,
          west: -180,
          south: -90,
          east: 180,
          north: 90,
          opacity: 0.82,
          credit: "NOAA Coral Reef Watch",
        },
      };
    }
    case "seaice": {
      const info = data.seaice?.imagery;
      if (!info?.latestDate) return { seaice: null };
      const date = shiftDate(info.latestDate, input.seaIceDaysAgo);
      return {
        seaice: {
          kind: "tiles",
          geographic: true,
          url: `${GIBS_GEOGRAPHIC}/${info.layer}/default/${date}/${info.matrixSet}/{z}/{y}/{x}.png`,
          maxLevel: 5,
          opacity: 0.9,
          credit: "Sea ice: GHRSST MUR via NASA GIBS; extent: NSIDC Sea Ice Index",
        },
      };
    }
    case "launches": {
      const list = data.launches;
      if (!list) return { launches: null };
      const sel = input.selected?.layer === "launches" ? input.selected.id : null;
      const color = (abbrev: string) =>
        abbrev === "Go" ? "#1fae55" : abbrev === "Hold" ? "#e08a1f" : abbrev === "In Flight" ? "#2fb8c9" : "#b58f1c";
      return {
        launches: {
          kind: "points",
          points: list.map((l) => ({
            id: l.id,
            lat: l.lat,
            lng: l.lng,
            size: l.id === sel ? 30 : 24,
            color: color(l.statusAbbrev),
            icon: { glyph: "rocket", selected: l.id === sel },
            pulse: l.net - Date.now() < 3_600_000 && l.net > Date.now() - 3_600_000,
            label: `${l.name} · ${new Date(l.net).toUTCString().slice(5, 22)} UTC`,
          })),
        },
      };
    }
  }
}

/** Overlay key → layer, for routing globe clicks. */
export const OVERLAY_LAYER: Record<string, EarthLayerId> = {
  earthquakes: "earthquakes",
  fires: "fires",
  "weather-shade": "weather",
  airquality: "airquality",
  events: "events",
  "ocean-waves": "ocean",
  buoys: "buoys",
  balloons: "balloons",
  trains: "trains",
  transit: "transit",
  "bike-stations": "bikes",
  "bike-vehicles": "bikes",
  launches: "launches",
  gliders: "gliders",
  news: "news",
  outages: "outages",
};

export const ALL_OVERLAY_KEYS = [
  "earthquakes", "fires", "weather-shade", "weather-wind", "airquality", "clouds", "rainfall",
  "aurora", "events", "events-track", "ocean-waves", "ocean-currents", "buoys",
  "balloons", "balloons-track", "trains", "transit", "bike-stations", "bike-vehicles", "launches", "gliders",
  "news", "outages", "daynight-shade", "daynight-light", "daynight-line", "daynight-sun", "solar-aurora", "oceanheat", "seaice",
];
