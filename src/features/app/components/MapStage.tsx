"use client";

import { DestinationBar } from "@/features/cameras/components/DestinationBar";
import { FeedLegend } from "@/features/cameras/components/FeedIcon";
import { useCameraStore } from "@/features/cameras/store";
import { FlightLiveBadge } from "@/features/flights/components/FlightLiveBadge";
import { useFlightStore } from "@/features/flights/store";
import { GlobeCanvas } from "@/features/globe/components/GlobeCanvas";
import {
  GlobeError,
  GlobeHoverTooltip,
  GlobeNav,
  NightToggle,
  ViewCount,
} from "@/features/globe/components/GlobeOverlays";
import { useSatelliteStore } from "@/features/satellites/store";
import { ShipLiveBadge } from "@/features/ships/components/ShipLiveBadge";
import { useShipStore } from "@/features/ships/store";
import { OVERLAY_LAYER } from "@/features/earth/lib/overlays";
import { useEarthStore } from "@/features/earth/store";
import { useShellStore } from "@/features/shell/store";

const selectHandlers = {
  onCameraSelect: (id: string) => void useCameraStore.getState().select(id),
  onSatelliteSelect: (id: number) => useSatelliteStore.getState().select(id),
  onFlightSelect: (id: string) => useFlightStore.getState().select(id),
  onShipSelect: (id: string) => useShipStore.getState().select(id),
  onOverlaySelect: (overlay: string, item: string) => {
    const layer = OVERLAY_LAYER[overlay];
    const mode = useShellStore.getState().mode;
    if (layer && (mode === "earth" || mode === "movement")) useEarthStore.getState().select(layer, item);
  },
  /** Empty-surface clicks open a location card (sun times, ocean values) in Earth mode. */
  onGlobeClick: (lat: number, lng: number) => {
    if (useShellStore.getState().mode === "earth") useEarthStore.getState().selectLocation(lat, lng);
  },
};

const MAP_TITLES = {
  cameras: " 3D EARTH · CAMERA ATLAS ",
  flights: " 3D EARTH · CAMERA ATLAS ",
  satellites: " ORBITAL OBSERVATORY ",
  ships: " MARITIME TRAFFIC · LIVE AIS ",
  earth: " LIVING PLANET · EARTH DATA ",
  movement: " IN MOTION · LIVE MOVEMENT ",
} as const;

export function MapStage({ onHome }: { onHome(): void }) {
  const mode = useShellStore((s) => s.mode);

  return (
    <section className="mapstage">
      <GlobeCanvas {...selectHandlers} />
      <div className="maptop">
        <div className="maptitle">
          <span className="smallgreen">●</span>
          {MAP_TITLES[mode]}
          <span className="divider">/</span>
          <ViewCount />
        </div>
        <button className="mapbutton" id="worldView" title="Show the world" onClick={onHome}>
          ◎ Reset globe
        </button>
      </div>
      <DestinationBar />
      <div className="mapbottom">
        <FeedLegend />
        <NightToggle />
      </div>
      <GlobeNav />
      <div className="globetip">Drag to orbit · Scroll to zoom · Ctrl + drag to tilt</div>
      <GlobeHoverTooltip />
      <div className="mapdisclaimer">
        Includes historical index records. Playback and coordinates require source verification.
      </div>
      <GlobeError />
      <FlightLiveBadge />
      <ShipLiveBadge />
    </section>
  );
}
