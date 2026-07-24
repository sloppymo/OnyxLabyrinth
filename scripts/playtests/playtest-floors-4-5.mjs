/**
 * Floors 4-5 — The Null Choir / The Weeping Cistern —
 * playtest of the 2026-07-24 campaign-progression sprint (Workstream D's new
 * floor 4-5 enemy tier + escalating Echo boss, Workstream C's shop depth
 * unlock). Twinned from scripts/playtests/playtest-floors-1-3.mjs.
 *
 * This is representative coverage, not floor-exhaustive like the F1-3 script:
 * critical path (stairs, both key gates per floor, shop unlock at
 * deepestFloorReached 4/5), one instance of each event kind, NPC, teleporter,
 * darkness/antimagic/water, and — the actual point of this script — a real
 * on-foot fight-count sample per floor to replace the design note's
 * unverified 6-15-fights/floor estimate with measured data.
 *
 * Run: node scripts/playtests/playtest-floors-4-5.mjs
 * Expects: npx vite preview --port 5230 --base /OnyxLabyrinth/
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE = "http://127.0.0.1:5230/OnyxLabyrinth/?debug=1";
const OUT = "playtest-screenshots/2026-07-24-floors-4-5";
fs.mkdirSync(OUT, { recursive: true });

const findings = [];
const log = (...a) => console.log(...a);
const find = (sev, floor, title, body = "") => {
  findings.push({ sev, floor, title, body });
  log(`[${sev}] F${floor} ${title}${body ? ` — ${body}` : ""}`);
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function press(page, key, n = 1) {
  for (let i = 0; i < n; i++) {
    await page.keyboard.press(key);
    await wait(90);
  }
}
async function shot(page, name) {
  const p = path.join(OUT, name);
  await page.screenshot({ path: p, fullPage: false });
  log("SHOT", name);
  return p;
}

async function snap(page) {
  return page.evaluate(() => {
    const d = window.__onyxDebug;
    const s = d.state;
    const msg = document.querySelector("#message");
    const msgText = msg
      ? (msg.textContent || "").replace(/\s+/g, " ").trim()
      : "";
    return {
      mode: s.mode,
      floorId: s.floor?.id,
      floorName: s.floor?.name,
      x: s.player.x,
      y: s.player.y,
      facing: s.player.facing,
      keys: [...(s.keys || [])],
      inAntimagic: s.inAntimagic,
      inDarkness: s.inDarkness,
      pendingTrap: s.pendingTrap,
      tile: s.floor.grid[s.player.y]?.[s.player.x]?.tile,
      msg: msgText,
      body: document.body.innerText.replace(/\s+/g, " ").slice(0, 900),
      gold: s.partyGold,
      inv: (s.inventory || []).map((e) => e.itemId),
      partyHp: s.party.map((c) => ({ n: c.name, hp: c.hp, max: c.maxHp })),
      deepestFloorReached: s.deepestFloorReached,
    };
  });
}

async function bootToTown(page) {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await wait(400);
  await press(page, "n");
  await wait(350);
  await press(page, "d");
  await wait(500);
  let st = await snap(page);
  if (st.mode === "party_creation") {
    await press(page, "Enter");
    await wait(400);
    st = await snap(page);
  }
  if (st.mode !== "town") {
    find("P0", 0, "Failed to reach town from boot", JSON.stringify(st));
  }
  return st;
}

/**
 * stepsSinceEncounter defaults to 0 (full 8-step cooldown ahead), not 8
 * (exactly at the cooldown threshold) — the latter lets combat roll on the
 * very first post-warp step, which then overwrites #message and masks the
 * single-step event/darkness/NPC checks used throughout this script. The
 * two dedicated pacing samples pass 8 explicitly since they want encounters
 * eligible immediately.
 */
async function warp(page, floorId, x, y, facing = 0, stepsSinceEncounter = 0) {
  await page.evaluate(
    ({ floorId, x, y, facing, stepsSinceEncounter }) => {
      const d = window.__onyxDebug;
      const src = d.findFloor(floorId);
      if (!src) throw new Error(`no floor ${floorId}`);
      d.state.floor = JSON.parse(JSON.stringify(src));
      d.state.player = { x, y, facing };
      d.state.explored = new Set();
      d.state.inDarkness = false;
      d.state.inAntimagic = false;
      d.state.pendingTrap = null;
      d.state.stepsSinceEncounter = stepsSinceEncounter;
      d.state.mode = "dungeon";
      // unlockedDoors is a session-persistent Set (game/state.ts), separate
      // from the floor's grid data — a "fresh" warp doesn't reset it on its
      // own, so a lockpick test earlier in the run would otherwise leave a
      // later "confirm the key opens it" check finding the door already
      // unlocked (see camera.ts tryUnlock's doorKey format).
      d.state.unlockedDoors.clear();
    },
    { floorId, x, y, facing, stepsSinceEncounter }
  );
  await wait(200);
}

async function stepForward(page) {
  await press(page, "ArrowUp");
  await wait(320);
}

async function face(page, target) {
  const cur = await page.evaluate(() => window.__onyxDebug.state.player.facing);
  let delta = (target - cur + 4) % 4;
  if (delta === 3) {
    await press(page, "ArrowLeft");
  } else {
    for (let i = 0; i < delta; i++) await press(page, "ArrowRight");
  }
  await wait(280);
}

/** Walk dirs on foot, auto-fleeing any incidental combat so the walk continues. */
async function walkDirs(page, dirs, floorLabel) {
  const map = { n: 0, e: 1, s: 2, w: 3 };
  for (const d of dirs) {
    await face(page, map[d]);
    await stepForward(page);
    const mode = await page.evaluate(() => window.__onyxDebug.state.mode);
    if (mode === "combat") {
      log(`  (combat interrupted walk on F${floorLabel}, debug-fleeing)`);
      await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
      await wait(500);
      await press(page, "Enter");
      await wait(300);
    }
  }
}

async function grantKey(page, keyId) {
  await page.evaluate((keyId) => {
    const k = window.__onyxDebug.state.keys;
    if (!k.includes(keyId)) k.push(keyId);
  }, keyId);
}

async function removeKey(page, keyId) {
  await page.evaluate((keyId) => {
    const k = window.__onyxDebug.state.keys;
    const idx = k.indexOf(keyId);
    if (idx >= 0) k.splice(idx, 1);
  }, keyId);
}

async function openTrap(page) {
  await press(page, "i");
  await wait(200);
  await press(page, "o");
  await wait(400);
}

/** See playtest-floors-1-3.mjs — briefly KO the party Thief so a lock-without-key probe reads clean. */
async function withThiefDisabled(page, fn) {
  const saved = await page.evaluate(() => {
    const d = window.__onyxDebug;
    const thief = d.state.party.find((c) => c.class === "Thief");
    if (!thief) return null;
    const prev = { hp: thief.hp, status: [...thief.status] };
    thief.hp = 0;
    if (!thief.status.includes("knockedOut")) thief.status.push("knockedOut");
    return prev;
  });
  const result = await fn();
  if (saved) {
    await page.evaluate((prev) => {
      const d = window.__onyxDebug;
      const thief = d.state.party.find((c) => c.class === "Thief");
      if (thief) {
        thief.hp = prev.hp;
        thief.status = prev.status;
      }
    }, saved);
  }
  return result;
}

function classifyUnlock(msg) {
  if (/unlock the door with|swings open/i.test(msg)) return "key";
  if (/picks the lock|clicks open/i.test(msg)) return "lockpick";
  if (/is locked\. you need/i.test(msg)) return "held";
  if (/already unlocked/i.test(msg)) return "already";
  return "unknown";
}

/**
 * Full locked-door probe: confirm the door holds with no key and the Thief
 * disabled, confirm Coda (Thief) can still lockpick it with no key (the
 * standing no-soft-lock guarantee), then confirm the key itself opens it.
 * approach = {x,y,facing} standing next to the door, already facing it.
 */
async function testLockedDoor(page, floorId, approach, keyId, label) {
  await warp(page, floorId, approach.x, approach.y, approach.facing);
  await removeKey(page, keyId);
  await withThiefDisabled(page, async () => {
    await press(page, "u");
    await wait(350);
  });
  let st = await snap(page);
  const heldClass = classifyUnlock(st.msg);
  log(`${label} no key, Thief disabled`, heldClass, st.msg, st.keys);
  if (heldClass === "key") {
    find("P0", floorId, `${label} opened WITHOUT ${keyId} (Thief disabled)`, st.msg);
  } else if (heldClass === "held") {
    log(`OK ${label} held without ${keyId} (Thief disabled)`);
  } else {
    find("P2", floorId, `Unexpected unlock message for held ${label}`, st.msg);
  }
  // Thief active, still no key — confirms lockpicking is live.
  await press(page, "u");
  await wait(350);
  st = await snap(page);
  const pickClass = classifyUnlock(st.msg);
  if (pickClass !== "lockpick") {
    find("P2", floorId, `Thief lockpicking did not trigger on ${label} with no key`, st.msg);
  } else {
    log(`OK Coda (Thief) can pick ${label} without the key`);
  }
  // Reset, then confirm the intended key path.
  await warp(page, floorId, approach.x, approach.y, approach.facing);
  await grantKey(page, keyId);
  await press(page, "u");
  await wait(350);
  st = await snap(page);
  if (classifyUnlock(st.msg) !== "key") {
    find("P1", floorId, `${label} did not open with ${keyId}`, st.msg);
  } else {
    log(`OK ${keyId} opens ${label}`);
  }
  return st;
}

const browser = await chromium.launch({ headless: true });
const page = await (
  await browser.newContext({ viewport: { width: 1280, height: 800 } })
).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});
page.on("crash", () => {
  errors.push("PAGE CRASHED");
  log("!!! page crashed !!!");
});

const t0 = Date.now();
const timings = {};

// ============================================================================
// BOOT + SHOP DEPTH UNLOCK (Workstream C)
// ============================================================================
log("=== BOOT: title -> New Game -> Default Party -> town ===");
let st = await bootToTown(page);
await shot(page, "00-boot-town.png");
log("boot", JSON.stringify({ ...st, body: undefined }));

log("\n=== Shop depth unlock: deepestFloorReached gates the buy list ===");
/**
 * FF6Window's selected-item marker ("▶") is CSS-generated content
 * (.ff6-menu-item.selected::before in styles.css) and does not show up in
 * document.body.innerText under Playwright/headless Chromium, so a
 * "search for ▶ via ArrowDown" loop never converges. FF6Window's rows do
 * carry a real onclick handler (attachPointerHandlers) that calls the same
 * onConfirm path as Enter, so click the item by its label text directly —
 * robust regardless of whatever selectedIndex the menu drifted to.
 */
async function clickMenuItem(page, labelSubstring) {
  await page.locator(`.ff6-menu-item:has-text("${labelSubstring}")`).first().click();
  await wait(300);
}
/**
 * Escape from the shop's buy tab lands back on the town main screen; a
 * second unconditional Escape from THERE triggers renderMain's onBack,
 * which opens the Save/Load overlay (mode "title", CLAUDE.md's "borrowed
 * title mode"). Stop as soon as the main screen's title text is visible
 * instead of pressing a fixed count.
 */
async function returnToTownMain(page, maxTries = 4) {
  for (let i = 0; i < maxTries; i++) {
    const body = await page.evaluate(() => document.body.innerText);
    if (/Town of Edgehollow/i.test(body)) return true;
    await press(page, "Escape");
    await wait(250);
  }
  return false;
}
async function shopPanelText(page) {
  return page.evaluate(() => document.querySelector("#combat-panel")?.innerText ?? document.body.innerText);
}
async function openShopBuy(page) {
  await returnToTownMain(page);
  await clickMenuItem(page, "Shop — Buy and sell equipment");
}

await openShopBuy(page);
let shopText = await shopPanelText(page);
await shot(page, "01-shop-tier1-default.png");
log("shop @ deepestFloorReached=1", await page.evaluate(() => window.__onyxDebug.state.deepestFloorReached), /Runeblade|Voidblade/i.test(shopText));
if (/Runeblade|Voidblade/i.test(shopText)) {
  find("P0", 0, "Tier 4/5 gear visible in shop at deepestFloorReached=1", shopText);
} else {
  log("OK shop capped below tier-4 gear at floor 1");
}
await returnToTownMain(page);

await page.evaluate(() => { window.__onyxDebug.state.deepestFloorReached = 4; });
await openShopBuy(page);
shopText = await shopPanelText(page);
await shot(page, "02-shop-tier4-unlocked.png");
log("shop @ deepestFloorReached=4", /Runeblade/i.test(shopText), /Voidblade|Dragonscale|Focus Ward/i.test(shopText));
if (!/Runeblade/i.test(shopText)) {
  find("P1", 4, "Runeblade (tier-4) not in shop at deepestFloorReached=4", shopText);
} else if (/Voidblade|Dragonscale Mail|Focus Ward/i.test(shopText)) {
  find("P1", 4, "Tier-5-only gear leaked into shop at deepestFloorReached=4", shopText);
} else {
  log("OK shop unlocks tier-4 (Runeblade/Mythril Plate/Sage's Circlet) exactly at floor 4, not tier-5");
}
await returnToTownMain(page);

await page.evaluate(() => { window.__onyxDebug.state.deepestFloorReached = 5; });
await openShopBuy(page);
shopText = await shopPanelText(page);
await shot(page, "03-shop-tier5-unlocked.png");
log("shop @ deepestFloorReached=5", /Voidblade/i.test(shopText));
if (!/Voidblade/i.test(shopText)) {
  find("P1", 5, "Voidblade (tier-5) not in shop at deepestFloorReached=5", shopText);
} else {
  log("OK shop unlocks tier-5 gear at floor 5");
}
await returnToTownMain(page);
// Reset for the rest of the run.
await page.evaluate(() => { window.__onyxDebug.state.deepestFloorReached = 1; });

// Enter the dungeon proper (lands F1 start) so the rest of the run is real
// dungeon-mode state, then jump to F4 the same way playtest-floors-1-3.mjs
// jumps mid-campaign after boot.
await returnToTownMain(page);
await clickMenuItem(page, "Enter Dungeon");
await wait(500);
st = await snap(page);
if (st.mode !== "dungeon") {
  find("P0", 0, "Failed to enter dungeon from town", JSON.stringify(st));
}

// ============================================================================
// FLOOR 4 — The Null Choir
// ============================================================================
const f4t0 = Date.now();
log("\n=== FLOOR 4: arrival, events, keys, antimagic nave, teleporter, NPC ===");
await warp(page, 4, 2, 2, 0);
st = await snap(page);
await shot(page, "10-f4-arrival.png");
log("F4 arrival", st.floorId, st.x, st.y, st.tile);
if (st.floorId !== 4 || st.tile !== "stairs_up") {
  find("P2", 4, "F4 start tile is not stairs_up as expected", JSON.stringify(st));
}

// Entry message event (3,2) — real on-foot step off the start tile.
await warp(page, 4, 2, 2, 1);
await walkDirs(page, ["e"], 4);
st = await snap(page);
await shot(page, "11-f4-event-message.png");
log("event(3,2) message", st.msg);
if (!/forge's roar|air holds its breath/i.test(st.msg)) {
  find("P2", 4, "Entry message event (3,2) not observed", st.msg);
} else {
  log("OK entry message event (3,2)");
}

// Damage event (10,2)
await warp(page, 4, 9, 2, 1);
await walkDirs(page, ["e"], 4);
st = await snap(page);
await shot(page, "12-f4-event-damage.png");
log("event(10,2) damage", st.msg, st.partyHp);
if (!/cracked bells|blood beads/i.test(st.msg)) {
  find("P2", 4, "Damage event (10,2) not observed", st.msg);
} else {
  log("OK damage event (10,2)");
}

// Reward event (13,5) + darkness pair (14,5)/(15,5)
// (13,5)'s only open approach is from the south — its w/n edges are walls.
await warp(page, 4, 13, 6, 0);
await walkDirs(page, ["n"], 4);
st = await snap(page);
await shot(page, "13-f4-event-reward.png");
log("event(13,5) reward", st.msg, st.inv);
if (!/hymnal|silver wire/i.test(st.msg)) {
  find("P2", 4, "Reward event (13,5) not observed", st.msg);
} else {
  log("OK reward event (13,5)");
}
await walkDirs(page, ["e", "e"], 4);
st = await snap(page);
await shot(page, "14-f4-darkness.png");
log("darkness(15,5)", st.inDarkness, st.tile);
if (!st.inDarkness && st.tile !== "darkness") {
  find("P2", 4, "Darkness not observed at (14,5)/(15,5)", JSON.stringify(st));
} else {
  log("OK darkness pair (14,5)/(15,5)");
}

// NPC Vesper (2,10)
await warp(page, 4, 2, 9, 2);
await walkDirs(page, ["s"], 4);
st = await snap(page);
await shot(page, "15-f4-npc-vesper.png");
const vesperOpen = st.mode === "title" || /Vesper/i.test(st.body + st.msg);
if (!vesperOpen) {
  find("P1", 4, "Vesper NPC panel did not open at (2,10)", JSON.stringify(st));
} else {
  log("OK Vesper panel opened");
  await press(page, "Escape");
  await wait(300);
}

// Antimagic nave corridor (8,7)-(8,10)
log("=== FLOOR 4: antimagic nave, choir-key + sanctum-key gates ===");
await warp(page, 4, 8, 6, 2);
await walkDirs(page, ["s"], 4);
st = await snap(page);
await shot(page, "16-f4-antimagic-nave.png");
log("antimagic(8,7)", st.inAntimagic, st.tile);
if (!st.inAntimagic && st.tile !== "antimagic") {
  find("P1", 4, "inAntimagic not set on the nave corridor (8,7)", JSON.stringify(st));
} else {
  log("OK antimagic nave corridor (8,7)-(8,10)");
}

// Teleporter (16,9) -> (13,13) same floor
await warp(page, 4, 15, 9, 1);
await walkDirs(page, ["e"], 4);
st = await snap(page);
await shot(page, "17-f4-teleporter.png");
log("teleporter land", st.x, st.y, st.msg);
if (st.x !== 13 || st.y !== 13) {
  find("P1", 4, "Teleporter (16,9) did not land at declared (13,13)", `${st.x},${st.y}`);
} else {
  log("OK teleporter (16,9) -> (13,13)");
}

// choir-key trapped chest (3,15), gas trap
await warp(page, 4, 3, 14, 2);
await walkDirs(page, ["s"], 4);
st = await snap(page);
await shot(page, "18-f4-choirkey-chest-trap.png");
log("choir-key chest(3,15)", st.pendingTrap, st.msg);
if (!st.pendingTrap) {
  find("P1", 4, "choir-key chest (3,15) gas trap prompt did not open", JSON.stringify(st));
} else {
  await openTrap(page);
  st = await snap(page);
  await shot(page, "19-f4-choirkey-chest-looted.png");
  if (!st.keys.includes("choir-key")) {
    find("P0", 4, "choir-key not acquired from (3,15) — blocks choir door", JSON.stringify(st.keys));
  } else {
    log("OK choir-key acquired");
  }
}

// sanctum-key chest (16,5), stunner trap
await warp(page, 4, 15, 5, 1);
await walkDirs(page, ["e"], 4);
st = await snap(page);
await shot(page, "20-f4-sanctumkey-chest-trap.png");
log("sanctum-key chest(16,5)", st.pendingTrap, st.msg);
if (!st.pendingTrap) {
  find("P1", 4, "sanctum-key chest (16,5) stunner trap prompt did not open", JSON.stringify(st));
} else {
  await openTrap(page);
  st = await snap(page);
  await shot(page, "21-f4-sanctumkey-chest-looted.png");
  if (!st.keys.includes("sanctum-key")) {
    find("P0", 4, "sanctum-key not acquired from (16,5) — blocks sanctum door", JSON.stringify(st.keys));
  } else {
    log("OK sanctum-key acquired");
  }
}

// lockedDoors entries are {x,y,dir} = "stand ON (x,y) facing dir", not one
// tile short of it — the door edge belongs to that tile, not its neighbor.
await testLockedDoor(page, 4, { x: 12, y: 8, facing: 1 }, "choir-key", "choir door (12,8)e");
await testLockedDoor(page, 4, { x: 13, y: 13, facing: 2 }, "sanctum-key", "sanctum door (13,13)s");

// Beyond the sanctum door — climax-reveal message (13,14). warp() reloads a
// fresh floor copy, discarding testLockedDoor's earlier unlock, and canMove()
// blocks "locked" edges outright (camera.ts) — the key alone doesn't open
// it, the door has to actually be unlocked via 'u' first.
await warp(page, 4, 13, 13, 2);
await grantKey(page, "sanctum-key");
await press(page, "u");
await wait(350);
await walkDirs(page, ["s"], 4);
st = await snap(page);
await shot(page, "22-f4-sanctum-reveal.png");
log("event(13,14) reveal", st.msg);
if (!/Choir turns to face you/i.test(st.msg)) {
  find("P2", 4, "Sanctum-door reveal message (13,14) not observed", st.msg);
} else {
  log("OK sanctum reveal message — Echo Remnant boss chamber approach confirmed reachable");
}

// Stairs down (15,15) -> F5
log("=== FLOOR 4: stairs down -> F5 ===");
await warp(page, 4, 15, 14, 2);
await shot(page, "23-f4-above-stairs.png");
await walkDirs(page, ["s"], 4);
st = await snap(page);
await shot(page, "24-f4-after-stairs-to-f5.png");
log("stairs f4->f5", JSON.stringify({ ...st, body: undefined }));
if (st.floorId !== 5) {
  find("P0", 4, "Stairs down at (15,15) did not lead to Floor 5", JSON.stringify(st));
} else {
  log(`OK F4 stairs_down -> F5 (${st.floorName}) landed (${st.x},${st.y})`);
  if (st.deepestFloorReached < 5) {
    find("P1", 5, "deepestFloorReached did not advance to 5 after taking F4's stairs down", JSON.stringify(st));
  } else {
    log("OK deepestFloorReached advanced to 5 via stairs (shop-unlock write path confirmed live in play)");
  }
}
timings.f4_ms = Date.now() - f4t0;

// ============================================================================
// FLOOR 4 pacing sample — quiet vs hot encounter zones, real on-foot steps
// ============================================================================
log("\n=== F4 pacing sample: encounter frequency in quiet vs hot zones ===");
/** Race a promise against a hard deadline so one stuck step can't hang the whole run. */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout: ${label}`)), ms)),
  ]);
}

async function pacingSample(floorId, x, y, facing, dirs, label) {
  await warp(page, floorId, x, y, facing, 8);
  let combats = 0;
  let stepsCompleted = 0;
  const map = { n: 0, e: 1, s: 2, w: 3 };
  for (const d of dirs) {
    try {
      await withTimeout(face(page, map[d]), 5000, `${label} face @step${stepsCompleted}`);
      await withTimeout(stepForward(page), 5000, `${label} stepForward @step${stepsCompleted}`);
      const mode = await withTimeout(
        page.evaluate(() => window.__onyxDebug.state.mode),
        5000,
        `${label} mode-check @step${stepsCompleted}`
      );
      if (mode === "combat") {
        combats++;
        await withTimeout(
          page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled")),
          5000,
          `${label} exitDebugCombat @step${stepsCompleted}`
        );
        await wait(400);
        await press(page, "Enter");
        await wait(250);
      }
      stepsCompleted++;
    } catch (e) {
      find("P1", floorId, `Pacing sample "${label}" stalled and was aborted early`, `${e} (completed ${stepsCompleted}/${dirs.length} steps, ${combats} encounters so far)`);
      break;
    }
  }
  log(`  ${label}: ${combats} encounters over ${stepsCompleted}/${dirs.length} steps`);
  return combats;
}
const osc32 = Array.from({ length: 32 }, (_, i) => (i % 2 === 0 ? "e" : "w"));
const f4QuietCombats = await pacingSample(4, 1, 8, 1, osc32, "F4 vestry-quiet zone (rateMul 0)");
const f4HotCombats = await pacingSample(4, 6, 13, 1, osc32, "F4 ambulatory-din zone (rateMul 1.6)");
log(`F4 pacing: quiet=${f4QuietCombats}/32 hot=${f4HotCombats}/32`);

// ============================================================================
// FLOOR 5 — The Weeping Cistern
// ============================================================================
const f5t0 = Date.now();
log("\n=== FLOOR 5: arrival, events, keys, water hazard, teleporter, NPC ===");
await warp(page, 5, 2, 2, 0);
st = await snap(page);
await shot(page, "30-f5-arrival.png");
log("F5 arrival", st.floorId, st.x, st.y, st.tile);
if (st.floorId !== 5 || st.tile !== "stairs_up") {
  find("P2", 5, "F5 start tile is not stairs_up as expected", JSON.stringify(st));
}

// Entry message event (2,3)
await warp(page, 5, 2, 2, 2);
await walkDirs(page, ["s"], 5);
st = await snap(page);
await shot(page, "31-f5-event-message.png");
log("event(2,3) message", st.msg);
if (!/forge-heat gives way|water is mov/i.test(st.msg)) {
  find("P2", 5, "Entry message event (2,3) not observed", st.msg);
} else {
  log("OK entry message event (2,3)");
}

// NPC Ossian (2,7)
await warp(page, 5, 2, 6, 2);
await walkDirs(page, ["s"], 5);
st = await snap(page);
await shot(page, "32-f5-npc-ossian.png");
const ossianOpen = st.mode === "title" || /Ossian/i.test(st.body + st.msg);
if (!ossianOpen) {
  find("P1", 5, "Ossian NPC panel did not open at (2,7)", JSON.stringify(st));
} else {
  log("OK Ossian panel opened");
  await press(page, "Escape");
  await wait(300);
}

// Reward event (3,8) -> holy-symbol
await warp(page, 5, 2, 8, 1);
await walkDirs(page, ["e"], 5);
st = await snap(page);
await shot(page, "33-f5-event-reward.png");
log("event(3,8) reward", st.msg, st.inv);
if (!st.inv.includes("holy-symbol") && !/holy symbol/i.test(st.msg)) {
  find("P2", 5, "Reward event (3,8) holy-symbol not confirmed", JSON.stringify({ msg: st.msg, inv: st.inv }));
} else {
  log("OK reward event (3,8) — holy-symbol");
}

// Damage event (9,9) and heal event (9,12), darkness pair (11,11)/(11,12)
// (9,9)'s only open approach is from the south — its e/w edges are walls
// and its n edge is the sluice gate (locked until later in this floor).
await warp(page, 5, 9, 10, 0);
await walkDirs(page, ["n"], 5);
st = await snap(page);
await shot(page, "34-f5-event-damage.png");
log("event(9,9) damage", st.msg, st.partyHp);
if (!/current through the choke/i.test(st.msg)) {
  find("P2", 5, "Damage event (9,9) not observed", st.msg);
} else {
  log("OK damage event (9,9)");
}
await warp(page, 5, 9, 11, 2);
await walkDirs(page, ["s"], 5);
st = await snap(page);
await shot(page, "35-f5-event-heal.png");
log("event(9,12) heal", st.msg, st.partyHp);
if (!/quiet eddy/i.test(st.msg)) {
  find("P2", 5, "Heal event (9,12) not observed", st.msg);
} else {
  log("OK heal event (9,12)");
}
await warp(page, 5, 11, 10, 2);
await walkDirs(page, ["s"], 5);
st = await snap(page);
await shot(page, "36-f5-darkness.png");
log("darkness(11,11)", st.inDarkness, st.tile);
if (!st.inDarkness && st.tile !== "darkness") {
  find("P2", 5, "Darkness not observed at (11,11)", JSON.stringify(st));
} else {
  log("OK darkness (11,11)/(11,12)");
}

// Deep-water damage pair (13,13)/(14,13), depth 2
await warp(page, 5, 12, 13, 1);
await walkDirs(page, ["e"], 5);
st = await snap(page);
await shot(page, "37-f5-deepwater.png");
log("deep water(13,13)", st.tile, st.msg, st.partyHp);
if (st.tile !== "water" && !/water|current|drag/i.test(st.msg)) {
  find("P2", 5, "Deep water (13,13) message/tile not clearly observed", JSON.stringify({ tile: st.tile, msg: st.msg }));
} else {
  log("OK deep water (13,13)/(14,13) — depth 2 damage tile");
}

// Teleporter (15,14) -> (3,6) same floor
await warp(page, 5, 14, 14, 1);
await walkDirs(page, ["e"], 5);
st = await snap(page);
await shot(page, "38-f5-teleporter.png");
log("teleporter land", st.x, st.y, st.msg);
if (st.x !== 3 || st.y !== 6) {
  find("P1", 5, "Teleporter (15,14) did not land at declared (3,6)", `${st.x},${st.y}`);
} else {
  log("OK teleporter (15,14) -> (3,6)");
}

// sluice-key chest (12,1), gas trap
log("=== FLOOR 5: sluice-key + undersong-key gates, boss-vault reveal ===");
await warp(page, 5, 11, 1, 1);
await walkDirs(page, ["e"], 5);
st = await snap(page);
await shot(page, "39-f5-sluicekey-chest-trap.png");
log("sluice-key chest(12,1)", st.pendingTrap, st.msg);
if (!st.pendingTrap) {
  find("P1", 5, "sluice-key chest (12,1) gas trap prompt did not open", JSON.stringify(st));
} else {
  await openTrap(page);
  st = await snap(page);
  await shot(page, "40-f5-sluicekey-chest-looted.png");
  if (!st.keys.includes("sluice-key")) {
    find("P0", 5, "sluice-key not acquired from (12,1) — blocks sluice gate", JSON.stringify(st.keys));
  } else {
    log("OK sluice-key acquired");
  }
}

// undersong-key chest (15,10), stunner trap
await warp(page, 5, 14, 10, 1);
await walkDirs(page, ["e"], 5);
st = await snap(page);
await shot(page, "41-f5-undersongkey-chest-trap.png");
log("undersong-key chest(15,10)", st.pendingTrap, st.msg);
if (!st.pendingTrap) {
  find("P1", 5, "undersong-key chest (15,10) stunner trap prompt did not open", JSON.stringify(st));
} else {
  await openTrap(page);
  st = await snap(page);
  await shot(page, "42-f5-undersongkey-chest-looted.png");
  if (!st.keys.includes("undersong-key")) {
    find("P0", 5, "undersong-key not acquired from (15,10) — blocks boss vault", JSON.stringify(st.keys));
  } else {
    log("OK undersong-key acquired");
  }
}

await testLockedDoor(page, 5, { x: 9, y: 8, facing: 2 }, "sluice-key", "sluice gate (9,8)s");
await testLockedDoor(page, 5, { x: 11, y: 14, facing: 2 }, "undersong-key", "undersong vault door (11,14)s");

// Beyond the undersong door — climax-reveal message (11,15). Same
// unlock-before-walk requirement as the F4 sanctum reveal above.
await warp(page, 5, 11, 14, 2);
await grantKey(page, "undersong-key");
await press(page, "u");
await wait(350);
await walkDirs(page, ["s"], 5);
st = await snap(page);
await shot(page, "43-f5-boss-vault-reveal.png");
log("event(11,15) reveal", st.msg);
if (!/water goes still/i.test(st.msg)) {
  find("P2", 5, "Boss-vault reveal message (11,15) not observed", st.msg);
} else {
  log("OK boss-vault reveal message — Echo Ascendant chamber approach confirmed reachable");
}

// No stairs_down on F5 — it is the current campaign end. Sanity-confirm this
// is deliberate content state, not a broken/missing tile.
const hasStairsDown = st.body.length >= 0 && (await page.evaluate(() => {
  const g = window.__onyxDebug.state.floor.grid;
  return g.some((row) => row.some((c) => c.tile === "stairs_down"));
}));
if (hasStairsDown) {
  find("P2", 5, "F5 unexpectedly has a stairs_down tile — campaign-end assumption below is stale", "");
} else {
  log("OK confirmed F5 has no stairs_down — current campaign end, matches design note");
}
timings.f5_ms = Date.now() - f5t0;

// ============================================================================
// FLOOR 5 pacing sample — quiet vs hot encounter zones, real on-foot steps
// ============================================================================
log("\n=== F5 pacing sample: encounter frequency in quiet vs hot zones ===");
const f5QuietCombats = await pacingSample(5, 1, 5, 1, osc32, "F5 drip-vestry-safe zone (rateMul 0)");
const f5HotCombats = await pacingSample(5, 6, 10, 1, osc32, "F5 bell-well-hot zone (rateMul 1.7)");
log(`F5 pacing: quiet=${f5QuietCombats}/32 hot=${f5HotCombats}/32`);

// ============================================================================
// Wrap-up
// ============================================================================
const uniqErrors = [...new Set(errors)];
if (uniqErrors.length) {
  find("P1", 0, "Console/page errors during playtest", uniqErrors.slice(0, 12).join(" | "));
} else {
  log("OK zero console/page errors across the full run");
}

timings.total_ms = Date.now() - t0;

const report = {
  findings,
  errors: uniqErrors,
  timings,
  pacing: {
    f4: { quiet: f4QuietCombats, hot: f4HotCombats, sample: 32 },
    f5: { quiet: f5QuietCombats, hot: f5HotCombats, sample: 32 },
  },
  outDir: OUT,
};
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
log("\n=== SUMMARY ===");
log("findings:", findings.length);
for (const f of findings) log(`  [${f.sev}] F${f.floor} ${f.title}`);
log("screenshots:", OUT);
log("timings (ms):", JSON.stringify(timings));
log("pacing:", JSON.stringify(report.pacing));
await browser.close();
