"use client";

import { DialogHead, ModalDialog } from "@/features/shell/components/ModalDialog";

import { youtubeId } from "../../lib/camera-core";
import { feedKind } from "../../lib/format";
import { useCameraStore } from "../../store";

export function WatchWallDialog() {
  const cameras = useCameraStore((s) => s.wallCameras);
  const closeWall = useCameraStore((s) => s.closeWall);

  return (
    <ModalDialog dialog="wall" id="wallDialog" className="wall" onClose={closeWall}>
      <DialogHead eyebrow="FOUR WINDOWS. ONE WORLD." title="Watch wall" />
      <p className="hint">
        Up to four selected or saved feeds. Click each player to start; traffic previews are snapshots. Videos stop
        when you close this wall.
      </p>
      <div id="wallGrid">
        {cameras.map((c) => {
          const videoId = c.type === "youtube" ? youtubeId(c.url) : null;
          return (
            <article className="wallitem" key={c.id}>
              <div className="wallplayer">
                {videoId ? (
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1&rel=0`}
                    title={c.name}
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                ) : c.image ? (
                  <img src={c.image} alt={`${c.name} snapshot`} />
                ) : (
                  <div className="playerempty">Open this feed in the main player</div>
                )}
              </div>
              <h3>{c.name}</h3>
              <p>
                {c.country} · {feedKind(c)} ·{" "}
                <a href={c.sourceUrl || c.url} target="_blank" rel="noopener noreferrer">
                  Original ↗
                </a>
              </p>
            </article>
          );
        })}
      </div>
    </ModalDialog>
  );
}
