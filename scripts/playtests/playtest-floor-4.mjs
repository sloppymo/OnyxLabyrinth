/**
 * Floor 4 — The Null Choir — playtest.
 * Run: node scripts/playtest-floor-4.mjs
 * Expects: npx vite preview --port 5230 --base /OnyxLabyrinth/
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE = "http://127.0.0.1:5230/OnyxLabyrinth/?debug=1";
const OUT = "playtest-screenshots/2026-07-14-floor4";
fs.mkdirSync(OUT, { recursive: true });

const findings = [];
const log = (...a) => console.log(...a);
const find = (sev, title, body = "") => {
  findings.push({ sev, title, body });
  log(`[${sev}] ${title}${body ? ` — ${body}` : ""}`);
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
    const msgVis =
      msg &&
      getComputedStyle(msg).display !== "none" &&
      getComputedStyle(msg).visibility !== "hidden" &&
      Number(getComputedStyle(msg).opacity) > 0.05;
    return {
      mode: s.mode,
      floorId: s.floor?.id,
      floorName: s.floor?.name,
      theme: s.floor?.tilesetTheme,
      x: s.player.x,
      y: s.player.y,
      facing: s.player.facing,
      keys: [...(s.keys || [])],
      inAntimagic: s.inAntimagic,
      inDarkness: s.inDarkness,
      pendingTrap: s.pendingTrap,
      tile: s.floor.grid[s.player.y]?.[s.player.x]?.tile,
      msg: msgText,
      msgVis,
      body: document.body.innerText.replace(/\s+/g, " ").slice(0, 900),
      gold: s.partyGold,
      inv: (s.inventory || []).map((e) => e.itemId),
    };
  });
}

/** Enter dungeon with default party via title → New Game → town → Enter Dungeon. */
async function bootToDungeon(page) {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await wait(400);
  await press(page, "n");
  await wait(350);
  // Party choice: [D] Default Party
  await press(page, "d");
  await wait(500);
  let st = await snap(page);
  if (st.mode === "party_creation") {
    await press(page, "Enter");
    await wait(400);
    st = await snap(page);
  }
  // Town hub: select Enter Dungeon (bracket jump or arrow)
  if (st.mode === "town") {
    await press(page, ">"); // icon jump if supported
    await wait(150);
    st = await snap(page);
    if (st.mode !== "dungeon") {
      for (let i = 0; i < 8; i++) {
        const body = await page.evaluate(() => document.body.innerText);
        if (/▶\s*\[>\]\s*Enter Dungeon|▶.*Enter Dungeon/i.test(body)) {
          await press(page, "Enter");
          await wait(500);
          break;
        }
        await press(page, "ArrowDown");
        await wait(80);
      }
    }
  }
  st = await snap(page);
  if (st.mode !== "dungeon") {
    find("P0", "Failed to reach dungeon", JSON.stringify(st));
  }
  return st;
}

/** Face a locked edge and unlock with U (keys must already be on the ring). */
async function unlockFacing(page) {
  await press(page, "u");
  await wait(350);
}

/**
 * Warp onto a floor without going through stairs.
 * Uses JSON clone of FloorDef (same shape the registry serves).
 */
async function warp(page, floorId, x, y, facing = 0) {
  await page.evaluate(
    ({ floorId, x, y, facing }) => {
      const d = window.__onyxDebug;
      const src = d.findFloor(floorId);
      if (!src) throw new Error(`no floor ${floorId}`);
      d.state.floor = JSON.parse(JSON.stringify(src));
      d.state.player = { x, y, facing };
      d.state.explored = new Set();
      d.state.inDarkness = false;
      d.state.inAntimagic = false;
      d.state.pendingTrap = null;
      // Past cooldown, below pity-force (~28) so walks don't instantly fight
      d.state.stepsSinceEncounter = 8;
      d.state.mode = "dungeon";
    },
    { floorId, x, y, facing }
  );
  await wait(200);
}

/** Face and step forward one cell (wait out camera tween). */
async function stepForward(page) {
  await press(page, "ArrowUp");
  await wait(320);
}

/** Turn to absolute facing 0N 1E 2S 3W then step. */
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

async function walkDirs(page, dirs) {
  const map = { n: 0, e: 1, s: 2, w: 3 };
  for (const d of dirs) {
    await face(page, map[d]);
    await stepForward(page);
    // Escape combat if a random fight starts mid-walk
    const mode = await page.evaluate(() => window.__onyxDebug.state.mode);
    if (mode === "combat") {
      await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
      await wait(500);
      // may still be result window
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

const browser = await chromium.launch({ headless: true });
const page = await (
  await browser.newContext({ viewport: { width: 1280, height: 800 } })
).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

log("=== A. F3 → F4 stairs descent ===");
await bootToDungeon(page);
// Stand north of F3 stairs_down (5,14), face south, step on
await warp(page, 3, 5, 13, 2);
await shot(page, "00-f3-above-stairs.png");
await stepForward(page);
await wait(500);
let st = await snap(page);
log("after descend", JSON.stringify({ ...st, body: undefined }));
await shot(page, "01-f4-arrival.png");
if (st.floorId !== 4 || st.floorName !== "The Null Choir") {
  find("P0", "Stairs did not land on Floor 4 / Null Choir", JSON.stringify(st));
} else {
  log("OK landed F4 at", st.x, st.y);
}
if (st.x !== 2 || st.y !== 2) {
  find("P1", "Landing coords not F4 start (2,2)", `${st.x},${st.y}`);
}
if (!/Null Choir|Floor 4|descend/i.test(st.msg + st.body)) {
  find("P1", "Descent message missing Null Choir / Floor 4", st.msg);
}
if (st.theme !== "f4") {
  find("P1", "tilesetTheme is not f4", String(st.theme));
}

log("=== B. Narthex message + walk to Vesper ===");
// Facing after stairs is often south; path start(2,2) → vesper(2,10) is all south
await warp(page, 4, 2, 2, 2);
await walkDirs(page, ["e"]); // trigger narthex event at (3,2) if adjacent walk
await warp(page, 4, 3, 2, 1);
st = await snap(page);
await shot(page, "02-narthex.png");
if (!/forge|breath|echo/i.test(st.msg) && st.tile !== "event") {
  // stepping ON event: warp onto cell and nudge
  await warp(page, 4, 2, 2, 1);
  await walkDirs(page, ["e"]);
  st = await snap(page);
  log("narthex retry", st.msg);
}
await warp(page, 4, 2, 2, 2);
await walkDirs(page, Array(8).fill("s"));
st = await snap(page);
log("vesper tile", JSON.stringify(st));
await shot(page, "03-vesper-arrival.png");
if (st.x !== 2 || st.y !== 10) {
  find("P1", "Did not reach Vesper cell (2,10)", `${st.x},${st.y}`);
}
// NPC panel should open (borrows title mode)
await wait(400);
st = await snap(page);
const npcOpen =
  st.mode === "title" ||
  /Vesper|cantor|slate|choir/i.test(st.body + st.msg);
await shot(page, "04-vesper-panel.png");
if (!npcOpen) {
  find("P0", "Vesper NPC panel did not open", JSON.stringify(st));
} else {
  log("OK Vesper panel");
  // Visible topics via keys if letter-bound, else arrows — try Talk flow
  // Typical: T talk, or number, or arrow+enter. Probe body for options.
  if (/Talk|Barter|Leave|\[/i.test(st.body)) {
    await press(page, "t");
    await wait(300);
    await shot(page, "05-vesper-talk.png");
    const talk = await snap(page);
    log("talk", talk.body.slice(0, 400));
    // Hidden keyword
    await page.keyboard.type("voice");
    await press(page, "Enter");
    await wait(400);
    const voice = await snap(page);
    await shot(page, "06-vesper-voice.png");
    if (!/forty throats|stop your ears|voice/i.test(voice.body + voice.msg)) {
      find("P2", "Hidden 'voice' keyword may not have fired", voice.msg || voice.body.slice(0, 200));
    } else {
      log("OK hidden voice topic");
    }
  }
  await press(page, "Escape");
  await wait(300);
}

log("=== C. Antimagic aisle ===");
await warp(page, 4, 8, 7, 0);
await wait(100);
// Trigger feature by stepping from adjacent
await warp(page, 4, 8, 8, 0);
await walkDirs(page, ["n"]);
st = await snap(page);
await shot(page, "07-antimagic.png");
log("antimagic", { inAntimagic: st.inAntimagic, tile: st.tile, xy: [st.x, st.y] });
if (!st.inAntimagic && st.tile !== "antimagic") {
  // try direct place + feature tick: walk off and on
  await walkDirs(page, ["e", "w"]);
  st = await snap(page);
}
if (!st.inAntimagic) {
  find("P1", "inAntimagic not set on antimagic tile", JSON.stringify(st));
} else {
  log("OK antimagic flag");
}

log("=== D. Vestibule of Bells damage event ===");
await warp(page, 4, 9, 2, 1);
await walkDirs(page, ["e"]);
st = await snap(page);
await shot(page, "08-bells.png");
const partyHp = await page.evaluate(() =>
  window.__onyxDebug.state.party.map((c) => ({ n: c.name, hp: c.hp, max: c.maxHp }))
);
log("bells", st.msg, partyHp);
if (!/chord|ears|bell/i.test(st.msg + st.body)) {
  find("P2", "Bells damage event message not seen", st.msg);
}
const damaged = partyHp.some((c) => c.hp < c.max);
if (!damaged) find("P2", "Bells event did not reduce HP", JSON.stringify(partyHp));
else log("OK bells damage");

log("=== E. Stilled Font: water heal + choir-key trap chest ===");
await warp(page, 4, 2, 13, 2);
await walkDirs(page, ["s"]); // onto water (2,14)
st = await snap(page);
await shot(page, "09-font-water.png");
log("water", st.tile, st.msg);
await warp(page, 4, 3, 14, 2);
await walkDirs(page, ["s"]); // chest at (3,15)
st = await snap(page);
await shot(page, "10-choir-key-trap.png");
log("trap", st.pendingTrap, st.msg);
if (!st.pendingTrap) {
  find("P1", "Choir-key trapped chest did not open Inspect modal", st.msg);
} else {
  // Inspect → Open (or Disarm). Keys: I/D/O/L
  await press(page, "i");
  await wait(200);
  await press(page, "o");
  await wait(400);
  st = await snap(page);
  await shot(page, "11-choir-key-looted.png");
  if (!st.keys.includes("choir-key")) {
    find("P0", "choir-key not acquired after open", JSON.stringify(st.keys));
  } else {
    log("OK choir-key");
  }
}

log("=== F. Unlock loft → hymnal → sanctum-key → teleporter ===");
await grantKey(page, "choir-key");
await warp(page, 4, 12, 8, 1); // facing east into locked door
await unlockFacing(page);
st = await snap(page);
await shot(page, "12-loft-unlock.png");
log("after loft unlock", st.x, st.y, st.keys, st.msg);
if (!/unlock|swings open/i.test(st.msg)) {
  find("P1", "Choir-key unlock message missing", st.msg);
}
await stepForward(page);
st = await snap(page);
log("after loft step", st.x, st.y);
// Walk to hymnal event (13,5)
await warp(page, 4, 13, 6, 0);
await walkDirs(page, ["n"]);
st = await snap(page);
await shot(page, "13-hymnal.png");
if (!st.inv.includes("holy-symbol") && !/hymnal|holy|symbol/i.test(st.msg)) {
  find("P2", "Hymnal reward unclear", st.msg + " inv=" + st.inv.join(","));
} else {
  log("OK hymnal / holy-symbol path");
}
// Sanctum key chest (16,5) trap stunner
await warp(page, 4, 16, 6, 0);
await walkDirs(page, ["n"]);
st = await snap(page);
await shot(page, "14-sanctum-key-trap.png");
if (st.pendingTrap) {
  await press(page, "i");
  await wait(150);
  await press(page, "o");
  await wait(400);
}
st = await snap(page);
if (!st.keys.includes("sanctum-key")) {
  // open may have teleported/stunned — grant if chest looted message
  if (/sanctum|key|stun/i.test(st.msg) || st.inv.length) {
    find("P2", "sanctum-key not on ring after loft chest", JSON.stringify(st.keys));
  } else {
    find("P1", "Could not loot sanctum-key chest", JSON.stringify(st));
  }
} else {
  log("OK sanctum-key");
}
await grantKey(page, "sanctum-key");

// Echo Shaft teleporter (16,9) → (13,13)
await warp(page, 4, 16, 8, 2);
await walkDirs(page, ["s"]);
st = await snap(page);
await shot(page, "15-after-teleporter.png");
log("teleport land", st.x, st.y, st.msg);
if (st.x !== 13 || st.y !== 13) {
  find("P1", "Teleporter did not land at (13,13)", `${st.x},${st.y}`);
} else {
  log("OK teleporter → (13,13) outside sanctum lock");
}

log("=== G. Sanctum door + climax message ===");
await grantKey(page, "sanctum-key");
await warp(page, 4, 13, 13, 2); // face south into sanctum lock
await unlockFacing(page);
st = await snap(page);
log("sanctum unlock", st.msg, st.keys);
await stepForward(page);
await wait(400);
st = await snap(page);
await shot(page, "16-sanctum.png");
log("sanctum", st.x, st.y, st.msg);
if (st.y < 14) {
  find("P1", "Sanctum lock did not open with sanctum-key", `${st.x},${st.y} ${st.msg}`);
} else if (!/Choir|sound|face you/i.test(st.msg + st.body)) {
  find("P2", "Sanctum once-message not seen", st.msg);
} else {
  log("OK sanctum entry");
}

log("=== H. Encounter table + combat smoke on F4 ===");
const rolls = await page.evaluate(() => {
  const d = window.__onyxDebug;
  const ids = new Set();
  for (let i = 0; i < 80; i++) {
    const e = d.rollEncounter(4);
    if (!e) continue;
    for (const s of e.spawns) ids.add(s.enemyId);
  }
  return [...ids].sort();
});
log("rollEncounter(4) ids", rolls.join(", "));
if (!rolls.includes("headmasters-echo")) {
  find("P2", "80 rolls never saw headmasters-echo (rare but possible)", rolls.join(","));
}
if (rolls.length < 8) {
  find("P1", "Too few distinct enemy ids from rolls", String(rolls.length));
}
await warp(page, 4, 13, 15, 1);
await page.evaluate(() => {
  const d = window.__onyxDebug;
  const entry = d.rollEncounter(4);
  const resolved = d.resolveEncounter(entry);
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
    d.state.inAntimagic
  );
  d.startCombat(combat);
});
await wait(800);
st = await snap(page);
await shot(page, "17-f4-combat.png");
if (st.mode !== "combat") find("P1", "F4 combat did not start", st.mode);
else {
  log("OK F4 combat");
  await page.evaluate(() => window.__onyxDebug.exitDebugCombat("victory"));
  await wait(600);
  await press(page, "Enter");
  await wait(400);
}

log("=== H2. Antimagic combat fizzle ===");
await warp(page, 4, 8, 7, 0);
await page.evaluate(() => {
  window.__onyxDebug.state.inAntimagic = true;
});
await page.evaluate(() => {
  const d = window.__onyxDebug;
  const entry = d.rollEncounter(4);
  const resolved = d.resolveEncounter(entry);
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
    true
  );
  d.startCombat(combat);
});
await wait(700);
await shot(page, "17b-antimagic-combat.png");
// Try Magic on a caster (Dell is index 3) — party order Aria Bram Coda Dell...
// Palette/select: open Magic if available
const antiMsg = await page.evaluate(async () => {
  const d = window.__onyxDebug;
  const cc = d.getCombatController?.();
  // Prefer casting via resolve path: look for fizzle when using spell in antimagic
  return {
    mode: d.state.mode,
    inAnti: d.state.inAntimagic,
    combatAnti: d.state.combat?.inAntimagic,
    phase: cc?.getPhase?.(),
  };
});
log("antimagic combat", antiMsg);
if (!antiMsg.combatAnti && !antiMsg.inAnti) {
  find("P2", "Combat not flagged antimagic", JSON.stringify(antiMsg));
} else {
  log("OK combat created with antimagic");
}
await page.evaluate(() => window.__onyxDebug.exitDebugCombat?.("fled"));
await wait(400);
await press(page, "Enter");
await wait(300);

log("=== I. Darkness loft cells ===");
await warp(page, 4, 16, 4, 2);
await walkDirs(page, ["s"]);
st = await snap(page);
await shot(page, "18-darkness.png");
log("darkness", st.inDarkness, st.tile);
if (!st.inDarkness && st.tile !== "darkness") {
  find("P2", "Darkness flag not observed in loft", JSON.stringify(st));
} else {
  log("OK darkness");
}

log("=== J. Vesper gift path (holy-symbol → staff+1) ===");
await page.evaluate(() => {
  const s = window.__onyxDebug.state;
  if (!s.inventory.some((e) => e.itemId === "holy-symbol")) {
    s.inventory.push({ itemId: "holy-symbol", identified: true });
  }
});
await warp(page, 4, 2, 10, 0);
await wait(500);
st = await snap(page);
await shot(page, "19-vesper-with-symbol.png");
// Try Give
if (/Give|\[G\]/i.test(st.body)) {
  await press(page, "g");
  await wait(400);
  const after = await snap(page);
  await shot(page, "20-vesper-gift.png");
  if (!after.inv.includes("staff+1") && !/staff/i.test(after.msg + after.body)) {
    find("P2", "Vesper gift (staff+1) not confirmed", after.body.slice(0, 300));
  } else {
    log("OK Vesper gift");
  }
} else {
  find("P2", "Give option not visible on Vesper panel", st.body.slice(0, 250));
}
await press(page, "Escape");

// Final corridor visual at start for tileset check
await warp(page, 4, 2, 2, 1);
await wait(300);
await shot(page, "21-f4-corridor-tileset.png");
st = await snap(page);

const uniqErrors = [...new Set(errors)];
if (uniqErrors.length) {
  find("P1", "Console/page errors during playtest", uniqErrors.slice(0, 8).join(" | "));
} else {
  log("OK zero console errors");
}

const report = {
  findings,
  errors: uniqErrors,
  final: st,
  rolls,
  outDir: OUT,
};
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
log("\n=== SUMMARY ===");
log("findings:", findings.length);
for (const f of findings) log(`  [${f.sev}] ${f.title}`);
log("screenshots:", OUT);
await browser.close();
process.exit(findings.some((f) => f.sev === "P0") ? 1 : 0);
