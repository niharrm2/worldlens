import { connection } from "next/server";

import { getShipsSnapshot } from "@/server/ships";

/** Worldwide vessel positions (AISStream + Fintraffic Digitraffic) as compact rows, cached for 15 s. */
export async function GET() {
  await connection();
  try {
    return Response.json(await getShipsSnapshot(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: (error as Error).message || "Vessel providers unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
