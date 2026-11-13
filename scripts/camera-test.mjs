import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, ".tmp-camera-test");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.copyFileSync(path.join(root, "src/lib/camera.ts"), path.join(dir, "camera.ts"));

const tsc = path.join(root, "node_modules/.bin/tsc");
const res = spawnSync(tsc, [
  "camera.ts",
  "--outDir", dir,
  "--rootDir", dir,
  "--module", "es2022",
  "--target", "es2022",
  "--moduleResolution", "bundler",
  "--skipLibCheck",
  "--lib", "es2022,dom",
  "--ignoreConfig",
], { cwd: dir, encoding: "utf8" });
if (res.status !== 0) {
  console.error(res.stdout, res.stderr);
  process.exit(res.status ?? 1);
}

const cam = await import(pathToFileURL(path.join(dir, "camera.js")).href);

assert.equal(cam.screenOrient(), "portrait");

const p = cam.videoConstraints("user", { orient: "portrait" });
assert.equal(p.width.ideal, 960);
assert.equal(p.height.ideal, 1280);
assert.ok(Math.abs(p.aspectRatio.ideal - 3 / 4) < 1e-9);
assert.deepEqual(p.facingMode, { ideal: "user" });

const l = cam.videoConstraints("environment", { orient: "landscape", deviceId: "abc" });
assert.equal(l.width.ideal, 1280);
assert.equal(l.height.ideal, 720);
assert.ok(Math.abs(l.aspectRatio.ideal - 16 / 9) < 1e-9);
assert.deepEqual(l.deviceId, { exact: "abc" });
assert.equal(l.facingMode, undefined);

const sizeP = cam.frameSize("portrait");
assert.deepEqual(sizeP, { width: 960, height: 1280 });

// Landscape 16:9 source into 3:4 portrait dest → crop sides, keep full height
const side = cam.coverSourceRect(1920, 1080, 960, 1280);
assert.equal(side.sy, 0);
assert.equal(side.sh, 1080);
assert.ok(Math.abs(side.sw - 1080 * (960 / 1280)) < 0.01);
assert.ok(Math.abs(side.sx - (1920 - side.sw) / 2) < 0.01);

// Taller source into 3:4 dest → crop top/bottom, keep full width (this was cutting the chin in a short 16:9 box)
const tall = cam.coverSourceRect(1080, 1920, 960, 1280);
assert.equal(tall.sx, 0);
assert.equal(tall.sw, 1080);
assert.ok(Math.abs(tall.sh - 1080 / (960 / 1280)) < 0.01);
assert.ok(Math.abs(tall.sy - (1920 - tall.sh) / 2) < 0.01);
// The face stays vertically centered, not pinned to the bottom
assert.ok(tall.sy > 0);

// Matching aspect → no crop
const same = cam.coverSourceRect(960, 1280, 960, 1280);
assert.deepEqual(same, { sx: 0, sy: 0, sw: 960, sh: 1280 });

assert.match(cam.cameraErrorMessage({ name: "NotAllowedError" }), /권한/);
assert.match(cam.cameraErrorMessage({ name: "OverconstrainedError" }), /전환/);

const devices = [
  { kind: "videoinput", deviceId: "front1", label: "Front Camera" },
  { kind: "videoinput", deviceId: "back1", label: "Back Camera" },
];
const mediaDevices = { enumerateDevices: async () => devices };
if (typeof globalThis.navigator === "undefined") {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices } });
} else {
  Object.defineProperty(globalThis.navigator, "mediaDevices", { configurable: true, value: mediaDevices });
}
assert.equal(await cam.findCameraId("user"), "front1");
assert.equal(await cam.findCameraId("environment"), "back1");
assert.equal(await cam.findCameraId("environment", "back1"), "front1");

fs.rmSync(dir, { recursive: true, force: true });
console.log("camera-test: ok");
