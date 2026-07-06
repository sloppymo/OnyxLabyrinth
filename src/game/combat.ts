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

import type { Character, Stats, StatusEffect } from "./party";
import { charRow } from "./party";
import type { EnemyDef, EnemySpecial, Row } from "../data/enemies";
import type { SpellDef, SpellEffect, SpellTarget } from "../data/spells";
import { spellByName } from "../data/spells";
import type { ItemDef } from "../data/items";
import { ITEMS_BY_ID } from "../data/items";

// Re-export types that the combat UI / main.ts needs
export type { Character, EnemyDef, SpellDef, ItemDef, Row, StatusEffect };

// ---------------------------------------------------------------------------
// Combat-internal types
// ---------------------------------------------------------------------------

/**
 * A runtime enemy instance: the static `EnemyDef` template plus mutable
 * per-instance combat state. `instanceId` is unique per spawn so multiple
 * copies of the same enemy type can be targeted independently. `row` is the
 * actual assigned row from the encounter table (EnemyDef has `rowPreference`
 * which may be "any"; the encounter table pins the actual row).
 */
export interface EnemyInstance extends EnemyDef {
  instanceId: string;
  currentHp: number;
  row: Row; // actual row in this encounter (from EnemySpawn)
  status: StatusEffect[]; // enemies can be slept / blinded / paralyzed too
}

export interface EnemyFormation {
  front: EnemyInstance[];
  back: EnemyInstance[];
}

/** Equipment read by combat for damage / armor math. Combat-internal. */
export interface Loadout {
  weapon?: ItemDef;
  armor: ItemDef[];
}

/** Build the starter loadout for a newly created character. */
export function defaultLoadoutForCharacter(char: Character): Loadout {
  const loadout: Loadout = { armor: [] };
  if (char.class === "Fighter") {
    loadout.weapon = ITEMS_BY_ID["short-sword"];
  } else if (char.class === "Thief") {
    loadout.weapon = ITEMS_BY_ID["dagger"];
  } else if (char.class === "Mage" || char.class === "Priest") {
    loadout.weapon = ITEMS_BY_ID["staff"];
  }
  if (char.formationSlot <= 2) {
    const leather = ITEMS_BY_ID["leather"];
    if (leather) loadout.armor = [leather];
  }
  return loadout;
}

/** True if `candidate` is strictly better than `current` for its slot. */
export function isBetterEquip(current: ItemDef | undefined, candidate: ItemDef): boolean {
  if (candidate.type === "consumable") return false;
  if (!current) return true;
  if (candidate.type === "weapon") {
    return (candidate.attackBonus ?? 0) > (current.attackBonus ?? 0);
  }
  return (candidate.defenseBonus ?? 0) > (current.defenseBonus ?? 0);
}

/** Return a new loadout with `item` equipped, replacing any same-slot gear only
 *  if the new item is better. Non-equipment items are ignored. */
export function equipItem(loadout: Loadout, item: ItemDef): Loadout {
  if (item.type === "consumable") return loadout;
  if (item.type === "weapon") {
    if (!isBetterEquip(loadout.weapon, item)) return loadout;
    return { ...loadout, weapon: item };
  }
  const armor = loadout.armor ? [...loadout.armor] : [];
  if (item.slot) {
    const idx = armor.findIndex((a) => a.slot === item.slot);
    if (idx >= 0) {
      if (!isBetterEquip(armor[idx], item)) return loadout;
      armor[idx] = item;
      return { ...loadout, armor };
    }
  }
  armor.push(item);
  return { ...loadout, armor };
}

/** Pick the party member with the weakest item in the slot `item` occupies. */
export function findBestEquipTarget(
  party: Character[],
  equipment: Record<string, Loadout>,
  item: ItemDef
): string | undefined {
  if (item.type === "consumable") return undefined;
  let bestId: string | undefined;
  let bestScore = Infinity;
  for (const c of party) {
    const loadout = equipment[c.id];
    if (!loadout) continue;
    let score = 0;
    if (item.type === "weapon") {
      score = loadout.weapon?.attackBonus ?? 0;
    } else if (item.slot) {
      score = loadout.armor.find((a) => a.slot === item.slot)?.defenseBonus ?? 0;
    }
    if (score < bestScore) {
      bestId = c.id;
      bestScore = score;
    }
  }
  return bestId;
}

export type PlayerAction =
  | { kind: "attack"; actorId: string; targetInstanceId: string }
  | {
      kind: "cast";
      actorId: string;
      spellId: string;
      targetInstanceId?: string; // enemy instance id for singleEnemy
      targetAllyId?: string; // character id for singleAlly
    }
  | { kind: "defend"; actorId: string }
  | {
      kind: "item";
      actorId: string;
      itemId: string;
      targetAllyId?: string;
    }
  | { kind: "flee"; actorId: string };

/**
 * Structured combat event emitted alongside log messages. The combat
 * renderer uses these to trigger animations without parsing log strings.
 * Each log() call that produces an animatable event also pushes a
 * CombatEvent. Events are 1:1 with log entries (null if no event).
 */
export type CombatEvent =
  | { type: "attack"; actorId: string; targetId: string; damage: number }
  | { type: "miss"; actorId: string; targetId: string; reason: "evade" | "blind" | "noTarget" }
  | { type: "cast"; actorId: string; spellId: string; targetId: string | null; damage?: number; heal?: number }
  | { type: "spellEffect"; spellId: string; targetId: string; damage?: number; heal?: number; statusInflicted?: string; statusCured?: string; isBuff?: boolean }
  | { type: "defeated"; targetId: string; wasEnemy: boolean }
  | { type: "revived"; targetId: string }
  | { type: "defend"; actorId: string }
  | { type: "statusTick"; targetId: string; damage: number; status: string }
  | { type: "statusEnd"; targetId: string; status: string }
  | { type: "flee"; success: boolean }
  | { type: "silence"; actorId: string; targetId: string }
  | { type: "fizzle"; actorId: string }
  | null;

/** Internal: an enemy's resolved intent for the round. */
type EnemyAction =
  | {
      kind: "attack";
      actor: EnemyInstance;
      targetId: string; // character id
    }
  | { kind: "cast"; actor: EnemyInstance; spellId: string; targetId: string }
  | { kind: "silence"; actor: EnemyInstance }
  | { kind: "doNothing"; actor: EnemyInstance };

export interface CombatState {
  party: Character[];
  enemies: EnemyFormation;
  round: number;
  isBoss: boolean;
  log: string[];
  ended: boolean;
  result?: "victory" | "wipe" | "fled";
  /** Total gold and XP earned from defeated enemies (for victory rewards). */
  goldEarned: number;
  xpEarned: number;
  /** Character ids silenced this round (combat-internal; never written to Character.status). */
  silencedThisRound: string[];
  /** Per-round damage reduction from Defend (char id -> reduction fraction). Reset each round. */
  defendBuff: Record<string, number>;
  /** Persistent armor buffs from spells (char id -> reduction). Set by buff spells. */
  armorBuffs: Record<string, number>;
  /** Paralysis countdown (actor id -> rounds remaining). Combat-internal. */
  paralysisTimers: Record<string, number>;
  /** Spell lookup table. */
  spells: Record<string, SpellDef>;
  /** Item lookup table. */
  items: Record<string, ItemDef>;
  /** Per-character equipment. */
  loadout: Record<string, Loadout>;
  /** Whether the encounter started in an anti-magic zone (spells fail). */
  inAntimagic: boolean;
  /**
   * Per-item inventory counts (id -> count). Snapshot of GameState.inventory
   * at combat start; decremented when consumables are used in combat.
   */
  inventory: Record<string, number>;
  /**
   * Enemies that died this round (removed from front/back arrays by
   * deathCheck). The combat UI reads this to populate the renderer's
   * graveyard so death animations can play after the enemy is gone
   * from the living arrays. Cleared at the start of each round.
   */
  justDied: EnemyInstance[];
  /**
   * Structured events emitted alongside log messages this round. Each
   * entry corresponds 1:1 with a log entry (null if the log message has
   * no associated event). Cleared at the start of each round.
   */
  events: CombatEvent[];
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
    justDied: [],
    events: [],
  };
}

/** Convert a flat item-id inventory into stack counts. */
export function inventoryToCounts(inventory: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of inventory) {
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/** Convert stack counts back into a flat item-id inventory. */
export function inventoryFromCounts(counts: Record<string, number>): string[] {
  const inventory: string[] = [];
  for (const [id, count] of Object.entries(counts)) {
    for (let i = 0; i < count; i++) {
      inventory.push(id);
    }
  }
  return inventory;
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
  inventory: string[] = [],
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

export type Rng = () => number;

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
      log(`${c.name} is incapacitated and skips their action.`);
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
    const success = attemptFlee(s.isBoss, rng);
    if (success) {
      emit("The party flees from combat!", { type: "flee", success: true });
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
  const enemyActions = buildEnemyActions(s, rng, log);

  // --- Phase 3: initiative sort -------------------------------------------
  const ordered = initiativeOrder(s, sanitized, enemyActions, rng);

  // --- Phase 4: resolution ------------------------------------------------
  for (const entry of ordered) {
    if (s.ended) break;
    if (entry.kind === "player") {
      resolvePlayerAction(s, entry.action, rng, log, emit);
    } else {
      resolveEnemyAction(s, entry.action, rng, log, emit);
    }
    deathCheck(s, emit);
    if (checkTermination(s, log)) return s;
  }

  // --- Phase 5: end-of-round status ticks ---------------------------------
  tickStatuses(s, log);
  deathCheck(s, emit);
  if (checkTermination(s, log)) return s;

  // Per-round silence from flag-driven bosses (silenceRandom) ends now.
  s.silencedThisRound = [];

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
    entries.push({
      kind: "player",
      action: a,
      agi: c.stats.agi,
      luk: c.stats.luk,
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

function buildEnemyActions(
  s: CombatState,
  rng: Rng,
  log: (m: string) => void
): EnemyAction[] {
  const actions: EnemyAction[] = [];
  const allEnemies = [...s.enemies.front, ...s.enemies.back].filter(
    (e) => e.currentHp > 0
  );
  const livingParty = s.party.filter((c) => c.hp > 0);
  if (livingParty.length === 0) return actions;

  for (const enemy of allEnemies) {
    if (enemy.status.includes("sleep") || enemy.status.includes("paralysis")) {
      actions.push({ kind: "doNothing", actor: enemy });
      continue;
    }

    // Boss / special: flag-driven silence (Section 10.2). Generic — any enemy
    // with a "silenceRandom" special silences a random party member.
    if (enemy.special.some((sp) => sp.kind === "silenceRandom")) {
      const target = pickRandom(livingParty, rng);
      if (target) {
        s.silencedThisRound.push(target.id);
        log(`${enemy.name} casts Silence on ${target.name}!`);
        actions.push({ kind: "silence", actor: enemy });
        continue;
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
          actions.push({
            kind: "cast",
            actor: enemy,
            spellId: spell?.id ?? healerSpecial.spellName,
            targetId: target.instanceId,
          });
          continue;
        }
      }

      // Caster: fling an elemental spell at a random party member.
      if (casterSpecial) {
        const target = pickRandom(livingParty, rng);
        if (target) {
          const spellName = casterSpecial.element === "cold" ? "Molito" : "Halito";
          const spell = spellByName(spellName);
          actions.push({ kind: "cast", actor: enemy, spellId: spell?.id ?? spellName, targetId: target.id });
          continue;
        }
      }

      // Fallback: no valid cast — attack instead.
      const target = pickRandom(livingParty, rng);
      if (target) actions.push({ kind: "attack", actor: enemy, targetId: target.id });
      else actions.push({ kind: "doNothing", actor: enemy });
    } else {
      // Melee: weighted 70% front row.
      const target = pickMeleeTarget(s.party, rng);
      if (target) actions.push({ kind: "attack", actor: enemy, targetId: target.id });
      else actions.push({ kind: "doNothing", actor: enemy });
    }
  }
  return actions;
}

/**
 * Weighted random selection: 70% chance to pick from the living front row
 * (if any), otherwise fall back to any living party member. Implemented as
 * an actual weighted draw, not a rounded approximation.
 */
function pickMeleeTarget(party: Character[], rng: Rng): Character | undefined {
  const living = party.filter((c) => c.hp > 0);
  if (living.length === 0) return undefined;
  const frontLiving = living.filter((c) => charRow(c) === "front");
  if (frontLiving.length > 0 && rng() < 0.7) {
    return pickRandom(frontLiving, rng);
  }
  return pickRandom(living, rng);
}

function pickRandom<T>(arr: T[], rng: Rng): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}

// ---------------------------------------------------------------------------
// Player action resolution
// ---------------------------------------------------------------------------

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
      break;
    case "cast":
      resolveCast(s, actor, action, rng, log, emit);
      break;
    case "defend":
      resolveDefend(s, actor, emit);
      break;
    case "item":
      resolveItem(s, actor, action, log);
      break;
    case "flee":
      resolveDefend(s, actor, emit);
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
    return;
  }

  // Formation check (Section 7.4): back-row enemies are immune to melee
  // until the front row is cleared, unless the attacker has a ranged weapon.
  const loadout = s.loadout[actor.id];
  const weapon = loadout?.weapon;
  // TODO: confirm ranged flag with Track B — ItemDef.ranged is not in the
  // frozen contract. Treated as optional; absent means melee-only.
  const isRanged = (weapon as ItemDef & { ranged?: boolean })?.ranged === true;
  if (target.row === "back" && s.enemies.front.some((e) => e.currentHp > 0)) {
    if (!isRanged) {
      log(
        `${actor.name} cannot reach ${target.name} in the back row (front row still up).`
      );
      return;
    }
  }

  // Evasive enemies have a dodge chance.
  if (target.special.some((sp) => sp.kind === "evasive")) {
    if (rng() < 0.2) {
      emit(
        `${target.name} evades ${actor.name}'s attack!`,
        { type: "miss", actorId: actor.id, targetId: target.instanceId, reason: "evade" }
      );
      return;
    }
  }

  // Flying enemies are hard to reach with melee (15% melee miss unless ranged).
  if (target.special.some((sp) => sp.kind === "flying") && !isRanged) {
    if (rng() < 0.15) {
      emit(
        `${target.name} flits away from ${actor.name}'s swing!`,
        { type: "miss", actorId: actor.id, targetId: target.instanceId, reason: "evade" }
      );
      return;
    }
  }

  // Blind: 50% hit rate (Section 7.5).
  if (actor.status.includes("blind")) {
    if (rng() >= 0.5) {
      emit(
        `${actor.name} is blind and misses ${target.name}.`,
        { type: "miss", actorId: actor.id, targetId: target.instanceId, reason: "blind" }
      );
      return;
    }
  }

  const weaponBonus = weapon?.attackBonus ?? 0;
  const base = actor.stats.str + actor.level + weaponBonus;
  // Back-row attackers deal ~40% melee damage (Section 4.3) unless ranged or a
  // Thief backstabbing (Thief deals full damage from the back row — §4.2).
  const isThief = actor.class === "Thief";
  const rowMultiplier = charRow(actor) === "back" && !isRanged && !isThief ? 0.4 : 1;
  const variance = 0.8 + rng() * 0.4; // +/-20%
  let damage = Math.max(1, Math.round(base * rowMultiplier * variance));

  // Critical hit: chance based on LUK (Section 4.1). Doubles damage.
  if (rng() < actor.stats.luk / 100) {
    damage *= 2;
    log(`${actor.name} lands a critical hit!`);
  }

  // Enemy AC reduces physical damage.
  damage = Math.max(1, damage - target.ac);

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
    { type: "attack", actorId: actor.id, targetId: target.instanceId, damage }
  );
  wakeOnDamage(target, log);
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
  const spell = s.spells[action.spellId];
  if (!spell) {
    log(`${actor.name} tries to cast an unknown spell.`);
    return;
  }
  if (actor.sp < spell.spCost) {
    log(`${actor.name} lacks the SP to cast ${spell.name}.`);
    return;
  }
  if (!actor.knownSpellIds.includes(spell.id)) {
    log(`${actor.name} does not know ${spell.name}.`);
    return;
  }
  actor.sp -= spell.spCost;
  // Determine target id for the cast event (may be null for group spells).
  let targetId: string | null = null;
  if (action.targetInstanceId) targetId = action.targetInstanceId;
  else if (action.targetAllyId) targetId = action.targetAllyId;
  emit(
    `${actor.name} casts ${spell.name}.`,
    { type: "cast", actorId: actor.id, spellId: spell.id, targetId }
  );
  applySpell(s, actor, spell, action, rng, log, emit);
}

function resolveDefend(
  s: CombatState,
  actor: Character,
  emit: (m: string, e: CombatEvent) => void
): void {
  s.defendBuff[actor.id] = 0.5;
  emit(`${actor.name} defends.`, { type: "defend", actorId: actor.id });
}

function resolveItem(
  s: CombatState,
  actor: Character,
  action: Extract<PlayerAction, { kind: "item" }>,
  log: (m: string) => void
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
  if (eff.kind === "heal") {
    const amount = eff.power;
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    log(
      `${actor.name} uses ${item.name} on ${target.name}, restoring ${target.hp - before} HP.`
    );
    if (target.status.includes("knockedOut") && target.hp > 0) {
      target.status = target.status.filter((st) => st !== "knockedOut");
      log(`${target.name} is revived!`);
    }
  } else if (eff.kind === "cure") {
    target.status = target.status.filter((st) => st !== eff.status);
    log(`${actor.name} uses ${item.name} on ${target.name}, curing ${eff.status}.`);
  } else if (eff.kind === "revive") {
    if (target.status.includes("knockedOut")) {
      target.hp = Math.max(1, eff.power);
      target.status = target.status.filter((st) => st !== "knockedOut");
      log(`${actor.name} uses ${item.name} to revive ${target.name} with ${target.hp} HP!`);
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
  emit: (m: string, e: CombatEvent) => void
): void {
  const eff = spell.effect;
  switch (eff.kind) {
    case "damage": {
      for (const t of spellTargets(s, spell, action)) {
        // "undead" element only damages undead enemies.
        if (eff.element === "undead" && !t.special.some((sp) => sp.kind === "undead")) {
          continue;
        }
        const dmg = Math.max(1, eff.power);
        // Enemy AC reduces spell damage too (less than physical — half AC).
        const reduced = Math.max(1, dmg - Math.floor(t.ac / 2));
        t.currentHp -= reduced;
        emit(
          `${spell.name} hits ${t.name} for ${reduced} damage.`,
          { type: "spellEffect", spellId: spell.id, targetId: t.instanceId, damage: reduced }
        );
        wakeOnDamage(t, log);
      }
      break;
    }
    case "heal": {
      for (const t of allyTargets(s, spell, action, caster)) {
        const before = t.hp;
        t.hp = Math.min(t.maxHp, t.hp + eff.power);
        emit(
          `${spell.name} heals ${t.name} for ${t.hp - before} HP.`,
          { type: "spellEffect", spellId: spell.id, targetId: t.id, heal: t.hp - before }
        );
        if (t.status.includes("knockedOut") && t.hp > 0) {
          t.status = t.status.filter((st) => st !== "knockedOut");
          emit(`${t.name} is revived!`, { type: "revived", targetId: t.id });
        }
      }
      break;
    }
    case "disable": {
      for (const t of spellTargets(s, spell, action)) {
        addStatus(t, eff.status);
        emit(
          `${t.name} is afflicted with ${eff.status}.`,
          { type: "spellEffect", spellId: spell.id, targetId: t.instanceId, statusInflicted: eff.status }
        );
      }
      break;
    }
    case "cure": {
      for (const t of allyTargets(s, spell, action, caster)) {
        t.status = t.status.filter((st) => st !== eff.status);
        emit(
          `${spell.name} cures ${t.name} of ${eff.status}.`,
          { type: "spellEffect", spellId: spell.id, targetId: t.id, statusCured: eff.status }
        );
      }
      break;
    }
    case "buff": {
      // TODO: confirm buff amount/duration with Track B. SpellDef's buff
      // effect has no power field; we use a default of 3, persistent this combat.
      const amount = 3;
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
      for (const t of allyTargets(s, spell, action, caster)) {
        if (!t.status.includes("knockedOut")) continue;
        t.hp = 1;
        t.status = t.status.filter((st) => st !== "knockedOut");
        emit(
          `${spell.name} resurrects ${t.name} with ${t.hp} HP!`,
          { type: "revived", targetId: t.id }
        );
      }
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

function resolveEnemyAction(
  s: CombatState,
  action: EnemyAction,
  rng: Rng,
  log: (m: string) => void,
  emit: (m: string, e: CombatEvent) => void
): void {
  if (action.kind === "doNothing" || action.kind === "silence") return;
  if (action.actor.currentHp <= 0) return;

  // Enemy spell: either an offensive cast at a party member or a heal on an
  // enemy ally. Distinguished by whether the targetId resolves to a party
  // member or an enemy instance.
  if (action.kind === "cast") {
    const { actor, spellId, targetId } = action;
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

  const { actor, targetId } = action;
  const target = s.party.find((c) => c.id === targetId);
  if (!target || target.hp <= 0) return;

  if (actor.status.includes("blind")) {
    if (rng() >= 0.5) {
      emit(
        `${actor.name} is blind and misses ${target.name}.`,
        { type: "miss", actorId: actor.instanceId, targetId: target.id, reason: "blind" }
      );
      return;
    }
  }
  const base = actor.attack;
  const variance = 0.8 + rng() * 0.4;
  let damage = Math.max(1, Math.round(base * variance));
  damage = damageReductionFor(s, target, damage);
  target.hp -= damage;
  emit(
    `${actor.name} hits ${target.name} for ${damage} damage.`,
    { type: "attack", actorId: actor.instanceId, targetId: target.id, damage }
  );
  // Poison on hit (Cobweb, Acid Puddle).
  if (actor.special.some((sp) => sp.kind === "poisonOnHit")) {
    if (!target.status.includes("poison")) {
      target.status.push("poison");
      log(`${target.name} is poisoned!`);
    }
  }
  wakeOnDamage(target, log);
}

// ---------------------------------------------------------------------------
// Damage reduction / armor
// ---------------------------------------------------------------------------

/**
 * Reduce incoming damage to a CHARACTER by: equipped armor defenseBonus
 * (data-driven) + persistent spell armorBuffs + per-round Defend buff
 * (percentage).
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
  const flatReduction = armorBonus + spellBuff;
  let dmg = Math.max(1, damage - flatReduction);
  const defendPct = s.defendBuff[target.id] ?? 0;
  if (defendPct > 0) {
    dmg = Math.max(1, Math.round(dmg * (1 - defendPct)));
  }
  return dmg;
}

// ---------------------------------------------------------------------------
// Flee
// ---------------------------------------------------------------------------

function attemptFlee(isBoss: boolean, rng: Rng): boolean {
  if (isBoss) return false; // 0% vs boss (Section 7.2)
  return rng() < 0.95; // 95% base success
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
}

function checkTermination(s: CombatState, log: (m: string) => void): boolean {
  const enemiesRemaining =
    s.enemies.front.filter((e) => e.currentHp > 0).length +
    s.enemies.back.filter((e) => e.currentHp > 0).length;
  if (enemiesRemaining === 0 && !s.ended) {
    s.ended = true;
    s.result = "victory";
    log("All enemies defeated — victory!");
    return true;
  }
  const partyAlive = s.party.filter((c) => c.hp > 0).length;
  if (partyAlive === 0 && !s.ended) {
    s.ended = true;
    s.result = "wipe";
    log("The party has been wiped out!");
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Status ticks (end of round)
// ---------------------------------------------------------------------------

function tickStatuses(s: CombatState, log: (m: string) => void): void {
  // Party poison + paralysis countdown.
  for (const c of s.party) {
    if (c.status.includes("knockedOut")) continue;
    if (c.status.includes("poison")) {
      c.hp = Math.max(0, c.hp - 2);
      log(`${c.name} suffers 2 poison damage.`);
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
  }
  // Enemy poison + paralysis countdown.
  for (const e of [...s.enemies.front, ...s.enemies.back]) {
    if (e.currentHp <= 0) continue;
    if (e.status.includes("poison")) {
      e.currentHp = Math.max(0, e.currentHp - 2);
      log(`${e.name} suffers 2 poison damage.`);
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

function addStatus(target: { status: StatusEffect[] }, st: StatusEffect): void {
  if (!target.status.includes(st)) target.status.push(st);
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

function cloneCharacter(c: Character): Character {
  return {
    ...c,
    stats: { ...c.stats },
    status: [...c.status],
    knownSpellIds: [...c.knownSpellIds],
  };
}

function cloneEnemy(e: EnemyInstance): EnemyInstance {
  return {
    ...e,
    special: [...e.special],
    status: [...e.status],
  };
}

// Re-export helpers the combat UI needs
export { charRow };
export type { Stats, SpellEffect, SpellTarget, EnemySpecial };
