import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, ".tmp-copy-test");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

fs.writeFileSync(path.join(dir, "react.ts"), "export function useEffect(_fn?: unknown, _deps?: unknown) {}\n");
for (const name of ["types.ts", "format.ts", "copy.ts"]) {
  let src = fs.readFileSync(path.join(root, "src/lib", name), "utf8");
  src = src.replace(/from "react"/g, 'from "./react"').replace(/from "\.\/types"/g, 'from "./types"').replace(/from "\.\/format"/g, 'from "./format"').replace(/from "\.\/copy"/g, 'from "./copy"');
  fs.writeFileSync(path.join(dir, name), src);
}

const tsc = path.join(root, "node_modules/.bin/tsc");
const res = spawnSync(tsc, [
  "copy.ts", "types.ts", "format.ts", "react.ts",
  "--outDir", dir,
  "--rootDir", dir,
  "--module", "es2022",
  "--target", "es2022",
  "--moduleResolution", "bundler",
  "--skipLibCheck",
  "--esModuleInterop",
  "--ignoreConfig",
], { cwd: dir, encoding: "utf8" });
if (res.status !== 0) {
  console.error(res.stdout, res.stderr);
  process.exit(res.status ?? 1);
}

const copyFile = path.join(dir, "copy.js");
let code = fs.readFileSync(copyFile, "utf8");
code = code.replace(/from ["']\.\/react(?:\.ts)?["']/, 'from "./react.js"');
code = code.replace(/from ["']\.\/types(?:\.ts)?["']/, 'from "./types.js"');
fs.writeFileSync(copyFile, code);
for (const f of ["format.js", "types.js"]) {
  const p = path.join(dir, f);
  if (fs.existsSync(p)) {
    let c = fs.readFileSync(p, "utf8");
    c = c.replace(/from ["']\.\/(copy|types|format|react)(?:\.ts)?["']/g, 'from "./$1.js"');
    fs.writeFileSync(p, c);
  }
}

const copy = await import(pathToFileURL(copyFile).href);

assert.equal(copy.APP_NAME, "마음장부");
assert.equal(copy.typeLabel("칠순"), "칠순/생신");
assert.equal(copy.typeLabel("부의"), "장례/부의");
assert.equal(copy.typeLabel("기타"), "기타 경사");
assert.equal(copy.eventTone("결혼"), "celebration");
assert.equal(copy.eventTone("부의"), "mourning");

const joy = copy.copyForType("결혼");
assert.equal(joy.receptionTitle, "축의금 접수");
assert.equal(joy.amountName, "축의금");
assert.equal(joy.excelAmountHeader, "축의금");
assert.equal(joy.excelSheet, "축의금 목록");
assert.match(joy.videoShort, /축하 영상/);
assert.match(joy.guestPrompt("김민준 · 김서연 결혼식", "결혼"), /결혼을 축하하는 영상/);

const mourn = copy.copyForType("부의");
assert.equal(mourn.receptionTitle, "부의금 접수");
assert.equal(mourn.amountName, "부의금");
assert.equal(mourn.excelAmountHeader, "부의금");
assert.equal(mourn.excelSheet, "부의금 목록");
assert.equal(mourn.excelFileSuffix, "부의금목록");
assert.equal(mourn.guestPromptFallback, "삼가 고인의 명복을 빕니다");
assert.equal(mourn.guestPrompt("고 김민준 님 장례", "부의"), "삼가 고인의 명복을 빕니다");
assert.match(mourn.videoLong, /조문 영상/);
for (const [k, v] of Object.entries(mourn)) {
  const text = typeof v === "function" ? String(v("손님", "부의")) + String(v("이름")) : String(v);
  assert.doesNotMatch(text, /축하/, `mourning ${k} has 축하`);
  assert.doesNotMatch(text, /축의금/, `mourning ${k} has 축의금`);
  assert.doesNotMatch(text, /영상편지/, `mourning ${k} has 영상편지`);
}

const url = copy.appendCopyQuery("https://eunyulchoe-cyber.github.io/chukuigeum-log/#/u/tok", "부의", "고 김민준 님 장례");
assert.match(url, /#\/u\/tok\?tone=mourning/);
assert.match(url, /name=/);

assert.equal(copy.brandMonogram(), "마");
assert.equal(copy.brandMonogram("김민준 · 김서연 결혼식"), "김");

fs.rmSync(dir, { recursive: true, force: true });
console.log("copy-test: all passed");
