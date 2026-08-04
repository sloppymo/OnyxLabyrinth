/**
 * Transcript recorder for deterministic replay.
 *
 * Boots the game with ?debug=1, dumps the starting save, installs a seeded
 * gameplay RNG, then drives a scenario via keyboard inputs. After every key
 * press it waits for idle, snapshots, and records a stable state hash.
 *
 * The resulting transcript JSON is self-contained: the replayer loads the
 * startingSave, reinstalls the seed, optionally forces combat, and replays
 * the exact key sequence, checking that every state hash matches.
 *
 * Usage:
 *   node scripts/replays/record.mjs --scenario phaser-combat  --seed 42 --out scripts/replays/phaser-basic-combat.json
 *   node scripts/replays/record.mjs --scenario canvas-combat  --seed 42 --out scripts/replays/canvas-basic-combat.json
 *   node scripts/replays/record.mjs --scenario dungeon-encounter --seed 42 --out scripts/replays/dungeon-encounter.json
 *   node scripts/replays/record.mjs --scenario dungeon-interaction --seed 42 --out scripts/replays/dungeon-interaction.json
 *
 * Expects: npx vite dev (or preview) serving on ONYX_URL (default 5173 dev).
 */
import { parseArgs } from "node:util";
import fs from "fs";
import path from "path";
import {
  launch,
  wait,
  snap,
  waitForIdle,
  ensureOutDir,
  ensureAudioResumed,
} from "../playtests/lib.mjs";
import { stateHash } from "./hash.mjs";

const { values: args } = parseArgs({
  options: {
    scenario: { type: "string", default: "phaser-combat" },
    seed: { type: "string", default: "42" },
    out: { type: "string", default: "" },
    url: { type: "string", default: "" },
  },
});

const SEED = parseInt(args.seed, 10);
const SCENARIO = args.scenario;
const OUT_PATH =
  args.out ||
  path.join("scripts/replays", `${SCENARIO.replace(/-/g, "_")}.json`);

// Dev server is the default base — the debug hooks are tree-shaken out of the
// production build, so `vite preview` won't expose __onyxDebug.
const BASE =
  args.url ||
  process.env.ONYX_URL ||
  "http://127.0.0.1:5173/?debug=1";

const log = (...a) => console.log(...a);

// ---------------------------------------------------------------------------
// Scenario configs — each scenario knows its renderer flag, starting jumpTo
// options, and a driver function that yields key presses.
// ---------------------------------------------------------------------------

const SCENARIOS = {
  // Force a combat via the debug surface, then fight to victory with Attack.
  // Renderer: Phaser (default).
  "phaser-combat": {
    renderer: "phaser",
    urlSuffix: "",
    // First jumpTo lands at floor 1 start. The save is dumped here.
    jumpTo: { floorId: 1, x: 11, y: 25, facing: 0, autosave: false },
    // Second jumpTo (null = none) — for scenarios that need to be closer to
    // a specific tile. The save is re-dumped after this jump.
    jumpTo2: null,
    forceCombat: true,
    driver: combatDriver,
  },

  // Same fight via the Canvas rollback renderer (?phaser=0).
  "canvas-combat": {
    renderer: "canvas",
    urlSuffix: "&phaser=0",
    jumpTo: { floorId: 1, x: 11, y: 25, facing: 0, autosave: false },
    jumpTo2: null,
    forceCombat: true,
    driver: combatDriver,
  },

  // Walk forward until a seeded random encounter triggers, then fight.
  "dungeon-encounter": {
    renderer: "phaser",
    urlSuffix: "",
    jumpTo: { floorId: 1, x: 11, y: 25, facing: 0, autosave: false },
    jumpTo2: null,
    forceCombat: false,
    driver: walkThenCombatDriver,
  },

  // Walk to a trapped chest and interact with it (Inspect → Disarm → Open).
  "dungeon-interaction": {
    renderer: "phaser",
    urlSuffix: "",
    jumpTo: { floorId: 1, x: 11, y: 25, facing: 0, autosave: false },
    // Jump near the trapped chest at (3, 4) — start at (3, 5) facing north.
    jumpTo2: { floorId: 1, x: 3, y: 5, facing: 0, autosave: false },
    forceCombat: false,
    driver: trapInteractionDriver,
  },
};

// ---------------------------------------------------------------------------
// Driver functions — each is an async generator that yields { key, action }
// pairs. The recorder presses the key, waits for idle, and records the hash.
// ---------------------------------------------------------------------------

/**
 * Combat driver: press Enter through every player turn (Attack → confirm
 * target), skip playback with "b", dismiss result with Enter. Stops when
 * combat ends (route leaves "combat").
 */
async function* combatDriver(page) {
  for (let round = 0; round < 40; round++) {
    const s = await snap(page);
    if (s.route !== "combat") break;
    if (s.combat?.result) {
      yield { key: "Enter", action: "dismiss-result" };
      return;
    }
    const phase = s.combat?.phase;
    if (!phase) {
      yield { key: "Enter", action: "settle" };
      continue;
    }
    switch (phase) {
      case "palette":
        yield { key: "Enter", action: "confirm-attack" };
        break;
      case "selectTarget":
        yield { key: "Enter", action: "confirm-target" };
        break;
      case "selectSpell":
      case "selectTechnique":
      case "selectSkill":
      case "selectItem":
        yield { key: "Escape", action: "cancel-submenu" };
        break;
      case "playback":
        yield { key: "b", action: "skip-playback" };
        break;
      case "result":
        yield { key: "Enter", action: "dismiss-result" };
        return;
      default:
        yield { key: "Enter", action: `settle-${phase}` };
    }
  }
}

/**
 * Walk forward until a random encounter triggers, then hand off to the
 * combat driver. If the party hits a wall, turn right and keep walking.
 */
async function* walkThenCombatDriver(page) {
  for (let step = 0; step < 200; step++) {
    const s = await snap(page);
    if (s.route === "combat") {
      // Encounter triggered — hand off to combat driver.
      yield* combatDriver(page);
      return;
    }
    if (s.route === "trap") {
      // Stepped on a trapped chest — just open it and continue.
      yield { key: "Enter", action: "open-trap" };
      continue;
    }
    if (s.route !== "dungeon") {
      // Something unexpected (NPC, event, etc.) — press Enter to clear.
      yield { key: "Enter", action: "clear-message" };
      continue;
    }
    // Try to walk forward.
    yield { key: "ArrowUp", action: "walk-forward" };
  }
}

/**
 * Walk onto the trapped chest and interact: Inspect → Disarm → Open.
 * The scenario config places us at (3, 5) facing north via jumpTo2,
 * so a few steps forward should land on the chest at (3, 4).
 */
async function* trapInteractionDriver(page) {
  for (let step = 0; step < 5; step++) {
    const s = await snap(page);
    if (s.route === "trap") {
      // On the trapped chest — interact.
      yield { key: "i", action: "inspect-chest" };
      yield { key: "d", action: "disarm-chest" };
      yield { key: "o", action: "open-chest" };
      return;
    }
    if (s.route !== "dungeon") {
      yield { key: "Enter", action: "clear-message" };
      continue;
    }
    yield { key: "ArrowUp", action: "walk-forward" };
  }
}

// ---------------------------------------------------------------------------
// Recorder core
// ---------------------------------------------------------------------------

/**
 * Boot to a clean title screen. Returns after the page is loaded and audio
 * is resumed.
 */
async function bootClean(page, url) {
  await page.goto(url, { waitUntil: "networkidle" });
  await wait(500);
  await ensureAudioResumed(page);
}

/**
 * Force a combat encounter via the debug surface using the seeded RNG.
 * Returns combat info { ok, enemyCount, enemyIds }.
 */
async function forceCombatViaDebug(page) {
  return page.evaluate(async () => {
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
      return { ok: true, enemyCount: r.length, enemyIds: r.map((e) => e.enemy.id) };
    }
    return { ok: false, reason: "no valid encounter in 400 attempts" };
  });
}

/**
 * Drive a scenario: jump to position, dump save, seed RNG, optionally force
 * combat, then run the driver generator, recording each key press with a
 * state hash.
 */
async function recordScenario(page, scenario, seed) {
  const cfg = SCENARIOS[scenario];
  if (!cfg) throw new Error(`Unknown scenario: ${scenario}`);

  // Jump to the starting position.
  await page.evaluate((o) => window.__onyxDebug.jumpTo(o), cfg.jumpTo);
  await waitForIdle(page, 5000);
  await wait(300);

  // Optional second jump (e.g., closer to a specific tile).
  if (cfg.jumpTo2) {
    await page.evaluate((o) => window.__onyxDebug.jumpTo(o), cfg.jumpTo2);
    await waitForIdle(page, 5000);
    await wait(300);
  }

  // Dump the starting save (after all jumps, before seeding RNG).
  const startingSave = await page.evaluate(() => window.__onyxDebug.dumpSave());

  // Install the seeded gameplay RNG.
  await page.evaluate((sd) => {
    window.__onyxDebug.setGameplayRng(window.__onyxDebug.createSeededRng(sd));
  }, seed);

  // Optionally force a combat via the debug surface.
  let forceCombatFlag = false;
  if (cfg.forceCombat) {
    const combatInfo = await forceCombatViaDebug(page);
    if (!combatInfo.ok) {
      throw new Error(`Failed to force combat: ${combatInfo.reason}`);
    }
    forceCombatFlag = true;
    log(`  forced combat: ${combatInfo.enemyCount} enemies: ${JSON.stringify(combatInfo.enemyIds)}`);
    await waitForIdle(page, 8000);
    await wait(500);
  }

  const actions = await driveAndRecord(page, cfg.driver);
  return { startingSave, forceCombat: forceCombatFlag, actions };
}

/**
 * Poll until the combat phase is no longer "playback" (or the route changes
 * away from "combat"). This handles a race condition where isIdle() returns
 * true because playbackDone is true, but the combat controller hasn't called
 * afterPlayback() yet to advance to the next phase. Without this, the
 * snapshot can capture a transient "playback" phase that may or may not
 * appear depending on animation-frame timing.
 */
async function waitForPhaseSettle(page, timeout = 5000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const s = await snap(page);
    if (s.route !== "combat") return s;
    if (s.combat?.phase !== "playback") return s;
    if (Date.now() >= deadline) return s;
    await wait(50);
  }
}

/**
 * Run the driver generator, pressing each key and recording the state hash
 * after waiting for idle.
 */
async function driveAndRecord(page, driver) {
  const actions = [];
  let index = 0;

  for await (const { key, action } of driver(page)) {
    // Snapshot before pressing (for routeBefore).
    const before = await snap(page);
    const routeBefore = before.route;

    // Press the key.
    await page.keyboard.press(key);

    // Wait for the game to settle.
    await waitForIdle(page, 8000);
    // Combat playback race: isIdle() may return true while the phase is
    // still "playback" (playbackDone=true but afterPlayback() hasn't run
    // yet). Poll until the phase settles to a non-playback state.
    let afterSnap = await waitForPhaseSettle(page, 5000);

    const hash = stateHash(afterSnap);

    actions.push({
      index,
      routeBefore,
      action,
      key,
      stateHashAfter: hash,
    });
    index++;

    if (index % 10 === 0) {
      log(`  recorded ${index} actions (route=${afterSnap.route})...`);
    }
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const cfg = SCENARIOS[SCENARIO];
if (!cfg) {
  log(`Unknown scenario: ${SCENARIO}`);
  log(`Available: ${Object.keys(SCENARIOS).join(", ")}`);
  process.exit(1);
}

const url = BASE + cfg.urlSuffix;
log(`=== recording scenario: ${SCENARIO} (seed=${SEED}, renderer=${cfg.renderer}) ===`);
log(`URL: ${url}`);
log(`Output: ${OUT_PATH}`);

const { browser, page, errors } = await launch({
  viewport: { width: 1280, height: 800 },
});

try {
  await bootClean(page, url);

  // Verify debug surface.
  const exposed = await page.evaluate(() => ({
    dumpSave: typeof window.__onyxDebug.dumpSave,
    setGameplayRng: typeof window.__onyxDebug.setGameplayRng,
    createSeededRng: typeof window.__onyxDebug.createSeededRng,
    jumpTo: typeof window.__onyxDebug.jumpTo,
    startCombat: typeof window.__onyxDebug.startCombat,
  }));
  for (const [k, v] of Object.entries(exposed)) {
    if (v !== "function") {
      log(`FAIL: ${k} not exposed on __onyxDebug (got ${v})`);
      process.exit(1);
    }
  }

  const { startingSave, forceCombat, actions } = await recordScenario(page, SCENARIO, SEED);

  const transcript = {
    version: 1,
    name: SCENARIO,
    seed: SEED,
    startingSave,
    renderer: cfg.renderer,
    viewport: { width: 1280, height: 800 },
    forceCombat,
    actions,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(transcript, null, 2));

  log(`\n=== transcript saved: ${OUT_PATH} ===`);
  log(`  actions: ${actions.length}`);
  log(`  forceCombat: ${forceCombat}`);
  log(`  startingSave: ${startingSave.length} chars`);
  if (errors.length) {
    log(`  WARNING: ${errors.length} console/page errors:`);
    errors.slice(0, 5).forEach((e) => log(`    ${e}`));
  } else {
    log(`  no console/page errors`);
  }

  if (actions.length > 0) {
    log(`  first hash: ${actions[0].stateHashAfter} (action=${actions[0].action}, key=${actions[0].key})`);
    log(`  last hash:  ${actions[actions.length - 1].stateHashAfter} (action=${actions[actions.length - 1].action}, key=${actions[actions.length - 1].key})`);
  }
} finally {
  await browser.close();
}
