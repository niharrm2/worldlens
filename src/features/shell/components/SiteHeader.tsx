"use client";

import { useShellStore } from "../store";

interface SiteHeaderProps {
  onOpenWall(): void;
}

export function SiteHeader({ onOpenWall }: SiteHeaderProps) {
  const mode = useShellStore((s) => s.mode);
  const setMode = useShellStore((s) => s.setMode);
  const openDialog = useShellStore((s) => s.openDialog);

  return (
    <header>
      <a className="logo" href="#">
        <span className="logolens">◎</span>worldlens<span className="betatag">OPEN ATLAS</span>
      </a>
      <nav>
        <button
          className={`navitem${mode !== "satellites" ? " active" : ""}`}
          id="exploreTab"
          onClick={() => setMode("cameras")}
        >
          Explore globe
        </button>
        <button
          className={`navitem${mode === "satellites" ? " active" : ""}`}
          id="satellitesTab"
          onClick={() => setMode("satellites")}
        >
          Satellites
        </button>
        <button className="navitem" id="wallTab" onClick={onOpenWall}>
          Watch wall <span>↗</span>
        </button>
        <button className="navitem" id="sourcesTab" onClick={() => openDialog("sources")}>
          Data sources
        </button>
      </nav>
      <div className="headeractions">
        <span className="publictag">
          <i /> Public feeds only
        </span>
        <button className="button quiet" id="addFeed" onClick={() => openDialog("feed")}>
          ＋ Add a feed
        </button>
      </div>
    </header>
  );
}
