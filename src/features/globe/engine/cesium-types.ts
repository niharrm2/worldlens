import type { Cartesian3, Ellipsoid } from "cesium";

import type { CesiumModule } from "./load-cesium";

/** `EllipsoidalOccluder` ships in the Cesium bundle but is omitted from its public typings. */
export interface EllipsoidalOccluder {
  isPointVisible(point: Cartesian3): boolean;
}

export function createOccluder(C: CesiumModule, ellipsoid: Ellipsoid, cameraPosition: Cartesian3): EllipsoidalOccluder {
  const Ctor = (C as unknown as {
    EllipsoidalOccluder: new (ellipsoid: Ellipsoid, cameraPosition: Cartesian3) => EllipsoidalOccluder;
  }).EllipsoidalOccluder;
  return new Ctor(ellipsoid, cameraPosition);
}
