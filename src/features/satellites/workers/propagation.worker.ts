/// <reference lib="webworker" />
/** Off-main-thread SGP4 propagation for the whole orbital catalogue. */
import { json2satrec, type OMMJsonObject, type SatRec } from "satellite.js";

import { classifyOrbit, DAY_MS, epochDate, normalizeOmm, orbitPath, positionAt } from "../lib/orbit";
import type { OmmRecord, OrbitInfo, SatellitePoint, WorkerRequest, WorkerResponse } from "../types";

interface Entry extends OrbitInfo {
  r: OmmRecord;
  rec: SatRec;
}

let entries: Entry[] = [];
let selected: Entry | undefined;

const post = (message: WorkerResponse) => self.postMessage(message);

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const d = event.data;
  try {
    switch (d.type) {
      case "init": {
        entries = [];
        const seen = new Set<number>();
        for (const raw of d.records) {
          const r = normalizeOmm(raw);
          if (!r || seen.has(r.NORAD_CAT_ID)) continue;
          try {
            const rec = json2satrec(r as unknown as OMMJsonObject);
            if (rec.error) continue;
            seen.add(r.NORAD_CAT_ID);
            entries.push({ r, rec, ...classifyOrbit(r) });
          } catch {
            // Skip records SGP4 cannot initialise.
          }
        }
        post({ type: "ready", count: entries.length });
        break;
      }
      case "tick": {
        const ids = d.ids ? new Set(d.ids) : null;
        const time = new Date(d.time);
        const points: SatellitePoint[] = [];
        let failed = 0;
        let stale = 0;
        for (const x of entries) {
          if ((d.filter !== "all" && x.type !== d.filter) || (ids && !ids.has(x.r.NORAD_CAT_ID))) continue;
          const p = positionAt(x.rec, time);
          if (!p) {
            failed++;
            continue;
          }
          const old = Math.abs(+time - +epochDate(x.r.EPOCH)) > 7 * DAY_MS;
          if (old) stale++;
          points.push({ id: x.r.NORAD_CAT_ID, type: x.type, ...p, stale: old });
        }
        post({ type: "positions", time: +time, points, failed, stale });
        break;
      }
      case "select": {
        selected = entries.find((x) => x.r.NORAD_CAT_ID === Number(d.id));
        if (!selected) return;
        const time = new Date(d.time);
        post({
          type: "selected",
          id: selected.r.NORAD_CAT_ID,
          time: +time,
          point: positionAt(selected.rec, time),
          path: orbitPath(selected.rec, selected.period, time),
        });
        break;
      }
      case "detail": {
        if (!selected) return;
        const time = new Date(d.time);
        post({ type: "detail", id: selected.r.NORAD_CAT_ID, time: +time, point: positionAt(selected.rec, time) });
        break;
      }
    }
  } catch (error) {
    post({ type: "error", message: String((error as Error).message || error) });
  }
};
