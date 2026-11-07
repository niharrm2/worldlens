"use client";

import { useNow } from "@/features/flights/hooks/useNow";
import { ageText } from "@/features/flights/lib/format";
import { useShellStore } from "@/features/shell/store";
import { SHIP_LABELS } from "@/lib/icons/ship-icons";

import { shipLabel, speedText } from "../lib/format";
import { useShipStore } from "../store";
import { ShipIcon } from "./ShipIcon";

const degrees = (v: number | null) => (v == null ? "Unavailable" : `${Math.round(v)}°`);

export function ShipViewer() {
  const mode = useShellStore((s) => s.mode);
  const closeDetail = useShellStore((s) => s.closeDetail);
  const summary = useShipStore((s) => s.ships.find((x) => x.id === s.selectedId));
  const detail = useShipStore((s) => (s.detail?.id === s.selectedId ? s.detail : null));
  const detailLoading = useShipStore((s) => s.detailLoading);
  // Latest position from the list, metadata from the detail request.
  const ship = summary ? { ...detail, ...summary } : (detail ?? undefined);
  const pending = detailLoading && !detail ? "Loading…" : "Not reported";
  const locate = useShipStore((s) => s.locateSelected);
  const now = useNow(1000, mode === "ships" && !!ship);
  const age = ship && now ? Math.max(0, Math.floor((now - ship.positionTime) / 1000)) : null;

  return (
    <aside className="ship-viewer">
      <button className="shell-close" aria-label="Close vessel details" onClick={closeDetail}>
        ×
      </button>
      <div className="eyebrow">LIVE VESSEL · AIS{detail ? ` · ${detail.source === "digitraffic" ? "FINTRAFFIC" : "AISSTREAM"}` : ""}</div>
      {ship ? (
        <ShipIcon as="div" className="flight-hero" ship={ship} selected />
      ) : (
        <div className="flight-hero" />
      )}
      <h2 id="shipName">{ship ? shipLabel(ship) : "Select a vessel"}</h2>
      <p id="shipIdentity" className="sat-explanation">
        {ship
          ? [SHIP_LABELS[ship.category], `MMSI ${ship.mmsi}`, ship.imo ? `IMO ${ship.imo}` : "", ship.callSign ?? ""]
              .filter(Boolean)
              .join(" · ")
          : "Click a vessel on the globe or in the directory."}
      </p>
      <div className="sat-metrics">
        <div>
          <span>SPEED</span>
          <strong id="shipSpeed">{ship ? speedText(ship).replace("Speed unavailable", "Unavailable") : "—"}</strong>
        </div>
        <div>
          <span>COURSE / HEADING</span>
          <strong id="shipCourse">{ship ? `${degrees(ship.course)} / ${degrees(ship.heading)}` : "—"}</strong>
        </div>
        <div>
          <span>DESTINATION</span>
          <strong id="shipDestination">{ship ? ship.destination || pending : "—"}</strong>
        </div>
        <div>
          <span>POSITION AGE</span>
          <strong id="shipAge" className={age !== null && age > 300 ? "stale" : undefined}>
            {age === null ? "—" : ageText(age)}
          </strong>
        </div>
        <div>
          <span>SIZE</span>
          <strong id="shipSize">
            {ship?.length ? `${ship.length} × ${ship.width ?? "?"} m` : ship ? pending : "—"}
          </strong>
        </div>
        <div>
          <span>DRAUGHT</span>
          <strong id="shipDraught">{ship ? (ship.draught ? `${ship.draught.toFixed(1)} m` : pending) : "—"}</strong>
        </div>
        <div>
          <span>LATITUDE</span>
          <strong id="shipLat">{ship ? `${ship.lat.toFixed(4)}°` : "—"}</strong>
        </div>
        <div>
          <span>LONGITUDE</span>
          <strong id="shipLng">{ship ? `${ship.lng.toFixed(4)}°` : "—"}</strong>
        </div>
      </div>
      <p id="shipNavStatus" className="flight-status">
        {ship ? `${ship.navStatus ?? "Navigation status pending"} · reported ${new Date(ship.positionTime).toUTCString()}` : ""}
      </p>
      <button id="shipLocate" className="button primary full" disabled={!ship} onClick={locate}>
        Centre vessel ↗
      </button>
      <p className="sat-explanation">
        Positions, speed and destination are self-reported by each vessel&apos;s AIS transponder and relayed by
        shore receivers. Not for navigation. Sources: AISStream.io; Fintraffic / digitraffic.fi (CC BY 4.0).
      </p>
    </aside>
  );
}
