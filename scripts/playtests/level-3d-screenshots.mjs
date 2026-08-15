import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.ONYX_LEVEL_3D_URL ??
  "http://127.0.0.1:5176/OnyxLabyrinth/tools/level-3d.html";
const outputDir = process.env.ONYX_LEVEL_3D_OUTPUT ?? "output/playwright/level-3d";
mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const browserErrors = [];
page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.stack ?? error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
});
page.on("requestfailed", (request) => {
  browserErrors.push(`request: ${request.url()} — ${request.failure()?.errorText ?? "failed"}`);
});

for (const floor of [1, 2, 3, 4, 5]) {
  await page.goto(`${baseUrl}?floor=${floor}`, { waitUntil: "networkidle" });
  await page.locator("#loading-status").waitFor({ state: "hidden", timeout: 30_000 });
  const transparentCeilings = page.locator("#transparent-ceilings");
  if (await transparentCeilings.isDisabled()) {
    throw new Error(`transparent ceilings control is disabled on Floor ${floor}`);
  }
  await transparentCeilings.check();
  if (!(await transparentCeilings.isChecked())) {
    throw new Error(`transparent ceilings control did not check on Floor ${floor}`);
  }
  await transparentCeilings.uncheck();
  await page.locator("#camera-top").click();
  await page.locator("#show-ceilings").uncheck();
  await page.screenshot({ path: join(outputDir, `floor${floor}-top.png`) });

  await page.locator("#show-ceilings").check();
  await page.locator("#camera-iso").click();
  await page.screenshot({ path: join(outputDir, `floor${floor}-isometric.png`) });

  await page.locator("#camera-reset").click();
  await page.locator("#show-ceilings").uncheck();
  const canvas = page.locator("#level-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("3D viewer canvas has no layout box");
  await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.48);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.68, box.y + box.height * 0.52, { steps: 8 });
  await page.mouse.up();
  await page.screenshot({ path: join(outputDir, `floor${floor}-interior.png`) });
}

await browser.close();
if (browserErrors.length > 0) {
  throw new Error(`3D viewer browser errors:\n${browserErrors.join("\n")}`);
}
console.log(`Wrote deterministic Floor 1–5 3D captures to ${outputDir}`);
