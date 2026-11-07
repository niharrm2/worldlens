"use client";

import { useShellStore } from "@/features/shell/store";

import { useNow } from "../hooks/useNow";
import { ageText, altitudeText } from "../lib/format";
import { useFlightStore } from "../store";
import { AircraftIcon } from "./AircraftIcon";

export function FlightViewer() {
  const mode = useShellStore((s) => s.mode);
  const closeDetail = useShellStore((s) => s.closeDetail);
  const aircraft = useFlightStore((s) => s.aircraft.find((a) => a.id === s.selectedId));
  const locate = useFlightStore((s) => s.locateSelected);
  const now = useNow(1000, mode === "flights" && !!aircraft);

  const age = aircraft ? Math.max(0, Math.floor((now - aircraft.positionTime) / 1000)) : 0;

  return (
    <aside className="flight-viewer">
      <button className="shell-close" id="flightClose" aria-label="Close flight details" onClick={closeDetail}>
        ×
      </button>
      <div className="eyebrow">WORLDWIDE LIVE FLIGHTS · ADSB.LOL</div>
      <AircraftIcon as="div" className="flight-hero" state="live" gradientId="hero-jet" />
      <h2 id="flightName">{aircraft ? aircraft.callsign || "Callsign unavailable" : "Select an aircraft"}</h2>
      <p id="flightIdentity" className="sat-explanation">
        {aircraft ? [aircraft.registration, aircraft.type, `ICAO ${aircraft.id.toUpperCase()}`].filter(Boolean).join(" · ") : ""}
      </p>
      <div className="sat-metrics">
        <div>
          <span>ALTITUDE</span>
          <strong id="flightAltitude">{aircraft ? altitudeText(aircraft, "Unavailable") : "—"}</strong>
        </div>
        <div>
          <span>HEADING / TRACK</span>
          <strong id="flightHeading">
            {aircraft ? (aircraft.heading == null ? "Unavailable" : `${Math.round(aircraft.heading)}°`) : "—"}
          </strong>
        </div>
        <div>
          <span>GROUND SPEED</span>
          <strong id="flightSpeed">
            {aircraft ? (aircraft.speed == null ? "Unavailable" : `${Math.round(aircraft.speed)} kt`) : "—"}
          </strong>
        </div>
        <div>
          <span>POSITION AGE</span>
          <strong id="flightAge" className={aircraft && age > 60 ? "stale" : undefined}>
            {aircraft ? ageText(age) : "—"}
          </strong>
        </div>
        <div>
          <span>LATITUDE</span>
          <strong id="flightLat">{aircraft ? `${aircraft.lat.toFixed(4)}°` : "—"}</strong>
        </div>
        <div>
          <span>LONGITUDE</span>
          <strong id="flightLng">{aircraft ? `${aircraft.lng.toFixed(4)}°` : "—"}</strong>
        </div>
      </div>
      <p id="flightAgeNote" className="flight-status">
        {aircraft
          ? `${age > 300 ? "Older cached position; not current. " : age > 60 ? "Delayed position. " : "Received position. "}${
              aircraft.headingSource
            } · ${new Date(aircraft.positionTime).toUTCString()}`
          : ""}
      </p>
      <button id="flightLocate" className="button primary full" onClick={locate}>
        Centre aircraft ↗
      </button>
      <p className="sat-explanation">
        Received positions, with no extrapolation. At world scale, crisp jet markers keep aircraft readable. Zoom in for
        rounded 3D airframes at reported altitude. Their size is exaggerated for visibility. Ground track is used when
        available; otherwise reported heading. Missing values remain unavailable.
      </p>
    </aside>
  );
}
