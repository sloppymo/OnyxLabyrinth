/**
 * Per-floor combat difficulty probe (sequel to encounter-pacing).
 * Plan: docs/superpowers/plans/2026-07-25-per-floor-combat-difficulty-probe.md
 *
 * Question: at a FIXED party level, how does combat difficulty ramp across
 * floors 1->5? Measures rounds-to-victory, HP lost, near-wipe/wipe rate per
 * floor, using N forced (non-boss) encounters resolved through the real
 * party-Auto combat path ("Q" toggle -> tryPartyAuto attacks each turn ->
 * real endCombat()), NOT exitDebugCombat — that would record null TTK/damage.
 *
 * Zones are deliberately ignored (frequency-only per the 2026-07-25 pacing
 * addendum — safe/hot share one table per floor); the only axis under test
 * is floor id -> ENCOUNTER_TABLES[floor.id].
 *
 * Between each forced encounter the party is reset to full HP/SP/status and
 * xp:0 directly via the exposed __onyxDebug.state reference. This isolates
 * per-encounter floor difficulty from attrition-order effects (fight #14
 * should not look harder than fight #1 just because nobody healed between
 * them) and keeps the party pinned at the requested level — a single
 * encounter's XP reward (well under 100/enemy, see report) never approaches
 * xpForNextLevel(L) = L*120, so the xp:0 reset is a safety net, not the
 * primary guard.
 *
 * Run: node scripts/playtests/per-floor-combat-difficulty.mjs
 * Expects: npx vite preview --port 5240 --base /OnyxLabyrinth/
 */
import fs from "fs";
import path from "path";
import {
  launch,
  wait,
  snap,
  waitForIdle,
  ensureOutDir,
  jumpTo,
  captureFailureBundle,
} from "./lib.mjs";

const BASE = process.env.ONYX_URL ?? "http://127.0.0.1:5240/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir("playtest-screenshots/2026-07-25-per-floor-combat-difficulty");

const FLOORS = [1, 2, 3, 4, 5];
const L = 8; // mid-campaign fixed level, per plan (recommend L6 or L8)
const N = 15; // forced non-boss encounters per floor
const MAX_ATTEMPTS_PER_FLOOR = N * 4; // guard against runaway boss-reroll / stall loops
const COMBAT_TIMEOUT_MS = 120000; // floor 5 at a below-target level can run many rounds
const MAX_STALE_RECOVERIES_PER_FLOOR = 5; // beyond this, a stall looks structural, not flaky

const log = (...a) => console.log(...a);

/** Force-build a non-boss encounter for the current floor and start it via
 *  the real startCombat() path. Rerolls up to 50 times if the weighted table
 *  happens to hand back a boss pack (rare, low weight, out of scope here —
 *  see plan's "Out of scope"). Returns { ok, isBossOnly, enemyCount }. */
async function forceEncounter(page) {
  return page.evaluate(async () => {
    const d = window.__onyxDebug;
    const s = d.state;
    let resolved = null;
    let attempts = 0;
    for (; attempts < 50; attempts++) {
      const entry = d.rollEncounter(s.floor.id);
      if (!entry) return { ok: false, isBossOnly: false, enemyCount: 0 };
      const r = d.resolveEncounter(entry);
      if (r.length === 0) continue;
      if (r.some((e) => e.enemy.isBoss)) continue;
      resolved = r;
      break;
    }
    if (!resolved) return { ok: false, isBossOnly: true, enemyCount: 0 };
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
    return { ok: true, isBossOnly: false, enemyCount: resolved.length };
  });
}

/**
 * Toggle Bravely-style party Auto on and verify it actually took — startCombat()
 * arms a one-shot suppressNextCombatKey guard (main.ts, cleared via
 * setTimeout(fn, 0)) meant to swallow a leaked keypress from the real
 * dungeon-movement -> encounter keydown path. Since we drive startCombat
 * programmatically, that guard can still be armed the instant forceEncounter
 * resolves, silently eating a same-tick "q" press with no effect. Confirming
 * against the live combatController.partyAuto (not just "the key was sent")
 * and retrying catches that instead of hanging in waitForIdle for the full
 * combat timeout.
 */
async function enableAutoAndVerify(page, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    await wait(80);
    const before = await page.evaluate(() => {
      const c = window.__onyxDebug.getCombatController();
      return c ? c.partyAuto : null;
    });
    if (before === true) return true;
    if (before === null) return false; // combat already ended/controller gone
    await page.keyboard.press("q");
    const after = await page.evaluate(() => {
      const c = window.__onyxDebug.getCombatController();
      return c ? c.partyAuto : null;
    });
    if (after === true) return true;
  }
  return false;
}

/**
 * Sticky Auto-Fast (2x playback) — same key-eaten-by-suppressNextCombatKey
 * risk as "q", plus Tab only registers while phase === "playback" (see
 * handleKey), which enableAutoAndVerify's own resolve already guarantees.
 * Not fatal if this never takes — floors just take longer to sample, so
 * failure here doesn't abort anything, only skips the speedup.
 */
async function enableFastAndVerify(page, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    const before = await page.evaluate(() => window.__onyxDebug.getCombatController()?.autoFast ?? null);
    if (before === true) return true;
    if (before === null) return false;
    await page.keyboard.press("Tab");
    await wait(50);
    const after = await page.evaluate(() => window.__onyxDebug.getCombatController()?.autoFast ?? null);
    if (after === true) return true;
  }
  return false;
}

/** Full-restore every party member (active + bench) between forced
 *  encounters: hp/sp to max, status cleared, xp:0 (see file header). */
async function resetParty(page) {
  await page.evaluate(() => {
    const s = window.__onyxDebug.state;
    for (const c of s.party) {
      c.hp = c.maxHp;
      c.sp = c.maxSp;
      c.status = [];
      c.xp = 0;
    }
  });
}

/** Raw final combat.party (hp/maxHp) read BEFORE confirming the result
 *  screen — this is the authoritative per-encounter outcome, ahead of any
 *  post-combat bookkeeping (wipe-revive, XP/level writes).
 *
 *  Reads combatController.state, NOT __onyxDebug.state.combat: the outer
 *  GameState.combat reference is set once at startCombat() and never
 *  reassigned as turns resolve (resolveAndPlay() rebinds the *controller's*
 *  own `this.state` to each new immutable CombatState instead) — reading it
 *  mid/post-fight silently returns the stale round-0 starting snapshot. */
async function readCombatOutcome(page) {
  return page.evaluate(() => {
    const controller = window.__onyxDebug.getCombatController();
    const c = controller ? controller.state : null;
    if (!c) return null;
    return {
      round: c.round,
      result: c.result ?? null,
      fighters: c.party.map((p) => ({ id: p.id, hp: p.hp, maxHp: p.maxHp })),
    };
  });
}

async function run() {
  const { browser, page, errors } = await launch();
  const floorReports = [];

  const FLOOR_DEFS = await (async () => {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await wait(400);
    return page.evaluate(() =>
      window.__onyxDebug.FLOORS.map((f) => ({ id: f.id, name: f.name, startX: f.startX, startY: f.startY }))
    );
  })();

  for (const floorId of FLOORS) {
    const fdef = FLOOR_DEFS.find((f) => f.id === floorId);
    if (!fdef) {
      log(`[SKIP] floor ${floorId} not found in FLOORS`);
      continue;
    }
    log(`\n=== Floor ${floorId} (${fdef.name}) — L${L}, target N=${N} ===`);

    let st = await jumpTo(page, { floorId, x: fdef.startX, y: fdef.startY, facing: 0, partyLevel: L });
    if (st.route !== "dungeon") {
      log(`[ABORT] floor ${floorId}: jumpTo landed on route=${st.route}, expected dungeon`);
      floorReports.push({ floorId, name: fdef.name, insufficientSample: true, reason: `post-jumpTo route=${st.route}`, encounters: [] });
      continue;
    }

    const encounters = [];
    let attempts = 0;
    let bossSkips = 0;
    let staleRecoveries = 0;
    let floorAborted = false;
    let abortReason = null;

    while (encounters.length < N && attempts < MAX_ATTEMPTS_PER_FLOOR) {
      attempts++;
      await resetParty(page);

      const forced = await forceEncounter(page);
      if (!forced.ok) {
        if (forced.isBossOnly) {
          bossSkips++;
          continue;
        }
        abortReason = "forceEncounter failed (no table entries)";
        floorAborted = true;
        break;
      }

      const autoOn = await enableAutoAndVerify(page);
      if (!autoOn) {
        abortReason = "party Auto never registered (combatController.partyAuto stayed false)";
        await captureFailureBundle(page, `f${floorId}-auto-failed-${encounters.length}`, { outDir: OUT, errors });
        floorAborted = true;
        break;
      }
      await enableFastAndVerify(page); // best-effort 2x speedup; see doc comment

      // Poll for the fight to reach the result screen in bounded chunks
      // rather than one long waitForIdle: isIdle() also reads true for a
      // genuinely-open manual palette, so a single call can't distinguish
      // "the fight is over" from "Auto somehow didn't resolve this turn".
      let sAfter = await snap(page);
      let waited = 0;
      while (sAfter.combat && sAfter.combat.phase !== "result" && waited < COMBAT_TIMEOUT_MS) {
        await waitForIdle(page, 2000);
        waited += 2000;
        sAfter = await snap(page);
        if (sAfter.combat && sAfter.combat.phase === "palette" && !(await page.evaluate(() => window.__onyxDebug.getCombatController()?.partyAuto))) {
          await page.keyboard.press("q"); // defensive re-toggle; should be unreachable, see tryPartyAuto
        }
      }

      if (!sAfter.combat || sAfter.combat.phase !== "result") {
        // Rare Playwright/CDP timing flake (confirmed non-deterministic across
        // repeated runs, not a reproducible game stall — see probe dev notes),
        // not a structural bug: recover via exitDebugCombat("fled") and retry
        // rather than losing the whole floor's sample to one bad roll. fled
        // skips the visual result screen and calls the real endCombat() path
        // directly, so it lands cleanly back in the dungeon; this attempt's
        // data is discarded (not counted toward N) since mid-fight HP/round
        // tracking can't be trusted once we bail out early.
        staleRecoveries++;
        await captureFailureBundle(page, `f${floorId}-timeout-${encounters.length}`, { outDir: OUT, errors });
        if (staleRecoveries > MAX_STALE_RECOVERIES_PER_FLOOR) {
          abortReason = `combat repeatedly failed to reach result phase (${staleRecoveries} recoveries) — looks structural, not flaky`;
          floorAborted = true;
          break;
        }
        await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
        const recovered = await waitForIdle(page, 5000);
        const sRecovered = await snap(page);
        if (!recovered || sRecovered.route !== "dungeon") {
          abortReason = `exitDebugCombat recovery failed to reach dungeon (route=${sRecovered.route})`;
          floorAborted = true;
          break;
        }
        log(`  [recovered] fight stalled in phase=playback, forced-exit via exitDebugCombat("fled"), retrying`);
        continue;
      }

      const outcome = await readCombatOutcome(page);
      if (!outcome) {
        abortReason = "combat state vanished before result could be read";
        floorAborted = true;
        break;
      }

      const preTotalMaxHp = outcome.fighters.reduce((sum, f) => sum + f.maxHp, 0);
      const postTotalHp = outcome.fighters.reduce((sum, f) => sum + Math.max(0, f.hp), 0);
      const hpLost = preTotalMaxHp - postTotalHp;
      const hpLostPct = preTotalMaxHp > 0 ? hpLost / preTotalMaxHp : 0;
      const anyKO = outcome.fighters.some((f) => f.hp <= 0);
      const nearWipe = anyKO || outcome.fighters.some((f) => f.hp > 0 && f.hp < 0.25 * f.maxHp);
      const wipe = outcome.result === "wipe";

      encounters.push({
        idx: encounters.length + 1,
        enemyCount: forced.enemyCount,
        round: outcome.round,
        result: outcome.result,
        hpLost,
        hpLostPct,
        anyKO,
        nearWipe,
        wipe,
      });
      log(
        `  [${encounters.length}/${N}] enemies=${forced.enemyCount} round=${outcome.round} result=${outcome.result} ` +
        `hpLost=${hpLost}(${(hpLostPct * 100).toFixed(0)}%) nearWipe=${nearWipe}`
      );

      // Confirm the result screen -> real endCombat().
      await page.keyboard.press("Enter");
      await waitForIdle(page, 5000);
      let sConfirmed = await snap(page);

      const landedOnGameOver = sConfirmed.route === "game_over";
      if (landedOnGameOver) {
        // Wipe path: Continue -> openTown(). GameOverController arms after a
        // macrotask so the wipe-confirm Enter cannot dismiss it in the same
        // dispatch (fixed 2026-07-25 in game-over-ui.ts).
        await page.keyboard.press("Enter");
        await waitForIdle(page, 5000);
        sConfirmed = await snap(page);
      }
      if (sConfirmed.route === "town") {
        if (!landedOnGameOver) {
          // Pre-fix: one Enter cascaded combat→game_over→town in one keydown.
          abortReason =
            "wipe skipped game_over (landed on town) — cascade bug regression?";
          floorAborted = true;
          break;
        }
        // Jump straight back to this floor to keep sampling.
        const rejump = await jumpTo(page, { floorId, x: fdef.startX, y: fdef.startY, facing: 0, partyLevel: L });
        if (rejump.route !== "dungeon") {
          abortReason = `re-jumpTo after wipe landed on route=${rejump.route}`;
          floorAborted = true;
          break;
        }
      } else if (sConfirmed.route !== "dungeon") {
        abortReason = `unexpected route after confirming result: ${sConfirmed.route}`;
        await captureFailureBundle(page, `f${floorId}-unexpected-route-${encounters.length}`, { outDir: OUT, errors });
        floorAborted = true;
        break;
      }
    }

    const insufficientSample = encounters.length < N;
    const n = encounters.length;
    const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

    const summary = {
      floorId,
      name: fdef.name,
      level: L,
      n,
      targetN: N,
      insufficientSample,
      abortReason: floorAborted ? abortReason : null,
      attempts,
      bossSkips,
      staleRecoveries,
      meanRounds: mean(encounters.map((e) => e.round)),
      meanHpLost: mean(encounters.map((e) => e.hpLost)),
      meanHpLostPct: mean(encounters.map((e) => e.hpLostPct)),
      nearWipeRate: n ? encounters.filter((e) => e.nearWipe).length / n : null,
      wipeRate: n ? encounters.filter((e) => e.wipe).length / n : null,
      meanEnemyCount: mean(encounters.map((e) => e.enemyCount)),
      encounters,
    };
    floorReports.push(summary);

    log(
      `  -> F${floorId} summary: n=${n}/${N} meanRounds=${summary.meanRounds?.toFixed(2)} ` +
      `meanHpLostPct=${summary.meanHpLostPct !== null ? (summary.meanHpLostPct * 100).toFixed(1) + "%" : "n/a"} ` +
      `nearWipeRate=${summary.nearWipeRate !== null ? (summary.nearWipeRate * 100).toFixed(0) + "%" : "n/a"} ` +
      `wipeRate=${summary.wipeRate !== null ? (summary.wipeRate * 100).toFixed(0) + "%" : "n/a"}` +
      (staleRecoveries > 0 ? `  (${staleRecoveries} stale-fight recoveries)` : "") +
      (insufficientSample ? `  [INSUFFICIENT SAMPLE: ${abortReason ?? "attempts exhausted"}]` : "")
    );
  }

  const reportPath = path.join(OUT, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify({ level: L, targetN: N, floors: floorReports }, null, 2));
  log(`\nWrote ${reportPath}`);

  const uniqErrors = [...new Set(errors)];
  if (uniqErrors.length) log("console/page errors:", uniqErrors.slice(0, 10).join(" | "));

  await browser.close();
  process.exit(0);
}

run();
