/** Cesium WebGL globe: viewport-aggregated camera pins, satellites and 3D aircraft. */
import type {
  Billboard,
  BillboardCollection,
  Cartesian2,
  Cartesian3,
  Entity,
  PointPrimitiveCollection,
  ScreenSpaceEventHandler,
  Viewer,
} from "cesium";

import type { Camera } from "@/features/cameras/types";
import type { SatellitePoint } from "@/features/satellites/types";
import { FEED_LABELS, feedMarker } from "@/lib/icons/feed-icons";
import { SATELLITE_GLYPH } from "@/lib/icons/satellite-glyph";
import type { Aircraft } from "@/types/flights";
import type { Ship } from "@/types/ships";
import { SHIP_LABELS } from "@/lib/icons/ship-icons";
import { shipLabel, speedText } from "@/features/ships/lib/format";

import type { FlyOptions, GlobeEngine, GlobeEvents, LatLng, SatelliteLayerData } from "../types";
import { WORLD_VIEW } from "../types";
import { CesiumFlightLayer } from "./cesium-flight-layer";
import { CesiumShipLayer } from "./cesium-ship-layer";
import { CesiumOverlays } from "./cesium-overlays";
import { isOverlayPick, type OverlayPickId, type OverlaySpec } from "../overlays";
import { createOccluder, type EllipsoidalOccluder } from "./cesium-types";
import type { CesiumModule } from "./load-cesium";

interface PinGroup {
  camera: Camera;
  count: number;
  selected: boolean;
  billboard?: Billboard;
}

type PickId = PinGroup | { satelliteId: number } | { flightId: string } | { shipId: string } | OverlayPickId | undefined;

const isPin = (id: PickId): id is PinGroup => !!id && "camera" in id;
const satelliteIdOf = (id: PickId) => (id && "satelliteId" in id ? id.satelliteId : undefined);
const flightIdOf = (id: PickId) => (id && "flightId" in id ? id.flightId : undefined);
const shipIdOf = (id: PickId) => (id && "shipId" in id ? id.shipId : undefined);

const OSM_CREDIT =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>';

export class CesiumGlobe implements GlobeEngine {
  readonly kind = "cesium" as const;
  private readonly viewer: Viewer;
  private readonly pins: BillboardCollection;
  private readonly satPoints: PointPrimitiveCollection;
  private readonly satIcon: BillboardCollection;
  private readonly flights: CesiumFlightLayer;
  private readonly ships: CesiumShipLayer;
  private readonly overlays: CesiumOverlays;
  private readonly handler: ScreenSpaceEventHandler;
  private readonly positions = new WeakMap<Camera, Cartesian3>();
  private groups: PinGroup[] = [];
  private rows: Camera[] = [];
  private selected: string | null = null;
  private tilted = false;
  private lastCenter = { lat: WORLD_VIEW.center[0], lng: WORLD_VIEW.center[1] };
  private orbitEntity: Entity | null = null;
  private lastSatPoints: SatellitePoint[] | null = null;
  private lastSatSelected: number | null = null;
  private lastSatPath: unknown = null;

  constructor(private readonly C: CesiumModule, container: HTMLElement, private readonly events: GlobeEvents) {
    C.Ion.defaultAccessToken = "";
    const imagery = new C.OpenStreetMapImageryProvider({
      url: "https://tile.openstreetmap.org/",
      maximumLevel: 19,
      credit: new C.Credit(OSM_CREDIT, true),
    });
    this.viewer = new C.Viewer(container, {
      baseLayer: new C.ImageryLayer(imagery),
      baseLayerPicker: false,
      animation: false,
      timeline: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
      skyBox: false,
      shouldAnimate: false,
    });
    const { scene, camera } = this.viewer;
    this.viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, 1.5);
    scene.backgroundColor = C.Color.fromCssColorString("#060d18");
    scene.globe.baseColor = C.Color.fromCssColorString("#163c50");
    scene.globe.showGroundAtmosphere = true;
    scene.globe.enableLighting = false;
    scene.screenSpaceCameraController.minimumZoomDistance = 300;
    scene.screenSpaceCameraController.maximumZoomDistance = 140_000_000;

    imagery.errorEvent.addEventListener(() =>
      events.onError("Some OpenStreetMap tiles are unavailable. Globe markers and the camera directory remain usable."),
    );

    this.pins = scene.primitives.add(new C.BillboardCollection({ scene }));
    this.satPoints = scene.primitives.add(new C.PointPrimitiveCollection());
    this.satIcon = scene.primitives.add(new C.BillboardCollection({ scene }));
    this.flights = new CesiumFlightLayer(C, this.viewer);
    this.ships = new CesiumShipLayer(C, this.viewer, () => this.getZoom());
    this.overlays = new CesiumOverlays(C, this.viewer);

    camera.moveStart.addEventListener(() => events.onHover(null));
    camera.moveEnd.addEventListener(() => {
      this.draw();
      events.onMoveEnd();
    });
    scene.preRender.addEventListener(() => {
      const occluder = this.occluder();
      for (const g of this.groups) if (g.billboard) g.billboard.show = occluder.isPointVisible(this.position(g.camera));
    });

    this.handler = new C.ScreenSpaceEventHandler(scene.canvas);
    this.handler.setInputAction(
      (e: { position: Cartesian2 }) => this.handleClick(e.position),
      C.ScreenSpaceEventType.LEFT_CLICK,
    );
    this.handler.setInputAction(
      (e: { endPosition: Cartesian2 }) => this.handleMove(e.endPosition),
      C.ScreenSpaceEventType.MOUSE_MOVE,
    );

    this.flyTo(WORLD_VIEW.center, WORLD_VIEW.zoom, { duration: 0 });
  }

  // ---- GlobeEngine -------------------------------------------------------

  setCameraRows(rows: Camera[], selectedId: string | null) {
    this.rows = rows;
    this.selected = selectedId;
    this.draw();
  }

  setCameraVisibility(show: boolean) {
    this.pins.show = show;
    this.viewer.scene.requestRender();
  }

  setSatellites({ points, selectedId, selectedPosition, path }: SatelliteLayerData) {
    const C = this.C;
    if (points !== this.lastSatPoints || selectedId !== this.lastSatSelected) {
      this.lastSatPoints = points;
      this.lastSatSelected = selectedId;
      this.satPoints.removeAll();
      for (const p of points) {
        const chosen = p.id === selectedId;
        this.satPoints.add({
          position: C.Cartesian3.fromDegrees(p.lng, p.lat, p.alt * 1000),
          pixelSize: chosen ? 8 : p.type === "geo" ? 5 : 3,
          color: C.Color.fromCssColorString(chosen ? "#fff2b5" : p.type === "geo" ? "#ffcc7d" : p.stale ? "#65758e" : "#8fbdff"),
          outlineColor: C.Color.BLACK,
          outlineWidth: 1,
          id: { satelliteId: p.id },
        });
      }
    }

    this.satIcon.removeAll();
    const selectedPoint = selectedPosition ?? points.find((p) => p.id === selectedId);
    if (selectedId !== null && selectedPoint) {
      this.satIcon.add({
        position: C.Cartesian3.fromDegrees(selectedPoint.lng, selectedPoint.lat, selectedPoint.alt * 1000),
        image: SATELLITE_GLYPH,
        width: 34,
        height: 34,
        id: { satelliteId: selectedId },
      });
    }

    if (path !== this.lastSatPath) {
      this.lastSatPath = path;
      if (this.orbitEntity) {
        this.viewer.entities.remove(this.orbitEntity);
        this.orbitEntity = null;
      }
      const segments: Cartesian3[][] = [];
      let current: Cartesian3[] = [];
      for (const p of path) {
        if (p) current.push(C.Cartesian3.fromDegrees(p.lng, p.lat, p.alt * 1000));
        else {
          if (current.length > 1) segments.push(current);
          current = [];
        }
      }
      if (current.length > 1) segments.push(current);
      if (segments.length) {
        this.orbitEntity = this.viewer.entities.add({
          polyline: { positions: segments[0], width: 2, material: C.Color.fromCssColorString("#ffdb97") },
        });
      }
    }
    this.viewer.scene.requestRender();
  }

  setFlights(aircraft: Aircraft[], selectedId: string | null) {
    this.flights.update(aircraft, selectedId);
  }

  setShips(ships: Ship[], selectedId: string | null) {
    this.ships.update(ships, selectedId);
  }

  setOverlay(key: string, spec: OverlaySpec | null) {
    this.overlays.set(key, spec);
  }

  flyTo([lat, lng]: LatLng, zoom = 2, options: FlyOptions = {}) {
    const C = this.C;
    this.lastCenter = { lat, lng };
    this.viewer.camera.flyTo({
      destination: C.Cartesian3.fromDegrees(lng, lat, 18_000_000 / Math.pow(2, zoom - 2)),
      orientation: { heading: 0, pitch: C.Math.toRadians(this.tilted ? -55 : -90), roll: 0 },
      duration: options.duration ?? 1.4,
    });
  }

  setView(target: LatLng, zoom: number) {
    this.flyTo(target, zoom, { duration: 0 });
  }

  zoomBy(delta: number) {
    const c = this.getCenter();
    this.flyTo([c.lat, c.lng], this.getZoom() + delta, { duration: 0.5 });
  }

  toggleTilt() {
    this.tilted = !this.tilted;
    const c = this.getCenter();
    this.flyTo([c.lat, c.lng], this.getZoom(), { duration: 0.8 });
  }

  setNight(night: boolean) {
    const layer = this.viewer.imageryLayers.get(0);
    layer.brightness = night ? 0.38 : 1;
    layer.saturation = night ? 0.35 : 1;
    this.viewer.scene.requestRender();
  }

  getZoom() {
    const height = this.viewer.camera.positionCartographic.height;
    return Math.max(-1, Math.min(18, 2 + Math.log2(18_000_000 / Math.max(300, height))));
  }

  getCenter() {
    const { C, viewer } = this;
    const { scene, camera } = viewer;
    const picked = camera.pickEllipsoid(
      new C.Cartesian2(scene.canvas.clientWidth / 2, scene.canvas.clientHeight / 2),
      scene.globe.ellipsoid,
    );
    if (picked) {
      const c = C.Cartographic.fromCartesian(picked);
      this.lastCenter = { lat: C.Math.toDegrees(c.latitude), lng: C.Math.toDegrees(c.longitude) };
    }
    return this.lastCenter;
  }

  isInView(lat: number, lng: number) {
    return !!this.screenPosition(this.C.Cartesian3.fromDegrees(lng, lat, 80), this.occluder());
  }

  resize() {
    this.viewer.resize();
    this.draw();
  }

  destroy() {
    this.flights.destroy();
    this.ships.destroy();
    this.overlays.destroy();
    this.handler.destroy();
    if (!this.viewer.isDestroyed()) this.viewer.destroy();
  }

  // ---- Internals ---------------------------------------------------------

  private occluder(): EllipsoidalOccluder {
    return createOccluder(this.C, this.viewer.scene.globe.ellipsoid, this.viewer.camera.positionWC);
  }

  private position(c: Camera): Cartesian3 {
    let p = this.positions.get(c);
    if (!p) {
      p = this.C.Cartesian3.fromDegrees(c.lng, c.lat, 80);
      this.positions.set(c, p);
    }
    return p;
  }

  private screenPosition(point: Cartesian3, occluder: EllipsoidalOccluder) {
    if (!occluder.isPointVisible(point)) return null;
    const { scene } = this.viewer;
    const p = this.C.SceneTransforms.worldToWindowCoordinates(scene, point);
    return p && p.x >= 0 && p.y >= 0 && p.x <= scene.canvas.clientWidth && p.y <= scene.canvas.clientHeight ? p : null;
  }

  /** Bin visible cameras into screen cells and render one pin per cell. */
  private draw() {
    const { C, viewer } = this;
    if (viewer.isDestroyed()) return;
    const { scene, camera } = viewer;
    const zoom = this.getZoom();
    const cell = zoom < 5 ? 62 : zoom < 10 ? 46 : 36;
    const bins = new Map<string, PinGroup>();
    const occluder = this.occluder();
    const rect = camera.computeViewRectangle(scene.globe.ellipsoid);
    let count = 0;

    for (const c of this.rows) {
      if (rect && !C.Rectangle.contains(rect, C.Cartographic.fromDegrees(c.lng, c.lat))) continue;
      const p = this.screenPosition(this.position(c), occluder);
      if (!p) continue;
      count++;
      const key = `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`;
      let group = bins.get(key);
      if (!group) {
        group = { camera: c, count: 0, selected: false };
        bins.set(key, group);
      }
      group.count++;
      if (c.id === this.selected) {
        group.camera = c;
        group.selected = true;
      }
    }

    this.groups = [...bins.values()];
    this.pins.removeAll();
    for (const g of this.groups) {
      g.billboard = this.pins.add({
        position: this.position(g.camera),
        image: feedMarker(g.camera.type, g.count, g.selected),
        width: g.selected ? 42 : 36,
        height: g.selected ? 49 : 42,
        verticalOrigin: C.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        id: g,
      });
    }
    this.events.onViewCount(count);
    scene.requestRender();
  }

  private pick(position: Cartesian2): PickId {
    return (this.viewer.scene.pick(position) as { id?: PickId } | undefined)?.id;
  }

  private handleClick(position: Cartesian2) {
    const id = this.pick(position);
    const satelliteId = satelliteIdOf(id);
    if (satelliteId !== undefined) {
      this.events.onSatelliteSelect(satelliteId);
      return;
    }
    const flightId = flightIdOf(id);
    if (flightId) {
      this.events.onFlightSelect(flightId);
      return;
    }
    const shipId = shipIdOf(id);
    if (shipId) {
      this.events.onShipSelect(shipId);
      return;
    }
    if (isOverlayPick(id)) {
      this.events.onOverlaySelect(id.overlay, id.item);
      return;
    }
    if (!this.pins.show || !isPin(id)) {
      if (id === undefined) {
        const C = this.C;
        const picked = this.viewer.camera.pickEllipsoid(position, this.viewer.scene.globe.ellipsoid);
        if (picked) {
          const c = C.Cartographic.fromCartesian(picked);
          this.events.onGlobeClick(C.Math.toDegrees(c.latitude), C.Math.toDegrees(c.longitude));
        }
      }
      return;
    }
    if (id.count > 1 && this.getZoom() < 16 && !id.selected) {
      this.flyTo([id.camera.lat, id.camera.lng], this.getZoom() + 2, { duration: 0.8 });
    } else {
      this.events.onCameraSelect(id.camera.id);
    }
  }

  private handleMove(position: Cartesian2) {
    const id = this.pick(position);
    const canvas = this.viewer.scene.canvas;
    const width = canvas.clientWidth;

    if (isPin(id)) {
      canvas.style.cursor = "pointer";
      this.events.onHover({
        text: id.count > 1 ? `${id.count.toLocaleString()} feeds · Click to explore` : `${id.camera.name} · ${FEED_LABELS[id.camera.type]}`,
        x: Math.max(4, Math.min(position.x + 12, width - 220)),
        y: Math.max(110, position.y - 44),
      });
      return;
    }
    const flight = flightIdOf(id) ? this.flights.find(flightIdOf(id)!) : undefined;
    if (flight) {
      canvas.style.cursor = "pointer";
      const label = flight.callsign || flight.registration || flight.id.toUpperCase();
      const altitude = flight.altitude == null ? "Altitude unavailable" : `${flight.altitude.toLocaleString()} ft`;
      const age = Math.max(0, Math.floor((Date.now() - flight.positionTime) / 1000));
      this.events.onHover({
        text: `${label} · ${altitude} · ${age}s old`,
        x: Math.max(4, Math.min(position.x + 12, width - 230)),
        y: Math.max(10, position.y - 44),
      });
      return;
    }
    const ship = shipIdOf(id) ? this.ships.find(shipIdOf(id)!) : undefined;
    if (ship) {
      canvas.style.cursor = "pointer";
      this.events.onHover({
        text: `${shipLabel(ship)} · ${SHIP_LABELS[ship.category]} · ${speedText(ship)}`,
        x: Math.max(4, Math.min(position.x + 12, width - 230)),
        y: Math.max(10, position.y - 44),
      });
      return;
    }
    if (isOverlayPick(id)) {
      canvas.style.cursor = "pointer";
      this.events.onHover(
        id.label ? { text: id.label, x: Math.max(4, Math.min(position.x + 12, width - 240)), y: Math.max(10, position.y - 44) } : null,
      );
      return;
    }
    canvas.style.cursor = satelliteIdOf(id) !== undefined ? "pointer" : "grab";
    this.events.onHover(null);
  }
}
