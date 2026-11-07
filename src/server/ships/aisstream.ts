import "server-only";

import { aisCourse, aisHeading, aisSpeed, aisText, finite, navStatusText, shipCategory, validPosition } from "@/lib/ais";
import type { ShipDetail } from "@/types/ships";

/**
 * Worldwide terrestrial AIS via AISStream.io (free API key, WebSocket only, server-side).
 * One shared connection fills an in-memory vessel table; it disconnects when nobody is
 * watching ships and reconnects with backoff on failure.
 */
const STREAM_URL = "wss://stream.aisstream.io/v0/stream";
const MESSAGE_TYPES = ["PositionReport", "StandardClassBPositionReport", "ShipStaticData"];
/** Positions older than this are dropped. */
const RETENTION_MS = 60 * 60_000;
/** Close the stream when no client has asked for ships for this long. */
const IDLE_MS = 10 * 60_000;
const MAX_STATIC = 300_000;

interface Position {
  lat: number;
  lng: number;
  speed: number | null;
  course: number | null;
  heading: number | null;
  navStatus: number | null;
  name: string;
  time: number;
}

interface Static {
  name: string;
  callSign: string;
  imo: number | null;
  destination: string;
  shipType: number | null;
  draught: number | null;
  length: number | null;
  width: number | null;
}

interface StreamMessage {
  MessageType?: string;
  MetaData?: { MMSI?: number; ShipName?: string; time_utc?: string };
  Message?: Record<string, Record<string, unknown>>;
  error?: string;
}

/** "2026-11-06 16:25:21.149691004 +0000 UTC" → epoch ms. */
function parseTime(value: string | undefined): number {
  const iso = value?.slice(0, 23).replace(" ", "T");
  const time = iso ? Date.parse(`${iso}Z`) : NaN;
  return Number.isFinite(time) ? Math.min(time, Date.now()) : Date.now();
}

class AisStreamFeed {
  private socket: WebSocket | null = null;
  private readonly positions = new Map<number, Position>();
  private readonly statics = new Map<number, Static>();
  private lastClient = 0;
  private failures = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;
  private connectedAt = 0;
  private messages = 0;
  error = "";

  constructor(private readonly apiKey: string) {}

  /** Mark a client as interested; connects on demand. */
  touch() {
    this.lastClient = Date.now();
    if (!this.socket && !this.retryTimer) this.connect();
  }

  get connected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  get count() {
    return this.positions.size;
  }

  status(): string {
    if (this.error) return this.error;
    if (!this.connected) return "Connecting to AISStream…";
    const minutes = Math.floor((Date.now() - this.connectedAt) / 60_000);
    return `Streaming worldwide AIS · ${this.messages.toLocaleString()} messages in ${minutes} min`;
  }

  snapshot(): ShipDetail[] {
    const now = Date.now();
    const ships: ShipDetail[] = [];
    for (const [mmsi, p] of this.positions) {
      if (now - p.time > RETENTION_MS) continue;
      const s = this.statics.get(mmsi);
      ships.push({
        id: String(mmsi),
        mmsi,
        lat: p.lat,
        lng: p.lng,
        speed: p.speed,
        course: p.course,
        heading: p.heading,
        shipType: s?.shipType ?? null,
        category: shipCategory(s?.shipType),
        name: s?.name || p.name,
        positionTime: p.time,
        navStatus: navStatusText(p.navStatus),
        callSign: s?.callSign ?? "",
        imo: s?.imo ?? null,
        destination: s?.destination ?? "",
        draught: s?.draught ?? null,
        length: s?.length ?? null,
        width: s?.width ?? null,
        source: "aisstream",
      });
    }
    return ships;
  }

  private connect() {
    this.retryTimer = null;
    const socket = new WebSocket(STREAM_URL);
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    const decoder = new TextDecoder();

    socket.onopen = () => {
      // The subscription must be sent within 3 seconds of opening.
      socket.send(
        JSON.stringify({
          APIKey: this.apiKey,
          BoundingBoxes: [[[-90, -180], [90, 180]]],
          FilterMessageTypes: MESSAGE_TYPES,
        }),
      );
      this.connectedAt = Date.now();
      this.messages = 0;
      this.error = "";
    };

    socket.onmessage = (event: MessageEvent) => {
      const text = typeof event.data === "string" ? event.data : decoder.decode(event.data as ArrayBuffer);
      try {
        this.handle(JSON.parse(text) as StreamMessage);
      } catch {
        // Ignore malformed frames.
      }
    };

    socket.onerror = () => {
      this.error = "AISStream connection error. Retrying.";
    };

    socket.onclose = () => {
      this.socket = null;
      if (Date.now() - this.lastClient > IDLE_MS) {
        this.failures = 0;
        return;
      }
      this.failures++;
      const delay = Math.min(60_000, 5_000 * 2 ** Math.min(this.failures - 1, 4));
      this.retryTimer = setTimeout(() => this.connect(), delay);
      this.retryTimer.unref?.();
    };

    this.pruneTimer ??= setInterval(() => this.prune(), 60_000);
    this.pruneTimer.unref?.();
  }

  private handle(m: StreamMessage) {
    if (m.error) {
      this.error = `AISStream: ${m.error}`;
      this.socket?.close();
      return;
    }
    const mmsi = finite(m.MetaData?.MMSI);
    const body = m.MessageType ? m.Message?.[m.MessageType] : undefined;
    if (mmsi === null || !body) return;
    this.messages++;
    this.failures = 0;

    if (m.MessageType === "ShipStaticData") {
      const dim = (body.Dimension ?? {}) as Record<string, unknown>;
      const a = finite(dim.A) ?? 0, b = finite(dim.B) ?? 0, c = finite(dim.C) ?? 0, d = finite(dim.D) ?? 0;
      if (this.statics.size >= MAX_STATIC && !this.statics.has(mmsi)) return;
      this.statics.set(mmsi, {
        name: aisText(body.Name),
        callSign: aisText(body.CallSign),
        imo: finite(body.ImoNumber) || null,
        destination: aisText(body.Destination),
        shipType: finite(body.Type) || null,
        draught: finite(body.MaximumStaticDraught) || null,
        length: a + b || null,
        width: c + d || null,
      });
      return;
    }

    const lat = body.Latitude, lng = body.Longitude;
    if (!validPosition(lat, lng)) return;
    const time = parseTime(m.MetaData?.time_utc);
    const previous = this.positions.get(mmsi);
    if (previous && previous.time > time) return;
    this.positions.set(mmsi, {
      lat,
      lng: lng as number,
      speed: aisSpeed(body.Sog),
      course: aisCourse(body.Cog),
      heading: aisHeading(body.TrueHeading),
      navStatus: finite(body.NavigationalStatus),
      name: aisText(m.MetaData?.ShipName),
      time,
    });
  }

  private prune() {
    const now = Date.now();
    for (const [mmsi, p] of this.positions) if (now - p.time > RETENTION_MS) this.positions.delete(mmsi);
    if (now - this.lastClient > IDLE_MS) this.socket?.close();
  }
}

const g = globalThis as typeof globalThis & { __worldlensAisStream?: AisStreamFeed | null };

/** Shared feed, or null when no API key is configured. */
export function getAisStream(): AisStreamFeed | null {
  if (g.__worldlensAisStream === undefined) {
    const key = process.env.AISSTREAM_API_KEY?.trim();
    g.__worldlensAisStream = key ? new AisStreamFeed(key) : null;
  }
  return g.__worldlensAisStream;
}
