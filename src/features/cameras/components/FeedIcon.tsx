import { FEED_COLORS, FEED_ICON_PATHS, FEED_LABELS, FEED_TYPES } from "@/lib/icons/feed-icons";

import type { FeedType } from "../types";

export function FeedIcon({ type }: { type: FeedType }) {
  const t = type in FEED_ICON_PATHS ? type : "external";
  return (
    <svg
      className={`feedicon ${t}`}
      style={{ color: FEED_COLORS[t] }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      // Static, trusted icon markup.
      dangerouslySetInnerHTML={{ __html: FEED_ICON_PATHS[t] }}
    />
  );
}

export function FeedLegend() {
  return (
    <div className="legend" id="feedLegend">
      {FEED_TYPES.map((t) => (
        <span key={t} title={FEED_LABELS[t]}>
          <FeedIcon type={t} />
          {FEED_LABELS[t]}
        </span>
      ))}
    </div>
  );
}
