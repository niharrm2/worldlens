"use client";

import { useEffect } from "react";

import { useShellStore } from "../store";

/** Mirrors panel state onto <body> classes, which the layout CSS is written against. */
export function BodyClassSync() {
  const panelsEnabled = useShellStore((s) => s.panelsEnabled);
  const directoryOpen = useShellStore((s) => s.directoryOpen);
  const detailOpen = useShellStore((s) => s.detailOpen);
  const toolsOpen = useShellStore((s) => s.toolsOpen);
  const globeOnly = useShellStore((s) => s.globeOnly);
  const immersive = useShellStore((s) => s.immersive);

  useEffect(() => {
    const list = document.body.classList;
    list.toggle("panels-enabled", panelsEnabled);
    list.toggle("directory-open", directoryOpen);
    list.toggle("detail-open", detailOpen);
    list.toggle("tools-open", toolsOpen);
    list.toggle("globe-only", globeOnly);
    list.toggle("immersive", immersive);
  }, [panelsEnabled, directoryOpen, detailOpen, toolsOpen, globeOnly, immersive]);

  return null;
}
