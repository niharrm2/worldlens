"use client";

import { useState } from "react";

import { DialogHead, ModalDialog } from "@/features/shell/components/ModalDialog";
import { useShellStore } from "@/features/shell/store";

import { useCameraStore } from "../../store";

export function AddFeedDialog() {
  const addFeed = useCameraStore((s) => s.addFeed);
  const closeDialog = useShellStore((s) => s.closeDialog);
  const [error, setError] = useState("");

  return (
    <ModalDialog dialog="feed" id="feedDialog" onClose={() => setError("")}>
      <form
        id="feedForm"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const message = addFeed(new FormData(form));
          if (message) {
            setError(message);
            return;
          }
          closeDialog();
          form.reset();
        }}
      >
        <DialogHead eyebrow="PUT A WINDOW ON THE MAP" title="Add a public feed" />
        <label>
          Camera name
          <input name="name" maxLength={120} required placeholder="Harbour live camera" />
        </label>
        <div className="formgrid">
          <label>
            City / area
            <input name="city" maxLength={80} required />
          </label>
          <label>
            Country
            <input name="country" maxLength={80} required />
          </label>
        </div>
        <div className="formgrid">
          <label>
            Latitude
            <input name="lat" type="number" min={-85} max={85} step="any" required />
          </label>
          <label>
            Longitude
            <input name="lng" type="number" min={-180} max={180} step="any" required />
          </label>
        </div>
        <label>
          Feed type
          <select name="type" id="feedType" defaultValue="youtube">
            <option value="youtube">YouTube video / livestream</option>
            <option value="hls">HLS video (.m3u8)</option>
            <option value="mp4">MP4 / periodically refreshed clip</option>
            <option value="snapshot">Snapshot image / MJPEG</option>
          </select>
        </label>
        <label>
          HTTPS feed or YouTube URL
          <input name="url" type="url" required placeholder="https://www.youtube.com/watch?v=…" />
        </label>
        <label>
          Provider / owner
          <input name="provider" maxLength={100} required />
        </label>
        <label className="checklabel">
          <input name="permission" type="checkbox" required />
          This feed is intentionally public and permits the intended display or embedding.
        </label>
        <p className="hint">
          Positions you add are treated as user-supplied. YouTube playback checks current availability; adding a URL
          does not establish that it is live.
        </p>
        <button className="button primary full" type="submit">
          Add to this session →
        </button>
        <p id="feedError" role="alert" className="error">
          {error}
        </p>
      </form>
    </ModalDialog>
  );
}
