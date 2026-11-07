"use client";

import { CameraDirectory } from "@/features/cameras/components/CameraDirectory";
import { CameraViewer } from "@/features/cameras/components/CameraViewer";
import { AddFeedDialog } from "@/features/cameras/components/dialogs/AddFeedDialog";
import { SourcesDialog } from "@/features/cameras/components/dialogs/SourcesDialog";
import { WatchWallDialog } from "@/features/cameras/components/dialogs/WatchWallDialog";
import { useCameraStore } from "@/features/cameras/store";
import { FlightDirectory } from "@/features/flights/components/FlightDirectory";
import { FlightViewer } from "@/features/flights/components/FlightViewer";
import { getGlobe } from "@/features/globe/store";
import { ORBIT_VIEW, WORLD_VIEW } from "@/features/globe/types";
import { SatelliteDirectory } from "@/features/satellites/components/SatelliteDirectory";
import { SatelliteViewer } from "@/features/satellites/components/SatelliteViewer";
import { BodyClassSync } from "@/features/shell/components/BodyClassSync";
import { GlobeDock } from "@/features/shell/components/GlobeDock";
import { ImmersiveExit } from "@/features/shell/components/ImmersiveExit";
import { PanelButton } from "@/features/shell/components/PanelButton";
import { ShellClose } from "@/features/shell/components/ShellClose";
import { ShellShortcuts } from "@/features/shell/components/ShellShortcuts";
import { SiteHeader } from "@/features/shell/components/SiteHeader";
import { Toast } from "@/features/shell/components/Toast";
import { TopLoader } from "@/features/shell/components/TopLoader";
import { useShellStore, type AppMode } from "@/features/shell/store";
import { ShipDirectory } from "@/features/ships/components/ShipDirectory";
import { ShipViewer } from "@/features/ships/components/ShipViewer";
import { SHIPS_VIEW } from "@/features/ships/store";
import { EarthDirectory } from "@/features/earth/components/EarthDirectory";
import { EarthViewer } from "@/features/earth/components/EarthViewer";

import { MapStage } from "./components/MapStage";
import { useBackgroundTasks } from "./hooks/useBackgroundTasks";
import { useGlobeLayers } from "./hooks/useGlobeLayers";
import { useModeController } from "./hooks/useModeController";

/** Fly to the default framing for the active layer. */
function flyHome() {
  const globe = getGlobe();
  const mode = useShellStore.getState().mode;
  if (mode === "satellites") globe?.flyTo(ORBIT_VIEW.center, ORBIT_VIEW.zoom, { duration: 1.2 });
  else if (mode === "ships") globe?.flyTo(SHIPS_VIEW.center, SHIPS_VIEW.zoom, { duration: 1.2 });
  else globe?.flyTo(WORLD_VIEW.center, WORLD_VIEW.zoom);
}

const MODE_CLASSES: Record<AppMode, string> = {
  cameras: "",
  satellites: " satellite-mode",
  flights: " flight-mode",
  ships: " ship-mode",
  earth: " earth-mode",
  // Movement reuses the Earth panel and card styles.
  movement: " earth-mode movement-mode",
};

/** Composition root: lays out the shell and wires the camera, satellite and flight features to the globe. */
export function WorldLensApp() {
  const mode = useShellStore((s) => s.mode);
  useModeController();
  useGlobeLayers();
  useBackgroundTasks();

  const modeClass = MODE_CLASSES[mode];

  return (
    <>
      <SiteHeader onOpenWall={() => void useCameraStore.getState().openWall()} />
      <div className={`app${modeClass}`}>
        <aside className="directory" id="explorer-panel">
          <ShellClose target="directory" label="Close explorer" />
          <CameraDirectory />
          <SatelliteDirectory onOrbitView={flyHome} />
          <FlightDirectory />
          <ShipDirectory />
          <EarthDirectory />
        </aside>
        <MapStage onHome={flyHome} />
        <CameraViewer />
        <SatelliteViewer />
        <FlightViewer />
        <ShipViewer />
        <EarthViewer />
      </div>
      <Toast />
      <TopLoader />
      <SourcesDialog />
      <AddFeedDialog />
      <WatchWallDialog />
      <GlobeDock onHome={flyHome} />
      <PanelButton />
      <ImmersiveExit />
      <BodyClassSync />
      <ShellShortcuts />
    </>
  );
}
