/**
 * Continuation: inspect conflict, perk overlay, town/dungeon encounters.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE = process.env.PLAYTEST_URL ?? "http://127.0.0.1:5210/OnyxLabyrinth/?debug=1";
const OUT = path.resolve("playtest-screenshots/2026-07-14");
fs.mkdirSync(OUT, { recursive: true });

const notes = [];
const findings = [];
const log = (m) => { console.log(m); notes.push(m); };
const find = (sev, title, body) => { findings.push({ sev, title, body }); log(`FINDING [${sev}] ${title}`); };

async function wait(ms) { await new Promise((r) => setTimeout(r, ms)); }
async function press(page, key, times = 1) {
  for (let i = 0; i < times; i++) { await page.keyboard.press(key); await wait(70); }
}
async function hold(page, key, ms) {
  await page.keyboard.down(key); await wait(ms); await page.keyboard.up(key);
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name) });
  log(`SHOT ${name}`);
}
async function dbg(page) {
  return page.evaluate(() => {
    const d = window.__onyxDebug;
    const cc = d?.getCombatController?.();
    return {
      mode: d?.state?.mode,
      phase: cc?.getPhase?.() ?? null,
      floorId: d?.state?.floor?.id,
      steps: d?.state?.stepsSinceEncounter,
      party: d?.state?.party?.map((c) => ({ name: c.name, level: c.level, perks: c.perkIds, xp: c.xp, hp: c.hp })),
      inspect: (() => {
        // peek private via windows render class
        const el = document.querySelector(".ff6-party-row.inspect, .ff6-party-inspect");
        return el?.textContent?.trim() ?? null;
      })(),
    };
  });
}
async function body(page) { return page.evaluate(() => document.body.innerText); }
async function paletteInfo(page) {
  return page.evaluate(() => {
    const slots = [...document.querySelectorAll(".ff6-palette-slot")].map((el) => ({
      text: el.textContent?.replace(/\s+/g, " ").trim(),
      disabled: el.classList.contains("disabled"),
      html: el.innerHTML,
    }));
    const hint = document.querySelector(".ff6-hint")?.textContent?.trim();
    return { slots, hint };
  });
}

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const consoleMsgs = [];
page.on("console", (m) => consoleMsgs.push({ type: m.type(), text: m.text() }));
page.on("pageerror", (e) => consoleMsgs.push({ type: "pageerror", text: String(e) }));

async function enterArena(levelIndex) {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await wait(400);
  await press(page, "a");
  await wait(300);
  for (let i = 0; i < levelIndex; i++) await press(page, "ArrowDown");
  await press(page, "Enter");
  await wait(700);
}

// ===== Palette glyphs + keyboard inspect/LB =====
await enterArena(0);
log(`start ${JSON.stringify(await dbg(page))}`);
const pal = await paletteInfo(page);
log(`PALETTE ${JSON.stringify(pal)}`);
await shot(page, "60-palette-glyphs.png");
if (pal.slots.some((s) => /^H/.test(s.text || "") || s.text?.includes("HMag") || /glyph">H</.test(s.html))) {
  find("P1", "Magic palette glyph shows H instead of X", JSON.stringify(pal.slots));
}
if (pal.hint && /H:Mag|H·Mag|H Mag/.test(pal.hint)) {
  find("P1", "Palette hint maps Magic to H instead of X (keyboard x=face X is key s)", pal.hint);
}

// Try inspect via keys that map to lt/rt without being stolen.
// Stolen on palette: t,c,m,i,f,r and q,z
// Mapped: t→lt, r→rt — stolen. Is there another path?
// During palette, simulate by dispatching through evaluate if we can call controller
const inspectTest = await page.evaluate(() => {
  const cc = window.__onyxDebug.getCombatController();
  if (!cc) return { ok: false };
  // Call handleInput directly to prove LT/RT works when events arrive
  cc.handleInput({ kind: "press", button: "lt" });
  const after1 = document.querySelector(".ff6-party-row.inspect, .ff6-party-inspect")?.textContent?.trim() ?? null;
  cc.handleInput({ kind: "press", button: "rt" });
  const after2 = document.querySelector(".ff6-party-row.inspect, .ff6-party-inspect")?.textContent?.trim() ?? null;
  cc.handleInput({ kind: "press", button: "rt" });
  const after3 = document.querySelector(".ff6-party-row.inspect, .ff6-party-inspect")?.textContent?.trim() ?? null;
  return { ok: true, after1, after2, after3, phase: cc.getPhase() };
});
log(`Direct LT/RT inspect: ${JSON.stringify(inspectTest)}`);
await shot(page, "61-inspect-via-api.png");
if (!inspectTest.after1 && !inspectTest.after2) {
  find("P1", "LT/RT inspect produced no visible highlight even via handleInput", JSON.stringify(inspectTest));
} else {
  log("Inspect works when controller events fire");
}

// Keyboard t should open tech not inspect
await press(page, "t");
await wait(200);
log(`After keyboard t: ${JSON.stringify(await dbg(page))} body=${(await body(page)).slice(0, 300)}`);
await shot(page, "62-keyboard-t.png");
const phaseT = (await dbg(page)).phase;
if (phaseT === "selectTechnique") {
  find("P1", "Keyboard cannot reach LT inspect during palette — t stolen by Technique shortcut", "KEYBOARD_MAP t→lt never reached; legacy t→technique wins");
  await press(page, "Escape");
}

// Keyboard q is Auto not LB
await press(page, "q");
await wait(150);
const autoText = await body(page);
log(`After q: AUTO? ${/AUTO/i.test(autoText)}`);
if (/AUTO/i.test(autoText)) {
  find("P2", "Keyboard q is Auto; LB target-cycle (KEYBOARD_MAP q→lb) unreachable on keyboard", "Design doc keyboard fallback incomplete for LB/LT/RT");
  await press(page, "q"); // off
}

// Items via f? select is f in map but f stolen as flee. Try Select via handleInput
await page.evaluate(() => window.__onyxDebug.getCombatController().handleInput({ kind: "press", button: "select" }));
await wait(200);
log(`After select input: phase=${(await dbg(page)).phase}`);
await shot(page, "63-items.png");
await press(page, "Escape");

// ===== Real perk overlay: combat victory crossing tier =====
// Start L1, use debug to set XP just below level 3 threshold after forcing levels to 2 via levelUpChar-like mutation carefully.
await enterArena(0);
await page.evaluate(() => {
  const d = window.__onyxDebug;
  // Bring each character to level 2 with 0 XP leftover using endCombat path:
  // Simplest: set level=2 and xp = huge so endCombat loops to 3+.
  for (const c of d.state.party) {
    c.level = 2;
    c.xp = 100000;
    c.perkIds = [];
  }
});
log(`mutated ${JSON.stringify(await dbg(page))}`);
await page.evaluate(() => window.__onyxDebug.exitDebugCombat("victory"));
await wait(800);
await shot(page, "70-perk-or-arena.png");
let t = await body(page);
log(`After victory:\n${t.slice(0, 1000)}`);
log(`state ${JSON.stringify(await dbg(page))}`);

// Spam Enter
for (let i = 0; i < 10; i++) await press(page, "Enter");
await wait(300);
await shot(page, "71-perk-enter-spam.png");
t = await body(page);
const perkVisible = /perk|choose|mutually|tier|◀|▶/i.test(t) || t.includes("Pick") || documentHasPerk();
function documentHasPerk() { return false; }
const perkDom = await page.evaluate(() => {
  return {
    text: document.body.innerText.slice(0, 1500),
    hasCards: !!document.querySelector(".perk-card, .perk-select, #perk-select, .perk-choice"),
    classes: [...document.querySelectorAll("[class*='perk']")].map((e) => e.className).slice(0, 20),
  };
});
log(`Perk DOM ${JSON.stringify(perkDom)}`);
if (!perkDom.hasCards && !/perk/i.test(perkDom.text)) {
  find("P1", "exitDebugCombat('victory') with banked XP did not open perk overlay", JSON.stringify(perkDom).slice(0, 500));
} else {
  log("Perk overlay present — testing Enter spam guard");
  const before = perkDom.text.slice(0, 200);
  for (let i = 0; i < 6; i++) await press(page, "Enter");
  await wait(200);
  const afterSpam = await page.evaluate(() => document.body.innerText.slice(0, 400));
  if (!/perk|choose|card|◀|▶|select/i.test(afterSpam) && !(await page.evaluate(() => !!document.querySelector("[class*='perk']")))) {
    find("P0", "Perk Enter-spam burned/dismissed overlay without arrow selection", afterSpam);
  } else {
    log("Enter spam did not dismiss perk — good");
    await press(page, "ArrowRight");
    await wait(100);
    await press(page, "Enter");
    await wait(400);
    await shot(page, "72-perk-confirmed.png");
  }
}

// Arena L3 perk gap confirmation
await enterArena(1);
const l3 = await dbg(page);
log(`Arena L3 perks ${JSON.stringify(l3.party)}`);
if (l3.party?.every((p) => p.level === 3 && (!p.perks || p.perks.length === 0))) {
  find(
    "P1",
    "Arena start at Level 3/6/9/12 grants tier levels with empty perkIds (no perk choice)",
    "startArena levelUpChar loop bypasses endCombat perk queue — players testing L9 never pick perks"
  );
}

// ===== New Game → Town → Dungeon =====
await page.goto(BASE, { waitUntil: "networkidle" });
await wait(400);
await press(page, "n");
await wait(500);
await shot(page, "80-party-choice.png");
await press(page, "d"); // default party
await wait(600);
await shot(page, "81-after-default.png");
log(`after D: ${JSON.stringify(await dbg(page))}`);
// if still choice, Enter
if ((await dbg(page)).mode === "party_creation") {
  await press(page, "Enter");
  await wait(500);
}
log(`mode now ${JSON.stringify(await dbg(page))}`);
await shot(page, "82-town.png");

// Town: first item Enter Dungeon at index 0?
const townText = await body(page);
log(`Town:\n${townText.slice(0, 700)}`);
// Shop etc then dungeon — default selection often Inn or Dungeon; press Enter for first
await press(page, "Enter");
await wait(400);
log(`after town enter: ${JSON.stringify(await dbg(page))}`);
if ((await dbg(page)).mode !== "dungeon") {
  // navigate to Enter Dungeon
  for (let i = 0; i < 8; i++) {
    await press(page, "ArrowDown");
    await wait(80);
    const txt = await body(page);
    if (/▶.*Dungeon|Enter Dungeon/i.test(txt)) {
      await press(page, "Enter");
      await wait(400);
      break;
    }
  }
}
await shot(page, "83-dungeon.png");
log(`dungeon? ${JSON.stringify(await dbg(page))}`);

const encounters = [];
if ((await dbg(page)).mode === "dungeon") {
  for (let step = 0; step < 120; step++) {
    await press(page, "ArrowUp");
    await wait(70);
    const st = await dbg(page);
    if (st.mode === "combat") {
      encounters.push({ step, stepsSince: st.steps });
      log(`ENCOUNTER ${encounters.length} at ${step} stepsSince=${st.steps}`);
      await shot(page, `90-enc-${encounters.length}.png`);
      await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
      await wait(250);
      if (encounters.length >= 6) break;
      continue;
    }
    if (step % 12 === 11) {
      await press(page, "ArrowRight");
      await wait(60);
    }
  }
  log(`Encounters: ${JSON.stringify(encounters)}`);
  if (encounters.length === 0) find("P1", "Zero encounters in 120 dungeon steps", "check walls/movement");
  else if (encounters.length >= 3) log("Encounter density feels OK for sample");
  await shot(page, "91-dungeon-done.png");

  // Map
  await press(page, "m");
  await wait(200);
  await shot(page, "92-map.png");
  await press(page, "m");
}

const errors = consoleMsgs.filter((m) => m.type === "error" || m.type === "pageerror");
log(`errors=${errors.length} ${JSON.stringify(errors.slice(0, 8))}`);
fs.writeFileSync(path.join(OUT, "raw-report-2.json"), JSON.stringify({ findings, notes, encounters, errors }, null, 2));
await browser.close();
console.log("DONE2");
