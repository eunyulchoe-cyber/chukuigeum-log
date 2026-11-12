import { chromium } from "/home/box/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
import fs from "fs";
import path from "path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8787";
const shots = "/workspace/chukuigeum-app/shots";
fs.mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({
  channel: "chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
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

await page.goto(BASE);
await page.getByText("마음장부").first().waitFor();
const create = page.getByRole("link", { name: /행사 만들기|첫 행사 만들기/ }).first();
await create.click();
await page.getByPlaceholder("예: 김민준 · 김서연 결혼식").fill("김민준 · 김서연 결혼식");
await page.getByRole("button", { name: "결혼", exact: true }).click();
await page.getByRole("button", { name: "다음, 관리자 비밀번호" }).click();
await page.getByText("관리자 비밀번호를 정하세요").waitFor();
await clickPin(page, "1234");
await page.getByRole("button", { name: "다음", exact: true }).click();
await page.getByText("한 번 더 입력해 주세요").waitFor();
await clickPin(page, "1234");
await page.getByRole("button", { name: "행사 만들기", exact: true }).click();
await page.getByPlaceholder("손님 이름").waitFor();

async function addGuest(name, relation, amountLabel) {
  await page.getByPlaceholder("손님 이름").fill(name);
  await page.locator("section.card button.pad", { hasText: new RegExp(`^${relation}$`) }).click();
  await page.locator("section.card button.pad", { hasText: new RegExp(`^${amountLabel}$`) }).click();
  await page.locator("button.confirm").click();
}

await addGuest("이수현", "친구", "10만");
await page.getByText("1건").waitFor();
await addGuest("박준호", "회사", "30만");
await page.getByText("2건").waitFor();
await addGuest("정하윤", "신랑측", "50만");
await page.getByText("3건").waitFor();
await addGuest("최은지", "친척", "20만");
await page.getByText("4건").waitFor();

await page.getByPlaceholder("손님 이름").fill("홍길동");
await page.locator("section.card button.pad", { hasText: /^친구$/ }).click();
await page.locator("section.card button.pad", { hasText: /^10만$/ }).click();
await page.getByText("홍길동 · 친구 · 100,000원").waitFor();
await page.locator(".toast").waitFor({ state: "detached", timeout: 4000 }).catch(() => {});

await page.evaluate(async () => {
  await document.fonts.ready;
  const live = document.querySelector(".undo-bar");
  if (live && !document.getElementById("frozen-undo")) {
    const clone = live.cloneNode(true);
    clone.id = "frozen-undo";
    const span = clone.querySelector("span");
    if (span) span.textContent = span.textContent.replace(/\d+초/, "3초");
    const track = clone.querySelector(".undo-track");
    if (track) track.style.width = "60%";
    live.style.display = "none";
    document.body.appendChild(clone);
  }
  document.querySelectorAll(".toast").forEach((el) => el.remove());
});

for (const id of ["a", "b", "c"]) {
  await page.evaluate((theme) => {
    document.documentElement.setAttribute("data-theme", theme);
  }, id);
  await page.waitForTimeout(250);
  const dest = path.join(shots, `theme-${id}.png`);
  await page.screenshot({ path: dest, type: "png" });
  const st = fs.statSync(dest);
  console.log("shot", dest, st.size);
}

await browser.close();
console.log("THEME SHOTS DONE");
