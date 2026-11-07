"use client";

import { useState } from "react";

import { DialogHead, ModalDialog } from "@/features/shell/components/ModalDialog";

import { ARGUS_URL } from "../../lib/atlas";
import { SOURCE_CARDS } from "../../lib/providers";
import { useCameraStore } from "../../store";

export function SourcesDialog() {
  const store = useCameraStore();
  const [youtubeKey, setYoutubeKey] = useState("");

  const counts = (source: string) => store.cameras.filter((c) => c.source === source).length;

  const discover = async () => {
    const key = youtubeKey.trim();
    await store.discoverYoutube(key);
    setYoutubeKey("");
  };

  return (
    <ModalDialog dialog="sources" id="sourcesDialog" className="large" onClose={() => setYoutubeKey("")}>
      <DialogHead eyebrow="CONNECTED TO THE SOURCE" title="An expanding public camera atlas." />
      <p className="intro">
        Actual provider catalogs, not generated camera locations. Counts describe indexed records, not confirmed
        playable streams.
      </p>
      <div id="atlasAudit" className="auditbox">
        {store.atlasAudit}
      </div>
      <div id="sourceCards" className="sourcecards">
        {store.atlas && (
          <div className="sourcecard">
            <span className="sourcestate">Historical metadata</span>
            <h3>Argus / original providers</h3>
            <strong>{store.atlas.audit.addedRecords.toLocaleString()}</strong>
            <p>
              Source snapshot {store.atlas.generated.slice(0, 10)}. Lazy camera details; approximate coordinates.
              Includes source-only entries.
            </p>
            <a href={ARGUS_URL} target="_blank" rel="noopener noreferrer">
              Upstream project ↗
            </a>{" "}
            ·{" "}
            <a href="/data/atlas/NOTICE.txt" target="_blank">
              Licence &amp; attribution ↗
            </a>
          </div>
        )}
        {SOURCE_CARDS.map((card) => (
          <div className="sourcecard" key={card.id}>
            <span className="sourcestate">{store.sourceStates[card.id] || "Bundled catalog"}</span>
            <h3>{card.name}</h3>
            <strong>{counts(card.id).toLocaleString()}</strong>
            <p>{card.description}</p>
            <a href={card.url} target="_blank" rel="noopener noreferrer">
              Provider &amp; data terms ↗
            </a>
          </div>
        ))}
      </div>
      <div className="sourceactions">
        <button
          className="button primary"
          id="refreshSources"
          disabled={store.refreshing}
          onClick={() => void store.refreshCatalog()}
        >
          ↻ Refresh public catalogs
        </button>
        <label className="button quiet filelabel">
          ↑ Import camera catalog
          <input
            type="file"
            id="catalogUpload"
            accept=".json,.geojson,application/json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void store.importCatalog(file);
            }}
          />
        </label>
        <button className="button quiet" id="exportCatalog" onClick={store.exportCatalog}>
          ↓ Export loaded feeds
        </button>
      </div>
      <p className="hint">
        Imports and newly added feeds last for this page session. Export them to retain your work. Saved-feed
        bookmarks are device-local preferences.
      </p>
      <div className="discovery">
        <h3>Discover geotagged YouTube livestreams</h3>
        <p>
          Search within 500 km of the globe centre using your YouTube Data API key. Only videos with actual location
          metadata and an active, embeddable broadcast are added. Many livestreams have no public geotag.
        </p>
        <div className="discoveryrow">
          <input
            type="password"
            id="youtubeKey"
            autoComplete="off"
            placeholder="YouTube Data API key · held only in memory"
            aria-label="YouTube Data API key"
            value={youtubeKey}
            onChange={(e) => setYoutubeKey(e.target.value)}
          />
          <button id="discoverYoutube" className="button primary" disabled={store.discovering} onClick={discover}>
            Search this area ↗
          </button>
        </div>
        <p id="discoveryStatus" className="hint" role="status">
          {store.discoveryStatus}
        </p>
      </div>
      <p className="hint">
        Powered by TfL Open Data. TfL clips and traffic snapshots update periodically; they are not continuous live
        video. Publicly viewable media retains its original owner&apos;s rights. No private-camera scanning, account
        bypass, video extraction, or rehosting.
      </p>
      <a href="/worldlens-source.zip" download className="button quiet">
        ↓ MIT-licensed application source
      </a>
    </ModalDialog>
  );
}
