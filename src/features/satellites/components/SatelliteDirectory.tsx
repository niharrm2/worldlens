"use client";

import { useMemo } from "react";

import { SATELLITE_GLYPH } from "@/lib/icons/satellite-glyph";
import { formatIsoUtc } from "@/lib/format";

import { ORBIT_NAMES } from "../lib/orbit";
import { matchingSatellites, useSatelliteStore } from "../store";
import type { OrbitFilter } from "../types";

interface SatelliteDirectoryProps {
  onOrbitView(): void;
}

export function SatelliteDirectory({ onOrbitView }: SatelliteDirectoryProps) {
  const s = useSatelliteStore();
  const matches = useMemo(() => matchingSatellites(s), [s.records, s.query, s.filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const resultCount = s.loadFailed
    ? "Orbital data unavailable"
    : s.loaded
      ? `${matches.length.toLocaleString()} matching satellites`
      : "Loading satellites…";
  const dataAge = s.dataset
    ? `${s.dataset.source === "user-import" ? "Imported OMM dataset" : "CelesTrak active-group snapshot"} · retrieved ${formatIsoUtc(s.dataset.fetchedAt)}`
    : "Loading CelesTrak snapshot…";

  return (
    <div className="satellite-directory">
      <div className="directoryhead">
        <div className="eyebrow">EARTH, FROM ABOVE</div>
        <h1>
          Our orbital
          <br />
          <span>neighbourhood.</span>
        </h1>
        <p>
          Public orbital elements. Calculated positions.
          <br />
          All positions every 10s; selected satellite every 1s.
        </p>
        <div className="sat-counters">
          <strong id="satTotal">{s.loaded ? s.records.length.toLocaleString() : "—"}</strong>
          <span>orbital records available</span>
        </div>
        <div className="searchbox">
          <span>⌕</span>
          <input
            id="satSearch"
            aria-label="Search satellites"
            placeholder="Satellite name or NORAD ID…"
            value={s.query}
            onChange={(e) => s.setQuery(e.target.value)}
          />
        </div>
        <label className="sat-filterlabel">
          ORBIT CLASS
          <select
            id="satFilter"
            aria-label="Filter satellite orbit"
            value={s.filter}
            onChange={(e) => s.setFilter(e.target.value as OrbitFilter)}
          >
            {Object.entries(ORBIT_NAMES).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <div className="sat-controls">
          <button id="satPause" className="button quiet" onClick={s.togglePause}>
            {s.paused ? "Resume positions" : "Pause positions"}
          </button>
          <button id="satOrbitView" className="button quiet" onClick={onOrbitView}>
            Orbit view
          </button>
        </div>
        <label className="sat-cameras">
          <input
            id="satCameras"
            type="checkbox"
            checked={s.showCameras}
            onChange={(e) => s.setShowCameras(e.target.checked)}
          />{" "}
          Show camera feeds too
        </label>
        <div id="satClock" className="sat-clock">
          {s.clockText}
        </div>
        <div className="sat-key">
          <span>● Moving</span>
          <span>● Near-GEO</span>
          <span>● Stale elements</span>
        </div>
      </div>
      <div className="listheading">
        <span id="satResultCount">{resultCount}</span>
      </div>
      <div id="satList" className="cameralist">
        {matches.slice(0, s.listLimit).map((r) => (
          <button
            key={r.NORAD_CAT_ID}
            className={`sat-row${r.NORAD_CAT_ID === s.selectedId ? " selected" : ""}`}
            data-satellite={r.NORAD_CAT_ID}
            onClick={() => s.select(r.NORAD_CAT_ID)}
          >
            <span className={`sat-orbiticon ${r.orbit.type}`}>
              <img src={SATELLITE_GLYPH} alt="" />
            </span>
            <span>
              <strong>{r.OBJECT_NAME}</strong>
              <small>
                {ORBIT_NAMES[r.orbit.type]} · #{r.NORAD_CAT_ID}
              </small>
            </span>
            <span>↗</span>
          </button>
        ))}
        {matches.length > s.listLimit && (
          <button className="loadmore" id="satMore" onClick={s.showMore}>
            Show 60 more ↓
          </button>
        )}
        {s.loaded && !matches.length && <div className="empty">No satellites match this search.</div>}
      </div>
      <div className="sat-datafooter">
        <p id="satDataAge">{dataAge}</p>
        <button
          id="satRefresh"
          className="button quiet"
          disabled={s.refreshing}
          onClick={() => void s.refreshFromProvider()}
        >
          Refresh orbital data
        </button>
        <label className="button quiet filelabel">
          Import OMM JSON
          <input
            id="satImport"
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void s.importFile(file);
            }}
          />
        </label>
        <p id="satRefreshStatus" role="status">
          {s.refreshStatus}
        </p>
        <a href="https://celestrak.org/NORAD/documentation/gp-data-formats.php" target="_blank" rel="noopener">
          CelesTrak · data &amp; methodology ↗
        </a>
      </div>
    </div>
  );
}
