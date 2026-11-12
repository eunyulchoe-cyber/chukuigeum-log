/** Public client config. The anon key is safe to ship; tables are locked down by RLS. */
export const SUPABASE_URL = 'https://foimbsbpgvcftjxkxiur.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvaW1ic2JwZ3ZjZnRqeGt4aXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ0NzE4NDYsImV4cCI6MjExMDA0Nzg0Nn0.wX9ZAQaYo0Zj76KBoRM4mDNRJsF2VgD5kjhvwjYV_7c';

const FUNCTIONS = `${SUPABASE_URL}/functions/v1`;

export const HOST_STORE_KEY = "hostAccount";

export type HostAccount = {
  hostId: string;
  hostSecret: string;
  googleEmail?: string | null;
  googleConnected: boolean;
};

export type RemoteDriveVideo = {
  guestId: string;
  fileId: string;
  mime: string | null;
  size: number | null;
  completedAt: string;
};

async function fn<T>(name: string, opts: {
  method?: string;
  body?: unknown;
  hostSecret?: string;
  token?: string;
} = {}): Promise<T> {
  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
  if (opts.hostSecret) headers["x-host-key"] = opts.hostSecret;
  if (opts.token) headers["x-upload-token"] = opts.token;
  const res = await fetch(`${FUNCTIONS}/${name}`, {
    method: opts.method ?? "POST",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    const err = new Error(data.error || `요청에 실패했습니다. (${res.status})`) as Error & { status?: number; code?: string };
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data as T;
}

export async function bootstrapHost(existing?: HostAccount | null): Promise<HostAccount> {
  const data = await fn<{
    hostId: string;
    hostSecret?: string;
    reused: boolean;
    googleConnected: boolean;
    googleEmail: string | null;
  }>("host-bootstrap", {
    body: existing ? { hostId: existing.hostId, hostSecret: existing.hostSecret } : {},
  });
  return {
    hostId: data.hostId,
    hostSecret: data.hostSecret ?? existing!.hostSecret,
    googleConnected: data.googleConnected,
    googleEmail: data.googleEmail,
  };
}

export async function getDriveStatus(hostSecret: string) {
  return fn<{
    googleConnected: boolean;
    googleEmail: string | null;
    googleConfigured: boolean;
    oauthRedirectUri: string | null;
  }>("drive-status", { method: "POST", hostSecret, body: {} });
}

export async function startGoogleOAuth(hostSecret: string, returnPath: string) {
  return fn<{ url: string }>("google-oauth-start", { hostSecret, body: { returnPath } });
}

export async function registerEvent(
  hostSecret: string,
  event: { id: string; date: string; name?: string },
) {
  return fn<{ eventId: string; folderReady: boolean; googleConnected: boolean }>("event-register", {
    hostSecret,
    body: { eventId: event.id, eventDate: event.date, folderLabel: event.name },
  });
}

export async function issueUploadToken(hostSecret: string, eventId: string, guestId: string) {
  return fn<{ token: string; uploadUrl: string; expiresAt: string }>("token-issue", {
    hostSecret,
    body: { eventId, guestId },
  });
}

export async function initGuestUpload(token: string, mime: string, size: number) {
  return fn<{ sessionUrl: string; origin: string; maxBytes: number }>("upload-init", {
    token,
    body: { token, mime, size },
  });
}

export async function completeGuestUpload(token: string, fileId: string) {
  return fn<{ fileId: string; already?: boolean }>("upload-complete", {
    body: { token, fileId },
  });
}

export async function listEventVideos(hostSecret: string, eventId: string) {
  const data = await fn<{ videos: RemoteDriveVideo[] }>("event-videos", {
    hostSecret,
    body: { eventId },
  });
  return data.videos ?? [];
}

export async function getVideoMediaUrl(hostSecret: string, eventId: string, guestId: string) {
  return fn<{ mediaUrl: string; mime: string | null; fileId: string }>("video-ticket", {
    hostSecret,
    body: { eventId, guestId },
  });
}

export async function disconnectDrive(hostSecret: string) {
  return fn<Record<string, never>>("drive-disconnect", { hostSecret, body: {} });
}

/** Upload a blob to a Google Drive resumable session URL. Returns the created file id if present. */
export async function putResumable(sessionUrl: string, blob: Blob, onProgress?: (pct: number) => void): Promise<string> {
  const chunk = 8 * 256 * 1024; // 2 MiB, multiple of 256 KiB
  const total = blob.size;
  let offset = 0;
  let fileId = "";
  while (offset < total) {
    const end = Math.min(offset + chunk, total);
    const slice = blob.slice(offset, end);
    const res = await fetch(sessionUrl, {
      method: "PUT",
      headers: {
        "Content-Type": blob.type || "video/webm",
        "Content-Range": `bytes ${offset}-${end - 1}/${total}`,
      },
      body: slice,
    });
    if (res.status === 308) {
      offset = end;
      onProgress?.(Math.round((offset / total) * 100));
      continue;
    }
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(msg || `드라이브 업로드에 실패했습니다. (${res.status})`);
    }
    const data = await res.json().catch(() => ({})) as { id?: string };
    fileId = data.id || "";
    onProgress?.(100);
    offset = end;
  }
  if (!fileId) throw new Error("드라이브가 파일 아이디를 반환하지 않았습니다.");
  return fileId;
}
