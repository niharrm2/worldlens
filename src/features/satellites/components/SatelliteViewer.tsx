"use client";

import { ShellClose } from "@/features/shell/components/ShellClose";
import { SATELLITE_GLYPH } from "@/lib/icons/satellite-glyph";
import { formatIsoUtc } from "@/lib/format";

import { DAY_MS, epochDate, ORBIT_NAMES } from "../lib/orbit";
import { useSatelliteStore } from "../store";

const DEFAULT_PATH_NOTE =
  "Path: predicted Earth-relative trajectory over the next orbit, capped at 48 hours. All positions are estimates.";

export function SatelliteViewer() {
  const s = useSatelliteStore();
  const record = s.selectedId !== null ? s.byId.get(s.selectedId) : undefined;
  const p = s.detail?.point ?? null;
  const age = record && s.detail ? (s.detail.time - +epochDate(record.EPOCH)) / DAY_MS : null;
  const pathMinutes = record ? Math.min(record.orbit.period, 2880).toFixed(0) : "";

  let positionStatus = "Waiting for a selection";
  if (record && !s.detail) positionStatus = "Calculating selected orbit…";
  else if (record && s.detail) {
    positionStatus = !p
      ? "Prediction unavailable at this time"
      : Math.abs(age!) > 7
        ? "Stale orbital elements · treat prediction cautiously"
        : s.paused
          ? "Paused calculated position"
          : "Estimated position · SGP4";
  }

  let pathNote = DEFAULT_PATH_NOTE;
  if (record && s.pathComputedAt !== null) {
    pathNote = `Amber path: ${pathMinutes} minutes ahead, computed ${formatIsoUtc(s.pathComputedAt)}. Earth-relative trajectory; updates each minute.`;
  } else if (record) {
    pathNote = `Predicted Earth-relative path: ${pathMinutes} minutes from selection time. ${
      record.orbit.type === "geo" ? "A near-geostationary path is almost fixed relative to Earth. " : ""
    }Amber line; positions are estimates.`;
  }

  const unavailable = s.detail ? "Unavailable" : "—";

  return (
    <aside className="satellite-viewer">
      <ShellClose target="detail" label="Close details" />
      <div className="eyebrow">SATELLITE OBSERVATORY</div>
      <div className="sat-hero">
        <img src={SATELLITE_GLYPH} alt="" />
        <span>CALCULATED POSITION</span>
      </div>
      <h2 id="satName">{record?.OBJECT_NAME ?? "Choose a satellite"}</h2>
      <div id="satClass" className="sat-class">
        {record ? ORBIT_NAMES[record.orbit.type] : "Public orbital catalog"}
      </div>
      <p className="sat-explanation">
        Select a point on the globe or a satellite in the directory. Position estimates come from SGP4, rather than
        live GPS telemetry.
      </p>
      <div id="satPositionStatus" className="sat-positionstatus" role="status">
        {positionStatus}
      </div>
      <div className="sat-metrics">
        <div>
          <span>LATITUDE</span>
          <strong id="satLat">{p ? `${p.lat.toFixed(3)}°` : unavailable}</strong>
        </div>
        <div>
          <span>LONGITUDE</span>
          <strong id="satLon">{p ? `${p.lng.toFixed(3)}°` : unavailable}</strong>
        </div>
        <div>
          <span>ALTITUDE</span>
          <strong id="satAltitude">
            {p ? `${p.alt.toLocaleString("en-GB", { maximumFractionDigits: 1 })} km` : "—"}
          </strong>
        </div>
        <div>
          <span>ORBITAL SPEED</span>
          <strong id="satSpeed">{p ? `${p.speed.toFixed(2)} km/s` : "—"}</strong>
        </div>
        <div>
          <span>PERIOD</span>
          <strong id="satPeriod">{record ? `${record.orbit.period.toFixed(1)} min` : "—"}</strong>
        </div>
        <div>
          <span>INCLINATION</span>
          <strong id="satInclination">{record ? `${record.INCLINATION.toFixed(2)}°` : "—"}</strong>
        </div>
      </div>
      <div className="sat-timecard">
        <span>POSITION TIME · UTC</span>
        <strong id="satPositionTime">{s.detail ? formatIsoUtc(s.detail.time) : "—"}</strong>
        <span>ORBITAL ELEMENT EPOCH · UTC</span>
        <strong id="satEpoch">{record ? formatIsoUtc(record.EPOCH) : "—"}</strong>
        <span>NORAD CATALOG ID</span>
        <strong id="satNorad">{record?.NORAD_CAT_ID ?? "—"}</strong>
        <span>ELEMENT AGE AT POSITION TIME</span>
        <strong id="satAge" className={age !== null && Math.abs(age) > 7 ? "stale" : undefined}>
          {age === null
            ? "—"
            : `${Math.abs(age).toFixed(1)} days ${age < 0 ? "before element epoch" : "after element epoch"}`}
        </strong>
      </div>
      <button id="satLocate" className="button primary full" disabled={!record} onClick={s.locateSelected}>
        Centre selected satellite
      </button>
      <label className="sat-cameras">
        <input type="checkbox" id="satPath" checked={s.showPath} onChange={(e) => s.setShowPath(e.target.checked)} />{" "}
        Show selected orbital path
      </label>
      <p id="satPathNote" className="sat-explanation">
        {pathNote}
      </p>
      <div className="sat-science">
        <h3>Why do some appear stationary?</h3>
        <p>
          Geostationary satellites orbit with Earth&apos;s rotation above the equator. The near-GEO filter uses a period
          within 15 minutes of 1,436.07 minutes, inclination below 3° and eccentricity below 0.01. It indicates
          approximately fixed coverage, not guaranteed station-keeping.
        </p>
        <p>
          Element ages above 7 days are flagged. Predictions become less reliable with old elements, manoeuvres and
          atmospheric drag. Public data does not cover every satellite.
        </p>
      </div>
    </aside>
  );
}
