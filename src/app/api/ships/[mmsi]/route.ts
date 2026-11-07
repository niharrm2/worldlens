import type { NextRequest } from "next/server";

import { getShipDetail } from "@/server/ships";

/** Full metadata (destination, size, call sign…) for one vessel by MMSI. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/ships/[mmsi]">) {
  const { mmsi } = await ctx.params;
  if (!/^\d{1,9}$/.test(mmsi)) return Response.json({ error: "Invalid MMSI" }, { status: 400 });
  const ship = await getShipDetail(mmsi);
  return ship
    ? Response.json(ship, { headers: { "Cache-Control": "no-store" } })
    : Response.json({ error: "Vessel not in the current snapshot" }, { status: 404 });
}
