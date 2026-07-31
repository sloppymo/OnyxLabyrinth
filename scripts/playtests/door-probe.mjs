/**
 * Phase 3 verification: per-floor door-view hue/chroma/colour-count, measured
 * directly on the corridor canvas the same way corridor-baseline-capture.mjs
 * does. Ad hoc script, not part of the standing suite.
 *
 * Run: node scripts/playtests/door-probe.mjs
 * (assumes a dev/preview server is up at ONYX_URL)
 */
import fs from "node:fs";
import { launch, wait, jumpTo, waitForIdle, ensureAudioResumed } from "./lib.mjs";

const URL = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const POSES = JSON.parse(fs.readFileSync("scripts/playtests/corridor-poses.json", "utf8"));

const { browser, page } = await launch({ viewport: { width: 1280, height: 800 } });
await page.goto(URL, { waitUntil: "networkidle" });
await wait(400);
await ensureAudioResumed(page);

const probeCanvas = () =>
  page.evaluate(() => {
    const cv = document.querySelector("#view");
    const ctx = cv.getContext("2d");
    const { width: W, height: H } = cv;
    const d = ctx.getImageData(0, 0, W, H).data;
    const colours = new Set();
    let sumR = 0, sumG = 0, sumB = 0, sumC = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      sumR += r; sumG += g; sumB += b;
      sumC += Math.max(r, g, b) - Math.min(r, g, b);
      colours.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
    }
    const N = (d.length / 4) | 0;
    const mR = sumR / N, mG = sumG / N, mB = sumB / N;
    const mx = Math.max(mR, mG, mB), mn = Math.min(mR, mG, mB);
    let hue = 0;
    if (mx - mn > 0.5) {
      if (mx === mR) hue = 60 * (((mG - mB) / (mx - mn)) % 6);
      else if (mx === mG) hue = 60 * ((mB - mR) / (mx - mn) + 2);
      else hue = 60 * ((mR - mG) / (mx - mn) + 4);
      if (hue < 0) hue += 360;
    }
    return { hueDeg: +hue.toFixed(1), meanChroma: +(sumC / N).toFixed(2), uniqueColours: colours.size };
  });

for (const floorId of Object.keys(POSES)) {
  const pose = POSES[floorId].door;
  if (!pose) continue;
  await jumpTo(page, { floorId: Number(floorId), x: pose.x, y: pose.y, facing: pose.facing, autosave: false });
  await waitForIdle(page, 5000);
  await wait(200);
  const probe = await probeCanvas();
  console.log(`f${floorId}-door`, probe);
}
await browser.close();
