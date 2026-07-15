import { chromium } from "playwright";

const BASE = process.env.PLAYTEST_URL ?? "http://127.0.0.1:5210/OnyxLabyrinth/?debug=1";
const OUT = process.argv[2] ?? "/tmp/arena-check.png";

async function wait(ms) {
  await new Promise((r) => setTimeout(r, ms));
}
async function press(page, key, times = 1) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    await wait(70);
  }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
await page.goto(BASE, { waitUntil: "networkidle" });
await wait(400);
await press(page, "a");
await wait(350);
await press(page, "Enter");
await wait(900);
for (let i = 0; i < 8; i++) {
  const mode = await page.evaluate(() => window.__onyxDebug?.state?.mode);
  if (mode === "combat") break;
  await wait(250);
}
await wait(500);
const canvas = await page.$("#combat-canvas");
if (canvas) {
  await canvas.screenshot({ path: OUT });
} else {
  await page.screenshot({ path: OUT });
}
console.log("saved", OUT);
await browser.close();
