/**
 * Gap A verification: campaign (dungeon) combat regression after the Card
 * Trial sparse-UI work landed. NOT Card Trial itself.
 *
 * Matrix: party size {1,2,3,4} x combat renderer {phaser (default), canvas
 * (`?phaser=0`)}. Party sizes 1-3 are synthesized by truncating the real
 * post-party-creation `state.party` (deep-cloned) rather than by picking a
 * smaller roster in the party-creation UI — party creation always confirms
 * the full default roster in one step (see lib.mjs bootToDungeon), so this
 * is the fastest reliable way to reach smaller parties. This is a caveat on
 * how far the results generalize: it does not exercise the party-creation
 * screen's own member-count logic, only combat's handling of `state.party`
 * arrays shorter than the default.
 *
 * Note the two renderer axes in play are independent:
 *   - `?mazeRenderer=canvas` vs default/webgl affects the DUNGEON view only.
 *   - combat itself picks Canvas vs Phaser via `resolveCombatStageKind()`
 *     (combat-stage.ts): default is Phaser, `?phaser=0` forces Canvas.
 * This script only varies the second axis; the dungeon view stays default
 * for all cells (irrelevant once combat starts, since combat has its own
 * canvas/Phaser stage).
 *
 * Per cell this asserts:
 *   - formation renders (groundPlaneProbe: feet/x-bounds/occlusion) and the
 *     resolved combat.party length matches N
 *   - attack works: an enemy's currentHp is forced to 1 (deterministic;
 *     avoids grinding un-seeded RNG for a kill) then attacked; scene.popups
 *     is polled during the brief playback window as damage-popup evidence
 *   - targeting works: selectTarget selection index cycles with ArrowDown
 *   - death renders: scene.enemyCorpses grows after the forced-kill attack
 *   - spell anchoring: castFirstSpell() from lib.mjs, if a caster is present
 *   - Card Trial CSS/DOM never leaks into campaign combat:
 *     `#combat-wrap` never gets `ct-sparse-active`, `#card-trial-overlay`
 *     stays empty, and `scene.state.partyFormation` stays null/undefined
 *     (this is the actual leak discriminator — the real renderer path,
 *     `partyActorPos` -> `partySlotForActor`, branches on this field; the
 *     naive `partyPos(index)` used by groundPlaneProbe does NOT, so
 *     groundPlaneProbe alone cannot detect a Card Trial formation leak)
 *   - the resolved stage kind actually matches what was requested (Phaser
 *     can silently fall back to Canvas on a caught boot error — checked via
 *     DOM class/canvas visibility + `__onyxPhaserActors` + a console-warn
 *     scan for "[combat] Phaser stage failed")
 *
 * Each (renderer, N) cell runs in its own fresh browser page to avoid any
 * global (`__onyxPhaserActors`) or DOM state carrying over between cells.
 *
 * Run:
 *   cd /home/sloppymo/OnyxLabyrinth-card-trial-sparse-ui
 *   ONYX_URL="http://127.0.0.1:5201/OnyxLabyrinth/" node scripts/playtests/campaign-combat-party-sizes.mjs
 */
import {
  launch,
  wait,
  waitForIdle,
  press,
  snap,
  bootToDungeon,
  castFirstSpell,
  createFindings,
  writeReport,
  ensureOutDir,
  shot,
} from "./lib.mjs";

const BASE = process.env.ONYX_URL ?? "http://127.0.0.1:5201/OnyxLabyrinth/";
const outDir = ensureOutDir("playtest-screenshots/campaign-combat-party-sizes");

const RENDERERS = [
  { id: "phaser", query: "" },
  { id: "canvas", query: "&phaser=0" },
];
const PARTY_SIZES = [1, 2, 3, 4];

const results = [];
const allConsole = [];

async function stageKindInfo(page) {
  return page.evaluate(() => {
    const wrap = document.querySelector("#combat-wrap");
    const phaser = document.querySelector("#combat-phaser-canvas");
    const canvas2d = document.querySelector("#combat-canvas");
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const p = cs(phaser);
    const c = cs(canvas2d);
    const phaserVisible =
      p && p.display !== "none" && p.visibility !== "hidden" && p.opacity !== "0";
    const canvasHidden = c && (c.display === "none" || c.visibility === "hidden");
    const hasPhaserActorsFn = typeof window.__onyxPhaserActors === "function";
    const wrapPhaserClass = wrap?.classList.contains("phaser-stage") ?? false;
    const resolved =
      wrapPhaserClass && phaserVisible && canvasHidden && hasPhaserActorsFn ? "phaser" : "canvas";
    return { wrapPhaserClass, phaserVisible, canvasHidden, hasPhaserActorsFn, resolved };
  });
}

async function leakCheck(page) {
  return page.evaluate(() => {
    const wrap = document.querySelector("#combat-wrap");
    const overlay = document.querySelector("#card-trial-overlay");
    const cc = window.__onyxDebug.getCombatController?.();
    return {
      ctSparseActive: wrap?.classList.contains("ct-sparse-active") ?? null,
      overlayChildren: overlay?.children.length ?? null,
      partyFormation: cc?.scene?.state?.partyFormation ?? null,
    };
  });
}

async function forceEnemyKillSetup(page) {
  return page.evaluate(() => {
    const cc = window.__onyxDebug.getCombatController?.();
    const st = cc && "state" in cc ? cc.state : null;
    if (!st) return { ok: false, reason: "no cc.state runtime property" };
    const target = st.enemies?.front?.[0] ?? st.enemies?.back?.[0] ?? null;
    if (!target) return { ok: false, reason: "no enemy instance found" };
    target.currentHp = 1;
    return { ok: true, targetId: target.instanceId, name: target.name };
  });
}

async function sceneCorpses(page) {
  return page.evaluate(() => {
    const cc = window.__onyxDebug.getCombatController?.();
    const s = cc?.scene;
    return {
      enemyCorpses: s?.enemyCorpses?.length ?? null,
      allyCorpses: s?.allyCorpses?.length ?? null,
    };
  });
}

async function pollPopups(page, tries = 10, interval = 60) {
  for (let i = 0; i < tries; i++) {
    const popups = await page.evaluate(() => {
      const cc = window.__onyxDebug.getCombatController?.();
      const ps = cc?.scene?.popups;
      return Array.isArray(ps) ? ps.map((p) => ({ text: p.text })) : null;
    });
    if (popups && popups.length > 0) return { seen: true, at: i, popups };
    await wait(interval);
  }
  return { seen: false, at: null, popups: null };
}

async function runCell(renderer, N, findings) {
  const label = `${renderer.id}/N=${N}`;
  const cell = { renderer: renderer.id, partySize: N, label, checks: {} };
  const { browser, page, errors } = await launch();
  const consoleAll = [];
  page.on("console", (m) => consoleAll.push(`${m.type()}: ${m.text()}`));

  try {
    const url = `${BASE}?debug=1${renderer.query}`;
    const bootSt = await bootToDungeon(page, url);
    if (bootSt.route !== "dungeon") {
      findings.find("P0", 0, `${label}: bootToDungeon`, `route=${bootSt.route}`);
      cell.checks.boot = { ok: false, route: bootSt.route };
      return cell;
    }
    cell.checks.boot = { ok: true };

    await page.evaluate((seed) => {
      window.__onyxDebug.setGameplayRng(window.__onyxDebug.createSeededRng(seed));
    }, 42);

    const fullParty = await page.evaluate(() =>
      JSON.parse(JSON.stringify(window.__onyxDebug.state.party))
    );
    cell.fullPartySize = fullParty.length;
    if (N > fullParty.length) {
      cell.checks.skipped = `default party only has ${fullParty.length} members`;
      console.log(`  SKIP ${label}: ${cell.checks.skipped}`);
      return cell;
    }

    await page.evaluate((party) => {
      window.__onyxDebug.state.party = party;
    }, fullParty.slice(0, N));

    const startErr = await page
      .evaluate(() => window.__onyxDebug.startCombat())
      .then(() => null)
      .catch((e) => String(e));
    if (startErr) {
      findings.find("P0", 0, `${label}: startCombat threw`, startErr);
      cell.checks.startCombat = { ok: false, error: startErr };
      return cell;
    }
    await waitForIdle(page, 8000);

    let st = await snap(page);
    if (st.route !== "combat") {
      findings.find("P0", 0, `${label}: reached combat`, `route=${st.route}`);
      cell.checks.reachedCombat = { ok: false, route: st.route };
      return cell;
    }
    cell.checks.reachedCombat = { ok: true };
    cell.checks.combatPartyLen = {
      expected: N,
      actual: st.combat?.party?.length ?? null,
      ok: (st.combat?.party?.length ?? null) === N,
    };
    if (!cell.checks.combatPartyLen.ok) {
      findings.find(
        "P1",
        0,
        `${label}: combat.party length mismatch`,
        JSON.stringify(cell.checks.combatPartyLen)
      );
    }

    const stageInfo = await stageKindInfo(page);
    cell.checks.stageKind = stageInfo;
    if (stageInfo.resolved !== renderer.id) {
      findings.find(
        "P1",
        0,
        `${label}: requested renderer not honored`,
        `requested=${renderer.id} resolved=${stageInfo.resolved} info=${JSON.stringify(stageInfo)}`
      );
    }
    const fallbackWarn = consoleAll.find((m) => m.includes("[combat] Phaser stage failed"));
    if (fallbackWarn) {
      findings.find("P1", 0, `${label}: Phaser boot failed, silent fallback`, fallbackWarn);
    }

    const leak0 = await leakCheck(page);
    cell.checks.leakAtStart = leak0;
    if (leak0.ctSparseActive || (leak0.overlayChildren ?? 0) > 0 || leak0.partyFormation) {
      findings.find(
        "P0",
        0,
        `${label}: Card Trial chrome/formation leaked into campaign combat (start)`,
        JSON.stringify(leak0)
      );
    }

    const gp = await page.evaluate(() => window.__onyxDebug.groundPlaneProbe());
    cell.checks.groundPlaneProbe = gp
      ? { ok: gp.ok, feetOk: gp.feetOk, occlusionOk: gp.occlusionOk, xBoundsOk: gp.xBoundsOk, partyCount: gp.party?.length }
      : null;
    if (!gp || !gp.ok) {
      findings.find("P1", 0, `${label}: groundPlaneProbe not ok`, JSON.stringify(gp));
    }

    await shot(page, outDir, `formation-${renderer.id}-N${N}.png`);

    // --- Attack / targeting / damage popup / death -------------------------
    const killSetup = await forceEnemyKillSetup(page);
    cell.checks.killSetup = killSetup;

    let attackEvidence = { attempted: false, targetingCycled: false, popupSeen: false, corpseSeen: false };
    for (let iter = 0; iter < 6; iter++) {
      st = await snap(page);
      if (st.route !== "combat") break;
      if (st.combat?.phase === "result") break;
      if (st.combat?.phase === "playback") {
        await waitForIdle(page, 6000);
        continue;
      }
      if (st.combat?.phase !== "palette") {
        await waitForIdle(page, 3000);
        continue;
      }
      await press(page, "a", 1, 120);
      let stA = await snap(page);
      if (stA.combat?.phase === "selectTarget") {
        attackEvidence.attempted = true;
        const before = stA.combat.selection;
        if (!attackEvidence.targetingCycled && before && before.entries.length > 1) {
          await press(page, "ArrowDown", 1, 80);
          const stB = await snap(page);
          attackEvidence.targetingCycled = stB.combat?.selection?.index !== before.index;
          cell.checks.targetingCycle = {
            entries: before.entries,
            indexBefore: before.index,
            indexAfter: stB.combat?.selection?.index ?? null,
          };
        }
        if (iter === 0) await shot(page, outDir, `target-select-${renderer.id}-N${N}.png`);
        await press(page, "Enter", 1, 80);
        const popupResult = await pollPopups(page, 12, 60);
        if (popupResult.seen) {
          attackEvidence.popupSeen = true;
          cell.checks.popupEvidence = popupResult;
          await shot(page, outDir, `damage-popup-${renderer.id}-N${N}.png`);
        }
        await waitForIdle(page, 8000);
        const corpses = await sceneCorpses(page);
        if ((corpses.enemyCorpses ?? 0) > 0 || (corpses.allyCorpses ?? 0) > 0) {
          attackEvidence.corpseSeen = true;
          cell.checks.corpseEvidence = corpses;
          await shot(page, outDir, `death-${renderer.id}-N${N}.png`);
        }
      } else {
        await waitForIdle(page, 4000);
      }
      if (attackEvidence.popupSeen && attackEvidence.corpseSeen) break;
    }
    cell.checks.attackEvidence = attackEvidence;
    if (!attackEvidence.attempted) {
      findings.find("P1", 0, `${label}: attack never reached selectTarget`, "");
    }
    if (!attackEvidence.popupSeen) {
      findings.find("P2", 0, `${label}: damage popup not observed`, "scene.popups never non-empty during poll window");
    }
    if (!attackEvidence.corpseSeen) {
      findings.find(
        "P2",
        0,
        `${label}: death not observed`,
        `killSetup=${JSON.stringify(killSetup)}`
      );
    }

    // --- Leak check mid/post-death -----------------------------------------
    const leak1 = await leakCheck(page);
    cell.checks.leakAfterAttack = leak1;
    if (leak1.ctSparseActive || (leak1.overlayChildren ?? 0) > 0 || leak1.partyFormation) {
      findings.find(
        "P0",
        0,
        `${label}: Card Trial chrome/formation leaked into campaign combat (mid-fight)`,
        JSON.stringify(leak1)
      );
    }

    // --- Spell cast (best-effort) -------------------------------------------
    st = await snap(page);
    if (st.route === "combat" && st.combat?.phase !== "result") {
      const castResult = await castFirstSpell(page, { maxActors: N });
      cell.checks.spellCast = castResult;
      if (castResult.cast) await shot(page, outDir, `spell-cast-${renderer.id}-N${N}.png`);
    } else {
      cell.checks.spellCast = { cast: false, reason: `combat already ended (phase=${st.combat?.phase}, route=${st.route})` };
    }

    // --- Exit and final leak check ------------------------------------------
    await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled")).catch(() => {});
    await wait(500);
    await waitForIdle(page, 8000);
    st = await snap(page);
    cell.checks.postExitRoute = st.route;
    const leak2 = await leakCheck(page);
    cell.checks.leakAfterExit = leak2;
    if (leak2.ctSparseActive || (leak2.overlayChildren ?? 0) > 0 || leak2.partyFormation) {
      findings.find(
        "P0",
        0,
        `${label}: Card Trial chrome/formation leaked into campaign combat (post-exit)`,
        JSON.stringify(leak2)
      );
    }

    const cellPageErrors = errors.filter((e) => e.startsWith("pageerror:"));
    cell.checks.pageErrors = cellPageErrors;
    if (cellPageErrors.length) {
      findings.find("P0", 0, `${label}: pageerror during cell`, cellPageErrors.join(" | "));
    }
    allConsole.push({ label, errors: [...errors] });
  } catch (e) {
    findings.find("P0", 0, `${label}: cell threw`, String(e?.stack ?? e));
    cell.checks.threw = String(e?.stack ?? e);
  } finally {
    await browser.close();
  }
  return cell;
}

async function main() {
  const findings = createFindings({ outDir });
  for (const renderer of RENDERERS) {
    for (const N of PARTY_SIZES) {
      console.log(`=== ${renderer.id} / party N=${N} ===`);
      const cell = await runCell(renderer, N, findings);
      results.push(cell);
      console.log(`  -> ${JSON.stringify(cell.checks, null, 0).slice(0, 400)}`);
    }
  }
  await findings.flush();
  const list = findings.findings;
  writeReport(outDir, { title: "campaign-combat-party-sizes", results, findings: list, base: BASE });
  console.log(`\nFindings: ${list.length} (P0=${list.filter((f) => f.sev === "P0").length}, P1=${list.filter((f) => f.sev === "P1").length}, P2=${list.filter((f) => f.sev === "P2").length})`);
  process.exit(list.some((f) => f.sev === "P0") ? 1 : 0);
}

await main();
