import type { NextConfig } from "next";

/**
 * satellite.js 7 ships optional WebAssembly runtimes; the multi-thread one spawns a worker from its own
 * file, which hangs `next build` (Turbopack) and breaks webpack. WorldLens uses only the JS functions.
 */
const SATELLITE_WASM_STUB = "./src/lib/stubs/satellite-wasm.ts";
const satelliteWasmAliases = {
  "#wasm-single-thread": SATELLITE_WASM_STUB,
  "#wasm-multi-thread": SATELLITE_WASM_STUB,
};

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    resolveAlias: satelliteWasmAliases,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "#wasm-single-thread": `${process.cwd()}/src/lib/stubs/satellite-wasm.ts`,
      "#wasm-multi-thread": `${process.cwd()}/src/lib/stubs/satellite-wasm.ts`,
    };
    return config;
  },
};

export default nextConfig;
