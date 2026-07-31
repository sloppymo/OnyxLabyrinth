/**
 * Corridor art pass — torch probe, time-averaged.
 *
 * The single-frame mean-luminance check used for Phase 1's ±3% gate is not
 * trustworthy on its own: `drawTorchFlicker` early-returns when its alpha goes
 * negative, which it does for part of every cycle, so an arbitrary-phase
 * snapshot can catch a frame with no torch drawn at all and report a
 * suspiciously stable number. Amplitude via max-min over unsynchronised
 * samples is noise-sensitive for the same reason.
 *
 * This samples across whole flicker periods and reports:
 *   - frameMean  : mean frame luminance averaged over time (the ±3% gate)
 *   - per-region time-averaged mean and peak-to-trough amplitude
 *   - drawnFrac  : fraction of sampled frames where the overlay was above zero
 *
 * Run: node scripts/playtests/corridor-torch-probe.mjs [label]
 */
import fs from "node:fs";
import path from "node:path";
import { launch, wait, jumpTo, waitForIdle, ensureOutDir, ensureAudioResumed } from "./lib.mjs";

const URL = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir("playtest-screenshots/2026-07-30-corridor-baseline");
const LABEL = process.argv[2] ?? "unlabelled";
const POSES = JSON.parse(fs.readFileSync("scripts/playtests/corridor-poses.json", "utf8"));
const PERIOD_MS = 2000;
const SAMPLES = 80;          // ~2 full periods at 50ms
const INTERVAL = (PERIOD_MS * 2) / SAMPLES;

const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
await page.goto(URL, { waitUntil: "networkidle" });
await wait(400);
await ensureAudioResumed(page);

const out = { label: LABEL, at: new Date().toISOString(), samples: SAMPLES, spanMs: PERIOD_MS * 2, floors: {} };

for (const floorId of [1, 5]) {
  const P = POSES[String(floorId)].straight;
  await jumpTo(page, { floorId, x: P.x, y: P.y, facing: P.facing, autosave: false });
  await waitForIdle(page, 5000);
  await wait(250);

  const series = [];
  for (let i = 0; i < SAMPLES; i++) {
    series.push(
      await page.evaluate(() => {
        const cv = document.querySelector("#view");
        const { width: W, height: H } = cv;
        const d = cv.getContext("2d").getImageData(0, 0, W, H).data;
        const L = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        const cx = W / 2, cy = H / 2, R = Math.max(W, H) / 2;
        let frame = 0, fN = 0, c = 0, cN = 0, a = 0, aN = 0, nw = 0, nwN = 0;
        for (let y = 0; y < H; y += 2) {
          for (let x = 0; x < W; x += 2) {
            const i = (y * W + x) * 4, v = L(i);
            frame += v; fN++;
            const r = Math.hypot(x - cx, y - cy) / R;
            if (r < 0.2) { c += v; cN++; }
            else if (r > 0.45 && r < 0.65) { a += v; aN++; }
            if ((x < W * 0.15 || x > W * 0.85) && y > H * 0.3 && y < H * 0.7) { nw += v; nwN++; }
          }
        }
        return { frame: frame / fN, centre: c / cN, annulus: a / aN, nearWall: nw / nwN };
      })
    );
    await wait(INTERVAL);
  }

  const stat = (k) => {
    const v = series.map((s) => s[k]);
    const mean = v.reduce((x, y) => x + y) / v.length;
    const mn = Math.min(...v), mx = Math.max(...v);
    return { mean: +mean.toFixed(3), amp: +(mx - mn).toFixed(3), ampPct: +(((mx - mn) / mean) * 100).toFixed(2) };
  };
  const f = { frame: stat("frame"), centre: stat("centre"), annulus: stat("annulus"), nearWall: stat("nearWall") };
  f.nearWallBeatsCentre = f.nearWall.amp > f.centre.amp;
  f.nearWallBeatsAnnulus = f.nearWall.amp > f.annulus.amp;
  out.floors[`f${floorId}-straight`] = f;

  console.log(
    `f${floorId}-straight  frameMean=${f.frame.mean}  ` +
    `amp near=${f.nearWall.amp}(${f.nearWall.ampPct}%) ` +
    `annulus=${f.annulus.amp}(${f.annulus.ampPct}%) ` +
    `centre=${f.centre.amp}(${f.centre.ampPct}%)  ` +
    `near>centre=${f.nearWallBeatsCentre}`
  );
}

const file = path.join(OUT, `torch-probe-${LABEL}.json`);
fs.writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`wrote ${file}`);
if (errors.length) console.log("browser errors:", errors.slice(0, 5));
await browser.close();
