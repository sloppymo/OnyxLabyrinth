/**
 * Floor 1 regional-tileset + renderer checklist.
 *
 * Run after `npm run build` with a production preview available:
 *   ONYX_URL=http://127.0.0.1:5176/OnyxLabyrinth/?debug=1 \
 *     node scripts/playtests/floor-1-regional-tileset-verify.mjs
 */
import fs from "node:fs";
import path from "node:path";
import {
  act,
  boot,
  ensureOutDir,
  getTranscript,
  jumpTo,
  launch,
  press,
  shot,
  snap,
  wait,
  waitForIdle,
} from "./lib.mjs";

const URL = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir(process.env.ONYX_OUT ?? "/tmp/onyx-floor1-regional-tileset");

const poses = [
  { id: "f1-straight-entry", x: 11, y: 25, facing: 0, theme: "f1" },
  { id: "f1-open-side-passage", x: 11, y: 18, facing: 0, theme: "f1" },
  { id: "f1-front-wall", x: 11, y: 22, facing: 1, theme: "f1" },
  { id: "f2-stacks", x: 7, y: 12, facing: 3, theme: "f2" },
  { id: "f5-cistern", x: 21, y: 15, facing: 3, theme: "f5" },
  { id: "f4-chapel", x: 7, y: 9, facing: 3, theme: "f4" },
  { id: "f3-ember-breach", x: 16, y: 8, facing: 1, theme: "f3" },
  { id: "boundary-open-f1-f5-corridor", x: 13, y: 20, facing: 1, theme: "f1 -> f5" },
  { id: "boundary-f1-to-f2", x: 10, y: 19, facing: 3, theme: "f1" },
  { id: "boundary-f2-to-f1", x: 9, y: 19, facing: 1, theme: "f2" },
  { id: "boundary-f1-to-f5", x: 14, y: 12, facing: 1, theme: "f1" },
  { id: "boundary-f5-to-f1", x: 15, y: 12, facing: 3, theme: "f5" },
  { id: "boundary-f3-to-f4", x: 11, y: 10, facing: 3, theme: "f3" },
  { id: "boundary-f4-to-f3", x: 10, y: 10, facing: 1, theme: "f4" },
];

const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
const report = {
  at: new Date().toISOString(),
  url: URL,
  captures: [],
  checks: [],
  browserErrors: errors,
};

function check(name, ok, detail = "") {
  report.checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function canvasMetrics() {
  return page.evaluate(() => {
    const canvas = document.querySelector("#view");
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return null;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let luma = 0;
    let nonBlack = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const value = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
      luma += value;
      if (value > 8) nonBlack++;
    }
    const count = pixels.length / 4;
    return {
      width: canvas.width,
      height: canvas.height,
      meanLuma: +(luma / count).toFixed(2),
      nonBlackFraction: +(nonBlack / count).toFixed(4),
    };
  });
}

async function capturePose(pose) {
  const state = await jumpTo(page, {
    floorId: 1,
    x: pose.x,
    y: pose.y,
    facing: pose.facing,
    autosave: false,
    stepsSinceEncounter: 0,
  });
  await wait(250);
  const metrics = await canvasMetrics();
  const screenshot = await shot(page, OUT, `${pose.id}.png`);
  report.captures.push({ ...pose, route: state.route, warnings: state.warnings, metrics, screenshot });
  check(`${pose.id} route`, state.route === "dungeon", `route=${state.route}`);
  check(`${pose.id} invariants`, state.warnings.length === 0, JSON.stringify(state.warnings));
  check(
    `${pose.id} canvas visible`,
    !!metrics && metrics.meanLuma >= 12 && metrics.nonBlackFraction >= 0.25,
    JSON.stringify(metrics)
  );
}

try {
  const initial = await boot(page, URL, {
    scenario: { floorId: 1, x: 11, y: 25, facing: 0, autosave: false, stepsSinceEncounter: 0 },
  });
  check("booted to redesigned floor", initial.route === "dungeon" && initial.floor.name === "The Hall of Five Wounds");

  // Natural first two steps: proves the opening inscription fires where the
  // design promises, rather than existing only in JSON.
  await act(page, "ArrowUp");
  await act(page, "ArrowUp");
  // The dungeon notification is a real typewriter; wait for its short line to
  // finish so the screenshot and snapshot both carry the same complete copy.
  await wait(1600);
  const opening = await snap(page);
  const openingShot = await shot(page, OUT, "opening-inscription-step-2.png");
  report.captures.push({
    id: "opening-inscription-step-2",
    route: opening.route,
    pos: opening.pos,
    message: opening.message,
    warnings: opening.warnings,
    metrics: await canvasMetrics(),
    screenshot: openingShot,
  });
  check(
    "opening landmark fires within two steps",
    opening.pos.x === 11 && opening.pos.y === 23 && /Five wounds split one ancient hall/.test(opening.message.text),
    JSON.stringify({ pos: opening.pos, message: opening.message })
  );

  for (const pose of poses) await capturePose(pose);

  // Darkness must be entered through normal movement so feature state follows
  // the same path as play, rather than mutating the debug state directly.
  await jumpTo(page, {
    floorId: 1,
    x: 3,
    y: 8,
    facing: 0,
    autosave: false,
    stepsSinceEncounter: 0,
  });
  await act(page, "ArrowUp");
  await wait(250);
  const darkness = await snap(page);
  const darknessMetrics = await canvasMetrics();
  await shot(page, OUT, "f4-darkness.png");
  check("darkness entered through movement", darkness.pos.y === 7 && darkness.flags.inDarkness);
  check(
    "darkness canvas remains legible",
    !!darknessMetrics && darknessMetrics.meanLuma >= 8 && darknessMetrics.nonBlackFraction >= 0.15,
    JSON.stringify(darknessMetrics)
  );

  // Auto-map must not corrupt the corridor bitmap.
  await press(page, "m");
  await wait(300);
  const mapState = await snap(page);
  await shot(page, OUT, "map-overlay.png");
  check("map overlay opens", mapState.flags.mapVisible === true);
  await press(page, "m");
  await waitForIdle(page, 3000);
  await wait(250);
  const afterMapMetrics = await canvasMetrics();
  await shot(page, OUT, "corridor-after-map.png");
  check(
    "corridor survives map toggle",
    !!afterMapMetrics && afterMapMetrics.meanLuma >= 8 && afterMapMetrics.nonBlackFraction >= 0.15,
    JSON.stringify(afterMapMetrics)
  );

  // Real startCombat -> leaveCombat path, then assert the regional renderer
  // resumes on the live corridor canvas without black/invalid textures.
  await jumpTo(page, {
    floorId: 1,
    x: 7,
    y: 12,
    facing: 3,
    autosave: false,
    stepsSinceEncounter: 0,
  });
  const started = await page.evaluate(async () => {
    const d = window.__onyxDebug;
    const s = d.state;
    let resolved = null;
    for (let attempts = 0; attempts < 300; attempts++) {
      const entry = d.rollEncounter(s.floor.id);
      if (!entry) continue;
      const enemies = d.resolveEncounter(entry);
      if (!enemies.length || enemies.some((e) => e.enemy.isBoss)) continue;
      resolved = enemies;
      break;
    }
    if (!resolved) return false;
    const combat = d.createCombatFromEncounter(
      s.party,
      resolved,
      d.SPELLS_BY_ID,
      d.ITEMS_BY_ID,
      s.equipment,
      s.inventory,
      s.inAntimagic,
      s.activeCharIds
    );
    await d.startCombat(combat);
    return true;
  });
  check("combat starts from Floor 1", started === true);
  await wait(2200);
  const combatState = await snap(page);
  await shot(page, OUT, "combat.png");
  check("combat route visible", combatState.route === "combat", `route=${combatState.route}`);

  await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
  const deadline = Date.now() + 8000;
  let returned = await snap(page);
  while (returned.route === "combat" && Date.now() < deadline) {
    await wait(120);
    returned = await snap(page);
  }
  await waitForIdle(page, 4000);
  await wait(350);
  const returnMetrics = await canvasMetrics();
  await shot(page, OUT, "f2-after-combat-return.png");
  check("combat returns to dungeon", returned.route === "dungeon", `route=${returned.route}`);
  check(
    "regional textures survive combat return",
    !!returnMetrics && returnMetrics.meanLuma >= 12 && returnMetrics.nonBlackFraction >= 0.25,
    JSON.stringify(returnMetrics)
  );

  const readiness = await page.evaluate(() => window.__onyxDebug.readiness());
  report.readiness = readiness;
  report.finalSnapshot = await snap(page);
  report.transcript = getTranscript(page);
  check("asset loads settled without failures", readiness.failed.length === 0, JSON.stringify(readiness.failed));
  check("browser error log empty", errors.length === 0, JSON.stringify(errors));
} catch (error) {
  report.exception = String(error?.stack ?? error);
  check("script completed", false, report.exception);
}

report.ok = report.checks.every((entry) => entry.ok);
fs.writeFileSync(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`report: ${path.join(OUT, "report.json")}`);
await browser.close();
process.exit(report.ok ? 0 : 1);
