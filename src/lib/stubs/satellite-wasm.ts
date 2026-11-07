/**
 * Replaces satellite.js's optional WebAssembly runtimes (`#wasm-single-thread`, `#wasm-multi-thread`).
 *
 * WorldLens only uses the pure-JS SGP4 functions. The multi-thread build spawns a worker from its own
 * module URL, which deadlocks Turbopack's production build and fails under webpack, so both runtimes
 * are aliased here in next.config.ts.
 */
export default function createWasmModule(): never {
  throw new Error("satellite.js WebAssembly runtimes are not bundled in WorldLens");
}
