import { connection } from "next/server";

import { getFlightScanner } from "@/server/flights";

/** Rolling adsb.lol regional scan, merged and cached for 20 seconds. */
export async function GET() {
  await connection();
  return Response.json(getFlightScanner().response(), {
    headers: { "Cache-Control": "no-store" },
  });
}
