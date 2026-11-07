"use client";

import { useEffect, useState } from "react";

import { resizeGlobe } from "@/features/globe/store";

import { useShellStore, type AppMode } from "../store";

interface GlobeDockProps {
  /** Fly back to the default view for the current mode. */
  onHome(): void;
}

export function GlobeDock({ onHome }: GlobeDockProps) {
  const mode = useShellStore((s) => s.mode);
  const toolsOpen = useShellStore((s) => s.toolsOpen);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => {
      setFullscreen(!!document.fullscreenElement);
      resizeGlobe();
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  /** Switch layer only; the panel opens from the panel button. Close the previous layer's detail card. */
  const openExplorer = (target: AppMode) => {
    const shell = useShellStore.getState();
    if (shell.mode !== target) useShellStore.setState({ detailOpen: false });
    shell.setMode(target);
    useShellStore.setState({ toolsOpen: false });
  };

  /**
   * Browser full screen, falling back to in-app full screen. Some embedded browsers never
   * settle the request, so give it a second before falling back.
   */
  const toggleFullscreen = async () => {
    const shell = useShellStore.getState();
    if (shell.immersive) {
      shell.setImmersive(false);
      return;
    }
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    const attempt = document.documentElement.requestFullscreen?.();
    const entered = await Promise.race([
      (attempt ?? Promise.reject(new Error("unsupported"))).then(
        () => !!document.fullscreenElement,
        () => false,
      ),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(!!document.fullscreenElement), 1200)),
    ]);
    if (!entered) {
      shell.setImmersive(true);
      shell.notify("Showing the globe full screen. Press Esc or “Exit full screen” to return.");
    }
  };

  const immersive = useShellStore((s) => s.immersive);
  const globeOnly = useShellStore((s) => s.globeOnly);
  const fullscreenLabel = fullscreen || immersive ? "Exit full screen" : "Enter full screen";

  return (
    <div className="globe-dock" aria-label="Globe tools">
      <a
        className="globe-wordmark"
        href="#"
        aria-label="WorldLens globe home"
        onClick={(e) => {
          e.preventDefault();
          useShellStore.getState().hidePanels();
          onHome();
        }}
      >
        ◎ <span>worldlens</span>
      </a>
      <div className="dock-divider" />
      <button
        id="shellCameras"
        aria-label="Explore cameras"
        title="Explore cameras"
        aria-pressed={mode === "cameras"}
        onClick={() => openExplorer("cameras")}
      >
        <svg viewBox="0 0 24 24">
          <rect x="3" y="6" width="12" height="12" rx="3" />
          <path d="m15 10 6-3v10l-6-3" />
        </svg>
        <span>Cameras</span>
      </button>
      <button
        id="shellSatellites"
        aria-label="Explore satellites"
        title="Explore satellites"
        aria-pressed={mode === "satellites"}
        onClick={() => openExplorer("satellites")}
      >
        <svg viewBox="0 0 24 24">
          <rect x="9" y="8" width="6" height="8" rx="1" />
          <path d="M9 10H2v5h7m6-5h7v5h-7M12 8V3m-3 1 3-2 3 2M12 16v5" />
        </svg>
        <span>Satellites</span>
      </button>
      <button
        id="shellFlights"
        aria-label="Explore live flights"
        title="Explore live flights"
        aria-pressed={mode === "flights"}
        onClick={() => openExplorer("flights")}
      >
        <svg viewBox="0 0 24 24">
          <path d="m12 2 2 7 7 5v2l-7-2v5l3 2v1l-5-1-5 1v-1l3-2v-5l-7 2v-2l7-5z" />
        </svg>
        <span>Flights</span>
      </button>
      <button
        id="shellShips"
        aria-label="Explore ships at sea"
        title="Explore ships at sea"
        aria-pressed={mode === "ships"}
        onClick={() => openExplorer("ships")}
      >
        <svg viewBox="0 0 24 24">
          <path d="M4 15h16l-2.5 4.5h-11ZM6.5 15V9.5h11V15M12 9.5V4m0 0 4 2.5h-4" />
        </svg>
        <span>Ships</span>
      </button>
      <button
        id="shellEarth"
        aria-label="Explore live Earth data"
        title="Earthquakes, fires, weather, air, clouds, rain, aurora, events, oceans"
        aria-pressed={mode === "earth"}
        onClick={() => openExplorer("earth")}
      >
        <svg viewBox="0 0 24 24">
          <path d="M3 12h3l2-5 3 10 2-7 2 4h6" />
        </svg>
        <span>Earth</span>
      </button>
      <button
        id="shellMovement"
        aria-label="Explore movement: trains, transit, gliders, bikes, balloons, launches"
        title="Trains, buses and trams, gliders, bikes, weather balloons and rocket launches"
        aria-pressed={mode === "movement"}
        onClick={() => openExplorer("movement")}
      >
        <svg viewBox="0 0 24 24">
          <path d="M3 17h13M3 12h18M3 7h9m6 10 3-5-3-5" />
        </svg>
        <span>Movement</span>
      </button>
      <button
        id="shellGlobe"
        aria-label={globeOnly ? "Show layers again" : "Show globe only"}
        title={globeOnly ? "Show layers again" : "Show globe only (hide all layers and panels)"}
        aria-pressed={globeOnly}
        onClick={() => useShellStore.getState().toggleGlobeOnly()}
      >
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <ellipse cx="12" cy="12" rx="4" ry="9" />
          <path d="M3 12h18" />
        </svg>
        <span>Globe</span>
      </button>
      <button
        id="shellFullscreen"
        aria-label={fullscreenLabel}
        title={fullscreenLabel}
        aria-pressed={fullscreen || immersive}
        onClick={toggleFullscreen}
      >
        <svg viewBox="0 0 24 24">
          <path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5" />
        </svg>
      </button>
      <button
        id="shellTools"
        aria-label="More tools"
        aria-expanded={toolsOpen}
        title="More tools"
        onClick={() => useShellStore.getState().toggleTools()}
      >
        <svg viewBox="0 0 24 24">
          <circle cx="5" cy="12" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
        </svg>
      </button>
    </div>
  );
}
