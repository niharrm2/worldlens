"use client";

import type { ReactNode } from "react";

import { getGlobe } from "@/features/globe/store";
import { useNow } from "@/features/flights/hooks/useNow";
import { nauticalOffset, solarClock, solarElevation, sunTimes } from "@/lib/sun";
import { useShellStore } from "@/features/shell/store";

import { layerDef } from "../lib/layers";
import { cellId } from "../lib/overlays";
import { aqiCategory, EVENT_COLORS } from "../lib/scales";
import { useEarthStore } from "../store";

const utc = (t: number) => new Date(t).toUTCString().replace("GMT", "UTC");
const fmt = (v: number | null | undefined, unit: string, digits = 1) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v.toFixed(digits)}${unit}`;
const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
const compass = (deg: number | null) =>
  deg === null ? "—" : `${Math.round(deg)}° ${["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8]}`;

function Metrics({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <div className="sat-metrics">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function Body() {
  const selected = useEarthStore((s) => s.selected);
  const data = useEarthStore((s) => s.data);
  if (!selected) {
    return (
      <>
        <h2>Explore the planet</h2>
        <p className="sat-explanation">Click an earthquake, fire, event, buoy or a shaded grid cell on the globe.</p>
      </>
    );
  }
  const { layer, id } = selected;
  const flyTo = (lat: number, lng: number, zoom = 6) => getGlobe()?.flyTo([lat, lng], zoom, { duration: 1.2 });

  switch (layer) {
    case "earthquakes": {
      const q = data.earthquakes?.items.find((x) => x.id === id);
      if (!q) break;
      return (
        <>
          <h2>
            M{q.mag.toFixed(1)} · {q.place}
          </h2>
          <p className="sat-explanation">
            {utc(q.time)} ({ago(q.time)})
          </p>
          <Metrics
            rows={[
              ["MAGNITUDE", `${q.mag.toFixed(1)} ${q.magType}`],
              ["DEPTH", `${q.depth.toFixed(1)} km`],
              ["FELT REPORTS", q.felt ?? "—"],
              ["PAGER ALERT", q.alert ?? "None"],
              ["TSUNAMI FLAG", q.tsunami ? "Yes — check official warnings" : "No"],
              ["LOCATION", `${q.lat.toFixed(3)}°, ${q.lng.toFixed(3)}°`],
            ]}
          />
          <button className="button primary full" onClick={() => flyTo(q.lat, q.lng)}>
            Centre earthquake ↗
          </button>
          <a className="sourcelink" href={q.url} target="_blank" rel="noopener noreferrer">
            USGS event page ↗
          </a>
        </>
      );
    }
    case "fires": {
      const f = data.fires?.items.find(([lat, lng]) => cellId(lat, lng) === id);
      if (!f) break;
      const [lat, lng, n, frp, t] = f;
      return (
        <>
          <h2>Thermal hotspot cluster</h2>
          <p className="sat-explanation">
            Satellite heat detections within a 0.25° cell. These can be wildfires, agricultural burning, volcanoes or
            industrial heat sources.
          </p>
          <Metrics
            rows={[
              ["DETECTIONS (24 H)", n],
              ["MAX FIRE POWER", `${frp} MW`],
              ["LATEST PASS", utc(t)],
              ["CELL CENTRE", `${lat.toFixed(2)}°, ${lng.toFixed(2)}°`],
            ]}
          />
          <button className="button primary full" onClick={() => flyTo(lat, lng, 8)}>
            Zoom to hotspot ↗
          </button>
        </>
      );
    }
    case "weather": {
      const c = data.weather?.items.find((x) => cellId(x.lat, x.lng) === id);
      if (!c) break;
      return (
        <>
          <h2>Weather near {c.lat.toFixed(0)}°, {c.lng.toFixed(0)}°</h2>
          <p className="sat-explanation">Model values at the centre of a 10° grid cell, {utc(data.weather!.dataTime)}.</p>
          <Metrics
            rows={[
              ["TEMPERATURE", fmt(c.temperature, " °C")],
              ["WIND", `${Math.round(c.windSpeed)} km/h`],
              ["WIND FROM", compass(c.windDirection)],
              ["PRESSURE (MSL)", fmt(c.pressure, " hPa", 0)],
            ]}
          />
        </>
      );
    }
    case "airquality": {
      const c = data.airquality?.items.find((x) => cellId(x.lat, x.lng) === id);
      if (!c) break;
      return (
        <>
          <h2>Air quality near {c.lat.toFixed(1)}°, {c.lng.toFixed(1)}°</h2>
          <p className="sat-explanation">
            CAMS model estimate at the centre of a 15° cell, {utc(data.airquality!.dataTime)}. Not a sensor reading.
          </p>
          <Metrics
            rows={[
              ["US AQI", c.aqi === null ? "—" : `${c.aqi} · ${aqiCategory(c.aqi)}`],
              ["PM2.5", fmt(c.pm25, " µg/m³")],
              ["DUST", fmt(c.dust, " µg/m³", 0)],
              ["OZONE", fmt(c.ozone, " µg/m³", 0)],
            ]}
          />
        </>
      );
    }
    case "ocean": {
      const c = data.ocean?.items.find((x) => cellId(x.lat, x.lng) === id);
      if (!c) break;
      return (
        <>
          <h2>Ocean near {c.lat.toFixed(0)}°, {c.lng.toFixed(0)}°</h2>
          <p className="sat-explanation">Marine model values at the centre of a 10° cell, {utc(data.ocean!.dataTime)}.</p>
          <Metrics
            rows={[
              ["WAVE HEIGHT", fmt(c.waveHeight, " m")],
              ["WAVES FROM", compass(c.waveDirection)],
              ["CURRENT", fmt(c.currentSpeed, " km/h")],
              ["CURRENT TOWARDS", compass(c.currentDirection)],
            ]}
          />
        </>
      );
    }
    case "events": {
      const e = data.events?.items.find((x) => x.id === id);
      if (!e) break;
      const last = e.track[e.track.length - 1];
      return (
        <>
          <div className="earth-category" style={{ color: EVENT_COLORS[e.category] }}>
            ● {e.categoryTitle}
          </div>
          <h2>{e.title}</h2>
          <button className="button primary full" onClick={() => flyTo(last.lat, last.lng, 5)}>
            Centre event ↗
          </button>
          <div className="sectionlabel">TIMELINE · {e.track.length} REPORTS</div>
          <ol className="earth-timeline">
            {[...e.track].reverse().slice(0, 25).map((p, i) => (
              <li key={i}>
                <strong>{utc(p.date)}</strong>
                <span>
                  {p.lat.toFixed(2)}°, {p.lng.toFixed(2)}°
                  {p.magnitude !== null ? ` · ${p.magnitude} ${p.unit ?? ""}` : ""}
                </span>
              </li>
            ))}
          </ol>
          <p className="flight-status">
            Sources:{" "}
            {e.sources.map((s, i) => (
              <span key={s.id}>
                {i ? ", " : ""}
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.id}
                </a>
              </span>
            ))}{" "}
            · <a href={e.link} target="_blank" rel="noopener noreferrer">EONET record ↗</a>
          </p>
        </>
      );
    }
    case "buoys": {
      const b = data.buoys?.items.find((x) => x.id === id);
      if (!b) break;
      return (
        <>
          <h2>Station {b.id}</h2>
          <p className="sat-explanation">
            Observed {utc(b.time)} ({ago(b.time)}) at {b.lat.toFixed(3)}°, {b.lng.toFixed(3)}°.
          </p>
          <Metrics
            rows={[
              ["WIND", b.windSpeed === null ? "—" : `${b.windSpeed} m/s from ${compass(b.windDirection)}`],
              ["GUST", fmt(b.gust, " m/s")],
              ["WAVE HEIGHT", fmt(b.waveHeight, " m")],
              ["DOMINANT PERIOD", fmt(b.dominantPeriod, " s", 0)],
              ["PRESSURE", fmt(b.pressure, " hPa")],
              ["AIR TEMP", fmt(b.airTemp, " °C")],
              ["WATER TEMP", fmt(b.waterTemp, " °C")],
              ["DEW POINT", fmt(b.dewPoint, " °C")],
            ]}
          />
          <a
            className="sourcelink"
            href={`https://www.ndbc.noaa.gov/station_page.php?station=${encodeURIComponent(b.id)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            NDBC station page ↗
          </a>
        </>
      );
    }
    case "balloons": {
      const b = data.balloons?.items.find((x) => x.serial === id);
      if (!b) break;
      return <BalloonBody balloon={b} onCentre={() => flyTo(b.lat, b.lng, 7)} />;
    }
    case "trains": {
      const t = data.trains?.items.find((x) => x.id === id);
      if (!t) break;
      return (
        <>
          <h2>{t.commuterLine ? `${t.commuterLine}-train ${t.number}` : `${t.type} ${t.number}`}</h2>
          <p className="sat-explanation">
            {t.from} → {t.to}
            {t.cancelled ? " · cancelled" : ""}
          </p>
          <Metrics
            rows={[
              ["SPEED", `${t.speed} km/h`],
              ["DELAY", t.delay === null ? "Not yet reported" : t.delay > 0 ? `${t.delay} min late` : t.delay < 0 ? `${-t.delay} min early` : "On time"],
              ["NEXT STATION", t.nextStation || "—"],
              ["OPERATOR", t.operator.toUpperCase() || "—"],
              ["POSITION", `${t.lat.toFixed(4)}°, ${t.lng.toFixed(4)}°`],
              ["REPORTED", ago(t.time)],
            ]}
          />
          <button className="button primary full" onClick={() => flyTo(t.lat, t.lng, 10)}>
            Centre train ↗
          </button>
          <a
            className="sourcelink"
            href={`https://rata.digitraffic.fi/api/v1/trains/${t.id.split("/")[0]}/${t.number}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Full timetable (Digitraffic JSON) ↗
          </a>
        </>
      );
    }
    case "transit": {
      const transit = data.transit?.items;
      const v = transit?.vehicles[Number(id)];
      if (!transit || !v) break;
      const [lat, lng, bearing, speed, route, feed, label, status, stopId, time] = v;
      const f = transit.feeds[feed];
      return (
        <>
          <h2>Route {route || "—"}</h2>
          <p className="sat-explanation">
            {f?.name} · vehicle {label}
          </p>
          <Metrics
            rows={[
              ["STATUS", status && stopId ? `${status} stop ${stopId}` : status || "—"],
              ["SPEED", speed === null ? "—" : `${Math.round(speed * 3.6)} km/h`],
              ["HEADING", compass(bearing)],
              ["REPORTED", time ? ago(time * 1000) : "—"],
              ["POSITION", `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`],
            ]}
          />
          <p className="flight-status">
            Route and stop IDs come from the agency&apos;s GTFS schedule. Data: {f?.license}.
          </p>
          <button className="button primary full" onClick={() => flyTo(lat, lng, 13)}>
            Centre vehicle ↗
          </button>
        </>
      );
    }
    case "bikes": {
      const bikes = data.bikes?.items;
      if (!bikes) break;
      if (id.startsWith("s")) {
        const st = bikes.stations[Number(id.slice(1))];
        if (!st) break;
        const [lat, lng, n, docks, sys, name] = st;
        const system = bikes.systems[sys];
        return (
          <>
            <h2>{name}</h2>
            <p className="sat-explanation">
              {system?.name} · {system?.city}
            </p>
            <Metrics rows={[["BIKES AVAILABLE", n], ["FREE DOCKS", docks], ["POSITION", `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`]]} />
            <button className="button primary full" onClick={() => flyTo(lat, lng, 15)}>
              Centre station ↗
            </button>
          </>
        );
      }
      const veh = bikes.vehicles[Number(id.slice(1))];
      if (!veh) break;
      const [lat, lng, sys, kind, range] = veh;
      return (
        <>
          <h2>Parked {kind === 1 ? "scooter" : "bike"}</h2>
          <p className="sat-explanation">
            {bikes.systems[sys]?.name} · {bikes.systems[sys]?.city}. Only parked, available vehicles are published — rides
            are never tracked.
          </p>
          <Metrics rows={[["RANGE", range === null ? "—" : `${range} km`], ["POSITION", `${lat.toFixed(5)}°, ${lng.toFixed(5)}°`]]} />
        </>
      );
    }
    case "gliders": {
      const a = data.gliders?.items.find((x) => x.id === id);
      if (!a) break;
      return (
        <>
          <h2>{a.identified ? a.registration || a.cn || a.aircraftType : `${a.aircraftType} · anonymous`}</h2>
          <p className="sat-explanation">
            {a.identified
              ? [a.model, a.cn && `CN ${a.cn}`].filter(Boolean).join(" · ") || a.aircraftType
              : a.registered
                ? "The owner has chosen not to be identified in the OGN Devices Database."
                : "Device not registered in the OGN Devices Database, so it is shown without identification."}
          </p>
          <Metrics
            rows={[
              ["ALTITUDE", `${a.alt.toLocaleString()} m`],
              ["CLIMB", a.climb === null ? "—" : `${a.climb > 0 ? "+" : ""}${a.climb} m/s`],
              ["GROUND SPEED", a.speed === null ? "—" : `${a.speed} km/h`],
              ["TRACK", compass(a.course)],
              ["TYPE", a.aircraftType],
              ["REPORTED", ago(a.time)],
            ]}
          />
          <button className="button primary full" onClick={() => flyTo(a.lat, a.lng, 11)}>
            Centre aircraft ↗
          </button>
          <p className="flight-status">
            Open Glider Network, ODbL. Pilots who opt out of tracking are never shown; positions are kept for 30 minutes
            only.
          </p>
        </>
      );
    }
    case "news": {
      const p = data.news?.items.find((x) => x.id === id);
      if (!p) break;
      return (
        <>
          <h2>{p.name}</h2>
          <p className="sat-explanation">
            {p.count} article{p.count === 1 ? "" : "s"} in the last 24 hours ·{" "}
            {p.basis === "mentioned" ? "places named in the coverage (GDELT geocoding)" : "grouped by the publishing outlet's country"}
          </p>
          <ul className="earth-headlines">
            {p.articles.map((a) => (
              <li key={a.url}>
                <a href={a.url} target="_blank" rel="noopener noreferrer">
                  {a.title || a.url}
                </a>
                <small>{new URL(a.url).hostname.replace(/^www\./, "")}</small>
              </li>
            ))}
          </ul>
          <button className="button primary full" onClick={() => flyTo(p.lat, p.lng, 5)}>
            Centre location ↗
          </button>
        </>
      );
    }
    case "outages": {
      const o = data.outages?.items.find((x) => x.code === id);
      if (!o) break;
      const SOURCES: Record<string, string> = { gtr: "Google traffic", bgp: "BGP routing", "ping-slash24": "Active probing", "merit-nt": "Network telescope" };
      return (
        <>
          <h2>{o.name}</h2>
          <p className="sat-explanation">
            {o.events} outage event{o.events === 1 ? "" : "s"} detected in the last 24 hours. Severity score {Math.round(o.score).toLocaleString()} (relative; higher is worse).
          </p>
          <div className="sectionlabel">ALERTS · NEWEST FIRST</div>
          <ol className="earth-timeline">
            {o.alerts.map((a, i) => (
              <li key={i}>
                <strong>
                  {utc(a.time)} · {a.level}
                </strong>
                <span>
                  {SOURCES[a.datasource] ?? a.datasource}
                  {a.value !== null && a.expected !== null ? ` · ${a.value.toLocaleString()} vs ${a.expected.toLocaleString()} expected` : ""}
                </span>
              </li>
            ))}
          </ol>
          <a
            className="sourcelink"
            href={`https://ioda.inetintel.cc.gatech.edu/country/${o.code}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            IODA country dashboard ↗
          </a>
        </>
      );
    }
    case "daynight":
    case "oceanheat": {
      const [lat, lng] = id.split(",").map(Number);
      return <LocationBody lat={lat} lng={lng} />;
    }
    case "launches": {
      const l = data.launches?.items.find((x) => x.id === id);
      if (!l) break;
      return <LaunchBody launch={l} onCentre={() => flyTo(l.lat, l.lng, 9)} />;
    }
    default:
      break;
  }
  return (
    <>
      <h2>{layerDef(layer).title}</h2>
      <p className="sat-explanation">This item is no longer in the latest data.</p>
    </>
  );
}

function BalloonBody({ balloon: b, onCentre }: { balloon: NonNullable<ReturnType<typeof useEarthStore.getState>["data"]["balloons"]>["items"][number]; onCentre(): void }) {
  const track = useEarthStore((s) => s.tracks[b.serial]);
  const peak = track?.length ? Math.max(...track.map((p) => p[2])) : null;
  return (
    <>
      <h2>{b.serial}</h2>
      <p className="sat-explanation">
        {b.type} radiosonde · last heard {utc(b.time)} ({ago(b.time)})
      </p>
      <Metrics
        rows={[
          ["ALTITUDE", `${(b.alt / 1000).toFixed(2)} km`],
          ["VERTICAL", b.climb === null ? "—" : `${b.climb > 0 ? "↑" : "↓"} ${Math.abs(b.climb).toFixed(1)} m/s`],
          ["GROUND SPEED", b.speed === null ? "—" : `${Math.round(b.speed * 3.6)} km/h`],
          ["HEADING", compass(b.heading)],
          ["TEMPERATURE", fmt(b.temp, " °C")],
          ["HUMIDITY", fmt(b.humidity, " %", 0)],
          ["FREQUENCY", b.frequency === null ? "—" : `${b.frequency.toFixed(3)} MHz`],
          ["FLIGHT PEAK", peak === null ? (track === null ? "Loading trail…" : "—") : `${(peak / 1000).toFixed(1)} km`],
        ]}
      />
      <button className="button primary full" onClick={onCentre}>
        Centre balloon ↗
      </button>
      <a className="sourcelink" href={`https://sondehub.org/${encodeURIComponent(b.serial)}`} target="_blank" rel="noopener noreferrer">
        SondeHub tracker ↗
      </a>
    </>
  );
}

function LaunchBody({ launch: l, onCentre }: { launch: NonNullable<ReturnType<typeof useEarthStore.getState>["data"]["launches"]>["items"][number]; onCentre(): void }) {
  const now = useNow(1000);
  const diff = l.net - now;
  const abs = Math.abs(diff);
  const d = Math.floor(abs / 86_400_000), h = Math.floor((abs % 86_400_000) / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000), sec = Math.floor((abs % 60_000) / 1000);
  const countdown = now ? `T${diff > 0 ? "−" : "+"} ${d ? `${d}d ` : ""}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : "—";
  return (
    <>
      {l.image && <img className="earth-launch-image" src={l.image} alt="" />}
      <h2>{l.name}</h2>
      <div className="earth-countdown">{countdown}</div>
      <p className="sat-explanation">
        {l.status}
        {l.live ? " · webcast live now" : ""}
      </p>
      <Metrics
        rows={[
          ["LAUNCH (NET)", utc(l.net)],
          ["PROVIDER", l.provider || "—"],
          ["ROCKET", l.rocket || "—"],
          ["ORBIT", l.orbit || "—"],
          ["PAD", l.pad || "—"],
          ["LOCATION", l.location || "—"],
        ]}
      />
      {l.missionDescription && <p className="sat-explanation">{l.missionDescription}</p>}
      <button className="button primary full" onClick={onCentre}>
        Centre launch pad ↗
      </button>
      {l.webcasts.map((w) => (
        <a key={w.url} className="sourcelink" href={w.url} target="_blank" rel="noopener noreferrer">
          {w.title} ↗
        </a>
      ))}
    </>
  );
}

/** Clicked spot: local sun times (day/night layer) and Coral Reef Watch values (ocean heat layer). */
function LocationBody({ lat, lng }: { lat: number; lng: number }) {
  const enabled = useEarthStore((s) => s.enabled);
  const point = useEarthStore((s) => s.oceanPoint);
  const t = useNow(30_000);
  if (!t) return <h2>Locating…</h2>;
  const times = sunTimes(lat, lng, t);
  const elevation = solarElevation(lat, lng, t);
  const offset = nauticalOffset(lng);
  const clock = (ms: number | null) =>
    ms === null ? "—" : new Date(ms + offset * 3_600_000).toISOString().slice(11, 16) + ` (UTC${offset >= 0 ? "+" : "−"}${Math.abs(offset)})`;
  const hours = Math.floor(times.dayLength / 60);
  return (
    <>
      <h2>
        {Math.abs(lat).toFixed(2)}° {lat >= 0 ? "N" : "S"}, {Math.abs(lng).toFixed(2)}° {lng >= 0 ? "E" : "W"}
      </h2>
      {enabled.includes("daynight") && (
        <>
          <p className="sat-explanation">
            {elevation > 0 ? `Daytime — sun ${elevation.toFixed(0)}° above the horizon.` : elevation > -6 ? "Twilight." : "Night."} Times use
            the nautical time zone for this longitude; civil time zones can differ.
          </p>
          <Metrics
            rows={[
              ["LOCAL SOLAR TIME", solarClock(lng, t)],
              ["ZONE TIME (APPROX.)", clock(t)],
              ["SUNRISE", times.dayLength === 0 ? "Polar night" : times.dayLength === 1440 ? "Midnight sun" : clock(times.sunrise)],
              ["SUNSET", times.dayLength === 0 ? "Polar night" : times.dayLength === 1440 ? "Midnight sun" : clock(times.sunset)],
              ["DAY LENGTH", `${hours} h ${Math.round(times.dayLength - hours * 60)} min`],
              ["SOLAR NOON", clock(times.solarNoon)],
            ]}
          />
        </>
      )}
      {enabled.includes("oceanheat") && (
        <>
          <div className="sectionlabel">NOAA CORAL REEF WATCH {point?.value ? `· ${point.value.date}` : ""}</div>
          {point?.loading ? (
            <p className="sat-explanation">Fetching values…</p>
          ) : point?.value && (point.value.sst !== null || point.value.anomaly !== null) ? (
            <Metrics
              rows={[
                ["SEA TEMPERATURE", fmt(point.value.sst, " °C")],
                ["ANOMALY", point.value.anomaly === null ? "—" : `${point.value.anomaly > 0 ? "+" : ""}${point.value.anomaly.toFixed(2)} °C`],
                ["HEAT STRESS", point.value.dhw === null ? "—" : `${point.value.dhw.toFixed(1)} °C-weeks`],
                ["BLEACHING RISK", point.value.dhw === null ? "—" : point.value.dhw >= 8 ? "Alert 2 (severe)" : point.value.dhw >= 4 ? "Alert 1" : point.value.dhw > 0 ? "Watch" : "None"],
              ]}
            />
          ) : (
            <p className="sat-explanation">No ocean data here (land, sea ice, or the day isn&apos;t published yet).</p>
          )}
        </>
      )}
    </>
  );
}

export function EarthViewer() {
  const closeDetail = useShellStore((s) => s.closeDetail);
  const layer = useEarthStore((s) => s.selected?.layer);
  return (
    <aside className="earth-viewer">
      <button className="shell-close" aria-label="Close details" onClick={closeDetail}>
        ×
      </button>
      <div className="eyebrow">{layer ? layerDef(layer).source.name.toUpperCase() : "EARTH DATA"}</div>
      <Body />
    </aside>
  );
}
