/**
 * Probe groundPlaneProbe() for every backdrop id + corridor screenshot.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE =
  process.env.PLAYTEST_URL ?? "http://127.0.0.1:5180/OnyxLabyrinth/?debug=1";
const OUT = path.resolve("playtest-screenshots/2026-07-15-ground-plane");
fs.mkdirSync(OUT, { recursive: true });

async function wait(ms) {
  await new Promise((r) => setTimeout(r, ms));
}
async function press(page, key, times = 1) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    await wait(60);
  }
}

async function bootParty(page) {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await wait(350);
  await press(page, "Enter");
  await wait(300);
  await press(page, "Enter");
  await wait(600);
}

async function startCombat(page, floorId) {
  await page.evaluate((floorId) => {
    const d = window.__onyxDebug;
    const floor = d.findFloor(floorId);
    d.state.floor = structuredClone(floor);
    d.state.mode = "dungeon";
    const resolved = d.resolveEncounter({
      id: "probe",
      weight: 1,
      spawns: [
        { enemyId: "failed-experiment", row: "front" },
        { enemyId: "blood-wraith", row: "back" },
      ],
    });
    const loadout = Object.fromEntries(
      d.state.party.map((c) => [c.id, d.defaultLoadoutForCharacter(c)])
    );
    d.startCombat(
      d.createCombatFromEncounter(
        d.state.party,
        resolved,
        d.SPELLS_BY_ID,
        d.ITEMS_BY_ID,
        loadout,
        d.state.inventory,
        false
      )
    );
  }, floorId);
  await wait(700);
}

const browser = await chromium.launch({ headless: true });
const page = await (
  await browser.newContext({ viewport: { width: 1280, height: 800 } })
).newPage();

const floors = [
  { id: 1, expectId: "theme:f1" },
  { id: 2, expectId: "theme:f2" },
  { id: 3, expectId: "theme:f3" },
  { id: 4, expectId: "theme:f4" },
  { id: 5, expectId: "theme:f5" },
];

const results = [];
for (const f of floors) {
  await bootParty(page);
  await startCombat(page, f.id);
  const probe = await page.evaluate(() => window.__onyxDebug.groundPlaneProbe());
  const ok = !!(
    probe &&
    probe.feetOk &&
    probe.backdropId === f.expectId &&
    probe.geo
  );
  results.push({
    floor: f.id,
    expectId: f.expectId,
    gotId: probe?.backdropId,
    feetOk: probe?.feetOk,
    seamY: probe?.geo?.seamY,
    scaleFar: probe?.geo?.scaleFar,
    backScale: probe?.party?.[3]?.scale,
    frontScale: probe?.party?.[0]?.scale,
    ok,
  });
  await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
  await wait(300);
}

// Corridor / combat-bg path: null arena bake, force backdropId.
await bootParty(page);
await page.evaluate(() => {
  const d = window.__onyxDebug;
  const floor = d.findFloor(1);
  d.state.floor = structuredClone(floor);
  d.state.mode = "dungeon";
  const resolved = d.resolveEncounter({
    id: "probe-corridor",
    weight: 1,
    spawns: [
      { enemyId: "failed-experiment", row: "front" },
      { enemyId: "blood-wraith", row: "back" },
    ],
  });
  const loadout = Object.fromEntries(
    d.state.party.map((c) => [c.id, d.defaultLoadoutForCharacter(c)])
  );
  const combat = d.createCombatFromEncounter(
    d.state.party,
    resolved,
    d.SPELLS_BY_ID,
    d.ITEMS_BY_ID,
    loadout,
    d.state.inventory,
    false
  );
  // Start with corridor geometry + static bg (no arena bake).
  d.startCombat(combat);
});
await wait(400);
// Override after controller exists — startCombat always bakes arena.
await page.evaluate(() => {
  const cc = window.__onyxDebug.getCombatController();
  cc.scene.backdrop = null;
  cc.scene.backdropId = "corridor";
});
await wait(200);
const corridorProbe = await page.evaluate(() =>
  window.__onyxDebug.groundPlaneProbe()
);
results.push({
  floor: "corridor",
  expectId: "corridor",
  gotId: corridorProbe?.backdropId,
  feetOk: corridorProbe?.feetOk,
  seamY: corridorProbe?.geo?.seamY,
  scaleFar: corridorProbe?.geo?.scaleFar,
  backScale: corridorProbe?.party?.[3]?.scale,
  frontScale: corridorProbe?.party?.[0]?.scale,
  ok: corridorProbe?.feetOk && corridorProbe?.backdropId === "corridor",
});
await page.locator("#combat-canvas").screenshot({
  path: path.join(OUT, "corridor-forced.png"),
});

console.log(JSON.stringify(results, null, 2));
const allOk = results.every((r) => r.ok);
console.log(allOk ? "ALL PROBES OK" : "PROBE FAILURES");
await browser.close();
process.exit(allOk ? 0 : 1);
