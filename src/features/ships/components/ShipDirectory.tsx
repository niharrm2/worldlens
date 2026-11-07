"use client";

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import { SHIP_CATEGORIES, SHIP_COLORS, SHIP_LABELS } from "@/lib/icons/ship-icons";

import { shipLabel, speedText } from "../lib/format";
import { matchingShips, SHIP_PAGE_SIZE, useShipStore, type ShipCategoryFilter } from "../store";
import { ShipIcon } from "./ShipIcon";

export function ShipDirectory() {
  const s = useShipStore(
    useShallow((x) => ({
      ships: x.ships,
      lastData: x.lastData,
      selectedId: x.selectedId,
      loading: x.loading,
      paused: x.paused,
      query: x.query,
      category: x.category,
      movingOnly: x.movingOnly,
      limit: x.limit,
      statusText: x.statusText,
    })),
  );
  const actions = useShipStore.getState();

  // Rows arrive sorted (named vessels first, alphabetically).
  const matches = useMemo(() => matchingShips(s), [s]);
  const movingCount = useMemo(() => s.ships.filter((x) => (x.speed ?? 0) >= 0.5).length, [s.ships]);

  return (
    <div className="ship-directory">
      <div className="directoryhead">
        <div className="eyebrow">THE OCEANS, LIVE</div>
        <h1>
          Ships at sea.
          <br />
          <span>Worldwide.</span>
        </h1>
        <p>
          Live AIS positions from AISStream.io and Fintraffic.
          <br />
          Shared server stream · updates every 30 seconds.
        </p>
        <div className="sat-counters">
          <strong id="shipTotal">{s.lastData ? s.ships.length.toLocaleString() : "—"}</strong>
          <span>vessels reporting · {s.lastData ? movingCount.toLocaleString() : "—"} under way</span>
        </div>
        <div className="searchbox">
          <span>⌕</span>
          <input
            id="shipSearch"
            aria-label="Search ships"
            placeholder="Vessel name or MMSI…"
            value={s.query}
            onChange={(e) => actions.setQuery(e.target.value)}
          />
        </div>
        <label className="sat-filterlabel">
          VESSEL TYPE
          <select
            id="shipCategory"
            aria-label="Filter by vessel type"
            value={s.category}
            onChange={(e) => actions.setCategory(e.target.value as ShipCategoryFilter)}
          >
            <option value="all">All vessels</option>
            {SHIP_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {SHIP_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="sat-cameras">
          <input
            id="shipMoving"
            type="checkbox"
            checked={s.movingOnly}
            onChange={(e) => actions.setMovingOnly(e.target.checked)}
          />{" "}
          Only vessels under way
        </label>
        <div className="sat-controls">
          <button id="shipPause" className="button quiet" onClick={actions.togglePause}>
            {s.paused ? "Resume refresh" : "Pause refresh"}
          </button>
          <button
            id="shipRefresh"
            className="button quiet"
            disabled={s.loading}
            onClick={() => {
              if (!s.loading && !s.paused) void actions.refresh();
            }}
          >
            Refresh now
          </button>
        </div>
        <p id="shipStatus" className="flight-status" role="status">
          {s.statusText}
        </p>
        <div className="ship-key">
          {SHIP_CATEGORIES.filter((c) => c !== "unknown").map((c) => (
            <span key={c} style={{ color: SHIP_COLORS[c] }}>
              ● {SHIP_LABELS[c]}
            </span>
          ))}
        </div>
      </div>
      <div className="listheading">
        <span id="shipCount">{s.lastData ? `${matches.length.toLocaleString()} matching vessels` : "Worldwide AIS network"}</span>
      </div>
      <div id="shipList" className="cameralist">
        {matches.slice(0, s.limit).map((ship) => {
          const chosen = ship.id === s.selectedId;
          return (
            <button
              key={ship.id}
              className={`sat-row${chosen ? " selected" : ""}`}
              data-ship={ship.id}
              onClick={() => actions.select(ship.id)}
            >
              <ShipIcon className="flight-rowicon" ship={ship} selected={chosen} />
              <span>
                <strong>{shipLabel(ship)}</strong>
                <small>
                  {SHIP_LABELS[ship.category]} · {speedText(ship)}
                </small>
              </span>
              <span>↗</span>
            </button>
          );
        })}
        {matches.length > s.limit && (
          <button id="shipMore" className="loadmore" onClick={actions.showMore}>
            Show {SHIP_PAGE_SIZE} more ↓
          </button>
        )}
        {!matches.length && (
          <div className="empty">{s.lastData ? "No vessels match these filters." : "Waiting for vessel data…"}</div>
        )}
      </div>
      <div className="sat-datafooter">
        Hulls point along reported heading (or course over ground); dots are vessels under 0.5 kn.
        <p>
          Coverage comes from shore-based AIS receivers, so coasts, ports and shipping lanes are dense while open ocean
          has gaps. Vessels appear as they report (static details arrive every few minutes); positions older than one
          hour are dropped. Not for navigation.
        </p>
        <a href="https://aisstream.io/" target="_blank" rel="noopener">
          AISStream.io ↗
        </a>{" "}
        ·{" "}
        <a href="https://www.digitraffic.fi/en/marine-traffic/" target="_blank" rel="noopener">
          Source: Fintraffic / digitraffic.fi ↗
        </a>{" "}
        ·{" "}
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">
          CC BY 4.0
        </a>
      </div>
    </div>
  );
}
