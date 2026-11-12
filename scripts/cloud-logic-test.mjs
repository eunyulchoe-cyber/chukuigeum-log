import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = "/tmp/chukuigeum-logic";

function build(entry, outfile) {
  const r = spawnSync(
    "npx",
    ["--yes", "esbuild", entry, "--bundle", "--format=esm", "--platform=neutral", `--outfile=${outfile}`],
    { encoding: "utf8", cwd: root },
  );
  if (r.status !== 0) {
    throw new Error(`esbuild failed: ${r.stderr || r.stdout}`);
  }
}

build(path.join(root, "supabase/functions/_shared/logic.ts"), path.join(outDir, "logic.mjs"));
build(path.join(root, "supabase/functions/_shared/crypto.ts"), path.join(outDir, "crypto.mjs"));

const logic = await import(path.join(outDir, "logic.mjs"));
const cryptoMod = await import(path.join(outDir, "crypto.mjs"));

// Event day: Seoul
function seoulDate(isoUtc) {
  return new Date(isoUtc);
}

assert.equal(logic.isAllowedMime("video/webm"), true);
assert.equal(logic.isAllowedMime("video/webm;codecs=vp9,opus"), true);
assert.equal(logic.isAllowedMime("video/mp4"), true);
assert.equal(logic.isAllowedMime("application/pdf"), false);
assert.equal(logic.isAllowedMime("image/jpeg"), false);

assert.equal(logic.isWithinSize(1), true);
assert.equal(logic.isWithinSize(150 * 1024 * 1024), true);
assert.equal(logic.isWithinSize(150 * 1024 * 1024 + 1), false);
assert.equal(logic.isWithinSize(0), false);

// 2026-11-12 15:00 Seoul = 2026-11-12 06:00Z
assert.equal(logic.isEventDay("2026-11-12", seoulDate("2026-11-12T06:00:00Z")), true);
// 2026-11-13 03:00 Seoul = 2026-11-12 18:00Z — grace period
assert.equal(logic.isEventDay("2026-11-12", seoulDate("2026-11-12T18:00:00Z")), true);
// 2026-11-13 05:00 Seoul = 2026-11-12 20:00Z — after grace
assert.equal(logic.isEventDay("2026-11-12", seoulDate("2026-11-12T20:00:00Z")), false);
assert.equal(logic.isEventDay("2026-11-11", seoulDate("2026-11-12T06:00:00Z")), false);

assert.equal(logic.pickAllowedOrigin("https://eunyulchoe-cyber.github.io"), "https://eunyulchoe-cyber.github.io");
assert.equal(logic.pickAllowedOrigin("https://evil.example"), null);
assert.equal(logic.pickAllowedOrigin("http://localhost:5173"), "http://localhost:5173");

const label = logic.sanitizeFolderLabel("김민준 / 김서연 *결혼식*", "abc");
assert.match(label, /축의금 로그/);
assert.doesNotMatch(label, /[\\/:*?"<>|]/);

const hex = await logic.sha256Hex("chg_up_test");
assert.equal(hex.length, 64);

const key = "a".repeat(64);
const packed = await cryptoMod.encryptString("refresh-token-value", key);
assert.notEqual(packed, "refresh-token-value");
assert.equal(await cryptoMod.decryptString(packed, key), "refresh-token-value");

const ticket = await cryptoMod.issueMediaTicket({ hostId: "h1", eventId: "e1", fileId: "f1" }, key, 60);
const parsed = await cryptoMod.verifyMediaTicket(ticket, key);
assert.equal(parsed.hostId, "h1");
assert.equal(parsed.fileId, "f1");
assert.equal(await cryptoMod.verifyMediaTicket(ticket + "x", key), null);

// Mock Drive resumable session: origin is recorded by the initiator (server),
// browser PUTs chunks with Content-Range. We simulate the happy path used by the guest page.
const fileId = "mock-file-1";
const bodyParts = [];
const server = createServer((req, res) => {
  if (req.method === "PUT") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      bodyParts.push(Buffer.concat(chunks));
      const range = req.headers["content-range"] || "";
      const m = range.match(/bytes \d+-(\d+)\/(\d+)/);
      const last = m ? Number(m[1]) : 0;
      const total = m ? Number(m[2]) : 0;
      if (last + 1 < total) {
        res.statusCode = 308;
        res.end();
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ id: fileId }));
    });
    return;
  }
  res.statusCode = 405;
  res.end();
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();
const sessionUrl = `http://127.0.0.1:${port}/upload`;

// Use the same chunked PUT as src/lib/cloud.ts putResumable
async function putResumable(url, blob) {
  const chunk = 8 * 256 * 1024;
  const total = blob.size;
  let offset = 0;
  let id = "";
  while (offset < total) {
    const end = Math.min(offset + chunk, total);
    const slice = blob.slice(offset, end);
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": blob.type || "video/webm",
        "Content-Range": `bytes ${offset}-${end - 1}/${total}`,
      },
      body: slice,
    });
    if (res.status === 308) {
      offset = end;
      continue;
    }
    if (!res.ok) throw new Error("upload failed " + res.status);
    const data = await res.json();
    id = data.id;
    offset = end;
  }
  return id;
}

const payload = new Blob([new Uint8Array(3 * 1024 * 1024).fill(7)], { type: "video/webm" });
const got = await putResumable(sessionUrl, payload);
assert.equal(got, fileId);
assert.equal(Buffer.concat(bodyParts).length, payload.size);
server.close();

console.log("cloud-logic-test: all passed");
