import { shipSvg } from "@/lib/icons/ship-icons";
import type { Ship } from "@/types/ships";

import { isMoving, shipBearing } from "../lib/format";

/** Vessel glyph, rotated to its bearing when under way. */
export function ShipIcon({
  ship,
  selected = false,
  className,
  as: Tag = "span",
}: {
  ship: Ship;
  selected?: boolean;
  className?: string;
  as?: "span" | "div";
}) {
  const moving = isMoving(ship);
  return (
    <Tag className={className}>
      <span
        style={{ display: "inline-flex", transform: moving ? `rotate(${shipBearing(ship)}deg)` : undefined }}
        // Generated from constants only.
        dangerouslySetInnerHTML={{ __html: shipSvg(ship.category, moving, selected) }}
      />
    </Tag>
  );
}
