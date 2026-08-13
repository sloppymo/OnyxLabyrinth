/**
 * Browser verification for the Floor 3 "Duelist's Vigil" content pass:
 *  - The Grand Forge trophy chest is a guaranteed, non-diluted climax
 *    (guardian formation fights every time, not a random-table roll).
 *  - The fused-smith event grants the smith's signet ring on step.
 *  - Kazeharu's recruitment gate (master topic -> ring -> join) and his
 *    presence as a combat-only guest ally in the Grand Forge fight.
 *  - Post-fight outcome: joined & survived awards the keepsake blade and
 *    changes his return dialogue; declining leaves the climax and his
 *    dialogue untouched.
 *
 * Uses `?debug=1` (__onyxDebug: jumpTo/state/exitDebugCombat) the same way
 * the project's other playtest scripts do. Disclosed debug shortcuts:
 *  - jumpTo() to position the party near each interaction instead of a full
 *    walk from the Floor 3 entrance (the floor layout itself is exercised
 *    by floor-validate and the BFS reachability tests in floors.test.ts).
 *  - exitDebugCombat("victory") to resolve the Grand Forge fight instead of
 *    playing out full FF6 combat turns — this still runs the real
 *    endCombat()/resolveClimaxVictory()/resolveKazeharuAfterForge() code
 *    path, it just skips manually depleting enemy HP through the UI.
 *
 * Run: node scripts/playtests/floor3-duelists-vigil.mjs
 * Expects: npx vite preview --port 5176 --base /OnyxLabyrinth/
 */
import { launch, wait, press, snap, ensureOutDir, shot, jumpTo } from "./lib.mjs";

const BASE = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir("playtest-screenshots/floor3-duelists-vigil");

const failures = [];
function check(name, cond, detail = "") {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function typeWord(page, word) {
  for (const ch of word) {
    await page.keyboard.press(ch);
    await wait(30);
  }
}

async function acknowledgeFully(page, max = 10) {
  // Cinematic NPC dialogue gates actions until the current beat has both
  // finished revealing and been acknowledged.  Keep this playtest aligned
  // with that contract instead of letting Enter accidentally activate a
  // newly rebuilt menu row.
  for (let i = 0; i < max; i++) {
    const done = await page.evaluate(() => {
      const c = window.__onyxDebug.npcController;
      return !c || (c.textRevealed && c.acknowledged);
    });
    if (done) return;
    await press(page, "Enter");
    await wait(60);
  }
}

/** Poll snap() until route matches (boss-appear intros etc. take longer
 *  than a fixed wait can reliably cover). Returns the settled snapshot. */
async function waitForRoute(page, expected, timeout = 5000, interval = 100) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const s = await snap(page);
    if (s.route === expected) return s;
    if (Date.now() >= deadline) return s;
    await wait(interval);
  }
}

/** Press Escape until the NPC panel (or any "title"-borrowing overlay) is
 *  fully closed and route is back to "dungeon". */
async function closeOverlay(page, maxPresses = 4) {
  for (let i = 0; i < maxPresses; i++) {
    const s = await snap(page);
    if (s.route === "dungeon") return s;
    await press(page, "Escape");
    await wait(250);
  }
  return snap(page);
}

const { browser, page } = await launch();

// ===========================================================================
// Leg 1: decline path — never talk to Kazeharu. The Grand Forge climax must
// still fire deterministically, without him, and his dialogue must stay
// exactly as authored afterward.
// ===========================================================================
console.log("=== Leg 1: Grand Forge climax fires without Kazeharu ===");
await page.goto(BASE, { waitUntil: "networkidle" });
await wait(400);
// Suppress ambient random encounters during scripted real-keypress steps
// (Floor 3 has a nonzero encounterRate + pity) so only the deliberate
// alarm-triggered guardian fight ever starts. The guardian formation
// itself is unaffected: ENCOUNTER_TABLES[7] has exactly one weighted
// entry, so the roll is deterministic regardless of the RNG value.
await page.evaluate(() => window.__onyxDebug.setGameplayRng(() => 0.999));
await jumpTo(page, { floorId: 3, x: 10, y: 13, facing: 3 }); // facing west, adjacent to the chest

let s = await snap(page);
check("landed on Floor 3", s.floor?.id === 3, JSON.stringify(s.floor));

await press(page, "ArrowUp"); // step onto the trophy chest (9,13)
await wait(400);
s = await snap(page);
check("stepping on the trophy chest opens a trap prompt", s.route === "trap" && s.pos?.x === 9 && s.pos?.y === 13, JSON.stringify({ route: s.route, pos: s.pos }));
await shot(page, OUT, "01-trophy-chest-trap-prompt.png");

const pendingBeforeOpen = await page.evaluate(() => window.__onyxDebug.state.pendingClimax);
console.log("  debug pendingClimax before open:", JSON.stringify(pendingBeforeOpen));
await press(page, "o"); // Open — fires the alarm, forces the guardian combat
s = await waitForRoute(page, "combat");
check("opening the chest starts the guardian combat", s.route === "combat", `got ${s.route}`);
const pendingAfterOpen = await page.evaluate(() => window.__onyxDebug.state.pendingClimax);
console.log("  debug pendingClimax after open (combat started):", JSON.stringify(pendingAfterOpen));
await shot(page, OUT, "02-grand-forge-combat-no-kazeharu.png");

const noKazeharuAllies = await page.evaluate(() => window.__onyxDebug.state.combat?.summonedAllies ?? []);
check("no guest ally present when Kazeharu was never recruited", noKazeharuAllies.length === 0, JSON.stringify(noKazeharuAllies));

const climaxIdBefore = await page.evaluate(() => window.__onyxDebug.state.combat?.climaxId);
check("combat is tagged with the floor3-guardian climax id", climaxIdBefore === "floor3-guardian", `got ${climaxIdBefore}`);

await page.evaluate(() => window.__onyxDebug.exitDebugCombat("victory"));
await wait(900);
await press(page, "Enter");
s = await waitForRoute(page, "dungeon");
check("returns to dungeon after the forced victory", s.route === "dungeon", `got ${s.route}`);

const afterDecline = await page.evaluate(() => ({
  pendingClimax: window.__onyxDebug.state.pendingClimax,
  kazeharuOutcome: window.__onyxDebug.state.kazeharuOutcome,
  // great-sword+2/plate-mail+2 auto-equip onto the best party member
  // (features.ts's awardTreasure -> findBestEquipTarget) rather than
  // sitting in inventory, same as any other weapon/armor chest — so the
  // durable proof the trophy was actually looted is lootTaken, not a
  // specific inventory entry.
  trophyLooted: window.__onyxDebug.state.lootTaken[3]?.has("9,13") ?? false,
  gotAHealingPotion: window.__onyxDebug.state.inventory.filter((e) => e.itemId === "healing-potion").length >= 2,
}));
check("the climax resolves (pendingClimax cleared) even without Kazeharu", afterDecline.pendingClimax === undefined, JSON.stringify(afterDecline));
check("the trophy chest is recorded as looted (lootTaken)", afterDecline.trophyLooted, JSON.stringify(afterDecline));
check("the trophy's healing potions land in inventory (not auto-equipped)", afterDecline.gotAHealingPotion, JSON.stringify(afterDecline));
check("kazeharuOutcome stays unset — he was never in this fight", afterDecline.kazeharuOutcome === undefined, JSON.stringify(afterDecline));

// Talk to him afterward: his dialogue must be exactly as authored, since
// skipping the recruitment thread must never be punished.
await jumpTo(page, { floorId: 3, x: 2, y: 9, facing: 1 });
await press(page, "ArrowUp"); // step onto (3,9)
await wait(400);
s = await snap(page);
check("stepping onto Kazeharu opens the NPC panel", s.route === "npc" || s.mode === "title", `route=${s.route} mode=${s.mode}`);
await shot(page, OUT, "03-kazeharu-panel-declined-run.png");
const declineGreeting = await page.evaluate(() => document.querySelector("#combat-panel")?.textContent ?? "");
check(
  "his line is unchanged — no false 'vigil's over' text leaks in without recruitment",
  !declineGreeting.includes("vigil's over"),
  declineGreeting.slice(0, 200)
);
await closeOverlay(page);

// ===========================================================================
// Leg 2: recruit Kazeharu, bring him into the Grand Forge, he survives.
// ===========================================================================
console.log("=== Leg 2: recruit Kazeharu, he joins and survives ===");
await page.goto(BASE, { waitUntil: "networkidle" });
await wait(400);
await page.evaluate(() => window.__onyxDebug.setGameplayRng(() => 0.999));

// Recover the smith's signet ring first (one leg of the recruitment chain).
await jumpTo(page, { floorId: 3, x: 13, y: 9, facing: 1 }); // facing east, adjacent to (14,9)
await press(page, "ArrowUp");
await wait(400);
s = await snap(page);
const hasRing = await page.evaluate(() => window.__onyxDebug.state.inventory.some((e) => e.itemId === "smiths-signet-ring"));
check("stepping on the fused-smith event grants the signet ring", hasRing);
await shot(page, OUT, "04-smiths-ring-recovered.png");

// Talk to Kazeharu: ask about his master, then ask him to join.
await jumpTo(page, { floorId: 3, x: 2, y: 9, facing: 1 });
await press(page, "ArrowUp"); // step onto (3,9)
await wait(400);
s = await snap(page);
check("NPC panel opens on Kazeharu's tile", s.route === "npc" || s.mode === "title", `route=${s.route} mode=${s.mode}`);

await acknowledgeFully(page);

await press(page, "t"); // root -> Talk
await wait(200);
await press(page, "ArrowDown", 2); // topics (forge, duel) -> "Ask about..."
await wait(150);
await press(page, "Enter"); // enter ask phase
await wait(150);
await typeWord(page, "master");
await press(page, "Enter");
await wait(300);
let toldTruth = await page.evaluate(() => !!window.__onyxDebug.state.kazeharuToldTruth);
check("asking about his master sets kazeharuToldTruth", toldTruth);
await shot(page, OUT, "05-kazeharu-master-topic.png");
await acknowledgeFully(page);

await press(page, "ArrowDown", 2); // back to "Ask about..."
await wait(150);
await press(page, "Enter");
await wait(150);
await typeWord(page, "join");
await press(page, "Enter");
await wait(300);
let recruited = await page.evaluate(() => !!window.__onyxDebug.state.kazeharuRecruited);
check("asking to join (with both legs complete) recruits him", recruited);
await shot(page, OUT, "06-kazeharu-recruited.png");
await acknowledgeFully(page);
await closeOverlay(page);

// Save/load round-trip while recruited but before the climax — the flags
// must survive a save cycle.
const savedRecruited = await page.evaluate(() => window.__onyxDebug.dumpSave());
await page.evaluate((json) => {
  window.__onyxDebug.jumpTo({ floorId: 2, x: 2, y: 11, facing: 0 });
  window.__onyxDebug.loadSave(json);
}, savedRecruited);
await wait(400);
const afterReload = await page.evaluate(() => ({
  recruited: !!window.__onyxDebug.state.kazeharuRecruited,
  toldTruth: !!window.__onyxDebug.state.kazeharuToldTruth,
  hasRing: window.__onyxDebug.state.inventory.some((e) => e.itemId === "smiths-signet-ring"),
}));
check("recruitment state survives a save/load round-trip", afterReload.recruited && afterReload.toldTruth && afterReload.hasRing, JSON.stringify(afterReload));

// Into the Grand Forge.
await jumpTo(page, { floorId: 3, x: 10, y: 13, facing: 3 });
await press(page, "ArrowUp");
await wait(400);
await press(page, "o");
s = await waitForRoute(page, "combat");
check("the guardian combat starts with Kazeharu recruited", s.route === "combat", `got ${s.route}`);

const alliesWithKazeharu = await page.evaluate(() => window.__onyxDebug.state.combat?.summonedAllies ?? []);
check(
  "Kazeharu is present as a combat-only guest ally with his own identity",
  alliesWithKazeharu.some((a) => a.id === "kazeharu-guest" && a.name === "Kazeharu" && a.finishingStrikeBonus > 0),
  JSON.stringify(alliesWithKazeharu)
);
await shot(page, OUT, "07-grand-forge-combat-with-kazeharu.png");

await page.evaluate(() => window.__onyxDebug.exitDebugCombat("victory"));
await wait(900);
await press(page, "Enter");
await waitForRoute(page, "dungeon");

const afterSurvive = await page.evaluate(() => ({
  outcome: window.__onyxDebug.state.kazeharuOutcome,
  hasBlade: window.__onyxDebug.state.inventory.some((e) => e.itemId === "kazeharus-blade"),
  bladeCount: window.__onyxDebug.state.inventory.filter((e) => e.itemId === "kazeharus-blade").length,
}));
check("outcome is joinedSurvived", afterSurvive.outcome === "joinedSurvived", JSON.stringify(afterSurvive));
check("the keepsake blade is awarded exactly once", afterSurvive.hasBlade && afterSurvive.bladeCount === 1, JSON.stringify(afterSurvive));

// Return dialogue should now be the distinct "vigil's over" line.
await jumpTo(page, { floorId: 3, x: 2, y: 9, facing: 1 });
await press(page, "ArrowUp");
await wait(400);
await shot(page, OUT, "08-kazeharu-post-vigil-dialogue.png");
const returnText = await page.evaluate(() => document.querySelector("#combat-panel")?.textContent ?? "");
check("Kazeharu's return line reflects the vigil ending", returnText.includes("vigil's over"), returnText.slice(0, 200));
await closeOverlay(page);

// Re-entering the Grand Forge afterward must not refight the boss.
await jumpTo(page, { floorId: 3, x: 10, y: 13, facing: 3 });
await press(page, "ArrowUp");
await wait(500);
s = await snap(page);
check("re-entering the resolved Grand Forge does not restart the guardian fight", s.route === "dungeon", `got ${s.route}`);

// ===========================================================================
// Leg 3: recruit Kazeharu, he falls in the fight — outcome + no blade.
// ===========================================================================
console.log("=== Leg 3: Kazeharu falls in the Grand Forge ===");
await page.goto(BASE, { waitUntil: "networkidle" });
await wait(400);
await page.evaluate(() => window.__onyxDebug.setGameplayRng(() => 0.999));

await jumpTo(page, { floorId: 3, x: 13, y: 9, facing: 1 });
await press(page, "ArrowUp");
await wait(300);
await jumpTo(page, { floorId: 3, x: 2, y: 9, facing: 1 });
await press(page, "ArrowUp");
await wait(300);
await acknowledgeFully(page);
await press(page, "t");
await wait(150);
await press(page, "ArrowDown", 2);
await press(page, "Enter");
await typeWord(page, "master");
await press(page, "Enter");
await wait(150);
await acknowledgeFully(page);
await press(page, "ArrowDown", 2);
await press(page, "Enter");
await typeWord(page, "join");
await press(page, "Enter");
await wait(200);
await acknowledgeFully(page);
await closeOverlay(page);

await jumpTo(page, { floorId: 3, x: 10, y: 13, facing: 3 });
await press(page, "ArrowUp");
await wait(300);
await press(page, "o");
s = await waitForRoute(page, "combat");
check("guardian combat starts (leg 3)", s.route === "combat", `got ${s.route}`);

// Simulate Kazeharu dying mid-fight (deadAllyIds is the durable, whole-fight
// tracker — see game/combat-eor.ts allyDeathCheck).
await page.evaluate(() => {
  window.__onyxDebug.state.combat.deadAllyIds.push("kazeharu-guest");
});
await page.evaluate(() => window.__onyxDebug.exitDebugCombat("victory"));
await wait(900);
await press(page, "Enter");
await waitForRoute(page, "dungeon");

const afterFell = await page.evaluate(() => ({
  outcome: window.__onyxDebug.state.kazeharuOutcome,
  hasBlade: window.__onyxDebug.state.inventory.some((e) => e.itemId === "kazeharus-blade"),
}));
check("outcome is joinedFell when he died in the fight", afterFell.outcome === "joinedFell", JSON.stringify(afterFell));
check("no keepsake blade when he fell", !afterFell.hasBlade, JSON.stringify(afterFell));

// He's dead; the NPC tile should be cleared / unreachable — asserted via
// state directly rather than the panel, since there's no one left to talk to.
const kazeharuTileAfterFall = await page.evaluate(() => {
  const npc = window.__onyxDebug.state.floor.npcs?.find((n) => n.id === "kazeharu");
  return npc ? window.__onyxDebug.state.floor.grid[npc.y]?.[npc.x]?.tile : "no-npc-def";
});
check(
  "his tile is not left as a live 'npc' feature once he's gone from the story",
  kazeharuTileAfterFall !== "npc",
  `tile=${kazeharuTileAfterFall}`
);

console.log("\n=== Summary ===");
console.log(`${failures.length === 0 ? "ALL CHECKS PASSED" : `${failures.length} FAILURE(S)`}`);
for (const f of failures) console.log(`  - ${f}`);

await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
