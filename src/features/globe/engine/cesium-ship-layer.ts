/**
 * AIS vessels as course-aligned billboards. Only vessels inside the view are drawn, and when
 * zoomed out one vessel per small screen cell is kept so a worldwide fleet stays readable and fast.
 */
import type { Billboard, BillboardCollection, Cartesian3, Viewer } from "cesium";

import { isMoving, shipBearing } from "@/features/ships/lib/format";
import { shipMarker } from "@/lib/icons/ship-icons";
import type { Ship } from "@/types/ships";

import { createOccluder } from "./cesium-types";
import { HorizonCulling } from "./horizon-culling";
import type { CesiumModule } from "./load-cesium";

/** Screen-cell size (px) used to thin markers at a given globe zoom; 0 = draw every vessel. */
const thinningCell = (zoom: number) => (zoom < 3 ? 6 : zoom < 5 ? 5 : zoom < 7 ? 3 : 0);

export class CesiumShipLayer {
  private readonly billboards: BillboardCollection;
  private rows: Ship[] = [];
  private selectedId: string | null = null;
  private readonly removeListener: () => void;
  /** Billboards skip the depth test; hide those that rotate behind the globe. */
  private culled: { primitive: Billboard; position: Cartesian3 }[] = [];
  private readonly culling: HorizonCulling;

  constructor(
    private readonly C: CesiumModule,
    private readonly viewer: Viewer,
    private readonly getZoom: () => number,
  ) {
    this.billboards = viewer.scene.primitives.add(new C.BillboardCollection({ scene: viewer.scene }));
    this.removeListener = viewer.camera.moveEnd.addEventListener(() => this.draw());
    this.culling = new HorizonCulling(C, viewer, () => this.culled);
  }

  update(ships: Ship[], selectedId: string | null) {
    this.rows = ships;
    this.selectedId = selectedId;
    this.draw();
  }

  find(id: string) {
    return this.rows.find((s) => s.id === id);
  }

  destroy() {
    this.removeListener();
    this.culling.destroy();
    if (!this.viewer.isDestroyed()) this.viewer.scene.primitives.remove(this.billboards);
  }

  private draw() {
    const { C, viewer } = this;
    if (viewer.isDestroyed()) return;
    const { scene, camera } = viewer;
    this.billboards.removeAll();
    this.culled = [];
    if (!this.rows.length) {
      scene.requestRender();
      return;
    }

    const rect = camera.computeViewRectangle(scene.globe.ellipsoid);
    const occluder = createOccluder(C, scene.globe.ellipsoid, camera.positionWC);
    const zoom = this.getZoom();
    const cell = thinningCell(zoom);
    // Smaller markers at world scale so dense coasts stay legible.
    const [movingSize, stoppedSize] = zoom < 4 ? [9, 5] : zoom < 7 ? [13, 7] : [17, 9];
    const width = scene.canvas.clientWidth;
    const height = scene.canvas.clientHeight;
    const used = new Set<string>();
    const selected = this.selectedId ? this.rows.find((s) => s.id === this.selectedId) : undefined;
    // Selected first so it always claims its cell, then moving vessels before stationary ones.
    const ordered = selected ? [selected, ...this.rows] : this.rows;

    for (const ship of ordered) {
      const chosen = ship === selected;
      if (!chosen && ship.id === this.selectedId) continue;
      if (rect && !C.Rectangle.contains(rect, C.Cartographic.fromDegrees(ship.lng, ship.lat))) continue;
      const position = C.Cartesian3.fromDegrees(ship.lng, ship.lat, 5);
      if (!occluder.isPointVisible(position)) continue;
      if (cell) {
        const p = C.SceneTransforms.worldToWindowCoordinates(scene, position);
        if (!p || p.x < 0 || p.y < 0 || p.x > width || p.y > height) continue;
        const key = `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`;
        if (used.has(key) && !chosen) continue;
        used.add(key);
      }
      const moving = isMoving(ship);
      const size = chosen ? 28 : moving ? movingSize : stoppedSize;
      const billboard = this.billboards.add({
        position,
        image: shipMarker(ship.category, moving, chosen),
        width: size,
        height: size,
        // Counter-clockwise from north when aligned to the globe's Z axis.
        rotation: moving ? -C.Math.toRadians(shipBearing(ship)) : 0,
        alignedAxis: moving ? C.Cartesian3.UNIT_Z : C.Cartesian3.ZERO,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        id: { shipId: ship.id },
      });
      this.culled.push({ primitive: billboard, position });
    }
    this.culling.invalidate();
    scene.requestRender();
  }
}
