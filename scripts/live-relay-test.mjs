import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".secrets/supabase.env");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const base = env.SUPABASE_URL;
const anon = env.SUPABASE_ANON_KEY;
if (!base || !anon) throw new Error("missing public supabase config");

const headers = {
  apikey: anon,
  Authorization: `Bearer ${anon}`,
  "Content-Type": "application/json",
  Origin: "https://eunyulchoe-cyber.github.io",
};

async function call(name, { method = "POST", body, hostSecret, expect } = {}) {
  const h = { ...headers };
  if (hostSecret) h["x-host-key"] = hostSecret;
  const res = await fetch(`${base}/functions/v1/${name}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 200) }; }
  if (expect && res.status !== expect) {
    throw new Error(`${name} expected ${expect} got ${res.status}: ${text.slice(0, 400)}`);
  }
  return { status: res.status, data, cors: res.headers.get("access-control-allow-origin") };
}

// CORS preflight
{
  const res = await fetch(`${base}/functions/v1/host-bootstrap`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://eunyulchoe-cyber.github.io",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type,apikey,authorization,x-host-key",
    },
  });
  assert.ok(res.status === 204 || res.status === 200, "preflight status " + res.status);
  assert.equal(res.headers.get("access-control-allow-origin"), "https://eunyulchoe-cyber.github.io");
  console.log("preflight ok");
}

const boot = await call("host-bootstrap", { body: {}, expect: 200 });
assert.equal(boot.data.ok, true);
assert.ok(boot.data.hostId);
assert.ok(String(boot.data.hostSecret).startsWith("chg_host_"));
assert.equal(boot.data.googleConnected, false);
const hostId = boot.data.hostId;
const hostSecret = boot.data.hostSecret;
console.log("host-bootstrap ok, id prefix", hostId.slice(0, 8));

const reuse = await call("host-bootstrap", { body: { hostId, hostSecret }, expect: 200 });
assert.equal(reuse.data.reused, true);
assert.equal(reuse.data.hostId, hostId);
console.log("host-bootstrap reuse ok");

const status = await call("drive-status", { body: {}, hostSecret, expect: 200 });
assert.equal(status.data.googleConnected, false);
assert.equal(status.data.googleConfigured, false);
assert.ok(status.data.oauthRedirectUri === null || typeof status.data.oauthRedirectUri === "string");
console.log("drive-status ok, googleConfigured=false");

const oauth = await call("google-oauth-start", { body: { returnPath: "#/e/test/admin" }, hostSecret, expect: 503 });
assert.equal(oauth.data.ok, false);
assert.match(String(oauth.data.error), /구글/);
assert.equal(oauth.data.code, "google_not_configured");
assert.equal(
  oauth.data.redirectUri,
  `${base}/functions/v1/google-oauth-callback`,
);
console.log("oauth-start correctly blocked until Google client is set");

const eventId = "evt_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
const ev = await call("event-register", {
  hostSecret,
  body: { eventId, eventDate: "2026-11-12", folderLabel: "테스트 행사" },
  expect: 200,
});
assert.equal(ev.data.folderReady, false);
assert.equal(ev.data.googleConnected, false);
console.log("event-register without drive ok, folderReady=false");

const tok = await call("token-issue", {
  hostSecret,
  body: { eventId, guestId: "gst_" + "a".repeat(12) },
  expect: 409,
});
assert.match(String(tok.data.error), /드라이브|폴더/);
console.log("token-issue blocked without folder");

const bad = await call("upload-init", { body: { token: "chg_up_notarealtokenvalue000000000000", mime: "video/webm", size: 1000 }, expect: 401 });
assert.match(String(bad.data.error), /코드|만료/);
console.log("upload-init rejects bad token");

const pdf = await call("upload-init", { body: { token: "chg_up_notarealtokenvalue000000000000", mime: "application/pdf", size: 1000 }, expect: 400 });
assert.match(String(pdf.data.error), /영상/);
console.log("upload-init rejects non-video mime");

// Anon must not read host table
const rest = await fetch(`${base}/rest/v1/hosts?select=id`, {
  headers: { apikey: anon, Authorization: `Bearer ${anon}` },
});
const restText = await rest.text();
assert.ok(rest.status === 401 || rest.status === 403 || restText === "[]" || /permission|denied|RLS/i.test(restText) || rest.status >= 400, "unexpected rest access " + rest.status + " " + restText.slice(0, 200));
console.log("anon table access blocked or empty, status", rest.status);

console.log("live-relay-test: all passed");
