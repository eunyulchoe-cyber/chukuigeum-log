export const MAX_VIDEO_BYTES = 150 * 1024 * 1024;
export const ALLOWED_MIME = new Set([
  "video/webm",
  "video/mp4",
  "video/quicktime",
  "video/ogg",
  "video/x-matroska",
]);

export const PRODUCTION_ORIGIN = "https://eunyulchoe-cyber.github.io";
export const APP_BASE_PATH = "/chukuigeum-log/";

export const DEFAULT_ALLOWED_ORIGINS = [
  PRODUCTION_ORIGIN,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:8787",
  "http://127.0.0.1:8787",
];

export function allowedOrigins(extra?: string): string[] {
  const list = [...DEFAULT_ALLOWED_ORIGINS];
  if (extra && extra.startsWith("http") && !list.includes(extra)) list.push(extra.replace(/\/$/, ""));
  return list;
}

export function pickAllowedOrigin(requestOrigin: string | null, extra?: string): string | null {
  if (!requestOrigin) return PRODUCTION_ORIGIN;
  const origin = requestOrigin.trim();
  return allowedOrigins(extra).includes(origin) ? origin : null;
}

export function isAllowedMime(mime: string): boolean {
  const base = mime.split(";")[0].trim().toLowerCase();
  if (ALLOWED_MIME.has(base)) return true;
  return base.startsWith("video/") && !base.includes("x-flv") && base !== "video/mp2t";
}

export function isWithinSize(size: number, max = MAX_VIDEO_BYTES): boolean {
  return Number.isFinite(size) && size > 0 && size <= max;
}

/** Event-day window: Seoul calendar date, plus grace until 04:00 the next morning. */
export function isEventDay(eventDate: string, now: Date = new Date(), timeZone = "Asia/Seoul"): boolean {
  const ev = eventDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ev)) return false;
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const today = fmt.format(now);
  if (today === ev) return true;
  const hourFmt = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hour12: false, hourCycle: "h23" });
  const hour = Number(hourFmt.format(now));
  const yday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterday = fmt.format(yday);
  return yesterday === ev && hour < 4;
}

export function eventExpiryIso(eventDate: string, timeZone = "Asia/Seoul"): string {
  // 04:00 Seoul time the morning after the event date.
  const ev = eventDate.slice(0, 10);
  // Construct a UTC instant: Seoul is UTC+9, 04:00 next day = 19:00 UTC on event date.
  const [y, m, d] = ev.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1, 19, 0, 0));
  if (timeZone !== "Asia/Seoul") {
    // Fallback: 28 hours after start of event date UTC midnight — not used in prod.
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) + 28 * 3600 * 1000).toISOString();
  }
  return next.toISOString();
}

export function sanitizeFolderLabel(raw: string | undefined, fallback: string): string {
  const cleaned = (raw ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  const label = cleaned.slice(0, 80) || fallback;
  return `축의금 로그 · ${label}`;
}

export function fileNameForGuest(guestId: string, mime: string): string {
  const ext = mime.includes("mp4") ? "mp4" : mime.includes("quicktime") ? "mov" : mime.includes("ogg") ? "ogv" : "webm";
  const safe = guestId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "guest";
  return `영상편지-${safe}.${ext}`;
}

export async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(prefix: string, bytes = 32): string {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let out = prefix;
  for (const b of raw) out += chars[b % 64];
  return out;
}

export function jsonError(message: string, status: number, extra?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ ok: false, error: message, ...extra }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export function jsonOk(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify({ ok: true, ...body }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
