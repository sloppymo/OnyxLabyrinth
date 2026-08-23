/**
 * Gap B verification: Card Trial -> exit -> campaign combat lifecycle, all
 * in ONE browser session (no page reload between Card Trial and campaign
 * combat) — the point is to catch stale module-scoped state (main.ts's
 * `cardTrialController` / `inCardTrial` / combat-wrap CSS classes) that a
 * fresh page load would trivially reset and hide.
 *
 * Sequence: boot to title -> press "t" (title menu's new Card Trial item,
 * feat/card-trial-sparse-combat-ui's title/URL boot convenience) -> lobby ->
 * start Fight 1 -> play one real card action then pass every turn (fastest
 * deterministic way to reach a natural win/wipe without editing source or
 * hacking private fields) -> fight ends, back in lobby -> Escape to exit to
 * title -> drive title -> New Game -> party creation -> town -> dungeon
 * (manually, NOT via lib.mjs bootToDungeon, since that does page.goto and
 * would defeat the "one session" point) -> `__onyxDebug.startCombat()` for
 * real campaign combat -> assert no Card Trial residue.
 *
 * Positive control: captures the sparse chrome (#combat-wrap.ct-sparse-active,
 * #card-trial-overlay children) WHILE Card Trial is live, so the post-exit
 * "absent" assertions are meaningful (a leak-checker that never saw the
 * flag turn on proves nothing — see smoke-phaser-combat.mjs's own note on
 * this).
 *
 * Run:
 *   cd /home/sloppymo/OnyxLabyrinth-card-trial-sparse-ui
 *   ONYX_URL="http://127.0.0.1:5201/OnyxLabyrinth/" node scripts/playtests/card-trial-exit-lifecycle.mjs
 */
import {
  launch,
  wait,
  waitForIdle,
  press,
  snap,
  createFindings,
  writeReport,
  ensureOutDir,
  shot,
} from "./lib.mjs";

const BASE = process.env.ONYX_URL ?? "http://127.0.0.1:5201/OnyxLabyrinth/";
const outDir = ensureOutDir("playtest-screenshots/card-trial-exit-lifecycle");

async function domLeakInfo(page) {
  return page.evaluate(() => {
    const wrap = document.querySelector("#combat-wrap");
    const overlay = document.querySelector("#card-trial-overlay");
    const windows = document.querySelector("#combat-windows");
    const turnOrder = document.querySelector("#combat-turn-order");
    const cs = (el) => (el ? getComputedStyle(el) : null);
    return {
      ctSparseActive: wrap?.classList.contains("ct-sparse-active") ?? null,
      overlayChildren: overlay?.children.length ?? null,
      combatWindowsDisplay: cs(windows)?.display ?? null,
      combatWindowsChildren: windows?.children.length ?? null,
      combatWindowsText: (windows?.innerText ?? "").slice(0, 200),
      turnOrderDisplay: cs(turnOrder)?.display ?? null,
      turnOrderChildren: turnOrder?.children.length ?? null,
      // Document-wide sweep for any Card Trial node (not just inside
      // #card-trial-overlay) — CardTrialSparseUi parents everything under
      // the overlay, so this should agree with overlayChildren, but this
      // turns that assumption into an assertion instead of an inference.
      ctNodesAnywhere: document.querySelectorAll('[class*="ct-"], [class*="ct2-"]').length,
    };
  });
}

/**
 * Drive from the current route to "dungeon" without page.goto — mirrors
 * lib.mjs bootToDungeon's route-driven loop but stays in the same page/JS
 * context (a reload would reset the very module-scoped state this test is
 * checking for staleness).
 */
async function driveToDungeonInPlace(page, { maxSteps = 40 } = {}) {
  let st = await snap(page);
  for (let i = 0; i < maxSteps && st.route !== "dungeon"; i++) {
    switch (st.route) {
      case "title":
        await press(page, "n");
        await wait(250);
        break;
      case "prologue":
        await press(page, "Escape");
        await waitForIdle(page, 500);
        break;
      case "party_creation":
        await press(page, "Enter");
        await waitForIdle(page);
        break;
      case "town": {
        const body = await page.evaluate(() => document.body.innerText);
        if (/▶.*Enter Dungeon/i.test(body)) {
          await press(page, "Enter");
          await waitForIdle(page);
        } else {
          await press(page, ">");
          await waitForIdle(page, 500);
        }
        break;
      }
      default:
        await press(page, "Enter");
        await waitForIdle(page, 500);
        break;
    }
    st = await snap(page);
  }
  return st;
}

async function main() {
  const findings = createFindings({ outDir });
  const evidence = {};
  const { browser, page, errors } = await launch();
  const consoleAll = [];
  page.on("console", (m) => consoleAll.push(`${m.type()}: ${m.text()}`));

  try {
    // --- 1. Boot normally to title -----------------------------------------
    await page.goto(`${BASE}?debug=1`, { waitUntil: "networkidle" });
    await wait(500);
    let st = await snap(page);
    evidence.bootRoute = st.route;
    if (st.route !== "title") {
      findings.find("P0", 0, "boot did not land on title", `route=${st.route}`);
    }
    await shot(page, outDir, "01-title.png");

    // --- 2. Enter Card Trial via the "t" title shortcut ---------------------
    await press(page, "t", 1, 200);
    await waitForIdle(page, 3000);
    st = await snap(page);
    evidence.lobbyRoute = st.route;
    if (st.route !== "card_trial") {
      findings.find("P0", 0, "'t' at title did not open Card Trial lobby", `route=${st.route}`);
    } else {
      console.log("  OK: title 't' -> card_trial lobby");
    }
    await shot(page, outDir, "02-lobby.png");

    // --- 3. Start Fight 1 ----------------------------------------------------
    await press(page, "Enter", 1, 200);
    await waitForIdle(page, 10000);
    st = await snap(page);
    if (st.combat?.phase === "playback") {
      await waitForIdle(page, 8000);
      st = await snap(page);
    }
    evidence.fightStartRoute = st.route;
    evidence.fightStartPhase = st.combat?.phase ?? null;
    if (st.route !== "card_trial" || !st.combat) {
      findings.find("P0", 0, "Fight 1 did not start", `route=${st.route} combat=${JSON.stringify(st.combat)}`);
    }

    // --- 4. POSITIVE CONTROL: sparse chrome IS active during the fight -----
    const activeLeakInfo = await domLeakInfo(page);
    evidence.duringFightChrome = activeLeakInfo;
    const sparseActuallyOn =
      activeLeakInfo.ctSparseActive === true && (activeLeakInfo.overlayChildren ?? 0) > 0;
    if (!sparseActuallyOn) {
      findings.find(
        "P1",
        0,
        "Card Trial sparse chrome never activated — positive control failed",
        `Rest of this script's 'no leak after exit' assertions are meaningless without this. info=${JSON.stringify(activeLeakInfo)}`
      );
    } else {
      console.log(`  OK: positive control — ct-sparse-active=true, overlay children=${activeLeakInfo.overlayChildren}`);
    }
    await shot(page, outDir, "03-fight-sparse-chrome-active.png");

    // --- 5. Play a couple of actions, then drive to a natural fight end ----
    let sawHandAction = false;
    for (let iter = 0; iter < 30; iter++) {
      st = await snap(page);
      if (st.route !== "card_trial") break;
      // Do NOT break on `combat.result` alone — the engine sets
      // `trial.result` as soon as the fatal blow resolves, but the UI phase
      // stays "playback" until that turn's animation finishes; afterPlayback()
      // only flips phase to "result" once isChoreographyDone(). Breaking here
      // early left phase stuck at "playback" forever in the first run of this
      // script, which never pressed Enter to call finish() — cascading into a
      // false "Card Trial never exits" alarm that was actually a script bug.
      if (st.combat?.phase === "playback") {
        await waitForIdle(page, 6000);
        continue;
      }
      if (st.combat?.phase === "result") break;
      if (st.combat?.phase === "hand") {
        if (!sawHandAction) {
          // Real action #1: confirm whatever card is hovered (index 0).
          await press(page, "Enter", 1, 120);
          const stA = await snap(page);
          if (stA.combat?.phase === "target" || stA.combat?.phase === "target2") {
            await press(page, "Enter", 1, 120); // confirm target — action #2
          }
          sawHandAction = true;
        } else {
          // Pass every subsequent turn — fastest deterministic route to a
          // natural win/wipe without touching source or private fields.
          await press(page, "Escape", 1, 100);
        }
        await waitForIdle(page, 4000);
      } else {
        await waitForIdle(page, 3000);
      }
    }
    st = await snap(page);
    evidence.fightEndResult = st.combat?.result ?? null;
    evidence.fightEndPhase = st.combat?.phase ?? null;
    evidence.fightEndRoute = st.route;
    if (!st.combat?.result) {
      findings.find(
        "P1",
        0,
        "fight did not reach a natural result within 30 actions",
        `phase=${st.combat?.phase} route=${st.route}`
      );
    } else {
      console.log(`  OK: fight ended naturally, result=${st.combat.result}`);
    }
    await shot(page, outDir, "04-fight-result.png");

    if (st.combat?.phase === "result") {
      await press(page, "Enter", 1, 200); // finish() -> onEnd -> back to lobby
      await waitForIdle(page, 10000);
    }
    st = await snap(page);
    evidence.postFightRoute = st.route;
    const lobbyBody = await page.evaluate(() => document.body.innerText);
    evidence.backInLobby = st.route === "card_trial" && /Exit to Title/.test(lobbyBody);
    if (!evidence.backInLobby) {
      findings.find(
        "P1",
        0,
        "did not return to Card Trial lobby after fight end",
        `route=${st.route} bodyHasExit=${/Exit to Title/.test(lobbyBody)}`
      );
    } else {
      console.log("  OK: back in Card Trial lobby, 'Exit to Title' present");
    }
    await shot(page, outDir, "05-lobby-after-fight.png");

    // --- 6. Exit Card Trial to title (Escape = onExit directly) ------------
    await press(page, "Escape", 1, 200);
    await waitForIdle(page, 4000);
    st = await snap(page);
    evidence.postExitRoute = st.route;
    if (st.route !== "title") {
      findings.find("P0", 0, "Escape from lobby did not return to title", `route=${st.route}`);
    } else {
      console.log("  OK: exited Card Trial to title");
    }
    const leakAtTitle = await domLeakInfo(page);
    evidence.leakAtTitleAfterExit = leakAtTitle;
    if (
      leakAtTitle.ctSparseActive ||
      (leakAtTitle.overlayChildren ?? 0) > 0 ||
      (leakAtTitle.ctNodesAnywhere ?? 0) > 0
    ) {
      findings.find(
        "P0",
        0,
        "Card Trial DOM residue at title after exit",
        JSON.stringify(leakAtTitle)
      );
    } else {
      console.log("  OK: no Card Trial DOM residue at title (document-wide sweep: 0 nodes)");
    }
    await shot(page, outDir, "06-title-after-exit.png");

    // --- 7. New Game -> dungeon, IN THE SAME PAGE/SESSION -------------------
    const dungeonSt = await driveToDungeonInPlace(page);
    evidence.dungeonRoute = dungeonSt.route;
    if (dungeonSt.route !== "dungeon") {
      findings.find(
        "P0",
        0,
        "could not reach dungeon after Card Trial exit (same session)",
        `route=${dungeonSt.route}`
      );
    } else {
      console.log("  OK: reached dungeon after Card Trial exit, same session");
    }

    // --- 8. Real campaign combat ---------------------------------------------
    const startErr = await page
      .evaluate(() => window.__onyxDebug.startCombat())
      .then(() => null)
      .catch((e) => String(e));
    if (startErr) {
      findings.find("P0", 0, "startCombat threw after Card Trial lifecycle", startErr);
    }
    await waitForIdle(page, 8000);
    st = await snap(page);
    evidence.campaignCombatRoute = st.route;
    evidence.campaignCombatPartyLen = st.combat?.party?.length ?? null;
    if (st.route !== "combat") {
      findings.find(
        "P0",
        0,
        "campaign combat did not start after Card Trial lifecycle",
        `route=${st.route} startErr=${startErr}`
      );
    } else {
      console.log(`  OK: campaign combat started, party=${st.combat?.party?.length}`);
    }
    await shot(page, outDir, "07-campaign-combat-after-lifecycle.png");

    // --- 9. Final assertions: no Card Trial residue in real combat ----------
    const finalLeak = await domLeakInfo(page);
    evidence.finalLeakCheck = finalLeak;
    if (
      finalLeak.ctSparseActive ||
      (finalLeak.overlayChildren ?? 0) > 0 ||
      (finalLeak.ctNodesAnywhere ?? 0) > 0
    ) {
      findings.find(
        "P0",
        0,
        "Card Trial chrome present during post-lifecycle campaign combat",
        JSON.stringify(finalLeak)
      );
    } else {
      console.log("  OK: #combat-wrap has no ct-sparse-active, #card-trial-overlay empty, document-wide sweep 0 nodes");
    }
    if (finalLeak.combatWindowsDisplay === "none" || (finalLeak.combatWindowsChildren ?? 0) === 0) {
      findings.find(
        "P0",
        0,
        "#combat-windows not behaving normally after lifecycle",
        JSON.stringify(finalLeak)
      );
    } else {
      console.log("  OK: #combat-windows visible and populated");
    }
    if (finalLeak.turnOrderDisplay === "none" || (finalLeak.turnOrderChildren ?? 0) === 0) {
      findings.find(
        "P1",
        0,
        "#combat-turn-order not behaving normally after lifecycle",
        JSON.stringify(finalLeak)
      );
    } else {
      console.log("  OK: #combat-turn-order visible and populated");
    }
    const cc = await page.evaluate(() => {
      const c = window.__onyxDebug.getCombatController?.();
      return { hasController: !!c, partyFormation: c?.scene?.state?.partyFormation ?? null };
    });
    evidence.finalScene = cc;
    if (cc.partyFormation) {
      findings.find("P0", 0, "campaign combat scene has leftover Card Trial partyFormation", JSON.stringify(cc));
    }

    // --- Cleanup + error capture --------------------------------------------
    await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled")).catch(() => {});
    await wait(500);
    await waitForIdle(page, 6000);

    const pageErrors = errors.filter((e) => e.startsWith("pageerror:"));
    evidence.pageErrors = pageErrors;
    evidence.consoleErrors = errors.filter((e) => e.startsWith("console:"));
    if (pageErrors.length) {
      findings.find("P0", 0, "pageerror during Card Trial exit lifecycle", pageErrors.join(" | "));
    } else {
      console.log("  OK: no pageerrors across the whole lifecycle");
    }
  } catch (e) {
    findings.find("P0", 0, "lifecycle script threw", String(e?.stack ?? e));
    evidence.threw = String(e?.stack ?? e);
  } finally {
    await findings.flush();
    const list = findings.findings;
    writeReport(outDir, {
      title: "card-trial-exit-lifecycle",
      evidence,
      findings: list,
      errors,
      base: BASE,
    });
    console.log(`\nEvidence: ${JSON.stringify(evidence, null, 2)}`);
    console.log(`\nFindings: ${list.length} (P0=${list.filter((f) => f.sev === "P0").length}, P1=${list.filter((f) => f.sev === "P1").length})`);
    await browser.close();
    process.exit(list.some((f) => f.sev === "P0") ? 1 : 0);
  }
}

await main();
