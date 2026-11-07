import type { NextRequest } from "next/server";

import { cached } from "@/server/earth/cache";
import { EARTH_SOURCES } from "@/server/earth/sources";

/**
 * Environmental datasets (USGS, NASA FIRMS/EONET/GIBS, NOAA SWPC/NDBC, Open-Meteo),
 * normalised and cached server-side so every viewer shares one upstream request.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/earth/[layer]">) {
  const { layer } = await ctx.params;
  if (!Object.hasOwn(EARTH_SOURCES, layer)) {
    return Response.json({ error: "Unknown layer" }, { status: 404 });
  }
  const source = EARTH_SOURCES[layer as keyof typeof EARTH_SOURCES];
  try {
    const payload = await cached<unknown>(layer, source.ttl, source.fetch as () => Promise<{ items: unknown; dataTime: number }>);
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: (error as Error).message || "Provider unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
