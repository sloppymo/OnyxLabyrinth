/**
 * Natural Floors 1–3 attrition/recovery measurement.
 *
 * This driver deliberately uses the fixed Old Man + Rat King duo, movement,
 * doors, traps, stairs, and combat. It does not call jumpTo(), mutate state, inject
 * inventory, or force combat outcomes. Set POLICY=tactical for the competent
 * player pass; the default POLICY=auto uses attack-first Auto.
 *
 * Run against a production preview:
 *   ONYX_URL=http://127.0.0.1:5177/OnyxLabyrinth/?debug=1 \
 *   SEEDS=101,202 node scripts/playtests/attrition-recovery-audit.mjs
 */
import fs from "node:fs";
import path from "node:path";
import {
  launch,
  wait,
  press,
  snap,
  waitForIdle,
  ensureOutDir,
} from "./lib.mjs";

const URL = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const SEEDS = (process.env.SEEDS ?? "101").split(",").map((s) => Number(s.trim())).filter(Number.isFinite);
const MAX_CAMPAIGN_STEPS = Number(process.env.MAX_CAMPAIGN_STEPS ?? 16000);
const MAX_WIPES = Number(process.env.MAX_WIPES ?? 5);
const OUT = ensureOutDir("playtest-screenshots/2026-08-13-attrition-recovery");
const TRACE = process.env.TRACE === "1";
const POLICY = process.env.POLICY ?? "auto";

const RUNS = [{ id: "fixed-duo" }].filter(
  (run) => !process.env.ONLY || process.env.ONLY.split(",").includes(run.id),
);

const DIRS = [
  { dx: 0, dy: -1, edge: "n", key: "ArrowUp", turn: "ArrowUp" },
  { dx: 1, dy: 0, edge: "e", key: "ArrowUp", turn: "ArrowRight" },
  { dx: 0, dy: 1, edge: "s", key: "ArrowUp", turn: "ArrowRight" },
  { dx: -1, dy: 0, edge: "w", key: "ArrowUp", turn: "ArrowLeft" },
];
const OPPOSITE_EDGE = ["s", "w", "n", "e"];
const OPEN_EDGES = new Set(["open", "door"]);

function posKey(x, y) {
  return `${x},${y}`;
}

function samePos(a, b) {
  return a.floorId === b.floorId && a.x === b.x && a.y === b.y;
}

async function readWorld(page) {
  return page.evaluate(() => {
    const debug = window.__onyxDebug;
    const snapshot = debug.snapshot();
    const state = debug.state;
    return {
      route: snapshot.route,
      floorId: state.floor.id,
      floor: {
        id: state.floor.id,
        width: state.floor.width,
        height: state.floor.height,
        startX: state.floor.startX,
        startY: state.floor.startY,
        grid: state.floor.grid,
      },
      x: state.player.x,
      y: state.player.y,
      facing: state.player.facing,
      keys: [...state.keys],
      pendingClimax: state.pendingClimax ?? null,
      lastDungeon: state.lastDungeon ? { ...state.lastDungeon } : null,
    };
  });
}

function pathTo(world, target) {
  if (world.floorId !== target.floorId) return null;
  const start = [world.x, world.y];
  const queue = [start];
  const seen = new Set([posKey(...start)]);
  const previous = new Map();

  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    if (x === target.x && y === target.y) {
      const path = [];
      let cursor = posKey(x, y);
      while (previous.has(cursor)) {
        const entry = previous.get(cursor);
        path.push(entry.direction);
        cursor = entry.previous;
      }
      return path.reverse();
    }
    const cell = world.floor.grid[y]?.[x];
    if (!cell) continue;
    for (let direction = 0; direction < DIRS.length; direction++) {
      const spec = DIRS[direction];
      const nx = x + spec.dx;
      const ny = y + spec.dy;
      const next = world.floor.grid[ny]?.[nx];
      if (!next || next.void) continue;
      if (!OPEN_EDGES.has(cell[spec.edge]) || !OPEN_EDGES.has(next[OPPOSITE_EDGE[direction]])) continue;
      const key = posKey(nx, ny);
      if (seen.has(key)) continue;
      seen.add(key);
      previous.set(key, { previous: posKey(x, y), direction });
      queue.push([nx, ny]);
    }
  }
  return null;
}

async function waitForRoute(page, route, timeout = 10000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const current = await snap(page);
    if (current.route === route) return current;
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for route ${route}; got ${current.route}`);
    await wait(50);
  }
}

async function face(page, direction) {
  let world = await readWorld(page);
  let delta = (direction - world.facing + 4) % 4;
  if (delta === 3) {
    await press(page, "ArrowLeft", 1, 40);
  } else if (delta === 1) {
    await press(page, "ArrowRight", 1, 40);
  } else if (delta === 2) {
    await press(page, "ArrowRight", 2, 40);
  }
}

async function restAtTown(page) {
  for (let i = 0; i < 24; i++) {
    const current = await snap(page);
    if (current.route !== "town") {
      await wait(100);
      continue;
    }
    const body = await page.evaluate(() => document.body.innerText);
    if (/Nobody here gets older/i.test(body)) {
      await press(page, "Enter");
      await wait(250);
      return snap(page);
    }
    // The [I] town hotkey selects the Inn independently of the cursor. Retry
    // is harmless if the first key is swallowed by justOpenedTown; once the
    // Inn screen is visible, its unique flavor line takes the branch above.
    await press(page, "i");
    await wait(180);
  }
  throw new Error("Could not use the town Inn after wipe");
}

async function townToDungeon(page, { rest = false } = {}) {
  if (rest) await restAtTown(page);
  for (let i = 0; i < 16; i++) {
    const current = await snap(page);
    if (current.route === "dungeon") return current;
    if (current.route !== "town") {
      await handleRoute(page);
      continue;
    }
    const body = await page.evaluate(() => document.body.innerText);
    if (/▶\s*Enter Dungeon/i.test(body)) {
      await press(page, "Enter");
      await waitForIdle(page, 5000);
    } else {
      // Town uses a horizontal FF6 menu; the action-ring/controller adapter
      // maps `>` to the menu's right movement.
      await press(page, ">");
    }
  }
  throw new Error(`Could not return from town: ${(await snap(page)).route}`);
}

async function resolvePerks(page) {
  for (let i = 0; i < 32; i++) {
    const current = await snap(page);
    if (current.route !== "perk") return current;
    // Perk selection requires deliberate card movement before Enter. If the
    // first right is swallowed by the overlay-open guard, the next loop's
    // right+Enter pair completes that same choice.
    await press(page, "ArrowRight", 1, 70);
    await press(page, "Enter", 1, 120);
    await wait(120);
  }
  throw new Error("Perk queue did not close");
}

async function selectEntry(page, wantedIndex) {
  const current = await snap(page);
  const selection = current.combat?.selection;
  if (!selection || selection.entries.length === 0) return false;
  const len = selection.entries.length;
  const index = Math.max(0, Math.min(wantedIndex, len - 1));
  const down = (index - selection.index + len) % len;
  if (down > 0) await press(page, "ArrowDown", down, 0);
  await press(page, "Enter", 1, 0);
  return true;
}

async function spellDefs(page, actor) {
  return page.evaluate((ids) => ids.map((id) => {
    const spell = window.__onyxDebug.SPELLS_BY_ID[id];
    return spell ? {
      id: spell.id,
      name: spell.name,
      target: spell.target,
      spCost: spell.spCost,
      effect: spell.effect,
    } : null;
  }).filter(Boolean), actor.knownSpellIds ?? []);
}

function partyHpRatio(member) {
  return member.maxHp > 0 ? member.hp / member.maxHp : 0;
}

async function chooseTacticalAction(page, current, tactical) {
  const combat = current.combat;
  const actor = combat?.party?.find((member) => member.id === combat.actingCharId);
  if (!combat || !actor) {
    await press(page, "Enter", 1, 0);
    return;
  }

  const allies = combat.party ?? [];
  const enemies = combat.enemies.filter((enemy) => enemy.hp > 0);
  const wounded = allies
    .filter((member) => member.hp > 0 && partyHpRatio(member) < 0.68)
    .sort((a, b) => partyHpRatio(a) - partyHpRatio(b));
  const criticallyWounded = wounded.filter((member) => partyHpRatio(member) < 0.42);
  const inventory = combat.inventory ?? {};
  const potionId = inventory["greater-healing-potion"] > 0
    ? "greater-healing-potion"
    : inventory["healing-potion"] > 0
      ? "healing-potion"
      : null;
  const defs = await spellDefs(page, actor);
  const affordable = defs.filter((spell) => spell.spCost <= actor.sp);
  const spellsBy = (predicate) => affordable.filter(predicate).sort((a, b) => (b.effect.power ?? 0) - (a.effect.power ?? 0));
  const healSingle = spellsBy((spell) => spell.effect.kind === "heal" && spell.target === "singleAlly")[0];
  const healGroup = spellsBy((spell) => spell.effect.kind === "heal" && (spell.target === "groupAllies" || spell.target === "allAllies"))[0];
  const groupDamage = spellsBy((spell) => spell.effect.kind === "damage" && (spell.target === "groupEnemies" || spell.target === "allEnemies"))[0];
  const singleDamage = spellsBy((spell) => spell.effect.kind === "damage" && spell.target === "singleEnemy")[0];
  const bless = affordable.find((spell) => spell.id === "priest-bless");
  const screen = spellsBy((spell) => spell.effect.kind === "magicScreen" && spell.target === "allAllies")[0];
  const isBoss = enemies.some((enemy) => enemy.id.includes("headmasters-echo") || enemy.id.includes("remnant") || enemy.id.includes("ascendant"));

  // Spend a potion only when a KO is plausible, not for ordinary chip.
  if (potionId && criticallyWounded.length > 0) {
    await press(page, "i", 1, 0);
    await wait(40);
    const itemView = await snap(page);
    const itemIndex = itemView.combat?.selection?.entries.findIndex((entry) => entry.toLowerCase().includes(potionId.replaceAll("-", " "))) ?? -1;
    if (itemIndex >= 0 && await selectEntry(page, itemIndex)) {
      await wait(40);
      const targetView = await snap(page);
      const targetIndex = targetView.combat?.selection?.entries.findIndex((entry) => entry.startsWith(criticallyWounded[0].name)) ?? 0;
      await selectEntry(page, Math.max(0, targetIndex));
      tactical.itemsUsed++;
      return;
    }
  }

  if (actor.class === "Priest" && wounded.length > 0 && (healGroup && wounded.length >= 2 || healSingle)) {
    const spell = healGroup && wounded.length >= 2 ? healGroup : healSingle;
    await press(page, "s", 1, 0);
    await wait(40);
    const spellView = await snap(page);
    const spellIndex = spellView.combat?.selection?.entries.findIndex((entry) => entry.startsWith(spell.name)) ?? -1;
    if (spellIndex >= 0 && await selectEntry(page, spellIndex)) {
      await wait(40);
      if (spell.target === "singleAlly") {
        const targetView = await snap(page);
        const targetIndex = targetView.combat?.selection?.entries.findIndex((entry) => entry.startsWith(wounded[0].name)) ?? 0;
        await selectEntry(page, Math.max(0, targetIndex));
      }
      return;
    }
  }

  // One defensive layer on large fights, then keep SP for recovery/offense.
  if (!tactical.blessUsed && actor.class === "Priest" && bless && enemies.length >= 3) {
    await press(page, "s", 1, 0);
    await wait(40);
    const spellView = await snap(page);
    const spellIndex = spellView.combat?.selection?.entries.findIndex((entry) => entry.startsWith(bless.name)) ?? -1;
    if (spellIndex >= 0 && await selectEntry(page, spellIndex)) {
      tactical.blessUsed = true;
      return;
    }
  }
  if (!tactical.screenUsed && actor.class === "Mage" && screen && (isBoss || enemies.length >= 4)) {
    await press(page, "s", 1, 0);
    await wait(40);
    const spellView = await snap(page);
    const spellIndex = spellView.combat?.selection?.entries.findIndex((entry) => entry.startsWith(screen.name)) ?? -1;
    if (spellIndex >= 0 && await selectEntry(page, spellIndex)) {
      tactical.screenUsed = true;
      return;
    }
  }

  // Area offense is reserved for a meaningful target count and enough SP to
  // still heal later. Single-target magic is similarly conserved on trash.
  if (actor.class === "Mage" && groupDamage && (enemies.length >= 3 || isBoss) && actor.sp / Math.max(1, actor.maxSp) > 0.32) {
    await press(page, "s", 1, 0);
    await wait(40);
    const spellView = await snap(page);
    const spellIndex = spellView.combat?.selection?.entries.findIndex((entry) => entry.startsWith(groupDamage.name)) ?? -1;
    if (spellIndex >= 0 && await selectEntry(page, spellIndex)) return;
  }
  if (actor.class === "Mage" && singleDamage && actor.sp / Math.max(1, actor.maxSp) > (isBoss ? 0.18 : 0.4)) {
    await press(page, "s", 1, 0);
    await wait(40);
    const spellView = await snap(page);
    const spellIndex = spellView.combat?.selection?.entries.findIndex((entry) => entry.startsWith(singleDamage.name)) ?? -1;
    if (spellIndex >= 0 && await selectEntry(page, spellIndex)) {
      await wait(40);
      const targetView = await snap(page);
      const live = targetView.combat?.enemies.filter((enemy) => enemy.hp > 0) ?? [];
      const target = live.reduce((best, enemy) => !best || enemy.hp < best.hp ? enemy : best, null);
      const targetIndex = targetView.combat?.selection?.entries.findIndex((entry) => entry.startsWith(target?.name ?? "")) ?? 0;
      await selectEntry(page, Math.max(0, targetIndex));
      return;
    }
  }

  // A competent player can leave a non-boss fight when the party is already
  // functionally gone. Bosses remain intentionally inescapable.
  const living = allies.filter((member) => member.hp > 0);
  if (!isBoss && living.length <= 1 && living[0] && partyHpRatio(living[0]) < 0.24) {
    await press(page, "r", 1, 0);
    return;
  }
  await press(page, "Enter", 1, 0);
}

async function runCombat(page, label, runState) {
  if (TRACE) console.log(`  combat start (${label})`);
  let autoEnabled = false;
  let fastEnabled = false;
  const tactical = { blessUsed: false, screenUsed: false, itemsUsed: 0 };
  for (let i = 0; i < 12000; i++) {
    const current = await snap(page);
    if (TRACE && i % 50 === 0) {
      console.log(`    combat tick ${i} phase=${current.combat?.phase ?? "none"} round=${current.combat?.round ?? "none"}`);
    }
    if (current.route !== "combat") {
      if (TRACE) console.log(`  combat end route=${current.route} result=${current.combat?.result ?? "none"}`);
      if (current.route === "perk") return resolvePerks(page);
      if (current.route === "game_over") {
        runState.wipes++;
        if (runState.wipes > MAX_WIPES) {
          throw new Error(`Natural run exceeded wipe budget (${MAX_WIPES})`);
        }
        await wait(300);
        await press(page, "Enter");
        await wait(300);
        return townToDungeon(page, { rest: true });
      }
      return current;
    }
    const phase = current.combat?.phase;
    if (phase === "playback") {
      if (!fastEnabled) {
        await press(page, "Tab", 1, 0);
        fastEnabled = true;
      }
      // Skip only visual choreography. Resolution still runs through the
      // normal controller/combat API and remains fully audited.
      // Escape is the keyboard-specific playback skip and is intercepted
      // before the generic controller map, so it remains reliable even while
      // the Phaser stage is between choreography frames.
      await press(page, "Escape", 1, 0);
    } else if (phase === "palette") {
      if (POLICY === "tactical") {
        await chooseTacticalAction(page, current, tactical);
      } else {
        await press(page, "q", 1, 0);
        autoEnabled = true;
      }
    } else if (phase === "selectTarget" || phase === "selectSpell" || phase === "selectItem") {
      // Auto normally resolves directly. Enter is a defensive fallback for a
      // palette selection that opened a target sheet before Auto was enabled.
      await press(page, "Enter", 1, 0);
    } else if (phase === "result") {
      await press(page, "Enter", 1, 120);
      await wait(100);
    } else {
      await wait(35);
    }
  }
  throw new Error(`Combat did not resolve (${label})`);
}

async function handleTrap(page) {
  const state = await page.evaluate(() => ({
    pending: window.__onyxDebug.state.pendingTrap,
    climax: window.__onyxDebug.state.pendingClimax ?? null,
  }));
  if (state.climax) {
    await press(page, "o", 1, 120);
  } else {
    // Use the normal disarm choice first. If it fails, open the chest rather
    // than turning this measurement into a decision-tree audit.
    await press(page, "d", 1, 150);
    if ((await snap(page)).route === "trap") await press(page, "o", 1, 150);
  }
}

async function handleDialog(page) {
  for (let i = 0; i < 16; i++) {
    const current = await snap(page);
    if (current.route !== "dialog") return current;
    await press(page, "Enter", 1, 120);
  }
  throw new Error("Dungeon dialog did not close");
}

async function handleRoute(page, runState = { wipes: 0 }) {
  for (let i = 0; i < 40; i++) {
    const current = await snap(page);
    if (current.route === "dungeon") return current;
    if (current.route === "combat") return runCombat(page, "route", runState);
    if (current.route === "perk") return resolvePerks(page);
    if (current.route === "trap") {
      await handleTrap(page);
      continue;
    }
    if (current.route === "dialog") {
      await handleDialog(page);
      continue;
    }
    if (current.route === "npc" || current.route === "tavern" || current.route === "namanda") {
      await press(page, "Escape", 1, 150);
      continue;
    }
    if (current.route === "game_over") {
      runState.wipes++;
      await wait(300);
      await press(page, "Enter", 1, 300);
      continue;
    }
    if (current.route === "town") return townToDungeon(page);
    if (current.route === "title") {
      await press(page, "Escape", 1, 150);
      continue;
    }
    await press(page, "Enter", 1, 150);
  }
  throw new Error(`Unhandled route ${ (await snap(page)).route }`);
}

async function stepDirection(page, direction, runState) {
  // A previous corridor tween may still own the input gate even after the
  // logical position changed. Wait for that gate before issuing the next
  // physical step; otherwise a blocked press can look like a completed final
  // step to the route planner.
  for (let i = 0; i < 60; i++) {
    if (await page.evaluate(() => window.__onyxDebug.isIdle())) break;
    await wait(35);
  }
  const before = await readWorld(page);
  await face(page, direction);
  await press(page, "ArrowUp", 1, 0);
  for (let i = 0; i < 180; i++) {
    const current = await snap(page);
    if (current.route !== "dungeon") {
      await handleRoute(page, runState);
      return { moved: true, special: true };
    }
    if (current.pos.x !== before.x || current.pos.y !== before.y) {
      await wait(220);
      await handleRoute(page, runState);
      return { moved: true, special: false };
    }
    if (current.idle) return current;
    await wait(35);
  }
  // A blocked step is not a valid path; let the caller recompute and fail
  // with the exact position if the authored geometry disagrees with the map.
  return { moved: false, special: false };
}

async function goTo(page, target, runState) {
  for (let i = 0; i < MAX_CAMPAIGN_STEPS; i++) {
    const world = await readWorld(page);
    if (world.floorId !== target.floorId) return world;
    if (world.x === target.x && world.y === target.y) return world;
    const path = pathTo(world, target);
    if (!path || path.length === 0) {
      throw new Error(`No natural path on F${world.floorId} from ${world.x},${world.y} to ${target.x},${target.y}`);
    }
    const finalStep = path.length === 1;
    const wipesBefore = runState.wipes;
    const outcome = await stepDirection(page, path[0], runState);
    // Feature handlers can move the party as part of the same final step
    // (notably the confirmed chute and teleporter traps). The destination
    // action has completed; do not try to path back to the authored tile.
    if (finalStep && (outcome.special || outcome.moved)) {
      const after = await readWorld(page);
      // A wipe sends the party to town/start, so a special final step that
      // ended in game-over must be retried instead of being mistaken for
      // arrival at the target climax tile.
      if (runState.wipes === wipesBefore || samePos(after, target)) return after;
    }
  }
  throw new Error(`Movement budget exceeded reaching F${target.floorId} ${target.x},${target.y}`);
}

async function unlockAt(page, target, direction, runState) {
  await goTo(page, target, runState);
  if (TRACE) {
    const before = await readWorld(page);
    console.log(`  unlock standing pos=${before.x},${before.y} facing=${before.facing} keys=${before.keys.join(",")} edge=${before.floor.grid[target.y]?.[target.x]?.[DIRS[direction].edge]}`);
  }
  await face(page, direction);
  if (TRACE) console.log(`  unlock attempt F${target.floorId} ${target.x},${target.y} dir=${direction}`);
  await press(page, "u", 1, 180);
  await handleRoute(page, runState);
  if (TRACE) {
    const after = await readWorld(page);
    console.log(`  unlock result pos=${after.x},${after.y} keys=${after.keys.join(",")} edge=${after.floor.grid[target.y]?.[target.x]?.[DIRS[direction].edge]}`);
  }
}

async function bootNatural(page, seed) {
  await page.goto(URL, { waitUntil: "networkidle" });
  await wait(400);
  await page.evaluate((value) => {
    window.__onyxDebug.setGameplayRng(window.__onyxDebug.createSeededRng(value));
    window.__onyxDebug.combatAudit.clear();
  }, seed);

  for (let i = 0; i < 80; i++) {
    const current = await snap(page);
    if (current.route === "dungeon") return current;
    if (current.route === "title") {
      await press(page, "n", 1, 250);
    } else if (current.route === "prologue") {
      await press(page, "Escape", 1, 250);
    } else if (current.route === "town") {
      await townToDungeon(page);
    } else {
      await handleRoute(page);
    }
  }
  throw new Error("Natural boot failed for fixed duo");
}

async function captureCapstone(page, runId, floorId) {
  const file = path.join(OUT, `${runId}-f${floorId}-capstone.png`);
  await page.screenshot({ path: file });
  return file;
}

async function runCampaign(run, seed) {
  const runId = `${run.id}-seed-${seed}`;
  const runState = { wipes: 0 };
  const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
  const result = {
    runId,
    run: run.id,
    seed,
    completed: false,
    wipes: 0,
    screenshots: [],
    consoleErrors: errors,
    error: null,
    reachedFinalCapstone: false,
    finalCapstoneResult: null,
    audit: null,
  };
  try {
    await bootNatural(page, seed);
    if (TRACE) console.log("  F1 start");

    // Floor 1: crypt key → reliquary lock → lexicon chest → chute → raft →
    // the authored "Party That Returned" stair guardian.
    await goTo(page, { floorId: 1, x: 26, y: 18 }, runState);
    if (TRACE) console.log("  F1 crypt reached");
    await goTo(page, { floorId: 1, x: 11, y: 13 }, runState);
    await unlockAt(page, { floorId: 1, x: 11, y: 12 }, 0, runState);
    await goTo(page, { floorId: 1, x: 14, y: 8 }, runState);
    await handleRoute(page, runState);
    await goTo(page, { floorId: 1, x: 3, y: 8 }, runState);
    await handleRoute(page, runState); // accept the real chute warning
    // The chute lands inside the raft pocket. Its one-sided barred gate is
    // opened through the normal forward interaction from the pocket side.
    await goTo(page, { floorId: 1, x: 3, y: 21 }, runState);
    await face(page, 1);
    await stepDirection(page, 1, runState);
    await goTo(page, { floorId: 1, x: 14, y: 21 }, runState);
    await face(page, 1); // fromDock's authored approach is east
    await stepDirection(page, 1, runState); // raft boarding dialog / animation
    await wait(1700);
    await goTo(page, { floorId: 1, x: 18, y: 21 }, runState);
    if (TRACE) console.log("  F1 capstone reached");
    await captureCapstone(page, runId, 1).then((file) => result.screenshots.push(file));
    await handleRoute(page, runState); // stair guardian combat
    await goTo(page, { floorId: 1, x: 19, y: 21 }, runState);

    // Floor 2: lexicon lock → furnace-key climax chest → stairs.
    await goTo(page, { floorId: 2, x: 9, y: 7 }, runState);
    await unlockAt(page, { floorId: 2, x: 10, y: 7 }, 1, runState);
    await goTo(page, { floorId: 2, x: 12, y: 8 }, runState);
    if (TRACE) console.log("  F2 capstone reached");
    await handleRoute(page, runState);
    await captureCapstone(page, runId, 2).then((file) => result.screenshots.push(file));
    await handleRoute(page, runState); // Cursed Library guardian combat
    await goTo(page, { floorId: 2, x: 11, y: 12 }, runState);

    // Floor 3: forge-key chest → Grand Forge lock → trophy climax.
    await goTo(page, { floorId: 3, x: 2, y: 14 }, runState);
    await handleRoute(page, runState);
    await goTo(page, { floorId: 3, x: 7, y: 11 }, runState);
    await unlockAt(page, { floorId: 3, x: 7, y: 11 }, 2, runState);
    await goTo(page, { floorId: 3, x: 9, y: 13 }, runState);
    if (TRACE) console.log("  F3 capstone reached");
    await handleRoute(page, runState);
    await captureCapstone(page, runId, 3).then((file) => result.screenshots.push(file));
    await handleRoute(page, runState); // Grand Forge guardian combat

    result.completed = true;
  } catch (error) {
    result.error = String(error?.stack ?? error);
    try {
      await page.screenshot({ path: path.join(OUT, `${runId}-failure.png`) });
    } catch {
      // Keep the useful audit even if the browser is already tearing down.
    }
  } finally {
    result.wipes = runState.wipes;
    try {
      result.audit = await page.evaluate(() => window.__onyxDebug.combatAudit.snapshot());
      const finalCapstone = result.audit?.records
        ?.filter((record) => record.source === "climax" && record.climaxId === "floor3-guardian")
        .at(-1);
      result.reachedFinalCapstone = Boolean(finalCapstone);
      result.finalCapstoneResult = finalCapstone?.result ?? null;
      result.completed = finalCapstone?.result === "victory";
    } catch (error) {
      result.audit = { error: String(error) };
    }
    await browser.close();
  }
  return result;
}

const results = [];
for (const run of RUNS) {
  for (const seed of SEEDS) {
    console.log(`=== ${run.id} seed ${seed} ===`);
    const result = await runCampaign(run, seed);
    results.push(result);
    const records = result.audit?.records ?? [];
    const fights = records.length;
    const wipes = records.filter((record) => record.result === "wipe").length;
    const victories = records.filter((record) => record.result === "victory").length;
    console.log(JSON.stringify({ runId: result.runId, completed: result.completed, fights, victories, wipes, error: result.error }, null, 2));
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  url: URL,
  seeds: SEEDS,
  runs: RUNS,
  measurementPolicy: POLICY === "tactical"
    ? "Natural movement and progression; competent tactical policy heals material damage, uses one defensive layer on large fights, conserves SP, uses critical potions, and flees only from a collapsing ordinary fight; Tab/B only accelerate presentation."
    : "Natural movement and progression; Q attack-first Auto; Tab/B only accelerate combat presentation.",
  results,
};
const reportPath = path.join(OUT, process.env.REPORT_FILE ?? "report.json");
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`Report: ${reportPath}`);
