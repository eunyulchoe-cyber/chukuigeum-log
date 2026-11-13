import { chromium } from "playwright-core";
import fs from "fs";
import path from "path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8787";
const shots = "/workspace/chukuigeum-app/shots";
fs.mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
  ],
});

async function addSecondCamera(context) {
  await context.addInitScript(() => {
    const media = navigator.mediaDevices;
    const origEnum = media.enumerateDevices.bind(media);
    media.enumerateDevices = async () => {
      const list = await origEnum();
      const videos = list.filter((d) => d.kind === "videoinput");
      if (videos.length >= 2) return list;
      return [
        ...list,
        {
          deviceId: "fake-environment",
          kind: "videoinput",
          label: "Fake Environment Camera",
          groupId: "fake-env-group",
          toJSON() {
            return this;
          },
        },
      ];
    };
  });
}

async function clickPin(page, digits) {
  for (const d of digits.split("")) {
    await page.locator(".key", { hasText: new RegExp(`^${d}$`) }).click();
  }
}

async function createEventAndGuest(page) {
  await page.goto(BASE);
  await page.getByText("마음장부").first().waitFor();
  const create = page.getByRole("link", { name: /행사 만들기|첫 행사 만들기/ }).first();
  await create.click();
  await page.getByRole("button", { name: "결혼", exact: true }).click();
  await page.getByPlaceholder("예: 김민준 · 김서연 결혼식").fill("김민준 · 김서연 결혼식");
  await page.getByRole("button", { name: "다음, 관리자 비밀번호" }).click();
  await page.getByText("관리자 비밀번호를 정하세요").waitFor();
  await clickPin(page, "1234");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByText("한 번 더 입력해 주세요").waitFor();
  await clickPin(page, "1234");
  await page.getByRole("button", { name: "행사 만들기", exact: true }).click();
  await page.getByPlaceholder("손님 이름").waitFor();
  await page.getByPlaceholder("손님 이름").fill("이서준");
  await page.locator(".pad-grid").first().locator(".pad").first().click();
  await page.locator(".pad-grid").nth(1).locator(".pad").first().click();
  await page.locator("button.confirm").click();
  await page.getByText("이서준").first().waitFor();
}

async function waitPreview(page) {
  await page.locator(".cam-preview video").waitFor({ state: "visible", timeout: 15000 });
  await page.waitForFunction(() => {
    const v = document.querySelector(".cam-preview video");
    return v && v.readyState >= 2 && v.videoWidth > 0;
  }).catch(() => undefined);
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.evaluate(() => {
    document.querySelectorAll(".undo-bar, .toast").forEach((el) => el.remove());
  });
  await page.waitForTimeout(400);
}

async function shot(page, file) {
  const dest = path.join(shots, file);
  await page.screenshot({ path: dest, type: "png", fullPage: false });
  console.log("shot", file, fs.statSync(dest).size);
}

// Guest phone (portrait)
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
await addSecondCamera(phone);
const guest = await phone.newPage();
guest.setDefaultTimeout(20000);
await guest.goto(
  `${BASE}/#/u/shot-wedding?tone=celebration&type=${encodeURIComponent("결혼")}&name=${encodeURIComponent("김민준 · 김서연 결혼식")}`,
);
await guest.getByText("결혼을 축하하는 영상을 남겨 주세요").first().waitFor();
await waitPreview(guest);
await guest.getByRole("button", { name: "카메라 전환" }).waitFor({ state: "visible" });
await shot(guest, "cam-guest-phone.png");

await guest.getByRole("button", { name: "촬영" }).click();
await guest.getByText("누르면 촬영이 끝납니다").waitFor();
await guest.waitForTimeout(800);
await shot(guest, "cam-guest-recording.png");
await guest.getByRole("button", { name: "촬영 끝내기" }).click();
await guest.getByRole("button", { name: "드라이브로 보내기" }).waitFor();
await waitPreview(guest).catch(() => undefined);
await shot(guest, "cam-guest-review.png");
await phone.close();

// Tablet filming modal on a phone (the reported case)
const phoneTab = await browser.newContext({
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
await addSecondCamera(phoneTab);
const phoneTabPage = await phoneTab.newPage();
phoneTabPage.setDefaultTimeout(25000);
await createEventAndGuest(phoneTabPage);
await phoneTabPage.getByRole("button", { name: "태블릿으로 촬영" }).click();
await phoneTabPage.getByText("태블릿 촬영").waitFor();
await waitPreview(phoneTabPage);
await phoneTabPage.getByRole("button", { name: "카메라 전환" }).waitFor({ state: "visible" });
await shot(phoneTabPage, "cam-tablet-modal-phone.png");
await phoneTab.close();

// Tablet modal on a tablet viewport
const tablet = await browser.newContext({
  viewport: { width: 1180, height: 820 },
  deviceScaleFactor: 2,
  locale: "ko-KR",
  timezoneId: "Asia/Seoul",
  permissions: ["camera", "microphone"],
});
await addSecondCamera(tablet);
const tabPage = await tablet.newPage();
tabPage.setDefaultTimeout(25000);
await createEventAndGuest(tabPage);
await tabPage.getByRole("button", { name: "태블릿으로 촬영" }).click();
await tabPage.getByText("태블릿 촬영").waitFor();
await waitPreview(tabPage);
await shot(tabPage, "cam-tablet-modal.png");
await tablet.close();

await browser.close();
console.log("cam-shots: done");
