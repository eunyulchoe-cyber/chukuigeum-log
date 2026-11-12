const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export function googleConfigured(): boolean {
  return Boolean(Deno.env.get("GOOGLE_CLIENT_ID") && Deno.env.get("GOOGLE_CLIENT_SECRET"));
}

export function oauthRedirectUri(): string {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) throw new Error("missing SUPABASE_URL");
  return `${url.replace(/\/$/, "")}/functions/v1/google-oauth-callback`;
}

export function authorizeUrl(params: { state: string; codeChallenge: string }): string {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not set");
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: oauthRedirectUri(),
    response_type: "code",
    scope: DRIVE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
  });
  return `${AUTH_URL}?${q.toString()}`;
}

export async function exchangeCode(code: string, codeVerifier: string): Promise<{
  refresh_token?: string;
  access_token: string;
  expires_in?: number;
}> {
  const body = new URLSearchParams({
    client_id: Deno.env.get("GOOGLE_CLIENT_ID") ?? "",
    client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "",
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: oauthRedirectUri(),
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`google token exchange failed (${res.status})`);
  return await res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in?: number }> {
  const body = new URLSearchParams({
    client_id: Deno.env.get("GOOGLE_CLIENT_ID") ?? "",
    client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "",
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`google refresh failed (${res.status})`);
  return await res.json();
}

export async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json() as { email?: string };
  return data.email ?? null;
}

export async function ensureEventFolder(
  accessToken: string,
  label: string,
  existingId?: string | null,
): Promise<string> {
  if (existingId) {
    const check = await fetch(`${DRIVE_FILES}/${encodeURIComponent(existingId)}?fields=id,trashed`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (check.ok) {
      const meta = await check.json() as { id?: string; trashed?: boolean };
      if (meta.id && !meta.trashed) return meta.id;
    }
  }
  const res = await fetch(`${DRIVE_FILES}?fields=id`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: label,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });
  if (!res.ok) throw new Error(`drive folder create failed (${res.status})`);
  const data = await res.json() as { id: string };
  return data.id;
}

export async function startResumableUpload(opts: {
  accessToken: string;
  folderId: string;
  fileName: string;
  mime: string;
  size: number;
  origin: string;
}): Promise<string> {
  const res = await fetch(`${DRIVE_UPLOAD}?uploadType=resumable&fields=id,name,size,mimeType`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": opts.mime,
      "X-Upload-Content-Length": String(opts.size),
      Origin: opts.origin,
    },
    body: JSON.stringify({
      name: opts.fileName,
      parents: [opts.folderId],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`resumable init failed (${res.status}) ${t.slice(0, 200)}`);
  }
  const location = res.headers.get("Location") || res.headers.get("location");
  if (!location) throw new Error("resumable init missing Location");
  return location;
}

export async function getFileInFolder(
  accessToken: string,
  fileId: string,
  folderId: string,
): Promise<{ id: string; mimeType?: string; size?: string; name?: string } | null> {
  const res = await fetch(
    `${DRIVE_FILES}/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,parents,trashed`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return null;
  const data = await res.json() as { id: string; parents?: string[]; trashed?: boolean; mimeType?: string; size?: string; name?: string };
  if (data.trashed) return null;
  if (!data.parents?.includes(folderId)) return null;
  return data;
}

export async function driveMedia(accessToken: string, fileId: string, range?: string | null): Promise<Response> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (range) headers.Range = range;
  return await fetch(`${DRIVE_FILES}/${encodeURIComponent(fileId)}?alt=media`, { headers });
}
