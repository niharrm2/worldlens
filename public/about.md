# WorldLens recovered frontend

Recovered from the owner-supplied Chrome page save and a subsequent signed-in Chrome network capture. This is recovered frontend source and data, not a complete repository export. No missing implementation was invented and the live site was not modified.

## Start locally

With Python 3 installed, open a terminal in this folder and run:

    python server.py

Visit http://127.0.0.1:8080/ . This is a static preview; missing runtime dependencies remain as described below.

## Recovered from the live browser session

- Original initial HTML in index.html, replacing the earlier rendered DOM snapshot. Hosting widget and Cloudflare injected scripts were removed from this local copy.
- Readable application scripts at their original root paths, styles, Cesium and HLS browser libraries.
- catalog.json: 4,506 base camera entries.
- atlas/index.json and atlas/labels.json: 211,652 added camera index entries and associated labels.
- satellites/active.json: 16,766 orbital records. This is a captured historical snapshot; refer to its fetchedAt timestamp.
- satellite-worker.js and vendor/satellite.min.js, plus satellite-core.js.
- Cesium terrain and Earth-orientation data actually requested in the captured session, and its credit image.

capture-manifest.json records the 27 recovered responses with file hashes. capture-report.json records validation and remaining gaps. The raw HAR is not included because network archives can contain session metadata.

## Flight provider

adsb.lol supplies flight positions through the local rolling regional scan described below. The original hosted /api/flights response failed during recovery; server.py now implements the local replacement.

## Remaining gaps

- atlas/details/0.json through atlas/details/229.json: on-demand camera URLs and details. Index positions and labels were recovered, but these chunks were not requested by the normal capture.
- Original aircraft PNG markers were not recovered; the working markers now use the existing SVG artwork.
- vendor/countries.geojson for the fallback globe.
- Cesium Workers/Assets/ThirdParty and stylesheet resources not requested during the captured session. The existing capture does not constitute the complete Cesium distribution.
- A simultaneous worldwide snapshot; the new integration uses a rolling scan of public regional responses.
- Original repository history, tests, and any original project/build/deployment metadata.

Bulk capture was stopped at the owner's request after Chrome presented its console paste warning. The package contains the resources captured before that point.

## Earlier save preserved

original-snapshot.html and assets/ preserve the earlier Chrome rendered page save. JavaScript filenames there have the .download suffix removed; recovery-manifest.json records their checksums. Those files remain for comparison. index.html now uses the newly captured original directory structure rather than these snapshot copies.

## Verification and limitations

All captured JSON datasets were parsed successfully. Initial HTML script and stylesheet paths were checked for local files; JavaScript syntax checks are listed in capture-report.json. The earlier companion files were checked byte-for-byte against the supplied files. Full local browser behavior, live feeds, playback, and complete offline globe rendering remain unverified. Map tiles, media sources, and other external services still require internet access.

## adsb.lol rolling global scan (local modification)

server.py now serves the app and queries the documented public /v2/point/{lat}/{lon}/250 endpoint over a 5-degree spherical grid, with initial queries spread over major continents. It issues at most one request every two seconds initially, slowing to five seconds or more after HTTP 429, one request at a time, and backs off on errors, HTTP 429, and Retry-After. Requests stop within 45 seconds of the last local flight-page poll. It does not use restricted worldwide endpoints.

Each regional response has a 20-second cache lifetime. The merged /api/flights response is also cached for 20 seconds; repeated refreshes do not duplicate upstream scans. Aircraft are deduplicated by transponder ID, with the newest reported position winning. Actual position timestamps are preserved. A disk checkpoint is written at most once every 20 seconds to .worldlens-cache/flights.json for restart recovery. This is historical position retention, separate from the 20-second response cache. Positions older than one hour are discarded.

The UI shows scan progress and individual position ages. Its older-cache toggle can hide positions over five minutes old. A full globe pass involves over 1,600 regional queries and takes at least roughly 56 minutes; delays, failures, and rate limits can make it longer. It is a rolling, incomplete mosaic until regions are visited, not a simultaneous whole-world live snapshot or a full global refresh every 20 seconds. Empty or failed regions do not prove there are no aircraft there.

Aircraft marker images now use the existing recovered SVG artwork because the original PNG assets were not captured. The live site has not been changed. The original missing camera detail chunks and unrequested globe assets remain missing.

Provider docs: https://api.adsb.lol/docs and https://github.com/adsblol/api . Attribution to adsb.lol and ODbL remains in the UI.
