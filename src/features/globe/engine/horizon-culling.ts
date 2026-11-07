/**
 * Hides markers that sit beyond the horizon. Surface markers disable Cesium's depth test so
 * imagery and translucent overlays never clip them; without this check they would show
 * through the planet. Visibility is recomputed only when the camera has moved.
 */
import type { Cartesian3, Viewer } from "cesium";

import { createOccluder } from "./cesium-types";
import type { CesiumModule } from "./load-cesium";

export interface Cullable {
  primitive: { show: boolean };
  position: Cartesian3;
}

export class HorizonCulling {
  private lastCamera: Cartesian3 | null = null;
  private dirty = true;
  private readonly remove: () => void;

  constructor(
    private readonly C: CesiumModule,
    private readonly viewer: Viewer,
    private readonly items: () => Cullable[],
  ) {
    this.remove = viewer.scene.preRender.addEventListener(() => this.update());
  }

  /** Force a recompute on the next frame (after markers are added or replaced). */
  invalidate() {
    this.dirty = true;
    if (!this.viewer.isDestroyed()) this.viewer.scene.requestRender();
  }

  destroy() {
    this.remove();
  }

  private update() {
    const { C, viewer } = this;
    const camera = viewer.camera.positionWC;
    if (!this.dirty && this.lastCamera && C.Cartesian3.equalsEpsilon(camera, this.lastCamera, 0, 1)) return;
    this.dirty = false;
    this.lastCamera = C.Cartesian3.clone(camera, this.lastCamera ?? undefined);
    const occluder = createOccluder(C, viewer.scene.globe.ellipsoid, camera);
    for (const item of this.items()) item.primitive.show = occluder.isPointVisible(item.position);
  }
}
