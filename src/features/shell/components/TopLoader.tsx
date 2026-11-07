"use client";

import { useEffect, useState } from "react";

import { useShellStore } from "../store";

/** Delay before showing, so loads served from cache never flash the loader. */
const SHOW_AFTER_MS = 180;

function joinLabels(labels: string[]) {
  const unique = [...new Set(labels)];
  if (unique.length <= 2) return unique.join(" and ");
  return `${unique.slice(0, 2).join(", ")} and ${unique.length - 2} more`;
}

/** Thin progress bar across the top plus a short "Loading …" pill while first loads are in flight. */
export function TopLoader() {
  // Select the stored object (stable between updates); deriving an array inside the
  // selector would return a new value on every read and loop React forever.
  const tasks = useShellStore((s) => s.loadingTasks);
  const labels = Object.values(tasks);
  const busy = labels.length > 0;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!busy) {
      const hide = setTimeout(() => setVisible(false), 0);
      return () => clearTimeout(hide);
    }
    const show = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => clearTimeout(show);
  }, [busy]);

  const text = busy ? `Loading ${joinLabels(labels)}…` : "";
  return (
    <div className={`top-loader${visible && busy ? " on" : ""}`} role="status" aria-live="polite" aria-busy={busy}>
      <div className="top-loader-bar" />
      <div className="top-loader-pill">
        <span className="top-loader-spinner" aria-hidden="true" />
        {text}
      </div>
    </div>
  );
}
