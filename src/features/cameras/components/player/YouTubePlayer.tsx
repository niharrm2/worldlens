"use client";

import { useEffect, useRef } from "react";

import { youtubeId } from "../../lib/camera-core";
import type { Camera } from "../../types";
import type { StatusSetter } from "./types";

const YOUTUBE_ORIGINS = ["https://www.youtube.com", "https://www.youtube-nocookie.com"];

/** Privacy-enhanced YouTube embed; player state arrives via the iframe API's postMessage events. */
export function YouTubePlayer({ camera, onStatus }: { camera: Camera; onStatus: StatusSetter }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const statusRef = useRef(onStatus);
  useEffect(() => {
    statusRef.current = onStatus;
  });

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!YOUTUBE_ORIGINS.includes(event.origin)) return;
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
      let data: { event?: string; info?: unknown };
      try {
        data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (data.event === "onError") statusRef.current("YouTube cannot play this broadcast here. Use Watch on YouTube.");
      else if (data.event === "onStateChange" && data.info === 1) {
        statusRef.current("YouTube video playing. Check the player LIVE indicator.", true);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const origin = typeof window === "undefined" ? "" : encodeURIComponent(window.location.origin);
  return (
    <iframe
      ref={frameRef}
      title={camera.name}
      src={`https://www.youtube-nocookie.com/embed/${youtubeId(camera.url)}?autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=1&origin=${origin}`}
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}
