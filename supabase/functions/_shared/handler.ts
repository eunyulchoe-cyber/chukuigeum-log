import { preflight, withCors } from "./cors.ts";
import { decryptString, encryptString, issueMediaTicket, verifyMediaTicket } from "./crypto.ts";
import { adminClient, bumpRateLimit, clientIp, type EventRow, type HostRow } from "./db.ts";
import {
  authorizeUrl,
  driveMedia,
  ensureEventFolder,
  exchangeCode,
  fetchGoogleEmail,
  getFileInFolder,
  googleConfigured,
  oauthRedirectUri,
  refreshAccessToken,
  startResumableUpload,
} from "./google.ts";
import {
  APP_BASE_PATH,
  eventExpiryIso,
  fileNameForGuest,
  isAllowedMime,
  isEventDay,
  isWithinSize,
  jsonError,
  jsonOk,
  pickAllowedOrigin,
  PRODUCTION_ORIGIN,
  randomToken,
  sanitizeFolderLabel,
  sha256Hex,
} from "./logic.ts";

function driveKey(): string {
  const k = Deno.env.get("DRIVE_TOKEN_KEY");
  if (!k) throw new Error("DRIVE_TOKEN_KEY is not set");
  return k;
}

function appOrigin(): string {
  return (Deno.env.get("APP_ORIGIN") || PRODUCTION_ORIGIN).replace(/\/$/, "");
}

function appHome(): string {
  const base = Deno.env.get("APP_BASE_PATH") || APP_BASE_PATH;
  return `${appOrigin()}${base.startsWith("/") ? base : `/${base}`}`;
}

function redirectToApp(query: Record<string, string>, returnPath?: string | null): Response {
  const hashPath = returnPath && returnPath.startsWith("#/") ? returnPath.slice(1) : "/drive-callback";
  const pathOnly = hashPath.split("?")[0];
  const q = new URLSearchParams(query);
  return Response.redirect(`${appHome()}#${pathOnly}?${q.toString()}`, 302);
}

async function requireHost(req: Request): Promise<{ host: HostRow; db: ReturnType<typeof adminClient> } | Response> {
  const db = adminClient();
  const secret = req.headers.get("x-host-key") || "";
  if (!secret.startsWith("chg_host_")) return jsonError("호스트 키가 필요합니다.", 401);
  const hash = await sha256Hex(secret);
  const { data, error } = await db.from("hosts").select("*").eq("secret_hash", hash).maybeSingle();
  if (error) return jsonError("서버 오류가 발생했습니다.", 500);
  if (!data) return jsonError("호스트 키를 확인할 수 없습니다.", 401);
  return { host: data as HostRow, db };
}

async function hostAccessToken(host: HostRow): Promise<string> {
  if (!host.google_refresh_enc) throw new Error("not_connected");
  const refresh = await decryptString(host.google_refresh_enc, driveKey());
  const tok = await refreshAccessToken(refresh);
  return tok.access_token;
}

export async function handle(req: Request, action: string): Promise<Response> {
  const extra = Deno.env.get("APP_ORIGIN") || undefined;
  try {
    if (req.method === "OPTIONS") return preflight(req, extra);

    if (action !== "video-media" && action !== "google-oauth-callback") {
      await adminClient().rpc("cleanup_relay_ephemera").then(() => undefined, () => undefined);
    }

    const ip = clientIp(req);
    let res: Response;
    switch (action) {
      case "host-bootstrap":
        res = await hostBootstrap(req, ip);
        break;
      case "drive-status":
        res = await driveStatus(req, ip);
        break;
      case "google-oauth-start":
        res = await oauthStart(req, ip);
        break;
      case "google-oauth-callback":
        res = await oauthCallback(req, ip);
        break;
      case "event-register":
        res = await eventRegister(req, ip);
        break;
      case "token-issue":
        res = await tokenIssue(req, ip);
        break;
      case "upload-init":
        res = await uploadInit(req, ip);
        break;
      case "upload-complete":
        res = await uploadComplete(req, ip);
        break;
      case "event-videos":
        res = await eventVideos(req, ip);
        break;
      case "video-ticket":
        res = await videoTicket(req, ip);
        break;
      case "video-media":
        res = await videoMedia(req, ip);
        break;
      case "drive-disconnect":
        res = await driveDisconnect(req, ip);
        break;
      default:
        res = jsonError("unknown action", 404);
    }
    return withCors(req, res, extra);
  } catch (err) {
    console.error(action, err);
    return withCors(req, jsonError("서버 오류가 발생했습니다.", 500), extra);
  }
}

async function hostBootstrap(req: Request, ip: string): Promise<Response> {
  if (req.method !== "POST") return jsonError("method", 405);
  const db = adminClient();
  const rate = await bumpRateLimit(db, `host-bootstrap:${ip}`, 20);
  if (!rate.ok) return jsonError("잠시 후 다시 시도해 주세요.", 429);
  const body = await req.json().catch(() => ({})) as { hostId?: string; hostSecret?: string };
  if (body.hostId && body.hostSecret) {
    const hash = await sha256Hex(body.hostSecret);
    const { data } = await db.from("hosts").select("*").eq("id", body.hostId).eq("secret_hash", hash).maybeSingle();
    if (data) {
      const host = data as HostRow;
      return jsonOk({
        hostId: host.id,
        reused: true,
        googleConnected: Boolean(host.google_refresh_enc),
        googleEmail: host.google_email,
      });
    }
  }
  const secret = randomToken("chg_host_", 32);
  const hash = await sha256Hex(secret);
  const { data, error } = await db.from("hosts").insert({ secret_hash: hash }).select("id").maybeSingle();
  if (error || !data) return jsonError("호스트를 만들지 못했습니다.", 500);
  return jsonOk({ hostId: data.id, hostSecret: secret, reused: false, googleConnected: false, googleEmail: null });
}

async function driveStatus(req: Request, ip: string): Promise<Response> {
  if (req.method !== "GET" && req.method !== "POST") return jsonError("method", 405);
  const auth = await requireHost(req);
  if (auth instanceof Response) return auth;
  const rate = await bumpRateLimit(auth.db, `drive-status:${auth.host.id}:${ip}`, 60);
  if (!rate.ok) return jsonError("잠시 후 다시 시도해 주세요.", 429);
  return jsonOk({
    googleConnected: Boolean(auth.host.google_refresh_enc),
    googleEmail: auth.host.google_email,
    googleConfigured: googleConfigured(),
    oauthRedirectUri: googleConfigured() ? oauthRedirectUri() : null,
  });
}

async function oauthStart(req: Request, ip: string): Promise<Response> {
  if (req.method !== "POST" && req.method !== "GET") return jsonError("method", 405);
  if (!googleConfigured()) {
    return jsonError("아직 구글 클라우드 OAuth 클라이언트가 설정되지 않았습니다. 안내 문서를 따라 클라이언트 ID를 만든 뒤 알려 주세요.", 503, {
      code: "google_not_configured",
      redirectUri: oauthRedirectUri(),
      origin: appOrigin(),
    });
  }
  const auth = await requireHost(req);
  if (auth instanceof Response) return auth;
  const rate = await bumpRateLimit(auth.db, `oauth-start:${auth.host.id}:${ip}`, 10);
  if (!rate.ok) return jsonError("잠시 후 다시 시도해 주세요.", 429);
  let returnPath: string | undefined;
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({})) as { returnPath?: string };
    returnPath = body.returnPath;
  } else {
    returnPath = new URL(req.url).searchParams.get("returnPath") ?? undefined;
  }
  if (returnPath && !returnPath.startsWith("#/")) returnPath = undefined;
  const state = randomToken("", 24);
  const verifier = randomToken("", 32);
  const challengeBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(challengeBuf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const { error } = await auth.db.from("oauth_states").insert({
    state,
    host_id: auth.host.id,
    code_verifier: verifier,
    return_path: returnPath ?? null,
  });
  if (error) return jsonError("인증을 시작하지 못했습니다.", 500);
  const url = authorizeUrl({ state, codeChallenge: challenge });
  return jsonOk({ url });
}

async function oauthCallback(req: Request, _ip: string): Promise<Response> {
  const url = new URL(req.url);
  const err = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (err) return redirectToApp({ ok: "0", error: "denied" });
  if (!code || !state) return redirectToApp({ ok: "0", error: "missing" });
  const db = adminClient();
  const { data: st } = await db.from("oauth_states").select("*").eq("state", state).maybeSingle();
  if (!st) return redirectToApp({ ok: "0", error: "state" });
  await db.from("oauth_states").delete().eq("state", state);
  // 20 min expiry
  if (new Date(st.created_at).getTime() < Date.now() - 20 * 60 * 1000) {
    return redirectToApp({ ok: "0", error: "expired" }, st.return_path);
  }
  try {
    const tokens = await exchangeCode(code, st.code_verifier);
    if (!tokens.refresh_token) {
      return redirectToApp({ ok: "0", error: "no_refresh" }, st.return_path);
    }
    const email = await fetchGoogleEmail(tokens.access_token);
    const encTok = await encryptString(tokens.refresh_token, driveKey());
    const { error } = await db.from("hosts").update({
      google_refresh_enc: encTok,
      google_email: email,
      google_connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", st.host_id);
    if (error) return redirectToApp({ ok: "0", error: "save" }, st.return_path);
    return redirectToApp({ ok: "1" }, st.return_path);
  } catch (e) {
    console.error("oauth callback", e);
    return redirectToApp({ ok: "0", error: "exchange" }, st.return_path);
  }
}

async function eventRegister(req: Request, ip: string): Promise<Response> {
  if (req.method !== "POST") return jsonError("method", 405);
  const auth = await requireHost(req);
  if (auth instanceof Response) return auth;
  const rate = await bumpRateLimit(auth.db, `event-register:${auth.host.id}:${ip}`, 30);
  if (!rate.ok) return jsonError("잠시 후 다시 시도해 주세요.", 429);
  const body = await req.json().catch(() => ({})) as { eventId?: string; eventDate?: string; folderLabel?: string };
  const eventId = (body.eventId ?? "").trim();
  const eventDate = (body.eventDate ?? "").slice(0, 10);
  if (!eventId || !/^[A-Za-z0-9_-]{8,80}$/.test(eventId)) return jsonError("행사 아이디가 올바르지 않습니다.", 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return jsonError("행사 날짜가 올바르지 않습니다.", 400);
  const label = sanitizeFolderLabel(body.folderLabel, eventId.slice(0, 8));

  const { data: existing } = await auth.db.from("events").select("*").eq("id", eventId).maybeSingle();
  if (existing && (existing as EventRow).host_id !== auth.host.id) {
    return jsonError("이 행사 아이디는 이미 다른 호스트에 등록되어 있습니다.", 409);
  }

  let folderId = (existing as EventRow | null)?.drive_folder_id ?? null;
  let folderReady = Boolean(folderId);
  if (auth.host.google_refresh_enc) {
    try {
      const access = await hostAccessToken(auth.host);
      folderId = await ensureEventFolder(access, label, folderId);
      folderReady = true;
    } catch (e) {
      console.error("folder", e);
      folderReady = false;
    }
  }

  const row = {
    id: eventId,
    host_id: auth.host.id,
    event_date: eventDate,
    folder_label: label,
    drive_folder_id: folderId,
    updated_at: new Date().toISOString(),
  };
  const { error } = await auth.db.from("events").upsert(row);
  if (error) return jsonError("행사를 등록하지 못했습니다.", 500);
  return jsonOk({
    eventId,
    folderReady,
    googleConnected: Boolean(auth.host.google_refresh_enc),
  });
}

async function tokenIssue(req: Request, ip: string): Promise<Response> {
  if (req.method !== "POST") return jsonError("method", 405);
  const auth = await requireHost(req);
  if (auth instanceof Response) return auth;
  const rate = await bumpRateLimit(auth.db, `token-issue:${auth.host.id}:${ip}`, 60);
  if (!rate.ok) return jsonError("잠시 후 다시 시도해 주세요.", 429);
  const body = await req.json().catch(() => ({})) as { eventId?: string; guestId?: string };
  const eventId = (body.eventId ?? "").trim();
  const guestId = (body.guestId ?? "").trim();
  if (!eventId || !guestId) return jsonError("행사와 손님 아이디가 필요합니다.", 400);
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(guestId)) return jsonError("손님 아이디가 올바르지 않습니다.", 400);
  const { data: ev } = await auth.db.from("events").select("*").eq("id", eventId).eq("host_id", auth.host.id).maybeSingle();
  if (!ev) return jsonError("먼저 행사를 클라우드에 등록해 주세요.", 400);
  const event = ev as EventRow;
  if (!event.drive_folder_id) return jsonError("구글 드라이브 폴더가 아직 준비되지 않았습니다. 드라이브 연결을 확인해 주세요.", 409);
  if (!isEventDay(event.event_date) && event.event_date > new Date().toISOString().slice(0, 10)) {
    // Allow issuing tokens before the day starts (QR printed at reception start), but they only work on the day.
  }
  const { data: existingVideo } = await auth.db.from("videos").select("guest_id").eq("event_id", eventId).eq("guest_id", guestId).maybeSingle();
  if (existingVideo) return jsonError("이 손님은 이미 영상을 올렸습니다.", 409, { code: "already_uploaded" });

  // Invalidate unused previous token
  await auth.db.from("upload_tokens").delete().eq("event_id", eventId).eq("guest_id", guestId).is("used_at", null);

  const token = randomToken("chg_up_", 32);
  const token_hash = await sha256Hex(token);
  const expires_at = eventExpiryIso(event.event_date);
  const { error } = await auth.db.from("upload_tokens").insert({ token_hash, event_id: eventId, guest_id: guestId, expires_at });
  if (error) return jsonError("업로드 코드를 만들지 못했습니다.", 500);
  const base = appHome();
  const uploadUrl = `${base}#/u/${token}`;
  return jsonOk({ token, uploadUrl, expiresAt: expires_at });
}

async function uploadInit(req: Request, ip: string): Promise<Response> {
  if (req.method !== "POST") return jsonError("method", 405);
  const db = adminClient();
  const rate = await bumpRateLimit(db, `upload-init:${ip}`, 20);
  if (!rate.ok) return jsonError("잠시 후 다시 시도해 주세요.", 429);
  const body = await req.json().catch(() => ({})) as { token?: string; mime?: string; size?: number };
  const token = (body.token || req.headers.get("x-upload-token") || "").trim();
  const mime = (body.mime || "").trim();
  const size = Number(body.size);
  if (!token.startsWith("chg_up_")) return jsonError("업로드 코드가 올바르지 않습니다.", 401);
  if (!isAllowedMime(mime)) return jsonError("영상 파일만 올릴 수 있습니다.", 400);
  if (!isWithinSize(size)) return jsonError("영상이 너무 큽니다. 최대 150MB까지 올릴 수 있습니다.", 413);
  const hash = await sha256Hex(token);
  const { data: tok } = await db.from("upload_tokens").select("*").eq("token_hash", hash).maybeSingle();
  if (!tok) return jsonError("업로드 코드가 올바르지 않거나 만료되었습니다.", 401);
  if (tok.used_at) return jsonError("이 코드는 이미 사용되었습니다. 영상은 손님당 한 번만 올릴 수 있습니다.", 409);
  if (new Date(tok.expires_at).getTime() < Date.now()) return jsonError("이 링크는 만료되었습니다. QR은 행사 당일에만 유효합니다.", 403);
  const { data: ev } = await db.from("events").select("*").eq("id", tok.event_id).maybeSingle();
  if (!ev) return jsonError("행사를 찾을 수 없습니다.", 404);
  const event = ev as EventRow;
  if (!isEventDay(event.event_date)) return jsonError("이 링크는 행사 당일에만 유효합니다.", 403);
  if (!event.drive_folder_id) return jsonError("주최자의 드라이브가 아직 준비되지 않았습니다.", 409);
  const { data: existingVideo } = await db.from("videos").select("guest_id").eq("event_id", event.id).eq("guest_id", tok.guest_id).maybeSingle();
  if (existingVideo) return jsonError("이미 영상이 등록되어 있습니다.", 409);
  const { data: host } = await db.from("hosts").select("*").eq("id", event.host_id).maybeSingle();
  if (!host?.google_refresh_enc) return jsonError("주최자의 드라이브 연결이 끊어졌습니다.", 409);
  const origin = pickAllowedOrigin(req.headers.get("origin")) || appOrigin();
  try {
    const access = await hostAccessToken(host as HostRow);
    const sessionUrl = await startResumableUpload({
      accessToken: access,
      folderId: event.drive_folder_id,
      fileName: fileNameForGuest(tok.guest_id, mime),
      mime,
      size,
      origin,
    });
    return jsonOk({ sessionUrl, origin, maxBytes: 150 * 1024 * 1024 });
  } catch (e) {
    console.error("upload-init", e);
    return jsonError("드라이브 업로드 세션을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.", 502);
  }
}

async function uploadComplete(req: Request, ip: string): Promise<Response> {
  if (req.method !== "POST") return jsonError("method", 405);
  const db = adminClient();
  const rate = await bumpRateLimit(db, `upload-complete:${ip}`, 30);
  if (!rate.ok) return jsonError("잠시 후 다시 시도해 주세요.", 429);
  const body = await req.json().catch(() => ({})) as { token?: string; fileId?: string };
  const token = (body.token || "").trim();
  const fileId = (body.fileId || "").trim();
  if (!token.startsWith("chg_up_") || !fileId) return jsonError("완료 정보가 올바르지 않습니다.", 400);
  const hash = await sha256Hex(token);
  const { data: tok } = await db.from("upload_tokens").select("*").eq("token_hash", hash).maybeSingle();
  if (!tok) return jsonError("업로드 코드가 올바르지 않습니다.", 401);
  if (tok.used_at) return jsonOk({ already: true });
  const { data: ev } = await db.from("events").select("*").eq("id", tok.event_id).maybeSingle();
  if (!ev?.drive_folder_id) return jsonError("행사를 찾을 수 없습니다.", 404);
  const event = ev as EventRow;
  const { data: host } = await db.from("hosts").select("*").eq("id", event.host_id).maybeSingle();
  if (!host) return jsonError("호스트를 찾을 수 없습니다.", 404);
  const access = await hostAccessToken(host as HostRow);
  const file = await getFileInFolder(access, fileId, event.drive_folder_id);
  if (!file) return jsonError("드라이브에서 영상을 확인하지 못했습니다.", 400);
  if (file.mimeType && !isAllowedMime(file.mimeType)) return jsonError("영상 파일만 등록할 수 있습니다.", 400);
  const size = file.size ? Number(file.size) : null;
  if (size && !isWithinSize(size)) return jsonError("영상이 너무 큽니다.", 413);
  const { error: vErr } = await db.from("videos").upsert({
    event_id: event.id,
    guest_id: tok.guest_id,
    drive_file_id: file.id,
    mime: file.mimeType ?? null,
    size_bytes: size,
    completed_at: new Date().toISOString(),
  });
  if (vErr) return jsonError("영상 기록을 저장하지 못했습니다.", 500);
  await db.from("upload_tokens").update({ used_at: new Date().toISOString() }).eq("id", tok.id);
  return jsonOk({ fileId: file.id });
}

async function eventVideos(req: Request, ip: string): Promise<Response> {
  if (req.method !== "POST" && req.method !== "GET") return jsonError("method", 405);
  const auth = await requireHost(req);
  if (auth instanceof Response) return auth;
  const rate = await bumpRateLimit(auth.db, `event-videos:${auth.host.id}:${ip}`, 60);
  if (!rate.ok) return jsonError("잠시 후 다시 시도해 주세요.", 429);
  const eventId = req.method === "GET"
    ? new URL(req.url).searchParams.get("eventId") ?? ""
    : ((await req.json().catch(() => ({}))) as { eventId?: string }).eventId ?? "";
  if (!eventId) return jsonError("행사 아이디가 필요합니다.", 400);
  const { data: ev } = await auth.db.from("events").select("id").eq("id", eventId).eq("host_id", auth.host.id).maybeSingle();
  if (!ev) return jsonError("등록된 행사가 아닙니다.", 404);
  const { data, error } = await auth.db
    .from("videos")
    .select("guest_id, drive_file_id, mime, size_bytes, completed_at")
    .eq("event_id", eventId);
  if (error) return jsonError("목록을 불러오지 못했습니다.", 500);
  return jsonOk({
    videos: (data ?? []).map((v) => ({
      guestId: v.guest_id,
      fileId: v.drive_file_id,
      mime: v.mime,
      size: v.size_bytes,
      completedAt: v.completed_at,
    })),
  });
}

async function videoTicket(req: Request, ip: string): Promise<Response> {
  if (req.method !== "POST") return jsonError("method", 405);
  const auth = await requireHost(req);
  if (auth instanceof Response) return auth;
  const rate = await bumpRateLimit(auth.db, `video-ticket:${auth.host.id}:${ip}`, 60);
  if (!rate.ok) return jsonError("잠시 후 다시 시도해 주세요.", 429);
  const body = await req.json().catch(() => ({})) as { eventId?: string; guestId?: string };
  if (!body.eventId || !body.guestId) return jsonError("행사와 손님 아이디가 필요합니다.", 400);
  const { data: ev } = await auth.db.from("events").select("id").eq("id", body.eventId).eq("host_id", auth.host.id).maybeSingle();
  if (!ev) return jsonError("등록된 행사가 아닙니다.", 404);
  const { data: video } = await auth.db
    .from("videos")
    .select("drive_file_id, mime")
    .eq("event_id", body.eventId)
    .eq("guest_id", body.guestId)
    .maybeSingle();
  if (!video) return jsonError("이 손님의 영상이 아직 없습니다.", 404);
  const ticket = await issueMediaTicket(
    { hostId: auth.host.id, eventId: body.eventId, fileId: video.drive_file_id },
    driveKey(),
  );
  const mediaUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/video-media?ticket=${encodeURIComponent(ticket)}`;
  return jsonOk({ mediaUrl, mime: video.mime, fileId: video.drive_file_id });
}

async function videoMedia(req: Request, ip: string): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") return jsonError("method", 405);
  const db = adminClient();
  const rate = await bumpRateLimit(db, `video-media:${ip}`, 120);
  if (!rate.ok) return jsonError("잠시 후 다시 시도해 주세요.", 429);
  const ticket = new URL(req.url).searchParams.get("ticket") || "";
  const payload = await verifyMediaTicket(ticket, driveKey());
  if (!payload) return jsonError("재생 권한이 만료되었습니다. 다시 열어 주세요.", 401);
  const { data: ev } = await db.from("events").select("*").eq("id", payload.eventId).eq("host_id", payload.hostId).maybeSingle();
  if (!ev) return jsonError("행사를 찾을 수 없습니다.", 404);
  const { data: host } = await db.from("hosts").select("*").eq("id", payload.hostId).maybeSingle();
  if (!host) return jsonError("호스트를 찾을 수 없습니다.", 404);
  const access = await hostAccessToken(host as HostRow);
  const range = req.headers.get("range") || req.headers.get("Range");
  const upstream = await driveMedia(access, payload.fileId, range);
  const headers = new Headers();
  const pass = ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"];
  for (const h of pass) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has("Accept-Ranges")) headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, max-age=60");
  if (req.method === "HEAD") {
    return new Response(null, { status: upstream.status, headers });
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

async function driveDisconnect(req: Request, ip: string): Promise<Response> {
  if (req.method !== "POST") return jsonError("method", 405);
  const auth = await requireHost(req);
  if (auth instanceof Response) return auth;
  const rate = await bumpRateLimit(auth.db, `drive-disconnect:${auth.host.id}:${ip}`, 10);
  if (!rate.ok) return jsonError("잠시 후 다시 시도해 주세요.", 429);
  const { error } = await auth.db.from("hosts").update({
    google_refresh_enc: null,
    google_email: null,
    google_connected_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", auth.host.id);
  if (error) return jsonError("연결을 해제하지 못했습니다.", 500);
  return jsonOk({});
}
