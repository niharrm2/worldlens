/** Cesium renderer for declarative overlays (points, cells, arrows, imagery, wind particles). */
import type {
  Billboard,
  BillboardCollection,
  ImageryLayer,
  PointPrimitive,
  PointPrimitiveCollection,
  Polyline,
  PolylineCollection,
  Primitive,
  Viewer,
  Cartesian3,
} from "cesium";

import { glyphMarker } from "@/lib/icons/map-glyphs";

import { createVectorField, type OverlayPickId, type OverlaySpec } from "../overlays";
import { HorizonCulling } from "./horizon-culling";
import type { CesiumModule } from "./load-cesium";

const ARROW_IMAGE =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M16 3 24 15h-5v14h-6V15H8Z" fill="#fff" stroke="#000" stroke-opacity=".45" stroke-width="1.2"/></svg>',
  );

type Handle =
  | {
      kind: "points";
      collection: PointPrimitiveCollection;
      /** Icon markers (glyph badges) live in a billboard collection. */
      icons: BillboardCollection;
      /** Applies the current pulse factor (1 = rest size). */
      pulsing: ((factor: number) => void)[];
      /** Surface markers skip the depth test, so they are hidden manually when behind the globe. */
      culled: { primitive: PointPrimitive | Billboard; position: Cartesian3 }[];
    }
  | { kind: "cells"; primitive: Primitive | null }
  | { kind: "arrows"; collection: BillboardCollection }
  | { kind: "tiles"; layer: ImageryLayer; url: string }
  | { kind: "image"; layer: ImageryLayer; url: string }
  | { kind: "lighting" }
  | { kind: "frames"; layers: Map<string, ImageryLayer> }
  | { kind: "particles"; system: WindParticles };

export class CesiumOverlays {
  private readonly handles = new Map<string, Handle>();
  private raf = 0;
  private readonly culling: HorizonCulling;

  constructor(private readonly C: CesiumModule, private readonly viewer: Viewer) {
    this.culling = new HorizonCulling(C, viewer, () => {
      const items: { primitive: { show: boolean }; position: Cartesian3 }[] = [];
      for (const h of this.handles.values()) if (h.kind === "points") items.push(...h.culled);
      return items;
    });
  }

  set(key: string, spec: OverlaySpec | null) {
    const existing = this.handles.get(key);
    // Imagery handles are updated in place to avoid re-downloading tiles.
    if (spec?.kind === "tiles" && existing?.kind === "tiles" && existing.url === spec.url) {
      existing.layer.alpha = spec.opacity;
      this.render();
      return;
    }
    if (spec?.kind === "image" && existing?.kind === "image" && existing.url === spec.url) {
      existing.layer.alpha = spec.opacity;
      this.render();
      return;
    }
    if (spec?.kind === "lighting" && existing?.kind === "lighting") {
      this.applyLighting(spec.time);
      return;
    }
    if (spec?.kind === "frames" && existing?.kind === "frames") {
      this.updateFrames(existing, spec);
      return;
    }
    if (existing) this.remove(key, existing);
    if (spec) this.handles.set(key, this.create(key, spec));
    this.culling.invalidate();
    this.syncAnimation();
    this.render();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.culling.destroy();
    for (const [key, handle] of this.handles) this.remove(key, handle);
    this.handles.clear();
  }

  // ---- creation ------------------------------------------------------------

  private create(key: string, spec: OverlaySpec): Handle {
    const { C, viewer } = this;
    const scene = viewer.scene;
    switch (spec.kind) {
      case "points": {
        const collection = scene.primitives.add(new C.PointPrimitiveCollection());
        const icons = scene.primitives.add(new C.BillboardCollection({ scene }));
        const pulsing: ((factor: number) => void)[] = [];
        const culled: { primitive: PointPrimitive | Billboard; position: Cartesian3 }[] = [];
        for (const p of spec.points) {
          const position = C.Cartesian3.fromDegrees(p.lng, p.lat, p.alt ?? 0);
          const id = p.id ? ({ overlay: key, item: p.id, label: p.label } satisfies OverlayPickId) : undefined;
          if (p.icon) {
            const badge = icons.add({
              position,
              image: glyphMarker(p.icon.glyph, p.color, p.icon.shape, p.icon.selected),
              width: p.size,
              height: p.size,
              disableDepthTestDistance: p.alt ? undefined : Number.POSITIVE_INFINITY,
              id,
            });
            if (p.pulse) pulsing.push((f) => (badge.scale = f));
            if (!p.alt) culled.push({ primitive: badge, position });
            continue;
          }
          const point = collection.add({
            position,
            pixelSize: p.size,
            color: C.Color.fromCssColorString(p.color),
            outlineColor: C.Color.fromCssColorString(p.outline ?? "#00000088"),
            outlineWidth: p.outline ? 1.5 : 0.6,
            disableDepthTestDistance: p.alt ? undefined : Number.POSITIVE_INFINITY,
            id,
          });
          if (p.pulse) pulsing.push((f) => (point.pixelSize = p.size * f));
          if (!p.alt) culled.push({ primitive: point, position });
        }
        return { kind: "points", collection, icons, pulsing, culled };
      }
      case "cells": {
        if (!spec.cells.length) return { kind: "cells", primitive: null };
        const half = spec.step / 2;
        const instances = spec.cells.map(
          (cell) =>
            new C.GeometryInstance({
              geometry: new C.RectangleGeometry({
                rectangle: C.Rectangle.fromDegrees(
                  cell.lng - half,
                  Math.max(-89.9, cell.lat - half),
                  cell.lng + half,
                  Math.min(89.9, cell.lat + half),
                ),
                height: 12_000,
                vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
              }),
              id: cell.id ? ({ overlay: key, item: cell.id, label: cell.label } satisfies OverlayPickId) : undefined,
              attributes: {
                color: C.ColorGeometryInstanceAttribute.fromColor(
                  // Cell colours may carry their own alpha (e.g. twilight); it scales with the layer opacity.
                  ((c) => c.withAlpha(c.alpha * spec.opacity))(C.Color.fromCssColorString(cell.color)),
                ),
              } as never,
            }),
        );
        const primitive = scene.primitives.add(
          new C.Primitive({
            geometryInstances: instances,
            appearance: new C.PerInstanceColorAppearance({ translucent: true, flat: true }),
            asynchronous: false,
          }),
        );
        return { kind: "cells", primitive };
      }
      case "arrows": {
        const collection = scene.primitives.add(new C.BillboardCollection({ scene }));
        for (const a of spec.arrows) {
          collection.add({
            position: C.Cartesian3.fromDegrees(a.lng, a.lat, 15_000),
            image: ARROW_IMAGE,
            width: a.size,
            height: a.size,
            color: C.Color.fromCssColorString(a.color),
            rotation: -C.Math.toRadians(a.bearing),
            alignedAxis: C.Cartesian3.UNIT_Z,
          });
        }
        return { kind: "arrows", collection };
      }
      case "tiles": {
        const layer = viewer.imageryLayers.addImageryProvider(this.provider(spec.url, spec.maxLevel, spec.credit, spec.geographic));
        layer.alpha = spec.opacity;
        return { kind: "tiles", layer, url: spec.url };
      }
      case "image": {
        const layer = C.ImageryLayer.fromProviderAsync(
          C.SingleTileImageryProvider.fromUrl(spec.url, {
            rectangle: C.Rectangle.fromDegrees(spec.west, spec.south, spec.east, spec.north),
            credit: spec.credit,
          }),
          {},
        );
        layer.alpha = spec.opacity;
        viewer.imageryLayers.add(layer);
        return { kind: "image", layer, url: spec.url };
      }
      case "lighting":
        this.applyLighting(spec.time);
        return { kind: "lighting" };
      case "frames": {
        const handle: Handle = { kind: "frames", layers: new Map() };
        this.updateFrames(handle, spec);
        return handle;
      }
      case "particles":
        return { kind: "particles", system: new WindParticles(C, viewer, spec.step, spec.samples, spec.color) };
    }
  }

  private provider(url: string, maxLevel: number, credit: string, geographic = false) {
    const C = this.C;
    return geographic
      ? new C.UrlTemplateImageryProvider({
          url,
          maximumLevel: maxLevel,
          credit,
          tilingScheme: new C.GeographicTilingScheme(),
          tileWidth: 512,
          tileHeight: 512,
        })
      : new C.UrlTemplateImageryProvider({ url, maximumLevel: maxLevel, credit });
  }

  /** Light the globe from the sun's true position at `time`. */
  private applyLighting(time: number) {
    const { C, viewer } = this;
    viewer.clock.currentTime = C.JulianDate.fromDate(new Date(time));
    const globe = viewer.scene.globe;
    globe.enableLighting = true;
    globe.dynamicAtmosphereLighting = true;
    // Cesium fades sun shading out at space-level zoom by default; keep it at full strength.
    globe.lightingFadeOutDistance = 1;
    globe.lightingFadeInDistance = 2;
    this.render();
  }

  /** All frames stay loaded (alpha 0 when hidden) so playback does not flicker. */
  private updateFrames(handle: Extract<Handle, { kind: "frames" }>, spec: Extract<OverlaySpec, { kind: "frames" }>) {
    const wanted = new Set(spec.urls);
    for (const [url, layer] of handle.layers) {
      if (!wanted.has(url)) {
        this.viewer.imageryLayers.remove(layer, true);
        handle.layers.delete(url);
      }
    }
    spec.urls.forEach((url, i) => {
      let layer = handle.layers.get(url);
      if (!layer) {
        layer = this.viewer.imageryLayers.addImageryProvider(this.provider(url, spec.maxLevel, spec.credit));
        handle.layers.set(url, layer);
      }
      layer.alpha = i === spec.frame ? spec.opacity : 0;
    });
    this.render();
  }

  private remove(key: string, handle: Handle) {
    const { viewer } = this;
    if (viewer.isDestroyed()) return;
    switch (handle.kind) {
      case "points":
        viewer.scene.primitives.remove(handle.collection);
        viewer.scene.primitives.remove(handle.icons);
        break;
      case "cells":
        if (handle.primitive) viewer.scene.primitives.remove(handle.primitive);
        break;
      case "arrows":
        viewer.scene.primitives.remove(handle.collection);
        break;
      case "tiles":
      case "image":
        viewer.imageryLayers.remove(handle.layer, true);
        break;
      case "lighting":
        viewer.scene.globe.enableLighting = false;
        viewer.scene.globe.dynamicAtmosphereLighting = false;
        viewer.scene.globe.lightingFadeOutDistance = 10_000_000;
        viewer.scene.globe.lightingFadeInDistance = 20_000_000;
        break;
      case "frames":
        for (const layer of handle.layers.values()) viewer.imageryLayers.remove(layer, true);
        break;
      case "particles":
        handle.system.destroy();
        break;
    }
    this.handles.delete(key);
  }

  // ---- animation -------------------------------------------------------------

  private animating() {
    for (const h of this.handles.values()) {
      if (h.kind === "particles" || (h.kind === "points" && h.pulsing.length)) return true;
    }
    return false;
  }

  private syncAnimation() {
    if (this.raf || !this.animating()) return;
    const tick = (t: number) => {
      this.raf = 0;
      if (this.viewer.isDestroyed() || !this.animating()) return;
      if (!document.hidden) {
        const pulse = 1 + 0.7 * Math.abs(Math.sin(t / 420));
        for (const h of this.handles.values()) {
          if (h.kind === "points") for (const apply of h.pulsing) apply(pulse);
          if (h.kind === "particles") h.system.step();
        }
        this.viewer.scene.requestRender();
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private render() {
    if (!this.viewer.isDestroyed()) this.viewer.scene.requestRender();
  }
}

/** Animated streamlines advected through a bilinear wind field. */
class WindParticles {
  private readonly lines: PolylineCollection;
  private readonly particles: { lat: number; lng: number; age: number; trail: Cartesian3[]; line: Polyline }[] = [];
  private readonly field: ReturnType<typeof createVectorField>;
  private static readonly COUNT = 1800;
  private static readonly TRAIL = 12;
  private static readonly MAX_AGE = 90;

  constructor(
    private readonly C: CesiumModule,
    private readonly viewer: Viewer,
    step: number,
    samples: { lat: number; lng: number; u: number; v: number }[],
    color: string,
  ) {
    this.field = createVectorField(step, samples);
    this.lines = viewer.scene.primitives.add(new C.PolylineCollection());
    const material = C.Material.fromType("Color", { color: C.Color.fromCssColorString(color) });
    for (let i = 0; i < WindParticles.COUNT; i++) {
      const p = this.spawn();
      const line = this.lines.add({ positions: p.trail, width: 1.8, material });
      this.particles.push({ ...p, line, age: Math.floor(Math.random() * WindParticles.MAX_AGE) });
    }
  }

  private spawn() {
    const lat = this.field.latMin + Math.random() * (this.field.latMax - this.field.latMin);
    const lng = -180 + Math.random() * 360;
    const at = this.C.Cartesian3.fromDegrees(lng, lat, 20_000);
    return { lat, lng, age: 0, trail: Array.from({ length: WindParticles.TRAIL }, () => at) };
  }

  step() {
    const { C } = this;
    for (const p of this.particles) {
      const [u, v] = this.field.sample(p.lat, p.lng);
      p.lat += v * 0.03;
      p.lng += (u * 0.03) / Math.max(0.2, Math.cos((p.lat * Math.PI) / 180));
      if (p.lng > 180) p.lng -= 360;
      if (p.lng < -180) p.lng += 360;
      p.age++;
      if (p.age > WindParticles.MAX_AGE || p.lat < this.field.latMin || p.lat > this.field.latMax || Math.hypot(u, v) < 0.3) {
        Object.assign(p, this.spawn());
      } else {
        p.trail = [...p.trail.slice(1), C.Cartesian3.fromDegrees(p.lng, p.lat, 20_000)];
      }
      p.line.positions = p.trail;
    }
  }

  destroy() {
    if (!this.viewer.isDestroyed()) this.viewer.scene.primitives.remove(this.lines);
  }
}
