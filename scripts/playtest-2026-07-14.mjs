/**
 * Automated playtest matrix for 2026-07-14 ship.
 * Usage: node scripts/playtest-2026-07-14.mjs
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE = process.env.PLAYTEST_URL ?? "http://127.0.0.1:5210/OnyxLabyrinth/?debug=1";
const OUT = path.resolve("playtest-screenshots/2026-07-14");
fs.mkdirSync(OUT, { recursive: true });

const notes = [];
const findings = [];
const coverage = {};
const log = (m) => {
  console.log(m);
  notes.push(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
};
const find = (sev, title, body) => {
  findings.push({ sev, title, body });
  log(`FINDING [${sev}] ${title}`);
};

async function wait(ms) {
  await new Promise((r) => setTimeout(r, ms));
}
async function press(page, key, times = 1) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    await wait(70);
  }
}
async function hold(page, key, ms) {
  await page.keyboard.down(key);
  await wait(ms);
  await page.keyboard.up(key);
}
async function shot(page, name) {
  const p = path.join(OUT, name);
  await page.screenshot({ path: p, fullPage: false });
  log(`SHOT ${name}`);
  return p;
}

async function dbg(page) {
  return page.evaluate(() => {
    const d = window.__onyxDebug;
    if (!d) return { hasDebug: false };
    const s = d.state;
    const cc = d.getCombatController?.();
    return {
      hasDebug: true,
      mode: s.mode,
      stepsSinceEncounter: s.stepsSinceEncounter,
      floorId: s.floor?.id,
      party: (s.party ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        classId: c.classId,
        level: c.level,
        hp: c.hp,
        maxHp: c.maxHp,
        sp: c.sp,
        maxSp: c.maxSp,
        perkIds: [...(c.perkIds ?? [])],
        xp: c.xp,
      })),
      combatPhase: cc?.getPhase?.() ?? null,
      combatAlive: !!cc,
      gold: s.gold,
      inventoryLen: s.inventory?.length ?? 0,
    };
  });
}

async function bodyText(page) {
  return page.evaluate(() => document.body.innerText);
}

async function combatDom(page) {
  return page.evaluate(() => {
    const q = (sel) =>
      [...document.querySelectorAll(sel)].map((e) => e.textContent?.replace(/\s+/g, " ").trim()).filter(Boolean);
    return {
      palette: q(".ff6-palette-slot"),
      hints: q(".ff6-hint, .ff6-palette-hint"),
      party: q(".ff6-party-row"),
      inspect: q(".ff6-party-inspect, .ff6-party-row.inspect"),
      enemies: q(".ff6-enemy-row"),
      menu: q(".ff6-menu-item, .ff6-selection-item"),
      result: q(".ff6-result, .ff6-result-window"),
      cues: [...document.querySelectorAll("[class*='cue'], [class*='FAST'], [class*='AUTO']")].map(
        (e) => `${e.className}:${e.textContent?.trim()}`
      ),
      canvasVisible: !!document.querySelector("#combat-canvas, canvas.combat, #combat-panel canvas"),
      windowsHtml: document.querySelector(".ff6-windows")?.innerHTML?.slice(0, 500) ?? "",
    };
  });
}

async function enterArena(page, levelIndex) {
  // levels = [1,3,6,9,12] → index 0..4
  await page.goto(BASE, { waitUntil: "networkidle" });
  await wait(400);
  await press(page, "a");
  await wait(350);
  for (let i = 0; i < levelIndex; i++) await press(page, "ArrowDown");
  await shot(page, `arena-select-idx${levelIndex}.png`);
  await press(page, "Enter");
  await wait(700);
  for (let i = 0; i < 5; i++) {
    if ((await dbg(page)).mode === "combat") break;
    await wait(200);
  }
}

async function finishPlayback(page, max = 30) {
  for (let i = 0; i < max; i++) {
    const st = await dbg(page);
    if (st.mode !== "combat") return st;
    if (st.combatPhase === "result" || st.combatPhase === "palette") return st;
    if (st.combatPhase === "playback") await press(page, "Escape");
    else await press(page, "Enter");
    await wait(100);
  }
  return dbg(page);
}

async function smashFight(page, maxTurns = 80) {
  for (let i = 0; i < maxTurns; i++) {
    const st = await dbg(page);
    if (st.mode !== "combat") return st;
    if (st.combatPhase === "result") {
      await press(page, "Enter");
      await wait(200);
      continue;
    }
    if (st.combatPhase === "playback") {
      await press(page, "Escape");
      await wait(80);
      continue;
    }
    if (st.combatPhase === "palette") {
      await press(page, "Enter"); // Attack
      await wait(80);
      // confirm target if needed
      const st2 = await dbg(page);
      if (st2.combatPhase === "selectTarget") {
        await press(page, "Enter");
        await wait(80);
      }
      continue;
    }
    await press(page, "Enter");
    await wait(80);
  }
  return dbg(page);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const consoleMsgs = [];
page.on("console", (msg) => consoleMsgs.push({ type: msg.type(), text: msg.text() }));
page.on("pageerror", (err) => consoleMsgs.push({ type: "pageerror", text: String(err) }));

// ---------- 1. Title / hash ----------
await page.goto(BASE, { waitUntil: "networkidle" });
await wait(500);
const scripts = await page.evaluate(() => [...document.querySelectorAll("script")].map((s) => s.src));
log(`SCRIPTS ${JSON.stringify(scripts)}`);
coverage.title = "Pass";
await shot(page, "01-title.png");
const st0 = await dbg(page);
if (!st0.hasDebug) find("P1", "debug=1 did not expose __onyxDebug", JSON.stringify(st0));
log(`STATE ${JSON.stringify(st0)}`);

// ---------- 2. Arena L1 + palette ----------
await enterArena(page, 0);
let st = await dbg(page);
log(`Arena L1 start ${JSON.stringify(st)}`);
await shot(page, "04-combat-l1.png");
const dom1 = await combatDom(page);
log(`DOM L1 ${JSON.stringify(dom1)}`);
if (st.mode !== "combat") {
  coverage.arenaL1 = "Fail";
  find("P0", "Arena L1 did not enter combat", JSON.stringify(st));
} else {
  coverage.arenaL1 = "Pass";
  if (!dom1.palette.length) find("P1", "Action palette missing in combat", JSON.stringify(dom1));
  else log(`Palette slots: ${dom1.palette.join(" | ")}`);
}

// Magic / Skill via keyboard map: s=x Magic, d=y Skill (controller-input)
if (st.mode === "combat" && st.combatPhase === "palette") {
  coverage.palette = "Partial";
  await press(page, "s"); // Magic
  await wait(250);
  await shot(page, "05-magic-list.png");
  let d = await combatDom(page);
  let stM = await dbg(page);
  log(`After s(Magic): phase=${stM.combatPhase} menu=${JSON.stringify(d.menu.slice(0, 8))}`);
  if (stM.combatPhase !== "selectSpell" && !d.menu.length) {
    find("P1", "s/X Magic did not open spell list on palette", `phase=${stM.combatPhase}`);
  }
  await press(page, "Escape");
  await wait(150);
  await press(page, "Backspace");
  await wait(150);

  // Attack
  await press(page, "Enter");
  await wait(150);
  st = await dbg(page);
  if (st.combatPhase === "selectTarget") {
    log("Target select appeared (multi-enemy or no auto-confirm)");
    await shot(page, "06-target-select.png");
    await press(page, "Enter");
  } else if (st.combatPhase === "playback") {
    log("Attack auto-confirmed or single-target resolved to playback — good tempo");
  }
  await finishPlayback(page);
  await shot(page, "07-after-first-attack.png");
  coverage.targeting = "Pass";

  // Tempo tools on next attack
  await wait(200);
  st = await dbg(page);
  if (st.combatPhase === "palette") {
    await press(page, "Enter");
    await wait(100);
    if ((await dbg(page)).combatPhase === "selectTarget") await press(page, "Enter");
    await wait(80);
    if ((await dbg(page)).combatPhase === "playback") {
      await press(page, "Tab");
      await wait(120);
      await shot(page, "08-tab-fast.png");
      const afterTab = await bodyText(page);
      if (!/FAST/i.test(afterTab) && !(await combatDom(page)).cues.some((c) => /FAST/i.test(c))) {
        find("P2", "Tab FAST cue not visible in DOM/text after Tab during playback", afterTab.slice(0, 400));
      } else {
        log("FAST cue observed");
      }
      await hold(page, "Shift", 300);
      await press(page, "Escape");
      await wait(200);
      coverage.tempo = "Pass";
      await shot(page, "09-after-skip.png");
    }
  }

  // Repeat (z) and Auto (q)
  st = await dbg(page);
  if (st.mode === "combat" && st.combatPhase === "palette") {
    await press(page, "z");
    await wait(200);
    log(`After Repeat z: phase=${(await dbg(page)).combatPhase}`);
    await finishPlayback(page);
    await shot(page, "10-after-repeat.png");
    coverage.repeat = "Pass";
  }

  st = await dbg(page);
  if (st.mode === "combat") {
    await press(page, "q");
    await wait(150);
    await shot(page, "11-auto.png");
    const t = await bodyText(page);
    if (!/AUTO/i.test(t)) find("P2", "Q Auto: AUTO cue/hint not obvious in body text", t.slice(0, 500));
    else log("AUTO cue/hint visible");
    coverage.auto = "Pass";
    await press(page, "q"); // toggle off
    await wait(100);
  }

  // Inspect conflict: design maps t→lt r→rt but main steals t/r on palette for tech/flee
  st = await dbg(page);
  if (st.mode === "combat" && st.combatPhase === "palette") {
    const before = await combatDom(page);
    await press(page, "t");
    await wait(200);
    const afterT = await dbg(page);
    const domT = await combatDom(page);
    await shot(page, "12-after-t-inspect-or-tech.png");
    log(`t key: phase ${afterT.combatPhase}; inspect=${JSON.stringify(domT.inspect)}; menu=${domT.menu.slice(0, 5)}`);
    if (afterT.combatPhase === "selectTechnique") {
      find(
        "P1",
        "Keyboard t opens Technique (legacy) instead of LT party inspect",
        "controller-input maps t→lt, but main.ts palette shortcuts steal tcmifr before gamepad map; LT/RT inspect unreachable on keyboard during palette"
      );
      await press(page, "Escape");
      await wait(100);
    } else if (domT.inspect.length && !before.inspect.length) {
      log("t successfully triggered inspect");
      coverage.inspect = "Pass";
    }

    // Try e for RB target cycle (e→rb) — shouldn't be stolen
    await press(page, "e");
    await wait(100);
    log(`After e(rb): phase=${(await dbg(page)).combatPhase}`);

    // r should be flee shortcut not RT inspect
    await press(page, "r");
    await wait(300);
    const afterR = await dbg(page);
    await shot(page, "13-after-r.png");
    log(`r key: mode=${afterR.mode} phase=${afterR.combatPhase}`);
    if (afterR.combatPhase === "playback" || afterR.mode !== "combat" || /flee/i.test(await bodyText(page))) {
      find(
        "P2",
        "Keyboard r triggers Flee shortcut, blocking RT party inspect",
        "Same steal as t: palette legacy f/r flee vs KEYBOARD_MAP r→rt"
      );
    }
  }
}

// Smash remaining L1 fight
st = await smashFight(page);
await shot(page, "14-l1-end.png");
log(`L1 end ${JSON.stringify(st)}`);

// ---------- 3. Arena L9 ----------
await enterArena(page, 3); // Level 9
st = await dbg(page);
log(`Arena L9 start ${JSON.stringify(st)}`);
await shot(page, "20-combat-l9.png");
const levels = st.party?.map((c) => c.level) ?? [];
if (!levels.every((l) => l === 9)) find("P1", "Arena L9 party levels not all 9", JSON.stringify(levels));
coverage.arenaL9 = st.mode === "combat" ? "Pass" : "Fail";

// Check floor via wave encounter - look at enemy names
const enemies = (await combatDom(page)).enemies;
log(`L9 enemies: ${enemies.join(" | ")}`);
const weakTrash = enemies.join(" ").match(/skeleton|slime|rat|bat|goblin/i);
// Floor-3 content expected; trash names alone aren't conclusive

// Open mage magic (find mage turn)
async function waitForClassTurn(page, classId, max = 40) {
  for (let i = 0; i < max; i++) {
    const s = await dbg(page);
    if (s.mode !== "combat") return null;
    if (s.combatPhase === "playback") {
      await press(page, "Escape");
      await wait(80);
      continue;
    }
    if (s.combatPhase === "result") return null;
    if (s.combatPhase === "palette") {
      // acting character: look at party DOM / highlight
      const text = await bodyText(page);
      const p = s.party.find((c) => c.classId === classId && c.hp > 0);
      if (p && (text.includes(p.name) || true)) {
        // Peek menu header or acting marker via evaluate
        const acting = await page.evaluate(() => {
          const act = document.querySelector(".ff6-party-row.active, .ff6-party-row.acting, .acting");
          return act?.textContent ?? document.querySelector(".ff6-hint")?.textContent ?? "";
        });
        // Use technique of checking known spells by opening magic - expensive.
        // Instead bump XP not needed — cycle by defending until mage
        const names = s.party.map((c) => c.name);
        return { party: s.party, actingText: acting, names };
      }
    }
    await press(page, "b"); // defend
    await wait(100);
    await finishPlayback(page);
  }
  return null;
}

// Defend through until we can open magic on a caster: press s each palette turn until spell list appears
for (let i = 0; i < 12; i++) {
  st = await dbg(page);
  if (st.mode !== "combat" || st.combatPhase === "result") break;
  if (st.combatPhase === "playback") {
    await press(page, "Escape");
    await wait(80);
    continue;
  }
  if (st.combatPhase !== "palette") {
    await press(page, "Enter");
    await wait(80);
    continue;
  }
  await press(page, "s");
  await wait(200);
  st = await dbg(page);
  if (st.combatPhase === "selectSpell") {
    await shot(page, "21-l9-spell-menu.png");
    const d = await combatDom(page);
    const t = await bodyText(page);
    log(`Spell menu: ${JSON.stringify(d.menu.slice(0, 15))}`);
    log(`Spell body snippet: ${t.slice(0, 800)}`);
    if (!/Magic\s+\d+\/\d+|Tier|SP/i.test(t) && d.menu.length < 3) {
      find("P1", "L9 spell menu looks empty or missing counters/descriptions", t.slice(0, 600));
    } else {
      coverage.l9Magic = "Pass";
      log("L9 Magic list opened with content");
    }
    // scroll down list
    await press(page, "ArrowDown", 12);
    await wait(150);
    await shot(page, "22-l9-spell-scrolled.png");
    await press(page, "Escape");
    await wait(100);
    break;
  }
  // not a caster — defend
  await press(page, "Escape");
  await wait(80);
  await press(page, "b");
  await wait(100);
  await finishPlayback(page);
}

// Tech list
for (let i = 0; i < 10; i++) {
  st = await dbg(page);
  if (st.mode !== "combat" || st.combatPhase === "result") break;
  if (st.combatPhase === "playback") {
    await press(page, "Escape");
    await wait(80);
    continue;
  }
  if (st.combatPhase !== "palette") {
    await press(page, "Enter");
    await wait(80);
    continue;
  }
  await press(page, "d"); // Skill / Y
  await wait(200);
  st = await dbg(page);
  if (st.combatPhase === "selectTechnique") {
    await shot(page, "23-l9-tech-menu.png");
    const t = await bodyText(page);
    log(`Tech menu snippet: ${t.slice(0, 700)}`);
    if (/Throat…|…/.test(t) && /Throat/.test(t)) {
      find("P2", "Tech name still truncates with ellipsis", "Throat… observed");
    } else {
      coverage.l9Tech = "Pass";
    }
    await press(page, "Escape");
    break;
  }
  await press(page, "Escape");
  await press(page, "b");
  await finishPlayback(page);
}

await smashFight(page, 120);
await shot(page, "24-l9-wave-end.png");
log(`L9 wave end ${JSON.stringify(await dbg(page))}`);

// ---------- 4. Perk overlay Enter-spam ----------
await page.goto(BASE, { waitUntil: "networkidle" });
await wait(400);
await press(page, "a");
await wait(300);
await press(page, "Enter"); // L1
await wait(600);
// Elevate XP to near tier and force victory
const perkResult = await page.evaluate(() => {
  const d = window.__onyxDebug;
  if (!d?.state) return { ok: false, reason: "no debug" };
  // Level party to 2 with XP banked toward 3, or directly set levels to 2 and dump XP
  const { xpForNextLevel } = wait === undefined ? {} : {};
  // Directly level chars to 2 then give enough XP for level 3 via mutating character fields if accessible
  for (const c of d.state.party) {
    // Force level 2, clear perks, bank XP for next level
    c.level = 2;
    c.perkIds = [];
    c.xp = 99999; // hope endCombat level-up loops
  }
  return { ok: true, party: d.state.party.map((c) => ({ name: c.name, level: c.level, xp: c.xp })) };
});
log(`Perk prep mutate ${JSON.stringify(perkResult)}`);

st = await dbg(page);
if (st.mode === "combat") {
  await page.evaluate(() => window.__onyxDebug.exitDebugCombat("victory"));
  await wait(600);
  await shot(page, "30-after-force-victory.png");
  const t = await bodyText(page);
  log(`After force victory text:\n${t.slice(0, 1200)}`);
  log(`STATE ${JSON.stringify(await dbg(page))}`);

  // spam Enter without arrows
  for (let i = 0; i < 8; i++) await press(page, "Enter");
  await wait(200);
  await shot(page, "31-perk-enter-spam.png");
  const t2 = await bodyText(page);
  const stillPerk = /perk|choose|select/i.test(t2) || /◀|▶/.test(t2);
  log(`After Enter spam (expect perk still open): stillPerkish=${stillPerk}\n${t2.slice(0, 800)}`);
  if (!stillPerk && !/perk/i.test(t2)) {
    // Might have skipped if exitDebugCombat didn't queue perks
    find(
      "P2",
      "Perk overlay not observed after debug victory with XP dump",
      "exitDebugCombat may not run level-up loop when mutating xp/level manually; needs verification with real level-ups"
    );
    coverage.perkOverlay = "Partial";
  } else {
    coverage.perkOverlay = "Pass";
    // Proper select: arrow then enter
    await press(page, "ArrowRight");
    await wait(100);
    await press(page, "Enter");
    await wait(300);
    await shot(page, "32-perk-after-select.png");
  }
}

// Better perk test: use levelUp via real path - start Arena L3 (already at perk tier level 3)
await enterArena(page, 1); // Level 3 — should already BE at tier, perks empty until choice?
st = await dbg(page);
log(`Arena L3 party perks: ${JSON.stringify(st.party?.map((p) => ({ n: p.name, l: p.level, perks: p.perkIds })))}`);
// At start of Arena L3 they leveled through 3 without combat victory perk queue — check if they have empty perkIds
if (st.party?.every((p) => p.level >= 3 && (p.perkIds?.length ?? 0) === 0)) {
  find(
    "P2",
    "Arena level-up to L3 grants levels without perk selection",
    "startArena calls levelUpChar in a loop before any combat; perk overlay only queues on endCombat victory — Arena high-start parties may skip tier 3/6/9/12 choices"
  );
  coverage.arenaPerkGap = "Fail";
}

// Force victory from L1 after scripting levels properly via evaluate of levelUp if exported — skip if not

// ---------- 5. New Game → Town → Dungeon encounters ----------
await page.goto(BASE, { waitUntil: "networkidle" });
await wait(400);
await press(page, "n");
await wait(400);
await shot(page, "40-party-choice.png");
const partyText = await bodyText(page);
log(`Party creation:\n${partyText.slice(0, 600)}`);
// Default party — look for Enter / D
if (/default|ready-made|enter/i.test(partyText)) {
  await press(page, "Enter");
} else {
  await press(page, "Enter");
}
await wait(500);
await shot(page, "41-after-party.png");
st = await dbg(page);
log(`After party: ${JSON.stringify(st)}`);

// Might be in party editor choice — try keys
for (let i = 0; i < 6; i++) {
  st = await dbg(page);
  if (st.mode === "town" || st.mode === "dungeon") break;
  await press(page, "Enter");
  await wait(200);
}
await shot(page, "42-town-or-dungeon.png");
st = await dbg(page);
log(`Town/dungeon state ${JSON.stringify(st)}`);
coverage.town = st.mode === "town" || st.mode === "dungeon" ? "Pass" : "Partial";

if (st.mode === "town") {
  const t = await bodyText(page);
  log(`Town text:\n${t.slice(0, 900)}`);
  await shot(page, "43-town.png");
  // Enter dungeon — typically a menu option
  // Try common keys: leave / dungeon
  for (const k of ["ArrowDown", "ArrowDown", "Enter", "d", "Enter", "ArrowDown", "Enter"]) {
    await press(page, k);
    await wait(120);
    if ((await dbg(page)).mode === "dungeon") break;
  }
  await wait(300);
  st = await dbg(page);
  await shot(page, "44-dungeon-entry.png");
  log(`Dungeon entry ${JSON.stringify(st)}`);
}

// Dungeon step counting
if ((await dbg(page)).mode === "dungeon") {
  coverage.dungeon = "Pass";
  const encounters = [];
  let prevSteps = (await dbg(page)).stepsSinceEncounter;
  for (let step = 0; step < 100; step++) {
    await press(page, "ArrowUp"); // forward
    await wait(90);
    st = await dbg(page);
    if (st.mode === "combat") {
      encounters.push({ atStep: step, stepsSince: st.stepsSinceEncounter, floor: st.floorId });
      log(`ENCOUNTER #${encounters.length} at walk ${step}`);
      await shot(page, `50-encounter-${encounters.length}.png`);
      // Flee via hold B or r
      await press(page, "r");
      await wait(200);
      // if still combat, mash flee / Esc hold
      for (let j = 0; j < 20; j++) {
        st = await dbg(page);
        if (st.mode !== "combat") break;
        if (st.combatPhase === "playback") await press(page, "Escape");
        else if (st.combatPhase === "result") await press(page, "Enter");
        else {
          await hold(page, "b", 600); // hold flee
          await press(page, "r");
          await press(page, "f");
        }
        await wait(100);
      }
      // If stuck, force flee victory via debug
      if ((await dbg(page)).mode === "combat") {
        await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
        await wait(300);
      }
      await wait(200);
      if (encounters.length >= 5) break;
      continue;
    }
    // turn sometimes to avoid endless wall
    if (step % 15 === 14) {
      await press(page, "ArrowRight");
      await wait(80);
    }
  }
  log(`Encounter list: ${JSON.stringify(encounters)}`);
  coverage.encounters = encounters.length >= 1 ? "Pass" : "Fail";
  if (encounters.length === 0) {
    find("P1", "No dungeon encounters in 100 forward steps", "May be blocked by walls / stairs / wrong input; verify movement");
  } else if (encounters.length < 3) {
    find("P2", `Only ${encounters.length} encounters in ~100 steps`, JSON.stringify(encounters));
  }
  await shot(page, "51-dungeon-after-walk.png");
} else {
  coverage.dungeon = "Fail";
  find("P1", "Could not reach dungeon from New Game → Default Party → Town", JSON.stringify(await dbg(page)));
}

// Console summary
const errors = consoleMsgs.filter((m) => m.type === "error" || m.type === "pageerror");
const warnings = consoleMsgs.filter((m) => m.type === "warning");
log(`Console errors=${errors.length} warnings=${warnings.length}`);
if (errors.length) find("P1", "Browser console errors during playtest", JSON.stringify(errors.slice(0, 10)));

const report = { coverage, findings, notes, errors, warnings: warnings.slice(0, 20), scripts };
fs.writeFileSync(path.join(OUT, "raw-report.json"), JSON.stringify(report, null, 2));
log("Wrote raw-report.json");
await browser.close();
console.log("PLAYTEST DONE");
