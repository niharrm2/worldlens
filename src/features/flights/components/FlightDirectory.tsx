"use client";

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import { altitudeText, flightLabel } from "../lib/format";
import { matchingAircraft, recentAircraft, useFlightStore } from "../store";
import { AircraftIcon } from "./AircraftIcon";

export function FlightDirectory() {
  const s = useFlightStore(
    useShallow((x) => ({
      aircraft: x.aircraft,
      lastData: x.lastData,
      selectedId: x.selectedId,
      loading: x.loading,
      paused: x.paused,
      query: x.query,
      includeCached: x.includeCached,
      includeGround: x.includeGround,
      limit: x.limit,
      statusText: x.statusText,
      now: x.now,
    })),
  );
  const actions = useFlightStore.getState();
  const recentCount = useMemo(() => recentAircraft(s).length, [s]);
  const matches = useMemo(() => matchingAircraft(s), [s]);

  return (
    <div className="flight-directory">
      <div className="directoryhead">
        <div className="eyebrow">THE WORLD IN MOTION</div>
        <h1>
          Live skies.
          <br />
          <span>One planet.</span>
        </h1>
        <p>
          Worldwide aircraft received by adsb.lol.
          <br />
          Rolling worldwide scan · updates every 20 seconds.
        </p>
        <div className="sat-counters">
          <strong id="flightTotal">{s.lastData ? recentCount.toLocaleString() : "—"}</strong>
          <span>cached aircraft positions</span>
        </div>
        <div className="searchbox">
          <span>⌕</span>
          <input
            id="flightSearch"
            aria-label="Search flights"
            placeholder="Callsign, registration or ICAO…"
            value={s.query}
            onChange={(e) => actions.setQuery(e.target.value)}
          />
        </div>
        <label className="sat-cameras">
          <input
            id="flightCached"
            type="checkbox"
            checked={s.includeCached}
            onChange={(e) => actions.setIncludeCached(e.target.checked)}
          />{" "}
          Include older cached positions (up to 1 hour)
        </label>
        <label className="sat-cameras">
          <input
            id="flightGround"
            type="checkbox"
            checked={s.includeGround}
            onChange={(e) => actions.setIncludeGround(e.target.checked)}
          />{" "}
          Include aircraft on the ground
        </label>
        <div className="sat-controls">
          <button id="flightPause" className="button quiet" onClick={actions.togglePause}>
            {s.paused ? "Resume refresh" : "Pause refresh"}
          </button>
          <button
            id="flightRefresh"
            className="button quiet"
            disabled={s.loading}
            onClick={() => {
              if (!s.loading && !s.paused) void actions.refresh();
            }}
          >
            Refresh now
          </button>
        </div>
        <p id="flightStatus" className="flight-status" role="status">
          {s.statusText}
        </p>
      </div>
      <div className="listheading">
        <span id="flightCount">{s.lastData ? `${matches.length.toLocaleString()} matching aircraft` : "Worldwide network"}</span>
      </div>
      <div id="flightList" className="cameralist">
        {matches.slice(0, s.limit).map((a) => {
          const chosen = a.id === s.selectedId;
          return (
            <button
              key={a.id}
              className={`sat-row${chosen ? " selected" : ""}`}
              data-flight={a.id}
              onClick={() => actions.select(a.id)}
            >
              <AircraftIcon
                className="flight-rowicon"
                state={chosen ? "selected" : "live"}
                gradientId={`row-${a.id.replace(/[^a-z0-9]/gi, "")}`}
              />
              <span>
                <strong>{flightLabel(a)}</strong>
                <small>
                  {Math.max(0, Math.floor((s.now - a.positionTime) / 60_000))}m old · {a.type || a.id.toUpperCase()} ·{" "}
                  {altitudeText(a)}
                </small>
              </span>
              <span>↗</span>
            </button>
          );
        })}
        {matches.length > s.limit && (
          <button id="flightMore" className="loadmore" onClick={actions.showMore}>
            Show 60 more ↓
          </button>
        )}
        {!matches.length && (
          <div className="empty">{s.lastData ? "No recent aircraft match." : "Waiting for flight data…"}</div>
        )}
      </div>
      <div className="sat-datafooter">
        Jet markers follow reported track / heading. Zoom in for detailed 3D airframes; altitude uses reported feet.
        Every cached aircraft in view is drawn. Zoom in where aircraft overlap.
        <p>
          Coverage follows ground receivers and varies by region. Position ages are shown in the list and aircraft
          details. Cached positions up to 1 hour old can be shown. Regional results arrive progressively; this is not a
          simultaneous worldwide snapshot. No simulated flights.
        </p>
        <a href="https://www.adsb.lol/" target="_blank" rel="noopener">
          adsb.lol ↗
        </a>{" "}
        ·{" "}
        <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener">
          ODbL 1.0
        </a>
      </div>
    </div>
  );
}
