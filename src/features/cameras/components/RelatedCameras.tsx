"use client";

import { useState } from "react";

import { useCameraStore } from "../store";
import type { Camera } from "../types";
import { CameraThumbnail } from "./CameraThumbnail";

function pickTwo(cameras: Camera[], currentId: string) {
  const pool = cameras.filter((c) => c.type === "youtube" && c.id !== currentId);
  const picks: Camera[] = [];
  while (picks.length < 2 && pool.length) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return picks;
}

/** Two random YouTube broadcasts to explore next. */
export function RelatedCameras({ currentId }: { currentId: string }) {
  const select = useCameraStore((s) => s.select);
  const [picks, setPicks] = useState(() => pickTwo(useCameraStore.getState().cameras, currentId));

  return (
    <>
      <div className="sectionlabel">
        EXPLORE ANOTHER PERSPECTIVE{" "}
        <button id="shuffle" onClick={() => setPicks(pickTwo(useCameraStore.getState().cameras, currentId))}>
          Shuffle ↗
        </button>
      </div>
      <div id="related" className="related">
        {picks.map((c) => (
          <button key={c.id} data-related={c.id} onClick={() => void select(c.id)}>
            <CameraThumbnail camera={c} />
            <span>
              <strong>{c.name}</strong>
              <small>{c.country} · YouTube</small>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
