// Invariants-under-stress probe — drives hostile sequences through the real
// flows and watches snapshot().warnings + the error event ring after every
// phase. Zero warnings across the whole run is itself the reportable result.
//
// Phases:
//  1. baseline           — boot, jumpTo F1, clean-state check
//  2. campaign wipe      — forced encounter -> exitDebugCombat("wipe") ->
//                          game_over -> worldYear +100 -> Enter -> town
//                          (exercises the century-cycle wiring that is
//                          in-flight in the working tree right now)
//  3. save/load          — dumpSave/loadSave round-trip; v12-missing-field and
//                          v11-migration fixtures derived from a live dump
//  4. arena wipe         — title -> arena -> wipe; worldYear must NOT advance
//  5. perk-tier storm    — bank XP for ~11 levels on all six characters, force
//                          a victory, drain a multi-character perk queue;
//                          jumpTo must refuse while the overlay is open
//  6. NPC kill persist   — attack a dungeon NPC via the real panel, kill,
//                          leave/return, save/load; must stay dead throughout
//  7. jump storm         — F5->F2->F4->F3->F1; warnings clean after each,
//                          deepestFloorReached correct
//
// Run: ONYX_URL="http://127.0.0.1:5176/OnyxLabyrinth/?debug=1" node scripts/playtests/stress-invariants.mjs

import {
  launch,
  snap,
  act,
  press,
  waitForIdle,
  debugLog,
  createFindings,
  ensureOutDir,
  writeReport,
  wait,
  captureFailureBundle,
} from "./lib.mjs";

const URL = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir("playtest-screenshots/2026-07-25-stress-invariants");

const { browser, page, errors } = await launch();
const findings = createFindings({ page, outDir: OUT, errors });
const observations = [];
const note = (s) => {
  observations.push(s);
  console.log(`    ${s}`);
};

let lastErrorSeq = -1;

/** Assert helper: false condition => P1 finding (auto-bundled). */
function ok(cond, floor, title, body = "") {
  if (!cond) findings.find("P1", floor, title, body);
  return cond;
}

/** warnings must be empty and no new error events since the last check. */
async function checkClean(tag, floorId) {
  const st = await snap(page);
  if (st.warnings?.length) {
    findings.find("P1", floorId, `invariant warnings at ${tag}`, JSON.stringify(st.warnings));
  }
  const errs = (await debugLog(page, 500, "error")).filter((e) => e.seq > lastErrorSeq);
  if (errs.length) {
    lastErrorSeq = Math.max(...errs.map((e) => e.seq));
    findings.find("P1", floorId, `error events at ${tag}`, JSON.stringify(errs.slice(0, 3)));
  }
  return st;
}

const evalState = (expr) =>
  page.evaluate((e) => new Function("state", `return (${e});`)(window.__onyxDebug.state), expr);

/** Adjacent plain cell outside all zones (same criteria as encounter-pacing). */
async function findPlainPair(floorId) {
  return page.evaluate((fid) => {
    const f = window.__onyxDebug.findFloor(fid);
    const DX = [0, 1, 0, -1];
    const DY = [-1, 0, 1, 0];
    const EDGE = ["n", "e", "s", "w"];
    const zones = f.encounterZones ?? [];
    const inRect = (rr, x, y) =>
      x >= Math.min(rr.x1, rr.x2) && x <= Math.max(rr.x1, rr.x2) &&
      y >= Math.min(rr.y1, rr.y2) && y <= Math.max(rr.y1, rr.y2);
    const ok = (x, y) => {
      const c = f.grid[y]?.[x];
      return !!c && c.tile == null && !zones.some((z) => inRect(z, x, y));
    };
    for (let y = 0; y < f.grid.length; y++) {
      for (let x = 0; x < (f.grid[y]?.length ?? 0); x++) {
        if (!ok(x, y)) continue;
        for (let d = 0; d < 4; d++) {
          if (f.grid[y][x][EDGE[d]] !== "open") continue;
          if (ok(x + DX[d], y + DY[d])) return { x, y, facing: d };
        }
      }
    }
    return null;
  }, floorId);
}

const jump = async (opts) => {
  await page.evaluate((o) => window.__onyxDebug.jumpTo(o), opts);
  await waitForIdle(page, 5000);
  return snap(page);
};

/** One forward step from a pity-primed cell => guaranteed encounter. */
async function forceEncounter(pair, extra = {}) {
  await jump({ floorId: extra.floorId ?? 1, x: pair.x, y: pair.y, facing: pair.facing, autosave: false, stepsSinceEncounter: 27, ...extra });
  await act(page, "ArrowUp", 6000);
  return snap(page);
}

async function freshBoot() {
  await page.goto(URL, { waitUntil: "networkidle" });
  await wait(400); // __onyxDebug attach settle
}

try {
  // --- Phase 1: baseline --------------------------------------------------
  console.log("--- phase 1: baseline");
  await freshBoot();
  const pairF1 = await findPlainPair(1);
  ok(!!pairF1, 1, "no plain pair found on F1");
  let st = await jump({ floorId: 1, x: pairF1.x, y: pairF1.y, facing: pairF1.facing, autosave: false });
  ok(st.route === "dungeon", 1, "baseline route not dungeon", `route=${st.route}`);
  await checkClean("baseline", 1);
  const year0 = await evalState("state.worldYear");
  ok(year0 === 3847, 1, "fresh worldYear not 3847", `got ${year0}`);

  // --- Phase 2: campaign wipe century cycle --------------------------------
  console.log("--- phase 2: campaign wipe -> century cycle");
  st = await forceEncounter(pairF1);
  ok(st.route === "combat", 1, "pity-primed step did not trigger combat", `route=${st.route}`);
  await page.evaluate(() => window.__onyxDebug.exitDebugCombat("wipe"));
  await waitForIdle(page, 6000);
  st = await checkClean("game-over", 1);
  ok(st.route === "game_over", 1, "wipe did not land on game_over", `route=${st.route}`);
  const yearAfterWipe = await evalState("state.worldYear");
  ok(yearAfterWipe === year0 + 100, 1, "campaign wipe did not advance worldYear by 100", `before=${year0} after=${yearAfterWipe}`);
  const goText = await page.evaluate(() => document.body.innerText);
  ok(goText.includes(`Year ${year0 + 100}`), 1, "game-over screen does not show advanced year", `wanted "Year ${year0 + 100}"`);
  note(`campaign wipe: worldYear ${year0} -> ${yearAfterWipe}; game-over text shows "Year ${year0 + 100}": ${goText.includes(`Year ${year0 + 100}`)}`);
  await press(page, "Enter");
  await waitForIdle(page, 6000);
  st = await checkClean("town-after-wipe", 1);
  ok(st.route === "town", 1, "game-over Continue did not open town", `route=${st.route}`);
  const townText = await page.evaluate(() => document.body.innerText);
  ok(townText.includes(`Year ${year0 + 100}`), 1, "town header missing advanced year", `wanted "Year ${year0 + 100}"`);
  note(`town header shows Year ${year0 + 100}: ${townText.includes(`Year ${year0 + 100}`)}`);

  // The invariant warnings above have a single root cause worth its own
  // finding: endCombat's wipe branch early-returns before the
  // `state.combat = undefined; combatController = null;` cleanup, so a stale
  // ended combat survives into game_over/town. Probe it explicitly.
  const staleCombat = await evalState("state.combat != null");
  if (!ok(!staleCombat, 1, "stale state.combat after campaign wipe reaches town", "endCombat wipe branch returns before combat cleanup; loadSave/jumpTo refuse until the next combat starts")) {
    note("stale state.combat persists through game_over -> town after campaign wipe");
  }

  // --- Phase 3: save/load + migration fixtures ------------------------------
  console.log("--- phase 3: save/load round-trip + migration");
  // dumpSave still works post-wipe; loadSave refuses while the stale combat is
  // present (consequence of the finding above), so the load probes run on a
  // fresh boot.
  const dump = await page.evaluate(() => window.__onyxDebug.dumpSave());
  const parsed = JSON.parse(dump);
  ok(parsed.worldYear === year0 + 100, 1, "dumpSave worldYear wrong", `got ${parsed.worldYear}`);
  note(`dumpSave: version=${parsed.version} worldYear=${parsed.worldYear}`);

  await freshBoot();
  await page.evaluate((j) => window.__onyxDebug.loadSave(j), dump);
  await waitForIdle(page, 6000);
  st = await checkClean("after-loadSave", 1);
  const yearReload = await evalState("state.worldYear");
  ok(yearReload === year0 + 100, 1, "loadSave lost worldYear", `got ${yearReload}`);

  // v12 dump with the field deleted (fallback path).
  const noYear = { ...parsed };
  delete noYear.worldYear;
  await page.evaluate((j) => window.__onyxDebug.loadSave(j), JSON.stringify(noYear));
  await waitForIdle(page, 6000);
  await checkClean("after-load-missing-worldYear", 1);
  const yearFallback = await evalState("state.worldYear");
  ok(yearFallback === 3847, 1, "missing worldYear did not default to 3847", `got ${yearFallback}`);
  note(`v12-without-worldYear load -> worldYear ${yearFallback}`);

  // Synthetic v11 save (v12 dump minus the v12 field, version stamped back).
  const v11 = { ...parsed, version: 11 };
  delete v11.worldYear;
  const v11Result = await page.evaluate((j) => {
    try {
      window.__onyxDebug.loadSave(j);
      return { ok: true };
    } catch (e) {
      return { ok: false, err: String(e) };
    }
  }, JSON.stringify(v11));
  await waitForIdle(page, 6000);
  ok(v11Result.ok, 1, "v11 save failed to load", v11Result.err ?? "");
  await checkClean("after-v11-migration", 1);
  const yearMigrated = await evalState("state.worldYear");
  ok(yearMigrated === 3847, 1, "v11 migration did not set worldYear 3847", `got ${yearMigrated}`);
  note(`v11 migration load -> worldYear ${yearMigrated}`);

  // --- Phase 4: arena wipe (no year advance) --------------------------------
  console.log("--- phase 4: arena wipe");
  await freshBoot();
  st = await snap(page);
  ok(st.route === "title", 0, "fresh boot not on title", `route=${st.route}`);
  await press(page, "a");
  await waitForIdle(page, 3000);
  st = await snap(page);
  ok(st.route === "arena", 0, "'a' did not open arena", `route=${st.route}`);
  let arenaCombat = false;
  for (let i = 0; i < 8 && !arenaCombat; i++) {
    await press(page, "Enter");
    await waitForIdle(page, 4000);
    st = await snap(page);
    arenaCombat = st.route === "combat";
  }
  ok(arenaCombat, 0, "arena never reached combat", `route=${st.route}`);
  const yearArenaBefore = await evalState("state.worldYear");
  await page.evaluate(() => window.__onyxDebug.exitDebugCombat("wipe"));
  await waitForIdle(page, 6000);
  st = await checkClean("arena-game-over", 0);
  ok(st.route === "game_over", 0, "arena wipe did not show game_over", `route=${st.route}`);
  const yearArenaAfter = await evalState("state.worldYear");
  ok(yearArenaAfter === yearArenaBefore, 0, "ARENA wipe advanced worldYear", `before=${yearArenaBefore} after=${yearArenaAfter}`);
  const arenaGoText = await page.evaluate(() => document.body.innerText);
  note(`arena wipe: worldYear ${yearArenaBefore} -> ${yearArenaAfter}; game-over shows century copy: ${arenaGoText.includes("A hundred years in the dark")}, "wake in town" prompt: ${arenaGoText.includes("wake in town")}`);
  await press(page, "Enter");
  await waitForIdle(page, 6000);
  st = await checkClean("arena-after-wipe", 0);
  ok(st.route === "arena", 0, "arena wipe Continue did not return to arena", `route=${st.route}`);

  // --- Phase 5: perk-tier storm ---------------------------------------------
  console.log("--- phase 5: perk-tier level-up storm");
  await freshBoot();
  const pair5 = await findPlainPair(1);
  await jump({ floorId: 1, x: pair5.x, y: pair5.y, facing: pair5.facing, autosave: false, partyLevel: 2 });
  const levelsBefore = await evalState("state.party.map(c => c.level)");
  await page.evaluate(() => {
    for (const c of window.__onyxDebug.state.party) c.xp += 15000;
  });
  st = await forceEncounter(pair5);
  ok(st.route === "combat", 1, "perk-storm encounter did not trigger", `route=${st.route}`);
  await page.evaluate(() => window.__onyxDebug.exitDebugCombat("victory"));
  await waitForIdle(page, 8000);
  st = await snap(page);
  ok(st.route === "perk", 1, "no perk overlay after multi-tier victory", `route=${st.route}`);
  // jumpTo must refuse while the overlay is live.
  const refusal = await page.evaluate(() => {
    try {
      window.__onyxDebug.jumpTo({ floorId: 1, x: 1, y: 1 });
      return { refused: false };
    } catch (e) {
      return { refused: true, err: String(e) };
    }
  });
  ok(refusal.refused, 1, "jumpTo did NOT refuse while perk overlay open", JSON.stringify(refusal));
  note(`jumpTo during perk overlay refused: ${refusal.refused} (${refusal.err ?? ""})`);
  let picks = 0;
  for (let i = 0; i < 40 && st.route === "perk"; i++) {
    await press(page, "ArrowLeft");
    await press(page, "Enter");
    await waitForIdle(page, 3000);
    st = await snap(page);
    picks++;
  }
  ok(st.route === "dungeon", 1, "perk queue did not drain back to dungeon", `route=${st.route} after ${picks} picks`);
  const levelsAfter = await evalState("state.party.map(c => c.level)");
  const perkCounts = await evalState("state.party.map(c => c.perkIds.length)");
  note(`perk storm: levels ${JSON.stringify(levelsBefore)} -> ${JSON.stringify(levelsAfter)}; picks=${picks}; perkIds per char=${JSON.stringify(perkCounts)}`);
  await checkClean("after-perk-storm", 1);

  // --- Phase 6: NPC kill persistence ----------------------------------------
  console.log("--- phase 6: NPC kill persistence");
  const npc = await page.evaluate(() => {
    const f = window.__onyxDebug.findFloor(1);
    const n = (f.npcs ?? [])[0];
    if (!n) return null;
    const DX = [0, 1, 0, -1];
    const DY = [-1, 0, 1, 0];
    const EDGE = ["n", "e", "s", "w"];
    // approach cell: plain neighbor with an open edge INTO the npc tile
    for (let d = 0; d < 4; d++) {
      const ax = n.x - DX[d];
      const ay = n.y - DY[d]; // stepping in direction d from (ax,ay) lands on npc
      const c = f.grid[ay]?.[ax];
      if (c && c.tile == null && c[EDGE[d]] === "open") {
        return { id: n.id, name: n.name, x: n.x, y: n.y, approach: { x: ax, y: ay, facing: d } };
      }
    }
    return { id: n.id, name: n.name, x: n.x, y: n.y, approach: null };
  });
  ok(!!npc && !!npc.approach, 1, "no approachable NPC on F1", JSON.stringify(npc));
  if (npc?.approach) {
    await jump({ floorId: 1, x: npc.approach.x, y: npc.approach.y, facing: npc.approach.facing, autosave: false, stepsSinceEncounter: 0 });
    await act(page, "ArrowUp", 4000);
    st = await snap(page);
    ok(st.route === "npc", 1, "stepping onto NPC tile did not open panel", `route=${st.route}`);
    await press(page, "a"); // root hotkey: Attack
    await waitForIdle(page, 6000);
    st = await snap(page);
    ok(st.route === "combat", 1, "NPC Attack did not start combat", `route=${st.route}`);
    await page.evaluate(() => window.__onyxDebug.exitDebugCombat("victory"));
    await waitForIdle(page, 8000);
    st = await snap(page);
    // party is maxed from phase 5's autosave-free state? — no, fresh jump w/o
    // partyLevel keeps phase-5 levels in this same page session; no perk queue
    // expected (no banked XP), but tolerate one overlay just in case.
    for (let i = 0; i < 10 && st.route === "perk"; i++) {
      await press(page, "ArrowLeft");
      await press(page, "Enter");
      await waitForIdle(page, 3000);
      st = await snap(page);
    }
    const killed = await evalState("Array.from(state.killedNPCs ?? [])");
    ok(killed.includes(npc.id), 1, "killedNPCs missing the slain NPC", JSON.stringify(killed));
    note(`killed NPC ${npc.id} (${npc.name}); killedNPCs=${JSON.stringify(killed)}`);

    // Leave, return, step on the corpse tile: no panel.
    await jump({ floorId: 2, x: 1, y: 1, autosave: false }); // (1,1) may be wall-adjacent; jumpTo only places, doesn't move
    await jump({ floorId: 1, x: npc.approach.x, y: npc.approach.y, facing: npc.approach.facing, autosave: false, stepsSinceEncounter: 0 });
    await act(page, "ArrowUp", 4000);
    st = await snap(page);
    ok(st.route === "dungeon", 1, "dead NPC still opens panel after floor round-trip", `route=${st.route}`);

    // And across save/load.
    const dump2 = await page.evaluate(() => window.__onyxDebug.dumpSave());
    await page.evaluate((j) => window.__onyxDebug.loadSave(j), dump2);
    await waitForIdle(page, 6000);
    const killedAfterLoad = await evalState("Array.from(state.killedNPCs ?? [])");
    ok(killedAfterLoad.includes(npc.id), 1, "NPC kill lost across save/load", JSON.stringify(killedAfterLoad));
    await checkClean("npc-kill-persist", 1);
  }

  // --- Phase 7: jump storm ----------------------------------------------------
  console.log("--- phase 7: jump storm");
  const deepestSeq = [];
  for (const fid of [5, 2, 4, 3, 1]) {
    const start = await page.evaluate((f) => {
      const fl = window.__onyxDebug.findFloor(f);
      return { x: fl.startX, y: fl.startY };
    }, fid);
    st = await jump({ floorId: fid, x: start.x, y: start.y, autosave: false });
    ok(st.route === "dungeon", fid, `jump storm: route not dungeon on F${fid}`, `route=${st.route}`);
    ok(st.floor?.id === fid, fid, `jump storm: wrong floor loaded`, `wanted ${fid} got ${st.floor?.id}`);
    await checkClean(`jump-f${fid}`, fid);
    deepestSeq.push(await evalState("state.deepestFloorReached"));
  }
  const monotone = deepestSeq.every((v, i) => i === 0 || v >= deepestSeq[i - 1]);
  ok(monotone && deepestSeq[deepestSeq.length - 1] === 5, 1, "deepestFloorReached not monotone / wrong", JSON.stringify(deepestSeq));
  note(`jump storm deepestFloorReached sequence: ${JSON.stringify(deepestSeq)}`);

  // --- wrap up ---------------------------------------------------------------
  const errKind = await debugLog(page, 500, "error");
  const netNoise = errors.filter((e) => e.includes("ERR_NETWORK_CHANGED"));
  const realErrors = errors.filter((e) => !e.includes("ERR_NETWORK_CHANGED"));
  const report = {
    url: URL,
    when: new Date().toISOString(),
    observations,
    findings: findings.findings,
    inPageErrors: errKind,
    consoleErrors: realErrors,
    envNetworkNoise: netNoise.length,
  };
  await findings.flush();
  const p = writeReport(OUT, report);
  console.log(`\nreport: ${p}`);
  console.log(`findings: ${findings.findings.length}, real console errors: ${realErrors.length}, env network noise: ${netNoise.length}`);
} finally {
  await findings.flush();
  await browser.close();
}
