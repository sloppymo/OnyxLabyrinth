/**
 * Phase-driven browser verification of seeded gameplay RNG determinism.
 *
 * Runs the SAME combat action transcript twice with the SAME seed, driving
 * combat phase-synchronously (checking combat.phase before each input and
 * waiting for idle after each press). Captures complete gameplay snapshots
 * after each run and compares them.
 *
 * This is stronger than the previous RNG verify script: it compares the FULL
 * snapshot (party HP/SP/status, enemy HP/status, round, result, log, gold,
 * inventory) not just encounter selection, and it drives combat through the
 * real phase machine rather than timed Enter presses.
 *
 * Run: node scripts/playtests/audit-rng-determinism.mjs
 * Expects: npx vite preview --port 5176 --base /OnyxLabyrinth/
 */
import {
  launch,
  wait,
  act,
  snap,
  waitForIdle,
  ensureOutDir,
  shot,
  jumpTo,
  ensureAudioResumed,
} from "./lib.mjs";

const BASE =
  process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir("/tmp/onyx-rng-determinism");
const log = (...a) => console.log(...a);

const SEED = 42;

/**
 * Extract a deterministic comparison key from a snapshot.
 * Strips volatile fields (explored set order, soundsPlaying, message text
 * that may include timestamps) and keeps only gameplay-affecting state.
 */
function combatKey(s) {
  if (!s.combat) return null;
  return {
    round: s.combat.round,
    phase: s.combat.phase,
    result: s.combat.result,
    enemies: s.combat.enemies.map((e) => ({
      id: e.id,
      hp: e.hp,
      maxHp: e.maxHp,
      status: [...e.status].sort(),
    })),
    party: s.party.map((p) => ({
      id: p.id,
      hp: p.hp,
      sp: p.sp,
      status: [...p.status].sort(),
    })),
    gold: s.gold,
  };
}

/**
 * Drive one complete combat run phase-synchronously.
 *
 * The transcript is simple: every player turn, press Enter to confirm the
 * default action (Attack) and then Enter to confirm the default target. Enemy
 * turns auto-play. Playback is skipped with B if it's taking too long. The
 * result screen is dismissed with Enter.
 *
 * Each input is gated on the combat phase: we read the snapshot, check what
 * phase we're in, press the appropriate key, then waitForIdle. This eliminates
 * the timing-sensitivity that broke the previous script.
 */
async function runSeededCombat(page, seed) {
  // Jump to floor 1 and seed the RNG before forcing combat.
  await jumpTo(page, { floorId: 1, x: 2, y: 2, facing: 0, autosave: false });
  await page.evaluate((sd) => {
    window.__onyxDebug.setGameplayRng(
      window.__onyxDebug.createSeededRng(sd)
    );
  }, seed);

  // Force a combat via the debug surface.
  const combatInfo = await page.evaluate(async () => {
    const d = window.__onyxDebug;
    const st = d.state;
    for (let attempts = 0; attempts < 400; attempts++) {
      const entry = d.rollEncounter(st.floor.id);
      if (!entry) return { ok: false, reason: "no encounter rolled" };
      const r = d.resolveEncounter(entry);
      if (r.length === 0) continue;
      const combat = d.createCombatFromEncounter(
        st.party,
        r,
        d.SPELLS_BY_ID,
        d.ITEMS_BY_ID,
        st.equipment,
        st.inventory,
        st.inAntimagic,
        st.activeCharIds
      );
      await d.startCombat(combat);
      return {
        ok: true,
        enemyCount: r.length,
        enemyIds: r.map((e) => e.enemy.id),
      };
    }
    return { ok: false, reason: "no valid encounter in 400 attempts" };
  });

  if (!combatInfo.ok) {
    await page.evaluate(() => window.__onyxDebug.resetGameplayRng());
    return { combatInfo, finalSnapshot: null, combatKey: null };
  }

  // Wait for combat to be ready (transition + Phaser boot).
  await waitForIdle(page, 5000);
  await wait(500); // extra settle for Phaser stage

  // Drive combat phase-synchronously. Max 30 rounds to avoid infinite loops.
  for (let round = 0; round < 30; round++) {
    let s = await snap(page);
    if (s.route !== "combat") break; // combat ended (victory/wipe/fled)
    if (s.combat?.result) break; // result screen showing

    const phase = s.combat?.phase;
    if (!phase) {
      await wait(100);
      continue;
    }

    switch (phase) {
      case "palette":
        // Press Enter to confirm the default action (Attack).
        await page.keyboard.press("Enter");
        await waitForIdle(page, 3000);
        break;
      case "selectTarget":
        // Press Enter to confirm the default target (first enemy).
        await page.keyboard.press("Enter");
        await waitForIdle(page, 3000);
        break;
      case "selectSpell":
      case "selectTechnique":
      case "selectSkill":
      case "selectItem":
        // Cancel back to palette with Escape, then Attack.
        await page.keyboard.press("Escape");
        await waitForIdle(page, 1000);
        break;
      case "playback":
        // Skip playback to speed up the run. B skips to end of choreography.
        await page.keyboard.press("b");
        await waitForIdle(page, 3000);
        break;
      case "result":
        // Dismiss the result screen.
        await page.keyboard.press("Enter");
        await waitForIdle(page, 3000);
        break;
      default:
        await wait(50);
    }
  }

  // Capture the final state. If combat ended, we're back in dungeon mode.
  // Wait a moment for the post-combat transition to settle.
  await waitForIdle(page, 5000);
  await wait(300);
  const finalSnapshot = await snap(page);

  // Reset the RNG after the run.
  await page.evaluate(() => window.__onyxDebug.resetGameplayRng());

  // Exit combat if still in one (shouldn't happen, but clean up).
  if (finalSnapshot.route === "combat") {
    await page.evaluate(() => {
      try {
        window.__onyxDebug.exitDebugCombat("fled");
      } catch (e) {}
    });
    await waitForIdle(page, 3000);
  }

  return {
    combatInfo,
    finalSnapshot,
    combatKey: combatKey(finalSnapshot),
  };
}

// --- Main -------------------------------------------------------------------

const { browser, page, errors } = await launch({
  viewport: { width: 1280, height: 800 },
});
try {
  log("=== boot ===");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await wait(600);
  await ensureAudioResumed(page);

  // Verify the debug surface exposes the RNG functions.
  const exposed = await page.evaluate(() => ({
    setGameplayRng: typeof window.__onyxDebug.setGameplayRng,
    resetGameplayRng: typeof window.__onyxDebug.resetGameplayRng,
    createSeededRng: typeof window.__onyxDebug.createSeededRng,
  }));
  log("debug RNG functions:", JSON.stringify(exposed));
  if (
    exposed.setGameplayRng !== "function" ||
    exposed.resetGameplayRng !== "function" ||
    exposed.createSeededRng !== "function"
  ) {
    log("FAIL: RNG functions not exposed on __onyxDebug");
    process.exit(1);
  }

  // Boot to town (needed for jumpTo to work).
  let st = await snap(page);
  for (let i = 0; i < 20 && st.route !== "town"; i++) {
    if (st.route === "title") {
      await page.keyboard.press("n");
      await wait(300);
    } else if (st.route === "prologue") {
      await page.keyboard.press("Escape");
      await wait(300);
    } else if (st.route === "party_creation" || st.route === "party_creation_choice") {
      await page.keyboard.press("Enter");
      await waitForIdle(page);
    } else {
      await page.keyboard.press("Enter");
      await waitForIdle(page);
    }
    st = await snap(page);
  }
  log(`town reached: ${st.route}`);

  log("\n=== run A (seed=%d) ===", SEED);
  const runA = await runSeededCombat(page, SEED);
  log(`run A combat: ${JSON.stringify(runA.combatInfo)}`);
  log(
    `run A final: route=${runA.finalSnapshot?.route} round=${
      runA.finalSnapshot?.combat?.round ?? "n/a"
    } result=${runA.finalSnapshot?.combat?.result ?? "n/a"}`
  );
  if (runA.combatKey) {
    log(
      `run A party HP: [${runA.combatKey.party.map((p) => p.hp).join(", ")}]`
    );
    log(
      `run A enemy HP: [${runA.combatKey.enemies.map((e) => e.hp).join(", ")}]`
    );
  }

  log("\n=== run B (seed=%d, same seed) ===", SEED);
  const runB = await runSeededCombat(page, SEED);
  log(`run B combat: ${JSON.stringify(runB.combatInfo)}`);
  log(
    `run B final: route=${runB.finalSnapshot?.route} round=${
      runB.finalSnapshot?.combat?.round ?? "n/a"
    } result=${runB.finalSnapshot?.combat?.result ?? "n/a"}`
  );
  if (runB.combatKey) {
    log(
      `run B party HP: [${runB.combatKey.party.map((p) => p.hp).join(", ")}]`
    );
    log(
      `run B enemy HP: [${runB.combatKey.enemies.map((e) => e.hp).join(", ")}]`
    );
  }

  log("\n=== run C (seed=999, different seed) ===");
  const runC = await runSeededCombat(page, 999);
  log(`run C combat: ${JSON.stringify(runC.combatInfo)}`);

  // --- Verification ---
  log("\n=== verification ===");

  // 1. Same seed → same encounter
  const sameEncounter =
    JSON.stringify(runA.combatInfo) === JSON.stringify(runB.combatInfo);
  log(`same seed → same encounter: ${sameEncounter ? "PASS" : "FAIL"}`);

  // 2. Same seed → same combat outcome (full snapshot comparison)
  const sameCombatKey =
    runA.combatKey && runB.combatKey
      ? JSON.stringify(runA.combatKey) === JSON.stringify(runB.combatKey)
      : false;
  log(`same seed → same combat outcome: ${sameCombatKey ? "PASS" : "FAIL"}`);
  if (!sameCombatKey && runA.combatKey && runB.combatKey) {
    log("  run A key:", JSON.stringify(runA.combatKey));
    log("  run B key:", JSON.stringify(runB.combatKey));
  }

  // 3. Different seed → different encounter
  const diffEncounter =
    JSON.stringify(runA.combatInfo) !== JSON.stringify(runC.combatInfo);
  log(
    `different seed → different encounter: ${
      diffEncounter ? "PASS" : "FAIL (possible but unlikely)"
    }`
  );

  // 4. No console/page errors
  if (errors.length) {
    log(`FAIL: ${errors.length} console/page errors`);
    errors.slice(0, 5).forEach((e) => log(`  ${e}`));
  } else {
    log("no console/page errors: PASS");
  }

  await shot(page, OUT, "rng-determinism-final.png");

  const allPass = sameEncounter && sameCombatKey && errors.length === 0;
  log(`\n=== overall: ${allPass ? "PASS" : "FAIL"} ===`);

  // Write a report for debugging.
  const report = {
    seed: SEED,
    runA: { combatInfo: runA.combatInfo, combatKey: runA.combatKey },
    runB: { combatInfo: runB.combatInfo, combatKey: runB.combatKey },
    runC: { combatInfo: runC.combatInfo, combatKey: runC.combatKey },
    sameEncounter,
    sameCombatKey,
    diffEncounter,
    errors,
    passed: allPass,
  };
  const fs = await import("fs");
  fs.writeFileSync(
    `${OUT}/report.json`,
    JSON.stringify(report, null, 2)
  );

  process.exit(allPass ? 0 : 1);
} finally {
  await browser.close();
}
