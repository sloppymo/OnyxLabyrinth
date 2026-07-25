/**
 * Floors 1-3 — The Flooded Crypt / The Cursed Library / The Forge of Ashes —
 * playtest of the 2026-07-20 landmark-rooms redesign (commit d60db8c).
 * Run: node scripts/playtests/playtest-floors-1-3.mjs
 * Expects: npx vite preview --port 5230 --base /OnyxLabyrinth/
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
  createFindings,
  ensureOutDir,
  writeReport,
} from "./lib.mjs";

const BASE = "http://127.0.0.1:5230/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir("playtest-screenshots/2026-07-20-floors-1-3");

const log = (...a) => console.log(...a);
const { findings, find } = createFindings({ log });

async function shot(page, name) {
  const p = await libShot(page, OUT, name);
  log("SHOT", name);
  return p;
}

/**
 * Flatten the engine snapshot (src/debug/snapshot.ts) into the field names
 * this script was written against, and attach `body` (page innerText), which
 * the snapshot deliberately doesn't carry. `route` is passed through so
 * assertions can tell borrowed-"title" overlays apart.
 */
async function state(page) {
  const [s, body] = await Promise.all([
    snap(page),
    page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 900)),
  ]);
  return {
    mode: s.mode,
    route: s.route,
    floorId: s.floor.id,
    floorName: s.floor.name,
    theme: s.floor.theme,
    x: s.pos.x,
    y: s.pos.y,
    facing: s.pos.facing,
    keys: s.keys,
    inAntimagic: s.flags.inAntimagic,
    inDarkness: s.flags.inDarkness,
    pendingTrap: s.flags.pendingTrap,
    tile: s.tile ?? undefined,
    msg: s.message.text.replace(/\s+/g, " ").trim(),
    msgVis: s.message.visible,
    body,
    gold: s.gold,
    inv: s.inventory.map((e) => e.itemId),
    partyHp: s.party.map((c) => ({ n: c.name, hp: c.hp, max: c.maxHp })),
    availableActions: s.availableActions,
  };
}

async function bootToDungeon(page) {
  const booted = await libBootToDungeon(page, BASE);
  if (booted.route !== "dungeon") {
    find("P0", 1, "Failed to reach dungeon from boot", JSON.stringify(booted));
  }
  return state(page);
}

async function unlockFacing(page) {
  await press(page, "u");
  await waitForIdle(page, 500);
}

async function stepForward(page) {
  await press(page, "ArrowUp");
  await waitForIdle(page);
}

async function face(page, target) {
  const cur = await page.evaluate(() => window.__onyxDebug.state.player.facing);
  let delta = (target - cur + 4) % 4;
  if (delta === 3) {
    await press(page, "ArrowLeft");
  } else {
    for (let i = 0; i < delta; i++) await press(page, "ArrowRight");
  }
  await waitForIdle(page);
}

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

async function openTrap(page) {
  await press(page, "i");
  await wait(200);
  await press(page, "o");
  await wait(400);
}

/**
 * The default roster always includes Coda (Thief), and tryUnlock() lets any
 * living, non-KO'd Thief anywhere in state.party (not just the active 4)
 * pick locks with no key. To get a clean "does this door actually require
 * the key" read, briefly KO the Thief around a no-key unlock probe, then
 * restore her.
 */
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

/** Classify a tryUnlock() result message. */
function classifyUnlock(msg) {
  if (/unlock the door with|swings open/i.test(msg)) return "key";
  if (/picks the lock|clicks open/i.test(msg)) return "lockpick";
  if (/is locked\. you need/i.test(msg)) return "held";
  if (/already unlocked/i.test(msg)) return "already";
  return "unknown";
}

const { browser, page, errors } = await launch();

const t0 = Date.now();
const timings = {};

// ============================================================================
// BOOT
// ============================================================================
log("=== BOOT: title -> New Game -> Default Party -> town -> dungeon ===");
let st = await bootToDungeon(page);
await shot(page, "00-boot-f1-start.png");
log("boot", JSON.stringify({ ...st, body: undefined }));
if (st.floorId !== 1 || st.x !== 5 || st.y !== 9) {
  find("P0", 1, "Did not land at F1 start (5,9)", `${st.floorId} (${st.x},${st.y})`);
} else {
  log("OK F1 start (5,9)");
}

// ============================================================================
// FLOOR 1 — The Flooded Crypt
// ============================================================================
const f1t0 = Date.now();
log("\n=== FLOOR 1: crossroads -> crypt row (safe chest, trap chest, water, NPC) ===");
await jumpTo(page, { floorId: 1, x: 5, y: 8, facing: 0 });
await walkDirs(page, ["n", "n", "n"], 1); // (5,9)->(5,8)->(5,7)->(5,6): crossroads corridor
st = await state(page);
await shot(page, "01-f1-crossroads.png");
log("crossroads", st.x, st.y, st.tile);

// Walk west along row 5 to the safe chest at (3,5)
await jumpTo(page, { floorId: 1, x: 4, y: 5, facing: 3 });
await walkDirs(page, ["w"], 1); // step onto (3,5)
st = await state(page);
await shot(page, "02-f1-safe-chest.png");
log("safe chest", st.x, st.y, st.tile, st.msg, st.inv);
if (!st.keys.includes("crypt-key")) {
  find("P1", 1, "crypt-key not acquired from safe chest (3,5)", JSON.stringify(st.keys));
} else {
  log("OK crypt-key acquired, chest was untrapped (no pendingTrap)");
}
if (st.pendingTrap) {
  find("P1", 1, "Chest (3,5) was supposed to be untrapped but pendingTrap is set", JSON.stringify(st.pendingTrap));
}

// Continue west onto the trapped chest at (2,5)
await walkDirs(page, ["w"], 1);
st = await state(page);
await shot(page, "03-f1-trapped-chest-prompt.png");
log("trapped chest", st.x, st.y, st.pendingTrap, st.msg);
if (!st.pendingTrap) {
  find("P1", 1, "Trap prompt did not open on (2,5) poison chest", JSON.stringify(st));
} else {
  await openTrap(page);
  st = await state(page);
  await shot(page, "04-f1-trapped-chest-looted.png");
  log("after open", st.pendingTrap, st.inv, st.partyHp);
  if (st.pendingTrap) {
    find("P1", 1, "pendingTrap still set after Open on (2,5)", JSON.stringify(st.pendingTrap));
  } else if (!st.inv.includes("antidote")) {
    find("P2", 1, "antidote not found in inventory after opening poison chest (2,5)", st.inv.join(","));
  } else {
    log("OK trapped chest inspected+opened, antidote looted");
  }
}

// Water crossing at (2,4) — heal effect per floors.ts
await jumpTo(page, { floorId: 1, x: 2, y: 5, facing: 0 });
st = await state(page);
await walkDirs(page, ["n"], 1); // onto (2,4) water
st = await state(page);
await shot(page, "05-f1-water-heal.png");
log("water(2,4)", st.tile, st.msg, st.partyHp);
if (st.tile !== "water" && !/water|wade|swim/i.test(st.msg)) {
  find("P2", 1, "Water crossing (2,4) message/tile not clearly observed", JSON.stringify({ tile: st.tile, msg: st.msg }));
} else {
  log("OK water tile (2,4) reached");
}

// NPC Maro at (3,6)
await jumpTo(page, { floorId: 1, x: 3, y: 5, facing: 2 });
await walkDirs(page, ["s"], 1);
st = await state(page);
await shot(page, "06-f1-npc-maro-panel.png");
const maroOpen = st.mode === "title" || /Maro/i.test(st.body + st.msg);
if (!maroOpen) {
  find("P1", 1, "Maro NPC panel did not open at (3,6)", JSON.stringify(st));
} else {
  log("OK Maro panel opened");
  await press(page, "Escape");
  await wait(300);
}

// New north corridor: crypt -> (2,3) damage event -> sanctum door -> stairs
log("=== FLOOR 1: crypt -> north corridor -> sanctum (events, stairs down) ===");
await jumpTo(page, { floorId: 1, x: 2, y: 4, facing: 0 });
await walkDirs(page, ["n"], 1); // (2,4)->(2,3) damage event
st = await state(page);
await shot(page, "07-f1-event-damage.png");
log("event(2,3)", st.msg, st.partyHp);
if (!/flagstone|darts/i.test(st.msg)) {
  find("P2", 1, "Damage event message not observed at (2,3)", st.msg);
} else {
  log("OK damage event (2,3)");
}

await jumpTo(page, { floorId: 1, x: 1, y: 5, facing: 0 });
await walkDirs(page, ["n"], 1); // (1,5)->(1,4) reward event
st = await state(page);
await shot(page, "08-f1-event-reward.png");
log("event(1,4) reward", st.msg, st.inv);
if (!st.inv.includes("holy-symbol") && !/holy symbol|corpse/i.test(st.msg)) {
  find("P2", 1, "Reward event (1,4) holy-symbol not confirmed", JSON.stringify({ msg: st.msg, inv: st.inv }));
} else {
  log("OK reward event (1,4) — holy-symbol");
}

await jumpTo(page, { floorId: 1, x: 3, y: 1, facing: 3 });
await walkDirs(page, ["e"], 1); // onto (4,1) heal event
st = await state(page);
await shot(page, "09-f1-event-heal-sanctum.png");
log("event(4,1) heal + sanctum", st.x, st.y, st.msg, st.partyHp);
if (!/altar|forge-forged|hungry|kneel/i.test(st.msg)) {
  find("P2", 1, "Heal event (4,1) message not observed", st.msg);
} else {
  log("OK heal event (4,1) in sanctum room");
}

// Stairs down at (5,1)
await jumpTo(page, { floorId: 1, x: 5, y: 2, facing: 0 });
await shot(page, "10-f1-above-stairs.png");
await walkDirs(page, ["n"], 1);
st = await state(page);
await shot(page, "11-f1-after-stairs-to-f2.png");
log("stairs f1->f2", JSON.stringify({ ...st, body: undefined }));
if (st.floorId !== 2) {
  find("P0", 1, "Stairs down at (5,1) did not lead to Floor 2", JSON.stringify(st));
} else if (st.x !== 2 || st.y !== 11) {
  find("P1", 1, "F1->F2 stairs landed off F2 start (2,11)", `${st.x},${st.y}`);
} else {
  log("OK F1 stairs_down -> F2 start (2,11)");
}
timings.f1_critical_path_ms = Date.now() - f1t0;

// ---- Floor 1 side content: flooded gallery, lock, vault ----
const f1SideT0 = Date.now();
log("\n=== FLOOR 1 side content: gallery water/darkness, lock+vault (lexicon-key) ===");
await jumpTo(page, { floorId: 1, x: 6, y: 5, facing: 1 });
await walkDirs(page, ["e"], 1); // through gallery door onto (7,5) shallow water
st = await state(page);
await shot(page, "12-f1-gallery-shallow-water.png");
log("gallery water(7,5)", st.tile, st.msg);

await jumpTo(page, { floorId: 1, x: 7, y: 5, facing: 1 });
await walkDirs(page, ["e", "e"], 1); // (7,5)->(8,5)->(9,5) darkness
st = await state(page);
await shot(page, "13-f1-gallery-darkness.png");
log("gallery darkness", st.inDarkness, st.tile, st.x, st.y);
if (!st.inDarkness && st.tile !== "darkness") {
  find("P2", 1, "inDarkness not observed on gallery darkness tiles (8,5)/(9,5)", JSON.stringify(st));
} else {
  log("OK gallery darkness flag");
}

await jumpTo(page, { floorId: 1, x: 9, y: 6, facing: 1 });
await walkDirs(page, ["e"], 1); // onto (10,6) deep water, damage effect
st = await state(page);
await shot(page, "14-f1-gallery-deep-water.png");
log("deep water(10,6)", st.tile, st.msg, st.partyHp);
if (!/water|drown|current/i.test(st.msg) && st.tile !== "water") {
  find("P2", 1, "Deep water (10,6) message/tile not clearly observed", JSON.stringify({ tile: st.tile, msg: st.msg }));
} else {
  log("OK deep water (10,6) — depth 4 damage tile");
}

// Try the vault lock WITHOUT the key first (should hold, modulo Thief lockpick)
await jumpTo(page, { floorId: 1, x: 9, y: 8, facing: 0 });
await page.evaluate(() => {
  const k = window.__onyxDebug.state.keys;
  const idx = k.indexOf("crypt-key");
  if (idx >= 0) k.splice(idx, 1);
});
await withThiefDisabled(page, async () => {
  await unlockFacing(page);
});
st = await state(page);
await shot(page, "15-f1-vault-lock-no-key.png");
const f1LockClass = classifyUnlock(st.msg);
log("lock attempt no key, Thief disabled", f1LockClass, st.msg, st.keys);
if (f1LockClass === "key") {
  find("P0", 1, "Vault lock (9,7)s opened WITHOUT crypt-key (Thief disabled)", st.msg);
} else if (f1LockClass === "held") {
  log("OK lock (9,7)s held without crypt-key (Thief disabled)");
} else {
  find("P2", 1, "Unexpected unlock message for held lock (9,7)s", st.msg);
}
// Sanity: with the Thief active (default roster), the same door should be
// pickable with no key at all — confirms lockpicking is live, not a soft-lock
// escape hatch that's silently broken.
await unlockFacing(page);
st = await state(page);
const f1PickClass = classifyUnlock(st.msg);
log("lock attempt no key, Thief active", f1PickClass, st.msg);
if (f1PickClass !== "lockpick") {
  find("P2", 1, "Thief lockpicking did not trigger on (9,7)s with Coda active and no key", st.msg);
} else {
  log("OK Coda (Thief) can pick this lock without the key — by design, doors never hard-soft-lock while she's alive");
}
// Reset the door back to locked for the "with key" test below.
await jumpTo(page, { floorId: 1, x: 9, y: 8, facing: 0 });
// Now with the key (should already be on ring from the safe chest loot above,
// but grant defensively in case an earlier finding broke that path)
await grantKey(page, "crypt-key");
await unlockFacing(page);
st = await state(page);
await shot(page, "16-f1-vault-lock-with-key.png");
log("lock attempt with key", st.msg, st.keys);
if (classifyUnlock(st.msg) !== "key") {
  find("P1", 1, "Vault lock (9,7)s did not open with crypt-key", st.msg);
} else {
  log("OK crypt-key opens vault lock");
}
await jumpTo(page, { floorId: 1, x: 10, y: 8, facing: 2 });
await walkDirs(page, ["s"], 1); // onto (10,9) trapped chest (gas)
st = await state(page);
await shot(page, "17-f1-vault-chest-trap.png");
log("vault chest", st.pendingTrap, st.msg);
if (!st.pendingTrap) {
  find("P1", 1, "Reliquary chest (10,9) trap prompt did not open", JSON.stringify(st));
} else {
  await openTrap(page);
  st = await state(page);
  await shot(page, "18-f1-vault-chest-looted.png");
  if (!st.keys.includes("lexicon-key")) {
    find("P0", 1, "lexicon-key not acquired from reliquary chest (10,9) — blocks F2 forbidden wing", JSON.stringify(st.keys));
  } else {
    log("OK lexicon-key acquired from reliquary");
  }
}

// Automap check
await press(page, "m");
await wait(300);
await shot(page, "19-f1-automap.png");
await press(page, "m");
await wait(200);
timings.f1_side_content_ms = Date.now() - f1SideT0;

// ============================================================================
// FLOOR 2 — The Cursed Library
// ============================================================================
const f2t0 = Date.now();
log("\n=== FLOOR 2: arrival, reading-hall aisles, NPC, events ===");
await jumpTo(page, { floorId: 2, x: 2, y: 11, facing: 0 });
st = await state(page);
await shot(page, "20-f2-arrival.png");
log("F2 arrival", st.floorId, st.x, st.y, st.tile);
if (st.floorId !== 2 || st.tile !== "stairs_up") {
  find("P2", 2, "F2 start tile is not stairs_up as expected", JSON.stringify(st));
}

// Walk the reading-hall aisle obstacles (new shelf islands at (6,6)/(8,6))
await jumpTo(page, { floorId: 2, x: 5, y: 5, facing: 1 });
await walkDirs(page, ["e", "e", "e", "e"], 2); // across the top cross-aisle y=5
st = await state(page);
await shot(page, "21-f2-reading-hall-aisle.png");
log("reading hall aisle walk", st.x, st.y, st.tile);

// NPC Vestra at (1,1)
await jumpTo(page, { floorId: 2, x: 1, y: 2, facing: 0 });
await walkDirs(page, ["n"], 2);
st = await state(page);
await shot(page, "22-f2-npc-vestra-panel.png");
const vestraOpen = st.mode === "title" || /Vestra/i.test(st.body + st.msg);
if (!vestraOpen) {
  find("P1", 2, "Vestra NPC panel did not open at (1,1)", JSON.stringify(st));
} else {
  log("OK Vestra panel opened");
  await press(page, "Escape");
  await wait(300);
}

// Darkness stretch of the north corridor (7,2)/(8,2), and its damage event at (8,2)
await jumpTo(page, { floorId: 2, x: 6, y: 2, facing: 1 });
await walkDirs(page, ["e"], 2); // (6,2)->(7,2) darkness
st = await state(page);
await shot(page, "23-f2-corridor-darkness.png");
log("corridor darkness(7,2)", st.inDarkness, st.tile);
if (!st.inDarkness && st.tile !== "darkness") {
  find("P2", 2, "inDarkness not observed on north corridor (7,2)", JSON.stringify(st));
} else {
  log("OK north corridor darkness");
}
await walkDirs(page, ["e"], 2); // (7,2)->(8,2) darkness + damage event
st = await state(page);
await shot(page, "24-f2-corridor-damage-event.png");
log("event(8,2) damage", st.msg, st.partyHp);
if (!/bookcase|topples/i.test(st.msg)) {
  find("P2", 2, "Damage event (8,2) message not observed", st.msg);
} else {
  log("OK damage event (8,2)");
}

// Scriptorium open chest (12,3), alarm trap
log("=== FLOOR 2: scriptorium chest, forbidden wing lock + furnace-key ===");
await jumpTo(page, { floorId: 2, x: 12, y: 4, facing: 0 });
await walkDirs(page, ["n"], 2);
st = await state(page);
await shot(page, "25-f2-scriptorium-chest.png");
log("scriptorium chest(12,3)", st.pendingTrap, st.msg, st.inv);
if (st.pendingTrap) {
  find("P1", 2, "Scriptorium chest (12,3) is untrapped in floors.ts but pendingTrap fired", JSON.stringify(st.pendingTrap));
} else if (!/mace|chain-mail|cursed-blade|alarm/i.test(st.msg) && !st.inv.some((i) => /mace|chain-mail|cursed-blade/.test(i))) {
  find("P2", 2, "Scriptorium chest (12,3) loot message unclear", st.msg);
} else {
  log("OK scriptorium chest looted (alarm trap type auto-resolves without a modal per floor-authoring rules)");
}

// Forbidden wing lock (10,7)e — try WITHOUT lexicon-key (Thief disabled)
await jumpTo(page, { floorId: 2, x: 9, y: 7, facing: 1 });
await walkDirs(page, ["e"], 2); // up to (10,7) facing east into the lock
await page.evaluate(() => {
  const k = window.__onyxDebug.state.keys;
  const idx = k.indexOf("lexicon-key");
  if (idx >= 0) k.splice(idx, 1);
});
await withThiefDisabled(page, async () => {
  await unlockFacing(page);
});
st = await state(page);
await shot(page, "26-f2-forbidden-wing-lock-no-key.png");
const f2LockClass = classifyUnlock(st.msg);
log("forbidden wing lock no key, Thief disabled", f2LockClass, st.msg, st.keys);
if (f2LockClass === "key") {
  find("P0", 2, "Forbidden wing lock (10,7)e opened WITHOUT lexicon-key (Thief disabled)", st.msg);
} else if (f2LockClass === "held") {
  log("OK forbidden wing lock held without lexicon-key (Thief disabled)");
} else {
  find("P2", 2, "Unexpected unlock message for held forbidden wing lock", st.msg);
}
// Reset the door back to locked, then test the intended key path.
await jumpTo(page, { floorId: 2, x: 9, y: 7, facing: 1 });
await walkDirs(page, ["e"], 2);
await grantKey(page, "lexicon-key");
await unlockFacing(page);
st = await state(page);
await shot(page, "27-f2-forbidden-wing-lock-with-key.png");
log("forbidden wing lock with key", st.msg, st.keys);
if (classifyUnlock(st.msg) !== "key") {
  find("P1", 2, "Forbidden wing lock (10,7)e did not open with lexicon-key", st.msg);
} else {
  log("OK lexicon-key opens forbidden wing");
}
await walkDirs(page, ["e"], 2); // into the wing, (11,7)
st = await state(page);
log("inside wing", st.x, st.y, st.tile, st.inDarkness);
await jumpTo(page, { floorId: 2, x: 11, y: 7, facing: 2 });
await walkDirs(page, ["s"], 2); // (11,7)->(11,8) darkness over the lock chest's approach
st = await state(page);
await shot(page, "28-f2-forbidden-wing-darkness.png");
log("wing darkness(11,8)", st.inDarkness, st.tile);
if (!st.inDarkness && st.tile !== "darkness") {
  find("P2", 2, "Forbidden wing darkness (11,8) not observed guarding the furnace-key chest", JSON.stringify(st));
}
await walkDirs(page, ["e"], 2); // (11,8)->(12,8) chest
st = await state(page);
await shot(page, "29-f2-furnace-key-chest.png");
log("furnace-key chest(12,8)", st.pendingTrap, st.msg);
if (!st.pendingTrap) {
  find("P1", 2, "Furnace-key chest (12,8) stunner trap prompt did not open", JSON.stringify(st));
} else {
  await openTrap(page);
  st = await state(page);
  await shot(page, "30-f2-furnace-key-looted.png");
  if (!st.keys.includes("furnace-key")) {
    find("P0", 2, "furnace-key not acquired from (12,8) — blocks F3 slag vault", JSON.stringify(st.keys));
  } else {
    log("OK furnace-key acquired");
  }
}

// Remaining new events: reward (7,8), heal (3,11), message (11,10)
await jumpTo(page, { floorId: 2, x: 6, y: 8, facing: 1 });
await walkDirs(page, ["e"], 2);
st = await state(page);
await shot(page, "31-f2-event-reward.png");
log("event(7,8) reward", st.msg, st.inv);
if (!st.inv.includes("eye-drops") && !/lens|drawer/i.test(st.msg)) {
  find("P2", 2, "Reward event (7,8) eye-drops not confirmed", JSON.stringify({ msg: st.msg, inv: st.inv }));
} else {
  log("OK reward event (7,8) — eye-drops");
}
await jumpTo(page, { floorId: 2, x: 2, y: 11, facing: 1 });
await walkDirs(page, ["e"], 2);
st = await state(page);
await shot(page, "32-f2-event-heal-atrium.png");
log("event(3,11) heal", st.msg, st.partyHp);
if (!/brazier|warm/i.test(st.msg)) {
  find("P2", 2, "Heal event (3,11) message not observed", st.msg);
} else {
  log("OK heal event (3,11)");
}

// Stairs down at (11,12)
log("=== FLOOR 2: stairs down -> F3 ===");
await jumpTo(page, { floorId: 2, x: 11, y: 11, facing: 2 });
await shot(page, "33-f2-above-stairs.png");
await walkDirs(page, ["s"], 2);
st = await state(page);
await shot(page, "34-f2-after-stairs-to-f3.png");
log("stairs f2->f3", JSON.stringify({ ...st, body: undefined }));
if (st.floorId !== 3) {
  find("P0", 2, "Stairs down at (11,12) did not lead to Floor 3", JSON.stringify(st));
} else if (st.x !== 2 || st.y !== 2) {
  find("P1", 2, "F2->F3 stairs landed off F3 start (2,2)", `${st.x},${st.y}`);
} else {
  log("OK F2 stairs_down -> F3 start (2,2)");
}
timings.f2_ms = Date.now() - f2t0;

// ============================================================================
// FLOOR 3 — The Forge of Ashes
// ============================================================================
const f3t0 = Date.now();
log("\n=== FLOOR 3: arrival, slag vault lock+chests, NPC ===");
await jumpTo(page, { floorId: 3, x: 2, y: 2, facing: 0 });
st = await state(page);
await shot(page, "35-f3-arrival.png");
log("F3 arrival", st.floorId, st.x, st.y, st.tile);

// Ember gallery east to slag vault lock (11,2)e — try WITHOUT furnace-key (Thief disabled)
await jumpTo(page, { floorId: 3, x: 10, y: 2, facing: 1 });
await page.evaluate(() => {
  const k = window.__onyxDebug.state.keys;
  const idx = k.indexOf("furnace-key");
  if (idx >= 0) k.splice(idx, 1);
});
await walkDirs(page, ["e"], 3); // (10,2)->(11,2)
await withThiefDisabled(page, async () => {
  await unlockFacing(page);
});
st = await state(page);
await shot(page, "36-f3-vault-lock-no-key.png");
const f3VaultLockClass = classifyUnlock(st.msg);
log("vault lock no furnace-key, Thief disabled", f3VaultLockClass, st.msg, st.keys);
if (f3VaultLockClass === "key") {
  find("P0", 3, "Slag vault lock (11,2)e opened WITHOUT furnace-key (Thief disabled)", st.msg);
} else if (f3VaultLockClass === "held") {
  log("OK slag vault lock held without furnace-key (Thief disabled)");
} else {
  find("P2", 3, "Unexpected unlock message for held slag vault lock", st.msg);
}
// Reset the door back to locked, then test the intended key path.
await jumpTo(page, { floorId: 3, x: 10, y: 2, facing: 1 });
await walkDirs(page, ["e"], 3);
await grantKey(page, "furnace-key");
await unlockFacing(page);
st = await state(page);
await shot(page, "37-f3-vault-lock-with-key.png");
log("vault lock with furnace-key", st.msg, st.keys);
if (classifyUnlock(st.msg) !== "key") {
  find("P1", 3, "Slag vault lock (11,2)e did not open with furnace-key", st.msg);
} else {
  log("OK furnace-key opens slag vault");
}
await walkDirs(page, ["e"], 3); // into vault (12,2)
st = await state(page);
await jumpTo(page, { floorId: 3, x: 13, y: 1, facing: 2 });
await walkDirs(page, ["s"], 3); // onto (13,2) trapped chest
st = await state(page);
await shot(page, "38-f3-vault-chest-trap.png");
log("vault chest(13,2)", st.pendingTrap, st.msg);
if (!st.pendingTrap) {
  find("P1", 3, "Slag vault chest (13,2) gas trap prompt did not open", JSON.stringify(st));
} else {
  await openTrap(page);
  st = await state(page);
  await shot(page, "39-f3-vault-chest-looted.png");
  log("looted", st.inv, st.partyHp);
}
// Bonus unguarded chest (14,1)
await jumpTo(page, { floorId: 3, x: 13, y: 1, facing: 1 });
await walkDirs(page, ["e"], 3);
st = await state(page);
await shot(page, "40-f3-vault-bonus-chest.png");
log("bonus chest(14,1)", st.pendingTrap, st.msg, st.inv);
if (st.pendingTrap) {
  find("P1", 3, "Bonus vault chest (14,1) should be untrapped per floors.ts but pendingTrap fired", JSON.stringify(st.pendingTrap));
} else if (!st.inv.includes("greater-healing-potion") && !/healing/i.test(st.msg)) {
  find("P2", 3, "Bonus chest (14,1) greater-healing-potion not confirmed", JSON.stringify({ msg: st.msg, inv: st.inv }));
} else {
  log("OK bonus chest (14,1) — no trap prompt, loot granted immediately");
}

// NPC Kazeharu at (3,9)
log("=== FLOOR 3: cinder hall NPC, foundry heal event, teleporter ===");
await jumpTo(page, { floorId: 3, x: 3, y: 8, facing: 2 });
await walkDirs(page, ["s"], 3);
st = await state(page);
await shot(page, "41-f3-npc-kazeharu-panel.png");
const kazeOpen = st.mode === "title" || /Kazeharu/i.test(st.body + st.msg);
if (!kazeOpen) {
  find("P1", 3, "Kazeharu NPC panel did not open at (3,9)", JSON.stringify(st));
} else {
  log("OK Kazeharu panel opened");
  await press(page, "Escape");
  await wait(300);
}

// Foundry heal event at anvil altar (7,7), nestled by the new furnace-stack obstacle
await jumpTo(page, { floorId: 3, x: 6, y: 7, facing: 1 });
await walkDirs(page, ["e"], 3);
st = await state(page);
await shot(page, "42-f3-foundry-heal-event.png");
log("event(7,7) heal", st.msg, st.partyHp);
if (!/anvil|altar|forge-forged/i.test(st.msg)) {
  find("P2", 3, "Heal event (7,7) anvil-altar message not observed", st.msg);
} else {
  log("OK anvil-altar heal event, alcove obstacle in place");
}

// Waygate teleporter (9,6) -> (2,3)
await jumpTo(page, { floorId: 3, x: 9, y: 5, facing: 2 });
await walkDirs(page, ["s"], 3); // onto (9,6) teleporter
st = await state(page);
await shot(page, "43-f3-after-teleporter.png");
log("teleporter land", st.x, st.y, st.msg);
if (st.x !== 2 || st.y !== 3) {
  find("P1", 3, "Waygate teleporter (9,6) did not land at declared (2,3)", `${st.x},${st.y}`);
} else {
  log("OK waygate teleporter -> (2,3)");
}

// Ashpit chest (2,14) -> forge-key, poison trap
log("=== FLOOR 3: ashpit forge-key, Grand Forge lock, antimagic, boss chamber ===");
await jumpTo(page, { floorId: 3, x: 2, y: 13, facing: 2 });
await walkDirs(page, ["s"], 3);
st = await state(page);
await shot(page, "44-f3-ashpit-forgekey-trap.png");
log("ashpit chest(2,14)", st.pendingTrap, st.msg);
if (!st.pendingTrap) {
  find("P1", 3, "Ashpit chest (2,14) poison trap prompt did not open", JSON.stringify(st));
} else {
  await openTrap(page);
  st = await state(page);
  await shot(page, "45-f3-ashpit-forgekey-looted.png");
  if (!st.keys.includes("forge-key")) {
    find("P0", 3, "forge-key not acquired from ashpit chest (2,14) — blocks Grand Forge / stairs down", JSON.stringify(st.keys));
  } else {
    log("OK forge-key acquired");
  }
}

// Grand Forge lock (7,11)s — try WITHOUT forge-key (Thief disabled)
await jumpTo(page, { floorId: 3, x: 7, y: 10, facing: 2 });
await page.evaluate(() => {
  const k = window.__onyxDebug.state.keys;
  const idx = k.indexOf("forge-key");
  if (idx >= 0) k.splice(idx, 1);
});
await withThiefDisabled(page, async () => {
  await unlockFacing(page);
});
st = await state(page);
await shot(page, "46-f3-boss-lock-no-key.png");
const f3BossLockClass = classifyUnlock(st.msg);
log("boss lock no forge-key, Thief disabled", f3BossLockClass, st.msg, st.keys);
if (f3BossLockClass === "key") {
  find("P0", 3, "Grand Forge lock (7,11)s opened WITHOUT forge-key (Thief disabled)", st.msg);
} else if (f3BossLockClass === "held") {
  log("OK Grand Forge lock held without forge-key (Thief disabled)");
} else {
  find("P2", 3, "Unexpected unlock message for held Grand Forge lock", st.msg);
}
// Reset the door back to locked, then test the intended key path.
await jumpTo(page, { floorId: 3, x: 7, y: 10, facing: 2 });
await grantKey(page, "forge-key");
await unlockFacing(page);
st = await state(page);
await shot(page, "47-f3-boss-lock-with-key.png");
log("boss lock with forge-key", st.msg, st.keys);
if (classifyUnlock(st.msg) !== "key") {
  find("P1", 3, "Grand Forge lock (7,11)s did not open with forge-key", st.msg);
} else {
  log("OK forge-key opens Grand Forge");
}
await walkDirs(page, ["s"], 3); // into chamber (7,12)

// Antimagic zone (6-8,13)
await jumpTo(page, { floorId: 3, x: 7, y: 12, facing: 2 });
await walkDirs(page, ["s"], 3); // onto (7,13) antimagic
st = await state(page);
await shot(page, "48-f3-antimagic-zone.png");
log("antimagic", st.inAntimagic, st.tile, st.x, st.y);
if (!st.inAntimagic && st.tile !== "antimagic") {
  find("P1", 3, "inAntimagic not set inside Grand Forge boss chamber (7,13)", JSON.stringify(st));
} else {
  log("OK antimagic flag set in Grand Forge");
  // Try casting a utility spell (G menu) to confirm the fizzle message
  await press(page, "g");
  await wait(300);
  const menuBody = await page.evaluate(() => document.body.innerText);
  if (/No one knows a utility spell/i.test(menuBody)) {
    log("  (no party member knows a utility spell yet at current level — cannot confirm fizzle text this run)");
    await press(page, "g");
    await wait(200);
  } else {
    await press(page, "Enter");
    await wait(300);
    st = await state(page);
    await shot(page, "49-f3-antimagic-cast-fizzle.png");
    log("antimagic cast attempt", st.msg);
    if (!/anti-magic|drinks the spell/i.test(st.msg)) {
      find("P1", 3, "Casting a utility spell inside the antimagic zone did not show the fizzle message", st.msg);
    } else {
      log("OK antimagic fizzle message confirmed");
    }
  }
}

// Trophy chest (9,13), stunner trap
await jumpTo(page, { floorId: 3, x: 8, y: 13, facing: 1 });
await walkDirs(page, ["e"], 3);
st = await state(page);
await shot(page, "50-f3-boss-trophy-chest.png");
log("trophy chest(9,13)", st.pendingTrap, st.msg);
if (!st.pendingTrap) {
  find("P1", 3, "Trophy chest (9,13) stunner trap prompt did not open", JSON.stringify(st));
} else {
  await openTrap(page);
  st = await state(page);
  log("looted trophy chest", st.inv);
}

// Stairs down (5,14) -> confirm F4 descent works (do not fully play F4)
log("=== FLOOR 3: stairs down -> F4 (confirm descent only) ===");
await jumpTo(page, { floorId: 3, x: 5, y: 13, facing: 2 });
await shot(page, "51-f3-above-stairs.png");
await walkDirs(page, ["s"], 3);
st = await state(page);
await shot(page, "52-f3-after-stairs-to-f4.png");
log("stairs f3->f4", JSON.stringify({ ...st, body: undefined }));
if (st.floorId !== 4) {
  find("P0", 3, "Stairs down at (5,14) did not lead to Floor 4", JSON.stringify(st));
} else {
  log(`OK F3 stairs_down -> F4 (${st.floorName}) landed (${st.x},${st.y})`);
}
timings.f3_ms = Date.now() - f3t0;

// ============================================================================
// Pacing sample: walk 24 steps on F1's safe vs risk encounterZones
// ============================================================================
log("\n=== Pacing sample: encounter frequency in F1 safe vs risk zones ===");
async function pacingSample(floorId, x, y, facing, dirs, label) {
  await jumpTo(page, { floorId, x, y, facing });
  let combats = 0;
  const map = { n: 0, e: 1, s: 2, w: 3 };
  for (const d of dirs) {
    await face(page, map[d]);
    await stepForward(page);
    const mode = await page.evaluate(() => window.__onyxDebug.state.mode);
    if (mode === "combat") {
      combats++;
      await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
      await wait(400);
      await press(page, "Enter");
      await wait(250);
    }
  }
  log(`  ${label}: ${combats} encounters over ${dirs.length} steps`);
  return combats;
}
const safeDirs = Array(24).fill("e").map((d, i) => (i % 2 === 0 ? "e" : "w"));
const safeCombats = await pacingSample(1, 3, 8, 1, safeDirs, "F1 crypt-tutorial-safe zone (rateMul 0.5)");
const riskDirs = Array(24).fill("e").map((d, i) => (i % 2 === 0 ? "e" : "w"));
const riskCombats = await pacingSample(1, 8, 5, 1, riskDirs, "F1 flooded-gallery-risk zone (rateMul 1.5)");
log(`Pacing summary: safe=${safeCombats}/24 risk=${riskCombats}/24 (small sample, directional signal only)`);

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
  pacing: { safeCombats, riskCombats },
  outDir: OUT,
};
writeReport(OUT, report);
log("\n=== SUMMARY ===");
log("findings:", findings.length);
for (const f of findings) log(`  [${f.sev}] F${f.floor} ${f.title}`);
log("screenshots:", OUT);
log("timings (ms):", JSON.stringify(timings));
await browser.close();
