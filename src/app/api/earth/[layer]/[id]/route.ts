import type { NextRequest } from "next/server";

import { balloonTrack } from "@/server/earth/movement";
import { CRW, oceanHeatImage, oceanHeatPoint } from "@/server/earth/planet-extra";
import type { OceanHeatVariable } from "@/types/earth";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Per-item detail for Earth layers:
 *  - /api/earth/balloons/{serial}                      weather-balloon flight trail
 *  - /api/earth/oceanheat/image?var=anomaly&date=…      Coral Reef Watch global PNG
 *  - /api/earth/oceanheat/point?lat=…&lng=…&date=…      Coral Reef Watch values at a point
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/earth/[layer]/[id]">) {
  const { layer, id } = await ctx.params;
  const params = request.nextUrl.searchParams;
  try {
    if (layer === "balloons" && /^[\w.-]{1,40}$/.test(id)) {
      return Response.json(await balloonTrack(id), { headers: { "Cache-Control": "no-store" } });
    }
    if (layer === "oceanheat" && id === "image") {
      const v = params.get("var") as OceanHeatVariable;
      const date = params.get("date") ?? "";
      if (!(v in CRW) || !DATE.test(date)) return Response.json({ error: "Bad request" }, { status: 400 });
      const png = await oceanHeatImage(v, date);
      return new Response(png, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=21600" } });
    }
    if (layer === "oceanheat" && id === "point") {
      const lat = Number(params.get("lat"));
      const lng = Number(params.get("lng"));
      const date = params.get("date") ?? "";
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || !DATE.test(date)) {
        return Response.json({ error: "Bad request" }, { status: 400 });
      }
      return Response.json(await oceanHeatPoint(lat, lng, date), { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    return Response.json({ error: (error as Error).message || "Provider unavailable" }, { status: 502 });
  }
}
