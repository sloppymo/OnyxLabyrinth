#!/usr/bin/env node
// Focused production-renderer proof for Floor 2's abyss bridge entrance.
// Captures the authored reveal in WebGL and the retained Canvas fallback,
// while also exercising real keyboard traversal and the void collision edge.
import fs from "node:fs";
import path from "node:path";
import {
  act,
  boot,
  ensureOutDir,
  getTranscript,
  jumpTo,
  launch,
  shot,
  snap,
  wait,
} from "./lib.mjs";

const ROOT_URL = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/";
const OUT = ensureOutDir(path.resolve(
  process.env.ONYX_OUT ?? "output/playwright/floor2-abyss-bridge"
));

const poses = [
  { name: "01-south-masonry", x: 2, y: 23, facing: 0 },
  { name: "02-first-exposed", x: 2, y: 20, facing: 0 },
  { name: "03-partial-reveal", x: 2, y: 19, facing: 0 },
  { name: "04-strong-composition", x: 2, y: 17, facing: 1 },
  { name: "05-looking-east", x: 2, y: 16, facing: 1 },
  { name: "06-north-looking-south", x: 2, y: 12, facing: 2 },
  { name: "07-southbound-return", x: 2, y: 16, facing: 2 },
];

async function runBackend(backend) {
  const url = `${ROOT_URL}?debug=1&mazeRenderer=${backend}`;
  const out = ensureOutDir(path.join(OUT, backend));
  const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
  const captures = [];
  try {
    await boot(page, url, {
      scenario: { floorId: 2, x: 2, y: 23, facing: 0, autosave: false },
    });
    await page.evaluate(() => window.__onyxDebug.setGameplayRng(() => 0.999));
    await wait(300);

    // Clean composition captures first, before the real walk queues barks.
    for (const pose of poses) {
      await jumpTo(page, { floorId: 2, ...pose, autosave: false, stepsSinceEncounter: 0 });
      await wait(180);
      captures.push(await shot(page, out, `${pose.name}.png`));
    }

    // The authored handoff is intentionally small: one surviving masonry
    // threshold cell, then the ordinary library mouth. Capture the real
    // northbound view so this connective beat is checked in both renderers.
    await jumpTo(page, { floorId: 2, x: 2, y: 13, facing: 0, autosave: false, stepsSinceEncounter: 0 });
    captures.push(await shot(page, out, "10-library-threshold.png"));
    await act(page, "ArrowUp");
    captures.push(await shot(page, out, "11-first-library-cells.png"));

    // Real northbound movement from masonry onto the exposed bridge.
    await jumpTo(page, { floorId: 2, x: 2, y: 23, facing: 0, autosave: false, stepsSinceEncounter: 0 });
    const walked = [];
    for (let index = 0; index < 6; index++) {
      await act(page, "ArrowUp");
      walked.push(await snap(page));
    }
    captures.push(await shot(page, out, "08-live-first-crossing-bark.png"));

    // Facing east, forward would enter authored void. It must not move.
    await act(page, "ArrowRight");
    await wait(180);
    captures.push(await shot(page, out, "09-speaking-face.png"));
    const beforeVoid = await snap(page);
    await act(page, "ArrowUp");
    const afterVoid = await snap(page);

    const state = await snap(page);
    const renderer = await page.evaluate(() => window.__onyxDebug.mazeRendererInfo());
    const report = {
      schema: 1,
      generatedAt: new Date().toISOString(),
      backend,
      url,
      captures,
      walked: walked.map((entry) => ({
        x: entry.pos.x,
        y: entry.pos.y,
        facing: entry.pos.facing,
      })),
      voidBlocked:
        beforeVoid.pos.x === afterVoid.pos.x &&
        beforeVoid.pos.y === afterVoid.pos.y,
      renderer,
      state,
      browserErrors: errors,
      transcript: getTranscript(page),
    };
    fs.writeFileSync(path.join(out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    if (!report.voidBlocked || errors.length > 0 || renderer.active !== backend) {
      process.exitCode = 1;
    }
    return report;
  } finally {
    await browser.close();
  }
}

const backends = process.env.ONYX_BACKENDS?.split(",").map((value) => value.trim())
  .filter(Boolean) ?? ["webgl", "canvas"];
const reports = [];
for (const backend of backends) reports.push(await runBackend(backend));
console.log(JSON.stringify(reports.map((report) => ({
  backend: report.backend,
  captures: report.captures.length,
  voidBlocked: report.voidBlocked,
  browserErrors: report.browserErrors,
  renderer: report.renderer.active,
})), null, 2));
