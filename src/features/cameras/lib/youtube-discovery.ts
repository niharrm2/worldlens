/** Find active, embeddable, geotagged YouTube livestreams near a point (user-supplied API key). */
import { fetchJson } from "@/lib/http";

import type { Camera } from "../types";
import { isValidCamera } from "./camera-core";

interface SearchResponse {
  items?: { id: { videoId: string } }[];
}

interface VideosResponse {
  items?: {
    id: string;
    snippet: {
      title: string;
      channelTitle: string;
      liveBroadcastContent: string;
      thumbnails?: { medium?: { url: string } };
    };
    recordingDetails?: { location?: { latitude: number; longitude: number }; locationDescription?: string };
    liveStreamingDetails?: { actualEndTime?: string };
    status?: { embeddable?: boolean };
  }[];
}

const API = "https://www.googleapis.com/youtube/v3";

/** Returns `null` when the search found no candidate videos. */
export async function discoverYoutubeBroadcasts(
  centre: { lat: number; lng: number },
  key: string,
): Promise<Camera[] | null> {
  const search = await fetchJson<SearchResponse>(
    `${API}/search?` +
      new URLSearchParams({
        part: "snippet",
        type: "video",
        eventType: "live",
        videoEmbeddable: "true",
        location: `${centre.lat.toFixed(5)},${centre.lng.toFixed(5)}`,
        locationRadius: "500km",
        maxResults: "50",
        q: "webcam",
        key,
      }),
  );
  const ids = (search.items || []).map((x) => x.id.videoId);
  if (!ids.length) return null;

  const videos = await fetchJson<VideosResponse>(
    `${API}/videos?` +
      new URLSearchParams({ part: "snippet,recordingDetails,liveStreamingDetails,status", id: ids.join(","), key }),
  );
  const time = new Date().toISOString();
  return (videos.items || [])
    .filter(
      (x) =>
        x.recordingDetails?.location &&
        x.snippet.liveBroadcastContent === "live" &&
        x.status?.embeddable &&
        !x.liveStreamingDetails?.actualEndTime,
    )
    .map((x): Camera => {
      const location = x.recordingDetails!.location!;
      const url = `https://www.youtube.com/watch?v=${x.id}`;
      return {
        id: `yt-${x.id}`,
        name: x.snippet.title,
        city: x.recordingDetails!.locationDescription || "Publisher-geotagged location",
        country: "YouTube geotag",
        lat: location.latitude,
        lng: location.longitude,
        type: "youtube",
        url,
        image: x.snippet.thumbnails?.medium?.url || "",
        provider: x.snippet.channelTitle,
        source: "youtube",
        sourceUrl: url,
        category: "Geotagged broadcast",
        checkedAt: time,
        status: "live-at-check",
        locationPrecision: "Publisher-provided video geotag",
        note: "Active, embeddable broadcast reported by YouTube Data API at the check time. Playback can subsequently change.",
      };
    })
    .filter(isValidCamera);
}
