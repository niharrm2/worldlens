/**
 * Map marker glyphs: one recognisable symbol per layer (train, bus, glider, rocket…), drawn in
 * white on a coloured badge so status colours (delay, intensity, depth) still read at a glance.
 */

interface Glyph {
  /** SVG markup on a 24×24 grid. */
  body: string;
  /** Filled glyphs (flame, rocket) instead of outlined ones. */
  filled?: boolean;
}

export const GLYPHS = {
  train: {
    body: '<rect x="6" y="3" width="12" height="13" rx="3"/><path d="M6 10h12M9 20l1.5-4M15 20l-1.5-4"/><circle cx="9" cy="13" r=".6"/><circle cx="15" cy="13" r=".6"/>',
  },
  bus: {
    body: '<rect x="5" y="3" width="14" height="14" rx="2.5"/><path d="M5 10h14M8 20v-3M16 20v-3"/><circle cx="8.5" cy="13.5" r=".6"/><circle cx="15.5" cy="13.5" r=".6"/>',
  },
  glider: { body: '<path d="M2 10.5h20M12 6.5v12M8.5 18.5h7M11 6.5h2"/>' },
  bike: {
    body: '<circle cx="6" cy="15.5" r="3.5"/><circle cx="18" cy="15.5" r="3.5"/><path d="M6 15.5 9.5 9h6l2.5 6.5M9.5 9l2.5 6.5M14 6h3"/>',
  },
  scooter: { body: '<circle cx="6" cy="17.5" r="2.5"/><circle cx="18" cy="17.5" r="2.5"/><path d="M8.5 17.5h7M15.5 17.5 13.5 5h3"/>' },
  balloon: { body: '<circle cx="12" cy="9" r="6"/><path d="M12 15v4M9.5 21h5"/>' },
  rocket: {
    body: '<path d="M12 2c3 2 4.5 6 4.5 10L14 15h-4l-2.5-3C7.5 8 9 4 12 2Z"/><path d="M10 15l-2.5 4.5L10 18M14 15l2.5 4.5L14 18M12 16v5" fill="none"/>',
    filled: true,
  },
  quake: { body: '<path d="M2 12h3.5l2-6 3 12 3-9 2 5 1.5-2H22"/>' },
  fire: {
    body: '<path d="M12 21.5c-4 0-6.5-2.7-6.5-6.2 0-4.3 4.2-6.3 4.2-10.8 2.6 1.6 3.3 4.1 3.3 5.8 1-1 1.6-2.1 1.6-3.3 2.7 2.1 3.9 4.9 3.9 8.3 0 3.5-2.5 6.2-6.5 6.2Z"/>',
    filled: true,
  },
  buoy: { body: '<path d="M12 2.5v4M8 6.5h8l-1.5 8.5h-5Z"/><path d="M3 19.5c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0"/>' },
  storm: {
    body: '<circle cx="12" cy="12" r="2.6"/><path d="M12 3.5c-5 0-8.2 3.6-7.5 8M12 20.5c5 0 8.2-3.6 7.5-8"/>',
  },
  volcano: { body: '<path d="M3 20 9 11h6l6 9Z"/><path d="M10 11l2-3 2 3M10 5l1 2M14 5l-1 2" fill="none"/>' },
  ice: { body: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"/>' },
  water: { body: '<path d="M3 15c2-1.7 4-1.7 6 0s4 1.7 6 0 4-1.7 6 0M3 19c2-1.7 4-1.7 6 0s4 1.7 6 0 4-1.7 6 0M12 3l3 5a3 3 0 1 1-6 0Z"/>' },
  wind: { body: '<path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>' },
  heat: { body: '<path d="M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0Z"/><path d="M12 10v6"/>' },
  landslide: { body: '<path d="M3 20 10 8l4 6 2-3 5 9Z"/>' },
  snow: { body: '<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/>' },
  alert: { body: '<path d="M12 4 21 20H3Z"/><path d="M12 10v4M12 17v.5"/>' },
  news: { body: '<rect x="3" y="4" width="15" height="16" rx="2"/><path d="M18 8h3v10a2 2 0 0 1-2 2H5M7 8h7M7 12h7M7 16h4"/>' },
  outage: { body: '<path d="M3 3l18 18M5 9.5a11 11 0 0 1 4-2.2M12 7a11 11 0 0 1 7 2.5M8 13a6 6 0 0 1 3-1.5M15.5 13.2A6 6 0 0 1 16 13.5M12 18h.01"/>' },
  sun: { body: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>' },
  solar: { body: '<circle cx="9" cy="12" r="5"/><path d="M14 9c3-2 6-1.5 8 0M14.5 12h7.5M14 15c3 2 6 1.5 8 0"/>' },
  cloud: { body: '<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 11a3.5 3.5 0 0 0 1 7Z"/>' },
  rain: { body: '<path d="M7 14h10a3.5 3.5 0 0 0 .4-7A5.5 5.5 0 0 0 6.5 8 3 3 0 0 0 7 14ZM8 17l-1 3M12 17l-1 3M16 17l-1 3"/>' },
  aurora: { body: '<path d="M3 18c3-7 6-11 9-11s6 4 9 11M7 18c1.7-3.7 3.3-5.5 5-5.5s3.3 1.8 5 5.5"/>' },
  wave: { body: '<path d="M2 14c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5-1M2 19c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5-1M9 8.5a4 4 0 0 1 7-2.5"/>' },
  particles: {
    body: '<circle cx="7" cy="7" r="1.6"/><circle cx="16.5" cy="6" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="6" cy="16.5" r="1.6"/><circle cx="17.5" cy="15" r="1.6"/><circle cx="11.5" cy="19.5" r="1.6"/>',
    filled: true,
  },
} satisfies Record<string, Glyph>;

export type GlyphId = keyof typeof GLYPHS;
export type BadgeShape = "circle" | "square";

const cache = new Map<string, string>();

/** Full SVG (badge + glyph). */
export function glyphSvg(glyph: GlyphId, color: string, opts: { shape?: BadgeShape; selected?: boolean } = {}): string {
  const g: Glyph = GLYPHS[glyph];
  const stroke = opts.selected ? "#ffffff" : "#071521";
  const badge =
    opts.shape === "square"
      ? `<rect x="2.5" y="2.5" width="27" height="27" rx="7" fill="${color}" stroke="${stroke}" stroke-width="${opts.selected ? 2.5 : 1.5}"/>`
      : `<circle cx="16" cy="16" r="13.5" fill="${color}" stroke="${stroke}" stroke-width="${opts.selected ? 2.5 : 1.5}"/>`;
  const ring = opts.selected ? '<circle cx="16" cy="16" r="15.4" fill="none" stroke="#ffd36b" stroke-width="1.2"/>' : "";
  const paint = g.filled
    ? 'fill="#fff" stroke="#fff" stroke-width="1"'
    : 'fill="none" stroke="#fff" stroke-width="2.1"';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${ring}${badge}<g transform="translate(5.6 5.6) scale(.867)" ${paint} stroke-linecap="round" stroke-linejoin="round">${g.body}</g></svg>`;
}

/** Glyph alone in `color` (no badge), for UI legends and lists. */
export function glyphInlineSvg(glyph: GlyphId, color: string): string {
  const g: Glyph = GLYPHS[glyph];
  const paint = g.filled ? `fill="${color}" stroke="${color}" stroke-width="1"` : `fill="none" stroke="${color}" stroke-width="2"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><g ${paint} stroke-linecap="round" stroke-linejoin="round">${g.body}</g></svg>`;
}

/** Cached data URI for a marker badge. */
export function glyphMarker(glyph: GlyphId, color: string, shape: BadgeShape = "circle", selected = false): string {
  const key = `${glyph}|${color}|${shape}|${selected}`;
  let uri = cache.get(key);
  if (!uri) {
    uri = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(glyphSvg(glyph, color, { shape, selected }));
    cache.set(key, uri);
  }
  return uri;
}

/** NASA EONET category → glyph. */
export const EVENT_GLYPHS: Record<string, GlyphId> = {
  wildfires: "fire",
  severeStorms: "storm",
  volcanoes: "volcano",
  seaLakeIce: "ice",
  floods: "water",
  earthquakes: "quake",
  drought: "heat",
  dustHaze: "wind",
  landslides: "landslide",
  snow: "snow",
  tempExtremes: "heat",
  waterColor: "water",
  manmade: "alert",
};
