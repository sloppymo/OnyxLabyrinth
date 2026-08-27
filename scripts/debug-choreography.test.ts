/**
 * Text-only harness for debugging combat animations (positions, timing,
 * state transitions, damage popups) WITHOUT booting the game: no dev
 * server, no browser, no screenshots. Run it in isolation for a fast,
 * cheap, readable trace (--reporter=verbose is required or vitest swallows
 * the console.log output):
 *
 *   npx vitest run scripts/debug-choreography.test.ts --reporter=verbose
 *
 * It drives a real enemy turn through the actual AI resolver
 * (resolveEnemyTurn — the same one the game uses, not hand-rolled
 * CombatEvents) and then feeds the resulting events through the real
 * choreography engine (playTurn/updateScene), printing every actor's
 * state + screen offset + any popup/banner at each scheduled ChoreoStep.
 *
 * To debug a NEW coordinated/group attack: add another traceEnemyTurn(...)
 * call in the describe block below with the relevant enemy def id(s) and
 * ability override, and read the printed timeline — no visual check needed
 * until the logic itself looks right. Reserve actual browser verification
 * (Arena mode, `?debug=1`, window.__onyxDebug) for a final visual pass once
 * the trace looks correct.
 */
import { describe, it } from "vitest";
import { createScene, playTurn, updateScene, animOffset } from "../src/engine/combat-choreography";
import { createCombatState, resolveEnemyTurn } from "../src/game/combat";
import { createCharacterRecord } from "../src/game/party";
import { ENEMIES_BY_ID, type EnemyDef } from "../src/data/enemies";
import { enemyAbilityById } from "../src/data/enemy-abilities";
import type { CombatState, CombatEvent, EnemyInstance, Rng } from "../src/game/combat-types";

const W = 768;
const H = 672;

/** Deterministic RNG from a fixed sequence (cycles once exhausted). */
function seqRng(values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length];
}

function spawnEnemy(defId: string, instanceId: string, overrides: Partial<EnemyDef> = {}): EnemyInstance {
  const base = ENEMIES_BY_ID[defId];
  if (!base) throw new Error(`Unknown enemy def id "${defId}" — check src/data/enemies.ts`);
  const def = { ...base, ...overrides };
  return { ...def, instanceId, currentHp: def.hp, row: "front", status: [] };
}

function makeParty() {
  return [
    createCharacterRecord("c0", "Aria", "Human", "Neutral", "Fighter", 0),
    createCharacterRecord("c1", "Bram", "Human", "Neutral", "Mage", 1),
  ];
}

const spellNameFor = (id: string) => enemyAbilityById(id)?.name ?? id;

/**
 * Spawns the given enemies (real defs from data/enemies.ts, optionally
 * overridden — e.g. `{ abilityIds: ["pack-leap"] }` to isolate one ability
 * from an enemy's full kit for a deterministic trace), resolves the acting
 * enemy's turn via the real AI resolver, and prints the resulting
 * choreography as plain text.
 */
function traceEnemyTurn(
  label: string,
  enemies: { defId: string; overrides?: Partial<EnemyDef> }[],
  actingIndex: number,
  rng: Rng
): void {
  const instances = enemies.map((e, i) => spawnEnemy(e.defId, `${e.defId}-${i}`, e.overrides));
  let state: CombatState = createCombatState(makeParty(), { front: instances, back: [] }, false);
  const before = state.events.length;
  state = resolveEnemyTurn(state, instances[actingIndex].instanceId, rng);
  const events = state.events.slice(before).filter((e): e is CombatEvent => e !== null);

  console.log(`\n=== ${label} ===`);
  console.log(`log: ${state.log.slice(-3).join(" | ")}`);
  if (events.length === 0) {
    console.log("(no CombatEvents fired — ability condition not met, or AI chose a different action)");
    return;
  }

  const scene = createScene(state);
  const duration = playTurn(scene, events, spellNameFor, 0, W, H);
  console.log(`duration: ${duration.toFixed(0)}ms`);

  const steps = scene.choreo?.steps ?? [];
  const sampleTimes = [...new Set([0, ...steps.map((s) => s.at), duration])].sort((a, b) => a - b);

  let lastPopupCount = 0;
  for (const t of sampleTimes) {
    updateScene(scene, t);
    const parts: string[] = [];
    for (const [id, anim] of [...scene.enemyAnims, ...scene.partyAnims]) {
      const off = animOffset(anim, t);
      if (anim.state !== "idle" || off.x !== 0 || off.y !== 0) {
        parts.push(`${id}:${anim.state}@(${off.x.toFixed(0)},${off.y.toFixed(0)})`);
      }
    }
    if (scene.popups.length > lastPopupCount) {
      for (const p of scene.popups.slice(lastPopupCount)) parts.push(`popup"${p.text}"`);
      lastPopupCount = scene.popups.length;
    }
    if (scene.banner) parts.push(`banner"${scene.banner}"`);
    console.log(`  t=${String(t.toFixed(0)).padStart(5)}ms  ${parts.join("  ") || "(idle)"}`);
  }
}

describe("choreography debug traces (text-only, no browser required)", () => {
  it("Orc Pack Leap fires and leapfrogs to the target with two orcs alive", () => {
    traceEnemyTurn(
      "Orc Pack Leap (2 orcs)",
      [
        { defId: "orc", overrides: { abilityIds: ["pack-leap"] } },
        { defId: "orc" },
      ],
      0,
      seqRng([0.1])
    );
  });

  it("solo Orc never fires Pack Leap (falls back to a normal action)", () => {
    traceEnemyTurn(
      "Orc solo",
      [{ defId: "orc", overrides: { abilityIds: ["pack-leap"] } }],
      0,
      seqRng([0.1])
    );
  });
});
