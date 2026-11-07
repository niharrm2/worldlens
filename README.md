# WorldLens

A live 3D globe of the world as it happens — public cameras, aircraft, ships, satellites, earthquakes,
wildfires, weather, solar storms, ocean heat, sea ice, trains, buses, gliders and more — in one Next.js app.

Every layer comes from a public data source and is labelled with its provider, licence and freshness. Nothing is
simulated: where a feed is unavailable, the app says so.

---

## Features

The bottom dock switches between seven views. Each view has a **☰ panel button** (top-left) that opens its list or
layer switches; clicking anything on the globe opens its detail card.

| View | What you see | Source |
|---|---|---|
| **Cameras** | ~216,000 public camera and YouTube feeds, clustered by zoom; HLS, MP4, snapshots and YouTube playback | Bundled catalogue, Argus index, TfL, Caltrans, LTA Singapore |
| **Satellites** | ~16,000 satellites propagated in a Web Worker (SGP4), orbit paths, live position details | CelesTrak OMM snapshot |
| **Flights** | Worldwide aircraft from a paced rolling regional scan, 3D airframes when zoomed in | adsb.lol |
| **Ships** | Worldwide AIS vessels merged with the Finnish coastal network; details per vessel | AISStream.io, Fintraffic Digitraffic |
| **Earth** | 16 switchable planet layers (below) | See table |
| **Movement** | 6 switchable movement layers (below) | See table |
| **Globe / Full screen** | Bare globe with all layers hidden; full screen (falls back to in-app full screen) | — |

### Earth layers

| Layer | Source |
|---|---|
| Earthquakes (24 h, sized by magnitude, coloured by depth) | USGS |
| Wildfires & heat hotspots | NASA FIRMS (VIIRS NOAA-20, public 24 h file) |
| Weather & wind (animated wind, temperature/pressure shading) | Open-Meteo |
| Air quality (AQI, PM2.5, dust, ozone) | Open-Meteo / CAMS |
| Satellite cloud imagery (7-day slider) | NASA GIBS (VIIRS NOAA-20) |
| Rainfall (animated, half-hourly) | NASA GPM IMERG via GIBS |
| Aurora | NOAA SWPC OVATION |
| Natural disaster events (with timelines) | NASA EONET |
| Ocean waves & currents | Open-Meteo Marine |
| Ocean buoy observations | NOAA NDBC |
| Live news map | GDELT |
| Internet outages | IODA (Georgia Tech) |
| Day & night (sunlight, terminator, click anywhere for sunrise/sunset) | Calculated in the browser |
| Solar storms (solar wind, Kp, NOAA scales, aurora oval) | NOAA SWPC |
| Ocean heat (SST anomaly, bleaching heat stress, SST; click for values) | NOAA Coral Reef Watch |
| Polar sea ice (date slider, extent vs 1981–2010 median) | NSIDC Sea Ice Index, GHRSST MUR via GIBS |

### Movement layers

| Layer | Source |
|---|---|
| Weather balloons (with flight trails) | SondeHub |
| Trains (Finland, coloured by delay) | Fintraffic Digitraffic rail |
| Buses & trams | Open GTFS-Realtime feeds: HSL Helsinki, MBTA Boston, Translink SEQ |
| Gliders & light aircraft (privacy-filtered) | Open Glider Network |
| Shared bikes & scooters (parked only) | 10 open GBFS systems |
| Rocket launches (countdowns, webcasts) | The Space Devs — Launch Library 2 |

---

## Getting started

Requirements: **Node.js 20.9+** (Node 22+ recommended — the AISStream client uses the built-in `WebSocket`).

```bash
npm install
cp .env.example .env.local   # then add your keys (optional, see below)
npm run dev                  # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

### Environment variables

All are **server-only** and optional. Put them in `.env.local` (never committed).

| Variable | Purpose |
|---|---|
| `AISSTREAM_API_KEY` | Free key from [aisstream.io](https://aisstream.io) for worldwide ships. Without it, ships come from the Finnish network only. |
| `TRANSIT_FEEDS` | JSON array of extra GTFS-Realtime vehicle-position feeds: `[{"id":"…","name":"…","url":"…","license":"…"}]` |
| `WORLDLENS_CACHE_FILE` | Path for the flight-scanner checkpoint (default `.cache/flights.json`). |

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Type-check |

---

## Project structure

```
worldlens-next/
├── docs/                          Notes and manifests from the original recovered site
├── public/
│   ├── data/                      Static datasets: camera catalogue, Argus atlas, satellite snapshot
│   └── vendor/cesium/             Prebuilt Cesium bundle and its static assets
└── src/
    ├── app/                       Next.js App Router
    │   ├── page.tsx, layout.tsx
    │   └── api/
    │       ├── flights/           Merged aircraft from the rolling adsb.lol scan
    │       ├── ships/[mmsi]/      Compact worldwide vessel snapshot + per-vessel details
    │       └── earth/[layer]/[id] Every Earth/Movement dataset, plus balloon trails and ocean-heat images/points
    ├── features/                  One folder per product area
    │   ├── app/                   Composition root, map stage, mode controller, globe-layer wiring
    │   ├── shell/                 Dock, panel button, loader, toast, dialogs, UI store
    │   ├── globe/                 GlobeEngine interface: Cesium (WebGL) + 2D canvas fallback, overlays
    │   └── cameras/ satellites/ flights/ ships/ earth/
    ├── lib/                       Shared helpers: http, formatting, icons, AIS, solar maths
    ├── server/                    Server-only data fetchers and caches (flights, ships, earth)
    ├── styles/                    Global CSS (legacy base + theme)
    └── types/                     Shared API types
```

## How it works

- **UI** — React client components with one Zustand store per feature. `features/app` composes them and pushes
  each feature's data to the globe declaratively (`useGlobeLayers`).
- **Globe** — `GlobeEngine` has two implementations: Cesium for WebGL and a canvas renderer for devices without it.
  Features describe what to draw as overlay specs (points, icon badges, cells, arrows, imagery, frames, particles,
  lighting); the engines decide how. Surface markers are hidden when behind the planet (horizon culling).
- **Server** — every upstream provider is fetched server-side, normalised and cached, so all viewers share one
  upstream request and API keys never reach the browser. Cache lifetimes match each provider's update rate and
  rate limits (e.g. Open-Meteo grids are coarse and refreshed every 3–4 h to stay within the free tier).
- **Long-running feeds** — the adsb.lol scanner, AISStream and OGN connections run in the server process and pause
  when nobody is watching.

## Deployment

The flight scanner and the AISStream / Open Glider Network streams are long-running background connections, so
deploy to a **persistent Node.js server** (`npm start`, Docker, a VM). Serverless platforms will not keep them alive
between requests. Set the environment variables on the server.

## Data sources, licences and attribution

Each layer shows its provider and a link in the app. Highlights:

- **Open Glider Network** (ODbL): devices marked *no tracking* in the OGN Devices Database, or flagged no-track /
  stealth in their messages, are never shown; *no identification* and unregistered devices are anonymised; positions
  are kept in memory for 30 minutes only.
- **Fintraffic Digitraffic** — CC BY 4.0. **OpenStreetMap** tiles — © OpenStreetMap contributors.
- **NASA** (GIBS, FIRMS, EONET), **NOAA** (SWPC, NDBC, Coral Reef Watch), **USGS**, **NSIDC** — public data; credit shown.
- **Open-Meteo** — free for non-commercial use; check their terms for commercial deployments.
- **GDELT, IODA, SondeHub, Launch Library 2, AISStream, GBFS and GTFS-Realtime operators** — see each provider's terms.

Camera media remains the property of its owners; WorldLens only links or embeds publicly offered streams.

## Known limitations

- Some providers are blocked or rate-limited on certain networks (e.g. corporate firewalls); those layers show
  *Unavailable* with the reason.
- Camera detail shards for the Argus index (`public/data/atlas/details/`) and `vendor/countries.geojson` for the
  canvas fallback were never recovered; affected features degrade gracefully.
- Worldwide ships and gliders build up over the first minutes after the server starts.
