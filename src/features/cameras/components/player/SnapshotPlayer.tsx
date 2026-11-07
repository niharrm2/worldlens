"use client";

import { useEffect, useRef } from "react";

import type { Camera } from "../../types";
import type { StatusSetter } from "./types";

/** Provider still image, re-requested on the camera's refresh interval while the tab is visible. */
export function SnapshotPlayer({ camera, onStatus }: { camera: Camera; onStatus: StatusSetter }) {
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const update = () => {
      const image = imageRef.current;
      if (!image || document.hidden) return;
      const url = new URL(camera.image || camera.url);
      if (camera.source !== "singapore") url.searchParams.set("_wl", String(Math.floor(Date.now() / 60_000)));
      image.src = url.href;
    };
    update();
    const timer = setInterval(update, camera.refreshInterval || 60_000);
    return () => clearInterval(timer);
  }, [camera]);

  return (
    <img
      ref={imageRef}
      alt={`${camera.name} — provider snapshot`}
      onLoad={() =>
        onStatus(`Snapshot received ${new Date().toLocaleTimeString("en-GB")}. Capture time may differ.`, true)
      }
      onError={() => onStatus("Image unavailable from provider. Try the original source.")}
    />
  );
}
