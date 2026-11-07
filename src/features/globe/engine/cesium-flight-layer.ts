/** 3D aircraft meshes, batched per material, for every cached position in view. */
import type { Geometry, GeometryInstance, Primitive, Viewer } from "cesium";

import type { Aircraft } from "@/types/flights";

import { createOccluder } from "./cesium-types";
import type { CesiumModule } from "./load-cesium";

type Vec3 = [number, number, number];
type Tri = (a: Vec3, b: Vec3, c: Vec3) => void;
type Ring = [y: number, rx: number, rz: number];

const LIVE_COLORS = ["#086ba8", "#07436c", "#041c32"];
const SELECTED_COLORS = ["#ffb000", "#b85c00", "#172b42"];

export class CesiumFlightLayer {
  private meshes: Primitive[] = [];
  private rows: Aircraft[] = [];
  private selected: string | null = null;
  private lastOrientationDraw = 0;
  private readonly body: Geometry;
  private readonly engines: Geometry;
  private readonly dark: Geometry;
  private readonly removeListeners: (() => void)[] = [];

  constructor(private readonly C: CesiumModule, private readonly viewer: Viewer) {
    this.body = this.geometry((t) => {
      this.tube(t, 0, 0, [[3, 0, 0], [2.8, 0.12, 0.12], [2.35, 0.22, 0.23], [1.7, 0.25, 0.27], [-1.5, 0.23, 0.24], [-2.2, 0.13, 0.17], [-2.8, 0.035, 0.05], [-2.95, 0, 0]]);
      for (const s of [-1, 1]) {
        this.wing(t, s, [[0.18, 0.8], [2.1, -0.85], [2.2, -1.1], [0.22, -0.35]]);
        this.wing(t, s, [[0.1, -1.95], [0.9, -2.55], [0.9, -2.7], [0.06, -2.45]], 0.13, 0.035);
      }
      t([0, -1.7, 0.12], [0, -2.7, 0.12], [0, -2.55, 1]);
      t([0, -1.7, 0.12], [0, -2.55, 1], [0.025, -2.7, 0.12]);
    });
    this.engines = this.geometry((t) => {
      for (const x of [-0.85, 0.85]) this.tube(t, x, -0.21, [[0.05, 0.12, 0.12], [-0.05, 0.15, 0.15], [-0.7, 0.13, 0.13], [-0.85, 0.08, 0.08]]);
    });
    this.dark = this.geometry((t) => {
      t([-0.15, 2.45, 0.17], [0.15, 2.45, 0.17], [0.18, 2.1, 0.25]);
      t([-0.15, 2.45, 0.17], [0.18, 2.1, 0.25], [-0.18, 2.1, 0.25]);
      for (const x of [-0.85, 0.85]) {
        const center: Vec3 = [x, 0.06, -0.21];
        for (let i = 0; i < 10; i++) {
          const a0 = (i * 2 * Math.PI) / 10;
          const a1 = ((i + 1) * 2 * Math.PI) / 10;
          t(center, [x + 0.095 * Math.cos(a0), 0.06, -0.21 + 0.095 * Math.sin(a0)], [x + 0.095 * Math.cos(a1), 0.06, -0.21 + 0.095 * Math.sin(a1)]);
        }
      }
    });

    const camera = viewer.camera;
    this.removeListeners.push(camera.moveEnd.addEventListener(() => this.draw()));
    this.removeListeners.push(
      camera.changed.addEventListener(() => {
        if (performance.now() - this.lastOrientationDraw > 500) {
          this.lastOrientationDraw = performance.now();
          this.draw();
        }
      }),
    );
  }

  update(rows: Aircraft[], selected: string | null) {
    this.rows = rows;
    this.selected = selected;
    this.draw();
  }

  find(id: string) {
    return this.rows.find((a) => a.id === id);
  }

  destroy() {
    this.removeListeners.forEach((remove) => remove());
    this.clearMeshes();
  }

  private geometry(build: (tri: Tri) => void): Geometry {
    const C = this.C;
    const values: number[] = [];
    build((a, b, c) => values.push(...a, ...b, ...c));
    const positions = new Float64Array(values);
    return C.GeometryPipeline.computeNormal(
      new C.Geometry({
        attributes: {
          position: new C.GeometryAttribute({
            componentDatatype: C.ComponentDatatype.DOUBLE,
            componentsPerAttribute: 3,
            values: positions,
          }),
        } as never,
        indices: new Uint16Array(Array.from({ length: values.length / 3 }, (_, i) => i)),
        primitiveType: C.PrimitiveType.TRIANGLES,
        boundingSphere: C.BoundingSphere.fromVertices(Array.from(positions)),
      }),
    );
  }

  private tube(tri: Tri, x: number, z: number, rings: Ring[], steps = 10) {
    const point = (ring: Ring, n: number): Vec3 => [
      x + ring[1] * Math.cos((n * 2 * Math.PI) / steps),
      ring[0],
      z + ring[2] * Math.sin((n * 2 * Math.PI) / steps),
    ];
    for (let j = 0; j < rings.length - 1; j++) {
      for (let k = 0; k < steps; k++) {
        const a = point(rings[j], k), b = point(rings[j], k + 1), c = point(rings[j + 1], k), d = point(rings[j + 1], k + 1);
        tri(a, b, c);
        tri(b, d, c);
      }
    }
  }

  private wing(tri: Tri, side: number, points: [number, number][], z = 0.03, thickness = 0.055) {
    const top = points.map(([x, y]): Vec3 => [side * x, y, z]);
    const bottom = points.map(([x, y]): Vec3 => [side * x, y, z - thickness]);
    for (let i = 1; i < top.length - 1; i++) {
      tri(top[0], top[i], top[i + 1]);
      tri(bottom[0], bottom[i + 1], bottom[i]);
    }
    for (let i = 0; i < top.length; i++) {
      const n = (i + 1) % top.length;
      tri(top[i], bottom[i], top[n]);
      tri(top[n], bottom[i], bottom[n]);
    }
  }

  private clearMeshes() {
    for (const p of this.meshes) this.viewer.scene.primitives.remove(p);
    this.meshes = [];
  }

  private draw() {
    const { C, viewer } = this;
    if (viewer.isDestroyed()) return;
    const scene = viewer.scene;
    this.clearMeshes();
    if (!this.rows.length) {
      scene.requestRender();
      return;
    }
    const camera = viewer.camera;
    const occluder = createOccluder(C, scene.globe.ellipsoid, camera.positionWC);
    const instances: GeometryInstance[][] = [[], [], []];
    const width = scene.canvas.clientWidth;
    const height = scene.canvas.clientHeight;
    const fovy = (camera.frustum as { fovy?: number }).fovy || Math.PI / 3;
    let rendered = 0;

    const ordered = [...this.rows.filter((a) => a.id === this.selected), ...this.rows.filter((a) => a.id !== this.selected)];
    for (const a of ordered) {
      const chosen = a.id === this.selected;
      const altitude = Math.max(0, (a.altitude || 0) * 0.3048);
      const anchor = C.Cartesian3.fromDegrees(a.lng, a.lat, altitude + 40);
      const screen = occluder.isPointVisible(anchor) && C.SceneTransforms.worldToWindowCoordinates(scene, anchor);
      if (!screen || screen.x < -30 || screen.y < -30 || screen.x > width + 30 || screen.y > height + 30) continue;

      const distance = C.Cartesian3.distance(camera.positionWC, anchor);
      const pixelMetres = (2 * distance * Math.tan(fovy / 2)) / Math.max(1, height);
      const scale = Math.max(1, (pixelMetres * 16) / 6);
      rendered++;
      const modelAnchor = C.Cartesian3.fromDegrees(a.lng, a.lat, altitude + scale * 0.45 + 40);
      const frame = C.Transforms.eastNorthUpToFixedFrame(modelAnchor);
      const rotation = C.Matrix4.fromRotationTranslation(C.Matrix3.fromRotationZ(-C.Math.toRadians(a.heading || 0)));
      const model = C.Matrix4.multiplyByUniformScale(C.Matrix4.multiply(frame, rotation, new C.Matrix4()), scale, new C.Matrix4());
      const colors = chosen ? SELECTED_COLORS : LIVE_COLORS;
      [this.body, this.engines, this.dark].forEach((geometry, i) =>
        instances[i].push(
          new C.GeometryInstance({
            geometry,
            modelMatrix: model,
            id: { flightId: a.id },
            attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(C.Color.fromCssColorString(colors[i])) } as never,
          }),
        ),
      );
    }

    for (const batch of instances) {
      if (!batch.length) continue;
      this.meshes.push(
        scene.primitives.add(
          new C.Primitive({
            geometryInstances: batch,
            appearance: new C.PerInstanceColorAppearance({ translucent: false, closed: false, faceForward: true }),
            asynchronous: false,
          }),
        ),
      );
    }
    scene.canvas.setAttribute(
      "aria-label",
      `3D flight globe: ${rendered.toLocaleString()} aircraft in view, ${this.rows.length.toLocaleString()} cached worldwide.`,
    );
    scene.canvas.dataset.renderedFlights = String(rendered);
    scene.canvas.dataset.cachedFlights = String(this.rows.length);
    scene.requestRender();
  }
}
