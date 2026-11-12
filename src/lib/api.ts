export type RemoteVideoMeta = { guestId: string; mime: string; size: number; createdAt: string };

export async function serverAvailable(): Promise<boolean> {
  try {
    const res = await fetch("/api/health", { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function uploadRemoteVideo(eventId: string, guestId: string, blob: Blob): Promise<boolean> {
  try {
    const body = new FormData();
    body.append("video", blob, "letter.webm");
    const res = await fetch(`/api/videos/${encodeURIComponent(eventId)}/${encodeURIComponent(guestId)}`, {
      method: "POST",
      body,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listRemoteVideos(eventId: string): Promise<RemoteVideoMeta[]> {
  try {
    const res = await fetch(`/api/videos/${encodeURIComponent(eventId)}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { videos?: RemoteVideoMeta[] };
    return data.videos ?? [];
  } catch {
    return [];
  }
}

export async function downloadRemoteVideo(eventId: string, guestId: string): Promise<Blob | null> {
  try {
    const res = await fetch(`/api/videos/${encodeURIComponent(eventId)}/${encodeURIComponent(guestId)}`);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}
