/** Spherical 2D canvas renderer for devices without WebGL. */
import type { Camera } from "@/features/cameras/types";
import type { OrbitPathPoint, SatellitePoint, SatellitePosition } from "@/features/satellites/types";
import { aircraftDataUri, type AircraftIconState } from "@/lib/icons/aircraft-icons";
import { feedMarker } from "@/lib/icons/feed-icons";
import { glyphMarker } from "@/lib/icons/map-glyphs";
import { isMoving, shipBearing } from "@/features/ships/lib/format";
import { SHIP_COLORS } from "@/lib/icons/ship-icons";
import type { Aircraft } from "@/types/flights";
import type { Ship } from "@/types/ships";

import type { OverlaySpec } from "../overlays";
import type { GlobeEngine, GlobeEvents, LatLng, SatelliteLayerData } from "../types";
import { WORLD_VIEW } from "../types";

const RAD = Math.PI / 180;
const COUNTRIES_URL = "/vendor/countries.geojson";

interface Projected {
  x: number;
  y: number;
  z: number;
}

interface CanvasGroup {
  camera: Camera;
  count: number;
  x: number;
  y: number;
  selected: boolean;
}

interface OrbitalScreen {
  x: number;
  y: number;
  visible: boolean;
}

type Ring = [number, number][];

export class CanvasGlobe implements GlobeEngine {
  readonly kind = "canvas" as const;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly resizeObserver: ResizeObserver;
  private readonly images = new Map<string, HTMLImageElement>();
  private lat = WORLD_VIEW.center[0];
  private lng = WORLD_VIEW.center[1];
  private zoom = WORLD_VIEW.zoom;
  private rows: Camera[] = [];
  private selected: string | null = null;
  private groups: CanvasGroup[] = [];
  private land: Ring[] = [];
  private flights: Aircraft[] = [];
  private flightSelected: string | null = null;
  private flightScreens = new Map<string, Projected>();
  private ships: Ship[] = [];
  private shipSelected: string | null = null;
  private shipScreens = new Map<string, Projected>();
  private readonly overlays = new Map<string, OverlaySpec>();
  private overlayHits: { overlay: string; item: string; x: number; y: number; r: number }[] = [];
  private sat: SatelliteLayerData = { points: [], selectedId: null, selectedPosition: null, path: [] };
  private satScreens = new Map<number, OrbitalScreen>();
  private showCameras = true;
  private night = false;
  private tilt = false;
  private w = 1;
  private h = 1;
  private r = 1;
  private raf = 0;
  private drag: { x: number; y: number; lat: number; lng: number; moved: boolean } | null = null;
  private destroyed = false;

  constructor(private readonly host: HTMLElement, private readonly events: GlobeEvents) {
    host.replaceChildren();
    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("aria-label", "Interactive Earth globe. Drag to rotate; use zoom buttons to explore.");
    this.canvas.tabIndex = 0;
    host.append(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;

    const badge = document.createElement("div");
    badge.className = "compatibilitybadge";
    badge.textContent = "COMPATIBILITY GLOBE";
    const credit = document.createElement("a");
    credit.className = "globecredit";
    credit.href = "https://www.naturalearthdata.com/";
    credit.target = "_blank";
    credit.rel = "noopener";
    credit.textContent = "Natural Earth · globe outlines";
    host.append(badge, credit);

    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("keydown", this.onKeyDown);
    this.resizeObserver = new ResizeObserver(() => this.request());
    this.resizeObserver.observe(host);

    fetch(COUNTRIES_URL)
      .then((r) => r.json())
      .then((d: { features: { geometry: { type: string; coordinates: Ring[] | Ring[][] } }[] }) => {
        this.land = d.features.flatMap((f) =>
          f.geometry.type === "Polygon"
            ? [(f.geometry.coordinates as Ring[])[0]]
            : (f.geometry.coordinates as Ring[][]).map((p) => p[0]),
        );
        this.request();
      })
      .catch(() => {
        // Outlines are optional.
      });
    this.request();
  }

  // ---- GlobeEngine -------------------------------------------------------

  setCameraRows(rows: Camera[], selectedId: string | null) {
    this.rows = rows;
    this.selected = selectedId;
    this.request();
  }

  setCameraVisibility(show: boolean) {
    this.showCameras = show;
    this.request();
  }

  setSatellites(data: SatelliteLayerData) {
    this.sat = data;
    this.request();
  }

  setFlights(aircraft: Aircraft[], selectedId: string | null) {
    this.flights = aircraft;
    this.flightSelected = selectedId;
    this.request();
  }

  setShips(ships: Ship[], selectedId: string | null) {
    this.ships = ships;
    this.shipSelected = selectedId;
    this.request();
  }

  /** Points, cells and arrows are drawn; imagery and particle overlays need WebGL. */
  setOverlay(key: string, spec: OverlaySpec | null) {
    if (spec) this.overlays.set(key, spec);
    else this.overlays.delete(key);
    this.request();
  }

  flyTo([lat, lng]: LatLng, zoom = 2) {
    this.lat = lat;
    this.lng = lng;
    this.zoom = zoom;
    this.moved();
  }

  setView(target: LatLng, zoom: number) {
    this.flyTo(target, zoom);
  }

  zoomBy(delta: number) {
    this.zoom = Math.max(-1, Math.min(18, this.zoom + delta));
    this.moved();
  }

  toggleTilt() {
    this.tilt = !this.tilt;
    this.lat = Math.max(-85, Math.min(85, this.lat + (this.tilt ? 20 : -20)));
    this.moved();
  }

  setNight(night: boolean) {
    this.night = night;
    this.request();
  }

  getZoom() {
    return this.zoom;
  }

  getCenter() {
    return { lat: this.lat, lng: this.lng };
  }

  isInView(lat: number, lng: number) {
    return !!this.visible(lat, lng);
  }

  resize() {
    this.request();
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.host.replaceChildren();
  }

  // ---- Projection --------------------------------------------------------

  private project(a: number, b: number): Projected {
    const p = a * RAD, d = (b - this.lng) * RAD, c = this.lat * RAD;
    const x = Math.cos(p) * Math.sin(d);
    const y = Math.cos(c) * Math.sin(p) - Math.sin(c) * Math.cos(p) * Math.cos(d);
    const z = Math.sin(c) * Math.sin(p) + Math.cos(c) * Math.cos(p) * Math.cos(d);
    return { x: this.w / 2 + this.r * x, y: this.h / 2 - this.r * y, z };
  }

  /** Screen point → lat/lng on the visible hemisphere (inverse orthographic projection). */
  private unproject(x: number, y: number): { lat: number; lng: number } | null {
    const dx = (x - this.w / 2) / this.r;
    const dy = (this.h / 2 - y) / this.r;
    if (dx * dx + dy * dy > 1) return null;
    const dz = Math.sqrt(1 - dx * dx - dy * dy);
    const c = this.lat * RAD;
    const lat = Math.asin(dy * Math.cos(c) + dz * Math.sin(c)) / RAD;
    const lng = this.lng + Math.atan2(dx, dz * Math.cos(c) - dy * Math.sin(c)) / RAD;
    return { lat, lng: ((lng + 540) % 360) - 180 };
  }

  private visible(lat: number, lng: number): Projected | null {
    const p = this.project(lat, lng);
    return p.z > 0 && p.x >= 0 && p.x <= this.w && p.y >= 0 && p.y <= this.h ? p : null;
  }

  /** Radial altitude projection; hides objects occulted by Earth. */
  private orbital(p: SatellitePosition): OrbitalScreen {
    const ground = this.project(p.lat, p.lng);
    const factor = 1 + p.alt / 6371;
    const x = (ground.x - this.w / 2) * factor + this.w / 2;
    const y = (ground.y - this.h / 2) * factor + this.h / 2;
    return { x, y, visible: ground.z >= 0 || Math.hypot(x - this.w / 2, y - this.h / 2) > this.r + 2 };
  }

  private image(key: string, src: string) {
    let img = this.images.get(key);
    if (!img) {
      img = new Image();
      img.onload = () => this.request();
      img.src = src;
      this.images.set(key, img);
    }
    return img;
  }

  // ---- Rendering ---------------------------------------------------------

  private request() {
    if (!this.raf && !this.destroyed) this.raf = requestAnimationFrame(() => this.paint());
  }

  private moved() {
    this.request();
    this.events.onMoveEnd();
  }

  private strokeLine(points: [number, number][]) {
    const ctx = this.ctx;
    ctx.beginPath();
    let started = false;
    for (const [a, b] of points) {
      const p = this.project(a, b);
      if (p.z <= 0) {
        started = false;
        continue;
      }
      if (started) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
      started = true;
    }
    ctx.stroke();
  }

  private paint() {
    this.raf = 0;
    const { ctx, canvas, host } = this;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = (this.w = host.clientWidth);
    const h = (this.h = host.clientHeight);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);
    const zoom = this.zoom;
    const r = (this.r = Math.min(w, h) * 0.41 * Math.pow(2, (zoom - 2) * (zoom < 2 ? 1.1 : 0.65)));

    ctx.fillStyle = "#060d18";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 85; i++) {
      ctx.fillStyle = i % 3 ? "#6f8caa55" : "#aecbe477";
      ctx.fillRect((i * 137.5) % w, (i * 79.3) % h, 1, 1);
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    ctx.shadowColor = "#5faeea";
    ctx.shadowBlur = 22;
    ctx.fillStyle = this.night ? "#091c2c" : "#163950";
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.clip();

    ctx.strokeStyle = "#46738644";
    ctx.lineWidth = 0.65;
    for (let a = -60; a <= 60; a += 30) this.strokeLine(Array.from({ length: 181 }, (_, i) => [a, i * 2 - 180]));
    for (let b = -180; b < 180; b += 30) this.strokeLine(Array.from({ length: 91 }, (_, i) => [i * 2 - 90, b]));

    ctx.fillStyle = this.night ? "#244752" : "#35626d";
    ctx.strokeStyle = this.night ? "#53828b" : "#6da0a0";
    ctx.lineWidth = 0.65;
    for (const ring of this.land) {
      ctx.beginPath();
      let front = 0;
      ring.forEach(([lon, lat], i) => {
        const p = this.project(lat, lon);
        let { x, y } = p;
        if (p.z < 0) {
          const dx = x - w / 2, dy = y - h / 2, n = Math.hypot(dx, dy) || 1;
          x = w / 2 + (r * dx) / n;
          y = h / 2 + (r * dy) / n;
        } else front++;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      if (front) {
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    const shade = ctx.createRadialGradient(w / 2 - r * 0.28, h / 2 - r * 0.3, r * 0.2, w / 2, h / 2, r);
    shade.addColorStop(0, "#b5e5f00a");
    shade.addColorStop(0.75, "#00000000");
    shade.addColorStop(1, "#000b");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    ctx.strokeStyle = "#89ceef66";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    this.paintCameras(zoom);
    this.paintOverlays();
    this.paintShips(zoom);
    this.paintFlights(zoom);
    this.paintSatellites();
  }

  private paintCameras(zoom: number) {
    const bins = new Map<string, CanvasGroup>();
    const cell = zoom < 5 ? 60 : zoom < 10 ? 44 : 35;
    let count = 0;
    for (const c of this.showCameras ? this.rows : []) {
      const p = this.visible(c.lat, c.lng);
      if (!p) continue;
      count++;
      const key = `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`;
      let b = bins.get(key);
      if (!b) {
        b = { camera: c, count: 0, x: p.x, y: p.y, selected: false };
        bins.set(key, b);
      }
      b.count++;
      if (c.id === this.selected) Object.assign(b, { camera: c, x: p.x, y: p.y, selected: true });
    }
    this.groups = [...bins.values()];
    for (const b of this.groups) {
      const src = feedMarker(b.camera.type, b.count, b.selected);
      const img = this.image(src, src);
      if (img.complete) this.ctx.drawImage(img, b.x - 18, b.y - 42, 36, 42);
    }
    this.events.onViewCount(count);
  }

  /** Shared vector aircraft artwork, oriented to local geographic north. */
  private paintFlights(zoom: number) {
    const { ctx } = this;
    const bins = new Set<string>();
    const cell = zoom < 3 ? 18 : zoom < 5 ? 14 : 0;
    this.flightScreens.clear();
    const ordered = [
      ...this.flights.filter((a) => a.id === this.flightSelected),
      ...this.flights.filter((a) => a.id !== this.flightSelected),
    ];
    for (const a of ordered) {
      const p = this.visible(a.lat, a.lng);
      if (!p) continue;
      const chosen = a.id === this.flightSelected;
      const key = cell ? `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}` : null;
      if (key && bins.has(key) && !chosen) continue;
      if (key) bins.add(key);
      this.flightScreens.set(a.id, p);

      const north = this.project(Math.min(89.99, a.lat + 0.05), a.lng);
      const east = this.project(a.lat, a.lng + 0.05);
      const angle = (a.heading || 0) * RAD;
      const lonScale = Math.max(0.05, Math.cos(a.lat * RAD));
      const dx = (north.x - p.x) * Math.cos(angle) + ((east.x - p.x) * Math.sin(angle)) / lonScale;
      const dy = (north.y - p.y) * Math.cos(angle) + ((east.y - p.y) * Math.sin(angle)) / lonScale;
      const state: AircraftIconState = chosen ? "selected" : Date.now() - a.positionTime > 60_000 ? "stale" : "live";
      const image = this.image(`jet-${state}`, aircraftDataUri(state));
      if (!image.complete) continue;
      const size = chosen ? 29 : cell ? 16 : 19;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(dy, dx) + Math.PI / 2);
      ctx.drawImage(image, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
  }

  private paintOverlays() {
    const { ctx } = this;
    this.overlayHits = [];
    for (const [key, spec] of this.overlays) {
      if (spec.kind === "cells") {
        const half = spec.step / 2;
        ctx.globalAlpha = spec.opacity;
        for (const cell of spec.cells) {
          const corners = [
            [cell.lat - half, cell.lng - half], [cell.lat - half, cell.lng + half],
            [cell.lat + half, cell.lng + half], [cell.lat + half, cell.lng - half],
          ].map(([a, b]) => this.project(Math.max(-89.9, Math.min(89.9, a)), b));
          if (corners.some((p) => p.z <= 0)) continue;
          ctx.fillStyle = cell.color;
          ctx.beginPath();
          corners.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
          ctx.closePath();
          ctx.fill();
          if (cell.id) {
            const c = this.project(cell.lat, cell.lng);
            this.overlayHits.push({ overlay: key, item: cell.id, x: c.x, y: c.y, r: Math.max(6, this.r * half * RAD) });
          }
        }
        ctx.globalAlpha = 1;
      } else if (spec.kind === "points") {
        for (const p of spec.points) {
          const q = this.visible(p.lat, p.lng);
          if (!q) continue;
          if (p.icon) {
            const src = glyphMarker(p.icon.glyph, p.color, p.icon.shape, p.icon.selected);
            const img = this.image(src, src);
            if (img.complete) ctx.drawImage(img, q.x - p.size / 2, q.y - p.size / 2, p.size, p.size);
            if (p.id) this.overlayHits.push({ overlay: key, item: p.id, x: q.x, y: q.y, r: Math.max(6, p.size / 2 + 2) });
            continue;
          }
          ctx.beginPath();
          ctx.arc(q.x, q.y, Math.max(1.5, p.size / 2), 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.fill();
          if (p.outline) {
            ctx.strokeStyle = p.outline;
            ctx.lineWidth = 1.2;
            ctx.stroke();
          }
          if (p.id) this.overlayHits.push({ overlay: key, item: p.id, x: q.x, y: q.y, r: Math.max(6, p.size / 2 + 2) });
        }
      } else if (spec.kind === "arrows") {
        ctx.lineWidth = 1.4;
        for (const a of spec.arrows) {
          const q = this.visible(a.lat, a.lng);
          if (!q) continue;
          const north = this.project(Math.min(89.99, a.lat + 0.5), a.lng);
          const angle = Math.atan2(north.x - q.x, q.y - north.y) + a.bearing * RAD;
          const len = a.size / 2;
          ctx.strokeStyle = a.color;
          ctx.beginPath();
          ctx.moveTo(q.x - Math.sin(angle) * len, q.y + Math.cos(angle) * len);
          ctx.lineTo(q.x + Math.sin(angle) * len, q.y - Math.cos(angle) * len);
          ctx.stroke();
        }
      }
    }
  }

  /** Course-aligned hull triangles; dots for vessels that are not under way. */
  private paintShips(zoom: number) {
    const { ctx } = this;
    this.shipScreens.clear();
    const cell = zoom < 3 ? 9 : zoom < 5 ? 7 : zoom < 7 ? 4 : 0;
    const used = new Set<string>();
    const ordered = [...this.ships.filter((s) => s.id === this.shipSelected), ...this.ships.filter((s) => s.id !== this.shipSelected)];
    for (const ship of ordered) {
      const p = this.visible(ship.lat, ship.lng);
      if (!p) continue;
      const chosen = ship.id === this.shipSelected;
      if (cell) {
        const key = `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`;
        if (used.has(key) && !chosen) continue;
        used.add(key);
      }
      this.shipScreens.set(ship.id, p);
      ctx.fillStyle = chosen ? "#fff2b5" : SHIP_COLORS[ship.category];
      ctx.strokeStyle = chosen ? "#ffb000" : "#06121d";
      ctx.lineWidth = 1;
      if (!isMoving(ship)) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, chosen ? 5 : 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        continue;
      }
      const north = this.project(Math.min(89.99, ship.lat + 0.05), ship.lng);
      const s = chosen ? 9 : 6;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(north.x - p.x, p.y - north.y) + shipBearing(ship) * RAD);
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.55, s * 0.8);
      ctx.lineTo(-s * 0.55, s * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  private paintSatellites() {
    const { ctx } = this;
    const { points, selectedId, selectedPosition, path } = this.sat;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#ffdc96";
    ctx.beginPath();
    let open = false;
    for (const p of path as OrbitPathPoint[]) {
      if (!p) {
        open = false;
        continue;
      }
      const q = this.orbital(p);
      if (!q.visible) {
        open = false;
        continue;
      }
      if (open) ctx.lineTo(q.x, q.y);
      else ctx.moveTo(q.x, q.y);
      open = true;
    }
    ctx.stroke();

    this.satScreens.clear();
    for (const point of points as SatellitePoint[]) {
      const chosen = point.id === selectedId;
      const q = this.orbital(chosen && selectedPosition ? selectedPosition : point);
      this.satScreens.set(point.id, q);
      if (!q.visible) continue;
      ctx.beginPath();
      ctx.arc(q.x, q.y, chosen ? 5 : point.type === "geo" ? 3 : 1.7, 0, Math.PI * 2);
      ctx.fillStyle = chosen ? "#fff2b5" : point.type === "geo" ? "#ffcc7d" : point.stale ? "#65758e" : "#8fbdff";
      ctx.fill();
      if (chosen) {
        ctx.strokeStyle = "#fff2b5";
        ctx.strokeRect(q.x - 8, q.y - 3, 4, 6);
        ctx.strokeRect(q.x + 4, q.y - 3, 4, 6);
      }
    }
  }

  // ---- Input -------------------------------------------------------------

  private localPoint(e: PointerEvent) {
    const box = this.canvas.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  }

  private onPointerDown = (e: PointerEvent) => {
    this.drag = { x: e.clientX, y: e.clientY, lat: this.lat, lng: this.lng, moved: false };
    this.canvas.setPointerCapture(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.drag) {
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) this.drag.moved = true;
      this.lng = this.drag.lng - dx / this.r / RAD;
      this.lat = Math.max(-85, Math.min(85, this.drag.lat + dy / this.r / RAD));
      this.request();
      return;
    }
    const { x, y } = this.localPoint(e);
    const hit = this.groups.find((b) => Math.hypot(b.x - x, b.y - 20 - y) < 24);
    this.canvas.style.cursor = hit ? "pointer" : "grab";
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.drag) return;
    const wasDrag = this.drag.moved;
    this.drag = null;
    if (wasDrag) {
      this.moved();
      return;
    }
    const { x, y } = this.localPoint(e);
    const hit = [...this.overlayHits].reverse().find((h) => Math.hypot(h.x - x, h.y - y) < h.r);
    if (hit) {
      this.events.onOverlaySelect(hit.overlay, hit.item);
      return;
    }
    for (const [id, p] of this.shipScreens) {
      if (Math.hypot(p.x - x, p.y - y) < 9) {
        this.events.onShipSelect(id);
        return;
      }
    }
    for (const [id, p] of this.flightScreens) {
      if (Math.hypot(p.x - x, p.y - y) < 12) {
        this.events.onFlightSelect(id);
        return;
      }
    }
    let nearest: { id: number; d: number } | null = null;
    for (const [id, q] of this.satScreens) {
      const d = Math.hypot(q.x - x, q.y - y);
      if (q.visible && d < 10 && (!nearest || d < nearest.d)) nearest = { id, d };
    }
    if (nearest) {
      this.events.onSatelliteSelect(nearest.id);
      return;
    }
    const b = this.groups.find((g) => Math.abs(g.x - x) < 22 && y > g.y - 45 && y < g.y + 4);
    if (!b) {
      const ll = this.unproject(x, y);
      if (ll) this.events.onGlobeClick(ll.lat, ll.lng);
      return;
    }
    if (b.count > 1 && this.zoom < 16 && !b.selected) {
      this.lat = b.camera.lat;
      this.lng = b.camera.lng;
      this.zoom = Math.min(18, this.zoom + 2);
      this.moved();
    } else {
      this.events.onCameraSelect(b.camera.id);
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoom = Math.max(-1, Math.min(18, this.zoom + (e.deltaY < 0 ? 0.6 : -0.6)));
    this.moved();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "-"].includes(e.key)) return;
    e.preventDefault();
    if (e.key === "ArrowLeft") this.lng -= 10;
    if (e.key === "ArrowRight") this.lng += 10;
    if (e.key === "ArrowUp") this.lat = Math.min(85, this.lat + 10);
    if (e.key === "ArrowDown") this.lat = Math.max(-85, this.lat - 10);
    if (e.key === "+") this.zoom = Math.min(18, this.zoom + 1);
    if (e.key === "-") this.zoom = Math.max(2, this.zoom - 1);
    this.moved();
  };
}
