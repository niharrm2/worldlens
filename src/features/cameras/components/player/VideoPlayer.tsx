"use client";

import { useEffect, useRef } from "react";

import type { Camera } from "../../types";
import type { StatusSetter } from "./types";

interface VideoPlayerProps {
  camera: Camera;
  onStatus: StatusSetter;
  /** Called once when the video cannot play. */
  onFailure(): void;
}

/** HLS (native or hls.js) or MP4 playback, muted and inline. */
export function VideoPlayer({ camera, onStatus, onFailure }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const callbacks = useRef({ onStatus, onFailure });
  useEffect(() => {
    callbacks.current = { onStatus, onFailure };
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let failed = false;
    let disposed = false;
    let hls: { destroy(): void } | null = null;

    const fail = () => {
      if (failed || disposed) return;
      failed = true;
      callbacks.current.onFailure();
    };
    video.onerror = fail;
    video.onplaying = () =>
      callbacks.current.onStatus(
        camera.type === "mp4" ? "Playing a provider clip; this is not continuous live video." : "Video playing from provider.",
        true,
      );
    const start = () => video.play().catch(() => callbacks.current.onStatus("Press play in the video player to start."));

    if (camera.type === "hls" && !video.canPlayType("application/vnd.apple.mpegurl")) {
      import("hls.js/light")
        .then(({ default: Hls }) => {
          if (disposed) return;
          if (!Hls.isSupported()) return fail();
          const instance = new Hls({ maxBufferLength: 15 });
          hls = instance;
          instance.loadSource(camera.url);
          instance.attachMedia(video);
          instance.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) fail();
          });
          void start();
        })
        .catch(fail);
    } else {
      video.src = camera.url;
      if (camera.type === "mp4") {
        video.onended = () => callbacks.current.onStatus("Clip ended. Reload to request the latest provider clip.");
      }
      void start();
    }

    const onVisibility = () => {
      if (document.hidden) video.pause();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      hls?.destroy();
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [camera]);

  return <video ref={videoRef} controls muted playsInline autoPlay poster={camera.image || undefined} />;
}
