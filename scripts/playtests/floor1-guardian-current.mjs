#!/usr/bin/env node
/**
 * Focused current-map regression for Floor 1's Kept Gate guardian.
 *
 * This replaces smoke-floor-1-proving-depths.mjs, whose assertions target the
 * retired 25x32 map. The natural campaign driver covers the full route; this
 * script keeps the browser check small and proves the live guardian approach,
 * trigger, and flee barrier on the canonical 28x41 floor.
 */
import { boot, ensureOutDir, launch, press, shot, snap, wait } from "./lib.mjs";

const BASE = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir("output/playwright/floor1-guardian-current");
const failures = [];
const check = (name, condition, detail = "") => {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
try {
  console.log("=== Current Floor 1 guardian approach ===");
  await boot(page, BASE, {
    scenario: { floorId: 1, x: 17, y: 21, facing: 1, autosave: false, stepsSinceEncounter: 0 },
  });
  await page.evaluate(() => window.__onyxDebug.setGameplayRng(() => 0.999));
  const before = await snap(page);
  check("current Floor 1 name and dimensions", before.floor.name === "The Hall of Five Wounds");
  const dimensions = await page.evaluate(() => ({
    width: window.__onyxDebug.state.floor.width,
    height: window.__onyxDebug.state.floor.height,
  }));
  check("canonical floor is 28x41", dimensions.width === 28 && dimensions.height === 41, JSON.stringify(dimensions));
  check("approach is one cell before the guardian", before.pos.x === 17 && before.pos.y === 21);
  await shot(page, OUT, "01-guardian-approach.png");

  await press(page, "ArrowUp");
  await wait(500);
  let state = await snap(page);
  if (state.route === "dialog" || state.mode === "dialog") {
    await press(page, "Enter", 4);
    await wait(600);
    state = await snap(page);
  }
  check("guardian tile is reached by real movement", state.pos.x === 18 && state.pos.y === 21, JSON.stringify(state.pos));
  check(
    "guardian interaction starts or presents its authored gate",
    state.mode === "combat" || state.route === "combat" || state.mode === "dialog" || /party|shapes|stairs|guardian/i.test(state.message.text),
    JSON.stringify({ mode: state.mode, route: state.route, message: state.message.text })
  );
  await shot(page, OUT, "02-guardian-trigger.png");

  if (state.mode === "combat" || state.route === "combat") {
    await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
    await wait(900);
    state = await snap(page);
    if (state.route !== "dungeon") {
      await press(page, "Enter");
      await wait(400);
      state = await snap(page);
    }
  }
  check("flee leaves the party on the guardian tile", state.pos.x === 18 && state.pos.y === 21);
  const edge = await page.evaluate(() => window.__onyxDebug.state.floor.grid[21][18].e);
  check("flee does not open the progression barrier", edge === "barred", `edge=${edge}`);
  await shot(page, OUT, "03-guardian-fled-barrier-intact.png");
  check("browser has no errors", errors.length === 0, JSON.stringify(errors));
} finally {
  await browser.close();
}

console.log(failures.length === 0 ? "ALL CHECKS PASSED" : `${failures.length} FAILURE(S)`);
for (const failure of failures) console.log(`  - ${failure}`);
if (errors.length > 0) process.exitCode = 1;
if (failures.length > 0) process.exitCode = 1;
