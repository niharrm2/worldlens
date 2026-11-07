"use client";

import { useShellStore } from "../store";

export function Toast() {
  const text = useShellStore((s) => s.toastText);
  const visible = useShellStore((s) => s.toastVisible);
  return (
    <div id="toast" role="status" className={visible ? "visible" : undefined}>
      {text}
    </div>
  );
}
