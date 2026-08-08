// Measure The Camp's real Canvas draw load without permanent renderer hooks.
//
// Run against:
//   npx vite preview --port 5196 --base /OnyxLabyrinth/
//
// The 2x case mutates only the browser's in-memory floor clone and disappears
// when the page closes. It is intentionally not authored into Floor 1.

import fs from "node:fs";
import path from "node:path";
import { launch, boot, jumpTo, ensureOutDir } from "./lib.mjs";

const URL = process.env.CAMP_PREVIEW_URL ?? "http://localhost:5196/OnyxLabyrinth/?debug=1";
const OUT = "docs/camp-art-review/performance.json";
const CAMP_MIN_X = 25;
const CAMP_MIN_Y = 8;
const CAMP_SIZE = 10;

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

async function sample(page, frames = 180) {
  const raw = await page.evaluate(async (count) => {
    const probe = window.__campSpriteProbe;
    probe.reset();
    const samples = [];
    let previous = null;
    for (let i = 0; i < count; i++) {
      const frame = await new Promise((resolve) => {
        requestAnimationFrame((timestamp) => resolve({ timestamp, draws: probe.consume() }));
      });
      if (previous != null) samples.push(frame.timestamp - previous);
      previous = frame.timestamp;
      samples.push(frame);
    }
    const draws = samples.filter((value) => typeof value === "object").map((value) => value.draws);
    const intervals = samples.filter((value) => typeof value === "number");
    return {
      frames: count,
      draws,
      intervals,
      uniqueSources: probe.uniqueSources(),
    };
  }, frames);

  const totalDraws = raw.draws.reduce((sum, value) => sum + value, 0);
  return {
    frames: raw.frames,
    projectedAndDrawnMean: Number((totalDraws / raw.frames).toFixed(2)),
    projectedAndDrawnPeak: Math.max(...raw.draws),
    visibleSpriteSources: raw.uniqueSources,
    frameIntervalMedianMs: Number(percentile(raw.intervals, 0.5).toFixed(2)),
    frameIntervalP95Ms: Number(percentile(raw.intervals, 0.95).toFixed(2)),
    framesOver25Ms: raw.intervals.filter((value) => value > 25).length,
  };
}

async function main() {
  const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(() => {
    const original = CanvasRenderingContext2D.prototype.drawImage;
    let currentDraws = 0;
    const sources = new Set();
    CanvasRenderingContext2D.prototype.drawImage = function (source, ...args) {
      const src = source instanceof HTMLImageElement ? source.currentSrc || source.src : "";
      if (src.includes("/assets/map-sprites/camp-")) {
        currentDraws += 1;
        sources.add(src.split("/").pop() ?? src);
      }
      return original.call(this, source, ...args);
    };
    window.__campSpriteProbe = {
      consume() {
        const value = currentDraws;
        currentDraws = 0;
        return value;
      },
      reset() {
        currentDraws = 0;
        sources.clear();
      },
      uniqueSources() {
        return [...sources].sort();
      },
    };
  });

  await boot(page, URL, { scenario: { floorId: 1, x: 25, y: 12, facing: 1 } });
  await page.evaluate(() => {
    window.__onyxDebug.state.floor.encounterRate = 0;
  });
  await jumpTo(page, { floorId: 1, x: 25, y: 12, facing: 1, autosave: false });

  const authored = await page.evaluate(() => {
    const all = window.__onyxDebug.state.floor.mapSprites ?? [];
    const camp = all.filter((sprite) => sprite.spriteId.startsWith("camp-"));
    return { floorMapSprites: all.length, campMapSprites: camp.length };
  });
  const normal = await sample(page);

  const stress = await page.evaluate(([minX, minY, size]) => {
    const sprites = window.__onyxDebug.state.floor.mapSprites;
    const camp = sprites.filter((sprite) => sprite.spriteId.startsWith("camp-"));
    const duplicates = camp.map((sprite, index) => ({
      ...sprite,
      x: minX + ((sprite.x - minX + 1 + (index % 2)) % size),
      y: minY + ((sprite.y - minY + (index % 3 === 0 ? 1 : 0)) % size),
    }));
    sprites.push(...duplicates);
    return { floorMapSprites: sprites.length, campMapSprites: camp.length + duplicates.length };
  }, [CAMP_MIN_X, CAMP_MIN_Y, CAMP_SIZE]);
  const doubled = await sample(page);

  const report = {
    measuredAt: new Date().toISOString(),
    url: URL,
    pose: { x: 25, y: 12, facing: "east" },
    methodology: {
      sampleFrames: 180,
      candidateStage:
        "mapSprites currently has no pre-projection distance reject; every registered floor placement is considered before project/occlusion tests",
      projectedAndDrawn:
        "mean and peak Canvas drawImage calls whose loaded source is assets/map-sprites/camp-*; all Camp sources were ready",
      frameTime:
        "requestAnimationFrame interval pacing in headless Chromium; this is a dropped-frame indicator, not isolated renderer CPU time",
      stress:
        "temporary in-memory duplicates shifted within the 10x10 Camp; no floor data is modified",
    },
    normal: {
      totalFloorSprites: authored.floorMapSprites,
      totalCampSprites: authored.campMapSprites,
      candidatesAfterDistanceReject: authored.campMapSprites,
      ...normal,
    },
    doubled: {
      totalFloorSprites: stress.floorMapSprites,
      totalCampSprites: stress.campMapSprites,
      candidatesAfterDistanceReject: stress.campMapSprites,
      ...doubled,
    },
    browserErrors: errors,
  };

  ensureOutDir(path.dirname(OUT));
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  if (errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
