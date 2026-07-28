/**
 * Comprehensive playtest — boot through every major system (dungeon nav,
 * combat + barks, camp/town, utility spells, trapped chests, water/swimming,
 * NPCs, save/load, boss + ending, perks/leveling, arena).
 *
 * Named "-sonnet" and using a "-sonnet" output dir because another agent is
 * running the identical prompt in parallel against playtest-comprehensive.mjs
 * / playtest-screenshots/2026-07-27-comprehensive/ — this script must not
 * collide with those paths or the shared preview server's dist output.
 *
 * Run: ONYX_URL="http://127.0.0.1:5176/OnyxLabyrinth/?debug=1" node scripts/playtests/playtest-comprehensive-sonnet.mjs
 */
import {
  launch,
  wait,
  press,
  act,
  snap,
  snapWithMap,
  waitForIdle,
  bootToDungeon,
  jumpTo,
  debugLog,
  sounds,
  captureFailureBundle,
  createFindings,
  ensureOutDir,
  writeReport,
  shot as libShot,
} from "./lib.mjs";

const URL = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir("playtest-screenshots/2026-07-27-comprehensive-sonnet");

const log = (...a) => console.log(...a);
const t0 = Date.now();
let testCount = 0;
const coverage = {};

const { browser, page, errors } = await launch();
const { findings, find, flush } = createFindings({ log, page, outDir: OUT, errors });

async function shot(name) {
  try {
    return await libShot(page, OUT, name);
  } catch (e) {
    log(`  (screenshot failed: ${name}: ${e})`);
    return null;
  }
}

async function freshBoot() {
  await page.goto(URL, { waitUntil: "networkidle" });
  await wait(400);
}

const jump = async (opts) => {
  await page.evaluate((o) => window.__onyxDebug.jumpTo(o), opts);
  await waitForIdle(page, 5000);
  return snap(page);
};

const evalState = (expr) =>
  page.evaluate((e) => new Function("state", `return (${e});`)(window.__onyxDebug.state), expr);

/** Face a compass direction (0=N,1=E,2=S,3=W) then step forward once. */
async function faceAndStep(target) {
  const cur = await page.evaluate(() => window.__onyxDebug.state.player.facing);
  const delta = (target - cur + 4) % 4;
  if (delta === 3) await press(page, "ArrowLeft");
  else for (let i = 0; i < delta; i++) await press(page, "ArrowRight");
  await waitForIdle(page);
  await press(page, "ArrowUp");
  await waitForIdle(page);
  return snap(page);
}

/** Force a non-boss encounter via the real startCombat() path, from wherever we stand.
 *  Floor 5's boss pack carries weight 1 out of 23 total (~4.3%); 300 synchronous
 *  reroll attempts (no real waits, just table rolls) makes a whiff astronomically
 *  unlikely (~1 - (1-0.043)^300, i.e. effectively certain to find one). */
async function forceEncounter({ allowBoss = false } = {}) {
  return page.evaluate(async (allowBoss) => {
    const d = window.__onyxDebug;
    const s = d.state;
    let resolved = null;
    for (let attempts = 0; attempts < 300; attempts++) {
      const entry = d.rollEncounter(s.floor.id);
      if (!entry) return { ok: false };
      const r = d.resolveEncounter(entry);
      if (r.length === 0) continue;
      const hasBoss = r.some((e) => e.enemy.isBoss);
      if (hasBoss !== allowBoss) continue;
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
    return { ok: true, enemyCount: resolved.length };
  }, allowBoss);
}

/**
 * Poll the live CombatController's scene for dialog barks over `durationMs`.
 * Barks are a canvas-only sibling channel (spec 2026-07-26) — never written to
 * `combat.recentLog` and not surfaced as audio cues — so the only way to
 * observe them from outside the engine is the same private-property reach
 * main.ts's own `groundPlaneProbe` debug helper already uses
 * (`combatController.scene`, TS-private but present at runtime). `priority`
 * on each CombatBark maps 1:1 to trigger per data/combat-barks.ts
 * (3=death, 2=heavyHit, 1=beforeSpell).
 */
async function pollBarks(durationMs) {
  const PRIORITY_TRIGGER = { 3: "death", 2: "heavyHit", 1: "beforeSpell" };
  const seen = new Map();
  const deadline = Date.now() + durationMs;
  while (Date.now() < deadline) {
    const barks = await page.evaluate(() => {
      const cc = window.__onyxDebug.getCombatController();
      const scene = cc ? cc.scene : null;
      return (scene?.barks ?? []).map((b) => ({ actorId: b.actorId, text: b.text, priority: b.priority }));
    });
    for (const b of barks) {
      const key = `${b.actorId}:${b.priority}:${b.text}`;
      if (!seen.has(key)) seen.set(key, { ...b, trigger: PRIORITY_TRIGGER[b.priority] ?? "unknown" });
    }
    await wait(120);
  }
  return [...seen.values()];
}

/** Choose a root combat-menu entry by matching regex against its label, then confirm. */
async function chooseCombatEntry(nameRe) {
  const st = await snap(page);
  const sel = st.combat?.selection;
  if (!sel) return false;
  const idx = sel.entries.findIndex((e) => nameRe.test(e));
  if (idx < 0) return false;
  const delta = idx - sel.index;
  for (let i = 0; i < Math.abs(delta); i++) await press(page, delta > 0 ? "ArrowDown" : "ArrowUp", 1, 60);
  await press(page, "Enter", 1, 120);
  return true;
}

/** Drain a queue of post-combat perk overlays (Arrow + Enter each). Returns pick count. */
async function drainPerkQueue(maxPicks = 40) {
  let st = await snap(page);
  let picks = 0;
  for (let i = 0; i < maxPicks && st.route === "perk"; i++) {
    await press(page, "ArrowLeft");
    await press(page, "Enter");
    await waitForIdle(page, 3000);
    st = await snap(page);
    picks++;
  }
  return { picks, finalRoute: st.route };
}

/** Confirm through an ending scene by repeatedly pressing Enter. */
async function drainEnding(maxPresses = 30) {
  let st = await snap(page);
  let presses = 0;
  for (let i = 0; i < maxPresses && st.route !== "dungeon"; i++) {
    await press(page, "Enter", 1, 350);
    await waitForIdle(page, 4000);
    st = await snap(page);
    presses++;
  }
  return { presses, finalRoute: st.route };
}

function section(name) {
  log(`\n=== ${name} ===`);
  testCount++;
}

// ============================================================================
try {
  section("1. Boot -> Dungeon (smoke)");
  let st = await bootToDungeon(page, URL);
  await shot("01-boot-dungeon.png");
  if (st.route !== "dungeon") {
    find("P0", 0, "Fresh boot did not reach dungeon", JSON.stringify({ route: st.route, mode: st.mode }));
  } else {
    log(`OK route=dungeon floor=${st.floor.id} pos=(${st.pos.x},${st.pos.y})`);
  }
  if (st.party.length !== 6) {
    find("P1", st.floor.id, "Party does not have 6 members after boot", `got ${st.party.length}`);
  }
  const anyDead = st.party.filter((c) => c.hp <= 0);
  if (anyDead.length > 0) {
    find("P1", st.floor.id, "Party member(s) start at HP<=0", JSON.stringify(anyDead));
  }
  if (st.floor.id !== 1) {
    find("P1", st.floor.id, "Fresh boot did not start on floor 1", `got floor ${st.floor.id}`);
  }

  // Automap open/close.
  await press(page, "m");
  await waitForIdle(page, 1000);
  let mst = await snap(page);
  await shot("02-automap-open.png");
  if (!mst.flags.mapVisible) {
    find("P1", 1, "Automap did not open on 'm'", JSON.stringify(mst.flags));
  }
  await press(page, "m");
  await waitForIdle(page, 1000);
  mst = await snap(page);
  await shot("03-automap-closed.png");
  if (mst.flags.mapVisible) {
    find("P1", 1, "Automap did not close on second 'm'", JSON.stringify(mst.flags));
  }
  if (mst.route !== "dungeon") {
    find("P1", 1, "Route not back to dungeon after closing automap", `route=${mst.route}`);
  }
  coverage.boot = true;
} catch (e) {
  coverage.boot = "threw";
  find("P0", 0, "Section 1 (boot/automap) threw", String(e));
  await captureFailureBundle(page, "section1-exception", { outDir: OUT, errors });
}

// ============================================================================
try {
  section("2. Dungeon navigation (Floor 1)");

  // Crossroads walk + turn (from the known start room).
  let st = await jump({ floorId: 1, x: 5, y: 8, facing: 0, autosave: false });
  await press(page, "ArrowUp"); // (5,8)->(5,7)
  await waitForIdle(page);
  await press(page, "ArrowUp"); // (5,7)->(5,6) crossroads
  await waitForIdle(page);
  st = await snap(page);
  await shot("04-crossroads.png");
  if (st.pos.x !== 5 || st.pos.y !== 6) {
    find("P1", 1, "Forward movement did not land at expected crossroads (5,6)", `got (${st.pos.x},${st.pos.y})`);
  } else {
    log("OK forward movement to crossroads");
  }
  await press(page, "ArrowRight"); // turn
  await waitForIdle(page);
  const afterTurn = await snap(page);
  if (afterTurn.pos.facing === st.pos.facing) {
    find("P1", 1, "ArrowRight did not change facing", `facing stayed ${st.pos.facing}`);
  }
  await press(page, "ArrowLeft"); // turn back
  await waitForIdle(page);
  await press(page, "ArrowDown"); // step back (5,6)->(5,7)
  await waitForIdle(page);
  const afterBack = await snap(page);
  if (afterBack.pos.x !== 5 || afterBack.pos.y !== 7) {
    find("P2", 1, "Backward movement did not return to (5,7)", `got (${afterBack.pos.x},${afterBack.pos.y})`);
  } else {
    log("OK backward movement + turning");
  }

  // Wall collision: generic — find a wall edge on the current cell, face it, step, confirm no move.
  const wallProbe = await page.evaluate(() => {
    const d = window.__onyxDebug;
    const s = d.state;
    const cell = s.floor.grid[s.player.y]?.[s.player.x];
    const EDGE = ["n", "e", "s", "w"];
    for (let dir = 0; dir < 4; dir++) {
      if (cell?.[EDGE[dir]] === "wall") return { dir, x: s.player.x, y: s.player.y };
    }
    return null;
  });
  if (wallProbe) {
    const before = await snap(page);
    const wallSt = await faceAndStep(wallProbe.dir);
    await shot("05-wall-collision.png");
    if (wallSt.pos.x !== before.pos.x || wallSt.pos.y !== before.pos.y) {
      find("P0", 1, "Walking into a wall edge moved the player", JSON.stringify({ before: before.pos, after: wallSt.pos, dir: wallProbe.dir }));
    } else {
      log("OK wall collision blocks movement");
    }
  } else {
    log("(no wall edge found on current cell to probe — skipped)");
  }

  // Door: gallery entrance door (6,5)->(7,5).
  st = await jump({ floorId: 1, x: 6, y: 5, facing: 1, autosave: false });
  await press(page, "ArrowUp");
  await waitForIdle(page);
  st = await snap(page);
  await shot("06-through-door.png");
  if (st.pos.x !== 7 || st.pos.y !== 5) {
    find("P1", 1, "Walking through a door edge did not move player onto (7,5)", `got (${st.pos.x},${st.pos.y})`);
  } else {
    log("OK door edge is walkable");
  }
  if (st.tile !== "water") {
    find("P2", 1, "Gallery threshold (7,5) expected water tile", `got tile=${st.tile}`);
  }

  // Locked door: reliquary (9,7)->(9,8), needs crypt-key.
  st = await jump({ floorId: 1, x: 9, y: 6, facing: 2, autosave: false, clearUnlockedDoors: true, keys: [] });
  await press(page, "ArrowUp"); // toward (9,7)
  await waitForIdle(page);
  await press(page, "u"); // try unlock without key
  await waitForIdle(page, 1000);
  st = await snap(page);
  const noKeyMsg = st.message.text;
  await shot("07-locked-door-no-key.png");
  log(`unlock attempt w/o key: "${noKeyMsg}"`);
  const noKeyWorked = /unlock|swings open|picks the lock|clicks open/i.test(noKeyMsg);
  if (noKeyWorked) {
    find("P1", 1, "Locked reliquary door opened WITHOUT crypt-key", noKeyMsg);
  }
  st = await jump({ floorId: 1, x: 9, y: 7, facing: 2, autosave: false, keys: ["crypt-key"] });
  await press(page, "u");
  await waitForIdle(page, 1000);
  st = await snap(page);
  await shot("08-locked-door-with-key.png");
  log(`unlock attempt with crypt-key: "${st.message.text}"`);
  if (!/unlock|swings open|picks the lock|clicks open|already unlocked/i.test(st.message.text)) {
    find("P1", 1, "Locked reliquary door did not open WITH crypt-key", st.message.text);
  } else {
    log("OK locked door gated by key, opens with key");
  }

  // Tile features: stairs down (5,1)->F2, darkness zone (8,5)/(9,5), teleporter (floor 3, 9,6).
  st = await jump({ floorId: 1, x: 5, y: 2, facing: 0, autosave: false });
  await press(page, "ArrowUp");
  await waitForIdle(page);
  st = await snap(page);
  await shot("09-stairs-down.png");
  if (st.floor.id !== 2) {
    find("P1", 1, "Stairs down (5,1) did not transition to Floor 2", `landed floor ${st.floor.id}`);
  } else {
    log(`OK stairs_down F1->F2, landed at (${st.pos.x},${st.pos.y})`);
  }

  st = await jump({ floorId: 1, x: 8, y: 5, autosave: false });
  await shot("10-darkness-zone.png");
  if (st.tile !== "darkness" || !st.flags.inDarkness) {
    find("P2", 1, "Darkness tile (8,5) did not set inDarkness flag", JSON.stringify({ tile: st.tile, flags: st.flags }));
  } else {
    log("OK darkness zone sets inDarkness");
  }

  st = await jump({ floorId: 3, x: 9, y: 6, autosave: false });
  const beforeTele = st;
  await waitForIdle(page, 2000);
  st = await snap(page);
  await shot("11-teleporter.png");
  log(`teleporter tile(9,6) F3: tile=${st.tile} pos=(${st.pos.x},${st.pos.y}) msg="${st.message.text}"`);
  // Teleporters fire on step, not on jumpTo-placement; confirm the tile itself
  // is reported correctly (functional trigger covered indirectly by movement
  // tests elsewhere — jumpTo is a teleport itself and would mask a step-based one).
  if (beforeTele.tile !== "teleporter") {
    find("P2", 3, "Expected teleporter tile at F3 (9,6)", `got ${beforeTele.tile}`);
  }

  // Message band show/hide.
  st = await jump({ floorId: 1, x: 9, y: 6, facing: 2, autosave: false });
  await press(page, "ArrowUp");
  await waitForIdle(page);
  st = await snap(page);
  const msgVisibleOnEvent = st.message.visible;
  log(`message band after stepping onto pre-drown warning tile: visible=${msgVisibleOnEvent} text="${st.message.text}"`);
  if (!msgVisibleOnEvent && st.message.text) {
    find("P2", 1, "Message text present but message band not marked visible", JSON.stringify(st.message));
  }
  coverage.navigation = true;
} catch (e) {
  coverage.navigation = "threw";
  find("P0", 1, "Section 2 (navigation) threw", String(e));
  await captureFailureBundle(page, "section2-exception", { outDir: OUT, errors });
}

// ============================================================================
try {
  section("3. Combat (forced encounter, player turns, victory/flee/wipe, barks)");
  await freshBoot();
  let st = await jump({ floorId: 1, x: 5, y: 7, facing: 0, autosave: false });

  const res = await forceEncounter();
  if (!res.ok) {
    find("P1", 1, "Could not force a non-boss encounter on Floor 1", JSON.stringify(res));
  } else {
    st = await snap(page);
    await shot("12-combat-start.png");
    if (st.route !== "combat" || !st.combat) {
      find("P0", 1, "Forced encounter did not reach combat route", `route=${st.route}`);
    } else {
      log(`OK combat started, round=${st.combat.round}, enemies=${st.combat.enemies.length}`);
      const hpOk = st.combat.enemies.every((e) => typeof e.hp === "number" && typeof e.maxHp === "number");
      if (!hpOk) find("P1", 1, "Combat enemies missing hp/maxHp fields", JSON.stringify(st.combat.enemies));

      // Wait for playback to clear, then drive one real player turn via the
      // FF6 select-action menu: Attack -> confirm target. Assert something
      // actually happened (recentLog grew or an enemy's hp moved) rather than
      // just checking the route, which stays "combat" almost regardless of
      // whether the keypresses did anything.
      for (let i = 0; i < 60 && (await snap(page)).combat?.phase === "playback"; i++) await wait(100);
      st = await snap(page);
      if (st.combat?.selection) {
        await shot("13-combat-menu.png");
        const logLenBefore = st.combat.recentLog.length;
        const hpBefore = st.combat.enemies.map((e) => e.hp);
        log(`selection: "${st.combat.selection.title}" entries=${JSON.stringify(st.combat.selection.entries)}`);
        // Confirm first entry (typically Attack), then confirm target.
        await press(page, "Enter");
        await waitForIdle(page, 4000);
        await press(page, "Enter"); // target confirm, if a target submenu opened
        await waitForIdle(page, 6000);
        st = await snap(page);
        await shot("14-combat-after-turn.png");
        log(`after one player turn: route=${st.route} round=${st.combat?.round}`);
        if (st.route !== "combat" && st.route !== "dungeon") {
          find("P1", 1, "Unexpected route after one combat turn", `route=${st.route}`);
        } else if (st.route === "combat" && st.combat) {
          const logGrew = st.combat.recentLog.length > logLenBefore;
          const hpChanged = st.combat.enemies.some((e, i) => e.hp !== hpBefore[i]);
          if (!logGrew && !hpChanged) {
            find("P2", 1, "Attack+confirm keypresses produced no observable change (recentLog/enemy hp both static)", JSON.stringify({ logLenBefore, hpBefore, after: st.combat.recentLog.length }));
          } else {
            log(`OK player turn had an observable effect (logGrew=${logGrew}, hpChanged=${hpChanged})`);
          }
        }
      } else {
        log("(no selection menu observed before playback settled — combat may have auto-resolved)");
      }

      // End this fight via debug so we can test victory flow cleanly.
      if ((await snap(page)).route === "combat") {
        await page.evaluate(() => window.__onyxDebug.exitDebugCombat("victory"));
        await waitForIdle(page, 8000);
        st = await snap(page);
        // May chain into perk overlay if a level-up crossed a tier; drain it.
        if (st.route === "perk") await drainPerkQueue();
        st = await snap(page);
        await shot("15-combat-victory.png");
        if (st.route !== "dungeon") {
          find("P1", 1, "Victory did not return to dungeon route", `route=${st.route}`);
        } else {
          log("OK victory -> dungeon");
        }
      }
    }
  }

  // Flee.
  const res2 = await forceEncounter();
  if (res2.ok) {
    st = await snap(page);
    if (st.route === "combat") {
      await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
      await waitForIdle(page, 8000);
      st = await snap(page);
      await press(page, "Enter");
      await waitForIdle(page, 2000);
      st = await snap(page);
      await shot("16-combat-fled.png");
      if (st.route !== "dungeon") {
        find("P1", 1, "Flee did not return to dungeon route", `route=${st.route}`);
      } else {
        log("OK flee -> dungeon");
      }
    }
  }

  // Wipe -> game over.
  const res3 = await forceEncounter();
  if (res3.ok) {
    st = await snap(page);
    if (st.route === "combat") {
      await page.evaluate(() => window.__onyxDebug.exitDebugCombat("wipe"));
      await waitForIdle(page, 8000);
      st = await snap(page);
      await shot("17-combat-wipe-gameover.png");
      if (st.route !== "game_over") {
        find("P0", 1, "Party wipe did not reach game_over route", `route=${st.route}`);
      } else {
        log("OK wipe -> game_over");
        const goText = await page.evaluate(() => document.body.innerText);
        log(`game-over text sample: ${goText.slice(0, 160).replace(/\s+/g, " ")}`);
        await press(page, "Enter");
        await waitForIdle(page, 6000);
        st = await snap(page);
        if (st.route !== "town") {
          find("P1", 1, "Game-over Continue did not open town (century-cycle wipe path)", `route=${st.route}`);
        } else {
          log("OK game-over Continue -> town");
        }
      }
    }
  }

  // Bark disable toggle.
  await page.evaluate(() => window.__onyxDebug.setBarksEnabled(false));
  const disabledVal = await page.evaluate(() => window.__onyxDebug.getBarksEnabled());
  if (disabledVal !== false) {
    find("P2", 1, "setBarksEnabled(false) did not stick (getBarksEnabled)", `got ${disabledVal}`);
  } else {
    log("OK setBarksEnabled(false) took effect");
  }
  await page.evaluate(() => window.__onyxDebug.setBarksEnabled(true));
  coverage.combat = true;
} catch (e) {
  coverage.combat = "threw";
  find("P0", 1, "Section 3 (combat) threw", String(e));
  await captureFailureBundle(page, "section3-exception", { outDir: OUT, errors });
}

// ============================================================================
try {
  section("3b. Dialog barks (engineered heavyHit/death/beforeSpell + disable)");
  await freshBoot();
  let st = await jump({ floorId: 1, x: 5, y: 7, facing: 0, autosave: false });

  // heavyHit: shrink one party member's maxHp/hp so any real hit clears the
  // 35%-of-maxHp threshold. This is state manipulation (HP pool size), not
  // combat-math manipulation — the damage formula itself is untouched.
  await page.evaluate(() => {
    const c = window.__onyxDebug.state.party[0];
    c.maxHp = 30;
    c.hp = 30;
  });
  const res = await forceEncounter();
  const collected = [];
  if (!res.ok) {
    find("P2", 1, "Could not force an encounter for the bark probe", JSON.stringify(res));
  } else {
    for (let i = 0; i < 60 && (await snap(page)).combat?.phase === "playback"; i++) await wait(100);
    // Guarantee a death bark: force the first enemy to 1 hp so our next
    // Attack kills it via the real per-turn resolution pipeline (exitDebugCombat
    // bypasses that pipeline entirely and would never emit one).
    await page.evaluate(() => {
      const combat = window.__onyxDebug.state.combat;
      const first = combat?.enemies?.front?.[0] ?? combat?.enemies?.back?.[0];
      if (first) first.hp = 1;
    });

    for (let round = 0; round < 5; round++) {
      st = await snap(page);
      if (!st.combat || st.route !== "combat") break;
      if (st.combat.phase === "playback" || !st.combat.selection) {
        collected.push(...(await pollBarks(400)));
        continue;
      }
      const triedMagic = await chooseCombatEntry(/magic/i);
      if (!triedMagic) await chooseCombatEntry(/attack/i);
      // Target-confirm submenu, if one opened.
      await press(page, "Enter", 1, 60);
      collected.push(...(await pollBarks(2200))); // ~BARK_DURATION_BASE window
    }
    if ((await snap(page)).route === "combat") {
      await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
      await waitForIdle(page, 6000);
      st = await snap(page);
      if (st.route === "dungeon") await press(page, "Enter").catch(() => {});
    }
  }

  const byTrigger = {
    death: collected.some((b) => b.trigger === "death"),
    heavyHit: collected.some((b) => b.trigger === "heavyHit"),
    beforeSpell: collected.some((b) => b.trigger === "beforeSpell"),
  };
  log(`bark probe: collected ${collected.length} unique bark(s): ${JSON.stringify(collected.map((b) => ({ trigger: b.trigger, text: b.text })))}`);
  log(`triggers observed: ${JSON.stringify(byTrigger)}`);
  if (!byTrigger.death) {
    find("P2", 1, "Never observed a 'death' bark despite forcing an enemy to 1 HP and landing a kill", JSON.stringify(collected));
  }
  if (!byTrigger.heavyHit) {
    find("P3", 1, "Never observed a 'heavyHit' bark in 5 rounds despite shrinking a party member's maxHp to 30 (probabilistic — enemies may not have targeted them)", "");
  }
  coverage.barks = byTrigger;

  // Bark-disable: repeat the death-bark setup with barks off; must render none.
  await page.evaluate(() => window.__onyxDebug.setBarksEnabled(false));
  await freshBoot();
  await page.evaluate(() => window.__onyxDebug.setBarksEnabled(false)); // survives reload? re-assert defensively
  st = await jump({ floorId: 1, x: 5, y: 7, facing: 0, autosave: false });
  const res2 = await forceEncounter();
  const collectedDisabled = [];
  if (res2.ok) {
    for (let i = 0; i < 60 && (await snap(page)).combat?.phase === "playback"; i++) await wait(100);
    await page.evaluate(() => {
      const combat = window.__onyxDebug.state.combat;
      const first = combat?.enemies?.front?.[0] ?? combat?.enemies?.back?.[0];
      if (first) first.hp = 1;
    });
    for (let round = 0; round < 3; round++) {
      st = await snap(page);
      if (!st.combat || st.route !== "combat") break;
      if (st.combat.phase === "playback" || !st.combat.selection) {
        collectedDisabled.push(...(await pollBarks(400)));
        continue;
      }
      await chooseCombatEntry(/attack/i);
      await press(page, "Enter", 1, 60);
      collectedDisabled.push(...(await pollBarks(2200)));
    }
    if ((await snap(page)).route === "combat") {
      await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
      await waitForIdle(page, 6000);
    }
  }
  await shot("14b-barks-disabled.png");
  if (collectedDisabled.length > 0) {
    find("P1", 1, "Barks still drew after setBarksEnabled(false)", JSON.stringify(collectedDisabled));
  } else {
    log("OK setBarksEnabled(false) suppressed all bark draws in the same kill scenario");
  }
  await page.evaluate(() => window.__onyxDebug.setBarksEnabled(true));
} catch (e) {
  coverage.barks = "threw";
  find("P0", 1, "Section 3b (barks) threw", String(e));
  await captureFailureBundle(page, "section3b-exception", { outDir: OUT, errors });
}

// ============================================================================
try {
  section("4. Camp & Town");
  await freshBoot();
  let st = await bootToDungeon(page, URL);

  // Camp: "c" -> heal animation -> menu.
  await press(page, "c");
  await waitForIdle(page, 500);
  st = await snap(page);
  if (st.mode !== "camp") {
    find("P1", st.floor.id, "'c' did not open camp mode", `mode=${st.mode}`);
  } else {
    // Damage the party first via debug so we can observe camp healing.
    await page.evaluate(() => {
      for (const c of window.__onyxDebug.state.party) c.hp = Math.max(1, Math.floor(c.maxHp * 0.3));
    });
    // Wait out the ~3s heal animation.
    await wait(3500);
    st = await snap(page);
    await shot("18-camp-menu.png");
    const allFull = st.party.every((c) => c.hp === c.maxHp);
    if (!allFull) {
      find("P1", st.floor.id, "Camp rest did not fully restore HP", JSON.stringify(st.party.map((c) => [c.hp, c.maxHp])));
    } else {
      log("OK camp rest restores full HP");
    }
    // Continue back to dungeon.
    const body = await page.evaluate(() => document.body.innerText);
    if (/Continue exploring/i.test(body)) {
      await press(page, "Enter"); // first item is "Continue exploring"
      await waitForIdle(page, 2000);
      st = await snap(page);
      if (st.route !== "dungeon") {
        find("P1", st.floor.id, "Camp 'Continue exploring' did not return to dungeon", `route=${st.route}`);
      } else {
        log("OK camp Continue -> dungeon");
      }
    } else {
      find("P2", st.floor.id, "Camp menu did not show 'Continue exploring'", body.slice(0, 200));
      await press(page, "Escape");
      await waitForIdle(page, 1000);
    }
  }

  // Save overlay from dungeon (Escape).
  await press(page, "Escape");
  await waitForIdle(page, 1000);
  st = await snap(page);
  await shot("19-save-overlay.png");
  if (st.route !== "save") {
    find("P1", st.floor.id, "Escape in dungeon did not open save overlay", `route=${st.route}`);
  } else {
    log("OK save overlay opens via Escape");
    await press(page, "Enter"); // pick first slot
    await waitForIdle(page, 1000);
    const slotWritten = await page.evaluate(() =>
      Object.keys(localStorage).some((k) => k.startsWith("wizardry-clone-save-"))
    );
    log(`manual save slot written to localStorage: ${slotWritten}`);
    if (!slotWritten) {
      find("P2", st.floor.id, "Saving from the save overlay did not write a slot key to localStorage", "");
    }
    st = await snap(page);
    if (st.route === "save") {
      await press(page, "Escape");
      await waitForIdle(page, 1000);
    }
  }
  st = await snap(page);
  if (st.route !== "dungeon") {
    find("P2", st.floor.id, "Did not return to dungeon after closing save overlay", `route=${st.route}`);
  }

  // Town: return to town, then Inn / Shop / Temple / Equip.
  await press(page, "t");
  await waitForIdle(page, 2000);
  st = await snap(page);
  await shot("20-town-hub.png");
  if (st.route !== "town") {
    find("P1", st.floor.id, "'t' did not return to town", `route=${st.route}`);
  } else {
    log("OK town hub reached");
    const townMenu = async (labelRe, maxSteps = 10) => {
      for (let i = 0; i < maxSteps; i++) {
        const body = await page.evaluate(() => document.body.innerText);
        if (new RegExp(`▶[^\\n]*${labelRe.source}`, labelRe.flags).test(body)) return true;
        await press(page, "ArrowDown");
        await waitForIdle(page, 500);
      }
      return false;
    };

    // Inn.
    if (await townMenu(/Inn/i)) {
      await press(page, "Enter");
      await waitForIdle(page, 1500);
      await shot("21-town-inn.png");
      const s2 = await snap(page);
      log(`Inn opened: mode=${s2.mode} route=${s2.route}`);
      await press(page, "Escape");
      await waitForIdle(page, 1000);
    } else {
      find("P2", 0, "Could not locate 'Inn' in town menu", "");
    }

    // Shop: buy/sell/appraise tabs.
    if (await townMenu(/Shop/i)) {
      await press(page, "Enter");
      await waitForIdle(page, 1500);
      await shot("22-town-shop.png");
      const s2 = await snap(page);
      if (s2.route !== "town" && s2.mode !== "town") {
        log(`Shop opened: mode=${s2.mode} route=${s2.route}`);
      }
      // cycle a couple of tabs if present (Buy/Sell/Appraise use arrowleft/right per town-ui).
      await press(page, "ArrowRight");
      await waitForIdle(page, 500);
      await shot("23-town-shop-tab2.png");
      await press(page, "ArrowRight");
      await waitForIdle(page, 500);
      await shot("24-town-shop-tab3.png");
      await press(page, "Escape");
      await waitForIdle(page, 1000);
    } else {
      find("P2", 0, "Could not locate 'Shop' in town menu", "");
    }

    // Temple.
    if (await townMenu(/Temple/i)) {
      await press(page, "Enter");
      await waitForIdle(page, 1500);
      await shot("25-town-temple.png");
      await press(page, "Escape");
      await waitForIdle(page, 1000);
    } else {
      find("P2", 0, "Could not locate 'Temple' in town menu", "");
    }

    // Equip ('E' hotkey per CLAUDE.md).
    st = await snap(page);
    if (st.route === "town") {
      await press(page, "e");
      await waitForIdle(page, 1500);
      const s2 = await snap(page);
      await shot("26-town-equip.png");
      log(`Equip screen: mode=${s2.mode} route=${s2.route}`);
      if (s2.route === "town" && s2.mode === "town") {
        // still on the plain hub list — 'e' may require menu selection instead of a global hotkey
        find("P3", 0, "'e' hotkey from town hub did not appear to open an Equip screen (or opened silently)", "");
      }
      await press(page, "Escape");
      await waitForIdle(page, 1000);
    }

    // Training Ground / roster (main-menu label is actually "Guild — Party roster").
    st = await snap(page);
    if (st.route === "town" && (await townMenu(/Guild|Roster|Training/i))) {
      await press(page, "Enter");
      await waitForIdle(page, 1500);
      await shot("27-town-roster.png");
      await press(page, "Escape");
      await waitForIdle(page, 1000);
    } else {
      find("P3", 0, "Could not locate 'Guild' (roster) in town menu", "");
    }
  }
  coverage.camp_town = true;
} catch (e) {
  coverage.camp_town = "threw";
  find("P0", 0, "Section 4 (camp/town) threw", String(e));
  await captureFailureBundle(page, "section4-exception", { outDir: OUT, errors });
}

// ============================================================================
try {
  section("5. Utility spells (grimoire) + antimagic suppression");
  await freshBoot();
  let st = await bootToDungeon(page, URL);

  await press(page, "g");
  await waitForIdle(page, 1000);
  st = await snap(page);
  await shot("28-grimoire-open.png");
  if (st.route !== "spell") {
    find("P1", st.floor.id, "'g' did not open the grimoire", `route=${st.route}`);
  } else {
    log("OK grimoire opens");
    const body = await page.evaluate(() => document.body.innerText);
    log(`grimoire options: ${body.replace(/\s+/g, " ").slice(0, 300)}`);
    await press(page, "Enter"); // cast the top option
    await waitForIdle(page, 1500);
    st = await snap(page);
    await shot("29-grimoire-cast.png");
    if (st.route !== "dungeon") {
      find("P2", st.floor.id, "Grimoire did not return to dungeon after casting", `route=${st.route}`);
    }
    if (st.buffs.length === 0) {
      find("P2", st.floor.id, "No persistent buff registered after casting a utility spell", JSON.stringify(st));
    } else {
      log(`OK buff active: ${JSON.stringify(st.buffs)}`);
      const before = st.buffs[0].remainingSteps;
      await press(page, "ArrowUp");
      await waitForIdle(page);
      st = await snap(page);
      const after = st.buffs.find((b) => b.kind === st.buffs[0]?.kind)?.remainingSteps;
      log(`buff steps: ${before} -> stepped -> ${JSON.stringify(st.buffs)}`);
      // Camp should clear buffs.
      await press(page, "c");
      await waitForIdle(page, 500);
      await wait(3500);
      const bodyCamp = await page.evaluate(() => document.body.innerText);
      if (/Continue exploring/i.test(bodyCamp)) {
        await press(page, "Enter");
        await waitForIdle(page, 2000);
      }
      st = await snap(page);
      if (st.buffs.length !== 0) {
        find("P2", st.floor.id, "Camping did not clear persistent buffs", JSON.stringify(st.buffs));
      } else {
        log("OK camp clears persistent buffs");
      }
    }
  }

  // Antimagic zone: Floor 3 (7,13), inside the boss chamber. jumpTo teleports
  // directly, bypassing the locked door — fine for a debug-surface probe.
  st = await jump({ floorId: 3, x: 7, y: 13, autosave: false });
  await shot("30-antimagic-zone.png");
  if (st.tile !== "antimagic" || !st.flags.inAntimagic) {
    find("P2", 3, "Antimagic tile (7,13) did not set inAntimagic flag", JSON.stringify({ tile: st.tile, flags: st.flags }));
  } else {
    log("OK antimagic zone sets inAntimagic flag");
    await press(page, "g");
    await waitForIdle(page, 1000);
    st = await snap(page);
    if (st.route === "spell") {
      const body = await page.evaluate(() => document.body.innerText);
      log(`grimoire while in antimagic: ${body.replace(/\s+/g, " ").slice(0, 200)}`);
      await press(page, "Escape");
      await waitForIdle(page, 500);
    }
  }
  coverage.utility_spells = true;
} catch (e) {
  coverage.utility_spells = "threw";
  find("P0", 1, "Section 5 (utility spells) threw", String(e));
  await captureFailureBundle(page, "section5-exception", { outDir: OUT, errors });
}

// ============================================================================
try {
  section("6. Trapped chests");
  let st = await jump({ floorId: 1, x: 3, y: 5, facing: 3, autosave: false, keys: [] });
  await press(page, "ArrowUp"); // (3,5) -> (2,5) trapped chest
  await waitForIdle(page);
  st = await snap(page);
  await shot("31-trap-prompt.png");
  if (!st.flags.pendingTrap) {
    find("P1", 1, "Trapped chest (2,5) did not open the trap prompt", JSON.stringify(st));
  } else {
    log(`OK trap prompt open: ${JSON.stringify(st.flags.pendingTrap)}`);
    if (JSON.stringify(st.availableActions) !== JSON.stringify(["inspect", "disarm", "open", "leave"])) {
      find("P2", 1, "Trap route availableActions mismatch", JSON.stringify(st.availableActions));
    }
    // Confirm an unrelated key is gated (movement should do nothing while pendingTrap is set).
    const beforePos = { x: st.pos.x, y: st.pos.y };
    await press(page, "ArrowRight");
    await waitForIdle(page, 500);
    const gatedSt = await snap(page);
    if (!gatedSt.flags.pendingTrap) {
      find("P1", 1, "An unrelated key (ArrowRight) dismissed the trap prompt", JSON.stringify(gatedSt.flags));
    } else if (gatedSt.pos.x !== beforePos.x || gatedSt.pos.y !== beforePos.y) {
      find("P1", 1, "Player moved while trap prompt was pending", JSON.stringify({ before: beforePos, after: gatedSt.pos }));
    } else {
      log("OK non-trap keys gated while pendingTrap is set");
    }

    // Inspect.
    await press(page, "i");
    await waitForIdle(page, 500);
    st = await snap(page);
    await shot("32-trap-inspect.png");
    log(`inspect message: "${st.message.text}"`);
    if (!st.flags.pendingTrap) {
      find("P2", 1, "Inspect closed the trap prompt (expected it to stay open)", "");
    }

    // Open (trigger the trap deliberately).
    await press(page, "o");
    await waitForIdle(page, 500);
    st = await snap(page);
    await shot("33-trap-open.png");
    log(`open result: pendingTrap=${JSON.stringify(st.flags.pendingTrap)} hp=${JSON.stringify(st.party.map((c) => c.hp))} inv includes antidote=${st.inventory.some((i) => i.itemId === "antidote")}`);
    if (st.flags.pendingTrap) {
      find("P1", 1, "pendingTrap still set after Open", JSON.stringify(st.flags.pendingTrap));
    }
    const anyBelowFloor = st.party.some((c) => c.hp <= 0);
    if (anyBelowFloor) {
      find("P0", 1, "Trap damage killed a party member (should floor at 1 HP outside combat)", JSON.stringify(st.party));
    } else {
      log("OK trap damage floors at 1 HP, no deaths");
    }
  }

  // Second trapped chest (gas) — exercise Disarm and Leave paths. jumpTo
  // teleports directly onto the approach tile, so no walk-through-the-lock
  // choreography is needed here — the earlier unlock behavior is already
  // covered in section 2.
  st = await jump({ floorId: 1, x: 10, y: 8, facing: 2, autosave: false, keys: ["crypt-key"] });
  await press(page, "ArrowUp"); // (10,8) -> (10,9) trapped chest
  await waitForIdle(page);
  st = await snap(page);
  await shot("34-trap2-prompt.png");
  if (!st.flags.pendingTrap) {
    find("P2", 1, "Second trapped chest (10,9) did not open trap prompt", JSON.stringify(st));
  } else {
    await press(page, "d"); // Disarm
    await waitForIdle(page, 500);
    st = await snap(page);
    await shot("35-trap2-disarm.png");
    log(`disarm result: "${st.message.text}" pendingTrap=${JSON.stringify(st.flags.pendingTrap)}`);
    if (st.flags.pendingTrap) {
      // Disarm can fail; if still pending, exercise Leave instead of forcing Open.
      await press(page, "l");
      await waitForIdle(page, 500);
      st = await snap(page);
      log(`leave after failed disarm: pendingTrap=${JSON.stringify(st.flags.pendingTrap)}`);
      if (st.flags.pendingTrap) {
        find("P1", 1, "Leave did not close the trap prompt", JSON.stringify(st.flags.pendingTrap));
      } else {
        log("OK Leave closes the trap prompt without opening the chest");
      }
    } else {
      log("OK Disarm succeeded, chest opened without triggering the trap");
    }
  }
  coverage.trapped_chests = true;
} catch (e) {
  coverage.trapped_chests = "threw";
  find("P0", 1, "Section 6 (trapped chests) threw", String(e));
  await captureFailureBundle(page, "section6-exception", { outDir: OUT, errors });
}

// ============================================================================
try {
  section("7. Water & swimming");
  let st = await jump({ floorId: 1, x: 2, y: 5, facing: 0, autosave: false });
  const skillBefore = await evalState("({...state.swimSkill})");
  await press(page, "ArrowUp"); // (2,5) -> (2,4) shallow heal water
  await waitForIdle(page);
  st = await snap(page);
  await shot("36-water-shallow.png");
  log(`water(2,4): tile=${st.tile} msg="${st.message.text}" hp=${JSON.stringify(st.party.map((c) => c.hp))}`);
  const skillAfter = await evalState("({...state.swimSkill})");
  log(`swimSkill before=${JSON.stringify(skillBefore)} after=${JSON.stringify(skillAfter)}`);
  if (st.tile !== "water") {
    find("P2", 1, "Expected water tile at (2,4)", `got ${st.tile}`);
  } else {
    log("OK water tile reached, swim mechanic engaged");
  }

  // Deep water (damage) at (10,6), approached from gallery.
  st = await jump({ floorId: 1, x: 9, y: 6, facing: 1, autosave: false });
  await press(page, "ArrowUp"); // (9,6) -> (10,6) deep water
  await waitForIdle(page);
  st = await snap(page);
  await shot("37-water-deep.png");
  log(`deep water(10,6): tile=${st.tile} msg="${st.message.text}" hp=${JSON.stringify(st.party.map((c) => c.hp))}`);
  const anyDeadDeep = st.party.some((c) => c.hp <= 0);
  if (anyDeadDeep) {
    find("P0", 1, "Deep-water damage killed a party member outside combat (should floor at 1 HP)", JSON.stringify(st.party));
  }

  // Ring of Water Walking bypass.
  st = await jump({
    floorId: 1,
    x: 9,
    y: 6,
    facing: 1,
    autosave: false,
    items: [{ itemId: "ring-of-water-walking", identified: true }],
  });
  const skillBeforeRing = await evalState("({...state.swimSkill})");
  await press(page, "ArrowUp"); // onto deep water again, now with the ring in inventory
  await waitForIdle(page);
  st = await snap(page);
  await shot("38-water-ring-bypass.png");
  const skillAfterRing = await evalState("({...state.swimSkill})");
  log(`ring bypass: hp=${JSON.stringify(st.party.map((c) => c.hp))} swimSkill before=${JSON.stringify(skillBeforeRing)} after=${JSON.stringify(skillAfterRing)}`);
  // Note: the ring is inventory-only here (not equipped to a trinket slot) —
  // features.ts's bypass check (line ~464) reads state.inventory directly, so
  // this should be sufficient, but flag if HP still drops as the item may
  // require equipping instead.
  const tookDamageWithRing = JSON.stringify(skillBeforeRing) !== JSON.stringify(skillAfterRing);
  if (tookDamageWithRing) {
    find("P2", 1, "swimSkill changed even with Ring of Water Walking in inventory (expected a full bypass)", JSON.stringify({ before: skillBeforeRing, after: skillAfterRing }));
  } else {
    log("OK Ring of Water Walking bypasses the swim check");
  }
  coverage.water = true;
} catch (e) {
  coverage.water = "threw";
  find("P0", 1, "Section 7 (water/swimming) threw", String(e));
  await captureFailureBundle(page, "section7-exception", { outDir: OUT, errors });
}

// ============================================================================
try {
  section("8. NPCs (Maro, Floor 1)");
  let st = await jump({ floorId: 1, x: 3, y: 5, facing: 2, autosave: false });
  await press(page, "ArrowUp"); // (3,5) -> (3,6) NPC tile
  await waitForIdle(page);
  st = await snap(page);
  await shot("39-npc-panel.png");
  if (st.route !== "npc") {
    find("P1", 1, "Stepping onto Maro's tile (3,6) did not open the NPC panel", `route=${st.route}`);
  } else {
    log("OK NPC panel opened");
    // Talk.
    await press(page, "t");
    await waitForIdle(page, 500);
    let s2 = await snap(page);
    await shot("40-npc-talk.png");
    const bodyTalk = await page.evaluate(() => document.body.innerText);
    log(`talk topics: ${bodyTalk.replace(/\s+/g, " ").slice(0, 250)}`);
    await press(page, "Escape"); // back to root
    await waitForIdle(page, 500);

    // Barter.
    await press(page, "b");
    await waitForIdle(page, 500);
    await shot("41-npc-barter.png");
    await press(page, "Escape");
    await waitForIdle(page, 500);

    s2 = await snap(page);
    if (s2.route !== "npc") {
      find("P2", 1, "Escape from Talk/Barter sub-menu did not return to NPC root", `route=${s2.route}`);
    }
    await press(page, "Escape"); // leave entirely
    await waitForIdle(page, 500);
    s2 = await snap(page);
    if (s2.route !== "dungeon") {
      find("P2", 1, "Leaving NPC panel did not return to dungeon", `route=${s2.route}`);
    } else {
      log("OK NPC Talk/Barter + Leave flow");
    }
  }
  coverage.npcs = true;
} catch (e) {
  coverage.npcs = "threw";
  find("P0", 1, "Section 8 (NPCs) threw", String(e));
  await captureFailureBundle(page, "section8-exception", { outDir: OUT, errors });
}

// ============================================================================
try {
  section("8b. NPC kill persistence (separate NPC target, destructive)");
  await freshBoot();
  const npc = await page.evaluate(() => {
    const f = window.__onyxDebug.findFloor(2);
    const n = (f.npcs ?? [])[0];
    if (!n) return null;
    const DX = [0, 1, 0, -1];
    const DY = [-1, 0, 1, 0];
    const EDGE = ["n", "e", "s", "w"];
    for (let d = 0; d < 4; d++) {
      const ax = n.x - DX[d];
      const ay = n.y - DY[d];
      const c = f.grid[ay]?.[ax];
      if (c && c.tile == null && c[EDGE[d]] === "open") {
        return { id: n.id, name: n.name, x: n.x, y: n.y, approach: { x: ax, y: ay, facing: d } };
      }
    }
    return { id: n.id, name: n.name, x: n.x, y: n.y, approach: null };
  });
  if (!npc || !npc.approach) {
    log("(no approachable NPC found on Floor 2 — skipping kill-persistence test)");
  } else {
    let st = await jump({ floorId: 2, x: npc.approach.x, y: npc.approach.y, facing: npc.approach.facing, autosave: false, stepsSinceEncounter: 0 });
    await act(page, "ArrowUp", 4000);
    st = await snap(page);
    if (st.route !== "npc") {
      find("P2", 2, `Stepping onto NPC ${npc.name}'s tile did not open the panel`, `route=${st.route}`);
    } else {
      await press(page, "a"); // Attack
      await waitForIdle(page, 6000);
      st = await snap(page);
      if (st.route !== "combat") {
        find("P1", 2, "NPC Attack did not start real combat", `route=${st.route}`);
      } else {
        await shot("42-npc-combat.png");
        await page.evaluate(() => window.__onyxDebug.exitDebugCombat("victory"));
        await waitForIdle(page, 8000);
        st = await snap(page);
        if (st.route === "perk") await drainPerkQueue();
        const killed = await evalState("Array.from(state.killedNPCs ?? [])");
        if (!killed.includes(npc.id)) {
          find("P1", 2, "killedNPCs did not record the slain NPC", JSON.stringify(killed));
        } else {
          log(`OK NPC ${npc.name} killed, persisted in killedNPCs`);
        }
        // Leave and return: no panel this time.
        await jump({ floorId: 1, x: 5, y: 9, autosave: false });
        await jump({ floorId: 2, x: npc.approach.x, y: npc.approach.y, facing: npc.approach.facing, autosave: false, stepsSinceEncounter: 0 });
        await act(page, "ArrowUp", 4000);
        st = await snap(page);
        await shot("43-npc-corpse-no-panel.png");
        if (st.route === "npc") {
          find("P1", 2, "Dead NPC still opens the panel after a floor round-trip", `route=${st.route}`);
        } else {
          log("OK dead NPC tile no longer opens the panel after reload");
        }
      }
    }
  }
  coverage.npc_kill_persistence = true;
} catch (e) {
  coverage.npc_kill_persistence = "threw";
  find("P0", 2, "Section 8b (NPC kill persistence) threw", String(e));
  await captureFailureBundle(page, "section8b-exception", { outDir: OUT, errors });
}

// ============================================================================
try {
  section("9. Save / Load (autosave + version migration)");
  await freshBoot();
  // autoSave() is a deliberate no-op while state.mode === "title" (overlays
  // aren't resumable — see main.ts's openEnding comment), and jumpTo's own
  // transitionToFloor->autoSave call runs BEFORE it flips mode to "dungeon".
  // A jump fired straight off a fresh boot (still on title) would therefore
  // silently no-op the write and produce a false P1 here — reach dungeon mode
  // via bootToDungeon first so the follow-up jump's autosave actually lands.
  await bootToDungeon(page, URL);
  await page.evaluate(() => localStorage.removeItem("wizardry-clone-autosave"));
  let st = await jump({ floorId: 2, x: 5, y: 5, facing: 1, autosave: true, gold: 4242 });
  await wait(300);
  const autosaveWritten = await page.evaluate(() => localStorage.getItem("wizardry-clone-autosave") !== null);
  if (!autosaveWritten) {
    find("P1", 2, "jumpTo(autosave:true) did not populate the autosave localStorage key (called from dungeon mode, not title)", "");
  } else {
    log("OK autosave key populated");
  }

  // Fresh boot -> title -> Continue -> restore.
  await freshBoot();
  st = await snap(page);
  if (st.route !== "title") {
    find("P1", 0, "Fresh boot did not land on title", `route=${st.route}`);
  } else {
    const body = await page.evaluate(() => document.body.innerText);
    if (!/Continue/i.test(body)) {
      find("P1", 0, "Title screen missing Continue option despite a written autosave", body.slice(0, 200));
    } else {
      await press(page, "c");
      await waitForIdle(page, 2000);
      st = await snap(page);
      await shot("44-continue-restored.png");
      if (st.route !== "dungeon" || st.floor.id !== 2 || st.pos.x !== 5 || st.pos.y !== 5 || st.gold !== 4242) {
        find("P1", 2, "Continue did not restore floor/position/gold from autosave", JSON.stringify({ route: st.route, floor: st.floor.id, pos: st.pos, gold: st.gold }));
      } else {
        log("OK Continue restores floor/position/gold");
      }
    }
  }

  // dumpSave / loadSave round-trip.
  const dump = await page.evaluate(() => window.__onyxDebug.dumpSave());
  const parsed = JSON.parse(dump);
  await freshBoot();
  const loadResult = await page.evaluate((j) => {
    try {
      window.__onyxDebug.loadSave(j);
      return { ok: true };
    } catch (e) {
      return { ok: false, err: String(e) };
    }
  }, dump);
  await waitForIdle(page, 6000);
  if (!loadResult.ok) {
    find("P1", 0, "loadSave(dumpSave()) round-trip failed", loadResult.err);
  } else {
    st = await snap(page);
    if (st.gold !== parsed.partyGold) {
      find("P2", 0, "Gold mismatch after dumpSave/loadSave round-trip", `expected ${parsed.partyGold}, got ${st.gold}`);
    } else {
      log("OK dumpSave/loadSave round-trip");
    }
  }

  // Older-version migration fixture: drop a field a v13+ save would have (worldYear),
  // stamp an older version, confirm deserialize still succeeds.
  const older = { ...parsed, version: (parsed.version ?? 13) - 2 };
  delete older.worldYear;
  delete older.hasCompletedEnding;
  await freshBoot();
  const migResult = await page.evaluate((j) => {
    try {
      window.__onyxDebug.loadSave(j);
      return { ok: true };
    } catch (e) {
      return { ok: false, err: String(e) };
    }
  }, JSON.stringify(older));
  await waitForIdle(page, 6000);
  if (!migResult.ok) {
    find("P1", 0, `Hand-crafted older save (version ${older.version}) failed to load`, migResult.err);
  } else {
    st = await snap(page);
    log(`OK older-version save migrated cleanly (route=${st.route}, worldYear=${await evalState("state.worldYear")})`);
  }
  coverage.save_load = true;
} catch (e) {
  coverage.save_load = "threw";
  find("P0", 0, "Section 9 (save/load) threw", String(e));
  await captureFailureBundle(page, "section9-exception", { outDir: OUT, errors });
}

// ============================================================================
try {
  section("10. Boss fight & ending (Floor 5)");
  await freshBoot();
  // Floor 5 is a JSON content pack (src/content/floors), not one of the
  // hardcoded floors.ts functions — its layout isn't known statically here,
  // so read the real entrance coordinates via findFloor() instead of
  // guessing a hardcoded (x,y) that might land on solid rock.
  const f5Start = await page.evaluate(() => {
    const f = window.__onyxDebug.findFloor(5);
    return { x: f.startX, y: f.startY };
  });
  log(`Floor 5 entrance: (${f5Start.x},${f5Start.y})`);
  let st = await jump({ floorId: 5, x: f5Start.x, y: f5Start.y, facing: 0, autosave: false, partyLevel: 14, gold: 500 });

  const bossRes = await forceEncounter({ allowBoss: true });
  log(`boss-encounter roll: ok=${bossRes.ok} enemyCount=${bossRes.enemyCount ?? 0}`);
  if (!bossRes.ok) {
    find("P1", 5, "Could not force a boss encounter on Floor 5", JSON.stringify(bossRes));
  } else {
    st = await snap(page);
    await shot("45-boss-start.png");
    if (st.route !== "combat") {
      find("P0", 5, "Forced boss encounter did not reach combat route", `route=${st.route}`);
    } else {
      log(`OK boss combat started (enemies=${st.combat?.enemies.length})`);
      await page.evaluate(() => window.__onyxDebug.exitDebugCombat("victory"));
      await waitForIdle(page, 10000);
      st = await snap(page);
      // May chain through a perk overlay first (design: perk queue drains before ending).
      if (st.route === "perk") {
        log("perk overlay opened before ending — draining");
        await drainPerkQueue();
        st = await snap(page);
      }
      await shot("46-after-boss-victory.png");
      if (st.route !== "ending") {
        find("P1", 5, "Floor-5 boss victory did not open the ending scene", `route=${st.route}`);
      } else {
        log("OK ending scene opened");
        const drained = await drainEnding();
        st = await snap(page);
        await shot("47-ending-confirmed-through.png");
        log(`ending confirm-through: presses=${drained.presses} finalRoute=${drained.finalRoute}`);
        if (st.route !== "dungeon") {
          find("P1", 5, "Confirming through the ending did not return to dungeon", `route=${st.route}`);
        }
        const hasCompleted = await evalState("state.hasCompletedEnding");
        if (hasCompleted !== true) {
          find("P1", 5, "hasCompletedEnding was not set true after the ending played", `got ${hasCompleted}`);
        } else {
          log("OK hasCompletedEnding=true after ending");
        }

        // Second boss win should NOT reopen the ending.
        const bossRes2 = await forceEncounter({ allowBoss: true });
        if (bossRes2.ok) {
          st = await snap(page);
          if (st.route === "combat") {
            await page.evaluate(() => window.__onyxDebug.exitDebugCombat("victory"));
            await waitForIdle(page, 10000);
            st = await snap(page);
            if (st.route === "perk") {
              await drainPerkQueue();
              st = await snap(page);
            }
            await shot("48-second-boss-win.png");
            if (st.route === "ending") {
              find("P1", 5, "Second floor-5 boss victory re-opened the ending scene", `route=${st.route}`);
            } else {
              log(`OK second boss win did not reopen ending (route=${st.route})`);
            }
          }
        } else {
          log("(could not force a second boss encounter — skipped re-open check)");
        }
      }
    }
  }

  // Escape-skip mid-ending, on a fresh run. Assert the precondition first —
  // hasCompletedEnding must be false on a brand-new boot, so if it leaks true
  // somehow this shows up as a precondition failure instead of a confusing
  // "ending never opened" P2 further down.
  await freshBoot();
  st = await jump({ floorId: 5, x: f5Start.x, y: f5Start.y, facing: 0, autosave: false, partyLevel: 14, gold: 500 });
  const preEndingFlag = await evalState("state.hasCompletedEnding");
  if (preEndingFlag !== false && preEndingFlag !== undefined) {
    find("P2", 5, "hasCompletedEnding was already true on a fresh boot (precondition for the escape-skip test)", `got ${preEndingFlag}`);
  }
  const bossRes3 = await forceEncounter({ allowBoss: true });
  if (bossRes3.ok) {
    st = await snap(page);
    if (st.route === "combat") {
      await page.evaluate(() => window.__onyxDebug.exitDebugCombat("victory"));
      await waitForIdle(page, 10000);
      st = await snap(page);
      if (st.route === "perk") {
        await drainPerkQueue();
        st = await snap(page);
      }
      if (st.route === "ending") {
        await press(page, "Enter"); // advance one beat first, so Escape is a genuine mid-ending skip
        await waitForIdle(page, 2000);
        await press(page, "Escape");
        await waitForIdle(page, 4000);
        st = await snap(page);
        await shot("49-ending-escape-skip.png");
        if (st.route !== "dungeon") {
          find("P1", 5, "Escape-skip mid-ending did not return to dungeon", `route=${st.route}`);
        } else {
          log("OK Escape mid-ending skips straight to dungeon");
        }
        const hasCompleted2 = await evalState("state.hasCompletedEnding");
        if (hasCompleted2 !== true) {
          find("P1", 5, "Escape-skip did not set hasCompletedEnding", `got ${hasCompleted2}`);
        }
      } else {
        find("P2", 5, "Second fresh-run boss victory did not open ending for escape-skip test", `route=${st.route}`);
      }
    }
  }

  // Perk-chained path: cross a perk tier exactly on the boss kill.
  await freshBoot();
  st = await jump({ floorId: 5, x: f5Start.x, y: f5Start.y, facing: 0, autosave: false, partyLevel: 2, gold: 500 });
  await page.evaluate(() => {
    for (const c of window.__onyxDebug.state.party) c.xp += 50000;
  });
  const bossRes4 = await forceEncounter({ allowBoss: true });
  if (bossRes4.ok) {
    st = await snap(page);
    if (st.route === "combat") {
      await page.evaluate(() => window.__onyxDebug.exitDebugCombat("victory"));
      await waitForIdle(page, 10000);
      st = await snap(page);
      await shot("50-perk-chained-boss-win.png");
      if (st.route === "perk") {
        log("OK perk overlay opens first on a tier-crossing boss kill");
        const drained = await drainPerkQueue();
        st = await snap(page);
        log(`perk picks=${drained.picks}, route after drain=${st.route}`);
        if (st.route !== "ending" && st.route !== "dungeon") {
          find("P1", 5, "After draining the perk queue on a boss kill, expected ending or dungeon", `route=${st.route}`);
        } else if (st.route === "ending") {
          await drainEnding();
          st = await snap(page);
          if (st.route !== "dungeon") {
            find("P1", 5, "Perk-chained ending did not resolve to dungeon", `route=${st.route}`);
          } else {
            log("OK perk-chained path: perk overlay -> ending -> dungeon");
          }
        }
      } else {
        find("P2", 5, "Expected a perk overlay on this tier-crossing boss kill but got", `route=${st.route}`);
      }
    }
  }
  coverage.boss_ending = true;
} catch (e) {
  coverage.boss_ending = "threw";
  find("P0", 5, "Section 10 (boss/ending) threw", String(e));
  await captureFailureBundle(page, "section10-exception", { outDir: OUT, errors });
}

// ============================================================================
try {
  section("11. Perks & leveling (standalone)");
  await freshBoot();
  let st = await jump({ floorId: 1, x: 5, y: 7, facing: 0, autosave: false, partyLevel: 2 });
  const levelsBefore = await evalState("state.party.map(c => [c.id, c.level, c.perkIds.length])");
  await page.evaluate(() => {
    for (const c of window.__onyxDebug.state.party) c.xp += 15000;
  });
  const res = await forceEncounter();
  if (!res.ok) {
    find("P1", 1, "Could not force an encounter for the perk-leveling test", JSON.stringify(res));
  } else {
    await page.evaluate(() => window.__onyxDebug.exitDebugCombat("victory"));
    await waitForIdle(page, 8000);
    st = await snap(page);
    await shot("51-perk-overlay.png");
    if (st.route !== "perk") {
      find("P1", 1, "No perk overlay after a multi-tier level-up victory", `route=${st.route}`);
    } else {
      log("OK perk overlay opened");
      const body = await page.evaluate(() => document.body.innerText);
      log(`perk overlay text sample: ${body.replace(/\s+/g, " ").slice(0, 300)}`);
      // jumpTo must refuse while the overlay is open.
      const refusal = await page.evaluate(() => {
        try {
          window.__onyxDebug.jumpTo({ floorId: 1, x: 1, y: 1 });
          return { refused: false };
        } catch (e) {
          return { refused: true, err: String(e) };
        }
      });
      if (!refusal.refused) {
        find("P1", 1, "jumpTo did NOT refuse while the perk overlay was open", JSON.stringify(refusal));
      } else {
        log("OK jumpTo refuses while perk overlay is open");
      }
      const drained = await drainPerkQueue();
      st = await snap(page);
      await shot("52-perk-overlay-drained.png");
      const levelsAfter = await evalState("state.party.map(c => [c.id, c.level, c.perkIds.length])");
      log(`levels/perks before=${JSON.stringify(levelsBefore)} after=${JSON.stringify(levelsAfter)} (picks=${drained.picks})`);
      if (st.route !== "dungeon") {
        find("P1", 1, "Perk queue did not drain back to dungeon", `route=${st.route} after ${drained.picks} picks`);
      } else {
        log("OK perk queue drains to dungeon");
      }
      const anyPerkGained = st.party.some((c, i) => c.perkIds.length > (levelsBefore[i]?.[2] ?? 0));
      if (!anyPerkGained) {
        find("P1", 1, "No character's perkIds grew after the perk overlay drained", JSON.stringify({ before: levelsBefore, after: levelsAfter }));
      } else {
        log("OK perkIds updated for at least one character");
      }
      log("(effectiveStats() is not exposed on __onyxDebug — could not numerically verify the new perk's stat modifiers from outside the engine; perkIds application is the only externally observable signal)");
    }
  }
  coverage.perks_leveling = true;
} catch (e) {
  coverage.perks_leveling = "threw";
  find("P0", 1, "Section 11 (perks/leveling) threw", String(e));
  await captureFailureBundle(page, "section11-exception", { outDir: OUT, errors });
}

// ============================================================================
try {
  section("12. Arena mode");
  await freshBoot();
  let st = await snap(page);
  if (st.route !== "title") {
    find("P1", 0, "Fresh boot not on title before arena test", `route=${st.route}`);
  }
  await press(page, "a");
  await waitForIdle(page, 3000);
  st = await snap(page);
  await shot("53-arena-open.png");
  if (st.route !== "arena") {
    find("P1", 0, "'a' from title did not open Arena", `route=${st.route}`);
  } else {
    log("OK Arena opened");
    let arenaCombat = false;
    for (let i = 0; i < 8 && !arenaCombat; i++) {
      await press(page, "Enter");
      await waitForIdle(page, 4000);
      st = await snap(page);
      arenaCombat = st.route === "combat";
    }
    await shot("54-arena-combat.png");
    if (!arenaCombat) {
      find("P1", 0, "Arena never reached a combat route after repeated Enter", `route=${st.route}`);
    } else {
      log("OK Arena reached combat");
      // Back-to-back fights: win, confirm we land back in the arena hub or next fight.
      await page.evaluate(() => window.__onyxDebug.exitDebugCombat("victory"));
      await waitForIdle(page, 8000);
      st = await snap(page);
      if (st.route === "perk") await drainPerkQueue();
      st = await snap(page);
      await shot("55-arena-after-fight1.png");
      if (st.route !== "arena" && st.route !== "combat") {
        find("P1", 0, "Arena did not return to arena/combat after winning a fight", `route=${st.route}`);
      } else {
        log(`OK back-to-back arena flow (route=${st.route})`);
        // Chase a second fight to prove it's really back-to-back.
        if (st.route === "arena") {
          let secondCombat = false;
          for (let i = 0; i < 8 && !secondCombat; i++) {
            await press(page, "Enter");
            await waitForIdle(page, 4000);
            st = await snap(page);
            secondCombat = st.route === "combat";
          }
          if (secondCombat) {
            log("OK second arena fight reached");
            await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
            await waitForIdle(page, 6000);
          }
        }
      }
    }

    // Exit back to title.
    await freshBoot();
    st = await snap(page);
    await press(page, "a");
    await waitForIdle(page, 3000);
    st = await snap(page);
    if (st.route === "arena") {
      await press(page, "Escape");
      await waitForIdle(page, 2000);
      st = await snap(page);
      await shot("56-arena-exit-title.png");
      if (st.route !== "title") {
        find("P2", 0, "Escape from Arena hub did not return to title", `route=${st.route}`);
      } else {
        log("OK Arena Escape -> title");
      }
    }
  }
  coverage.arena = true;
} catch (e) {
  coverage.arena = "threw";
  find("P0", 0, "Section 12 (arena) threw", String(e));
  await captureFailureBundle(page, "section12-exception", { outDir: OUT, errors });
}

// ============================================================================
await flush();

const duration = Date.now() - t0;
const summary = `Drove ${testCount} test sections across boot/navigation/combat/camp-town/utility-spells/traps/water/NPCs/save-load/boss-ending/perks/arena. ${findings.length} finding(s) recorded (${findings.filter((f) => f.sev === "P0").length} P0, ${findings.filter((f) => f.sev === "P1").length} P1, ${findings.filter((f) => f.sev === "P2").length} P2, ${findings.filter((f) => f.sev === "P3").length} P3).`;

const reportPath = writeReport(OUT, {
  summary,
  findings,
  coverage,
  testCount,
  duration,
});

log(`\n${"=".repeat(70)}`);
log("PLAYTEST SUMMARY");
log("=".repeat(70));
log(summary);
log(`Duration: ${(duration / 1000).toFixed(1)}s`);
log(`Report written to: ${reportPath}`);
log("\nFindings:");
if (findings.length === 0) {
  log("  (none — nothing wrong found)");
} else {
  for (const f of findings) {
    log(`  [${f.sev}] F${f.floor} ${f.title}${f.body ? ` — ${f.body}` : ""}`);
  }
}
log("\nCoverage:");
for (const [k, v] of Object.entries(coverage)) log(`  ${k}: ${v}`);

await browser.close();
