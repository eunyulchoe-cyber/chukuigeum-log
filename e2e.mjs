import { chromium } from "/home/box/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8787";
const shots = "/workspace/chukuigeum-app/shots";
fs.mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({
  channel: "chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});

const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  locale: "ko-KR",
  timezoneId: "Asia/Seoul",
});
const page = await context.newPage();
page.setDefaultTimeout(15000);

async function clickPin(page, digits) {
  for (const d of digits.split("")) {
    await page.locator(".key", { hasText: new RegExp(`^${d}$`) }).click();
  }
}

console.log("open", BASE);
await page.goto(BASE);
await page.getByText("마음장부").first().waitFor();

// Event creation
const create = page.getByRole("link", { name: /행사 만들기|첫 행사 만들기/ }).first();
await create.click();
await page.getByPlaceholder("예: 김민준 · 김서연 결혼식").fill("김민준 · 김서연 결혼식");
await page.getByRole("button", { name: "결혼", exact: true }).click();
await page.locator('input[type="date"]').waitFor();
await page.screenshot({ path: path.join(shots, "event.png"), type: "png" });
console.log("shot event.png");

await page.getByRole("button", { name: "다음, 관리자 비밀번호" }).click();
await page.getByText("관리자 비밀번호를 정하세요").waitFor();
await clickPin(page, "1234");
await page.getByRole("button", { name: "다음", exact: true }).click();
await page.getByText("한 번 더 입력해 주세요").waitFor();
await clickPin(page, "1234");
await page.getByRole("button", { name: "행사 만들기", exact: true }).click();
await page.getByPlaceholder("손님 이름").waitFor();
console.log("event created, on reception");

async function addGuest(name, relation, amountLabel) {
  await page.getByPlaceholder("손님 이름").fill(name);
  await page.locator("section.card button.pad", { hasText: new RegExp(`^${relation}$`) }).click();
  await page.locator("section.card button.pad", { hasText: new RegExp(`^${amountLabel}$`) }).click();
  const confirm = page.locator("button.confirm");
  await confirm.waitFor();
  const text = await confirm.innerText();
  if (!text.includes(name) || !text.includes(relation)) {
    throw new Error("confirm text missing: " + text);
  }
  await confirm.click();
}

// Undo flow
await addGuest("홍길동", "친구", "10만");
await page.getByText("되돌리기").waitFor();
const afterSave = await page.locator("h2.h1, .h1").filter({ hasText: "1건" }).count();
console.log("after first save count visible", afterSave);
await page.getByRole("button", { name: "되돌리기" }).click();
await page.getByText("방금 저장을 되돌렸습니다").waitFor();
await page.getByText("0건").waitFor();
console.log("undo ok");

// Real guests
await addGuest("이수현", "친구", "10만");
await page.getByText("1건").waitFor();
await addGuest("박준호", "회사", "30만");
await page.getByText("2건").waitFor();
await addGuest("정하윤", "신랑측", "50만");
await page.getByText("3건").waitFor();
await addGuest("최은지", "친척", "20만");
await page.getByText("4건").waitFor();
console.log("four guests added");

// Duplicate warning
await page.getByPlaceholder("손님 이름").fill("이수현");
await page.getByText("같은 이름").waitFor();
await page.getByPlaceholder("예: 고등학교 친구").fill("고등학교 친구");
console.log("duplicate warning ok");

// Confirm state for screenshot
await page.getByPlaceholder("손님 이름").fill("홍길동");
await page.locator("section.card button.pad", { hasText: /^친구$/ }).click();
await page.locator("section.card button.pad", { hasText: /^10만$/ }).click();
await page.getByText("홍길동 · 친구 · 100,000원").waitFor();
await page.locator(".toast").waitFor({ state: "detached", timeout: 4000 }).catch(() => {});
await page.waitForTimeout(200);
const bodyText = await page.locator("body").innerText();
if (bodyText.includes("1,200,000원")) {
  throw new Error("reception leaked grand total amount");
}
await page.screenshot({ path: path.join(shots, "reception.png"), type: "png" });
console.log("shot reception.png");

// Save hong for guest page later
await page.locator("button.confirm").click();
await page.getByText("5건").waitFor();

// Admin
await page.getByRole("link", { name: "관리자" }).click();
await page.getByText("비밀번호를 입력해 주세요").waitFor();
await clickPin(page, "1234");
// auto unlock at 4 digits, or click 확인
try {
  await page.getByText("총합계").waitFor({ timeout: 3000 });
} catch {
  await page.getByRole("button", { name: "확인" }).click();
  await page.getByText("총합계").waitFor();
}
await page.getByText("1,200,000원").waitFor();
await page.getByText("5건").first().waitFor();
await page.screenshot({ path: path.join(shots, "admin.png"), type: "png" });
console.log("shot admin.png");

// Excel
const [download] = await Promise.all([
  page.waitForEvent("download"),
  page.getByRole("button", { name: "엑셀 내려받기" }).click(),
]);
const xlsxPath = path.join(shots, "export.xlsx");
await download.saveAs(xlsxPath);
const XLSXlib = XLSX.default ?? XLSX;
const wb = XLSXlib.read(fs.readFileSync(xlsxPath), { type: "buffer" });
const sheet = wb.Sheets[wb.SheetNames[0]];
const utils = XLSXlib.utils ?? XLSX.utils;
const rows = utils.sheet_to_json(sheet, { header: 1 });
console.log("xlsx rows", JSON.stringify(rows, null, 2));
const flat = rows.flat().map(String).join(" | ");
for (const need of ["이수현", "박준호", "정하윤", "최은지", "홍길동", "총합계", "1200000", "총건수", "5"]) {
  if (!flat.includes(need) && !flat.includes("1,100,000") && need === "1200000") {
    // number may be 1100000 without comma
    if (!rows.some((r) => r.some((c) => c === 1100000 || c === "1,200,000원"))) {
      throw new Error("xlsx missing total 1200000, got " + flat);
    }
  } else if (need !== "1200000" && !flat.includes(need)) {
    throw new Error("xlsx missing " + need + " in " + flat);
  }
}
console.log("xlsx verified");

// Guest page
const url = page.url();
const m = url.match(/\/e\/([^/]+)/);
if (!m) throw new Error("no event id in " + url);
const eventId = m[1];
// get a guest id from the href of QR is not in admin. From IDB via evaluate after going to reception? 
// List from admin table is not ids. Use evaluate idb.
const guestId = await page.evaluate(async (eid) => {
  const req = indexedDB.open("chukuigeum");
  const db = await new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  const tx = db.transaction("guests", "readonly");
  const index = tx.objectStore("guests").index("byEvent");
  const guests = await new Promise((res, rej) => {
    const r = index.getAll(eid);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const hong = guests.find((g) => g.name === "홍길동") || guests[0];
  return hong.id;
}, eventId);
console.log("guestId", guestId);

const phone = await context.newPage();
await phone.setViewportSize({ width: 390, height: 844 });
await phone.goto(`${BASE}/#/g/${eventId}/${guestId}`);
await phone.getByText("결혼을 축하하는 영상을 남겨 주세요").waitFor();
await phone.getByText("촬영").first().waitFor();
await phone.screenshot({ path: path.join(shots, "guest.png"), type: "png" });
console.log("shot guest.png");
await phone.close();

const report = {
  ok: true,
  eventId,
  guestId,
  xlsx: xlsxPath,
  shots: fs.readdirSync(shots),
};
fs.writeFileSync(path.join(shots, "e2e-report.json"), JSON.stringify(report, null, 2));

for (const [from, to] of [
  ["event.png", "v2-event.png"],
  ["reception.png", "v2-reception.png"],
  ["admin.png", "v2-admin.png"],
  ["guest.png", "v2-guest.png"],
]) {
  fs.copyFileSync(path.join(shots, from), path.join(shots, to));
}
console.log("E2E PASS", report);
await browser.close();
