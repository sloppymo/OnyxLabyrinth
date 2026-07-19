/**
 * Combat system — Step 4 (Track C), merged with Track B's data types.
 *
 * Implements the phased turn-based combat model from design doc Section 7:
 * initiative (AGI -> LUK -> d20), formation-aware targeting, enemy AI, all
 * five player actions (Attack, Cast, Defend, Item, Flee), status effects,
 * and the flag-driven boss "silenceRandom" pattern from Section 10.2.
 *
 * The resolver is a PURE function: it never mutates the input `CombatState`.
 * A deep clone is taken at entry and all work happens on the clone.
 *
 * MERGE NOTE: This file now imports types directly from Track B's data files
 * (party.ts, enemies.ts, spells.ts, items.ts) instead of defining local
 * mirror types. The Character interface gained `id` and `knownSpellIds`
 * fields during the merge to support combat targeting and cast validation.
 */

import type { Character, StatusEffect } from "./party";
import { charRow } from "./party";
import type { EnemyDef, EnemySpecial, Row } from "../data/enemies";
import { ENEMIES_BY_ID } from "../data/enemies";
import type { SpellDef, DamageElement } from "../data/spells";
import { spellByName } from "../data/spells";
import type { ItemDef } from "../data/items";
import type { TechniqueDef, TechniqueEffect } from "../data/techniques";
import { techniqueById, classHasTechniques, maxRageForLevel } from "../data/techniques";
import {
  perksForCharacter,
  perkModifiers,
  dispatchHook,
  freshPerkState,
} from "./perks";
import type { EnemyAbilityDef, AbilityCondition } from "../data/enemy-abilities";
import { enemyAbilityById } from "../data/enemy-abilities";
import type {
  WeaponRange,
  ActionPreview,
  EnemyInstance,
  EnemyFormation,
  Loadout,
  PlayerAction,
  CombatEvent,
  EnemyAttackTarget,
  EnemyAction,
  SummonedAlly,
  CombatState,
  Rng,
  TurnQueueEntry,
} from "./combat-types";
import { inventoryToCounts } from "./combat-inventory";
import { effStatsFor, tagDamageMultiplier } from "./combat-shared";

/** Enemy ability/heal powers were not part of the 2026-07 stat pass — scale at resolve time. */
const ENEMY_ABILITY_POWER_SCALE = 1.6;
/** Summoned allies draw melee fire often, but no longer soak 100% of enemy attacks. */
const SUMMON_MELEE_SOAK_CHANCE = 0.55;

// ---------------------------------------------------------------------------
// Combat-internal types
// ---------------------------------------------------------------------------

/**
 * Check if an attacker can reach a target based on position and weapon range.
 * Implements the Wizardry V targeting grid adapted to OnyxLabyrinth's
 * front/back row system.
 *
 * @param attackerPosition - 0-5, where 0-2 are front row and 3-5 are back row
 * @param weaponRange - The weapon's range type
 * @param targetRow - The target enemy's row ("front" or "back")
 * @returns true if the attacker can reach the target
 */
export function canReach(
  attackerPosition: number,
  weaponRange: WeaponRange,
  targetRow: "front" | "back"
): boolean {
  const isFrontRow = attackerPosition >= 0 && attackerPosition <= 2;

  switch (weaponRange) {
    case "close":
      // Slots 1-3 (front row) can reach groups 1-2 (front row enemies).
      return isFrontRow && targetRow === "front";
    case "short":
      // Slots 1-3 reach groups 1-3; slots 4-6 reach groups 1-2.
      // In a two-row system: front-row reaches all; back-row reaches front only.
      return isFrontRow || targetRow === "front";
    case "medium":
      // Slots 1-3 reach all groups; slots 4-6 reach groups 1-3.
      // In a two-row system both rows reach everything.
      return true;
    case "long":
      // All positions reach all groups.
      return true;
    default:
      // Fallback: treat unknown as melee-only (close range).
      return isFrontRow && targetRow === "front";
  }
}

/**
 * Effective weapon range after perk overrides (the reach perks):
 * - halberdier-sweep: every melee weapon behaves at polearm reach (medium) —
 *   any row from any row, no back-row damage penalty.
 * - duelist-lunge: short weapons behave as medium.
 */
export function effectiveWeaponRange(actor: Character, weaponRange: WeaponRange): WeaponRange {
  const perks = perksForCharacter(actor);
  if (perks.some((p) => p.id === "halberdier-sweep")) return "medium";
  if (weaponRange === "short" && perks.some((p) => p.id === "duelist-lunge")) return "medium";
  return weaponRange;
}

function emptyPreview(flags: Partial<ActionPreview> = {}): ActionPreview {
  return {
    hitChance: 0,
    minDamage: 0,
    maxDamage: 0,
    guaranteedKill: false,
    ...flags,
  };
}

/** Physical damage at a fixed variance factor (0.8–1.2), excluding crits/hooks. */
function previewPhysicalDamageAtVariance(
  s: CombatState,
  actor: Character,
  target: EnemyInstance,
  weaponRange: WeaponRange,
  variance: number
): number {
  const loadout = s.loadout[actor.id];
  const weapon = loadout?.weapon;
  const effStats = effStatsFor(s, actor);
  const mods = perkModifiers(perksForCharacter(actor), effStats);
  const weaponBonus = weapon?.attackBonus ?? 0;
  const attackDebuff = s.attackDebuffs[actor.id]?.penalty ?? 0;
  const base = Math.max(1, effStats.str + actor.level + weaponBonus - attackDebuff);
  const isThief = actor.class === "Thief";
  const rowMultiplier =
    charRow(actor) === "back" && weaponRange === "close" && !isThief ? 0.4 : 1;
  let damage =
    Math.max(1, Math.round(base * rowMultiplier * variance * mods.meleeDamageMultiplier)) +
    mods.meleeBonusDamage;

  damage = Math.max(1, Math.round(damage * tagDamageMultiplier(mods, target)));

  const acIgnoreFactor =
    charRow(actor) === "back" && perksForCharacter(actor).some((p) => p.id === "thief-backstab")
      ? 0.75
      : 1;
  const flooredAc = Math.min(effectiveEnemyAc(s, target), Math.floor(damage / 2));
  const acReduction = Math.max(0, Math.round((flooredAc - mods.acFlatIgnore) * acIgnoreFactor));
  damage = Math.max(1, damage - acReduction);

  if (target.special.some((sp) => sp.kind === "highDefense")) {
    damage = Math.max(1, Math.round(damage * 0.5));
  }
  const resist = target.special.find(
    (sp): sp is Extract<EnemySpecial, { kind: "resistPhysical" }> => sp.kind === "resistPhysical"
  );
  if (resist) {
    damage = Math.max(1, Math.round(damage * (1 - resist.percent / 100)));
  }
  return damage;
}

/** Forecast a basic Attack against one enemy (knowable pre-roll facts only). */
export function previewAttack(
  s: CombatState,
  actor: Character,
  target: EnemyInstance
): ActionPreview {
  const loadout = s.loadout[actor.id];
  const weapon = loadout?.weapon;
  const weaponRange: WeaponRange = effectiveWeaponRange(actor, weapon?.range ?? "close");

  if (!canReach(actor.formationSlot, weaponRange, target.row)) {
    return emptyPreview({ unreachable: true });
  }

  const nextBonus = s.nextAttackBonuses[actor.id];
  const forcedHit = nextBonus?.hitChance !== undefined && nextBonus.hitChance >= 1;

  let hitChance = 1;
  if (!forcedHit) {
    if (target.special.some((sp) => sp.kind === "evasive")) hitChance *= 0.8;
    if (target.special.some((sp) => sp.kind === "flying") && weaponRange === "close") {
      hitChance *= 0.85;
    }
    if (actor.status.includes("blind")) hitChance *= 0.5;
  }

  const minDamage = previewPhysicalDamageAtVariance(s, actor, target, weaponRange, 0.8);
  const maxDamage = previewPhysicalDamageAtVariance(s, actor, target, weaponRange, 1.2);
  const guaranteedKill = hitChance >= 1 && minDamage >= target.currentHp;
  return { hitChance, minDamage, maxDamage, guaranteedKill };
}

/** Forecast a single-target damage spell (no crits; fizzle odds in hitChance). */
export function previewSpellDamage(
  s: CombatState,
  caster: Character,
  spell: SpellDef,
  target: EnemyInstance
): ActionPreview {
  if (spell.effect.kind !== "damage") {
    return emptyPreview({ noEffect: true });
  }
  const eff = spell.effect;

  if (s.inAntimagic) {
    return emptyPreview();
  }

  let hitChance = 1;
  if (s.partyFizzleField > 0) {
    const fizzleChance = s.partyFizzleField / (s.partyFizzleField + caster.level);
    hitChance = Math.max(0, 1 - fizzleChance);
  }

  if (eff.element === "undead" && !target.special.some((sp) => sp.kind === "undead")) {
    return emptyPreview({ noEffect: true, hitChance });
  }

  const effStats = effStatsFor(s, caster);
  const castingStat =
    caster.class === "Mage"
      ? effStats.int
      : caster.class === "Priest" || caster.class === "Crusader"
        ? effStats.pie
        : 0;
  const castingBonus = Math.floor(castingStat / 4);
  const casterMods = perkModifiers(perksForCharacter(caster), effStats);
  const spellMult = casterMods.spellDamageMultiplier;
  const tagMult = tagDamageMultiplier(casterMods, target);
  const powerMultiplier = 1; // Arcane Surge not simulated (reactive)
  const raw = Math.max(
    1,
    Math.round((eff.power + castingBonus) * powerMultiplier * spellMult * tagMult)
  );
  let final = Math.max(1, raw - Math.floor(target.ac / 2));
  if (eff.element) {
    const affinity = target.special.find(
      (sp) =>
        (sp.kind === "resistElement" || sp.kind === "weakElement") && sp.element === eff.element
    );
    if (affinity) {
      const isResist = affinity.kind !== "weakElement";
      const hasSpellbreaker =
        isResist && perksForCharacter(caster).some((p) => p.id === "mage-spellbreaker");
      const affinityMult = isResist ? (hasSpellbreaker ? 0.75 : 0.5) : 1.5;
      final = Math.max(1, Math.round(final * affinityMult));
    }
  }
  if (s.enemyMagicScreens[target.row] > 0) {
    final = Math.max(1, Math.round(final * 0.5));
  }

  const guaranteedKill = hitChance >= 1 && final >= target.currentHp;
  return { hitChance, minDamage: final, maxDamage: final, guaranteedKill };
}

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

// ---------------------------------------------------------------------------
// Enemy AI (Section 7.3 + 10.2)
// ---------------------------------------------------------------------------

/** Derive isCaster from special flags (EnemyDef has no isCaster field). */
function isCasterEnemy(enemy: EnemyInstance): boolean {
  return enemy.special.some(
    (s) => s.kind === "caster" || s.kind === "healer" || s.kind === "silenceRandom"
  );
}

/** Count living allies (including self). */
function livingAllyCount(s: CombatState): number {
  return [...s.enemies.front, ...s.enemies.back].filter((e) => e.currentHp > 0).length;
}

/** Check if any ally (including self) is below the given HP percentage. */
function anyAllyHurt(s: CombatState, percent: number): boolean {
  return [...s.enemies.front, ...s.enemies.back].some(
    (e) => e.currentHp > 0 && (e.currentHp / e.hp) * 100 < percent
  );
}

/** Check if any party member has the given status. */
function partyHasStatus(s: CombatState, status: string): boolean {
  return s.party.some((c) => c.hp > 0 && c.status.includes(status as StatusEffect));
}

/** Evaluate an ability condition against the current combat state. */
function abilityConditionMet(
  s: CombatState,
  enemy: EnemyInstance,
  cond: AbilityCondition
): boolean {
  const hpPct = (enemy.currentHp / enemy.hp) * 100;
  switch (cond.kind) {
    case "always": return true;
    case "hpBelow": return hpPct < cond.percent;
    case "hpAbove": return hpPct >= cond.percent;
    case "allyHurt": return anyAllyHurt(s, cond.percent);
    case "noAllyHurt": return !anyAllyHurt(s, 100);
    case "turnInterval": return s.round % cond.every === 0;
    case "minAllies": return livingAllyCount(s) >= cond.count;
    case "maxAllies": return livingAllyCount(s) <= cond.count;
    case "partyHasStatus": return partyHasStatus(s, cond.status);
    case "partyMissingStatus": return !partyHasStatus(s, cond.status);
    case "firstTurn": return !enemy.hasActed;
    case "notFirstTurn": return !!enemy.hasActed;
    default: return false;
  }
}

/** Pick a target ID for an ability based on its target pattern. */
function pickAbilityTargetId(
  s: CombatState,
  ability: EnemyAbilityDef,
  rng: Rng
): string | null {
  const livingParty = s.party.filter((c) => c.hp > 0 && !c.status.includes("hidden"));
  const party = livingParty.length > 0 ? livingParty : s.party.filter((c) => c.hp > 0);
  const livingAllies = [...s.enemies.front, ...s.enemies.back].filter((e) => e.currentHp > 0);

  switch (ability.target) {
    case "self":
      return null;
    case "singleParty": {
      const t = pickRandom(party, rng);
      return t?.id ?? null;
    }
    case "singleAlly": {
      const wounded = livingAllies.filter((e) => e.currentHp < e.hp);
      const t = wounded.length > 0 ? wounded.sort((a, b) => a.currentHp - b.currentHp)[0] : pickRandom(livingAllies, rng);
      return t?.instanceId ?? null;
    }
    case "groupParty":
    case "allParty":
    case "groupAlly":
    case "allAlly":
      return party[0]?.id ?? null;
    default:
      return null;
  }
}

/**
 * Build the list of valid enemy abilities for this turn, filtered by
 * conditions and cooldowns. Returns a weighted pick or null.
 */
function pickEnemyAbility(
  s: CombatState,
  enemy: EnemyInstance,
  rng: Rng
): { ability: EnemyAbilityDef; targetId: string | null } | null {
  if (!enemy.abilityIds || enemy.abilityIds.length === 0) return null;
  const cooldowns = enemy.abilityCooldowns ?? {};
  const valid: { ability: EnemyAbilityDef; weight: number }[] = [];
  for (const id of enemy.abilityIds) {
    const ab = enemyAbilityById(id);
    if (!ab) continue;
    if ((cooldowns[id] ?? 0) > 0) continue;
    if (!abilityConditionMet(s, enemy, ab.condition)) continue;
    valid.push({ ability: ab, weight: ab.weight });
  }
  if (valid.length === 0) return null;
  const total = valid.reduce((sum, v) => sum + v.weight, 0);
  let roll = rng() * total;
  for (const v of valid) {
    roll -= v.weight;
    if (roll <= 0) {
      const targetId = pickAbilityTargetId(s, v.ability, rng);
      return { ability: v.ability, targetId };
    }
  }
  const fallback = valid[0];
  return { ability: fallback.ability, targetId: pickAbilityTargetId(s, fallback.ability, rng) };
}

function buildEnemyActions(
  s: CombatState,
  rng: Rng,
  emit: (m: string, e: CombatEvent) => void
): EnemyAction[] {
  const actions: EnemyAction[] = [];
  const allEnemies = [...s.enemies.front, ...s.enemies.back].filter(
    (e) => e.currentHp > 0
  );
  const livingParty = s.party.filter((c) => c.hp > 0);
  if (livingParty.length === 0) return actions;

  for (const enemy of allEnemies) {
    actions.push(decideEnemyAction(s, enemy, rng, emit));
  }
  return actions;
}

/**
 * Decide a single enemy's action for its turn. Shared by the round-based
 * resolver (which decides all intents at round start) and the per-turn API
 * (which decides at the moment the enemy acts, so targeting is never stale).
 *
 * NOTE: the silenceRandom branch applies its effect (pushes into
 * silencedThisRound) at decision time — this matches the original
 * buildEnemyActions behavior in the round path, and in the per-turn path it
 * means silence lands when the boss acts (initiative matters).
 */
function decideEnemyAction(
  s: CombatState,
  enemy: EnemyInstance,
  rng: Rng,
  emit: (m: string, e: CombatEvent) => void
): EnemyAction {
  const livingParty = s.party.filter((c) => c.hp > 0);
  if (livingParty.length === 0) return { kind: "doNothing", actor: enemy };

  if (enemy.status.includes("sleep") || enemy.status.includes("paralysis")) {
    // Disable = interrupt: an incapacitated enemy loses its wind-up.
    const broken = s.windUps[enemy.instanceId];
    if (broken) {
      delete s.windUps[enemy.instanceId];
      emit(`${enemy.name}'s ${broken.name} is broken!`, {
        type: "telegraphBreak", actorId: enemy.instanceId, abilityId: broken.abilityId,
      });
    }
    return { kind: "doNothing", actor: enemy };
  }

  // A stored wind-up fires now — commitment: no new decision, no weighted roll.
  const windUp = s.windUps[enemy.instanceId];
  if (windUp) {
    const ability = enemyAbilityById(windUp.abilityId);
    if (!ability) {
      delete s.windUps[enemy.instanceId];
      return { kind: "doNothing", actor: enemy };
    }
    return {
      kind: "ability",
      actor: enemy,
      abilityId: ability.id,
      targetId: pickAbilityTargetId(s, ability, rng) ?? "",
    };
  }

  // Boss / special: flag-driven silence (Section 10.2). Generic — any enemy
  // with a "silenceRandom" special silences a random party member. Emits a
  // structured event so the scene shows the Silence banner + SILENCED popup.
  // Only triggers ~40% of the time so the enemy can also use abilities/attack.
  // mage-spellbreaker holders are immune and excluded from the target pool.
  if (enemy.special.some((sp) => sp.kind === "silenceRandom") && rng() < 0.4) {
    const silenceable = livingParty.filter(
      (c) => !perksForCharacter(c).some((p) => p.id === "mage-spellbreaker")
    );
    const target = pickRandom(silenceable.length > 0 ? silenceable : livingParty, rng);
    if (target && !perksForCharacter(target).some((p) => p.id === "mage-spellbreaker")) {
      s.silencedThisRound.push(target.id);
      emit(`${enemy.name} casts Silence on ${target.name}!`, {
        type: "silence",
        actorId: enemy.instanceId,
        targetId: target.id,
      });
      return { kind: "silence", actor: enemy };
    }
  }

  // Enemy abilities: check conditions + cooldowns, weighted random pick.
  // Abilities are checked BEFORE the legacy caster/melee logic so that
  // enemies with abilities prioritize them. If no ability is valid this
  // turn, fall through to the default behavior.
  const abilityPick = pickEnemyAbility(s, enemy, rng);
  if (abilityPick) {
    // Weighted mix with basic attacks so scaled melee stays threatening.
    const useAbility = rng() < abilityPick.ability.weight / (abilityPick.ability.weight + 2);
    if (useAbility) {
      // Wind-up abilities telegraph instead of resolving: the party gets a
      // full round to answer (disable, Defend, blind, or kill).
      if (abilityPick.ability.windUp) {
        s.windUps[enemy.instanceId] = {
          abilityId: abilityPick.ability.id,
          name: abilityPick.ability.name,
          targetId: abilityPick.targetId,
        };
        emit(`${enemy.name} begins charging ${abilityPick.ability.name}!`, {
          type: "telegraph", actorId: enemy.instanceId, abilityId: abilityPick.ability.id,
        });
        return { kind: "doNothing", actor: enemy };
      }
      return {
        kind: "ability",
        actor: enemy,
        abilityId: abilityPick.ability.id,
        targetId: abilityPick.targetId ?? "",
      };
    }
  }

  if (isCasterEnemy(enemy)) {
    const healerSpecial = enemy.special.find(
      (sp): sp is Extract<EnemySpecial, { kind: "healer" }> => sp.kind === "healer"
    );
    const casterSpecial = enemy.special.find(
      (sp): sp is Extract<EnemySpecial, { kind: "caster" }> => sp.kind === "caster"
    );

    // Healer: cast a heal on the most-wounded living ally (if any).
    if (healerSpecial) {
      const wounded = [...s.enemies.front, ...s.enemies.back].filter(
        (e) => e.currentHp > 0 && e.currentHp < e.hp
      );
      const target = wounded.sort((a, b) => a.currentHp - b.currentHp)[0];
      if (target) {
        const spell = spellByName(healerSpecial.spellName);
        return {
          kind: "cast",
          actor: enemy,
          spellId: spell?.id ?? healerSpecial.spellName,
          targetId: target.instanceId,
        };
      }
    }

    // Caster: fling an elemental spell at a random party member.
    if (casterSpecial) {
      // Skip hidden characters for single-target spells
      const targetable = livingParty.filter((c) => !c.status.includes("hidden"));
      const target = pickRandom(targetable.length > 0 ? targetable : livingParty, rng);
      if (target) {
        const spellName = casterSpecial.element === "cold" ? "Cone of Cold" : "Fire Bolt";
        const spell = spellByName(spellName);
        return { kind: "cast", actor: enemy, spellId: spell?.id ?? spellName, targetId: target.id };
      }
    }

    // Fallback: no valid cast — attack instead. Casters ignore summoned allies.
    const targetable = livingParty.filter((c) => !c.status.includes("hidden"));
    const target = pickRandom(targetable.length > 0 ? targetable : livingParty, rng);
    if (target) return { kind: "attack", actor: enemy, target: { kind: "party", id: target.id } };
    return { kind: "doNothing", actor: enemy };
  }

  // Melee: prefer targeting summoned allies (they act as a front line),
  // then use weighted 70% front row on the party.
  const target = pickMeleeTarget(s.party, s.summonedAllies, rng, s.tauntingIds);
  if (target) return { kind: "attack", actor: enemy, target };
  return { kind: "doNothing", actor: enemy };
}

/**
 * Check if any hidden characters should be spotted this round.
 * Spot chance is based on enemy level vs character level + AGI.
 * Returns true if a hidden character was spotted.
 */
function checkSpotHidden(
  s: CombatState,
  rng: Rng,
  _log: (m: string) => void,
  emit: (m: string, e: CombatEvent) => void
): boolean {
  const hiddenChars = s.party.filter((c) => c.status.includes("hidden"));
  if (hiddenChars.length === 0) return false;
  
  const allEnemies = [...s.enemies.front, ...s.enemies.back].filter((e) => e.currentHp > 0);
  if (allEnemies.length === 0) return false;
  
  let spotted = false;
  for (const char of hiddenChars) {
    // Spot chance: (enemy level - char level + 10) * 5%, clamped to 10-50%
    // Higher level enemies are better at spotting
    const enemyLevel = Math.max(1, allEnemies[0].hp / 10); // Rough estimate of enemy level
    const charLevel = char.level;
    const charAgi = effStatsFor(s, char).agi;
    
    // Base spot chance + enemy level advantage - character AGI advantage
    let spotChance = 0.2 + (enemyLevel - charLevel) * 0.05 - (charAgi - 10) * 0.01;
    spotChance = Math.max(0.1, Math.min(0.5, spotChance)); // Clamp between 10% and 50%
    
    if (rng() < spotChance) {
      char.status = char.status.filter((st) => st !== "hidden");
      emit(`${char.name} is spotted by the enemies!`, { type: "spotted", actorId: char.id });
      spotted = true;
    }
  }
  
  return spotted;
}

/**
 * Weighted random selection for enemy melee targeting.
 * Summoned allies are preferred as a front line. If no allies are alive,
 * 70% chance to pick from the living party front row, otherwise any living
 * party member. Implemented as an actual weighted draw.
 */
function protectedFormationSlots(party: Character[]): Set<number> {
  const protectedSlots = new Set<number>();
  for (const c of party) {
    if (c.hp <= 0) continue;
    if (c.formationSlot > 2) continue;
    if (!perksForCharacter(c).some((p) => p.id === "fighter-protector")) continue;
    protectedSlots.add(c.formationSlot + 3);
  }
  return protectedSlots;
}

function pickMeleeTarget(
  party: Character[],
  allies: SummonedAlly[],
  rng: Rng,
  tauntingIds: string[] = []
): EnemyAttackTarget | undefined {
  const livingAllies = allies.filter((a) => a.hp > 0);
  if (livingAllies.length > 0 && rng() < SUMMON_MELEE_SOAK_CHANCE) {
    const ally = pickRandom(livingAllies, rng);
    if (ally) return { kind: "ally", id: ally.id };
  }

  const living = party.filter((c) => c.hp > 0);
  if (living.length === 0) return undefined;

  // Taunt: if any living party member is taunting, enemies must target them.
  const taunting = living.filter((c) => tauntingIds.includes(c.id));
  if (taunting.length > 0) {
    const target = pickRandom(taunting, rng);
    if (target) return { kind: "party", id: target.id };
  }

  // Skip hidden characters (they can't be targeted by single-target attacks)
  // and slots protected by a living Fighter with Protector.
  const protectedSlots = protectedFormationSlots(party);
  const targetable = living.filter(
    (c) => !c.status.includes("hidden") && !protectedSlots.has(c.formationSlot)
  );
  if (targetable.length === 0) return undefined;

  const frontLiving = targetable.filter((c) => charRow(c) === "front");
  if (frontLiving.length > 0 && rng() < 0.7) {
    const target = pickRandom(frontLiving, rng);
    if (target) return { kind: "party", id: target.id };
  }
  const target = pickRandom(targetable, rng);
  return target ? { kind: "party", id: target.id } : undefined;
}

function pickRandom<T>(arr: T[], rng: Rng): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}

// ---------------------------------------------------------------------------
// Player action resolution
// ---------------------------------------------------------------------------

/** Rage a character starts combat with: half their pool for technique classes, 0 for casters. */
function startingRageFor(char: Character): number {
  if (!classHasTechniques(char.class)) return 0;
  return Math.floor(maxRageForLevel(char.level) / 2);
}

/** Add rage to a character (capped at maxRage). No-op for non-technique classes. */
function gainRage(s: CombatState, charId: string, amount: number): void {
  if (!(charId in s.rage)) return;
  const char = s.party.find((c) => c.id === charId);
  if (!char || !classHasTechniques(char.class)) return;
  const cap = maxRageForLevel(char.level);
  s.rage[charId] = Math.min(cap, (s.rage[charId] ?? 0) + amount);
}

/** Spend rage for a technique. Returns true if the character had enough. */
function spendRage(s: CombatState, charId: string, cost: number): boolean {
  const current = s.rage[charId] ?? 0;
  if (current < cost) return false;
  s.rage[charId] = current - cost;
  return true;
}

function resolvePlayerAction(
  s: CombatState,
  action: PlayerAction,
  rng: Rng,
  log: (m: string) => void,
  emit: (m: string, e: CombatEvent) => void
): void {
  const actor = s.party.find((c) => c.id === action.actorId);
  if (!actor || actor.hp <= 0) return;

  switch (action.kind) {
    case "attack":
      resolveAttack(s, actor, action.targetInstanceId, rng, log, emit);
      gainRage(s, actor.id, 2);
      break;
    case "cast":
      resolveCast(s, actor, action, rng, log, emit);
      break;
    case "technique":
      resolveTechnique(s, actor, action, rng, log, emit);
      break;
    case "defend":
      resolveDefend(s, actor, rng, emit);
      break;
    case "item":
      resolveItem(s, actor, action, log, emit);
      break;
    case "flee":
      resolveDefend(s, actor, rng, emit);
      break;
    case "hide":
      resolveHide(s, actor, rng, emit);
      break;
    case "ambush":
      resolveAmbush(s, actor, action.targetInstanceId, rng, log, emit);
      gainRage(s, actor.id, 2);
      break;
    case "analyze":
      resolveAnalyze(s, actor, action.targetInstanceId, log, emit);
      break;
    case "move":
      resolveMove(s, actor, action.targetAllyId, log);
      break;
  }
}

function resolveAttack(
  s: CombatState,
  actor: Character,
  targetInstanceId: string,
  rng: Rng,
  log: (m: string) => void,
  emit: (m: string, e: CombatEvent) => void
): void {
  const target = findEnemy(s, targetInstanceId);
  if (!target) {
    emit(
      `${actor.name} attacks but finds no target.`,
      { type: "miss", actorId: actor.id, targetId: "", reason: "noTarget" }
    );
    dispatchHook("OnAttackMiss", perksForCharacter(actor), {
      state: s.perkState[actor.id],
      rng,
    });
    return;
  }

  // Formation check (Section 7.4): weapon range determines reachability.
  // Back-row enemies are immune to short-range weapons until front row is cleared.
  const loadout = s.loadout[actor.id];
  const weapon = loadout?.weapon;
  const weaponRange: WeaponRange = effectiveWeaponRange(actor, weapon?.range ?? "close"); // Default to close range if no weapon

  // Check if attacker can reach the target based on position and weapon range
  if (!canReach(actor.formationSlot, weaponRange, target.row)) {
    const reason =
      target.row === "back" && s.enemies.front.some((e) => e.currentHp > 0)
        ? `cannot reach ${target.name} in the back row (front row still up)`
        : `cannot reach ${target.name} from this position`;
    log(`${actor.name} ${reason} with their ${weapon?.name || "weapon"}.`);
    emit(
      `${actor.name} ${reason}.`,
      { type: "miss", actorId: actor.id, targetId: target.instanceId, reason: "noTarget" }
    );
    return;
  }

  // Feint / next-attack bonus applies to basic attacks too.
  const nextBonus = s.nextAttackBonuses[actor.id];
  const guaranteedHit = nextBonus?.hitChance !== undefined && nextBonus.hitChance >= 1;
  let feintCritBonus = 0;
  if (nextBonus) {
    feintCritBonus = nextBonus.critChance;
    delete s.nextAttackBonuses[actor.id];
  }

  // BeforeAttack hooks (e.g. Ambusher, Shadow, Momentum, Perfect Timing).
  let damageMultiplier = 1;
  let forcedCrit = false;
  let forcedHit = guaranteedHit;
  dispatchHook("BeforeAttack", perksForCharacter(actor), {
    state: s.perkState[actor.id],
    rng,
    targetId: target.instanceId,
    applyDamageMultiplier: (mult: number) => {
      damageMultiplier *= mult;
    },
    forceCrit: () => {
      forcedCrit = true;
    },
    guaranteeHit: () => {
      forcedHit = true;
    },
    isFromHide: actor.status.includes("hidden"),
    round: s.round,
  });

  // Evasive enemies have a dodge chance (skipped by guaranteed hits).
  if (!forcedHit && target.special.some((sp) => sp.kind === "evasive")) {
    if (rng() < 0.2) {
      emit(
        `${target.name} evades ${actor.name}'s attack!`,
        { type: "miss", actorId: actor.id, targetId: target.instanceId, reason: "evade" }
      );
      dispatchHook("OnAttackMiss", perksForCharacter(actor), {
        state: s.perkState[actor.id],
        rng,
      });
      return;
    }
  }

  // Flying enemies are hard to reach with true melee weapons (15% miss for close range).
  if (!forcedHit && target.special.some((sp) => sp.kind === "flying") && weaponRange === "close") {
    if (rng() < 0.15) {
      emit(
        `${target.name} flits away from ${actor.name}'s swing!`,
        { type: "miss", actorId: actor.id, targetId: target.instanceId, reason: "evade" }
      );
      dispatchHook("OnAttackMiss", perksForCharacter(actor), {
        state: s.perkState[actor.id],
        rng,
      });
      return;
    }
  }

  // Blind: 50% hit rate (Section 7.5). Guaranteed hits ignore it.
  if (!forcedHit && actor.status.includes("blind")) {
    if (rng() >= 0.5) {
      emit(
        `${actor.name} is blind and misses ${target.name}.`,
        { type: "miss", actorId: actor.id, targetId: target.instanceId, reason: "blind" }
      );
      dispatchHook("OnAttackMiss", perksForCharacter(actor), {
        state: s.perkState[actor.id],
        rng,
      });
      return;
    }
  }

  const effStats = effStatsFor(s, actor);
  const mods = perkModifiers(perksForCharacter(actor), effStats);
  const weaponBonus = weapon?.attackBonus ?? 0;
  const attackDebuff = s.attackDebuffs[actor.id]?.penalty ?? 0;
  const base = Math.max(1, effStats.str + actor.level + weaponBonus - attackDebuff);
  // Back-row attackers deal ~40% melee damage when forced to fight at close
  // range. A weapon with reach (short/medium/long) lets them strike effectively.
  // Thieves deal full damage from the back row (§4.2).
  const isThief = actor.class === "Thief";
  const rowMultiplier =
    charRow(actor) === "back" && weaponRange === "close" && !isThief ? 0.4 : 1;
  const variance = 0.8 + rng() * 0.4; // +/-20%
  let damage = Math.max(
    1,
    Math.round(base * rowMultiplier * variance * mods.meleeDamageMultiplier)
  ) + mods.meleeBonusDamage;

  // Undead / demon damage bonuses (Turn Undead, Judge, Inquisitor).
  damageMultiplier *= tagDamageMultiplier(mods, target);

  // Apply reactive multipliers from BeforeAttack hooks before AC reduction.
  damage = Math.max(1, Math.round(damage * damageMultiplier));

  // Damage buff (Battle Cry) — same timing as technique damage, so a Fighter
  // who used Battle Cry then falls back to basic Attacks still benefits.
  const dmgBuff = s.damageBuffs[actor.id];
  if (dmgBuff) {
    damage = Math.max(1, Math.round(damage * dmgBuff.multiplier));
  }

  // halberdier-warlord: +20% damage while adjacent to a living Warlord holder.
  damage = Math.max(1, Math.round(damage * warlordDamageMultiplier(s, actor)));

  // Critical hit: chance based on effective LUK, capped at 25%.
  // thief-assassin: +25% crit vs enemies suffering any status effect,
  // deliberately allowed to exceed the base cap.
  let crit = false;
  let critChance = critChanceFromLukAndBonuses(
    effStats.luk,
    mods.critChanceBonus,
    feintCritBonus
  );
  if (
    target.status.length > 0 &&
    perksForCharacter(actor).some((p) => p.id === "thief-assassin")
  ) {
    critChance += 0.25;
  }
  if (forcedCrit || rng() < critChance) {
    damage = Math.max(1, Math.round(damage * mods.critDamageMultiplier));
    crit = true;
    log(`${actor.name} lands a critical hit!`);
    // OnCriticalHit hooks (e.g. Perfect Timing arming its next attack).
    dispatchHook("OnCriticalHit", perksForCharacter(actor), {
      state: s.perkState[actor.id],
      rng,
      targetId: target.instanceId,
    });
  }

  // Enemy AC reduces physical damage (with Disarm debuffs applied).
  // thief-backstab: attacks made from the back row ignore 25% of enemy AC.
  // halberdier-reach-mastery: flat AC points ignored (acFlatIgnore).
  const acIgnoreFactor =
    charRow(actor) === "back" &&
    perksForCharacter(actor).some((p) => p.id === "thief-backstab")
      ? 0.75
      : 1;
  // Flat AC reduction is capped at 50% of the incoming swing (P2-8); perk
  // penetration (Reach Mastery's flat ignore, backstab's factor) applies on
  // top of the floored value so it still pierces high-AC walls.
  const flooredAc = Math.min(effectiveEnemyAc(s, target), Math.floor(damage / 2));
  const acReduction = Math.max(0, Math.round((flooredAc - mods.acFlatIgnore) * acIgnoreFactor));
  damage = Math.max(1, damage - acReduction);

  // highDefense enemies (Animated Armor) halve physical damage.
  if (target.special.some((sp) => sp.kind === "highDefense")) {
    damage = Math.max(1, Math.round(damage * 0.5));
  }

  // resistPhysical special (e.g. Acid Puddle 50%).
  const resist = target.special.find(
    (sp): sp is Extract<EnemySpecial, { kind: "resistPhysical" }> =>
      sp.kind === "resistPhysical"
  );
  if (resist) {
    damage = Math.max(1, Math.round(damage * (1 - resist.percent / 100)));
  }

  target.currentHp -= damage;
  emit(
    `${actor.name} attacks ${target.name} for ${damage} damage.`,
    { type: "attack", actorId: actor.id, targetId: target.instanceId, damage, range: weaponRange, crit }
  );
  wakeOnDamage(target, log);

  // OnAttackHit hooks (e.g. Cleave, Warmaster, Swashbuckler, Dark Templar).
  dispatchHook("OnAttackHit", perksForCharacter(actor), {
    state: s.perkState[actor.id],
    rng,
    damage,
    strikeSameTarget: (dmg: number) => {
      if (target.currentHp <= 0) return;
      target.currentHp -= dmg;
      emit(
        `${actor.name} strikes ${target.name} again for ${dmg} damage!`,
        {
          type: "attack",
          actorId: actor.id,
          targetId: target.instanceId,
          damage: dmg,
          range: weaponRange,
        }
      );
      wakeOnDamage(target, log);
    },
    healSelf: (amount: number) => {
      if (actor.hp <= 0 || actor.hp >= actor.maxHp) return;
      const before = actor.hp;
      actor.hp = Math.min(actor.maxHp, actor.hp + amount);
      emit(
        `${actor.name} drains ${actor.hp - before} HP.`,
        { type: "spellEffect", spellId: "lifesteal", targetId: actor.id, heal: actor.hp - before }
      );
    },
    dealCleaveDamage: (dmg: number) => {
      const front = s.enemies.front.filter(
        (e) => e.currentHp > 0 && e.instanceId !== target.instanceId
      );
      const other = pickRandom(front, rng);
      if (!other) return;
      other.currentHp -= dmg;
      emit(
        `${actor.name} cleaves ${other.name} for ${dmg} damage!`,
        {
          type: "attack",
          actorId: actor.id,
          targetId: other.instanceId,
          damage: dmg,
          range: weaponRange,
        }
      );
      wakeOnDamage(other, log);
    },
    hitAllFrontRow: (dmg: number) => {
      for (const other of s.enemies.front.filter(
        (e) => e.currentHp > 0 && e.instanceId !== target.instanceId
      )) {
        other.currentHp -= dmg;
        emit(
          `${actor.name} strikes ${other.name} for ${dmg} damage!`,
          {
            type: "attack",
            actorId: actor.id,
            targetId: other.instanceId,
            damage: dmg,
            range: weaponRange,
          }
        );
        wakeOnDamage(other, log);
      }
    },
  });
}

function resolveCast(
  s: CombatState,
  actor: Character,
  action: Extract<PlayerAction, { kind: "cast" }>,
  rng: Rng,
  log: (m: string) => void,
  emit: (m: string, e: CombatEvent) => void
): void {
  if (s.silencedThisRound.includes(actor.id)) {
    log(`${actor.name} is silenced and cannot cast.`);
    return;
  }
  if (s.inAntimagic) {
    emit(
      `${actor.name}'s spell fizzles — this is an anti-magic zone.`,
      { type: "fizzle", actorId: actor.id }
    );
    return;
  }
  // Fizzle field on the party can cause spells to fail.
  if (s.partyFizzleField > 0) {
    const fizzleChance = s.partyFizzleField / (s.partyFizzleField + actor.level);
    if (rng() < fizzleChance) {
      emit(
        `${actor.name}'s spell fizzles in the enemy's anti-magic field.`,
        { type: "fizzle", actorId: actor.id }
      );
      return;
    }
  }
  const spell = s.spells[action.spellId];
  if (!spell) {
    log(`${actor.name} tries to cast an unknown spell.`);
    return;
  }
  if (!actor.knownSpellIds.includes(spell.id)) {
    log(`${actor.name} does not know ${spell.name}.`);
    return;
  }

  const effStats = effStatsFor(s, actor);
  const mods = perkModifiers(perksForCharacter(actor), effStats);
  const pstate = s.perkState[actor.id];

  // Arcane Surge: next cast after 50 SP spent is free and deals +50% damage.
  const isSurgeSpell = !!pstate.surgeReady && !pstate.surgeUsed;
  if (isSurgeSpell) {
    pstate.surgeUsed = true;
  }

  const spellKind = spell.effect.kind === "heal" ? "heal" : "damage";
  let spCost = Math.ceil(spell.spCost * mods.spCostMultiplierFor(spellKind));
  if (isSurgeSpell) spCost = 0;

  // OnSpellCast hooks (e.g. Archmage free spells, Arcane Surge SP tracking).
  let spellFree = false;
  dispatchHook("OnSpellCast", perksForCharacter(actor), {
    state: pstate,
    rng,
    spCost,
    makeSpellFree: () => {
      spellFree = true;
    },
  });
  if (spellFree) spCost = 0;

  if (actor.sp < spCost) {
    log(`${actor.name} lacks the SP to cast ${spell.name}.`);
    return;
  }
  actor.sp -= spCost;

  // Determine target id for the cast event (may be null for group spells).
  let targetId: string | null = null;
  if (action.targetInstanceId) targetId = action.targetInstanceId;
  else if (action.targetAllyId) targetId = action.targetAllyId;
  emit(
    `${actor.name} casts ${spell.name}.`,
    { type: "cast", actorId: actor.id, spellId: spell.id, targetId }
  );

  const powerMultiplier = isSurgeSpell ? 1.5 : 1;
  applySpell(s, actor, spell, action, rng, log, emit, powerMultiplier);

  // OnSpellResolve hooks (e.g. Spell Echo, Chain Caster). Guards prevent
  // either effect from re-triggering off its own extra cast.
  let echoTriggered = false;
  let chainTriggered = false;
  dispatchHook("OnSpellResolve", perksForCharacter(actor), {
    state: pstate,
    rng,
    repeatSpellFree: () => {
      if (echoTriggered) return;
      echoTriggered = true;
      applySpell(s, actor, spell, action, rng, log, emit, 1);
    },
    chainToSecondTarget:
      spell.effect.kind === "damage" && spell.target === "singleEnemy"
        ? () => {
            if (chainTriggered) return;
            chainTriggered = true;
            const others = [...s.enemies.front, ...s.enemies.back].filter(
              (e) => e.currentHp > 0 && e.instanceId !== action.targetInstanceId
            );
            const second = pickRandom(others, rng);
            if (!second) return;
            log(`${spell.name} arcs to ${second.name}!`);
            applySpell(
              s,
              actor,
              spell,
              { ...action, targetInstanceId: second.instanceId },
              rng,
              log,
              emit,
              powerMultiplier
            );
          }
        : undefined,
  });
}

function resolveDefend(
  s: CombatState,
  actor: Character,
  rng: Rng,
  emit: (m: string, e: CombatEvent) => void
): void {
  // halberdier-brace: Defend reduces damage by 60% instead of the base 50%.
  const mods = perkModifiers(perksForCharacter(actor), effStatsFor(s, actor));
  s.defendBuff[actor.id] = mods.defendReduction;
  emit(`${actor.name} defends.`, { type: "defend", actorId: actor.id });

  // crusader-holy-shield: Defending also grants +20% defense for 2 rounds,
  // on top of the base Defend reduction above.
  dispatchHook("OnDefend", perksForCharacter(actor), {
    state: s.perkState[actor.id],
    rng,
    grantDefenseBuff: (multiplier: number, duration: number) => {
      s.holyShieldBuffs[actor.id] = { multiplier, duration };
    },
  });
}

function resolveHide(
  s: CombatState,
  actor: Character,
  rng: Rng,
  emit: (m: string, e: CombatEvent) => void
): void {
  // Only the Thief class can hide
  if (actor.class !== "Thief") {
    emit(`${actor.name} cannot hide.`, { type: "fizzle", actorId: actor.id });
    return;
  }

  // Remove exposed status if present
  if (actor.status.includes("exposed")) {
    actor.status = actor.status.filter((st) => st !== "exposed");
  }

  // Add hidden status
  if (!actor.status.includes("hidden")) {
    actor.status.push("hidden");
    emit(`${actor.name} hides in the shadows.`, { type: "hide", actorId: actor.id });
    // thief-shadow-dance: track Hide uses this combat; the handler flags
    // "danceReady" on the second use, consumed by the next Ambush.
    dispatchHook("OnHide", perksForCharacter(actor), {
      state: s.perkState[actor.id],
      rng,
    });
  } else {
    emit(`${actor.name} is already hidden.`, { type: "fizzle", actorId: actor.id });
  }
}

function resolveAmbush(
  s: CombatState,
  actor: Character,
  targetInstanceId: string,
  rng: Rng,
  log: (m: string) => void,
  emit: (m: string, e: CombatEvent) => void
): void {
  // Only the Thief class can ambush
  if (actor.class !== "Thief") {
    emit(`${actor.name} cannot ambush.`, { type: "fizzle", actorId: actor.id });
    return;
  }
  
  // Must be hidden to ambush
  if (!actor.status.includes("hidden")) {
    emit(`${actor.name} is not hidden and cannot ambush.`, { type: "fizzle", actorId: actor.id });
    return;
  }
  
  const target = findEnemy(s, targetInstanceId);
  if (!target) {
    emit(
      `${actor.name} ambushes but finds no target.`,
      { type: "miss", actorId: actor.id, targetId: "", reason: "noTarget" }
    );
    return;
  }
  
  // Remove hidden status and add exposed status
  actor.status = actor.status.filter((st) => st !== "hidden");
  if (!actor.status.includes("exposed")) {
    actor.status.push("exposed");
  }

  // Ambush ignores weapon range (can target any enemy from any position)
  // Calculate damage with double damage bonus
  const loadout = s.loadout[actor.id];
  const weapon = loadout?.weapon;
  const weaponBonus = weapon?.attackBonus ?? 0;
  const effStats = effStatsFor(s, actor);
  const mods = perkModifiers(perksForCharacter(actor), effStats);
  const base = effStats.str + actor.level + weaponBonus;

  // Ambush always deals full damage regardless of position
  const variance = 0.8 + rng() * 0.4; // +/-20%
  let damage = Math.max(
    1,
    Math.round(base * variance * 2 * mods.meleeDamageMultiplier)
  ) + mods.meleeBonusDamage;
  damage = Math.max(1, Math.round(damage * tagDamageMultiplier(mods, target)));
  // halberdier-warlord: +20% damage while adjacent to a living Warlord holder.
  damage = Math.max(1, Math.round(damage * warlordDamageMultiplier(s, actor)));

  // BeforeAttack hooks (e.g. Ambusher's forced crit on the first attack of
  // combat, which Ambush frequently is). Same dispatch shape as resolveAttack.
  let forcedCrit = false;
  dispatchHook("BeforeAttack", perksForCharacter(actor), {
    state: s.perkState[actor.id],
    rng,
    targetId: target.instanceId,
    applyDamageMultiplier: (mult: number) => {
      damage = Math.max(1, Math.round(damage * mult));
    },
    forceCrit: () => {
      forcedCrit = true;
    },
    guaranteeHit: () => {},
    isFromHide: true,
    round: s.round,
  });

  // Critical hit: same LUK/bonus formula and thief-assassin status bonus as
  // resolveAttack, so a Thief's own class perks apply to their signature verb.
  let crit = false;
  let critChance = critChanceFromLukAndBonuses(effStats.luk, mods.critChanceBonus);
  if (
    target.status.length > 0 &&
    perksForCharacter(actor).some((p) => p.id === "thief-assassin")
  ) {
    critChance += 0.25;
  }
  if (forcedCrit || rng() < critChance) {
    damage = Math.max(1, Math.round(damage * mods.critDamageMultiplier));
    crit = true;
    log(`${actor.name} lands a critical ambush!`);
    dispatchHook("OnCriticalHit", perksForCharacter(actor), {
      state: s.perkState[actor.id],
      rng,
      targetId: target.instanceId,
    });
  }

  // thief-shadow-dance: after 2 Hides this combat, the next Ambush ignores
  // an extra 50% of the AC reduction. Read+consumed directly off perkState
  // (set by the OnHide handler in perks.ts) rather than a second hook.
  const ambushPerkState = s.perkState[actor.id] as { danceReady?: boolean } | undefined;
  const shadowDanceActive = !!ambushPerkState?.danceReady;
  if (shadowDanceActive && ambushPerkState) {
    ambushPerkState.danceReady = false;
  }

  // Enemy AC reduces physical damage (with Disarm debuffs applied), capped at
  // 50% of the incoming swing (P2-8); Reach Mastery's flat ignore, thief-
  // backstab's back-row 25% ignore, and thief-shadow-dance's 50% ignore all
  // apply on top, matching resolveAttack (backstab) and stacking with it.
  const acIgnoreFactor =
    (charRow(actor) === "back" &&
    perksForCharacter(actor).some((p) => p.id === "thief-backstab")
      ? 0.75
      : 1) * (shadowDanceActive ? 0.5 : 1);
  const flooredAc = Math.min(effectiveEnemyAc(s, target), Math.floor(damage / 2));
  const acReduction = Math.max(0, Math.round((flooredAc - mods.acFlatIgnore) * acIgnoreFactor));
  let reduced = Math.max(1, damage - acReduction);

  // highDefense / resistPhysical specials, same as resolveAttack.
  if (target.special.some((sp) => sp.kind === "highDefense")) {
    reduced = Math.max(1, Math.round(reduced * 0.5));
  }
  const resist = target.special.find(
    (sp): sp is Extract<EnemySpecial, { kind: "resistPhysical" }> => sp.kind === "resistPhysical"
  );
  if (resist) {
    reduced = Math.max(1, Math.round(reduced * (1 - resist.percent / 100)));
  }

  target.currentHp -= reduced;

  emit(
    `${actor.name} ambushes ${target.name} for ${reduced} damage!`,
    { type: "ambush", actorId: actor.id, targetId: target.instanceId, damage: reduced, crit }
  );
  wakeOnDamage(target, log);

  // OnAttackHit hooks (e.g. Cleave, Warmaster, Dark Templar lifesteal),
  // same callback shapes as resolveAttack, so Ambush isn't a blind spot for
  // reactive on-hit perks.
  dispatchHook("OnAttackHit", perksForCharacter(actor), {
    state: s.perkState[actor.id],
    rng,
    damage: reduced,
    strikeSameTarget: (dmg: number) => {
      if (target.currentHp <= 0) return;
      target.currentHp -= dmg;
      emit(
        `${actor.name} strikes ${target.name} again for ${dmg} damage!`,
        { type: "attack", actorId: actor.id, targetId: target.instanceId, damage: dmg }
      );
      wakeOnDamage(target, log);
    },
    healSelf: (amount: number) => {
      if (actor.hp <= 0 || actor.hp >= actor.maxHp) return;
      const before = actor.hp;
      actor.hp = Math.min(actor.maxHp, actor.hp + amount);
      emit(
        `${actor.name} drains ${actor.hp - before} HP.`,
        { type: "spellEffect", spellId: "lifesteal", targetId: actor.id, heal: actor.hp - before }
      );
    },
    dealCleaveDamage: (dmg: number) => {
      const front = s.enemies.front.filter(
        (e) => e.currentHp > 0 && e.instanceId !== target.instanceId
      );
      const other = pickRandom(front, rng);
      if (!other) return;
      other.currentHp -= dmg;
      emit(
        `${actor.name} cleaves ${other.name} for ${dmg} damage!`,
        { type: "attack", actorId: actor.id, targetId: other.instanceId, damage: dmg }
      );
      wakeOnDamage(other, log);
    },
    hitAllFrontRow: (dmg: number) => {
      for (const other of s.enemies.front.filter(
        (e) => e.currentHp > 0 && e.instanceId !== target.instanceId
      )) {
        other.currentHp -= dmg;
        emit(
          `${actor.name} strikes ${other.name} for ${dmg} damage!`,
          { type: "attack", actorId: actor.id, targetId: other.instanceId, damage: dmg }
        );
        wakeOnDamage(other, log);
      }
    },
  });
}

/**
 * Analyze: spend the turn to reveal a species' intel for the rest of the
 * fight — its elemental affinities (into observedAffinity for WK/RES tags)
 * and its trait specials (enemy-window trait tags read analyzedEnemies).
 */
function resolveAnalyze(
  s: CombatState,
  actor: Character,
  targetInstanceId: string,
  log: (m: string) => void,
  emit: (m: string, e: CombatEvent) => void
): void {
  const target = findEnemy(s, targetInstanceId);
  if (!target) {
    log(`${actor.name} analyzes but finds no target.`);
    return;
  }
  s.analyzedEnemies[target.name] = true;
  const entry = s.observedAffinity[target.name] ?? { weak: [], resist: [] };
  for (const sp of target.special) {
    if (sp.kind === "weakElement" && !entry.weak.includes(sp.element)) entry.weak.push(sp.element);
    if (sp.kind === "resistElement" && !entry.resist.includes(sp.element)) entry.resist.push(sp.element);
  }
  s.observedAffinity[target.name] = entry;
  emit(`${actor.name} analyzes ${target.name}!`, {
    type: "analyze", actorId: actor.id, targetId: target.instanceId,
  });
}

/**
 * Move (row swap): the actor trades rows with a living ally (targetAllyId)
 * or slides into the opposite row's first empty slot. Implemented as a
 * reorder of s.party plus formationSlot normalization — the combat scene
 * reads party positions from the array per frame, and reach / front-first
 * targeting / protector slots all recompute from the same invariant.
 * Log-only: the reposition is its own visible feedback.
 */
function resolveMove(
  s: CombatState,
  actor: Character,
  targetAllyId: string | undefined,
  log: (m: string) => void
): void {
  const toRow = charRow(actor) === "front" ? "back" : "front";

  if (targetAllyId) {
    const ally = s.party.find((c) => c.id === targetAllyId);
    if (!ally || ally.id === actor.id || ally.hp <= 0 || charRow(ally) !== toRow) {
      log(`${actor.name} can't swap rows with that ally.`);
      return;
    }
    const ai = s.party.findIndex((c) => c.id === actor.id);
    const bi = s.party.findIndex((c) => c.id === ally.id);
    [s.party[ai], s.party[bi]] = [s.party[bi], s.party[ai]];
    s.party.forEach((c, i) => (c.formationSlot = i));
    log(`${actor.name} and ${ally.name} swap rows!`);
    return;
  }

  // Slide into the opposite row's first empty slot.
  const others = s.party.filter((c) => c.id !== actor.id);
  const inRow = others.filter((c) => charRow(c) === toRow).length;
  if (inRow >= 3) {
    log(`${actor.name} has no room to move to the ${toRow} row.`);
    return;
  }
  if (toRow === "back" && others.length < 3) {
    log(`${actor.name} has no back row to fall back to.`);
    return;
  }
  others.forEach((c, i) => (c.formationSlot = i));
  const boundary = Math.min(toRow === "front" ? inRow : 3 + inRow, others.length);
  others.splice(boundary, 0, actor);
  s.party = others;
  s.party.forEach((c, i) => (c.formationSlot = i));
  log(toRow === "back" ? `${actor.name} falls back!` : `${actor.name} steps forward!`);
}

function resolveItem(
  s: CombatState,
  actor: Character,
  action: Extract<PlayerAction, { kind: "item" }>,
  log: (m: string) => void,
  emit: (m: string, e: CombatEvent) => void
): void {
  const item = s.items[action.itemId];
  if (!item) {
    log(`${actor.name} tries to use an unknown item.`);
    return;
  }
  if (item.type !== "consumable" || !item.effect) {
    log(`${actor.name} cannot use ${item.name} in combat.`);
    return;
  }
  const count = s.inventory[action.itemId] ?? 0;
  if (count <= 0) {
    log(`${actor.name} tries to use ${item.name} but has none left.`);
    return;
  }
  const targetId = action.targetAllyId ?? actor.id;
  const target = s.party.find((c) => c.id === targetId);
  if (!target) {
    log(`${actor.name} has no valid target for ${item.name}.`);
    return;
  }
  const eff = item.effect;
  // Items emit a "cast" event carrying the item id, so the scene shows the
  // item-name banner + use animation exactly like a spell (the controller's
  // name lookup checks items as well as spells).
  if (eff.kind === "heal") {
    const amount = eff.power;
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    emit(
      `${actor.name} uses ${item.name} on ${target.name}, restoring ${target.hp - before} HP.`,
      { type: "cast", actorId: actor.id, spellId: item.id, targetId: target.id, heal: target.hp - before }
    );
    if (target.status.includes("knockedOut") && target.hp > 0) {
      target.status = target.status.filter((st) => st !== "knockedOut");
      emit(`${target.name} is revived!`, { type: "revived", targetId: target.id });
    }
  } else if (eff.kind === "cure") {
    target.status = target.status.filter((st) => st !== eff.status);
    if (eff.status === "poison") delete s.poisonState[target.id];
    else if (eff.status === "blind") delete s.blindTimers[target.id];
    else if (eff.status === "paralysis") delete s.paralysisTimers[target.id];
    else if (eff.status === "sleep") delete s.sleepTimers[target.id];
    emit(
      `${actor.name} uses ${item.name} on ${target.name}, curing ${eff.status}.`,
      { type: "cast", actorId: actor.id, spellId: item.id, targetId: target.id }
    );
    emit(
      `${target.name} is cured of ${eff.status}.`,
      { type: "spellEffect", spellId: item.id, targetId: target.id, statusCured: eff.status }
    );
  } else if (eff.kind === "revive") {
    if (target.status.includes("knockedOut")) {
      // Revive power is a percent of max HP (Phoenix Feather: 25%).
      target.hp = Math.max(1, Math.round(target.maxHp * (eff.power / 100)));
      target.status = target.status.filter((st) => st !== "knockedOut");
      emit(
        `${actor.name} uses ${item.name} to revive ${target.name} with ${target.hp} HP!`,
        { type: "cast", actorId: actor.id, spellId: item.id, targetId: target.id, heal: target.hp }
      );
      emit(`${target.name} is revived!`, { type: "revived", targetId: target.id });
    } else {
      log(`${item.name} has no effect on ${target.name}.`);
    }
  }

  // Consume the item from the combat inventory snapshot.
  s.inventory[action.itemId] = count - 1;
  if (s.inventory[action.itemId] === 0) {
    delete s.inventory[action.itemId];
  }
}

// ---------------------------------------------------------------------------
// Spell application
// ---------------------------------------------------------------------------

function applySpell(
  s: CombatState,
  caster: Character,
  spell: SpellDef,
  action: Extract<PlayerAction, { kind: "cast" }>,
  rng: Rng,
  log: (m: string) => void,
  emit: (m: string, e: CombatEvent) => void,
  powerMultiplier = 1
): void {
  const eff = spell.effect;
  const effStats = effStatsFor(s, caster);
  const castingStat =
    caster.class === "Mage"
      ? effStats.int
      : caster.class === "Priest" || caster.class === "Crusader"
      ? effStats.pie
      : 0;
  const castingBonus = Math.floor(castingStat / 4);

  switch (eff.kind) {
    case "damage": {
      // Perk spell-damage multiplier (Glass Cannon +30%).
      const casterMods = perkModifiers(perksForCharacter(caster), effStats);
      const spellMult = casterMods.spellDamageMultiplier;
      // halberdier-warlord: +20% damage while adjacent to a living Warlord
      // holder — applies to spell damage too, not just melee.
      const warlordMult = warlordDamageMultiplier(s, caster);
      for (const t of spellTargets(s, spell, action)) {
        // "undead" element only damages undead enemies (Sacred Flame, Sunburst).
        if (eff.element === "undead" && !t.special.some((sp) => sp.kind === "undead")) {
          emit(
            `${spell.name} has no effect on ${t.name} — not undead.`,
            {
              type: "spellEffect",
              spellId: spell.id,
              targetId: t.instanceId,
              statusInflicted: "no effect",
            }
          );
          continue;
        }
        // Undead / demon damage bonuses (Turn Undead, Judge, Inquisitor).
        const tagMult = tagDamageMultiplier(casterMods, t);
        const raw = Math.max(
          1,
          Math.round((eff.power + castingBonus) * powerMultiplier * spellMult * tagMult * warlordMult)
        );
        // Enemy AC reduces spell damage too (less than physical — half AC).
        const reduced = Math.max(1, raw - Math.floor(t.ac / 2));
        // Elemental affinity: resist (x0.5) / weak (x1.5) based on the target's special.
        // mage-spellbreaker: spells ignore half of the resistance penalty
        // (x0.5 -> x0.75); weakness bonuses are untouched.
        let final = reduced;
        if (eff.element) {
          const affinity = t.special.find(
            (sp) => (sp.kind === "resistElement" || sp.kind === "weakElement") && sp.element === eff.element
          );
          if (affinity) {
            const isResist = affinity.kind !== "weakElement";
            const hasSpellbreaker =
              isResist && perksForCharacter(caster).some((p) => p.id === "mage-spellbreaker");
            const affinityMult = isResist ? (hasSpellbreaker ? 0.75 : 0.5) : 1.5;
            final = Math.max(1, Math.round(reduced * affinityMult));
            observeAffinity(s, t, affinity.kind === "weakElement" ? "weak" : "resist", eff.element, log, emit);
          }
        }
        if (s.enemyMagicScreens[t.row] > 0) {
          final = Math.max(1, Math.round(final * 0.5));
        }
        t.currentHp -= final;
        emit(
          `${spell.name} hits ${t.name} for ${final} damage.`,
          { type: "spellEffect", spellId: spell.id, targetId: t.instanceId, damage: final }
        );
        wakeOnDamage(t, log);
        // Over-time followup (e.g. Meteor Swarm burn): recorded per enemy
        // instance and ticked at the end of each round.
        if (eff.followup?.kind === "dot" && t.currentHp > 0) {
          const dots = (s.enemyDots[t.instanceId] ??= []);
          const existing = dots.find((d) => d.spellId === spell.id);
          if (existing) {
            existing.duration = eff.followup.duration;
            existing.power = eff.followup.power;
          } else {
            dots.push({
              element: eff.followup.element,
              power: eff.followup.power,
              duration: eff.followup.duration,
              spellId: spell.id,
            });
          }
          emit(
            `${t.name} is burning!`,
            { type: "spellEffect", spellId: spell.id, targetId: t.instanceId, statusInflicted: "burn" }
          );
        }
      }
      break;
    }
    case "heal": {
      // priest-healers-touch: healing spells restore 30% more HP.
      const healMult = perkModifiers(
        perksForCharacter(caster),
        effStats
      ).healPowerMultiplier;
      const healPower = Math.max(
        1,
        Math.round((eff.power + castingBonus) * powerMultiplier * healMult)
      );
      // Single-target heals can also mend a summoned ally (they hold the
      // front line and soak hits). Summons have no statuses, so cure /
      // resurrect stay party-only.
      if (spell.target === "singleAlly" && action.targetAllyId) {
        const summon = s.summonedAllies.find(
          (a) => a.id === action.targetAllyId && a.hp > 0
        );
        if (summon) {
          const before = summon.hp;
          summon.hp = Math.min(summon.maxHp, summon.hp + healPower);
          emit(
            `${spell.name} heals ${summon.name} for ${summon.hp - before} HP.`,
            { type: "spellEffect", spellId: spell.id, targetId: summon.id, heal: summon.hp - before }
          );
          break;
        }
      }
      for (const t of allyTargets(s, spell, action, caster)) {
        const before = t.hp;
        t.hp = Math.min(t.maxHp, t.hp + healPower);
        emit(
          `${spell.name} heals ${t.name} for ${t.hp - before} HP.`,
          { type: "spellEffect", spellId: spell.id, targetId: t.id, heal: t.hp - before }
        );
        if (t.status.includes("knockedOut") && t.hp > 0) {
          t.status = t.status.filter((st) => st !== "knockedOut");
          emit(`${t.name} is revived!`, { type: "revived", targetId: t.id });
        }
        // Over-time followup (e.g. Mass Regenerate): flat per-round healing,
        // deliberately unaffected by casting stat (design doc §5.3).
        if (eff.followup?.kind === "regen" && t.hp > 0) {
          s.regenBuffs[t.id] = {
            power: eff.followup.power,
            duration: eff.followup.duration,
            spellId: spell.id,
          };
          emit(
            `${t.name} is regenerating.`,
            { type: "spellEffect", spellId: spell.id, targetId: t.id, isBuff: true }
          );
        }
      }
      break;
    }
    case "disable": {
      for (const t of spellTargets(s, spell, action)) {
        applyDisableToEnemy(s, t, eff.status, spell, emit);
      }
      break;
    }
    case "cure": {
      for (const t of allyTargets(s, spell, action, caster)) {
        t.status = t.status.filter((st) => st !== eff.status);
        if (eff.status === "poison") delete s.poisonState[t.id];
        else if (eff.status === "blind") delete s.blindTimers[t.id];
        else if (eff.status === "paralysis") delete s.paralysisTimers[t.id];
        else if (eff.status === "sleep") delete s.sleepTimers[t.id];
        emit(
          `${spell.name} cures ${t.name} of ${eff.status}.`,
          { type: "spellEffect", spellId: spell.id, targetId: t.id, statusCured: eff.status }
        );
      }
      break;
    }
    case "buff": {
      const amount = eff.power ?? 3;
      for (const t of allyTargets(s, spell, action, caster)) {
        s.armorBuffs[t.id] = (s.armorBuffs[t.id] ?? 0) + amount;
        emit(
          `${spell.name} bolsters ${t.name}'s armor by ${amount}.`,
          { type: "spellEffect", spellId: spell.id, targetId: t.id, isBuff: true }
        );
      }
      break;
    }
    case "resurrect": {
      // priest-revival: revive spells restore the target to 50% max HP
      // instead of the base 1 HP.
      const revivePct = perkModifiers(
        perksForCharacter(caster),
        effStats
      ).resurrectHpPercent;
      for (const t of allyTargets(s, spell, action, caster)) {
        if (!t.status.includes("knockedOut")) continue;
        t.hp = Math.max(1, Math.round(t.maxHp * revivePct));
        t.status = t.status.filter((st) => st !== "knockedOut");
        emit(
          `${spell.name} resurrects ${t.name} with ${t.hp} HP!`,
          { type: "revived", targetId: t.id }
        );
      }
      break;
    }
    case "magicScreen": {
      s.magicScreen += eff.power;
      emit(
        `${spell.name} raises a magic screen around the party (strength ${s.magicScreen}).`,
        { type: "spellEffect", spellId: spell.id, targetId: caster.id, isBuff: true }
      );
      break;
    }
    case "fizzleField": {
      // Target row is determined by the spell action; default to front.
      const targetRow = action.targetRow ?? "front";
      s.enemyFizzleFields[targetRow] += eff.power;
      emit(
        `${spell.name} surrounds the enemy ${targetRow} row with a fizzle field (strength ${s.enemyFizzleFields[targetRow]}).`,
        { type: "spellEffect", spellId: spell.id, isDebuff: true }
      );
      break;
    }
    case "dispelMagic": {
      const clearedEnemyScreens = s.enemyMagicScreens.front + s.enemyMagicScreens.back;
      const clearedEnemyFizzles = s.enemyFizzleFields.front + s.enemyFizzleFields.back;
      const clearedPartyFizzle = s.partyFizzleField;
      s.enemyMagicScreens = { front: 0, back: 0 };
      s.enemyFizzleFields = { front: 0, back: 0 };
      s.partyFizzleField = 0;
      const clearedTotal = clearedEnemyScreens + clearedEnemyFizzles + clearedPartyFizzle;
      emit(
        clearedTotal > 0
          ? `${spell.name} dispels enemy screens and fizzle fields.`
          : `${spell.name} finds no magic to dispel.`,
        { type: "spellEffect", spellId: spell.id, isBuff: true }
      );
      break;
    }
    case "summon": {
      const MAX_ALLIES = 3;
      const power = eff.power;
      s.summonCounter += 1;
      const ally: SummonedAlly = {
        id: `summon-${s.summonCounter}`,
        name: eff.allyName ?? "Summoned Ally",
        hp: power * 6,
        maxHp: power * 6,
        attack: power * 3,
        ac: Math.max(1, Math.floor(power / 2)),
        agi: 8 + power * 3,
        row: "front",
        spriteId: eff.spriteId,
      };
      if (s.summonedAllies.length >= MAX_ALLIES) {
        s.summonedAllies.shift();
      }
      s.summonedAllies.push(ally);
      emit(
        `${spell.name} summons a ${ally.name} to fight for the party!`,
        { type: "spellEffect", spellId: spell.id, targetId: ally.id, isBuff: true }
      );
      break;
    }
  }
  void rng;
}

/** Resolve enemy instances targeted by an offensive spell. */
function spellTargets(
  s: CombatState,
  spell: SpellDef,
  action: Extract<PlayerAction, { kind: "cast" }>
): EnemyInstance[] {
  const all = [...s.enemies.front, ...s.enemies.back].filter((e) => e.currentHp > 0);
  switch (spell.target) {
    case "singleEnemy": {
      const t = action.targetInstanceId ? findEnemy(s, action.targetInstanceId) : undefined;
      return t ? [t] : [];
    }
    case "groupEnemies": {
      // "Group" = one row (prefer front if it has living members, else back).
      const front = s.enemies.front.filter((e) => e.currentHp > 0);
      return front.length > 0 ? front : s.enemies.back.filter((e) => e.currentHp > 0);
    }
    case "allEnemies":
      return all;
    default:
      return [];
  }
}

/** Resolve party members targeted by a supportive spell. */
function allyTargets(
  s: CombatState,
  spell: SpellDef,
  action: Extract<PlayerAction, { kind: "cast" }>,
  caster: Character
): Character[] {
  const living = s.party.filter((c) => c.hp > 0 || c.status.includes("knockedOut"));
  switch (spell.target) {
    case "self":
      return [caster];
    case "singleAlly": {
      const id = action.targetAllyId ?? caster.id;
      const t = s.party.find((c) => c.id === id);
      return t ? [t] : [];
    }
    case "groupAllies": {
      // Target one row of allies (front if any living, else back).
      const front = living.filter((c) => charRow(c) === "front");
      return front.length > 0 ? front : living.filter((c) => charRow(c) === "back");
    }
    case "allAllies":
      return living;
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Enemy action resolution
// ---------------------------------------------------------------------------

/** Apply damage to a party member from an enemy ability, respecting buffs. */
function abilityDamageParty(
  s: CombatState,
  target: Character,
  baseDamage: number,
  actor: EnemyInstance,
  rng: Rng,
  emit: (m: string, e: CombatEvent) => void
): number {
  let damage = Math.max(1, Math.round(baseDamage * (0.8 + rng() * 0.4)));
  if (s.magicScreen > 0) {
    damage = Math.max(1, Math.round(damage * 0.5));
  }
  damage = damageReductionFor(s, target, damage);
  const result = applyPartyDamage(s, target, damage, actor, rng, emit);
  return result.finalDamage;
}

/** Resolve an enemy ability action. */
function resolveEnemyAbility(
  s: CombatState,
  action: { kind: "ability"; actor: EnemyInstance; abilityId: string; targetId: string },
  rng: Rng,
  log: (m: string) => void,
  emit: (m: string, e: CombatEvent) => void
): void {
  const { actor, abilityId, targetId } = action;
  const ability = enemyAbilityById(abilityId);
  if (!ability) return;

  // Set cooldown.
  if (ability.cooldown && ability.cooldown > 0) {
    if (!actor.abilityCooldowns) actor.abilityCooldowns = {};
    actor.abilityCooldowns[abilityId] = ability.cooldown;
  }

  const livingParty = s.party.filter((c) => c.hp > 0);
  const livingAllies = [...s.enemies.front, ...s.enemies.back].filter((e) => e.currentHp > 0);
  const eff = ability.effect;

  // Arcane abilities can fizzle in the party's anti-magic field.
  if (isArcaneEnemyAbility(ability) && s.partyFizzleField > 0) {
    const maxLevel = Math.max(
      1,
      ...s.party.filter((c) => c.hp > 0).map((c) => c.level)
    );
    const fizzleChance = s.partyFizzleField / (s.partyFizzleField + maxLevel);
    if (rng() < fizzleChance) {
      emit(
        `${actor.name}'s ${ability.name} fizzles in the party's anti-magic field.`,
        { type: "fizzle", actorId: actor.instanceId }
      );
      return;
    }
  }

  // Determine targets.
  const partyTargets: Character[] = [];
  const allyTargets: EnemyInstance[] = [];
  switch (ability.target) {
    case "singleParty": {
      const t = s.party.find((c) => c.id === targetId && c.hp > 0);
      if (t) partyTargets.push(t);
      break;
    }
    case "groupParty": {
      const front = livingParty.filter((c) => charRow(c) === "front");
      partyTargets.push(...(front.length > 0 ? front : livingParty.filter((c) => charRow(c) === "back")));
      break;
    }
    case "allParty":
      partyTargets.push(...livingParty);
      break;
    case "singleAlly": {
      const t = livingAllies.find((e) => e.instanceId === targetId);
      if (t) allyTargets.push(t);
      break;
    }
    case "groupAlly": {
      const front = livingAllies.filter((e) => e.row === "front");
      allyTargets.push(...(front.length > 0 ? front : livingAllies.filter((e) => e.row === "back")));
      break;
    }
    case "allAlly":
      allyTargets.push(...livingAllies);
      break;
    case "self":
      allyTargets.push(actor);
      break;
  }

  // Resolve effect.
  switch (eff.kind) {
    case "damage": {
      for (const t of partyTargets) {
        const dmg = abilityDamageParty(s, t, scaledAbilityPower(eff.power), actor, rng, emit);
        emit(`${actor.name} uses ${ability.name} on ${t.name} for ${dmg} damage!`, {
          type: "cast", actorId: actor.instanceId, spellId: ability.id, targetId: t.id, damage: dmg,
        });
        gainRage(s, t.id, 1);
      }
      if (partyTargets.length > 0) addScreenShakeFromAbility(s, ability, partyTargets[0]);
      break;
    }
    case "multiHit": {
      for (const t of partyTargets) {
        let totalDmg = 0;
        const hitPower = scaledAbilityPower(eff.powerPerHit);
        for (let h = 0; h < eff.hits; h++) {
          totalDmg += abilityDamageParty(s, t, hitPower, actor, rng, emit);
        }
        emit(`${actor.name} uses ${ability.name}, striking ${t.name} ${eff.hits} times for ${totalDmg} total damage!`, {
          type: "cast", actorId: actor.instanceId, spellId: ability.id, targetId: t.id, damage: totalDmg,
        });
        gainRage(s, t.id, 1);
      }
      if (partyTargets.length > 0) addScreenShakeFromAbility(s, ability, partyTargets[0]);
      break;
    }
    case "drain": {
      let totalDrained = 0;
      for (const t of partyTargets) {
        const dmg = abilityDamageParty(s, t, scaledAbilityPower(eff.power), actor, rng, emit);
        totalDrained += Math.round(dmg * 0.5);
        emit(`${actor.name} uses ${ability.name}, draining ${dmg} from ${t.name}!`, {
          type: "cast", actorId: actor.instanceId, spellId: ability.id, targetId: t.id, damage: dmg,
        });
        gainRage(s, t.id, 1);
      }
      if (totalDrained > 0) {
        actor.currentHp = Math.min(actor.hp, actor.currentHp + totalDrained);
        log(`${actor.name} heals itself for ${totalDrained} HP.`);
      }
      break;
    }
    case "heal": {
      for (const ally of allyTargets) {
        const before = ally.currentHp;
        ally.currentHp = Math.min(ally.hp, ally.currentHp + scaledAbilityPower(eff.power));
        const healed = ally.currentHp - before;
        if (healed > 0) {
          emit(`${actor.name} uses ${ability.name}, healing ${ally.name} for ${healed} HP.`, {
            type: "cast", actorId: actor.instanceId, spellId: ability.id, targetId: ally.instanceId, heal: healed,
          });
        }
      }
      break;
    }
    case "status": {
      const duration = eff.duration ?? 3;
      for (const t of partyTargets) {
        if (rng() < eff.chance && !t.status.includes(eff.status)) {
          // fighter-juggernaut: immune to enemy-inflicted status effects.
          if (isStatusImmune(s, t)) {
            log(`${t.name} shrugs off the effect!`);
            continue;
          }
          t.status.push(eff.status);
          if (eff.status === "paralysis") {
            s.paralysisTimers[t.id] = duration;
          } else if (eff.status === "sleep") {
            s.sleepTimers[t.id] = Math.min(3, duration);
          } else if (eff.status === "blind") {
            s.blindTimers[t.id] = duration;
          }
          emit(`${actor.name} uses ${ability.name}, inflicting ${eff.status} on ${t.name}!`, {
            type: "cast", actorId: actor.instanceId, spellId: ability.id, targetId: t.id,
          });
          emit(`${t.name} is ${eff.status}!`, {
            type: "spellEffect", spellId: ability.id, targetId: t.id, statusInflicted: eff.status,
          });
        }
      }
      break;
    }
    case "buff": {
      for (const ally of allyTargets) {
        // Enemy buffs are temporary stat boosts stored on the instance.
        // We modify attack/ac directly; combat is short enough that duration
        // tracking is simplified to "for the rest of combat" (matches the
        // existing enemy buff model where armorBuffs persist).
        if (eff.stat === "attack") {
          ally.attack += eff.amount;
        } else if (eff.stat === "ac") {
          ally.ac += eff.amount;
        }
        emit(`${actor.name} uses ${ability.name}, boosting ${ally.name}'s ${eff.stat}!`, {
          type: "cast", actorId: actor.instanceId, spellId: ability.id, targetId: ally.instanceId, heal: 0,
        });
        emit(`${ally.name}'s ${eff.stat} rises!`, {
          type: "spellEffect", spellId: ability.id, targetId: ally.instanceId, isBuff: true,
        });
      }
      break;
    }
    case "debuff": {
      for (const t of partyTargets) {
        if (eff.stat === "ac") {
          s.armorBuffs[t.id] = (s.armorBuffs[t.id] ?? 0) - eff.amount;
        } else if (eff.stat === "attack") {
          s.attackDebuffs[t.id] = { penalty: eff.amount, duration: eff.duration };
        }
        emit(`${actor.name} uses ${ability.name}, weakening ${t.name}'s ${eff.stat}!`, {
          type: "cast", actorId: actor.instanceId, spellId: ability.id, targetId: t.id,
        });
        emit(`${t.name}'s ${eff.stat} falls!`, {
          type: "spellEffect", spellId: ability.id, targetId: t.id, isDebuff: true,
        });
      }
      break;
    }
    case "summon": {
      // Summon enemy allies as temporary combatants. We add them to the
      // enemy formation in the appropriate row.
      const enemyDef = ENEMIES_BY_ID[eff.enemyId];
      if (!enemyDef) break;
      for (let i = 0; i < eff.count; i++) {
        s.summonCounter += 1;
        const inst: EnemyInstance = {
          ...enemyDef,
          special: [...enemyDef.special],
          instanceId: `${enemyDef.id}-summon-${s.summonCounter}`,
          currentHp: enemyDef.hp,
          row: enemyDef.rowPreference === "back" ? "back" : "front",
          status: [],
        };
        if (inst.row === "back") {
          s.enemies.back.push(inst);
        } else {
          s.enemies.front.push(inst);
        }
        log(`${actor.name} summons ${inst.name}!`);
      }
      emit(`${actor.name} uses ${ability.name}!`, {
        type: "cast", actorId: actor.instanceId, spellId: ability.id, targetId: null,
      });
      break;
    }
    case "fizzleField": {
      s.partyFizzleField = Math.max(s.partyFizzleField, eff.power);
      emit(`${actor.name} uses ${ability.name}, suppressing party spellcasting!`, {
        type: "cast", actorId: actor.instanceId, spellId: ability.id, targetId: null,
      });
      log(`An anti-magic field descends over the party!`);
      break;
    }
    case "magicScreen": {
      s.enemyMagicScreens[actor.row] = Math.max(s.enemyMagicScreens[actor.row] ?? 0, eff.power);
      emit(`${actor.name} uses ${ability.name}, raising a magic barrier!`, {
        type: "cast", actorId: actor.instanceId, spellId: ability.id, targetId: null,
      });
      log(`${actor.name} is wreathed in a shimmering barrier.`);
      break;
    }
  }
}

/** Add screen shake based on ability element/power. */
function addScreenShakeFromAbility(s: CombatState, ability: EnemyAbilityDef, target: Character): void {
  // Screen shake is handled by the combat scene renderer based on damage
  // events, so we don't need to do anything here. This is a placeholder
  // for future shake-tuning per ability.
  void s; void ability; void target;
}

function resolveEnemyAction(
  s: CombatState,
  action: EnemyAction,
  rng: Rng,
  log: (m: string) => void,
  emit: (m: string, e: CombatEvent) => void
): void {
  if (action.kind === "doNothing" || action.kind === "silence") return;
  if (action.actor.currentHp <= 0) return;
  action.actor.hasActed = true;

  // Enemy ability (from data/enemy-abilities.ts).
  if (action.kind === "ability") {
    // A wind-up firing clears its entry. A disable landed mid-round (round
    // path: player phase runs before enemy resolution) breaks the fire here —
    // scoped to wind-up firings; normal decided actions keep their behavior.
    const windUp = s.windUps[action.actor.instanceId];
    if (windUp && windUp.abilityId === action.abilityId) {
      delete s.windUps[action.actor.instanceId];
      if (action.actor.status.includes("paralysis") || action.actor.status.includes("sleep")) {
        emit(`${action.actor.name}'s ${windUp.name} is broken!`, {
          type: "telegraphBreak", actorId: action.actor.instanceId, abilityId: windUp.abilityId,
        });
        return;
      }
    }
    resolveEnemyAbility(s, action, rng, log, emit);
    return;
  }

  // Enemy spell: either an offensive cast at a party member or a heal on an
  // enemy ally. Distinguished by whether the targetId resolves to a party
  // member or an enemy instance.
  if (action.kind === "cast") {
    const { actor, spellId, targetId } = action;

    // Enemy fizzle field from BACORTU can cause enemy spells to fizzle.
    const enemyLevelEstimate = Math.max(1, Math.floor(actor.attack / 3));
    if (s.enemyFizzleFields[actor.row] >= enemyLevelEstimate) {
      emit(
        `${actor.name}'s spell fizzles in the party's anti-magic field.`,
        { type: "fizzle", actorId: actor.instanceId }
      );
      return;
    }

    const partyTarget = s.party.find((c) => c.id === targetId);
    if (partyTarget) {
      if (partyTarget.hp <= 0) return;
      if (actor.status.includes("blind") && rng() >= 0.5) {
        emit(
          `${actor.name} is blind and the spell misses.`,
          { type: "miss", actorId: actor.instanceId, targetId: partyTarget.id, reason: "blind" }
        );
        return;
      }
      const base = actor.attack;
      const variance = 0.8 + rng() * 0.4;
      let damage = Math.max(1, Math.round(base * variance));
      // Elemental damage bypasses equipped armor; only spell buffs + defend apply.
      const spellBuff = s.armorBuffs[partyTarget.id] ?? 0;
      damage = Math.max(1, damage - spellBuff);
      const defendPct = s.defendBuff[partyTarget.id] ?? 0;
      if (defendPct > 0) damage = Math.max(1, Math.round(damage * (1 - defendPct)));
      // Magic screen reduces spell damage. It deteriorates at the end of each round.
      if (s.magicScreen > 0) {
        damage = Math.max(1, Math.round(damage * 0.5));
      }
      partyTarget.hp -= damage;
      emit(
        `${actor.name} casts ${spellId} at ${partyTarget.name} for ${damage} damage.`,
        { type: "cast", actorId: actor.instanceId, spellId, targetId: partyTarget.id, damage }
      );
      return;
    }
    // Healing cast on an enemy ally.
    const ally = [...s.enemies.front, ...s.enemies.back].find(
      (e) => e.instanceId === targetId
    );
    if (ally && ally.currentHp > 0) {
      const before = ally.currentHp;
      ally.currentHp = Math.min(ally.hp, ally.currentHp + 8);
      emit(
        `${actor.name} casts ${spellId}, healing ${ally.name} for ${ally.currentHp - before} HP.`,
        { type: "cast", actorId: actor.instanceId, spellId, targetId: ally.instanceId, heal: ally.currentHp - before }
      );
    }
    return;
  }

  const { actor, target } = action;

  if (target.kind === "ally") {
    const allyTarget = s.summonedAllies.find((a) => a.id === target.id);
    if (!allyTarget || allyTarget.hp <= 0) return;

    if (actor.status.includes("blind")) {
      if (rng() >= 0.5) {
        emit(
          `${actor.name} is blind and misses ${allyTarget.name}.`,
          { type: "miss", actorId: actor.instanceId, targetId: allyTarget.id, reason: "blind" }
        );
        return;
      }
    }
    const base = actor.attack;
    const variance = 0.8 + rng() * 0.4;
    let damage = Math.max(1, Math.round(base * variance));
    damage = Math.max(1, damage - allyTarget.ac);
    allyTarget.hp -= damage;
    emit(
      `${actor.name} hits ${allyTarget.name} for ${damage} damage.`,
      { type: "attack", actorId: actor.instanceId, targetId: allyTarget.id, damage }
    );
    return;
  }

  const partyTarget = s.party.find((c) => c.id === target.id);
  if (!partyTarget || partyTarget.hp <= 0) return;

  // Flying / back-row enemies read as ranged for the combat animation.
  const attackRange: WeaponRange =
    actor.row === "back" || actor.special.some((sp) => sp.kind === "flying")
      ? "long"
      : "close";

  if (actor.status.includes("blind")) {
    if (rng() >= 0.5) {
      emit(
        `${actor.name} is blind and misses ${partyTarget.name}.`,
        { type: "miss", actorId: actor.instanceId, targetId: partyTarget.id, reason: "blind" }
      );
      return;
    }
  }

  // Physical evasion: AGI-based chance plus perk bonuses.
  const effStats = effStatsFor(s, partyTarget);
  const mods = perkModifiers(perksForCharacter(partyTarget), effStats);
  const evasionChance = Math.max(0, Math.min((effStats.agi - 10) * 0.01, 0.15)) + mods.evasionBonusPercent;
  if (rng() < evasionChance) {
    emit(
      `${partyTarget.name} evades ${actor.name}'s attack!`,
      { type: "miss", actorId: actor.instanceId, targetId: partyTarget.id, reason: "evade" }
    );
    // Rage: dodging an attack generates rage (+1).
    gainRage(s, partyTarget.id, 1);
    // duelist-riposte: counter-attack for 75% damage when an enemy misses you.
    if (
      actor.currentHp > 0 &&
      perksForCharacter(partyTarget).some((p) => p.id === "duelist-riposte")
    ) {
      const counterDmg = Math.max(
        1,
        Math.round(plainHitDamage(s, partyTarget, rng) * 0.75)
      );
      actor.currentHp -= counterDmg;
      emit(
        `${partyTarget.name} ripostes ${actor.name} for ${counterDmg} damage!`,
        {
          type: "attack",
          actorId: partyTarget.id,
          targetId: actor.instanceId,
          damage: counterDmg,
        }
      );
    }
    return;
  }

  const base = actor.attack;
  const variance = 0.8 + rng() * 0.4;
  let damage = Math.max(1, Math.round(base * variance));
  damage = damageReductionFor(s, partyTarget, damage);

  const result = applyPartyDamage(s, partyTarget, damage, actor, rng, emit);
  emit(
    `${actor.name} hits ${partyTarget.name} for ${result.finalDamage} damage.`,
    { type: "attack", actorId: actor.instanceId, targetId: partyTarget.id, damage: result.finalDamage, range: attackRange }
  );
  if (result.redirectTarget && result.redirectDamage > 0) {
    emit(
      `${result.redirectDamage} damage is redirected to ${result.redirectTarget.name}!`,
      { type: "spellEffect", spellId: "priest-martyr", targetId: result.redirectTarget.id, damage: result.redirectDamage }
    );
  }

  // Counter-stance (Brace/Riposte): if the target has an active counter,
  // trigger a free counterattack against this enemy and consume the stance.
  const counterMult = s.counterStances[partyTarget.id];
  if (counterMult !== undefined && actor.currentHp > 0) {
    delete s.counterStances[partyTarget.id];
    const counterDmg = Math.max(1, Math.round(result.finalDamage * counterMult));
    actor.currentHp -= counterDmg;
    emit(
      `${partyTarget.name} counters ${actor.name} for ${counterDmg} damage!`,
      { type: "attack", actorId: partyTarget.id, targetId: actor.instanceId, damage: counterDmg }
    );
    log(`${partyTarget.name} counters ${actor.name} for ${counterDmg} damage!`);
  }

  // Rage: taking damage generates rage (+1 for the target).
  gainRage(s, partyTarget.id, 1);
  // Fighter/Halberdier protector identity: adjacent ally takes damage → +1 rage.
  for (const ally of s.party) {
    if (ally.id === partyTarget.id || ally.hp <= 0) continue;
    if (!classHasTechniques(ally.class)) continue;
    if (ally.class !== "Fighter" && ally.class !== "Halberdier") continue;
    // "Adjacent" = formation slots differ by 3 (front/back pair).
    if (Math.abs(ally.formationSlot - partyTarget.formationSlot) === 3) {
      gainRage(s, ally.id, 1);
    }
  }

  // Poison on hit (Cobweb, Acid Puddle). Juggernaut is immune.
  if (actor.special.some((sp) => sp.kind === "poisonOnHit")) {
    if (!partyTarget.status.includes("poison")) {
      if (isStatusImmune(s, partyTarget)) {
        log(`${partyTarget.name} shrugs off the poison!`);
      } else {
        partyTarget.status.push("poison");
        s.poisonState[partyTarget.id] = { damage: 2, duration: 3 };
        emit(
          `${partyTarget.name} is poisoned!`,
          { type: "spellEffect", spellId: "poison-on-hit", targetId: partyTarget.id, statusInflicted: "poison" }
        );
      }
    }
  }
  wakeOnDamage(partyTarget, log);
}

// ---------------------------------------------------------------------------
// Summoned ally actions
// ---------------------------------------------------------------------------

/** A summoned ally makes a simple physical attack against a random enemy. */
function resolveAllyAction(
  s: CombatState,
  ally: SummonedAlly,
  rng: Rng,
  _log: (m: string) => void,
  emit: (m: string, e: CombatEvent) => void
): void {
  const targets = [...s.enemies.front, ...s.enemies.back].filter(
    (e) => e.currentHp > 0
  );
  if (targets.length === 0) return;
  const target = pickRandom(targets, rng);
  if (!target) return;

  const base = ally.attack;
  const variance = 0.8 + rng() * 0.4;
  let damage = Math.max(1, Math.round(base * variance));
  damage = Math.max(1, damage - target.ac);
  target.currentHp -= damage;
  emit(
    `${ally.name} attacks ${target.name} for ${damage} damage.`,
    { type: "attack", actorId: ally.id, targetId: target.instanceId, damage }
  );
  wakeOnDamage(target, _log);
}

/** Remove summoned allies that have been reduced to 0 HP. */
function allyDeathCheck(
  s: CombatState,
  emit: (m: string, e: CombatEvent) => void
): void {
  s.summonedAllies = s.summonedAllies.filter((ally) => {
    if (ally.hp <= 0) {
      emit(`${ally.name} is banished.`, { type: "defeated", targetId: ally.id, wasEnemy: false });
      s.justDiedAllies.push(ally);
      return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Damage reduction / armor
// ---------------------------------------------------------------------------

/** Effective AC of an enemy, accounting for armor debuffs (Disarm). */
function effectiveEnemyAc(s: CombatState, enemy: EnemyInstance): number {
  const debuff = s.enemyArmorDebuffs[enemy.instanceId];
  if (!debuff) return enemy.ac;
  return Math.max(0, enemy.ac - debuff.penalty);
}

/**
 * Record a discovered elemental affinity for the target's species (P2-9).
 * The first proc of a (name, element, kind) triple logs + emits an
 * affinityDiscovered event so the FF6 scene can pop it (combat log lines
 * are never displayed); repeat procs stay silent.
 */
function observeAffinity(
  s: CombatState,
  enemy: EnemyInstance,
  kind: "weak" | "resist",
  element: string,
  log: (m: string) => void,
  emit?: (m: string, e: CombatEvent) => void
): void {
  const entry = s.observedAffinity[enemy.name] ?? { weak: [], resist: [] };
  const bucket = kind === "weak" ? entry.weak : entry.resist;
  if (bucket.includes(element)) return;
  bucket.push(element);
  s.observedAffinity[enemy.name] = entry;
  const msg = kind === "weak"
    ? `${enemy.name} is weak to ${element}!`
    : `${enemy.name} resists ${element}.`;
  if (emit) {
    emit(msg, { type: "affinityDiscovered", targetId: enemy.instanceId, element, kind });
  } else {
    log(msg);
  }
}

/**
 * Reduce incoming damage to a CHARACTER by: equipped armor defenseBonus
 * (data-driven) + persistent spell armorBuffs + per-round Defend buff
 * (percentage) + perk damage-taken multipliers (Phalanx/Vanguard/Sentinel
 * reduce it; Berserker's armor penalty increases it).
 */
function damageReductionFor(
  s: CombatState,
  target: Character,
  damage: number
): number {
  const loadout = s.loadout[target.id];
  const armorBonus = (loadout?.armor ?? []).reduce(
    (sum, a) => sum + (a.defenseBonus ?? 0),
    0
  );
  const spellBuff = s.armorBuffs[target.id] ?? 0;
  const tauntBuff = s.tauntBuffs[target.id]?.bonus ?? 0;
  const flatReduction = armorBonus + spellBuff + tauntBuff;
  let dmg = Math.max(1, damage - flatReduction);
  const defendPct = s.defendBuff[target.id] ?? 0;
  if (defendPct > 0) {
    dmg = Math.max(1, Math.round(dmg * (1 - defendPct)));
  }
  // crusader-holy-shield: lingering +20% defense from a recent Defend.
  const holyShieldMult = s.holyShieldBuffs[target.id]?.multiplier ?? 1;
  if (holyShieldMult !== 1) {
    dmg = Math.max(1, Math.round(dmg * holyShieldMult));
  }
  const mods = perkModifiers(perksForCharacter(target), effStatsFor(s, target));
  const perkMult =
    mods.damageTakenMultiplier *
    (charRow(target) === "front" ? mods.damageTakenMultiplierFrontRow : 1);
  if (perkMult !== 1) {
    dmg = Math.max(1, Math.round(dmg * perkMult));
  }
  return dmg;
}

// ---------------------------------------------------------------------------
// Flee
// ---------------------------------------------------------------------------

function attemptFlee(
  isBoss: boolean,
  effAgi: number,
  fleeBonusPercent: number,
  rng: Rng,
  guaranteed = false
): boolean {
  if (isBoss) return false; // 0% vs boss (Section 7.2) — even Smoke Bomb can't override
  if (guaranteed) return true;
  const chance =
    0.95 + Math.min((effAgi - 10) * 0.02, 0.1) + fleeBonusPercent;
  return rng() < chance;
}

/**
 * thief-smoke-bomb: flee always succeeds (except vs bosses) while the party's
 * living HP is below 30% and a living Smoke Bomb holder is present.
 */
function smokeBombFleeActive(s: CombatState): boolean {
  const living = s.party.filter((c) => c.hp > 0);
  if (living.length === 0) return false;
  const holderAlive = living.some((c) =>
    perksForCharacter(c).some((p) => p.id === "thief-smoke-bomb")
  );
  if (!holderAlive) return false;
  const hp = living.reduce((sum, c) => sum + c.hp, 0);
  const maxHp = living.reduce((sum, c) => sum + c.maxHp, 0);
  return maxHp > 0 && hp / maxHp < 0.3;
}

// ---------------------------------------------------------------------------
// Death check + termination
// ---------------------------------------------------------------------------

function deathCheck(
  s: CombatState,
  emit: (m: string, e: CombatEvent) => void
): void {
  // Party members at 0 HP become knockedOut (revivable; no permanent death).
  for (const c of s.party) {
    if (c.hp <= 0 && !c.status.includes("knockedOut")) {
      c.hp = 0;
      addStatus(c, "knockedOut");
      // Knocked out is the worst state: clear active combat statuses.
      c.status = c.status.filter((st) => st === "knockedOut");
      delete s.paralysisTimers[c.id];
      emit(`${c.name} is knocked out!`, { type: "defeated", targetId: c.id, wasEnemy: false });
    }
  }
  s.enemies.front = s.enemies.front.filter((e) => {
    if (e.currentHp <= 0) {
      emit(`${e.name} is destroyed.`, { type: "defeated", targetId: e.instanceId, wasEnemy: true });
      s.goldEarned += e.gold || 0;
      s.xpEarned += e.xp || 0;
      s.justDied.push({ ...e, status: [...e.status] });
      return false;
    }
    return true;
  });
  s.enemies.back = s.enemies.back.filter((e) => {
    if (e.currentHp <= 0) {
      emit(`${e.name} is destroyed.`, { type: "defeated", targetId: e.instanceId, wasEnemy: true });
      s.goldEarned += e.gold || 0;
      s.xpEarned += e.xp || 0;
      s.justDied.push({ ...e, status: [...e.status] });
      return false;
    }
    return true;
  });
  checkBossPhases(s, emit);
}

/**
 * Advance boss phases (Direction C). For each living boss with
 * phaseThresholds, when its HP% crosses below a threshold it gains a phase
 * and +4 attack per crossing, and a phaseChange event announces it. A hit
 * that skips a threshold fires one event at the final phase with the
 * cumulative bump.
 */
function checkBossPhases(s: CombatState, emit: (m: string, e: CombatEvent) => void): void {
  for (const e of [...s.enemies.front, ...s.enemies.back]) {
    if (!e.isBoss || e.currentHp <= 0 || !e.phaseThresholds?.length) continue;
    const current = s.bossPhases[e.instanceId] ?? 1;
    const hpPct = (e.currentHp / e.hp) * 100;
    let phase = 1;
    for (const threshold of e.phaseThresholds) {
      if (hpPct <= threshold) phase += 1;
    }
    if (phase > current) {
      const bump = 4 * (phase - current);
      e.attack += bump;
      s.bossPhases[e.instanceId] = phase;
      emit(`${e.name} grows stronger! (attack +${bump})`, {
        type: "phaseChange", actorId: e.instanceId, phase, name: e.name,
      });
    }
  }
}

function checkTermination(s: CombatState, log: (m: string) => void): boolean {
  // Party wipe is checked FIRST so a simultaneous kill (e.g. both sides die
  // to end-of-round poison) is a wipe, not a victory — a "victory" with an
  // all-KO'd party would return them to the dungeon at 0 HP without the
  // wipe path's revive (design doc §9.1).
  const partyAlive = s.party.filter((c) => c.hp > 0).length;
  if (partyAlive === 0 && !s.ended) {
    s.ended = true;
    s.result = "wipe";
    s.summonedAllies = [];
    log("The party has been wiped out!");
    return true;
  }
  const enemiesRemaining =
    s.enemies.front.filter((e) => e.currentHp > 0).length +
    s.enemies.back.filter((e) => e.currentHp > 0).length;
  if (enemiesRemaining === 0 && !s.ended) {
    s.ended = true;
    s.result = "victory";
    s.summonedAllies = [];
    log("All enemies defeated — victory!");
    return true;
  }
  return false;
}

/**
 * End-of-round bookkeeping shared by `resolveCombatRound` (Phase 5) and the
 * per-turn API's `endRound`: status ticks, hidden-spotting, Saint's regen,
 * magic-screen/fizzle-field decay, per-round silence expiry, enemy ability
 * cooldown tick, and technique buff/debuff decay. Both callers previously
 * duplicated this block, and the round-based path was missing the Saint
 * regen and ability cooldown tick entirely — tests written against the
 * legacy resolver silently didn't exercise those systems. Returns true if
 * combat ended (callers just `return s` either way; the boolean lets a
 * caller short-circuit remaining per-round work if it has any).
 */
function runEndOfRound(
  s: CombatState,
  rng: Rng,
  log: (m: string) => void,
  emit: (m: string, e: CombatEvent) => void
): boolean {
  tickStatuses(s, log, emit);
  deathCheck(s, emit);
  allyDeathCheck(s, emit);
  if (checkTermination(s, log)) return true;

  checkSpotHidden(s, rng, log, emit);

  // priest-saint: while a living Saint stands, the whole party regains 5%
  // max HP at the end of every round. (The revive-targeting clause of the
  // perk is still TODO(v1.1).)
  const saintActive = s.party.some(
    (c) => c.hp > 0 && perksForCharacter(c).some((p) => p.id === "priest-saint")
  );
  if (saintActive) {
    for (const c of s.party) {
      if (c.hp <= 0 || c.hp >= c.maxHp) continue;
      const before = c.hp;
      c.hp = Math.min(c.maxHp, c.hp + Math.max(1, Math.round(c.maxHp * 0.05)));
      emit(
        `${c.name} regains ${c.hp - before} HP.`,
        { type: "spellEffect", spellId: "priest-saint", targetId: c.id, heal: c.hp - before }
      );
    }
  }

  if (s.magicScreen > 0) {
    s.magicScreen = Math.max(0, s.magicScreen - 1);
  }
  if (s.partyFizzleField > 0) {
    s.partyFizzleField = Math.max(0, s.partyFizzleField - 1);
  }
  for (const row of (["front", "back"] as Row[])) {
    if (s.enemyFizzleFields[row] > 0) {
      s.enemyFizzleFields[row] = Math.max(0, s.enemyFizzleFields[row] - 1);
    }
    if (s.enemyMagicScreens[row] > 0) {
      s.enemyMagicScreens[row] = Math.max(0, s.enemyMagicScreens[row] - 1);
    }
  }

  // Per-round silence from flag-driven bosses (silenceRandom) ends now.
  s.silencedThisRound = [];

  // Tick enemy ability cooldowns (decrement by 1 each round).
  for (const e of [...s.enemies.front, ...s.enemies.back]) {
    if (e.abilityCooldowns) {
      for (const id of Object.keys(e.abilityCooldowns)) {
        if (e.abilityCooldowns[id] > 0) e.abilityCooldowns[id]--;
      }
    }
  }

  // Tick technique-related temporary buffs/debuffs.
  tickTechniqueBuffs(s);
  return false;
}

// ---------------------------------------------------------------------------
// Status ticks (end of round)
// ---------------------------------------------------------------------------

function tickStatuses(
  s: CombatState,
  log: (m: string) => void,
  emit?: (m: string, e: CombatEvent) => void
): void {
  // Emit a structured statusTick event when an emitter is provided so the
  // FF6 scene can pop poison damage numbers; falls back to plain log.
  const tick = (msg: string, targetId: string, damage: number): void => {
    if (emit) emit(msg, { type: "statusTick", targetId, damage, status: "poison" });
    else log(msg);
  };
  // Party poison + paralysis countdown.
  for (const c of s.party) {
    if (c.status.includes("knockedOut")) continue;
    if (c.status.includes("poison")) {
      const ps = s.poisonState[c.id] ?? { damage: 2, duration: 3 };
      c.hp = Math.max(0, c.hp - ps.damage);
      tick(`${c.name} suffers ${ps.damage} poison damage.`, c.id, ps.damage);
      if (ps.duration - 1 <= 0) {
        c.status = c.status.filter((st) => st !== "poison");
        delete s.poisonState[c.id];
        log(`${c.name} is no longer poisoned.`);
      } else {
        s.poisonState[c.id] = { damage: ps.damage, duration: ps.duration - 1 };
      }
    }
    if (c.status.includes("paralysis")) {
      const remaining = (s.paralysisTimers[c.id] ?? 3) - 1;
      if (remaining <= 0) {
        c.status = c.status.filter((st) => st !== "paralysis");
        delete s.paralysisTimers[c.id];
        log(`${c.name} is no longer paralyzed.`);
      } else {
        s.paralysisTimers[c.id] = remaining;
      }
    }
    if (c.status.includes("sleep")) {
      const remaining = (s.sleepTimers[c.id] ?? 3) - 1;
      if (remaining <= 0) {
        c.status = c.status.filter((st) => st !== "sleep");
        delete s.sleepTimers[c.id];
        log(`${c.name} wakes up.`);
      } else {
        s.sleepTimers[c.id] = remaining;
      }
    }
    if (c.status.includes("blind")) {
      const remaining = (s.blindTimers[c.id] ?? 3) - 1;
      if (remaining <= 0) {
        c.status = c.status.filter((st) => st !== "blind");
        delete s.blindTimers[c.id];
        log(`${c.name} can see again.`);
      } else {
        s.blindTimers[c.id] = remaining;
      }
    }
  }
  // Enemy poison + paralysis countdown.
  for (const e of [...s.enemies.front, ...s.enemies.back]) {
    if (e.currentHp <= 0) continue;
    if (e.status.includes("poison")) {
      const ps = s.poisonState[e.instanceId] ?? { damage: 2, duration: 3 };
      e.currentHp = Math.max(0, e.currentHp - ps.damage);
      tick(`${e.name} suffers ${ps.damage} poison damage.`, e.instanceId, ps.damage);
      if (ps.duration - 1 <= 0) {
        e.status = e.status.filter((st) => st !== "poison");
        delete s.poisonState[e.instanceId];
        log(`${e.name} is no longer poisoned.`);
      } else {
        s.poisonState[e.instanceId] = { damage: ps.damage, duration: ps.duration - 1 };
      }
    }
    if (e.status.includes("paralysis")) {
      const remaining = (s.paralysisTimers[e.instanceId] ?? 3) - 1;
      if (remaining <= 0) {
        e.status = e.status.filter((st) => st !== "paralysis");
        delete s.paralysisTimers[e.instanceId];
        log(`${e.name} is no longer paralyzed.`);
      } else {
        s.paralysisTimers[e.instanceId] = remaining;
      }
    }
    if (e.status.includes("sleep")) {
      const remaining = (s.sleepTimers[e.instanceId] ?? 3) - 1;
      if (remaining <= 0) {
        e.status = e.status.filter((st) => st !== "sleep");
        delete s.sleepTimers[e.instanceId];
        log(`${e.name} wakes up.`);
      } else {
        s.sleepTimers[e.instanceId] = remaining;
      }
    }
  }

  // Spell DoTs on enemies (e.g. Meteor Swarm burn). Elemental affinity
  // applies to ticks the same way it does to the impact hit.
  for (const instanceId of Object.keys(s.enemyDots)) {
    const enemy = findEnemy(s, instanceId);
    if (!enemy || enemy.currentHp <= 0) {
      delete s.enemyDots[instanceId];
      continue;
    }
    const remaining: typeof s.enemyDots[string] = [];
    for (const dot of s.enemyDots[instanceId]) {
      let dmg = dot.power;
      const affinity = enemy.special.find(
        (sp) =>
          (sp.kind === "resistElement" || sp.kind === "weakElement") &&
          sp.element === dot.element
      );
      if (affinity) {
        dmg = Math.max(1, Math.round(dmg * (affinity.kind === "weakElement" ? 1.5 : 0.5)));
        observeAffinity(s, enemy, affinity.kind === "weakElement" ? "weak" : "resist", dot.element, log, emit);
      }
      enemy.currentHp = Math.max(0, enemy.currentHp - dmg);
      const label = dot.element === "fire" ? "burns" : "withers";
      if (emit) {
        emit(`${enemy.name} ${label} for ${dmg} damage.`, {
          type: "statusTick",
          targetId: instanceId,
          damage: dmg,
          status: "burn",
        });
      } else {
        log(`${enemy.name} ${label} for ${dmg} damage.`);
      }
      dot.duration -= 1;
      if (dot.duration > 0) {
        remaining.push(dot);
      } else if (emit) {
        emit(`The flames on ${enemy.name} die down.`, {
          type: "statusEnd",
          targetId: instanceId,
          status: "burn",
        });
      } else {
        log(`The flames on ${enemy.name} die down.`);
      }
      if (enemy.currentHp <= 0) break;
    }
    if (remaining.length > 0 && enemy.currentHp > 0) {
      s.enemyDots[instanceId] = remaining;
    } else {
      delete s.enemyDots[instanceId];
    }
  }

  // Spell regen on party members (e.g. Mass Regenerate). Flat per-round
  // healing; never revives — KO clears the buff.
  for (const charId of Object.keys(s.regenBuffs)) {
    const c = s.party.find((ch) => ch.id === charId);
    if (!c || c.hp <= 0 || c.status.includes("knockedOut")) {
      delete s.regenBuffs[charId];
      continue;
    }
    const buff = s.regenBuffs[charId];
    const before = c.hp;
    c.hp = Math.min(c.maxHp, c.hp + buff.power);
    if (c.hp > before) {
      if (emit) {
        emit(`${c.name} regenerates ${c.hp - before} HP.`, {
          type: "spellEffect",
          spellId: buff.spellId,
          targetId: c.id,
          heal: c.hp - before,
        });
      } else {
        log(`${c.name} regenerates ${c.hp - before} HP.`);
      }
    }
    buff.duration -= 1;
    if (buff.duration <= 0) {
      delete s.regenBuffs[charId];
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findEnemy(s: CombatState, instanceId: string): EnemyInstance | undefined {
  return (
    s.enemies.front.find((e) => e.instanceId === instanceId) ??
    s.enemies.back.find((e) => e.instanceId === instanceId)
  );
}

/** Scale static ability power values to match the post-2026 enemy stat pass. */
function scaledAbilityPower(power: number): number {
  return Math.max(1, Math.round(power * ENEMY_ABILITY_POWER_SCALE));
}

/** True for enemy abilities that should respect party magic screen / fizzle fields. */
function isArcaneEnemyAbility(ability: EnemyAbilityDef): boolean {
  const eff = ability.effect;
  if (eff.kind === "fizzleField" || eff.kind === "magicScreen" || eff.kind === "status") {
    return true;
  }
  if (eff.kind === "drain") return true;
  if (eff.kind === "damage" || eff.kind === "multiHit") {
    return !!eff.element && eff.element !== "physical";
  }
  return false;
}

/** LUK contributes up to 25%; perk/technique bonuses stack on top uncapped. */
function critChanceFromLukAndBonuses(
  luk: number,
  bonus: number,
  extra = 0
): number {
  return Math.min(0.95, Math.min(0.25, luk / 100) + bonus + extra);
}

/**
 * Apply a player disable spell to an enemy with diminishing returns.
 * Bosses stagger (1-round paralysis) instead of full lockdown.
 */
function applyDisableToEnemy(
  s: CombatState,
  target: EnemyInstance,
  status: "sleep" | "paralysis",
  spell: SpellDef,
  emit: (m: string, e: CombatEvent) => void
): void {
  const stacks = s.disableStacks[target.instanceId] ?? 0;
  if (stacks >= 3) {
    emit(
      `${spell.name} has no effect on ${target.name} — they resist.`,
      {
        type: "spellEffect",
        spellId: spell.id,
        targetId: target.instanceId,
        statusInflicted: "no effect",
      }
    );
    return;
  }

  const duration = Math.max(1, 3 - stacks);
  s.disableStacks[target.instanceId] = stacks + 1;

  if (target.isBoss) {
    if (!target.status.includes("paralysis")) target.status.push("paralysis");
    s.paralysisTimers[target.instanceId] = 1;
    emit(
      `${spell.name} staggers ${target.name} for a moment.`,
      {
        type: "spellEffect",
        spellId: spell.id,
        targetId: target.instanceId,
        statusInflicted: "paralysis",
      }
    );
    return;
  }

  if (status === "sleep") {
    if (!target.status.includes("sleep")) target.status.push("sleep");
    s.sleepTimers[target.instanceId] = Math.min(3, duration);
    emit(
      `${spell.name} puts ${target.name} to sleep.`,
      {
        type: "spellEffect",
        spellId: spell.id,
        targetId: target.instanceId,
        statusInflicted: "sleep",
      }
    );
    return;
  }

  if (!target.status.includes("paralysis")) target.status.push("paralysis");
  s.paralysisTimers[target.instanceId] = duration;
  emit(
    `${spell.name} afflicts ${target.name} with paralysis.`,
    {
      type: "spellEffect",
      spellId: spell.id,
      targetId: target.instanceId,
      statusInflicted: "paralysis",
    }
  );
}

function addStatus(target: { status: StatusEffect[] }, st: StatusEffect): void {
  if (!target.status.includes(st)) target.status.push(st);
}

/** fighter-juggernaut: immune to enemy-inflicted status effects. */
function isStatusImmune(s: CombatState, c: Character): boolean {
  return perkModifiers(perksForCharacter(c), effStatsFor(s, c)).statusImmune;
}

/** Physical damage wakes a sleeping target (Section 7.5). */
function wakeOnDamage(
  target: { status: StatusEffect[]; name: string },
  log: (m: string) => void
): void {
  if (target.status.includes("sleep")) {
    target.status = target.status.filter((st) => st !== "sleep");
    log(`${target.name} wakes up!`);
  }
}

function isAdjacentFrontRowAlly(a: Character, b: Character): boolean {
  if (a.formationSlot > 2 || b.formationSlot > 2) return false;
  return Math.abs(a.formationSlot - b.formationSlot) === 1;
}

function isDirectlyBehind(protector: Character, target: Character): boolean {
  return (
    protector.formationSlot <= 2 &&
    target.formationSlot === protector.formationSlot + 3
  );
}

/** Adjacent = side-by-side in the same row, or the front/back pair
 *  (formation slots 0-2 front, 3-5 back). Never true for the same character. */
function isAdjacentAlly(a: Character, b: Character): boolean {
  if (a.id === b.id) return false;
  const diff = Math.abs(a.formationSlot - b.formationSlot);
  const sameRow = (a.formationSlot <= 2) === (b.formationSlot <= 2);
  return (sameRow && diff === 1) || diff === 3;
}

/**
 * halberdier-warlord: allies adjacent to a living Warlord holder deal +20%
 * damage. This modifies OTHER characters' damage output based on proximity
 * to the holder, so — unlike most perks — it can't live in perkModifiers()
 * (which only ever sees the acting character's own perks); it needs full
 * party context and is applied at each damage-dealing site instead
 * (resolveAttack, resolveAmbush, applySpell's damage case, dealTechniqueDamage).
 * Not stacking: only the first adjacent holder found counts.
 */
function warlordDamageMultiplier(s: CombatState, actor: Character): number {
  const holder = s.party.find(
    (c) =>
      c.hp > 0 &&
      c.id !== actor.id &&
      isAdjacentAlly(c, actor) &&
      perksForCharacter(c).some((p) => p.id === "halberdier-warlord")
  );
  return holder ? 1.2 : 1;
}

/** A plain physical hit for reactive counterattacks (no perks applied). */
function plainHitDamage(s: CombatState, c: Character, rng: Rng): number {
  const eff = effStatsFor(s, c);
  const loadout = s.loadout[c.id];
  const weaponBonus = loadout?.weapon?.attackBonus ?? 0;
  const base = eff.str + c.level + weaponBonus;
  const variance = 0.8 + rng() * 0.4;
  return Math.max(1, Math.round(base * variance));
}

/**
 * Apply damage to a party member, running BeforeDamageTaken / OnAllyWouldDie /
 * AfterDamageTaken hooks. Handles Martyr redirects and Guardian Angel / Paladin
 * survive-at-1-HP effects.
 */
function applyPartyDamage(
  s: CombatState,
  target: Character,
  damage: number,
  attacker: EnemyInstance,
  rng: Rng,
  emit: (m: string, e: CombatEvent) => void
): { finalDamage: number; redirectDamage: number; redirectTarget?: Character } {
  // BeforeDamageTaken hooks may redirect damage (e.g. Martyr).
  let redirected = false;
  let redirectTo: Character | undefined;
  let targetDamage = damage;
  let redirectDamage = 0;

  for (const c of s.party) {
    if (c.hp <= 0) continue;
    dispatchHook("BeforeDamageTaken", perksForCharacter(c), {
      state: s.perkState[c.id],
      rng,
      targetId: target.id,
      ownId: c.id,
      isAdjacentFrontAlly: isAdjacentFrontRowAlly(target, c),
      redirectHalfDamage: () => {
        if (redirected || c.hp <= 0) return;
        redirected = true;
        redirectTo = c;
        redirectDamage = Math.floor(damage / 2);
        targetDamage = damage - redirectDamage;
      },
      // mage-mana-shield: divert up to `fraction` of the remaining damage to
      // the target's own SP instead of HP. Only fires for self (c === target,
      // enforced by the handler's targetId===ownId check); partial if SP
      // can't cover the full share.
      absorbToSp: (fraction: number) => {
        if (c.id !== target.id) return;
        const want = Math.round(targetDamage * fraction);
        const spend = Math.min(want, target.sp);
        if (spend <= 0) return;
        target.sp -= spend;
        targetDamage = Math.max(0, targetDamage - spend);
      },
    });
  }

  // OnAllyWouldDie: self-save perks first, then ally-save perks.
  let deathPrevented = false;
  const preventDeath = () => {
    if (deathPrevented) return;
    target.hp = 1;
    deathPrevented = true;
  };

  const prospectiveTargetHp = target.hp - targetDamage;
  if (prospectiveTargetHp <= 0) {
    dispatchHook("OnAllyWouldDie", perksForCharacter(target), {
      state: s.perkState[target.id],
      rng,
      targetId: target.id,
      ownId: target.id,
      preventDeath,
    });
    if (!deathPrevented) {
      for (const c of s.party) {
        if (c.hp <= 0 || c.id === target.id) continue;
        dispatchHook("OnAllyWouldDie", perksForCharacter(c), {
          state: s.perkState[c.id],
          rng,
          targetId: target.id,
          ownId: c.id,
          preventDeath,
        });
        if (deathPrevented) break;
      }
    }
  }

  if (!deathPrevented) {
    target.hp = prospectiveTargetHp;
  }

  // Apply redirected damage to the Martyr Priest.
  if (redirectTo && redirectDamage > 0) {
    let redirectDeathPrevented = false;
    const preventRedirectDeath = () => {
      if (redirectDeathPrevented || !redirectTo) return;
      redirectTo.hp = 1;
      redirectDeathPrevented = true;
    };
    const prospectiveRedirectHp = redirectTo.hp - redirectDamage;
    if (prospectiveRedirectHp <= 0) {
      dispatchHook("OnAllyWouldDie", perksForCharacter(redirectTo), {
        state: s.perkState[redirectTo.id],
        rng,
        targetId: redirectTo.id,
        ownId: redirectTo.id,
        preventDeath: preventRedirectDeath,
      });
      if (!redirectDeathPrevented) {
        for (const c of s.party) {
          if (c.hp <= 0 || c.id === redirectTo.id) continue;
          dispatchHook("OnAllyWouldDie", perksForCharacter(c), {
            state: s.perkState[c.id],
            rng,
            targetId: redirectTo.id,
            ownId: c.id,
            preventDeath: preventRedirectDeath,
          });
          if (redirectDeathPrevented) break;
        }
      }
    }
    if (!redirectDeathPrevented) {
      redirectTo.hp = prospectiveRedirectHp;
    }
  }

  // AfterDamageTaken hooks (e.g. Last Stand, Hold the Line).
  for (const c of s.party) {
    if (c.hp <= 0) continue;
    dispatchHook("AfterDamageTaken", perksForCharacter(c), {
      state: s.perkState[c.id],
      rng,
      targetId: target.id,
      ownId: c.id,
      hpPercentAfter: c.hp / c.maxHp,
      isAllyBehind: isDirectlyBehind(c, target),
      isAdjacentAlly: isAdjacentAlly(c, target),
      retaliateHolyDamage: () => {
        // crusader-retribution: the attacker takes the Crusader's effective
        // PIE as holy damage when an adjacent ally is struck.
        if (attacker.currentHp <= 0) return;
        const holy = Math.max(1, effStatsFor(s, c).pie);
        attacker.currentHp -= holy;
        emit(
          `${c.name}'s retribution sears ${attacker.name} for ${holy} holy damage!`,
          {
            type: "attack",
            actorId: c.id,
            targetId: attacker.instanceId,
            damage: holy,
          }
        );
      },
      counterAttacker: (multiplier: number) => {
        if (attacker.currentHp <= 0) return;
        const dmg = plainHitDamage(s, c, rng);
        const counterDamage = Math.max(1, Math.round(dmg * multiplier));
        attacker.currentHp -= counterDamage;
        emit(
          `${c.name} counter-attacks ${attacker.name} for ${counterDamage} damage!`,
          {
            type: "attack",
            actorId: c.id,
            targetId: attacker.instanceId,
            damage: counterDamage,
          }
        );
      },
      counterAllEnemies: () => {
        for (const e of s.enemies.front.filter((e) => e.currentHp > 0)) {
          const dmg = plainHitDamage(s, c, rng);
          const counterDamage = Math.max(1, Math.round(dmg * 1));
          e.currentHp -= counterDamage;
          emit(
            `${c.name} counter-attacks ${e.name} for ${counterDamage} damage!`,
            {
              type: "attack",
              actorId: c.id,
              targetId: e.instanceId,
              damage: counterDamage,
            }
          );
        }
      },
    });
  }

  return { finalDamage: targetDamage, redirectDamage, redirectTarget: redirectTo };
}

function cloneCharacter(c: Character): Character {
  return {
    ...c,
    stats: { ...c.stats },
    status: [...c.status],
    knownSpellIds: [...c.knownSpellIds],
    perkIds: [...c.perkIds],
  };
}

function cloneEnemy(e: EnemyInstance): EnemyInstance {
  return {
    ...e,
    special: [...e.special],
    status: [...e.status],
    abilityCooldowns: e.abilityCooldowns ? { ...e.abilityCooldowns } : undefined,
  };
}

// Re-export helpers the combat UI needs
export { charRow };

// ---------------------------------------------------------------------------
// Technique buffs/debuffs tick
// ---------------------------------------------------------------------------

/** Decrement durations and expire technique-related temporary effects. */
function tickTechniqueBuffs(s: CombatState): void {
  // Taunt buffs
  for (const id of Object.keys(s.tauntBuffs)) {
    s.tauntBuffs[id].duration -= 1;
    if (s.tauntBuffs[id].duration <= 0) {
      delete s.tauntBuffs[id];
      s.tauntingIds = s.tauntingIds.filter((tid) => tid !== id);
    }
  }
  // Next-attack bonuses (Feint)
  for (const id of Object.keys(s.nextAttackBonuses)) {
    s.nextAttackBonuses[id].duration -= 1;
    if (s.nextAttackBonuses[id].duration <= 0) {
      delete s.nextAttackBonuses[id];
    }
  }
  // Damage buffs (Battle Cry)
  for (const id of Object.keys(s.damageBuffs)) {
    s.damageBuffs[id].duration -= 1;
    if (s.damageBuffs[id].duration <= 0) {
      delete s.damageBuffs[id];
    }
  }
  // Enemy armor debuffs (Disarm)
  for (const id of Object.keys(s.enemyArmorDebuffs)) {
    s.enemyArmorDebuffs[id].duration -= 1;
    if (s.enemyArmorDebuffs[id].duration <= 0) {
      delete s.enemyArmorDebuffs[id];
    }
  }
  // Enemy AGI debuffs (Caltrops/slow)
  for (const id of Object.keys(s.enemyAgiDebuffs)) {
    s.enemyAgiDebuffs[id].duration -= 1;
    if (s.enemyAgiDebuffs[id].duration <= 0) {
      delete s.enemyAgiDebuffs[id];
    }
  }
  // Party attack debuffs (Curse)
  for (const id of Object.keys(s.attackDebuffs)) {
    s.attackDebuffs[id].duration -= 1;
    if (s.attackDebuffs[id].duration <= 0) {
      delete s.attackDebuffs[id];
    }
  }
  // Holy Shield buffs (+20% defense for 2 rounds after Defending)
  for (const id of Object.keys(s.holyShieldBuffs)) {
    s.holyShieldBuffs[id].duration -= 1;
    if (s.holyShieldBuffs[id].duration <= 0) {
      delete s.holyShieldBuffs[id];
    }
  }
}

// ---------------------------------------------------------------------------
// Technique resolution
// ---------------------------------------------------------------------------

function techniqueNeedsEnemyReach(tech: TechniqueDef): boolean {
  const eff = tech.effect;
  return (
    eff.kind === "damage" ||
    eff.kind === "multiHit" ||
    eff.kind === "damageWithStatus" ||
    eff.kind === "damageWithExecute" ||
    eff.kind === "debuff"
  );
}

function techniqueCanReach(
  s: CombatState,
  actor: Character,
  tech: TechniqueDef,
  target: EnemyInstance
): boolean {
  const ignoresRange =
    tech.id === "duelist-lunge" || tech.id === "halberdier-pole-vault";
  if (ignoresRange) return true;
  const loadout = s.loadout[actor.id];
  const weaponRange: WeaponRange = effectiveWeaponRange(actor, loadout?.weapon?.range ?? "close");
  return canReach(actor.formationSlot, weaponRange, target.row);
}

function resolveTechnique(
  s: CombatState,
  actor: Character,
  action: Extract<PlayerAction, { kind: "technique" }>,
  rng: Rng,
  log: (m: string) => void,
  emit: (m: string, e: CombatEvent) => void
): void {
  const tech = techniqueById(action.techniqueId);
  if (!tech) {
    log(`${actor.name} attempts an unknown technique.`);
    return;
  }

  if (action.targetInstanceId && techniqueNeedsEnemyReach(tech)) {
    const target = findEnemy(s, action.targetInstanceId);
    if (target && !techniqueCanReach(s, actor, tech, target)) {
      if (target.row === "back" && s.enemies.front.some((e) => e.currentHp > 0)) {
        log(`${actor.name} cannot reach ${target.name} in the back row with ${tech.name}.`);
      } else {
        log(`${actor.name} cannot reach ${target.name} with ${tech.name}.`);
      }
      return;
    }
  }

  // Validate rage cost
  if (!spendRage(s, actor.id, tech.rageCost)) {
    log(`${actor.name} doesn't have enough rage for ${tech.name}.`);
    return;
  }

  emit(
    `${actor.name} uses ${tech.name}!`,
    { type: "technique", actorId: actor.id, techniqueId: tech.id, targetId: action.targetInstanceId ?? null }
  );

  const eff = tech.effect;
  switch (eff.kind) {
    case "damage":
      resolveTechniqueDamage(s, actor, tech, action, eff, rng, log, emit);
      break;
    case "multiHit":
      resolveTechniqueMultiHit(s, actor, tech, action, eff, rng, log, emit);
      break;
    case "damageWithStatus":
      resolveTechniqueDamageWithStatus(s, actor, tech, action, eff, rng, log, emit);
      break;
    case "damageWithExecute":
      resolveTechniqueDamageWithExecute(s, actor, tech, action, eff, rng, log, emit);
      break;
    case "buff":
      resolveTechniqueBuff(s, actor, tech, eff, emit);
      break;
    case "debuff":
      resolveTechniqueDebuff(s, actor, tech, action, eff, emit);
      break;
    case "heal":
      resolveTechniqueHeal(s, actor, tech, action, emit);
      break;
    case "counterStance":
      s.counterStances[actor.id] = eff.multiplier;
      emit(`${actor.name} readies a counter stance.`, { type: "techniqueBuff", actorId: actor.id, techniqueId: tech.id, targetId: actor.id, isBuff: true });
      break;
    case "taunt":
      s.tauntingIds.push(actor.id);
      s.tauntBuffs[actor.id] = { bonus: eff.armorBonus, duration: eff.duration };
      emit(`${actor.name} taunts the enemy!`, { type: "techniqueBuff", actorId: actor.id, techniqueId: tech.id, targetId: actor.id, isBuff: true });
      break;
    case "buffNextAttack":
      s.nextAttackBonuses[actor.id] = {
        critChance: eff.critChanceBonus,
        hitChance: eff.hitChanceBonus ?? 0,
        duration: eff.duration,
      };
      emit(`${actor.name} feints, preparing a devastating strike.`, { type: "techniqueBuff", actorId: actor.id, techniqueId: tech.id, targetId: actor.id, isBuff: true });
      break;
    case "rageGrant":
      for (const ally of s.party) {
        if (ally.hp <= 0) continue;
        if (!classHasTechniques(ally.class)) continue;
        gainRage(s, ally.id, eff.amount);
      }
      emit(`${actor.name} rallies the party with a battle cry!`, { type: "techniqueBuff", actorId: actor.id, techniqueId: tech.id, targetId: actor.id, isBuff: true });
      break;
    case "damageBuff":
      if (eff.target === "self") {
        s.damageBuffs[actor.id] = { multiplier: eff.multiplier, duration: eff.duration };
      } else {
        for (const ally of s.party) {
          if (ally.hp <= 0) continue;
          s.damageBuffs[ally.id] = { multiplier: eff.multiplier, duration: eff.duration };
        }
      }
      emit(`${actor.name} inspires the party to greater fury!`, { type: "techniqueBuff", actorId: actor.id, techniqueId: tech.id, targetId: actor.id, isBuff: true });
      break;
  }

  // Rage: using a technique still counts as an action, gain +1 rage.
  gainRage(s, actor.id, 1);
}

/** Get technique targets (enemies) based on technique target type. */
function techniqueEnemyTargets(
  s: CombatState,
  tech: TechniqueDef,
  action: Extract<PlayerAction, { kind: "technique" }>
): EnemyInstance[] {
  const all = [...s.enemies.front, ...s.enemies.back].filter((e) => e.currentHp > 0);
  switch (tech.target) {
    case "singleEnemy":
      if (action.targetInstanceId) {
        const t = all.find((e) => e.instanceId === action.targetInstanceId);
        return t ? [t] : [];
      }
      return all.length > 0 ? [all[0]] : [];
    case "allFrontEnemies":
      return s.enemies.front.filter((e) => e.currentHp > 0);
    case "allEnemies":
      return all;
    case "rowEnemies": {
      const row = action.targetRow ?? "front";
      return s.enemies[row].filter((e) => e.currentHp > 0);
    }
    case "columnEnemies": {
      // Column = same index in front and back arrays.
      // If targetInstanceId is given, find its index; otherwise use index 0.
      let colIdx = 0;
      if (action.targetInstanceId) {
        const inFront = s.enemies.front.findIndex((e) => e.instanceId === action.targetInstanceId);
        const inBack = s.enemies.back.findIndex((e) => e.instanceId === action.targetInstanceId);
        colIdx = inFront >= 0 ? inFront : inBack >= 0 ? inBack : 0;
      }
      const targets: EnemyInstance[] = [];
      const front = s.enemies.front[colIdx];
      const back = s.enemies.back[colIdx];
      if (front && front.currentHp > 0) targets.push(front);
      if (back && back.currentHp > 0) targets.push(back);
      return targets;
    }
    case "randomEnemies":
      return all; // multiHit with randomTarget handles randomness
    default:
      return [];
  }
}

/** Resolve a technique that deals damage to one or more enemies. */
function resolveTechniqueDamage(
  s: CombatState,
  actor: Character,
  tech: TechniqueDef,
  action: Extract<PlayerAction, { kind: "technique" }>,
  eff: Extract<TechniqueEffect, { kind: "damage" }>,
  rng: Rng,
  log: (m: string) => void,
  emit: (m: string, e: CombatEvent) => void
): void {
  const targets = techniqueEnemyTargets(s, tech, action);
  if (targets.length === 0) {
    log(`${actor.name} finds no target for ${tech.name}.`);
    return;
  }
  for (const target of targets) {
    dealTechniqueDamage(s, actor, tech, target, eff.multiplier, eff.armorPen, eff.element, rng, log, emit);
  }
}

/** Resolve a multi-hit technique (Flurry, Blade Storm). */
function resolveTechniqueMultiHit(
  s: CombatState,
  actor: Character,
  tech: TechniqueDef,
  action: Extract<PlayerAction, { kind: "technique" }>,
  eff: Extract<TechniqueEffect, { kind: "multiHit" }>,
  rng: Rng,
  log: (m: string) => void,
  emit: (m: string, e: CombatEvent) => void
): void {
  const allTargets = techniqueEnemyTargets(s, tech, action);
  if (allTargets.length === 0) {
    log(`${actor.name} finds no target for ${tech.name}.`);
    return;
  }
  for (let i = 0; i < eff.hits; i++) {
    let target: EnemyInstance | undefined;
    if (eff.randomTarget) {
      const alive = [...s.enemies.front, ...s.enemies.back].filter((e) => e.currentHp > 0);
      target = pickRandom(alive, rng);
    } else {
      target = allTargets[0];
    }
    if (!target || target.currentHp <= 0) continue;
    // Each hit gets the cumulative crit chance bonus (Blade Storm).
    const critBonus = eff.critChanceBonus ? eff.critChanceBonus * i : 0;
    dealTechniqueDamage(s, actor, tech, target, eff.multiplier, undefined, undefined, rng, log, emit, critBonus);
  }
}

/** Resolve a technique that deals damage + may inflict a status. */
function resolveTechniqueDamageWithStatus(
  s: CombatState,
  actor: Character,
  tech: TechniqueDef,
  action: Extract<PlayerAction, { kind: "technique" }>,
  eff: Extract<TechniqueEffect, { kind: "damageWithStatus" }>,
  rng: Rng,
  log: (m: string) => void,
  emit: (m: string, e: CombatEvent) => void
): void {
  const targets = techniqueEnemyTargets(s, tech, action);
  if (targets.length === 0) {
    log(`${actor.name} finds no target for ${tech.name}.`);
    return;
  }
  for (const target of targets) {
    const hit = dealTechniqueDamage(s, actor, tech, target, eff.multiplier, undefined, undefined, rng, log, emit);
    if (hit && rng() < eff.statusChance) {
      applyTechniqueStatus(s, target, eff.status, eff.statusDuration ?? 1, log, emit, actor, tech);
    }
  }
}

/** Resolve a technique with execute (instant kill below threshold). */
function resolveTechniqueDamageWithExecute(
  s: CombatState,
  actor: Character,
  tech: TechniqueDef,
  action: Extract<PlayerAction, { kind: "technique" }>,
  eff: Extract<TechniqueEffect, { kind: "damageWithExecute" }>,
  rng: Rng,
  log: (m: string) => void,
  emit: (m: string, e: CombatEvent) => void
): void {
  const targets = techniqueEnemyTargets(s, tech, action);
  if (targets.length === 0) {
    log(`${actor.name} finds no target for ${tech.name}.`);
    return;
  }
  for (const target of targets) {
    const hit = dealTechniqueDamage(s, actor, tech, target, eff.multiplier, undefined, undefined, rng, log, emit);
    if (!hit) continue;
    // Check execute condition
    const hpPercent = target.currentHp / target.hp;
    if (hpPercent > 0 && hpPercent < eff.executeThreshold) {
      // undeadOnly check: if the technique requires undead, only execute undead.
      if (eff.undeadOnly) {
        const isUndead = target.special.some((sp) => sp.kind === "undead");
        if (!isUndead) continue;
      }
      target.currentHp = 0;
      log(`${target.name} is slain by ${tech.name}!`);
      emit(`${target.name} is slain by ${tech.name}!`, { type: "techniqueHit", actorId: actor.id, techniqueId: tech.id, targetId: target.instanceId, damage: target.hp });
    }
  }
}

/** Resolve a buff technique (armor buff to self/allies). */
function resolveTechniqueBuff(
  s: CombatState,
  actor: Character,
  tech: TechniqueDef,
  eff: Extract<TechniqueEffect, { kind: "buff" }>,
  emit: (m: string, e: CombatEvent) => void
): void {
  let targets: Character[] = [];
  switch (eff.target) {
    case "self":
      targets = [actor];
      break;
    case "allAllies":
      targets = s.party.filter((c) => c.hp > 0);
      break;
    case "allFrontAllies":
      targets = s.party.filter((c) => c.hp > 0 && charRow(c) === "front");
      break;
  }
  for (const t of targets) {
    s.armorBuffs[t.id] = (s.armorBuffs[t.id] ?? 0) + eff.power;
    emit(`${tech.name} bolsters ${t.name}'s armor by ${eff.power}.`, { type: "techniqueBuff", actorId: actor.id, techniqueId: tech.id, targetId: t.id, isBuff: true });
  }
}

/** Resolve a debuff technique (Disarm: reduce enemy AC). */
function resolveTechniqueDebuff(
  s: CombatState,
  actor: Character,
  tech: TechniqueDef,
  action: Extract<PlayerAction, { kind: "technique" }>,
  eff: Extract<TechniqueEffect, { kind: "debuff" }>,
  emit: (m: string, e: CombatEvent) => void
): void {
  const targets = techniqueEnemyTargets(s, tech, action);
  for (const t of targets) {
    // Deal the technique's damage if it's a damage-debuff combo (Disarm has 0.5x).
    // Actually Disarm is a pure debuff — but the spec says 0.5x damage.
    // We handle that by checking if the technique also has a damage component.
    // Since TechniqueEffect is a union, debuff is separate from damage.
    // For Disarm, we apply the debuff and a small damage hit.
    if (eff.stat === "armor") {
      s.enemyArmorDebuffs[t.instanceId] = { penalty: eff.power, duration: eff.duration };
      // Disarm also deals 0.5x damage — handled via a hardcoded check.
      // Actually, let's just deal a small hit here.
      const dmg = Math.max(1, Math.round((actor.level + 2) * 0.5));
      t.currentHp -= dmg;
      emit(`${actor.name} disarms ${t.name} for ${dmg} damage and reduces their armor by ${eff.power}!`, { type: "techniqueHit", actorId: actor.id, techniqueId: tech.id, targetId: t.instanceId, damage: dmg });
      emit(`${t.name}'s armor is reduced by ${eff.power} for ${eff.duration} rounds.`, { type: "techniqueStatus", actorId: actor.id, techniqueId: tech.id, targetId: t.instanceId, statusInflicted: "armorDown" });
    } else if (eff.stat === "agi") {
      s.enemyAgiDebuffs[t.instanceId] = { penalty: eff.power, duration: eff.duration };
      emit(`${t.name} is slowed! AGI reduced by ${eff.power} for ${eff.duration} rounds.`, { type: "techniqueStatus", actorId: actor.id, techniqueId: tech.id, targetId: t.instanceId, statusInflicted: "slow" });
    }
  }
}

/** Resolve a heal technique (Lay on Hands). */
function resolveTechniqueHeal(
  s: CombatState,
  actor: Character,
  tech: TechniqueDef,
  action: Extract<PlayerAction, { kind: "technique" }>,
  emit: (m: string, e: CombatEvent) => void
): void {
  let target: Character | undefined;
  if (action.targetAllyId) {
    target = s.party.find((c) => c.id === action.targetAllyId);
  } else {
    // Default to the most wounded ally (or self).
    const wounded = s.party.filter((c) => c.hp > 0 && c.hp < c.maxHp);
    target = wounded.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0] ?? actor;
  }
  if (!target) return;
  // Lay on Hands heals for (STR + PIE) × 2.
  const effStats = effStatsFor(s, actor);
  const healAmount = (effStats.str + effStats.pie) * 2;
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + healAmount);
  const healed = target.hp - before;
  emit(`${actor.name} lays hands on ${target.name}, healing ${healed} HP.`, { type: "techniqueBuff", actorId: actor.id, techniqueId: tech.id, targetId: target.id, isBuff: true });
}

/** Apply a status effect from a technique to an enemy. */
function applyTechniqueStatus(
  s: CombatState,
  target: EnemyInstance,
  status: "paralysis" | "poison" | "slow",
  duration: number,
  log: (m: string) => void,
  emit: (m: string, e: CombatEvent) => void,
  actor: Character,
  tech: TechniqueDef
): void {
  switch (status) {
    case "paralysis":
      if (!target.status.includes("paralysis")) {
        target.status.push("paralysis");
        s.paralysisTimers[target.instanceId] = duration;
        log(`${target.name} is stunned by ${tech.name}!`);
        emit(`${target.name} is stunned!`, { type: "techniqueStatus", actorId: actor.id, techniqueId: tech.id, targetId: target.instanceId, statusInflicted: "paralysis" });
      }
      break;
    case "poison":
      if (!target.status.includes("poison")) {
        target.status.push("poison");
        // Technique poison (Poison Blade): 3 damage/round for the status duration.
        s.poisonState[target.instanceId] = { damage: 3, duration };
        log(`${target.name} is poisoned by ${tech.name}!`);
        emit(`${target.name} is poisoned!`, { type: "techniqueStatus", actorId: actor.id, techniqueId: tech.id, targetId: target.instanceId, statusInflicted: "poison" });
      }
      break;
    case "slow":
      s.enemyAgiDebuffs[target.instanceId] = { penalty: 5, duration };
      log(`${target.name} is slowed by ${tech.name}!`);
      emit(`${target.name} is slowed!`, { type: "techniqueStatus", actorId: actor.id, techniqueId: tech.id, targetId: target.instanceId, statusInflicted: "slow" });
      break;
  }
}

/**
 * Core: deal technique damage to a single enemy.
 * Returns true if the attack hit, false if it missed/evaded.
 */
function dealTechniqueDamage(
  s: CombatState,
  actor: Character,
  tech: TechniqueDef,
  target: EnemyInstance,
  multiplier: number,
  armorPen: number | undefined,
  element: DamageElement | undefined,
  rng: Rng,
  log: (m: string) => void,
  emit: (m: string, e: CombatEvent) => void,
  extraCritChance: number = 0
): boolean {
  // Check reachability for non-reach techniques.
  // Lunge and Pole Vault ignore range; others use the actor's weapon range.
  const ignoresRange = tech.id === "duelist-lunge" || tech.id === "halberdier-pole-vault";
  if (!ignoresRange) {
    const loadout = s.loadout[actor.id];
    const weaponRange: WeaponRange = effectiveWeaponRange(actor, loadout?.weapon?.range ?? "close");
    if (!canReach(actor.formationSlot, weaponRange, target.row)) {
      if (target.row === "back" && s.enemies.front.some((e) => e.currentHp > 0)) {
        log(`${actor.name} cannot reach ${target.name} in the back row with ${tech.name}.`);
      } else {
        log(`${actor.name} cannot reach ${target.name} with ${tech.name}.`);
      }
      return false;
    }
  }

  // Feint / next-attack bonus: check before evasion/blind so guaranteed hits skip them.
  const nextBonus = s.nextAttackBonuses[actor.id];
  const guaranteedHit = nextBonus?.hitChance >= 1;
  let extraCrit = extraCritChance;
  if (nextBonus) {
    extraCrit += nextBonus.critChance;
    delete s.nextAttackBonuses[actor.id];
  }

  // Evasive enemies (skipped if Feint guaranteed a hit)
  if (!guaranteedHit && target.special.some((sp) => sp.kind === "evasive")) {
    if (rng() < 0.2) {
      emit(`${target.name} evades ${tech.name}!`, { type: "techniqueMiss", actorId: actor.id, techniqueId: tech.id, targetId: target.instanceId });
      return false;
    }
  }

  // Blind check (skipped if Feint guaranteed a hit)
  if (!guaranteedHit && actor.status.includes("blind") && rng() >= 0.5) {
    emit(`${actor.name} is blind and misses with ${tech.name}.`, { type: "techniqueMiss", actorId: actor.id, techniqueId: tech.id, targetId: target.instanceId });
    return false;
  }

  const isShadowStrike = tech.id === "thief-shadow-strike";
  const isPerfectStrike = tech.id === "duelist-perfect-strike";
  const forceCrit =
    isPerfectStrike || (isShadowStrike && actor.status.includes("hidden"));

  // Calculate base damage (same formula as resolveAttack).
  const effStats = effStatsFor(s, actor);
  const mods = perkModifiers(perksForCharacter(actor), effStats);
  const loadout = s.loadout[actor.id];
  const weapon = loadout?.weapon;
  const weaponBonus = weapon?.attackBonus ?? 0;
  const base = effStats.str + actor.level + weaponBonus;
  const isThief = actor.class === "Thief";
  const weaponRange = effectiveWeaponRange(actor, weapon?.range ?? "close");
  const rowMultiplier = charRow(actor) === "back" && weaponRange === "close" && !isThief && !ignoresRange ? 0.4 : 1;
  const variance = 0.8 + rng() * 0.4;
  let damage = Math.max(1, Math.round(base * rowMultiplier * variance * mods.meleeDamageMultiplier)) + mods.meleeBonusDamage;

  // Apply technique multiplier (plus undead/demon perk bonuses).
  damage = Math.max(1, Math.round(damage * multiplier * tagDamageMultiplier(mods, target)));

  // Damage buff (Battle Cry)
  const dmgBuff = s.damageBuffs[actor.id];
  if (dmgBuff) {
    damage = Math.max(1, Math.round(damage * dmgBuff.multiplier));
  }

  // halberdier-warlord: +20% damage while adjacent to a living Warlord holder.
  damage = Math.max(1, Math.round(damage * warlordDamageMultiplier(s, actor)));

  // Critical hit
  let crit = false;
  const critChance = critChanceFromLukAndBonuses(
    effStats.luk,
    mods.critChanceBonus,
    extraCrit
  );
  if (forceCrit || rng() < critChance) {
    const critMult = isShadowStrike ? mods.critDamageMultiplier * 2 : isPerfectStrike ? 2.5 : mods.critDamageMultiplier;
    damage = Math.max(1, Math.round(damage * critMult));
    crit = true;
    log(`${actor.name} lands a critical hit with ${tech.name}!`);
  }

  // Enemy AC reduction (debuffs applied), floored at 50% of the swing (P2-8);
  // technique armor pen and Reach Mastery pierce the floor.
  const flooredAc = Math.min(effectiveEnemyAc(s, target), Math.floor(damage / 2));
  const penAc = Math.max(0, flooredAc - mods.acFlatIgnore);
  const acReduction = armorPen !== undefined ? Math.round(penAc * (1 - armorPen)) : penAc;
  damage = Math.max(1, damage - acReduction);

  // highDefense enemies halve physical damage (divine/lightning bypass this)
  if (!element && target.special.some((sp) => sp.kind === "highDefense")) {
    damage = Math.max(1, Math.round(damage * 0.5));
  }

  // resistPhysical (only for non-elemental technique damage)
  if (!element) {
    const resist = target.special.find(
      (sp): sp is Extract<EnemySpecial, { kind: "resistPhysical" }> => sp.kind === "resistPhysical"
    );
    if (resist) {
      damage = Math.max(1, Math.round(damage * (1 - resist.percent / 100)));
    }
  }

  // Divine damage: +50% vs undead (for Crusader techniques)
  if (element === "divine") {
    const isUndead = target.special.some((sp) => sp.kind === "undead");
    if (isUndead) {
      damage = Math.max(1, Math.round(damage * 1.5));
    }
  }

  target.currentHp -= damage;
  emit(
    `${actor.name} hits ${target.name} with ${tech.name} for ${damage} damage.`,
    { type: "techniqueHit", actorId: actor.id, techniqueId: tech.id, targetId: target.instanceId, damage, crit }
  );
  wakeOnDamage(target, log);

  // Consume hidden status if Shadow Strike was used from hide
  if (isShadowStrike && actor.status.includes("hidden")) {
    actor.status = actor.status.filter((st) => st !== "hidden");
  }

  // Dispatch OnAttackHit for perk interactions (Cleave, etc.)
  dispatchHook("OnAttackHit", perksForCharacter(actor), {
    state: s.perkState[actor.id],
    rng,
    damage,
    dealCleaveDamage: (dmg: number) => {
      const front = s.enemies.front.filter((e) => e.currentHp > 0 && e.instanceId !== target.instanceId);
      const other = pickRandom(front, rng);
      if (!other) return;
      other.currentHp -= dmg;
      emit(`${actor.name} cleaves ${other.name} for ${dmg} damage!`, { type: "attack", actorId: actor.id, targetId: other.instanceId, damage: dmg });
      wakeOnDamage(other, log);
    },
    hitAllFrontRow: (dmg: number) => {
      for (const other of s.enemies.front.filter((e) => e.currentHp > 0 && e.instanceId !== target.instanceId)) {
        other.currentHp -= dmg;
        emit(`${actor.name} strikes ${other.name} for ${dmg} damage!`, { type: "attack", actorId: actor.id, targetId: other.instanceId, damage: dmg });
        wakeOnDamage(other, log);
      }
    },
  });

  return true;
}
