"use client";

import { useState } from "react";

import { getGlobe } from "@/features/globe/store";

import { DESTINATIONS, useCameraStore } from "../store";

/** Quick jumps: preset regions, or every YouTube broadcast worldwide. */
export function DestinationBar() {
  const [chosen, setChosen] = useState("world");

  const go = (id: string) => {
    setChosen(id);
    const store = useCameraStore.getState();
    const globe = getGlobe();
    if (id === "youtube") {
      useCameraStore.setState({ filter: "youtube", country: "all", query: "", inView: false, pageSize: 40 });
      globe?.setView([5, 30], 2);
      return;
    }
    store.setFilter("all");
    useCameraStore.setState({ country: "all", query: "" });
    const { center, zoom } = DESTINATIONS[id];
    if (center) globe?.flyTo(center, zoom);
  };

  return (
    <div className="destinations">
      {Object.entries(DESTINATIONS).map(([id, { label }]) => (
        <button key={id} data-destination={id} className={chosen === id ? "chosen" : undefined} onClick={() => go(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}
