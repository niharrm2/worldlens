import { feedKind } from "../lib/format";
import type { Camera } from "../types";
import { FeedIcon } from "./FeedIcon";

export function CameraThumbnail({ camera }: { camera: Camera }) {
  return (
    <div className="thumb">
      {camera.image ? (
        <img
          src={camera.image}
          alt=""
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        "◎"
      )}
      <span className="thumbkind">
        <FeedIcon type={camera.type} /> {feedKind(camera)}
      </span>
    </div>
  );
}
