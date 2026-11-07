"use client";

import { useEffect } from "react";

import { useShellStore } from "../store";

/** Escape hides panels; restored (bfcache) pages start with closed explorers. */
export function ShellShortcuts() {
  useEffect(() => {
    const hide = () => useShellStore.getState().hidePanels();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("dialog[open]")) return;
      if (useShellStore.getState().immersive) useShellStore.getState().setImmersive(false);
      else hide();
    };
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("pageshow", hide);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pageshow", hide);
    };
  }, []);
  return null;
}
