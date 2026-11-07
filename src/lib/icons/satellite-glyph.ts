const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><g fill="#132739" stroke="#ffe1a0" stroke-width="1.7"><rect x="13" y="12" width="10" height="12" rx="2"/><path d="M13 15H3v8h10m10-8h10v8H23M7 15v8m22-8v8M18 12V6m-4 1 4-3 4 3M18 24v5"/></g></svg>';

/** Satellite icon as a data URI (ASCII-only SVG; `btoa` exists in browsers and Node 16+). */
export const SATELLITE_GLYPH = "data:image/svg+xml;base64," + btoa(SVG);
