"use client";

import { useGlobeStore } from "../store";

export function GlobeHoverTooltip() {
  const hover = useGlobeStore((s) => s.hover);
  return (
    <div
      className="globehover"
      id="globeHover"
      hidden={!hover}
      style={hover ? { left: `${hover.x}px`, top: `${hover.y}px` } : undefined}
    >
      {hover?.text}
    </div>
  );
}

export function GlobeError() {
  const error = useGlobeStore((s) => s.error);
  return (
    <div id="mapError" hidden={!error} className="maperror">
      {error}
    </div>
  );
}

export function GlobeNav() {
  const engine = useGlobeStore((s) => s.engine);
  return (
    <div className="globenav">
      <button id="zoomIn" aria-label="Zoom in" onClick={() => engine?.zoomBy(1)}>
        ＋
      </button>
      <button id="zoomOut" aria-label="Zoom out" onClick={() => engine?.zoomBy(-1)}>
        −
      </button>
      <button id="tiltGlobe" aria-label="Toggle tilted globe view" onClick={() => engine?.toggleTilt()}>
        3D
      </button>
    </div>
  );
}

export function NightToggle() {
  const night = useGlobeStore((s) => s.night);
  const engine = useGlobeStore((s) => s.engine);
  return (
    <button
      className="mapbutton"
      id="mapStyle"
      onClick={() => {
        useGlobeStore.setState({ night: !night });
        engine?.setNight(!night);
      }}
    >
      {night ? "◐ Day atlas" : "◐ Night atlas"}
    </button>
  );
}

export function ViewCount() {
  const count = useGlobeStore((s) => s.viewCount);
  return <span id="mapCount">{count === null ? "— locations" : `${count.toLocaleString()} in view`}</span>;
}
