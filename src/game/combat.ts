/**
 * Combat engine — state factory + turn drivers.
 *
 * This module owns: createCombatState / createCombatFromEncounter, the
 * initiative roll, and the two resolution APIs that share one core:
 * round-based resolveCombatRound (legacy/tests) and the per-turn API
 * (beginRound / resolvePlayerTurn / resolveEnemyTurn / resolveAllyTurn /
 * endRound) used by the FF6 combat UI.
 *
 * Everything else lives in focused modules:
 *   combat-types.ts       domain types (CombatState, CombatEvent, PlayerAction…)
 *   combat-inventory.ts   inventory count helpers
 *   combat-equipment.ts   loadout/equip helpers (town Equip screen, auto-equip)
 *   combat-reach.ts       weapon-range / reach rules
 *   combat-preview.ts     pre-roll Attack/spell forecasts for the UI
 *   combat-shared.ts      cross-cluster helpers (damage funnel, AC, statuses)
 *   combat-techniques.ts  rage resource + technique resolution
 *   combat-ai.ts          enemy decision-making (abilities, telegraphs, melee)
 *   combat-eor.ts         end-of-round bookkeeping (status ticks, boss phases)
 *   combat-spells.ts      spell application + targeting
 *   combat-enemy.ts       enemy ability/melee/cast resolution, summoned allies
 *   combat-actions.ts     player verbs (Attack/Cast/Defend/Hide/Ambush/…)
 *
 * Core invariant (unchanged since Track C): public entry points never mutate
 * the input CombatState — a deep clone is taken at entry and all helpers
 * work on the clone.
 */

import type { Character } from "./party";
import type { EnemyDef, Row } from "../data/enemies";
import type { SpellDef } from "../data/spells";
import type { ItemDef } from "../data/items";
import {
  perksForCharacter,
  perkModifiers,
  dispatchHook,
  freshPerkState,
} from "./perks";
import type {
  EnemyInstance,
  EnemyFormation,
  Loadout,
  PlayerAction,
  CombatEvent,
  EnemyAction,
  CombatState,
  Rng,
  TurnQueueEntry,
} from "./combat-types";
import { inventoryToCounts } from "./combat-inventory";
import {
  effStatsFor,
  findEnemy,
  cloneCharacter,
  cloneEnemy,
} from "./combat-shared";
import { startingRageFor } from "./combat-techniques";
import {
  buildEnemyActions,
  decideEnemyAction,
} from "./combat-ai";
import {
  allyDeathCheck,
  deathCheck,
  checkTermination,
  runEndOfRound,
} from "./combat-eor";
import { resolveEnemyAction, resolveAllyAction } from "./combat-enemy";
import { resolvePlayerAction, attemptFlee, smokeBombFleeActive } from "./combat-actions";

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build an initial CombatState. Pure: does not mutate its inputs but the
 * caller should treat the returned state as the owned copy.
 */
export function createCombatState(
  party: Character[],
  enemies: EnemyFormation,
  isBoss: boolean,
  spells: Record<string, SpellDef> = {},
  items: Record<string, ItemDef> = {},
  loadout: Record<string, Loadout> = {},
  inAntimagic = false,
  inventory: Record<string, number> = {}
): CombatState {
  return {
    party: party.map(cloneCharacter),
    enemies: {
      front: enemies.front.map(cloneEnemy),
      back: enemies.back.map(cloneEnemy),
    },
    round: 0,
    isBoss,
    log: [],
    ended: false,
    goldEarned: 0,
    xpEarned: 0,
    silencedThisRound: [],
    defendBuff: {},
    armorBuffs: {},
    paralysisTimers: {},
    spells,
    items,
    loadout,
    inAntimagic,
    inventory: { ...inventory },
    magicScreen: 0,
    partyFizzleField: 0,
    enemyFizzleFields: { front: 0, back: 0 },
    enemyMagicScreens: { front: 0, back: 0 },
    summonedAllies: [],
    justDied: [],
    justDiedAllies: [],
    events: [],
    perkState: Object.fromEntries(party.map((c) => [c.id, freshPerkState()])),
    rage: Object.fromEntries(party.map((c) => [c.id, startingRageFor(c)])),
    counterStances: {},
    tauntingIds: [],
    tauntBuffs: {},
    nextAttackBonuses: {},
    damageBuffs: {},
    enemyArmorDebuffs: {},
    enemyAgiDebuffs: {},
    attackDebuffs: {},
    sleepTimers: {},
    blindTimers: {},
    poisonState: {},
    windUps: {},
    observedAffinity: {},
    analyzedEnemies: {},
    bossPhases: {},
    disableStacks: {},
    enemyDots: {},
    regenBuffs: {},
    summonCounter: 0,
    holyShieldBuffs: {},
  };
}

/**
 * Convenience: build a CombatState from a resolved encounter (Track B's
 * resolveEncounter output). Derives isBoss from the enemy defs, assigns
 * unique instanceIds, and pins each enemy's actual row from the spawn data.
 */
export function createCombatFromEncounter(
  party: Character[],
  resolvedEncounter: { enemy: EnemyDef; row: Row }[],
  spells: Record<string, SpellDef>,
  items: Record<string, ItemDef>,
  loadout: Record<string, Loadout>,
  inventory: readonly (string | { itemId: string })[] = [],
  inAntimagic = false
): CombatState {
  const front: EnemyInstance[] = [];
  const back: EnemyInstance[] = [];
  let idx = 0;
  for (const spawn of resolvedEncounter) {
    const inst: EnemyInstance = {
      ...spawn.enemy,
      special: [...spawn.enemy.special],
      instanceId: `${spawn.enemy.id}-${idx}`,
      currentHp: spawn.enemy.hp,
      row: spawn.row,
      status: [],
    };
    if (spawn.row === "front") front.push(inst);
    else back.push(inst);
    idx++;
  }
  const isBoss = resolvedEncounter.some((e) => e.enemy.isBoss);
  return createCombatState(party, { front, back }, isBoss, spells, items, loadout, inAntimagic, inventoryToCounts(inventory));
}

// ---------------------------------------------------------------------------
// Main resolver — pure
// ---------------------------------------------------------------------------

export function resolveCombatRound(
  state: CombatState,
  actions: PlayerAction[],
  rng: Rng = Math.random
): CombatState {
  const s: CombatState = structuredClone(state);
  if (s.ended) return s;

  s.round += 1;
  s.log = [...state.log];
  s.silencedThisRound = [];
  s.defendBuff = {};
  s.justDied = [];
  s.justDiedAllies = [];
  s.events = [...state.events];

  const log = (msg: string): void => {
    s.log.push(msg);
    s.events.push(null);
  };
  /** Log a message with an associated structured event for animations. */
  const emit = (msg: string, event: CombatEvent): void => {
    s.log.push(msg);
    s.events.push(event);
  };

  // --- Phase 1: sanitize player actions -----------------------------------
  const livingParty = s.party.filter((c) => c.hp > 0);
  const actionByActor = new Map<string, PlayerAction>();
  for (const a of actions) {
    if ("actorId" in a) actionByActor.set(a.actorId, a);
  }

  const sanitized: PlayerAction[] = [];
  for (const c of livingParty) {
    const a = actionByActor.get(c.id);
    if (!a) {
      sanitized.push({ kind: "defend", actorId: c.id });
      continue;
    }
    if (c.status.includes("sleep") || c.status.includes("paralysis")) {
      const reason = c.status.includes("sleep") ? "sleep" : "paralysis";
      const label = reason === "sleep" ? "asleep" : "paralyzed";
      emit(`${c.name} is ${label} and cannot act!`, {
        type: "incapacitated",
        actorId: c.id,
        reason,
      });
      continue;
    }
    // Silenced characters cannot Cast; convert to Defend.
    if (a.kind === "cast" && s.silencedThisRound.includes(c.id)) {
      log(`${c.name} is silenced and cannot cast; defends instead.`);
      sanitized.push({ kind: "defend", actorId: c.id });
      continue;
    }
    sanitized.push(a);
  }

  // --- Flee (party-level, resolved before initiative) ---------------------
  const fleeAction = sanitized.find((a) => a.kind === "flee");
  if (fleeAction) {
    const fleer = s.party.find((c) => c.id === fleeAction.actorId);
    let success = false;
    if (fleer) {
      const eff = effStatsFor(s, fleer);
      const mods = perkModifiers(perksForCharacter(fleer), eff);
      success = attemptFlee(
        s.isBoss, eff.agi, mods.fleeBonusPercent, rng, smokeBombFleeActive(s)
      );
    }
    if (success) {
      emit("The party flees from combat!", { type: "flee", success: true });
      s.summonedAllies = [];
      s.ended = true;
      s.result = "fled";
      return s;
    }
    emit("The party fails to flee!", { type: "flee", success: false });
    for (let i = 0; i < sanitized.length; i++) {
      if (sanitized[i].kind === "flee") {
        sanitized[i] = { kind: "defend", actorId: sanitized[i].actorId };
      }
    }
  }

  // --- Phase 2: enemy AI --------------------------------------------------
  const enemyActions = buildEnemyActions(s, rng, emit);

  // --- Phase 3: initiative sort -------------------------------------------
  const ordered = initiativeOrder(s, sanitized, enemyActions, rng);

  // --- Phase 4: resolution ------------------------------------------------
  // Players act in initiative order, then summoned allies, then enemies.
  // Allies act as a group before enemies to represent their role as a
  // temporary front line.
  for (const entry of ordered) {
    if (s.ended) break;
    if (entry.kind !== "player") continue;
    resolvePlayerAction(s, entry.action, rng, log, emit);
    deathCheck(s, emit);
    allyDeathCheck(s, emit);
    if (checkTermination(s, log)) return s;
  }

  // Summoned allies act before enemies.
  for (const ally of s.summonedAllies.filter((a) => a.hp > 0)) {
    if (s.ended) break;
    resolveAllyAction(s, ally, rng, log, emit);
    deathCheck(s, emit);
    allyDeathCheck(s, emit);
    if (checkTermination(s, log)) return s;
  }

  for (const entry of ordered) {
    if (s.ended) break;
    if (entry.kind !== "enemy") continue;
    resolveEnemyAction(s, entry.action, rng, log, emit);
    deathCheck(s, emit);
    allyDeathCheck(s, emit);
    if (checkTermination(s, log)) return s;
  }

  // --- Phase 5: end-of-round status ticks ---------------------------------
  runEndOfRound(s, rng, log, emit);
  return s;
}

// ---------------------------------------------------------------------------
// Per-turn API (FF6-style hybrid flow)
// ---------------------------------------------------------------------------
// The combat UI resolves one actor's action at a time: beginRound builds an
// initiative queue of all living combatants, then the controller walks the
// queue — prompting the player on "player" entries and auto-resolving
// "enemy"/"ally" entries — and calls endRound when the queue is exhausted.
//
// All functions are PURE (clone in, new state out) and share the exact same
// resolution internals as resolveCombatRound, so the combat math is identical;
// only the sequencing differs. Enemy AI decides its action at its turn (not at
// round start), so targeting is never stale and initiative order matters.
//
// Each per-turn function clears justDied / justDiedAllies at entry, so after
// the call they contain only that turn's deaths. New log/event entries can be
// diffed by length (they are append-only).

/** Per-turn log/emit closures over a cloned state. */
function turnLoggers(s: CombatState) {
  const log = (msg: string): void => {
    s.log.push(msg);
    s.events.push(null);
  };
  const emit = (msg: string, event: CombatEvent): void => {
    s.log.push(msg);
    s.events.push(event);
  };
  return { log, emit };
}

/**
 * Begin a new round: advance the round counter, clear per-round state, and
 * build the initiative queue (AGI desc -> LUK desc -> d20 desc — the same
 * fallback chain as the round-based resolver) over all living combatants.
 */
export function beginRound(
  state: CombatState,
  rng: Rng = Math.random
): { state: CombatState; queue: TurnQueueEntry[] } {
  const s = structuredClone(state);
  if (s.ended) return { state: s, queue: [] };

  s.round += 1;
  s.silencedThisRound = [];
  s.defendBuff = {};
  s.justDied = [];
  s.justDiedAllies = [];

  // First round: run OnCombatStart hooks for living party members (e.g. Shadow).
  if (s.round === 1) {
    for (const c of s.party) {
      if (c.hp <= 0) continue;
      dispatchHook("OnCombatStart", perksForCharacter(c), {
        state: s.perkState[c.id],
        rng,
        grantHidden: () => {
          if (!c.status.includes("hidden")) c.status.push("hidden");
        },
      });
    }
  }

  const entries: TurnQueueEntry[] = [];
  for (const c of s.party) {
    if (c.hp <= 0) continue;
    const eff = effStatsFor(s, c);
    entries.push({ kind: "player", id: c.id, agi: eff.agi, luk: eff.luk, roll: rollD20(rng) });
  }
  for (const a of s.summonedAllies) {
    if (a.hp <= 0) continue;
    entries.push({ kind: "ally", id: a.id, agi: a.agi, luk: 10, roll: rollD20(rng) });
  }
  for (const e of [...s.enemies.front, ...s.enemies.back]) {
    if (e.currentHp <= 0) continue;
    const agiPenalty = s.enemyAgiDebuffs[e.instanceId]?.penalty ?? 0;
    // EnemyDef has no luk field; default to average for the tie-breaker.
    entries.push({
      kind: "enemy",
      id: e.instanceId,
      agi: Math.max(1, e.agi - agiPenalty),
      luk: 10,
      roll: rollD20(rng),
    });
  }
  entries.sort((x, y) => y.agi - x.agi || y.luk - x.luk || y.roll - x.roll);
  return { state: s, queue: entries };
}

/**
 * Resolve one party member's action immediately. Handles the same
 * sanitization as the round resolver: incapacitated actors skip, silenced
 * casters defend, and a failed flee converts to defend. Flee success ends
 * combat on the spot.
 */
export function resolvePlayerTurn(
  state: CombatState,
  action: PlayerAction,
  rng: Rng = Math.random
): CombatState {
  const s = structuredClone(state);
  if (s.ended) return s;
  s.justDied = [];
  s.justDiedAllies = [];
  const { log, emit } = turnLoggers(s);

  const actor = s.party.find((c) => c.id === action.actorId);
  if (!actor || actor.hp <= 0) return s;

  if (actor.status.includes("sleep") || actor.status.includes("paralysis")) {
    const reason = actor.status.includes("sleep") ? "sleep" : "paralysis";
    const label = reason === "sleep" ? "asleep" : "paralyzed";
    emit(`${actor.name} is ${label} and cannot act!`, {
      type: "incapacitated",
      actorId: actor.id,
      reason,
    });
    return s;
  }

  if (action.kind === "flee") {
    const eff = effStatsFor(s, actor);
    const mods = perkModifiers(perksForCharacter(actor), eff);
    const success = attemptFlee(
      s.isBoss, eff.agi, mods.fleeBonusPercent, rng, smokeBombFleeActive(s)
    );
    if (success) {
      emit("The party flees from combat!", { type: "flee", success: true });
      s.summonedAllies = [];
      s.ended = true;
      s.result = "fled";
      return s;
    }
    emit("The party fails to flee!", { type: "flee", success: false });
    resolvePlayerAction(s, { kind: "defend", actorId: actor.id }, rng, log, emit);
    return s;
  }

  if (action.kind === "cast" && s.silencedThisRound.includes(actor.id)) {
    log(`${actor.name} is silenced and cannot cast; defends instead.`);
    resolvePlayerAction(s, { kind: "defend", actorId: actor.id }, rng, log, emit);
    return s;
  }

  resolvePlayerAction(s, action, rng, log, emit);
  deathCheck(s, emit);
  allyDeathCheck(s, emit);
  checkTermination(s, log);
  return s;
}

/**
 * Resolve one enemy's turn: the AI decides its action now (fresh targeting)
 * and it resolves immediately. Dead / missing enemies are a no-op so the
 * controller can walk a stale queue safely.
 */
export function resolveEnemyTurn(
  state: CombatState,
  enemyInstanceId: string,
  rng: Rng = Math.random
): CombatState {
  const s = structuredClone(state);
  if (s.ended) return s;
  s.justDied = [];
  s.justDiedAllies = [];
  const { log, emit } = turnLoggers(s);

  const enemy = findEnemy(s, enemyInstanceId);
  if (!enemy || enemy.currentHp <= 0) return s;

  const action = decideEnemyAction(s, enemy, rng, emit);
  resolveEnemyAction(s, action, rng, log, emit);
  deathCheck(s, emit);
  allyDeathCheck(s, emit);
  checkTermination(s, log);
  return s;
}

/** Resolve one summoned ally's turn (simple attack, as in the round path). */
export function resolveAllyTurn(
  state: CombatState,
  allyId: string,
  rng: Rng = Math.random
): CombatState {
  const s = structuredClone(state);
  if (s.ended) return s;
  s.justDied = [];
  s.justDiedAllies = [];
  const { log, emit } = turnLoggers(s);

  const ally = s.summonedAllies.find((a) => a.id === allyId);
  if (!ally || ally.hp <= 0) return s;

  resolveAllyAction(s, ally, rng, log, emit);
  deathCheck(s, emit);
  allyDeathCheck(s, emit);
  checkTermination(s, log);
  return s;
}

/**
 * Insert turn entries for summoned allies that joined AFTER the round's
 * queue was built (e.g. BAMORDI cast this round) so they act this round,
 * matching the round-based resolver where allies always act between the
 * player phase and the enemy phase. New allies are inserted before the
 * first enemy entry at or after `nextIndex` (or appended if none remain).
 * Pure: returns a new queue; the input is not mutated.
 */
export function enqueueNewAllies(
  queue: TurnQueueEntry[],
  nextIndex: number,
  state: CombatState
): TurnQueueEntry[] {
  const queuedIds = new Set(queue.map((e) => e.id));
  const newEntries: TurnQueueEntry[] = state.summonedAllies
    .filter((a) => a.hp > 0 && !queuedIds.has(a.id))
    .map((a) => ({ kind: "ally" as const, id: a.id, agi: a.agi, luk: 10, roll: 10 }));
  if (newEntries.length === 0) return queue;

  let insertAt = queue.length;
  for (let i = nextIndex; i < queue.length; i++) {
    if (queue[i].kind === "enemy") {
      insertAt = i;
      break;
    }
  }
  return [...queue.slice(0, insertAt), ...newEntries, ...queue.slice(insertAt)];
}

/**
 * End-of-round bookkeeping: status ticks (poison, paralysis countdown),
 * hidden-character spotting, magic screen / fizzle field decay, and per-round
 * silence expiry. Mirrors Phase 5 of resolveCombatRound exactly.
 */
export function endRound(state: CombatState, rng: Rng = Math.random): CombatState {
  const s = structuredClone(state);
  if (s.ended) return s;
  s.justDied = [];
  s.justDiedAllies = [];
  const { log, emit } = turnLoggers(s);

  runEndOfRound(s, rng, log, emit);
  return s;
}

// ---------------------------------------------------------------------------
// Initiative
// ---------------------------------------------------------------------------

type InitiativeEntry =
  | { kind: "player"; action: PlayerAction; agi: number; luk: number; roll: number }
  | { kind: "enemy"; action: EnemyAction; agi: number; luk: number; roll: number };

function rollD20(rng: Rng): number {
  return 1 + Math.floor(rng() * 20);
}

function initiativeOrder(
  s: CombatState,
  playerActions: PlayerAction[],
  enemyActions: EnemyAction[],
  rng: Rng
): InitiativeEntry[] {
  const entries: InitiativeEntry[] = [];

  for (const a of playerActions) {
    const c = s.party.find((p) => p.id === a.actorId);
    if (!c || c.hp <= 0) continue;
    const eff = effStatsFor(s, c);
    entries.push({
      kind: "player",
      action: a,
      agi: eff.agi,
      luk: eff.luk,
      roll: rollD20(rng),
    });
  }
  for (const a of enemyActions) {
    if (a.actor.currentHp <= 0) continue;
    entries.push({
      kind: "enemy",
      action: a,
      agi: a.actor.agi,
      luk: 10, // EnemyDef has no luk field; default to average for tie-breaker
      roll: rollD20(rng),
    });
  }

  // AGI desc -> LUK desc -> d20 desc (exact fallback chain from 7.1).
  entries.sort((x, y) => y.agi - x.agi || y.luk - x.luk || y.roll - x.roll);
  return entries;
}

