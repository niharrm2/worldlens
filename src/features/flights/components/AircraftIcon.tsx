import { aircraftSvg, type AircraftIconState } from "@/lib/icons/aircraft-icons";

/** Inline jet artwork. `gradientId` must be unique in the document. */
export function AircraftIcon({
  state,
  gradientId,
  className,
  as: Tag = "span",
}: {
  state: AircraftIconState;
  gradientId: string;
  className?: string;
  as?: "span" | "div";
}) {
  return (
    <Tag
      className={className}
      // Generated from constants; gradientId is sanitised by callers.
      dangerouslySetInnerHTML={{ __html: aircraftSvg(state, gradientId) }}
    />
  );
}
