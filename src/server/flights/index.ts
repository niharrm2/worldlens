import "server-only";

import { FlightScanner } from "./scanner";

const globalForScanner = globalThis as typeof globalThis & { __worldlensScanner?: FlightScanner };

/** Process-wide scanner singleton; survives dev hot reloads. */
export function getFlightScanner(): FlightScanner {
  if (!globalForScanner.__worldlensScanner) {
    globalForScanner.__worldlensScanner = new FlightScanner();
    globalForScanner.__worldlensScanner.start();
  }
  return globalForScanner.__worldlensScanner;
}

export { FlightScanner } from "./scanner";
