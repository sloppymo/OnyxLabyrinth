/**
 * Phase-driven browser verification of seeded gameplay RNG determinism.
 *
 * Runs the SAME combat action transcript twice with the SAME seed, driving
 * combat phase-synchronously (checking combat.phase before each input and
 * waiting for idle after each press). After each run, captures a snapshot
 * and extracts a selected combat outcome state for comparison.
 *
 * Before each run, the same serialized pre-combat save is restored via
 * dumpSave/loadSave, guaranteeing both runs start from identical complete
 * game state (HP, SP, gold, inventory, equipment, levels, XP, explored
 * tiles, unlocked doors, buffs, floor position).
 *
 * The comparison key (outcomeKey) includes every gameplay-affecting field
 * in the snapshot: party HP/SP/maxHp/maxSp/level/status/perkIds, enemy
 * HP/maxHp/status, gold, inventory, keys, buffs, floor, position, combat
 * round, and combat result. It excludes only volatile/presentation fields
 * (soundsPlaying, message text, idle flag, availableActions, explored set
 * ordering, warnings).
 *
 * Run: node scripts/playtests/audit-rng-determinism.mjs
 * Expects: npx vite preview --port 5176 --base /OnyxLabyrinth/
 */
import {
  launch,
  wait,
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
 * Extract a deterministic comparison key from a snapshot, covering every
 * gameplay-affecting field. Strips only volatile/presentation fields:
 *   - soundsPlaying (timing-dependent audio envelope state)
 *   - message.text (may include transient overlay text)
 *   - idle (timing-dependent quiescence flag)
 *   - availableActions (context-dependent, regenerated each frame)
 *   - explored (Set→array ordering is not guaranteed stable across
 *     separate page loads, though it is within a single load; we compare
 *     a sorted copy instead)
 *   - warnings (should be empty; not gameplay-affecting)
 *   - map (not included by default; large and not gameplay-affecting)
 *   - tile (transient feature state, cleared after processing)
 *
 * Everything else — party state (HP/SP/level/status/perks), enemies, gold,
 * inventory, keys, buffs, floor, position, combat round/result — is included.
 */
function outcomeKey(s) {
  return {
    mode: s.mode,
    route: s.route,
    floor: s.floor,
    pos: s.pos,
    flags: {
      inDarkness: s.flags.inDarkness,
      inAntimagic: s.flags.inAntimagic,
      inArena: s.flags.inArena,
      pendingTrap: s.flags.pendingTrap,
    },
    party: s.party.map((p) => ({
      id: p.id,
      name: p.name,
      class: p.class,
      level: p.level,
      hp: p.hp,
      maxHp: p.maxHp,
      sp: p.sp,
      maxSp: p.maxSp,
      status: [...p.status].sort(),
      perkIds: [...p.perkIds].sort(),
    })),
    gold: s.gold,
    keys: [...s.keys].sort(),
    inventory: s.inventory.map((i) => ({ itemId: i.itemId, identified: i.identified })),
    buffs: s.buffs.map((b) => ({ kind: b.kind, remainingSteps: b.remainingSteps })),
    explored: [...s.explored].sort(),
    unlockedDoors: [...s.unlockedDoors].sort(),
    combat: s.combat
      ? {
          round: s.combat.round,
          phase: s.combat.phase,
          result: s.combat.result,
          enemies: s.combat.enemies.map((e) => ({
            id: e.id,
            name: e.name,
            hp: e.hp,
            maxHp: e.maxHp,
            row: e.row,
            status: [...e.status].sort(),
          })),
          recentLog: s.combat.recentLog,
        }
      : null,
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
 *
 * Returns { combatInfo, finalSnapshot, outcomeKey, reachedTerminal }.
 * `reachedTerminal` is true only if the combat reached a result state
 * (victory/wipe/fled) — not just matching intermediate state.
 */
async function runSeededCombat(page, seed, preCombatSave) {
  // Restore the identical pre-combat save so both runs start from the same
  // complete game state (HP, SP, gold, inventory, equipment, levels, etc.).
  await page.evaluate((json) => window.__onyxDebug.loadSave(json), preCombatSave);
  await waitForIdle(page, 3000);

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
    return { combatInfo, finalSnapshot: null, outcomeKey: null, reachedTerminal: false };
  }

  // Wait for combat to be ready (transition + Phaser boot).
  await waitForIdle(page, 5000);
  await wait(500); // extra settle for Phaser stage

  // Track whether we saw a terminal combat result.
  let reachedTerminal = false;

  // Drive combat phase-synchronously. Max 30 rounds to avoid infinite loops.
  for (let round = 0; round < 30; round++) {
    let s = await snap(page);
    if (s.route !== "combat") break; // combat ended (victory/wipe/fled)
    if (s.combat?.result) {
      reachedTerminal = true;
      break; // result screen showing
    }

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

  // Check if the final snapshot shows a terminal result (even if we broke
  // out of the loop because route changed — the result may still be visible
  // in the combat field of the last combat snapshot, or the route may have
  // changed to "dungeon" indicating combat ended naturally).
  if (finalSnapshot.combat?.result) {
    reachedTerminal = true;
  }
  // If route is no longer "combat", combat ended (victory/wipe/fled → dungeon).
  if (finalSnapshot.route !== "combat") {
    reachedTerminal = true;
  }

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
    outcomeKey: outcomeKey(finalSnapshot),
    reachedTerminal,
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
    dumpSave: typeof window.__onyxDebug.dumpSave,
    loadSave: typeof window.__onyxDebug.loadSave,
  }));
  log("debug RNG + save functions:", JSON.stringify(exposed));
  for (const [k, v] of Object.entries(exposed)) {
    if (v !== "function") {
      log(`FAIL: ${k} not exposed on __onyxDebug (got ${v})`);
      process.exit(1);
    }
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

  // Serialize the pre-combat game state. Both runs will restore this exact
  // state before forcing combat, guaranteeing identical starting conditions
  // (HP, SP, gold, inventory, equipment, levels, XP, explored tiles, etc.).
  const preCombatSave = await page.evaluate(() => window.__onyxDebug.dumpSave());
  log(`pre-combat save serialized: ${preCombatSave.length} chars`);

  log("\n=== run A (seed=%d) ===", SEED);
  const runA = await runSeededCombat(page, SEED, preCombatSave);
  log(`run A combat: ${JSON.stringify(runA.combatInfo)}`);
  log(
    `run A final: route=${runA.finalSnapshot?.route} round=${
      runA.finalSnapshot?.combat?.round ?? "n/a"
    } result=${runA.finalSnapshot?.combat?.result ?? "n/a"}`
  );
  log(`run A reached terminal: ${runA.reachedTerminal}`);
  if (runA.outcomeKey) {
    log(
      `run A party HP: [${runA.outcomeKey.party.map((p) => p.hp).join(", ")}]`
    );
    log(
      `run A party levels: [${runA.outcomeKey.party.map((p) => p.level).join(", ")}]`
    );
    log(`run A gold: ${runA.outcomeKey.gold}`);
    log(`run A inventory: ${JSON.stringify(runA.outcomeKey.inventory)}`);
  }

  log("\n=== run B (seed=%d, same seed, same pre-combat save) ===", SEED);
  const runB = await runSeededCombat(page, SEED, preCombatSave);
  log(`run B combat: ${JSON.stringify(runB.combatInfo)}`);
  log(
    `run B final: route=${runB.finalSnapshot?.route} round=${
      runB.finalSnapshot?.combat?.round ?? "n/a"
    } result=${runB.finalSnapshot?.combat?.result ?? "n/a"}`
  );
  log(`run B reached terminal: ${runB.reachedTerminal}`);
  if (runB.outcomeKey) {
    log(
      `run B party HP: [${runB.outcomeKey.party.map((p) => p.hp).join(", ")}]`
    );
    log(
      `run B party levels: [${runB.outcomeKey.party.map((p) => p.level).join(", ")}]`
    );
    log(`run B gold: ${runB.outcomeKey.gold}`);
    log(`run B inventory: ${JSON.stringify(runB.outcomeKey.inventory)}`);
  }

  log("\n=== run C (seed=999, different seed, same pre-combat save) ===");
  const runC = await runSeededCombat(page, 999, preCombatSave);
  log(`run C combat: ${JSON.stringify(runC.combatInfo)}`);

  // --- Verification ---
  log("\n=== verification ===");

  // 1. Same seed → same encounter
  const sameEncounter =
    JSON.stringify(runA.combatInfo) === JSON.stringify(runB.combatInfo);
  log(`same seed → same encounter: ${sameEncounter ? "PASS" : "FAIL"}`);

  // 2. Both runs reached a terminal combat state (not just matching
  //    intermediate state). This guards against both runs getting stuck
  //    at the same phase and falsely "matching."
  const bothTerminal = runA.reachedTerminal && runB.reachedTerminal;
  log(`both runs reached terminal state: ${bothTerminal ? "PASS" : "FAIL"}`);
  if (!bothTerminal) {
    log(`  run A reachedTerminal: ${runA.reachedTerminal}`);
    log(`  run B reachedTerminal: ${runB.reachedTerminal}`);
  }

  // 3. Same seed → same selected combat outcome state
  //    (party HP/SP/level/status/perks, enemy HP/status, gold, inventory,
  //    keys, buffs, floor, position, combat round/result/log)
  const sameOutcome =
    runA.outcomeKey && runB.outcomeKey
      ? JSON.stringify(runA.outcomeKey) === JSON.stringify(runB.outcomeKey)
      : false;
  log(`same seed → same outcome state: ${sameOutcome ? "PASS" : "FAIL"}`);
  if (!sameOutcome && runA.outcomeKey && runB.outcomeKey) {
    // Find the first differing field for debugging.
    const aKeys = Object.keys(runA.outcomeKey);
    for (const k of aKeys) {
      if (JSON.stringify(runA.outcomeKey[k]) !== JSON.stringify(runB.outcomeKey[k])) {
        log(`  first diff in field "${k}":`);
        log(`    A: ${JSON.stringify(runA.outcomeKey[k]).slice(0, 200)}`);
        log(`    B: ${JSON.stringify(runB.outcomeKey[k]).slice(0, 200)}`);
        break;
      }
    }
  }

  // 4. Different seed → different encounter
  const diffEncounter =
    JSON.stringify(runA.combatInfo) !== JSON.stringify(runC.combatInfo);
  log(
    `different seed → different encounter: ${
      diffEncounter ? "PASS" : "FAIL (possible but unlikely)"
    }`
  );

  // 5. No console/page errors
  if (errors.length) {
    log(`FAIL: ${errors.length} console/page errors`);
    errors.slice(0, 5).forEach((e) => log(`  ${e}`));
  } else {
    log("no console/page errors: PASS");
  }

  await shot(page, OUT, "rng-determinism-final.png");

  const allPass = sameEncounter && bothTerminal && sameOutcome && errors.length === 0;
  log(`\n=== overall: ${allPass ? "PASS" : "FAIL"} ===`);

  // Write a report for debugging.
  const fs = await import("fs");
  const report = {
    seed: SEED,
    runA: {
      combatInfo: runA.combatInfo,
      reachedTerminal: runA.reachedTerminal,
      outcomeKey: runA.outcomeKey,
    },
    runB: {
      combatInfo: runB.combatInfo,
      reachedTerminal: runB.reachedTerminal,
      outcomeKey: runB.outcomeKey,
    },
    runC: {
      combatInfo: runC.combatInfo,
      reachedTerminal: runC.reachedTerminal,
      outcomeKey: runC.outcomeKey,
    },
    sameEncounter,
    bothTerminal,
    sameOutcome,
    diffEncounter,
    errors,
    passed: allPass,
  };
  fs.writeFileSync(
    `${OUT}/report.json`,
    JSON.stringify(report, null, 2)
  );

  process.exit(allPass ? 0 : 1);
} finally {
  await browser.close();
}
