import "server-only";

import { createHash } from "node:crypto";
import net from "node:net";

import type { Glider } from "@/types/earth";

import { cached, getJson } from "./cache";

/**
 * Open Glider Network live feed (APRS-IS, read-only login) with the OGN privacy rules applied
 * before anything leaves the server:
 *  - devices marked "no tracking" in the OGN Devices Database (DDB), or whose message carries
 *    the no-tracking or stealth flag, are dropped entirely;
 *  - devices marked "no identification", or not registered in the DDB, are shown anonymously
 *    (no registration, competition number or device address);
 *  - positions live only in memory and are discarded after 30 minutes.
 * ADS-B traffic relayed by OGN (airliners) and receiver beacons are ignored.
 */
const HOST = "aprs.glidernet.org";
const PORT = 14580;
const LOGIN = "user WorldLens pass -1 vers WorldLens 1.0 filter r/0/0/25000\r\n";
const DDB_URL = "https://ddb.glidernet.org/download/?j=1";
const RETENTION_MS = 30 * 60_000;
const IDLE_MS = 10 * 60_000;
const KEEPALIVE_MS = 4 * 60_000;
/** OGN aircraft types (id field bits 2–5) that are shown. Jets, ground vehicles and obstacles are skipped. */
const AIRCRAFT_TYPES: Record<number, string> = {
  0: "Unknown", 1: "Glider", 2: "Tow plane", 3: "Helicopter", 4: "Skydiver", 5: "Drop plane",
  6: "Hang glider", 7: "Paraglider", 8: "Powered aircraft", 11: "Balloon", 12: "Airship", 13: "Drone",
};
/** Destination calls for OGN-native trackers (FLARM, OGN, FANET, SafeSky, etc.); OGADSB is excluded. */
const TRACKER_TOCALL = /^OG(FLR\d?|NTRK|NFNT|FNT|SKY|PAW|SPOT|LT24|CAPT|NAVI|FLYM|INRE|EVRL|NEMO|APIK|MTK|NMEA|SPID|SXR)$/;

interface DdbDevice {
  device_type: string;
  device_id: string;
  aircraft_model: string;
  registration: string;
  cn: string;
  tracked: string;
  identified: string;
}

interface Fix {
  lat: number;
  lng: number;
  alt: number;
  course: number | null;
  speed: number | null;
  climb: number | null;
  type: number;
  time: number;
}

async function loadDdb(): Promise<Map<string, DdbDevice>> {
  const result = await cached("ogn-ddb", 6 * 60 * 60_000, async () => {
    const body = await getJson<{ devices: DdbDevice[] }>(DDB_URL, 60_000);
    return { items: body.devices, dataTime: Date.now() };
  });
  return new Map(result.items.map((d) => [d.device_id.toUpperCase(), d]));
}

/** "4955.93N" + precision digit → decimal degrees. */
function coord(value: string, hemi: string, extra: number, degDigits: number): number {
  const deg = Number(value.slice(0, degDigits));
  const min = Number(value.slice(degDigits)) + extra / 1000;
  const v = deg + min / 60;
  return hemi === "S" || hemi === "W" ? -v : v;
}

const POSITION = /^([A-Z0-9-]+)>([A-Z0-9]+)[^:]*:[/@](\d{6})h(\d{4}\.\d{2})([NS]).(\d{5}\.\d{2})([EW]).(?:(\d{3})\/(\d{3}))?\/A=(-?\d{6})(.*)$/;

/** Parse one APRS line into [address, fix], applying the in-message privacy flags. */
function parse(line: string, now: number): [string, Fix] | null {
  const m = POSITION.exec(line);
  if (!m || !TRACKER_TOCALL.test(m[2])) return null;
  const rest = m[11];
  const id = /\bid([0-9A-F]{2})([0-9A-F]{6})\b/i.exec(rest);
  if (!id) return null;
  const flags = parseInt(id[1], 16);
  // Bit 7 = stealth, bit 6 = no-tracking: never display.
  if (flags & 0xc0) return null;
  const type = (flags >> 2) & 0x0f;
  if (!(type in AIRCRAFT_TYPES)) return null;

  const dao = /!W(\d)(\d)!/.exec(rest);
  const lat = coord(m[4], m[5], dao ? Number(dao[1]) : 0, 2);
  const lng = coord(m[6], m[7], dao ? Number(dao[2]) : 0, 3);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  const hh = Number(m[3].slice(0, 2)), mm = Number(m[3].slice(2, 4)), ss = Number(m[3].slice(4, 6));
  const today = new Date(now);
  let time = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), hh, mm, ss);
  if (time - now > 3_600_000) time -= 86_400_000;

  const fpm = /([+-]\d+)fpm/.exec(rest);
  return [
    id[2].toUpperCase(),
    {
      lat,
      lng,
      alt: Math.round(Number(m[10]) * 0.3048),
      course: m[8] ? Number(m[8]) % 360 : null,
      speed: m[9] ? Math.round(Number(m[9]) * 1.852) : null,
      climb: fpm ? Math.round(Number(fpm[1]) * 0.00508 * 10) / 10 : null,
      type,
      time,
    },
  ];
}

class OgnFeed {
  private socket: net.Socket | null = null;
  private readonly fixes = new Map<string, Fix>();
  private buffer = "";
  private lastClient = 0;
  private failures = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private keepalive: ReturnType<typeof setInterval> | null = null;
  error = "";
  connectedAt = 0;

  touch() {
    this.lastClient = Date.now();
    if (!this.socket && !this.retry) this.connect();
  }

  get connected() {
    return !!this.socket && !this.socket.destroyed && this.connectedAt > 0;
  }

  private connect() {
    this.retry = null;
    const socket = net.connect(PORT, HOST);
    this.socket = socket;
    socket.setEncoding("latin1");
    socket.setTimeout(KEEPALIVE_MS * 2);
    socket.on("connect", () => {
      socket.write(LOGIN);
      this.connectedAt = Date.now();
      this.error = "";
      this.failures = 0;
    });
    socket.on("data", (chunk: string) => this.receive(chunk));
    socket.on("timeout", () => socket.destroy());
    socket.on("error", (e) => {
      this.error = `OGN connection error (${(e as NodeJS.ErrnoException).code ?? e.message})`;
    });
    socket.on("close", () => {
      this.socket = null;
      this.connectedAt = 0;
      if (Date.now() - this.lastClient > IDLE_MS) return;
      this.failures++;
      this.retry = setTimeout(() => this.connect(), Math.min(60_000, 5_000 * 2 ** Math.min(this.failures - 1, 4)));
      this.retry.unref?.();
    });
    this.keepalive ??= setInterval(() => {
      // APRS-IS expects periodic client traffic; also prune and idle-disconnect here.
      this.socket?.write("#keepalive\r\n");
      const now = Date.now();
      for (const [k, f] of this.fixes) if (now - f.time > RETENTION_MS) this.fixes.delete(k);
      if (now - this.lastClient > IDLE_MS) this.socket?.destroy();
    }, KEEPALIVE_MS);
    this.keepalive.unref?.();
  }

  private receive(chunk: string) {
    this.buffer += chunk;
    let i: number;
    const now = Date.now();
    while ((i = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, i).trim();
      this.buffer = this.buffer.slice(i + 1);
      // Cheap pre-filter: skip comments, ADS-B relays and receiver beacons before regex parsing.
      if (!line || line[0] === "#" || line.includes(">OGADSB") || line.includes(">OGNSDR")) continue;
      const parsed = parse(line, now);
      if (!parsed) continue;
      const [address, fix] = parsed;
      const previous = this.fixes.get(address);
      if (!previous || fix.time >= previous.time) this.fixes.set(address, fix);
    }
    if (this.buffer.length > 100_000) this.buffer = "";
  }

  /** Current aircraft with DDB privacy settings applied. */
  snapshot(ddb: Map<string, DdbDevice>): Glider[] {
    const now = Date.now();
    const out: Glider[] = [];
    for (const [address, f] of this.fixes) {
      if (now - f.time > RETENTION_MS) continue;
      const device = ddb.get(address);
      if (device?.tracked === "N") continue;
      const identified = device?.identified === "Y";
      out.push({
        // Opaque ID: never exposes the device address of anonymous aircraft.
        id: createHash("sha1").update(`worldlens-ogn:${address}`).digest("hex").slice(0, 12),
        lat: Math.round(f.lat * 1e5) / 1e5,
        lng: Math.round(f.lng * 1e5) / 1e5,
        alt: f.alt,
        course: f.course,
        speed: f.speed,
        climb: f.climb,
        aircraftType: AIRCRAFT_TYPES[f.type],
        registration: identified ? device!.registration : "",
        cn: identified ? device!.cn : "",
        model: identified ? device!.aircraft_model : "",
        identified,
        registered: !!device,
        time: f.time,
      });
    }
    return out;
  }
}

const g = globalThis as typeof globalThis & { __worldlensOgn?: OgnFeed };
const feed = (g.__worldlensOgn ??= new OgnFeed());

export async function fetchGliders() {
  feed.touch();
  const ddb = await loadDdb();
  const items = feed.snapshot(ddb);
  if (!items.length && feed.error) throw new Error(feed.error);
  return { items, dataTime: Math.max(0, ...items.map((x) => x.time)) || Date.now() };
}
