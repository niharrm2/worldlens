"use client";

import { useShallow } from "zustand/react/shallow";

import { useShellStore } from "@/features/shell/store";
import { EVENT_GLYPHS, glyphInlineSvg, glyphMarker, type BadgeShape, type GlyphId } from "@/lib/icons/map-glyphs";
import type { EarthLayerId } from "@/types/earth";

import { EARTH_LAYERS, type EarthLayerDef } from "../lib/layers";
import { rainTimes, shiftDate } from "../lib/overlays";
import {
  AQI_STOPS,
  DEPTH_STOPS,
  DUST_STOPS,
  EVENT_COLORS,
  FRP_STOPS,
  gradientCss,
  OZONE_STOPS,
  PM25_STOPS,
  PRESSURE_STOPS,
  TEMPERATURE_STOPS,
  WAVE_STOPS,
} from "../lib/scales";
import { subsolarPoint } from "@/lib/sun";

import { OceanHeatControls, SeaIceControls, SolarDashboard } from "./PlanetExtraControls";
import { groupOf, RAIN_FRAMES, shiftIsoDate, useEarthStore, type AirVariable, type LayerGroup as LayerGroupId, type WeatherVariable } from "../store";

const utcTime = (t: number) =>
  new Date(t).toLocaleString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) + " UTC";

function Legend({ stops, from, to }: { stops: [number, string][]; from: string; to: string }) {
  return (
    <div className="earth-legend">
      <i style={{ background: gradientCss(stops) }} />
      <span>{from}</span>
      <span>{to}</span>
    </div>
  );
}

type SwatchItem = [label: string, color: string, glyph?: GlyphId, shape?: BadgeShape];

/** Legend row: plain colour dots, or the actual marker badge when a glyph is given. */
function Swatches({ items }: { items: SwatchItem[] }) {
  return (
    <div className="earth-swatches">
      {items.map(([label, color, glyph, shape]) => (
        <span key={label}>
          {glyph ? (
            <img className="earth-badge" src={glyphMarker(glyph, color, shape)} alt="" />
          ) : (
            <b style={{ background: color }} />
          )}
          {label}
        </span>
      ))}
    </div>
  );
}

/** Layer symbol beside its switch, tinted with the layer colour. */
function LayerGlyph({ def }: { def: EarthLayerDef }) {
  return (
    <span
      className="earth-glyph"
      style={{ color: def.swatch }}
      // Static glyph markup from map-glyphs.
      dangerouslySetInnerHTML={{ __html: glyphInlineSvg(def.glyph, "currentColor") }}
    />
  );
}

/** Status line for a layer: item count and data time, loading, or error. */
function useLayerStatus(def: EarthLayerDef): string {
  return useEarthStore((s) => {
    const status = s.status[def.data];
    const payload = s.data[def.data];
    const error = s.errors[def.data];
    // Derived from the minute clock only, so the selector stays stable between reads.
    if (def.local) {
      if (!s.sunTime) return "Calculating…";
      const p = subsolarPoint(s.sunTime);
      return `Sun overhead at ${p.lat.toFixed(1)}°, ${p.lng.toFixed(1)}° · click anywhere for local sun times`;
    }
    if (status === "loading" && !payload) return "Loading…";
    if (status === "error") return `Unavailable: ${error}`;
    if (!payload) return "";
    const items = payload.items as unknown;
    const NOUNS: Partial<Record<EarthLayerId, string>> = {
      fires: "hotspot cells", buoys: "stations", events: "open events", earthquakes: "earthquakes",
      balloons: "balloons", trains: "trains", launches: "upcoming launches", gliders: "aircraft",
      news: "places in the news", outages: "countries with outages",
    };
    if (def.id === "solar" && s.data.solar) {
      const w = s.data.solar.items.wind;
      return `${w.speed !== null ? `Solar wind ${Math.round(w.speed)} km/s · ` : ""}data ${utcTime(payload.dataTime)}`;
    }
    if (def.id === "oceanheat" && s.data.oceanheat) {
      const latest = s.data.oceanheat.items.latest[s.oceanVariable];
      return latest ? `Showing ${shiftIsoDate(latest, s.oceanDaysAgo)} · NOAA Coral Reef Watch` : "No data";
    }
    if (def.id === "seaice" && s.data.seaice) {
      const date = s.data.seaice.items.imagery.latestDate;
      return date ? `Showing ${shiftIsoDate(date, s.seaIceDaysAgo)}` : "No imagery date";
    }
    let count = Array.isArray(items) ? `${items.length.toLocaleString()} ${NOUNS[def.id] ?? "grid cells"} · ` : "";
    if (def.id === "transit" && s.data.transit) {
      count = s.data.transit.items.feeds.map((f) => `${f.name.split(" · ")[0]} ${f.error ? "unavailable" : f.count}`).join(", ") + " · ";
    }
    if (def.id === "bikes" && s.data.bikes) {
      const b = s.data.bikes.items;
      const down = b.systems.filter((x) => x.error && !x.stations && !x.vehicles).length;
      count = `${b.stations.length.toLocaleString()} stations, ${b.vehicles.length.toLocaleString()} parked vehicles${down ? ` (${down} systems unavailable)` : ""} · `;
    }
    if (def.id === "clouds" && s.data.imagery) {
      return `Daily mosaic ${shiftDate(s.data.imagery.items.clouds.latestDate, s.cloudsDaysAgo)}`;
    }
    return `${error ? `Delayed (${error}) · ` : ""}${count}data ${utcTime(payload.dataTime)}`;
  });
}

function LayerControls({ id }: { id: EarthLayerId }) {
  const s = useEarthStore(
    useShallow((x) => ({
      weatherVariable: x.weatherVariable,
      airVariable: x.airVariable,
      cloudsDaysAgo: x.cloudsDaysAgo,
      rainFrame: x.rainFrame,
      rainPlaying: x.rainPlaying,
      imagery: x.data.imagery?.items,
    })),
  );
  const a = useEarthStore.getState();

  switch (id) {
    case "earthquakes":
      return (
        <Swatches
          items={[
            ["Shallow < 70 km", DEPTH_STOPS[0][1], "quake"],
            ["70–300 km", DEPTH_STOPS[1][1], "quake"],
            ["Deep > 300 km", DEPTH_STOPS[2][1], "quake"],
          ]}
        />
      );
    case "fires":
      return (
        <Swatches
          items={FRP_STOPS.map(([max, c], i): SwatchItem => [i === FRP_STOPS.length - 1 ? "> 200 MW" : `≤ ${max} MW`, c, "fire"])}
        />
      );
    case "weather":
      return (
        <>
          <select
            aria-label="Weather shading"
            value={s.weatherVariable}
            onChange={(e) => a.setWeatherVariable(e.target.value as WeatherVariable)}
          >
            <option value="temperature">Temperature</option>
            <option value="pressure">Sea-level pressure</option>
          </select>
          {s.weatherVariable === "temperature" ? (
            <Legend stops={TEMPERATURE_STOPS} from="−40 °C" to="45 °C" />
          ) : (
            <Legend stops={PRESSURE_STOPS} from="960 hPa" to="1045 hPa" />
          )}
        </>
      );
    case "airquality": {
      const legends: Record<AirVariable, [[number, string][], string, string]> = {
        aqi: [AQI_STOPS, "Good", "Hazardous"],
        pm25: [PM25_STOPS, "0 µg/m³", "250+ µg/m³"],
        dust: [DUST_STOPS, "0 µg/m³", "800 µg/m³"],
        ozone: [OZONE_STOPS, "0 µg/m³", "200 µg/m³"],
      };
      const [stops, from, to] = legends[s.airVariable];
      return (
        <>
          <select
            aria-label="Air quality measure"
            value={s.airVariable}
            onChange={(e) => a.setAirVariable(e.target.value as AirVariable)}
          >
            <option value="aqi">US AQI</option>
            <option value="pm25">PM2.5</option>
            <option value="dust">Dust</option>
            <option value="ozone">Ozone</option>
          </select>
          <Legend stops={stops} from={from} to={to} />
        </>
      );
    }
    case "clouds": {
      const latest = s.imagery?.clouds.latestDate;
      return (
        <label className="earth-slider">
          <span>{latest ? shiftDate(latest, s.cloudsDaysAgo) : "—"}</span>
          <input
            type="range"
            min={0}
            max={6}
            value={6 - s.cloudsDaysAgo}
            onChange={(e) => a.setCloudsDaysAgo(6 - Number(e.target.value))}
            aria-label="Imagery date"
          />
        </label>
      );
    }
    case "rainfall": {
      const times = s.imagery ? rainTimes(s.imagery.rainfall) : [];
      return (
        <>
          <div className="earth-slider">
            <button className="button quiet" onClick={a.toggleRainPlaying}>
              {s.rainPlaying ? "Ⅱ Pause" : "▶ Play"}
            </button>
            <input
              type="range"
              min={0}
              max={RAIN_FRAMES - 1}
              value={s.rainFrame}
              onChange={(e) => a.setRainFrame(Number(e.target.value))}
              aria-label="Rainfall time"
            />
            <span>{times[s.rainFrame] ? utcTime(Date.parse(times[s.rainFrame])) : "—"}</span>
          </div>
          <Legend stops={[[0, "#4fd1ff"], [1, "#2b8fe0"], [2, "#3a4fd6"], [3, "#d62faa"], [4, "#ffe600"]]} from="Light" to="Heavy" />
        </>
      );
    }
    case "aurora":
      return <Swatches items={[["Possible", "#39ff88"], ["Likely ≥ 50 %", "#ff5ad2"]]} />;
    case "events":
      return (
        <Swatches
          items={Object.entries(EVENT_COLORS)
            .slice(0, 8)
            .map(([k, c]): SwatchItem => [k.replace(/([A-Z])/g, " $1").replace(/^./, (x) => x.toUpperCase()), c, EVENT_GLYPHS[k] ?? "alert"])}
        />
      );
    case "ocean":
      return (
        <>
          <Legend stops={WAVE_STOPS} from="0 m" to="9 m" />
          <Swatches items={[["Current arrow", "#7ff6ff"]]} />
        </>
      );
    case "buoys":
      return <Swatches items={[["Coloured by wave height", WAVE_STOPS[2][1], "buoy"], ["No wave data", "#ffe08a", "buoy"]]} />;
    case "balloons":
      return <Swatches items={[["Rising", "#2fb8c9", "balloon"], ["Descending", "#e58a2b", "balloon"]]} />;
    case "trains":
      return (
        <Swatches
          items={[
            ["On time", "#1fae55", "train"],
            ["2–5 min late", "#d9a21b", "train"],
            ["> 5 min late", "#e03a3a", "train"],
            ["Cancelled", "#7b868d", "train"],
          ]}
        />
      );
    case "transit":
      return <Swatches items={[["Helsinki", "#d64f9b", "bus"], ["Boston", "#e08a1f", "bus"], ["SE Queensland", "#3f8fd6", "bus"]]} />;
    case "bikes":
      return (
        <Swatches
          items={[
            ["Station: bikes available", "#1f9e8f", "bike", "square"],
            ["Few", "#d98a1f", "bike", "square"],
            ["Empty", "#d63b3b", "bike", "square"],
            ["Parked bike", "#3f9a35", "bike"],
            ["Scooter", "#8a5fd6", "scooter"],
          ]}
        />
      );
    case "gliders":
      return (
        <Swatches
          items={[["Climbing (thermal)", "#e07b12", "glider"], ["Level", "#c9a227", "glider"], ["Sinking", "#3f86d6", "glider"]]}
        />
      );
    case "news":
      return (
        <Swatches
          items={[["Under 10 articles", "#b58f1c", "news"], ["10–49", "#e08a1f", "news"], ["50 or more", "#d9541f", "news"]]}
        />
      );
    case "outages":
      return (
        <Swatches
          items={[["Minor", "#c9a227", "outage"], ["Moderate", "#e0761f", "outage"], ["Severe (relative)", "#d63b3b", "outage"]]}
        />
      );
    case "daynight":
      return (
        <Swatches items={[["Sun overhead", "#e0a81f", "sun"], ["Day/night line", "#ffd36b"]]} />
      );
    case "solar":
      return <SolarDashboard />;
    case "oceanheat":
      return <OceanHeatControls />;
    case "seaice":
      return <SeaIceControls />;
    case "launches":
      return (
        <Swatches
          items={[["Go", "#1fae55", "rocket"], ["TBD / TBC", "#b58f1c", "rocket"], ["Hold", "#e08a1f", "rocket"], ["In flight", "#2fb8c9", "rocket"]]}
        />
      );
  }
}

function LayerCard({ def }: { def: EarthLayerDef }) {
  const enabled = useEarthStore((s) => s.enabled.includes(def.id));
  const toggle = useEarthStore((s) => s.toggle);
  const status = useLayerStatus(def);
  return (
    <div className={`earth-layer${enabled ? " on" : ""}`}>
      <div className="earth-layer-head" onClick={() => toggle(def.id)}>
        <LayerGlyph def={def} />
        <strong>{def.title}</strong>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`${def.title}: ${enabled ? "on" : "off"}`}
          className="wl-switch"
          onClick={(e) => {
            e.stopPropagation();
            toggle(def.id);
          }}
        >
          <span />
        </button>
      </div>
      <p>{def.description}</p>
      {enabled && (
        <div className="earth-layer-body">
          <LayerControls id={def.id} />
          <small className="earth-status" role="status">
            {status}
          </small>
          <small>
            <a href={def.source.url} target="_blank" rel="noopener noreferrer">
              {def.source.name} ↗
            </a>{" "}
            · {def.freshness}
          </small>
        </div>
      )}
    </div>
  );
}

function LayerGroup({ title, layers }: { title: string; layers: EarthLayerDef[] }) {
  const onCount = useEarthStore((s) => layers.filter((l) => s.enabled.includes(l.id)).length);
  const setEnabled = useEarthStore((s) => s.setEnabled);
  const ids = layers.map((l) => l.id);
  return (
    <section className="earth-group">
      <div className="earth-group-head">
        <span className="sectionlabel">
          {title.toUpperCase()} · {onCount}/{layers.length} ON
        </span>
        <button type="button" disabled={onCount === layers.length} onClick={() => setEnabled(ids, true)}>
          All on
        </button>
        <button type="button" disabled={onCount === 0} onClick={() => setEnabled(ids, false)}>
          All off
        </button>
      </div>
      {layers.map((def) => (
        <LayerCard key={def.id} def={def} />
      ))}
    </section>
  );
}

const PANELS = {
  planet: {
    eyebrow: "THE LIVING PLANET",
    title: "Earth, now.",
    subtitle: "Live layers.",
    intro: "Earthquakes, fires, weather, air, clouds, rain, aurora, disasters, oceans and buoys. Combine any.",
    groupTitle: "Planet",
    footer:
      "Model layers (weather, air quality, ocean) are coarse global samples refreshed every few hours to stay within Open-Meteo's free, non-commercial limits. Image layers need WebGL; the compatibility globe draws markers and cells only.",
  },
  movement: {
    eyebrow: "THE WORLD IN MOTION",
    title: "On the move.",
    subtitle: "Live movement.",
    intro: "Trains, buses and trams, gliders, shared bikes, weather balloons and rocket launches. Combine any.",
    groupTitle: "Movement",
    footer:
      "Coverage depends on each provider: trains are Finland only, transit covers the cities listed, gliders follow OGN receivers and privacy opt-outs, and bikes show parked vehicles only. Launches are schedules, not live telemetry.",
  },
} as const;

/** Layer panel for the Earth option (planet layers) or the Movement option (movement layers). */
export function EarthDirectory() {
  const group: LayerGroupId = useShellStore((s) => (s.mode === "movement" ? "movement" : "planet"));
  const layers = EARTH_LAYERS.filter((d) => (d.group ?? "planet") === group);
  const count = useEarthStore((s) => s.enabled.filter((id) => groupOf(id) === group).length);
  const copy = PANELS[group];
  return (
    <div className="earth-directory">
      <div className="directoryhead">
        <div className="eyebrow">{copy.eyebrow}</div>
        <h1>
          {copy.title}
          <br />
          <span>{copy.subtitle}</span>
        </h1>
        <p>{copy.intro}</p>
        <div className="sat-counters">
          <strong>{count}</strong>
          <span>layers on · click markers or cells for details</span>
        </div>
      </div>
      <div className="earth-layers">
        <LayerGroup title={copy.groupTitle} layers={layers} />
        <div className="sat-datafooter">{copy.footer}</div>
      </div>
    </div>
  );
}
