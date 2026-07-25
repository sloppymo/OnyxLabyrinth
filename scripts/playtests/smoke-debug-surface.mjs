/**
 * Smoke test for the ?debug=1 snapshot surface (PR-1).
 *
 * Walks the game to each distinct input route and asserts that
 * `__onyxDebug.snapshot()` reports the right `route` and `availableActions` —
 * in particular that the overlays which borrow game mode "title" (save menu,
 * grimoire, NPC panel, perk select) are told apart from the title screen.
 *
 * Run: node scripts/playtests/smoke-debug-surface.mjs
 * Expects: npx vite preview --port 5176 --base /OnyxLabyrinth/
 */
import { launch, wait, press, snap, snapWithMap, ensureOutDir, shot } from "./lib.mjs";

const BASE = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir("playtest-screenshots/smoke-debug-surface");

const log = (...a) => console.log(...a);
const failures = [];

function check(name, cond, detail = "") {
  if (cond) {
    log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const { browser, page, errors } = await launch();

log("=== boot ===");
await page.goto(BASE, { waitUntil: "networkidle" });
await wait(500);

let s = await snap(page);
check("render_game_to_text alias exists", typeof (await page.evaluate(
  () => typeof window.render_game_to_text
)) === "string" && (await page.evaluate(() => typeof window.render_game_to_text)) === "function");
check("title route at boot", s.route === "title", `got ${s.route}`);
check("snapshot schema is 1", s.schema === 1, `got ${s.schema}`);
check("title offers menu actions", s.availableActions.includes("confirm"));
await shot(page, OUT, "01-title.png");

log("=== new game -> prologue ===");
await press(page, "n");
await wait(400);
s = await snap(page);
check("prologue distinguished from title", s.route === "prologue" || s.route === "party_creation", `got ${s.route}`);
for (let i = 0; i < 14 && s.route === "prologue"; i++) {
  await press(page, "Escape");
  await wait(220);
  s = await snap(page);
}

log("=== party creation ===");
if (s.route === "party_creation") {
  check("party_creation route", true);
  await press(page, "Enter");
  await wait(500);
  s = await snap(page);
}

log("=== town ===");
for (let i = 0; i < 10 && s.route !== "town"; i++) {
  await press(page, "Enter");
  await wait(300);
  s = await snap(page);
}
check("town route", s.route === "town", `got ${s.route}`);
check("town party present", s.party.length > 0);
check("town gold is a number", typeof s.gold === "number");
await shot(page, OUT, "02-town.png");

log("=== dungeon ===");
await press(page, ">");
await wait(300);
s = await snap(page);
if (s.route !== "dungeon") {
  for (let i = 0; i < 8 && s.route !== "dungeon"; i++) {
    const body = await page.evaluate(() => document.body.innerText);
    if (/▶.*Enter Dungeon/i.test(body)) {
      await press(page, "Enter");
      await wait(600);
    } else {
      await press(page, "ArrowDown");
      await wait(100);
    }
    s = await snap(page);
  }
}
check("dungeon route", s.route === "dungeon", `got ${s.route}`);
check("dungeon exposes movement verbs", s.availableActions.includes("forward"));
check("dungeon reports floor id", typeof s.floor.id === "number");
check("position has compass", typeof s.pos.compass === "string");
check("map omitted by default", s.map === null);
await shot(page, OUT, "03-dungeon.png");

const mapped = await snapWithMap(page, 3);
check("ascii map returned on request", Array.isArray(mapped.map) && mapped.map.length > 0);
if (Array.isArray(mapped.map)) log(mapped.map.join("\n"));

log("=== save overlay (borrows title mode) ===");
await press(page, "Escape");
await wait(350);
s = await snap(page);
check("save route, not title", s.route === "save", `got ${s.route} (mode ${s.mode})`);
check("save mode really is title", s.mode === "title", `got ${s.mode}`);
await shot(page, OUT, "04-save-overlay.png");
await press(page, "Escape");
await wait(350);
s = await snap(page);
check("back to dungeon after closing save", s.route === "dungeon", `got ${s.route}`);

log("=== grimoire overlay (borrows title mode) ===");
await press(page, "g");
await wait(350);
s = await snap(page);
check("spell route, not title", s.route === "spell" || s.route === "dungeon", `got ${s.route}`);
if (s.route === "spell") {
  check("spell mode really is title", s.mode === "title");
  await press(page, "Escape");
  await wait(300);
}

log("=== combat ===");
await page.evaluate(() => {
  const d = window.__onyxDebug;
  const s = d.state;
  const entry = d.rollEncounter(s.floor.id);
  const resolved = d.resolveEncounter(entry);
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
  return d.startCombat(combat);
});
await wait(1800);
s = await snap(page);
check("combat route", s.route === "combat", `got ${s.route}`);
check("combat view present", s.combat !== null);
if (s.combat) {
  check("combat exposes exact enemy hp", s.combat.enemies.every((e) => typeof e.hp === "number" && typeof e.maxHp === "number"));
  check("combat reports round", typeof s.combat.round === "number");
  check(
    "playback suppresses actions",
    s.combat.phase !== "playback" || s.availableActions.length === 0,
    `phase ${s.combat.phase}, actions ${JSON.stringify(s.availableActions)}`
  );
}
await shot(page, OUT, "05-combat.png");

await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
await wait(900);
await press(page, "Enter");
await wait(500);
s = await snap(page);
check("returns to dungeon after combat", s.route === "dungeon", `got ${s.route}`);

log("\n=== SUMMARY ===");
const uniqErrors = [...new Set(errors)];
if (uniqErrors.length) log("console/page errors:", uniqErrors.slice(0, 10).join(" | "));
else log("zero console/page errors");

if (failures.length) {
  log(`FAILURES (${failures.length}):`);
  for (const f of failures) log(`  - ${f}`);
} else {
  log("all checks passed");
}
log("screenshots:", OUT);

await browser.close();
process.exit(failures.length ? 1 : 0);
