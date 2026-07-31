/**
 * Corridor art pass — checklist views 5 and 6.
 *
 * The four geometry views are covered by the baseline gallery; these two are
 * not, and both exercise paths a draw-order change can break:
 *
 *   5. combat -> dungeon return. `renderCorridorBackdrop` runs the whole
 *      corridor render on an OFFSCREEN context to bake the combat backdrop,
 *      then nulls the scanline pattern cache so the next live frame rebuilds
 *      it on the real context. Moving a draw call across the ctx.restore()
 *      boundary is exactly the kind of edit that can leave textures or
 *      overlays bound to the wrong context.
 *   6. map overlay (M). Draws to a sibling canvas; must not corrupt the
 *      corridor bitmap underneath.
 *
 * Fails loudly on a black or near-black frame rather than just saving a PNG.
 *
 * Run: node scripts/playtests/corridor-transition-check.mjs
 */
import fs from "node:fs";
import path from "node:path";
import {
  launch, wait, press, jumpTo, waitForIdle, snap,
  ensureOutDir, shot, ensureAudioResumed,
} from "./lib.mjs";

const URL = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir("playtest-screenshots/2026-07-30-corridor-baseline");
const POSES = JSON.parse(fs.readFileSync("scripts/playtests/corridor-poses.json", "utf8"));
const P = POSES["1"].straight;

const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
await page.goto(URL, { waitUntil: "networkidle" });
await wait(400);
await ensureAudioResumed(page);

const meanLuma = () =>
  page.evaluate(() => {
    const cv = document.querySelector("#view");
    const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    return +(s / (d.length / 4)).toFixed(2);
  });

const results = [];
const check = (name, luma, floor) => {
  const ok = luma >= floor;
  results.push({ name, luma, floor, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(28)} meanLuma=${luma} (floor ${floor})`);
  return ok;
};

await jumpTo(page, { floorId: 1, x: P.x, y: P.y, facing: P.facing, autosave: false });
await waitForIdle(page, 5000);
await wait(200);
const base = await meanLuma();
await shot(page, OUT, "check-1-corridor-before.png");
check("corridor baseline", base, 15);

// --- View 6: map overlay ---
await press(page, "m");
await wait(500);
await shot(page, OUT, "check-2-map-overlay.png");
const routeMap = (await snap(page)).route;
console.log(`  map route = ${routeMap}`);
await press(page, "m");
await wait(500);
await waitForIdle(page, 3000);
const afterMap = await meanLuma();
await shot(page, OUT, "check-3-corridor-after-map.png");
check("corridor after map toggle", afterMap, base * 0.7);

// --- View 5: combat -> dungeon return ---
// Same shape as visual-pass-2026-07-27.mjs's forceEncounter: startCombat()
// takes a built CombatState, not zero args.
const started = await page.evaluate(async () => {
  const d = window.__onyxDebug;
  const s = d.state;
  let resolved = null;
  for (let attempts = 0; attempts < 300; attempts++) {
    const entry = d.rollEncounter(s.floor.id);
    if (!entry) return { ok: false };
    const r = d.resolveEncounter(entry);
    if (r.length === 0) continue;
    if (r.some((e) => e.enemy.isBoss)) continue;
    resolved = r;
    break;
  }
  if (!resolved) return { ok: false };
  const combat = d.createCombatFromEncounter(
    s.party, resolved, d.SPELLS_BY_ID, d.ITEMS_BY_ID,
    s.equipment, s.inventory, s.inAntimagic, s.activeCharIds
  );
  await d.startCombat(combat);
  return { ok: true, enemyCount: resolved.length };
});
console.log(`  startCombat ->`, JSON.stringify(started));
await wait(2500);
await shot(page, OUT, "check-4-combat.png");
const routeCombat = (await snap(page)).route;
console.log(`  combat route = ${routeCombat}`);

await page.evaluate((r) => window.__onyxDebug.exitDebugCombat(r), "fled");
const deadline = Date.now() + 8000;
let st = await snap(page);
while (st.route === "combat" && Date.now() < deadline) {
  await wait(150);
  st = await snap(page);
}
await waitForIdle(page, 4000);
await wait(400);
const afterCombat = await meanLuma();
await shot(page, OUT, "check-5-corridor-after-combat.png");
check("corridor after combat return", afterCombat, base * 0.7);

const allOk = results.every((r) => r.ok);
fs.writeFileSync(
  path.join(OUT, "transition-check.json"),
  JSON.stringify({ at: new Date().toISOString(), results, browserErrors: errors.slice(0, 10) }, null, 2)
);
console.log(`\n${allOk ? "ALL PASS" : "FAILURES PRESENT"}`);
if (errors.length) console.log("browser errors:", errors.slice(0, 5));
await browser.close();
process.exit(allOk ? 0 : 1);
