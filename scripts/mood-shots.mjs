import { chromium } from "playwright-core";
import fs from "fs";
import path from "path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8787";
const shots = "/workspace/chukuigeum-app/shots";
fs.mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});

async function clickPin(page, digits) {
  for (const d of digits.split("")) {
    await page.locator(".key", { hasText: new RegExp(`^${d}$`) }).click();
  }
}

async function createEvent(page, { name, typeName, placeholder }) {
  await page.goto(BASE);
  await page.getByText("마음장부").first().waitFor();
  const create = page.getByRole("link", { name: /행사 만들기|첫 행사 만들기/ }).first();
  await create.click();
  await page.getByRole("button", { name: typeName, exact: true }).click();
  await page.getByPlaceholder(placeholder).fill(name);
  await page.getByRole("button", { name: "다음, 관리자 비밀번호" }).click();
  await page.getByText("관리자 비밀번호를 정하세요").waitFor();
  await clickPin(page, "1234");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByText("한 번 더 입력해 주세요").waitFor();
  await clickPin(page, "1234");
  await page.getByRole("button", { name: "행사 만들기", exact: true }).click();
  await page.getByPlaceholder("손님 이름").waitFor();
}

async function saveGuest(page, name) {
  await page.getByPlaceholder("손님 이름").fill(name);
  await page.locator(".pad-grid").first().locator(".pad").first().click();
  await page.locator(".pad-grid").nth(1).locator(".pad").first().click();
  await page.locator("button.confirm").click();
  await page.getByText(name).first().waitFor();
}

const tablet = await browser.newContext({
  viewport: { width: 1180, height: 820 },
  deviceScaleFactor: 2,
  locale: "ko-KR",
  timezoneId: "Asia/Seoul",
});
const page = await tablet.newPage();
page.setDefaultTimeout(20000);

await createEvent(page, {
  name: "김민준 · 김서연 결혼식",
  typeName: "결혼",
  placeholder: "예: 김민준 · 김서연 결혼식",
});
await saveGuest(page, "이서준");
await page.getByText("축의금 접수").first().waitFor();
await page.evaluate(() => document.fonts && document.fonts.ready);
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(shots, "m-reception-wedding.png"), type: "png", fullPage: false });
console.log("shot m-reception-wedding.png");

await createEvent(page, {
  name: "고 김영수 님 장례",
  typeName: "장례/부의",
  placeholder: "예: 고 김민준 님 장례",
});
await saveGuest(page, "박지훈");
await page.getByText("부의금 접수").first().waitFor();
await page.evaluate(() => document.fonts && document.fonts.ready);
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(shots, "m-reception-funeral.png"), type: "png", fullPage: false });
console.log("shot m-reception-funeral.png");
await tablet.close();

const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  locale: "ko-KR",
  timezoneId: "Asia/Seoul",
  isMobile: true,
  hasTouch: true,
  permissions: ["camera", "microphone"],
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});
const phonePage = await phone.newPage();
phonePage.setDefaultTimeout(20000);

async function shotGuest(file, hash, expectText) {
  const url = `${BASE}/${hash}`;
  await phonePage.goto(url);
  await phonePage.getByText(expectText).first().waitFor();
  await phonePage.evaluate(() => document.fonts && document.fonts.ready);
  await phonePage.waitForTimeout(400);
  await phonePage.screenshot({ path: path.join(shots, file), type: "png", fullPage: false });
  console.log("shot", file);
}

await shotGuest(
  "m-guest-wedding.png",
  `#/u/shot-wedding?tone=celebration&type=${encodeURIComponent("결혼")}&name=${encodeURIComponent("김민준 · 김서연 결혼식")}`,
  "결혼을 축하하는 영상을 남겨 주세요",
);
await shotGuest(
  "m-guest-funeral.png",
  `#/u/shot-funeral?tone=mourning&type=${encodeURIComponent("부의")}&name=${encodeURIComponent("고 김영수 님 장례")}`,
  "삼가 고인의 명복을 빕니다",
);

await browser.close();
console.log("mood-shots: done");
