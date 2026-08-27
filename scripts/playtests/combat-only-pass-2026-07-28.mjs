/**
 * Combat-only playtest pass (2026-07-28).
 *
 * Drives Arena (level 6, per the picker's discrete [1,3,6,9,12] options) through
 * several trash/mid waves exercising every verb, hunts for a heavy multi-enemy
 * pack, samples a boss via jumpTo+forceEncounter, and A/Bs normal-speed vs
 * Shift+Tab playback. Screenshots are BURST-captured (no waitForIdle) around
 * each action so charge->travel->impact and the swirl in/out are actually on
 * disk, not just static end-states. Every combat log + sounds() dump is saved
 * alongside so audio/VFX claims can be checked against real evidence, not
 * inferred from snapshot JSON alone.
 *
 * Run: node scripts/playtests/combat-only-pass-2026-07-28.mjs
 * (assumes `npx vite preview --port 5176 --base /OnyxLabyrinth/` is already running)
 */
import {
  launch,
  wait,
  press,
  snap,
  waitForIdle,
  ensureOutDir,
  shot as libShot,
  debugLog,
  sounds,
  ensureAudioResumed,
} from "./lib.mjs";
import fs from "fs";

const URL = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir("playtest-screenshots/2026-07-28-combat-pass");

const log = (...a) => console.log(...a);
const manifest = [];
const notes = []; // { tag, text } — raw evidence notes for the report writer

function note(tag, text) {
  notes.push({ tag, text });
  log(`  [note:${tag}] ${text}`);
}

const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });

async function shot(name, text = "") {
  const p = await libShot(page, OUT, name);
  manifest.push({ name, text });
  log(`  [shot] ${name}${text ? " — " + text : ""}`);
  return p;
}

/** Burst N screenshots at `intervalMs` WITHOUT waiting for idle — captures transient VFX. */
async function burst(prefix, count = 6, intervalMs = 120) {
  for (let i = 0; i < count; i++) {
    await shot(`${prefix}-f${i}.png`);
    await wait(intervalMs);
  }
}

async function freshBoot() {
  await page.goto(URL, { waitUntil: "networkidle" });
  await wait(400);
  // Real keydown before any debug jumpTo/startCombat call — see
  // ensureAudioResumed's doc comment; without it, the first combat cue or
  // two report bufferMissing purely because resumeAudioOnce never fired.
  await ensureAudioResumed(page);
}

const jump = async (opts) => {
  await page.evaluate((o) => window.__onyxDebug.jumpTo(o), opts);
  await waitForIdle(page, 5000);
  return snap(page);
};

async function exitCombatAndSettle(result, maxWaitMs = 6000) {
  await page.evaluate((r) => window.__onyxDebug.exitDebugCombat(r), result);
  const deadline = Date.now() + maxWaitMs;
  let st = await snap(page);
  while (st.route === "combat" && Date.now() < deadline) {
    await wait(150);
    st = await snap(page);
  }
  await waitForIdle(page, 3000);
  return snap(page);
}

async function forceEncounter({ allowBoss = false, minEnemies = 0 } = {}) {
  return page.evaluate(
    async ({ allowBoss, minEnemies }) => {
      const d = window.__onyxDebug;
      const s = d.state;
      let resolved = null;
      for (let attempts = 0; attempts < 400; attempts++) {
        const entry = d.rollEncounter(s.floor.id);
        if (!entry) return { ok: false };
        const r = d.resolveEncounter(entry);
        if (r.length === 0) continue;
        const hasBoss = r.some((e) => e.enemy.isBoss);
        if (hasBoss !== allowBoss) continue;
        if (r.length < minEnemies) continue;
        resolved = r;
        break;
      }
      if (!resolved) return { ok: false };
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
      await d.startCombat(combat);
      return { ok: true, enemyCount: resolved.length, bossNames: resolved.filter(e => e.enemy.isBoss).map(e => e.enemy.name) };
    },
    { allowBoss, minEnemies }
  );
}

/** Wait out playback, WITHOUT hiding VFX — polls fast so caller can still burst-shoot mid-playback if desired. */
async function waitPlayback(maxMs = 8000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const st = await snap(page);
    if (st.combat?.phase !== "playback") return st;
    await wait(80);
  }
  return snap(page);
}

async function dumpLogs(tag) {
  const dlog = await debugLog(page, 300);
  const snd = await sounds(page, 150);
  fs.writeFileSync(`${OUT}/${tag}-eventlog.json`, JSON.stringify(dlog, null, 2));
  fs.writeFileSync(`${OUT}/${tag}-sounds.json`, JSON.stringify(snd, null, 2));
  return { dlog, snd };
}

function section(name) {
  log(`\n=== ${name} ===`);
}

const results = { waves: [], boss: null, tempo: {}, thief: [] };

try {
  // ==========================================================================
  section("0. Boot + Arena entry + level select (Level 6)");
  await freshBoot();
  await press(page, "a"); // Arena from title
  await waitForIdle(page, 3000);
  await shot("00-arena-setup.png", "arena level picker — levels [1,3,6,9,12]");

  // picker order is [1,3,6,9,12]; index 2 = Level 6. Move down twice.
  await press(page, "ArrowDown", 2, 150);
  await shot("00b-arena-setup-level6-selected.png", "cursor on Level 6");
  await press(page, "Enter");
  // Burst through the swirl-in instead of waiting for idle — this is exactly
  // the transition the visual-design-pass doc flags as easy to only see as a
  // static end-state.
  await burst("01-arena-swirl-in", 8, 150);
  let st = await snap(page);
  note("entry", `route after Enter+swirl burst = ${st.route}, wave=${st.combat ? "combat-live" : "n/a"}`);
} catch (e) {
  log("Section 0 threw:", e);
}

// ============================================================================
// 1-5: five Arena waves, one verb emphasis each, burst-capturing action VFX.
const verbPlan = [
  { label: "Attack", key: "a" },
  { label: "Magic", key: "c" },
  { label: "Technique", key: "t" },
  { label: "Item", key: "i" },
  { label: "Defend+Analyze", key: null }, // handled specially
];

for (let waveIdx = 0; waveIdx < verbPlan.length; waveIdx++) {
  const plan = verbPlan[waveIdx];
  try {
    section(`Wave ${waveIdx + 1} — verb focus: ${plan.label}`);
    let st = await snap(page);
    if (st.route !== "combat") {
      note("wave-skip", `wave ${waveIdx + 1}: route=${st.route}, not in combat — stopping wave loop`);
      break;
    }
    const enemyCount = st.combat?.enemies?.length ?? 0;
    const waveStart = Date.now();
    await shot(`wave${waveIdx + 1}-00-start.png`, `${enemyCount} enemies, verb=${plan.label}`);

    // Let opening playback run out before touching the palette.
    await waitPlayback(4000);
    st = await snap(page);
    await shot(`wave${waveIdx + 1}-01-palette.png`, `acting=${st.combat?.actingCharId}, phase=${st.combat?.phase}`);

    let actionsTaken = 0;
    let spellsSeen = [];
    let itemsSeen = [];
    for (let turn = 0; turn < 10 && actionsTaken < 4; turn++) {
      st = await snap(page);
      if (st.route !== "combat" || st.combat?.phase !== "palette") break;
      const actingId = st.combat.actingCharId;

      if (plan.key === "a") {
        await press(page, "a");
        await wait(200);
        st = await snap(page);
        if (st.combat?.selection) {
          await shot(`wave${waveIdx + 1}-02-target-select.png`, "target cursor");
          await press(page, "Enter");
        }
        if (actingId === "c2") {
          // Coda (Thief) — capture the exact attack pose for melee/ranged comparison.
          await burst(`thief-attack-w${waveIdx + 1}`, 5, 100);
          results.thief.push({ wave: waveIdx + 1, actingId, files: `thief-attack-w${waveIdx + 1}-f*.png` });
        } else {
          await burst(`wave${waveIdx + 1}-03-attack-vfx`, 5, 100);
        }
      } else if (plan.key === "c") {
        await press(page, "c");
        await wait(250);
        st = await snap(page);
        if (st.combat?.selection) {
          spellsSeen.push({ turn, entries: st.combat.selection.entries.slice(0, 8) });
          await shot(`wave${waveIdx + 1}-02-spell-menu.png`, JSON.stringify(st.combat.selection.entries));
          // Cycle to a different entry each attempt to sample spell variety.
          const idx = actionsTaken % Math.max(1, st.combat.selection.entries.length);
          for (let i = 0; i < idx; i++) await press(page, "ArrowDown", 1, 60);
          await press(page, "Enter");
          await wait(250);
          st = await snap(page);
          if (st.combat?.selection) await press(page, "Enter"); // confirm target
          await burst(`wave${waveIdx + 1}-03-spell-vfx-${actionsTaken}`, 8, 110);
        } else {
          note("magic-blocked", `wave ${waveIdx + 1} turn ${turn}: cast produced no selection (likely "No magic!" — non-caster or silenced)`);
          await press(page, "a"); // fallback so the turn still resolves
          await wait(200);
          st = await snap(page);
          if (st.combat?.selection) await press(page, "Enter");
        }
      } else if (plan.key === "t") {
        await press(page, "t");
        await wait(250);
        st = await snap(page);
        if (st.combat?.selection) {
          await shot(`wave${waveIdx + 1}-02-technique-menu.png`, JSON.stringify(st.combat.selection.entries));
          await press(page, "Enter");
          await wait(250);
          st = await snap(page);
          if (st.combat?.selection) await press(page, "Enter");
          await burst(`wave${waveIdx + 1}-03-technique-vfx`, 6, 110);
        } else {
          note("tech-empty", `wave ${waveIdx + 1} turn ${turn}: technique menu produced no selection`);
          await press(page, "a");
          await wait(200);
          st = await snap(page);
          if (st.combat?.selection) await press(page, "Enter");
        }
      } else if (plan.key === "i") {
        await press(page, "i");
        await wait(250);
        st = await snap(page);
        if (st.combat?.selection) {
          itemsSeen.push(st.combat.selection.entries.slice(0, 8));
          await shot(`wave${waveIdx + 1}-02-item-menu.png`, JSON.stringify(st.combat.selection.entries));
          await press(page, "Enter");
          await wait(250);
          st = await snap(page);
          if (st.combat?.selection) await press(page, "Enter");
          await burst(`wave${waveIdx + 1}-03-item-vfx`, 5, 110);
        } else {
          note("item-empty", `wave ${waveIdx + 1} turn ${turn}: item menu empty/disabled`);
          await press(page, "a");
          await wait(200);
          st = await snap(page);
          if (st.combat?.selection) await press(page, "Enter");
        }
      } else {
        // Defend + Analyze wave: alternate the two.
        if (actionsTaken % 2 === 0) {
          await press(page, "b"); // Defend
          await shot(`wave${waveIdx + 1}-02-defend.png`, `acting=${actingId}`);
        } else {
          await press(page, "n"); // Analyze
          await wait(250);
          st = await snap(page);
          if (st.combat?.selection) {
            await shot(`wave${waveIdx + 1}-02-analyze-target.png`, "analyze target select");
            await press(page, "Enter");
          }
          await wait(250);
          await shot(`wave${waveIdx + 1}-03-analyze-result.png`, "post-analyze");
        }
      }

      await waitPlayback(6000);
      await wait(150);
      actionsTaken++;
    }

    st = await snap(page);
    if (st.route === "combat") {
      st = await exitCombatAndSettle("victory");
    }
    if (st.route === "perk") {
      for (let i = 0; i < 10 && st.route === "perk"; i++) {
        await press(page, "ArrowLeft");
        await press(page, "Enter");
        await waitForIdle(page, 3000);
        st = await snap(page);
      }
    }
    const waveMs = Date.now() - waveStart;
    await shot(`wave${waveIdx + 1}-04-postcombat.png`, `route=${st.route}, wallclock=${waveMs}ms`);
    const { dlog, snd } = await dumpLogs(`wave${waveIdx + 1}`);
    results.waves.push({
      wave: waveIdx + 1,
      verb: plan.label,
      enemyCount,
      actionsTaken,
      wallclockMs: waveMs,
      spellsSeen,
      itemsSeen,
      postRoute: st.route,
      soundCount: snd?.length ?? 0,
    });

    // Advance to next arena wave if still in arena hub. First keydown after
    // the hub (re)opens is swallowed by justOpenedArena — burn it, then send
    // the real select.
    if (st.route === "arena") {
      await press(page, "Enter"); // swallowed
      await wait(300);
      await press(page, "Enter"); // real select -> Next Fight
      await wait(1800);
      st = await snap(page);
      if (st.route !== "combat") {
        await wait(1800);
        st = await snap(page);
      }
    }
  } catch (e) {
    log(`Wave ${waveIdx + 1} threw:`, e);
    results.waves.push({ wave: waveIdx + 1, verb: plan.label, error: String(e) });
  }
}

// ============================================================================
try {
  section("6. Heavy multi-enemy pack (formation stress)");
  await freshBoot();
  await jump({ floorId: 4, x: 3, y: 3, facing: 0, autosave: false, partyLevel: 8 });
  const res = await forceEncounter({ minEnemies: 4 });
  if (!res.ok) {
    note("heavy-pack-fail", "could not roll a 4+ enemy pack on floor 4 after 400 attempts");
  } else {
    await waitPlayback(4000);
    await shot("40-heavy-pack-start.png", `${res.enemyCount} enemies — formation check`);
    await wait(600);
    await shot("41-heavy-pack-settled.png", "formation settled, check for overlap/pile/aisle");
    let st = await snap(page);
    if (st.combat?.phase === "palette") {
      await shot("42-heavy-pack-enemy-window.png", "enemy list window — check completeness/truncation");
    }
    st = await exitCombatAndSettle("victory");
    results.heavyPack = { enemyCount: res.enemyCount };
  }
} catch (e) {
  log("Section 6 threw:", e);
}

// ============================================================================
try {
  section("7. Boss sample (telegraphs, nameplate, flee refusal)");
  await freshBoot();
  await jump({ floorId: 3, x: 2, y: 2, facing: 0, autosave: false, partyLevel: 10 });
  const res = await forceEncounter({ allowBoss: true });
  if (!res.ok) {
    note("boss-fail", "could not force a boss encounter on floor 3 after 400 attempts");
  } else {
    await burst("50-boss-intro", 8, 150); // nameplate/telegraph swirl-in
    let st = await snap(page);
    await waitPlayback(4000);
    st = await snap(page);
    await shot("51-boss-palette.png", `boss=${res.bossNames?.join(",")}, phase=${st.combat?.phase}`);

    // Attempt Flee against a boss — many Wizardry-likes refuse this.
    if (st.combat?.phase === "palette") {
      await press(page, "f");
      await wait(300);
      st = await snap(page);
      await shot("52-boss-flee-attempt.png", `route after flee attempt=${st.route}, phase=${st.combat?.phase}`);
    }

    // One real action + burst VFX against the boss.
    st = await snap(page);
    if (st.route === "combat" && st.combat?.phase === "palette") {
      await press(page, "a");
      await wait(200);
      st = await snap(page);
      if (st.combat?.selection) await press(page, "Enter");
      await burst("53-boss-player-turn-vfx", 8, 130);
      await waitPlayback(6000);
      st = await snap(page);
      await shot("54-boss-after-turn.png", `phase=${st.combat?.phase}`);
    }

    st = await snap(page);
    if (st.route === "combat") st = await exitCombatAndSettle("victory");
    if (st.route === "perk") {
      for (let i = 0; i < 10 && st.route === "perk"; i++) {
        await press(page, "ArrowLeft");
        await press(page, "Enter");
        await waitForIdle(page, 3000);
        st = await snap(page);
      }
    }
    await dumpLogs("boss");
    results.boss = { names: res.bossNames, fledOk: null, postRoute: st.route };
  }
} catch (e) {
  log("Section 7 threw:", e);
}

// ============================================================================
try {
  section("8. Tempo A/B — normal speed vs Shift(2x)+Tab(fast)");
  await freshBoot();
  await jump({ floorId: 1, x: 5, y: 7, facing: 0, autosave: false, partyLevel: 8 });

  // --- Baseline: normal speed ---
  let res = await forceEncounter();
  if (res.ok) {
    const t0 = Date.now();
    await waitPlayback(4000);
    let st = await snap(page);
    for (let i = 0; i < 6 && st.route === "combat" && st.combat?.phase !== "result"; i++) {
      st = await snap(page);
      if (st.combat?.phase !== "palette") { await wait(150); continue; }
      await press(page, "a");
      await wait(150);
      st = await snap(page);
      if (st.combat?.selection) await press(page, "Enter");
      await waitPlayback(6000);
    }
    const baselineMs = Date.now() - t0;
    st = await snap(page);
    if (st.route === "combat") st = await exitCombatAndSettle("victory");
    if (st.route === "perk") {
      for (let i = 0; i < 10 && st.route === "perk"; i++) {
        await press(page, "ArrowLeft"); await press(page, "Enter");
        await waitForIdle(page, 3000); st = await snap(page);
      }
    }
    results.tempo.baselineMs = baselineMs;
    note("tempo-baseline", `normal-speed fight wallclock = ${baselineMs}ms`);
  }

  // --- Fast: hold Shift + toggle Tab during playback ---
  await freshBoot();
  await jump({ floorId: 1, x: 5, y: 7, facing: 0, autosave: false, partyLevel: 8 });
  res = await forceEncounter();
  if (res.ok) {
    const t0 = Date.now();
    await page.keyboard.down("Shift");
    await page.keyboard.press("Tab");
    await waitPlayback(4000);
    let st = await snap(page);
    for (let i = 0; i < 6 && st.route === "combat" && st.combat?.phase !== "result"; i++) {
      st = await snap(page);
      if (st.combat?.phase !== "palette") { await wait(80); continue; }
      await press(page, "a");
      await wait(100);
      st = await snap(page);
      if (st.combat?.selection) await press(page, "Enter");
      await waitPlayback(6000);
    }
    await page.keyboard.up("Shift");
    const fastMs = Date.now() - t0;
    st = await snap(page);
    if (st.route === "combat") st = await exitCombatAndSettle("victory");
    if (st.route === "perk") {
      for (let i = 0; i < 10 && st.route === "perk"; i++) {
        await press(page, "ArrowLeft"); await press(page, "Enter");
        await waitForIdle(page, 3000); st = await snap(page);
      }
    }
    results.tempo.fastMs = fastMs;
    note("tempo-fast", `Shift+Tab fight wallclock = ${fastMs}ms`);
  }
} catch (e) {
  log("Section 8 threw:", e);
}

// ============================================================================
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, notes, manifest }, null, 2));
console.log("\n=== results ===");
console.log(JSON.stringify(results, null, 2));
console.log("\n=== notes ===");
console.log(JSON.stringify(notes, null, 2));
console.log(`\nBrowser console/page errors captured: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 20));

await browser.close();
