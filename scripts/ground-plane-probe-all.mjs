/**
 * Probe groundPlaneProbe() for every backdrop id including corridor/combat-bg,
 * with a max-size enemy pack (3 front + 3 back) for x-bounds stress.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE =
  process.env.PLAYTEST_URL ?? "http://127.0.0.1:5180/OnyxLabyrinth/?debug=1";
const OUT = path.resolve("playtest-screenshots/2026-07-15-highcam-rebake");
fs.mkdirSync(OUT, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = async (page, key, n = 1) => {
  for (let i = 0; i < n; i++) {
    await page.keyboard.press(key);
    await wait(50);
  }
};

const MAX_SPAWNS = [
  { enemyId: "skeleton", row: "front" },
  { enemyId: "skeleton", row: "front" },
  { enemyId: "armored-skeleton", row: "front" },
  { enemyId: "skeleton-archer", row: "back" },
  { enemyId: "skeleton-archer", row: "back" },
  { enemyId: "blood-wraith", row: "back" },
];

async function boot(page) {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await wait(300);
  await press(page, "Enter");
  await wait(200);
  await press(page, "Enter");
  await wait(500);
}

async function startThemeCombat(page, floorId) {
  await page.evaluate(
    ({ floorId, spawns }) => {
      const d = window.__onyxDebug;
      d.state.floor = structuredClone(d.findFloor(floorId));
      d.state.mode = "dungeon";
      const resolved = d.resolveEncounter({ id: "probe", weight: 1, spawns });
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
    },
    { floorId, spawns: MAX_SPAWNS }
  );
  await wait(800);
}

const browser = await chromium.launch({ headless: true });
const page = await (
  await browser.newContext({ viewport: { width: 1280, height: 800 } })
).newPage();

const results = [];

for (const floorId of [1, 2, 3, 4, 5]) {
  await boot(page);
  await startThemeCombat(page, floorId);
  const probe = await page.evaluate(() => window.__onyxDebug.groundPlaneProbe());
  results.push({ label: `theme:f${floorId}`, probe });
  await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
  await wait(250);
}

// corridor
await boot(page);
await page.evaluate(async (spawns) => {
  const d = window.__onyxDebug;
  d.state.floor = structuredClone(d.findFloor(1));
  const bd = d.renderCorridorBackdrop(d.state, 768, 672);
  const resolved = d.resolveEncounter({ id: "corr", weight: 1, spawns });
  const loadout = Object.fromEntries(
    d.state.party.map((c) => [c.id, d.defaultLoadoutForCharacter(c)])
  );
  await d.startCombat(
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
  const cc = d.getCombatController();
  if (!cc) throw new Error("no combat controller after start");
  cc.scene.backdrop = bd;
  cc.scene.backdropId = "corridor";
}, MAX_SPAWNS);
await wait(800);
results.push({
  label: "corridor",
  probe: await page.evaluate(() => window.__onyxDebug.groundPlaneProbe()),
});
await page.screenshot({ path: path.join(OUT, "06-corridor.png") });
await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
await wait(250);

// combat-bg (null bake)
await boot(page);
await page.evaluate(async (spawns) => {
  const d = window.__onyxDebug;
  d.state.floor = structuredClone(d.findFloor(1));
  const resolved = d.resolveEncounter({ id: "cbg", weight: 1, spawns });
  const loadout = Object.fromEntries(
    d.state.party.map((c) => [c.id, d.defaultLoadoutForCharacter(c)])
  );
  await d.startCombat(
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
  const cc = d.getCombatController();
  if (!cc) throw new Error("no combat controller after start");
  cc.scene.backdrop = null;
  cc.scene.backdropId = "combat-bg";
}, MAX_SPAWNS);
await wait(800);
results.push({
  label: "combat-bg",
  probe: await page.evaluate(() => window.__onyxDebug.groundPlaneProbe()),
});

fs.writeFileSync(path.join(OUT, "probes.json"), JSON.stringify(results, null, 2));
let failed = 0;
for (const row of results) {
  const p = row.probe;
  const idOk =
    row.label.startsWith("theme:")
      ? p?.backdropId === row.label
      : p?.backdropId === row.label;
  const ok = !!(p && p.ok && p.feetOk && p.occlusionOk && p.xBoundsOk && idOk);
  if (!ok) failed++;
  console.log(
    row.label,
    "ok=" + ok,
    "id=" + p?.backdropId,
    "seam=" + p?.geo?.seamY,
    "bot=" + p?.geo?.floorBottomY,
    "enemies=" + p?.enemies?.length,
    "partyX=[" + p?.party?.map((x) => x.x).join(",") + "]"
  );
  if (!idOk) {
    console.error(`FAIL backdropId: expected ${row.label}, got ${p?.backdropId}`);
  }
}
if (failed) {
  console.error("FAIL", failed, "probes");
  process.exit(1);
}
console.log("all probes ok");
await browser.close();
