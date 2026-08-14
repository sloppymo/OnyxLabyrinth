#!/usr/bin/env node
// Production wall-family renderer QA.
//
// Each accepted asset is loaded through renderer.ts's QA-only `wallPreview`
// query hook, then captured from a long same-theme corridor. This is not wall
// selection logic: every run names the exact asset under review.

import fs from "node:fs";
import path from "node:path";
import {
  boot,
  ensureOutDir,
  launch,
  shot,
  snap,
  wait,
} from "./lib.mjs";

const ROOT_URL = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/";
const OUT = ensureOutDir(path.resolve(
  process.env.ONYX_OUT ?? "output/playwright/wall-family-production"
));

const POSES = {
  f1: { floorId: 1, x: 11, y: 37, facing: 0 },
  // West stacks: a long, fully enclosed bookshelf corridor. The prior bridge
  // pose exercised the abyss-zone f1 override instead of the f2 wall family.
  f2: { floorId: 2, x: 2, y: 9, facing: 0 },
  f3: { floorId: 3, x: 2, y: 5, facing: 2 },
  f4: { floorId: 4, x: 2, y: 5, facing: 2 },
  f5: { floorId: 5, x: 5, y: 2, facing: 1 },
};

const suffixes = ["", "_b", "_c", "_d", "_e", "_f", "_g", "_h", "_i", "_j"];
const allVariants = [];
for (let floor = 1; floor <= 5; floor++) {
  for (const suffix of suffixes) allVariants.push(`f${floor}_wall${suffix}_256`);
}
const requestedVariants = process.env.ONYX_WALL_VARIANTS?.split(",")
  .map((value) => value.trim().replace(/\.png$/, ""))
  .filter(Boolean);
const variants = requestedVariants?.length ? requestedVariants : allVariants;
const backends = process.env.ONYX_BACKENDS?.split(",")
  .map((value) => value.trim())
  .filter(Boolean) ?? ["canvas", "webgl"];

function categoryFor(variant) {
  const match = variant.match(/_wall(?:_([b-j]))?_256$/);
  const suffix = match?.[1] ?? "a";
  if (suffix <= "f") return "quiet";
  if (suffix <= "i") return "character";
  return "hero";
}

const reports = [];
for (const backend of backends) {
  const out = ensureOutDir(path.join(OUT, backend));
  const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
  try {
    for (const variant of variants) {
      const family = variant.slice(0, 2);
      const pose = POSES[family];
      if (!pose) throw new Error(`Unknown wall family for ${variant}`);
      const priorErrorCount = errors.length;
      const url = `${ROOT_URL}?debug=1&mazeRenderer=${backend}&wallPreview=${variant}`;
      await boot(page, url, { scenario: { ...pose, autosave: false } });
      await wait(180);
      const familyOut = ensureOutDir(path.join(out, family));
      const capture = await shot(page, familyOut, `${variant}.png`);
      const state = await snap(page);
      const renderer = await page.evaluate(() => window.__onyxDebug.mazeRendererInfo());
      const newErrors = errors.slice(priorErrorCount);
      reports.push({
        variant,
        category: categoryFor(variant),
        backend,
        url,
        capture,
        pose,
        renderer,
        activeFloor: state.floor?.id ?? null,
        browserErrors: newErrors,
      });
      if (renderer.active !== backend || newErrors.length) process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  requestedBackends: backends,
  requestedVariants: variants,
  captures: reports,
  summary: {
    count: reports.length,
    browserErrorCount: reports.reduce((sum, entry) => sum + entry.browserErrors.length, 0),
    rendererMismatches: reports.filter((entry) => entry.renderer.active !== entry.backend).length,
  },
};
fs.writeFileSync(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary, null, 2));
