"use client";

import { useShellStore } from "../store";

export function ShellClose({ target, label }: { target: "directory" | "detail"; label: string }) {
  const closeDirectory = useShellStore((s) => s.closeDirectory);
  const closeDetail = useShellStore((s) => s.closeDetail);
  return (
    <button className="shell-close" aria-label={label} onClick={target === "directory" ? closeDirectory : closeDetail}>
      ×
    </button>
  );
}
