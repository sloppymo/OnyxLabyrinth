/**
 * Smoke test for the ?debug=1 snapshot surface (PR-1) and the quiescence
 * surface (PR-2: isIdle()/readiness()).
 *
 * Walks the game to each distinct input route and asserts that
 * `__onyxDebug.snapshot()` reports the right `route` and `availableActions` —
 * in particular that the overlays which borrow game mode "title" (save menu,
 * grimoire, NPC panel, perk select) are told apart from the title screen.
 * Also exercises `isIdle()`/`readiness()` around a dungeon move, the
 * town<->dungeon mode fade, and combat playback — the exhaustive truth table
 * for the idle predicate itself lives in src/debug/idle.test.ts (Vitest);
 * this script only proves the live wiring agrees with it.
 *
 * Run: node scripts/playtests/smoke-debug-surface.mjs
 * Expects: npx vite preview --port 5176 --base /OnyxLabyrinth/
 */
import {
  launch,
  wait,
  press,
  snap,
  snapWithMap,
  waitForIdle,
  ensureOutDir,
  shot,
} from "./lib.mjs";

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

// No keydown has fired yet, so resume() (audio's one-shot autoplay-gate
// listener) hasn't run and no AudioContext exists — this is the case the
// tri-state design exists for: "not-started" must stay distinct from a
// failure, and this is the one moment in the whole run where it's provable.
const readyAtBoot = await page.evaluate(() => window.__onyxDebug.readiness());
check(
  "audio sample families are not-started before the first keydown",
  readyAtBoot.audioUi === "not-started" &&
    readyAtBoot.audioCombat === "not-started" &&
    readyAtBoot.audioDungeon === "not-started",
  JSON.stringify(readyAtBoot)
);

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
  // openTown() -> transitionToMode("town"): a real mode-fade, tracked by
  // modeTransitionPending. Race-prone same as the dungeon-move check above —
  // informational only; the hard assertion is that it settles afterward.
  const midFadeIdle = await page.evaluate(() => window.__onyxDebug.isIdle());
  log(`  info: isIdle() immediately after confirming the party = ${midFadeIdle}`);
  await wait(500);
  s = await snap(page);
  check("idle once the town fade settles", s.idle === true, `got ${s.idle}`);
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
check("idle at rest in the dungeon", s.idle === true, `got ${s.idle}`);
await shot(page, OUT, "03-dungeon.png");

log("=== isIdle() around a dungeon move (render-camera tween) ===");
await press(page, "ArrowUp");
// Race-prone (150ms move animation vs. Playwright round-trip) — informational
// only. The exhaustive, deterministic truth table lives in idle.test.ts; this
// just checks the live wiring eventually agrees with it.
const midMoveIdle = await page.evaluate(() => window.__onyxDebug.isIdle());
log(`  info: isIdle() immediately after a forward step = ${midMoveIdle}`);
const moveSettled = await waitForIdle(page, 1000);
check("isIdle() settles after a move", moveSettled);
s = await snap(page);
check("snapshot().idle agrees with isIdle() at rest", s.idle === true, `got ${s.idle}`);

log("=== readiness() ===");
const ready = await page.evaluate(() => window.__onyxDebug.readiness());
const TRI = ["not-started", "loading", "done"];
check("readiness reports fonts settled", ready.fonts === true, JSON.stringify(ready));
check("readiness reports textures settled", ready.textures === true);
check(
  "readiness reports sprite prewarms settled",
  ready.enemySprites === true &&
    ready.partySprites === true &&
    ready.effectSprites === true &&
    ready.mapSprites === true,
  JSON.stringify(ready)
);
check(
  "readiness audio fields are valid tri-state",
  TRI.includes(ready.audioUi) && TRI.includes(ready.audioCombat) && TRI.includes(ready.audioDungeon),
  JSON.stringify(ready)
);
check("readiness.failed is an array", Array.isArray(ready.failed));

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
const combatStartSnap = await snap(page);
log(
  `  info: immediately after startCombat, phase=${combatStartSnap.combat?.phase}, idle=${combatStartSnap.idle}`
);
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
  // Deterministic regardless of which phase we happened to sample (unlike
  // the boot-time snapshot above, which is informational only): idle must
  // always agree with "not mid-playback" while nothing else (mode fade,
  // camera tween, prologue) is in play, which is the case throughout combat.
  check(
    "idle agrees with playback state",
    s.idle === (s.combat.phase !== "playback" || s.combat.playbackDone),
    `idle=${s.idle} phase=${s.combat.phase} playbackDone=${s.combat.playbackDone}`
  );
}
await shot(page, OUT, "05-combat.png");

await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
await wait(900);
await press(page, "Enter");
await wait(500);
s = await snap(page);
check("returns to dungeon after combat", s.route === "dungeon", `got ${s.route}`);

// --- PR-3: jumpTo / dumpSave / loadSave -----------------------------------
log("=== jumpTo F4 ===");
await page.evaluate(() =>
  window.__onyxDebug.jumpTo({ floorId: 4, x: 2, y: 2, facing: 0 })
);
await waitForIdle(page);
s = await snap(page);
check("jumpTo lands on F4", s.floor?.id === 4 && s.pos?.x === 2 && s.pos?.y === 2, JSON.stringify({
  floor: s.floor, pos: s.pos,
}));
check(
  "jumpTo advances deepestFloorReached",
  (await page.evaluate(() => window.__onyxDebug.state.deepestFloorReached)) >= 4
);
check("jumpTo route is dungeon", s.route === "dungeon", `got ${s.route}`);
await shot(page, OUT, "06-jumpTo-f4.png");

log("=== jumpTo preserves killed NPCs (warp() bug) ===");
await page.evaluate(() => {
  const d = window.__onyxDebug;
  if (!d.state.killedNPCs.includes("maro")) d.state.killedNPCs.push("maro");
  d.jumpTo({ floorId: 1, x: 3, y: 6, facing: 0 });
});
await waitForIdle(page);
const maroGone = await page.evaluate(() => {
  const floor = window.__onyxDebug.state.floor;
  const maro = (floor.npcs ?? []).find((n) => n.id === "maro");
  if (!maro) return true;
  // applyKilledNPCs clears the tile feature; the NPC def stays on the floor list.
  return floor.grid[maro.y]?.[maro.x]?.tile !== "npc";
});
check("killed NPC stays dead after jumpTo back to F1", maroGone);

log("=== dumpSave / loadSave round-trip ===");
const dumped = await page.evaluate(() => window.__onyxDebug.dumpSave());
check("dumpSave returns JSON string", typeof dumped === "string" && dumped.length > 50);
await page.evaluate((json) => {
  // Jump away first so loadSave has something to restore against.
  window.__onyxDebug.jumpTo({ floorId: 2, x: 2, y: 11, facing: 0 });
  window.__onyxDebug.loadSave(json);
}, dumped);
await waitForIdle(page);
s = await snap(page);
check(
  "loadSave restores F1 position from dump",
  s.floor?.id === 1 && s.pos?.x === 3 && s.pos?.y === 6,
  JSON.stringify({ floor: s.floor, pos: s.pos, route: s.route })
);

log("=== jumpTo autosave:false leaves autosave slot untouched ===");
const autosaveProbe = await page.evaluate(() => {
  const KEY = "wizardry-clone-autosave";
  localStorage.setItem(KEY, JSON.stringify({ marker: "pr3-sentinel" }));
  window.__onyxDebug.jumpTo({
    floorId: 3,
    x: 2,
    y: 2,
    facing: 0,
    autosave: false,
  });
  const raw = localStorage.getItem(KEY);
  let marker = null;
  try {
    marker = JSON.parse(raw)?.marker ?? null;
  } catch {
    marker = "parse-failed";
  }
  return { marker, floorId: window.__onyxDebug.state.floor.id };
});
check(
  "autosave:false does not overwrite autosave slot",
  autosaveProbe.marker === "pr3-sentinel",
  JSON.stringify(autosaveProbe)
);
check("autosave:false still jumps", autosaveProbe.floorId === 3);

log("=== lib boot({scenario}) ===");
await page.goto(BASE, { waitUntil: "networkidle" });
await wait(400);
const bootSnap = await page.evaluate(() => {
  window.__onyxDebug.jumpTo({ floorId: 4, x: 2, y: 2, facing: 1 });
  return window.__onyxDebug.snapshot();
});
check(
  "title→jumpTo skips prologue (boot scenario)",
  bootSnap.route === "dungeon" && bootSnap.floor?.id === 4,
  JSON.stringify({ route: bootSnap.route, floor: bootSnap.floor })
);

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
