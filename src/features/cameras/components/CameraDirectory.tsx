"use client";

import { useEffect, useRef } from "react";

import { feedKind } from "../lib/format";
import { PAGE_SIZE, useCameraStore } from "../store";
import type { CameraFilter } from "../types";
import { useCountries, useListCameras } from "../hooks/useCameraViews";
import { CameraThumbnail } from "./CameraThumbnail";

const FILTERS: { id: CameraFilter; label: string }[] = [
  { id: "all", label: "All feeds" },
  { id: "youtube", label: "YouTube" },
  { id: "traffic", label: "Traffic" },
  { id: "saved", label: "☆ Saved" },
];

/** Camera explorer content inside the shared `.directory` panel. */
export function CameraDirectory() {
  const store = useCameraStore();
  const list = useListCameras();
  const countries = useCountries();
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const country = countries.all.includes(store.country) ? store.country : "all";

  // "/" focuses search unless typing elsewhere or a dialog is open.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName ?? "";
      if (e.key === "/" && !["INPUT", "SELECT", "TEXTAREA"].includes(tag) && !document.querySelector("dialog[open]")) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const showMore = () => {
    const el = listRef.current;
    const y = el?.scrollTop ?? 0;
    store.showMore();
    requestAnimationFrame(() => {
      if (el) el.scrollTop = y;
    });
  };

  return (
    <>
      <div className="directoryhead">
        <div className="eyebrow">A WINDOW INTO EVERYWHERE</div>
        <h1>
          See the world.
          <br />
          <span>As it happens.</span>
        </h1>
        <p>
          Public cameras and YouTube broadcasts,
          <br />
          connected on a living 3D globe.
        </p>
        <div className="catalogstats">
          <strong id="totalCount">{store.cameras.length ? store.cameras.length.toLocaleString() : "—"}</strong>
          <span>indexed feeds</span>
          <i />
          <strong id="countryCount">{store.cameras.length ? countries.specified : "—"}</strong>
          <span>countries / territories</span>
        </div>
        <div className="searchbox">
          <span>⌕</span>
          <input
            ref={searchRef}
            id="search"
            placeholder="Search a city, road, or camera…"
            aria-label="Search cameras"
            value={store.query}
            onChange={(e) => store.setQuery(e.target.value)}
          />
          <kbd>/</kbd>
        </div>
        <div className="filtertabs">
          {FILTERS.map(({ id, label }) => (
            <button key={id} className={store.filter === id ? "selected" : undefined} onClick={() => store.setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="filterrow">
          <select
            id="country"
            aria-label="Filter by country"
            value={country}
            onChange={(e) => store.setCountry(e.target.value)}
          >
            <option value="all">All countries</option>
            {countries.all.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label>
            <input type="checkbox" id="inView" checked={store.inView} onChange={(e) => store.setInView(e.target.checked)} />{" "}
            In this view
          </label>
        </div>
      </div>
      <div className="availabilityfilter">
        <label>
          <input
            type="checkbox"
            id="directOnly"
            checked={store.directOnly}
            onChange={(e) => store.setDirectOnly(e.target.checked)}
          />{" "}
          Direct-listed media only <span>(not health-verified)</span>
        </label>
      </div>
      <div className="listheading">
        <span id="resultCount">
          {store.cameras.length || store.catalogFailed ? `${list.length.toLocaleString()} matching feeds` : "Loading catalog…"}
        </span>
        <button id="clearFilters" onClick={store.resetFilters}>
          Reset filters
        </button>
      </div>
      <div id="cameraList" className="cameralist" ref={listRef}>
        {store.catalogFailed && !store.cameras.length ? (
          <div className="empty">
            Could not load the catalog. Reload the page or import a camera catalog from Data sources.
          </div>
        ) : store.cameras.length && !list.length ? (
          <div className="empty">
            No cameras match these filters.
            <br />
            Try another country, zoom out, or reset filters.
          </div>
        ) : (
          <>
            {list.slice(0, store.pageSize).map((c) => (
              <button
                key={c.id}
                className={`cameracard${c.id === store.selectedId ? " selected" : ""}`}
                data-camera={c.id}
                onClick={() => void store.select(c.id)}
              >
                <CameraThumbnail camera={c} />
                <span className="cardcopy">
                  <strong>{c.name}</strong>
                  <small>
                    {c.city}, {c.country}
                  </small>
                  <span className="provider">
                    {c.provider} · {feedKind(c)}
                  </span>
                </span>
                <span className="cardarrow">↗</span>
              </button>
            ))}
            {list.length > store.pageSize && (
              <button className="loadmore" id="loadMore" onClick={showMore}>
                Show {PAGE_SIZE} more · {(list.length - store.pageSize).toLocaleString()} remaining ↓
              </button>
            )}
          </>
        )}
      </div>
      <div className="directoryfoot">
        <span className="smallgreen">●</span>
        <span id="catalogStatus">{store.catalogStatus}</span>
        <button
          id="refreshCatalog"
          title="Refresh source catalogs"
          disabled={store.refreshing}
          onClick={() => void store.refreshCatalog()}
        >
          ↻
        </button>
      </div>
    </>
  );
}
