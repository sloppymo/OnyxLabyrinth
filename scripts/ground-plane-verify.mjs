/**
 * Visual gate for ground-plane contract: feet on floor, shadows, depth scale.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE =
  process.env.PLAYTEST_URL ?? "http://127.0.0.1:5179/OnyxLabyrinth/?debug=1";
const OUT = path.resolve("playtest-screenshots/2026-07-15-ground-plane");
fs.mkdirSync(OUT, { recursive: true });

async function wait(ms) {
  await new Promise((r) => setTimeout(r, ms));
}
async function press(page, key, times = 1) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    await wait(70);
  }
}

async function startCombatOnFloor(page, floorId, themeHint) {
  await page.evaluate(
    ({ floorId }) => {
      const d = window.__onyxDebug;
      const floor = d.findFloor(floorId) ?? d.FLOORS.find((f) => f.id === floorId);
      if (!floor) throw new Error("no floor " + floorId);
      d.state.floor = structuredClone(floor);
      d.state.player.x = floor.startX;
      d.state.player.y = floor.startY;
      d.state.mode = "dungeon";
      const resolved = d.resolveEncounter({
        id: "gp-check",
        weight: 1,
        spawns: [
          { enemyId: "failed-experiment", row: "front" },
          { enemyId: "failed-experiment", row: "front" },
          { enemyId: "blood-wraith", row: "back" },
          { enemyId: "lesser-construct", row: "back" },
        ],
      });
      const loadout = {};
      for (const c of d.state.party) loadout[c.id] = d.defaultLoadoutForCharacter(c);
      const combat = d.createCombatFromEncounter(
        d.state.party,
        resolved,
        d.SPELLS_BY_ID,
        d.ITEMS_BY_ID,
        loadout,
        d.state.inventory,
        false
      );
      d.startCombat(combat);
    },
    { floorId }
  );
  await wait(900);
  return page.evaluate(() => {
    const cc = window.__onyxDebug.getCombatController();
    return {
      mode: window.__onyxDebug.state.mode,
      backdropId: cc?.scene?.backdropId ?? null,
      theme: window.__onyxDebug.state.floor?.tilesetTheme ?? null,
    };
  });
}

const browser = await chromium.launch({ headless: true });
const page = await (
  await browser.newContext({ viewport: { width: 1280, height: 800 } })
).newPage();

await page.goto(BASE, { waitUntil: "networkidle" });
await wait(300);

const floors = [
  { id: 1, label: "f1-stone" },
  { id: 2, label: "f2-library" },
  { id: 3, label: "f3-forge" },
];

for (const f of floors) {
  // Reload so hashed bundles after rebuild are always fresh.
  await page.goto(BASE, { waitUntil: "networkidle" });
  await wait(400);
  await press(page, "Enter");
  await wait(300);
  await press(page, "Enter");
  await wait(600);

  const info = await startCombatOnFloor(page, f.id, f.label);
  console.log(f.label, info);
  await page.screenshot({
    path: path.join(OUT, `${f.label}-formation.png`),
  });
  // One attack for choreography scale check on first backdrop only.
  if (f.id === 1) {
    for (let i = 0; i < 30; i++) {
      const phase = await page.evaluate(() =>
        window.__onyxDebug.getCombatController()?.getPhase?.()
      );
      if (phase === "palette") break;
      await wait(100);
    }
    await page.evaluate(() => {
      window.__onyxDebug.getCombatController().handleInput({
        kind: "press",
        button: "a",
      });
    });
    await wait(200);
    await page.evaluate(() => {
      window.__onyxDebug.getCombatController().handleInput({
        kind: "press",
        button: "a",
      });
    });
    await wait(700);
    await page.screenshot({
      path: path.join(OUT, `${f.label}-attack.png`),
    });
  }
  await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
  await wait(400);
}

await browser.close();
console.log("saved", OUT);
