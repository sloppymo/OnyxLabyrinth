/**
 * Corridor art pass — fog-curve probe.
 *
 * Phase 0's exit criterion: editing the single canonical fog constant must
 * visibly move the render. Before the config unification, `RENDER_CONFIG.fogFalloff`
 * was a shadow key with no reader, so editing the obvious knob changed nothing.
 * This dumps the floor/ceiling luminance at fixed world depths so that claim is
 * checkable rather than assumed.
 *
 * Screen row -> world depth on the floor plane is rowDistance = halfH / (y - halfH),
 * so a target depth d samples row y = halfH + halfH/d (and halfH - halfH/d for the
 * ceiling). Sampling by depth rather than by row keeps the comparison meaningful
 * if the canvas height changes between runs.
 *
 * Run: node scripts/playtests/corridor-fog-probe.mjs [label]
 */
import fs from "node:fs";
import path from "node:path";
import { launch, wait, jumpTo, waitForIdle, ensureOutDir, ensureAudioResumed } from "./lib.mjs";

const URL = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir("playtest-screenshots/2026-07-30-corridor-baseline");
const LABEL = process.argv[2] ?? "unlabelled";
const POSES = JSON.parse(fs.readFileSync("scripts/playtests/corridor-poses.json", "utf8"));
const DEPTHS = [1, 1.5, 2, 3, 4, 5, 6, 7, 7.5];

const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
await page.goto(URL, { waitUntil: "networkidle" });
await wait(400);
await ensureAudioResumed(page);

const out = { label: LABEL, at: new Date().toISOString(), floors: {} };

for (const floorId of [1, 2]) {
  const P = POSES[String(floorId)].straight;
  await jumpTo(page, { floorId, x: P.x, y: P.y, facing: P.facing, autosave: false });
  await waitForIdle(page, 5000);
  await wait(250);

  out.floors[`f${floorId}-straight`] = await page.evaluate((depths) => {
    const cv = document.querySelector("#view");
    const { width: W, height: H } = cv;
    const d = cv.getContext("2d").getImageData(0, 0, W, H).data;
    const halfH = H / 2;
    const x0 = Math.floor(W * 0.35), x1 = Math.floor(W * 0.65);
    const rowMean = (y) => {
      if (y < 0 || y >= H) return null;
      let a = 0;
      for (let x = x0; x < x1; x++) {
        const i = ((y | 0) * W + x) * 4;
        a += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      }
      return +(a / (x1 - x0)).toFixed(2);
    };
    const floorByDepth = {}, ceilByDepth = {};
    for (const dep of depths) {
      floorByDepth[dep] = rowMean(Math.round(halfH + halfH / dep));
      ceilByDepth[dep] = rowMean(Math.round(halfH - halfH / dep));
    }
    // Sharpest single-row drop above the horizon = the maxDist clip edge.
    let edge = { y: 0, drop: 0 };
    for (let y = 4; y < halfH; y++) {
      const dr = rowMean(y - 1) - rowMean(y);
      if (dr > edge.drop) edge = { y, drop: +dr.toFixed(2) };
    }
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    return { canvas: `${W}x${H}`, floorByDepth, ceilByDepth, clipEdge: edge, meanLuma: +(sum / (d.length / 4)).toFixed(2) };
  }, DEPTHS);

  const f = out.floors[`f${floorId}-straight`];
  console.log(`f${floorId}-straight  mean=${f.meanLuma}  clipEdge=y${f.clipEdge.y}(Δ${f.clipEdge.drop})`);
  console.log("  floor luma by depth:", DEPTHS.map((d) => `${d}:${f.floorByDepth[d]}`).join("  "));
}

const file = path.join(OUT, `fog-probe-${LABEL}.json`);
fs.writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`wrote ${file}`);
if (errors.length) console.log("browser errors:", errors.slice(0, 5));
await browser.close();
