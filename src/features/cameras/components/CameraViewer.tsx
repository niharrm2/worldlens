"use client";

import { useRef, useState } from "react";

import { notify } from "@/features/shell/store";
import { ShellClose } from "@/features/shell/components/ShellClose";
import { formatShortUtc } from "@/lib/format";

import { badgeClass, cameraCoordinates, cameraLocation, feedKind, localClock, posterStatus } from "../lib/format";
import { selectCurrentCamera, useCameraStore, type SelectionStatus } from "../store";
import type { Camera } from "../types";
import { SnapshotPlayer } from "./player/SnapshotPlayer";
import { VideoPlayer } from "./player/VideoPlayer";
import { YouTubePlayer } from "./player/YouTubePlayer";
import { RelatedCameras } from "./RelatedCameras";

/** Right-hand detail panel for the selected camera. */
export function CameraViewer() {
  const camera = useCameraStore(selectCurrentCamera);
  const status = useCameraStore((s) => s.selectionStatus);
  const resetToken = useCameraStore((s) => s.mediaResetToken);

  return (
    <aside className="viewer">
      <ShellClose target="detail" label="Close details" />
      {camera ? (
        // Remounting per camera / reset resets the player to its poster.
        <ViewerBody key={`${camera.id}:${status}:${resetToken}`} camera={camera} status={status} />
      ) : (
        <ViewerPlaceholder />
      )}
    </aside>
  );
}

type PlayerMode = "poster" | "playing" | "snapshot";

function ViewerBody({ camera, status }: { camera: Camera; status: SelectionStatus }) {
  const saved = useCameraStore((s) => s.saved.has(camera.id));
  const toggleSaved = useCameraStore((s) => s.toggleSaved);
  const playerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<PlayerMode>("poster");
  const [nonce, setNonce] = useState(0);
  const [playback, setPlayback] = useState<{ text: string; good: boolean } | null>(null);

  const ready = status === "ready" && camera.mediaReady !== false && !camera.catalogOnly;
  const checked = formatShortUtc(camera.checkedAt);
  const setStatus = (text: string, good = false) => setPlayback({ text, good });

  const play = () => {
    if (!ready) {
      notify("This entry is source-only. Open the original provider link.");
      return;
    }
    setPlayback(null);
    setNonce((n) => n + 1);
    setMode(camera.type === "snapshot" ? "snapshot" : "playing");
  };

  const onVideoFailure = () => {
    if (camera.image) {
      setMode("snapshot");
      setStatus("Video unavailable. Showing the provider snapshot instead.");
      notify("Video unavailable; switched to snapshot.");
    } else {
      setStatus("Video unavailable. Try the original provider link.");
    }
  };

  let statusLine: { text: string; good: boolean };
  if (status === "loading") statusLine = { text: "Fetching the local source-detail shard…", good: false };
  else if (status === "error") statusLine = { text: "Detail download failed; no media has been substituted.", good: false };
  else if (!ready) statusLine = { text: "Historical catalog entry · playback not verified.", good: false };
  else if (playback) statusLine = playback;
  else if (mode === "playing" && camera.type === "youtube") {
    statusLine = { text: "YouTube player opened. Its LIVE indicator confirms current broadcast status.", good: false };
  } else if (mode === "poster") statusLine = { text: posterStatus(camera, checked), good: false };
  else statusLine = { text: "", good: false };

  const playLabel = !ready
    ? status === "ready"
      ? "Source link only"
      : "▶ Watch feed"
    : mode === "snapshot"
      ? "◉ Snapshot · refreshes every 60s"
      : mode === "playing"
        ? "▶ Reload feed"
        : camera.type === "snapshot"
          ? "◉ Open snapshot"
          : "▶ Watch feed";

  return (
    <>
      <div className="viewerhead">
        <span className="eyebrow">YOUR WINDOW TO THE WORLD</span>
        <button
          id="bookmark"
          title="Save this feed"
          aria-label={saved ? "Unsave this feed" : "Save this feed"}
          onClick={toggleSaved}
        >
          {saved ? "★" : "☆"}
        </button>
      </div>
      <div className="locationline">
        <span id="selectedFlag">◈</span>
        <span id="selectedLocation">{cameraLocation(camera)}</span>
        <span id="localTime">{localClock(camera)}</span>
      </div>
      <h2 id="selectedTitle">{camera.name}</h2>
      <div className="sourcebadge">
        <span id="selectedType" className={`feedbadge ${badgeClass(camera)}`}>
          {feedKind(camera).toUpperCase()}
        </span>
        <span id="selectedCategory">{camera.category}</span>
      </div>
      <div className="player" id="player" ref={playerRef}>
        {status === "loading" ? (
          <div className="playerempty">Loading this camera’s source details…</div>
        ) : status === "error" ? (
          <div className="playerempty">Camera details could not load. Select again to retry.</div>
        ) : !ready ? (
          <div className="playerempty">
            This entry has no supported direct HTTPS media link.
            <br />
            Use the original source link below.
          </div>
        ) : mode === "poster" ? (
          <button className="poster" aria-label={`Play ${camera.name}`} onClick={play}>
            {camera.image ? (
              <img
                src={camera.image}
                alt={`Provider preview for ${camera.name}`}
                onError={(e) => e.currentTarget.remove()}
              />
            ) : (
              "Open camera"
            )}
          </button>
        ) : mode === "snapshot" ? (
          <SnapshotPlayer key={nonce} camera={camera} onStatus={setStatus} />
        ) : camera.type === "youtube" ? (
          <YouTubePlayer key={nonce} camera={camera} onStatus={setStatus} />
        ) : (
          <VideoPlayer key={nonce} camera={camera} onStatus={setStatus} onFailure={onVideoFailure} />
        )}
      </div>
      <div className="playeractions">
        <button className="button primary" id="playFeed" disabled={!ready} onClick={play}>
          {playLabel}
        </button>
        <button className="button quiet" id="refreshFeed" aria-label="Reload selected feed" onClick={play}>
          ↻
        </button>
        <button
          className="button quiet"
          id="fullscreen"
          aria-label="Fullscreen player"
          onClick={() =>
            playerRef.current?.requestFullscreen?.().catch(() => notify("Fullscreen is unavailable in this browser."))
          }
        >
          ⤢
        </button>
      </div>
      <div className="playbackstatus">
        <i id="playbackDot" style={{ background: statusLine.good ? "#a6d6ae" : "#b99b71" }} />
        <span id="playbackStatus">{statusLine.text}</span>
      </div>
      <div className="viewerdetails">
        <div>
          <span>PROVIDER</span>
          <strong id="provider">{camera.provider}</strong>
        </div>
        <div>
          <span>LOCATION</span>
          <strong id="coordinates">{cameraCoordinates(camera)}</strong>
        </div>
        <div>
          <span>FORMAT</span>
          <strong id="format">{feedKind(camera)}</strong>
        </div>
        <div>
          <span>CATALOG CHECKED</span>
          <strong id="checkedAt">{checked}</strong>
        </div>
      </div>
      <p id="feedNote" className="feednote">
        {(camera.note || "Public source. Playback availability is checked when opened.") + " " + (camera.locationPrecision || "")}
      </p>
      <a id="sourceLink" className="sourcelink" href={camera.sourceUrl || camera.url} target="_blank" rel="noopener noreferrer">
        {camera.type === "youtube" ? "Watch on YouTube ↗" : "Open original source ↗"}
      </a>
      <div className="viewerdivider" />
      <RelatedCameras currentId={camera.id} />
      <ViewerFooter />
    </>
  );
}

function ViewerPlaceholder() {
  return (
    <>
      <div className="viewerhead">
        <span className="eyebrow">YOUR WINDOW TO THE WORLD</span>
        <button id="bookmark" title="Save this feed" aria-label="Save this feed">
          ☆
        </button>
      </div>
      <div className="locationline">
        <span id="selectedFlag">◈</span>
        <span id="selectedLocation">Venice, Italy</span>
        <span id="localTime">—</span>
      </div>
      <h2 id="selectedTitle">Teatro La Fenice area</h2>
      <div className="sourcebadge">
        <span id="selectedType" className="feedbadge youtube">
          YOUTUBE
        </span>
        <span id="selectedCategory">City view</span>
      </div>
      <div className="player" id="player">
        <div className="playerempty">Choose a camera on the map</div>
      </div>
      <div className="playbackstatus">
        <i id="playbackDot" />
        <span id="playbackStatus">Choose a feed to begin</span>
      </div>
      <ViewerFooter />
    </>
  );
}

function ViewerFooter() {
  return (
    <div className="viewerfooter">
      A small window. A much bigger world.
      <br />
      <a href="/about.md" target="_blank">
        About this open-source project ↗
      </a>
    </div>
  );
}
