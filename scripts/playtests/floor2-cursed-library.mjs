/**
 * Floor 2 Cursed Library — browser verification for the redesign in PR #28.
 *
 * Covers:
 * - four-character party placement and basic navigation
 * - reading-hall reward event
 * - darkness tiles at (7,2) and (8,2)
 * - f2b forbidden-wing tileset behind the lexicon-key lock
 * - guardian climax chest at (12,8): open/flee/defeat/re-entry/victory loop
 * - save/load round-trip preserving pendingClimax
 * - post-victory furnace-key award
 *
 * Run: node scripts/playtests/floor2-cursed-library.mjs
 * Expects: npx vite preview --port 5176 --base /OnyxLabyrinth/
 */
import {
  launch,
  wait,
  press,
  snap,
  waitForIdle,
  bootToDungeon as libBootToDungeon,
  jumpTo,
  shot as libShot,
  ensureOutDir,
} from "./lib.mjs";

const BASE = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir("playtest-screenshots/floor2-cursed-library");

const failures = [];
function check(name, cond, detail = "") {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function shot(page, name) {
  const p = await libShot(page, OUT, name);
  console.log(`  shot ${name}`);
  return p;
}

async function state(page) {
  const [s, pendingClimax] = await Promise.all([
    snap(page),
    page.evaluate(() => window.__onyxDebug.state.pendingClimax),
  ]);
  const body = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 1200));
  return {
    route: s.route,
    floorId: s.floor.id,
    x: s.pos.x,
    y: s.pos.y,
    facing: s.pos.facing,
    inDarkness: s.flags.inDarkness,
    inAntimagic: s.flags.inAntimagic,
    pendingClimax,
    keys: s.keys,
    inv: s.inventory.map((e) => e.itemId),
    partySize: s.party.length,
    msg: s.message.text.replace(/\s+/g, " ").trim(),
    body,
  };
}

async function waitForRoute(page, route, timeout = 5000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const s = await snap(page);
    if (s.route === route) return s;
    if (Date.now() >= deadline) throw new Error(`timeout waiting for route ${route}`);
    await wait(100);
  }
}

async function bootToDungeon(page) {
  const st = await libBootToDungeon(page, BASE);
  if (st.route !== "dungeon") throw new Error(`boot failed: route ${st.route}`);
  return state(page);
}

function formatCell(x, y, facing) {
  return `(${x},${y})${[">", "v", "<", "^"][facing] ?? ""}`;
}

const browser = await launch({ viewport: { width: 1280, height: 800 } });
const { page } = browser;

try {
  console.log("=== Boot to Floor 2 start ===");
  await bootToDungeon(page);

  // Jump to Floor 2 with a full party and the lexicon key already in hand.
  await jumpTo(page, {
    floorId: 2,
    x: 2,
    y: 11,
    facing: 0,
    partyLevel: 9,
    keys: ["lexicon-key"],
    items: [{ itemId: "healing-potion", identified: true }],
    stepsSinceEncounter: 0,
  });
  let st = await state(page);
  check("four-character party", st.partySize === 4, `partySize=${st.partySize}`);
  check("lexicon key in hand", st.keys.includes("lexicon-key"), `keys=${st.keys}`);
  await shot(page, "00-floor2-start.png");

  // Face the reading-hall reward event at (7,6) and walk into it.
  console.log("=== Reading hall reward ===");
  await jumpTo(page, {
    floorId: 2,
    x: 7,
    y: 7,
    facing: 0,
    partyLevel: 9,
    keys: ["lexicon-key"],
    stepsSinceEncounter: 0,
  });
  await press(page, "ArrowUp"); // step onto (7,6)
  await waitForIdle(page);
  st = await state(page);
  check("reading-hall reward gives antidote", st.inv.includes("antidote"), `inv=${st.inv}`);
  await shot(page, "01-reading-hall.png");

  // Darkness tiles at (7,2) and (8,2). Step onto (7,2) from (6,2) so
  // handleTileFeature actually runs and sets inDarkness.
  console.log("=== Darkness tiles ===");
  await jumpTo(page, {
    floorId: 2,
    x: 6,
    y: 2,
    facing: 1,
    partyLevel: 9,
    keys: ["lexicon-key"],
    stepsSinceEncounter: 0,
  });
  await press(page, "ArrowUp"); // step onto (7,2)
  await waitForIdle(page);
  st = await state(page);
  check("in darkness at (7,2)", st.inDarkness, `inDarkness=${st.inDarkness}`);
  await shot(page, "02-darkness-7-2.png");

  // Forbidden wing (f2b tileset): the lexicon key unlocks the door at (10,7);
  // land inside the zone to capture the f2b recolor in use.
  console.log("=== Forbidden wing (f2b tileset) ===");
  await jumpTo(page, {
    floorId: 2,
    x: 11,
    y: 7,
    facing: 0,
    partyLevel: 9,
    keys: ["lexicon-key"],
    stepsSinceEncounter: 0,
  });
  st = await state(page);
  check("inside forbidden wing", st.x === 11 && st.y === 7, formatCell(st.x, st.y, st.facing));
  await shot(page, "03-forbidden-wing-f2b.png");

  // Guardian chest at (12,8). Step onto it from (12,9) so handleTileFeature
  // runs and the trap prompt opens.
  console.log("=== Guardian chest: open, flee, defeat, re-entry, victory ===");
  await jumpTo(page, {
    floorId: 2,
    x: 12,
    y: 9,
    facing: 0,
    partyLevel: 9,
    keys: ["lexicon-key"],
    stepsSinceEncounter: 0,
  });
  await press(page, "ArrowUp"); // step onto (12,8)
  await waitForIdle(page);
  st = await state(page);
  check("at furnace-key chest", st.x === 12 && st.y === 8, formatCell(st.x, st.y, st.facing));
  await press(page, "Enter"); // first key opens the trap prompt
  await wait(200);
  await press(page, "o"); // force the lid — alarm shrieks, guardian combat
  await waitForRoute(page, "combat", 5000);
  await shot(page, "04-guardian-combat-open.png");

  // Flee the first attempt.
  await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
  await waitForRoute(page, "dungeon", 5000);
  await wait(1200); // leaveCombat/transition cleanup
  st = await state(page);
  check("after fleeing, pendingClimax is set", st.pendingClimax?.id === "floor2-guardian", JSON.stringify(st.pendingClimax));
  check("furnace-key not in keyring yet", !st.keys.includes("furnace-key"), `keys=${st.keys}`);

  // Save the fled state and stand one tile south of the chest for re-entry.
  await jumpTo(page, {
    floorId: 2,
    x: 12,
    y: 9,
    facing: 0,
    partyLevel: 9,
    keys: ["lexicon-key"],
    stepsSinceEncounter: 0,
  });
  const fledSave = await page.evaluate(() => window.__onyxDebug.dumpSave());
  await shot(page, "05-guardian-fled.png");

  // Save/load round-trip: pendingClimax survives serialization.
  await page.evaluate((json) => window.__onyxDebug.loadSave(json), fledSave);
  await wait(1500);
  st = await state(page);
  check("pendingClimax restored after load", st.pendingClimax?.id === "floor2-guardian", JSON.stringify(st.pendingClimax));
  await shot(page, "06-after-load.png");

  // Re-open the chest: combat starts again from the unresolved climax.
  await press(page, "ArrowUp"); // step onto (12,8)
  await waitForIdle(page);
  await press(page, "Enter"); // open trap prompt
  await wait(200);
  await press(page, "o"); // force the lid — alarm, combat
  await waitForRoute(page, "combat", 5000);
  await shot(page, "07-guardian-reentry.png");

  // Force a defeat (wipe), then return from town to prove pendingClimax persists.
  await page.evaluate(() => window.__onyxDebug.exitDebugCombat("wipe"));
  await waitForRoute(page, "game_over", 5000);
  await wait(200); // let game-over controller arm
  await press(page, "Enter"); // dismiss game-over, go to town
  await waitForRoute(page, "town", 5000);
  // Town menu starts on Inn; arrow down to Enter Dungeon (index 6) and confirm.
  await press(page, "ArrowDown", 6);
  await press(page, "Enter");
  await waitForRoute(page, "dungeon", 5000);
  await jumpTo(page, {
    floorId: 2,
    x: 12,
    y: 9,
    facing: 0,
    partyLevel: 9,
    keys: ["lexicon-key"],
    stepsSinceEncounter: 0,
  });
  st = await state(page);
  check("pendingClimax persists after wipe/town re-entry", st.pendingClimax?.id === "floor2-guardian", JSON.stringify(st.pendingClimax));
  await shot(page, "08-after-wipe-reentry.png");

  // Final victory: re-enter the chest and win.
  await press(page, "ArrowUp"); // step onto (12,8)
  await waitForIdle(page);
  await press(page, "Enter"); // open trap prompt
  await wait(200);
  await press(page, "o"); // force the lid
  await waitForRoute(page, "combat", 5000);
  await shot(page, "09-guardian-final-combat.png");
  await page.evaluate(() => window.__onyxDebug.exitDebugCombat("victory"));
  await waitForRoute(page, "dungeon", 5000);
  await wait(1200);
  st = await state(page);
  check("victory awards furnace-key to keyring", st.keys.includes("furnace-key"), `keys=${st.keys}`);
  check("pendingClimax cleared", st.pendingClimax === undefined, JSON.stringify(st.pendingClimax));
  await shot(page, "10-post-victory-chest.png");
} catch (e) {
  console.error(e);
  failures.push(`uncaught: ${e.message}`);
} finally {
  await browser.browser.close();
}

console.log("\n=== Summary ===");
if (failures.length === 0) {
  console.log("ALL CHECKS PASSED");
  console.log(`Screenshots written to ${OUT}`);
  process.exit(0);
} else {
  console.log(`${failures.length} FAILURE(S)`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
