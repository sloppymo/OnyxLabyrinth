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
import type { SpellDef, SpellEffect, SpellTarget, DamageElement } from "../data/spells";
import { spellByName } from "../data/spells";
import type { ItemDef } from "../data/items";
import { ITEMS_BY_ID } from "../data/items";
import type { TechniqueDef, TechniqueEffect, TechniqueTarget } from "../data/techniques";
import { techniqueById, classHasTechniques, maxRageForLevel } from "../data/techniques";
import { effectiveStats } from "./effective-stats";
import {
  perksForCharacter,
  perkModifiers,
  dispatchHook,
  freshPerkState,
} from "./perks";

/** Effective stats for a combatant, reading their loadout and chosen perks. */
function effStatsFor(s: CombatState, c: Character): Stats {
  return effectiveStats(c, s.loadout[c.id], perksForCharacter(c));
}

// Re-export types that the combat UI / main.ts needs
export type { Character, EnemyDef, SpellDef, ItemDef, Row, StatusEffect };

// ---------------------------------------------------------------------------
// Combat-internal types
// ---------------------------------------------------------------------------

/**
 * Weapon range types for the Wizardry V targeting system.
 * Maps Wizardry V's four-group encounter grid to OnyxLabyrinth's two-row
 * formation (front row ≈ groups 1-2, back row ≈ groups 3-4).
 *
 * - Close: front-row attackers can hit front-row enemies only.
 * - Short: front-row attackers can hit any row; back-row attackers can hit
 *          front-row enemies only.
 * - Medium: front-row attackers can hit any row; back-row attackers can hit
 *           any row.
 * - Long: any position can hit any row.
 */
export type WeaponRange = "close" | "short" | "medium" | "long";

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
  } else if (char.class === "Halberdier") {
    loadout.weapon = ITEMS_BY_ID["halberd"];
  } else if (char.class === "Duelist") {
    loadout.weapon = ITEMS_BY_ID["rapier"];
  } else if (char.class === "Crusader") {
    loadout.weapon = ITEMS_BY_ID["long-sword"];
  }
  if (
    char.formationSlot <= 2 ||
    char.class === "Halberdier" ||
    char.class === "Crusader"
  ) {
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
 *  if the new item is better. Non-equipment items are ignored. Cursed gear
 *  already in the slot can never be replaced (Remove Curse at the Temple). */
export function equipItem(loadout: Loadout, item: ItemDef): Loadout {
  if (item.type === "consumable" || item.type === "trinket") return loadout;
  if (item.type === "weapon") {
    if (loadout.weapon?.cursed) return loadout;
    if (!isBetterEquip(loadout.weapon, item)) return loadout;
    return { ...loadout, weapon: item };
  }
  const armor = loadout.armor ? [...loadout.armor] : [];
  if (item.slot) {
    const idx = armor.findIndex((a) => a.slot === item.slot);
    if (idx >= 0) {
      if (armor[idx].cursed) return loadout;
      if (!isBetterEquip(armor[idx], item)) return loadout;
      armor[idx] = item;
      return { ...loadout, armor };
    }
  }
  armor.push(item);
  return { ...loadout, armor };
}

/**
 * Force `item` into its slot regardless of quality — the cursed-gear clamp.
 * Still refuses to displace other cursed gear (one curse per slot).
 * Returns null if the slot is curse-locked (the item stays in the pack).
 */
export function forceEquip(loadout: Loadout, item: ItemDef): Loadout | null {
  if (item.type === "consumable" || item.type === "trinket") return null;
  if (item.type === "weapon") {
    if (loadout.weapon?.cursed) return null;
    return { ...loadout, weapon: item };
  }
  const armor = loadout.armor ? [...loadout.armor] : [];
  if (item.slot) {
    const idx = armor.findIndex((a) => a.slot === item.slot);
    if (idx >= 0) {
      if (armor[idx].cursed) return null;
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

/**
 * Return the item that would be replaced when `equipItem(old, item)` changes
 * the loadout. Returns `undefined` if the slot was empty, the item is not
 * equipment, or `equipItem` would return the loadout unchanged.
 */
export function getDisplacedItem(
  old: Loadout,
  next: Loadout,
  item: ItemDef
): ItemDef | undefined {
  if (next === old) return undefined;
  if (item.type === "weapon") {
    return next.weapon !== old.weapon ? old.weapon : undefined;
  }
  if (item.slot) {
    const oldPiece = old.armor.find((a) => a.slot === item.slot);
    const newPiece = next.armor.find((a) => a.slot === item.slot);
    return oldPiece !== newPiece ? oldPiece : undefined;
  }
  return undefined;
}

export type PlayerAction =
  | { kind: "attack"; actorId: string; targetInstanceId: string }
  | {
      kind: "cast";
      actorId: string;
      spellId: string;
      targetInstanceId?: string; // enemy instance id for singleEnemy
      targetAllyId?: string; // character id for singleAlly
      targetRow?: Row; // enemy row for groupEnemies fizzle fields
    }
  | {
      kind: "technique";
      actorId: string;
      techniqueId: string;
      targetInstanceId?: string; // enemy instance id for singleEnemy
      targetAllyId?: string; // character id for singleAlly
      targetRow?: Row; // enemy row for rowEnemies
    }
  | { kind: "defend"; actorId: string }
  | {
      kind: "item";
      actorId: string;
      itemId: string;
      targetAllyId?: string;
    }
  | { kind: "flee"; actorId: string }
  | { kind: "hide"; actorId: string }
  | { kind: "ambush"; actorId: string; targetInstanceId: string };

/**
 * Structured combat event emitted alongside log messages. The combat
 * renderer uses these to trigger animations without parsing log strings.
 * Each log() call that produces an animatable event also pushes a
 * CombatEvent. Events are 1:1 with log entries (null if no event).
 */
export type CombatEvent =
  | { type: "attack"; actorId: string; targetId: string; damage: number; range?: WeaponRange; crit?: boolean }
  | { type: "miss"; actorId: string; targetId: string; reason: "evade" | "blind" | "noTarget" }
  | { type: "cast"; actorId: string; spellId: string; targetId: string | null; damage?: number; heal?: number }
  | { type: "spellEffect"; spellId: string; targetId?: string; damage?: number; heal?: number; statusInflicted?: string; statusCured?: string; isBuff?: boolean; isDebuff?: boolean }
  | { type: "defeated"; targetId: string; wasEnemy: boolean }
  | { type: "revived"; targetId: string }
  | { type: "defend"; actorId: string }
  | { type: "statusTick"; targetId: string; damage: number; status: string }
  | { type: "statusEnd"; targetId: string; status: string }
  | { type: "flee"; success: boolean }
  | { type: "silence"; actorId: string; targetId: string }
  | { type: "fizzle"; actorId: string }
  | { type: "hide"; actorId: string }
  | { type: "ambush"; actorId: string; targetId: string; damage: number; crit?: boolean }
  | { type: "spotted"; actorId: string }
  | { type: "technique"; actorId: string; techniqueId: string; targetId: string | null }
  | { type: "techniqueHit"; actorId: string; techniqueId: string; targetId: string; damage: number; crit?: boolean }
  | { type: "techniqueMiss"; actorId: string; techniqueId: string; targetId: string }
  | { type: "techniqueStatus"; actorId: string; techniqueId: string; targetId: string; statusInflicted: string }
  | { type: "techniqueBuff"; actorId: string; techniqueId: string; targetId: string; isBuff?: boolean }
  | null;

/** Internal: target of an enemy melee attack. */
type EnemyAttackTarget = { kind: "party"; id: string } | { kind: "ally"; id: string };

/** Internal: an enemy's resolved intent for the round. */
type EnemyAction =
  | {
      kind: "attack";
      actor: EnemyInstance;
      target: EnemyAttackTarget;
    }
  | { kind: "cast"; actor: EnemyInstance; spellId: string; targetId: string }
  | { kind: "silence"; actor: EnemyInstance }
  | { kind: "doNothing"; actor: EnemyInstance };

/**
 * A temporary ally summoned by BAMORDI / SOCORDI. Simple attack-only
 * combatant that acts before enemies each round and can be targeted
 * in place of party members.
 */
export interface SummonedAlly {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  ac: number;
  agi: number;
  row: Row;
  /** Enemy sprite id for rendering; falls back to procedural orb if absent. */
  spriteId?: string;
}

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
   * Party magic screen strength (from VELUMBRA). Reduces spell/breath damage
   * and deteriorates each round and when hit.
   */
  magicScreen: number;
  /**
   * Enemy fizzle field strength on the party. Causes party spells to fizzle.
   */
  partyFizzleField: number;
  /**
   * Per-enemy-row fizzle fields from BACORTU (row -> strength).
   */
  enemyFizzleFields: Record<Row, number>;
  /**
   * Per-enemy-row magic screens from enemy casters (row -> strength).
   */
  enemyMagicScreens: Record<Row, number>;
  /**
   * Temporary monsters summoned by BAMORDI / SOCORDI. Act before enemies
   * each round and can soak enemy attacks.
   */
  summonedAllies: SummonedAlly[];
  /**
   * Enemies that died this round (removed from front/back arrays by
   * deathCheck). The combat UI reads this to populate the renderer's
   * graveyard so death animations can play after the enemy is gone
   * from the living arrays. Cleared at the start of each round.
   */
  justDied: EnemyInstance[];
  /**
   * Summoned allies that died this round (removed from summonedAllies by
   * allyDeathCheck). The combat UI reads this to play death animations.
   * Cleared at the start of each round.
   */
  justDiedAllies: SummonedAlly[];
  /**
   * Structured events emitted alongside log messages this round. Each
   * entry corresponds 1:1 with a log entry (null if the log message has
   * no associated event). Cleared at the start of each round.
   */
  events: CombatEvent[];
  /**
   * Per-character (party only) perk scratch state, persisted across the
   * whole combat. Reset per combat, not per round.
   */
  perkState: Record<string, Record<string, unknown>>;
  /**
   * Per-character rage (melee technique resource). 0 at combat start,
   * gained by attacking/taking damage, spent on techniques, lost on defend.
   * Only tracked for classes with techniques (Fighter/Thief/Halberdier/Duelist/Crusader).
   */
  rage: Record<string, number>;
  /**
   * Counter-stance flags (char id -> counter multiplier). Set by Brace/Riposte
   * techniques; consumed when the character is next attacked.
   */
  counterStances: Record<string, number>;
  /**
   * Character ids currently taunting (forces enemy melee targeting priority).
   * Cleared when the taunt duration expires.
   */
  tauntingIds: string[];
  /**
   * Taunt armor bonus and remaining duration (char id -> { bonus, duration }).
   */
  tauntBuffs: Record<string, { bonus: number; duration: number }>;
  /**
   * Next-attack bonus from Feint etc. (char id -> { critChance, hitChance, duration }).
   * Consumed on the next attack/technique, or expires after duration rounds.
   */
  nextAttackBonuses: Record<string, { critChance: number; hitChance: number; duration: number }>;
  /**
   * Temporary damage multiplier buffs (char id -> { multiplier, duration }).
   * Applied to all damage dealt by that character. Set by Battle Cry etc.
   */
  damageBuffs: Record<string, { multiplier: number; duration: number }>;
  /**
   * Temporary armor debuffs on enemies (instance id -> { penalty, duration }).
   * Set by Disarm technique; reduces enemy AC for several rounds.
   */
  enemyArmorDebuffs: Record<string, { penalty: number; duration: number }>;
  /**
   * Temporary AGI debuffs on enemies (instance id -> { penalty, duration }).
   * Set by Caltrops (slow); reduces enemy AGI for several rounds.
   */
  enemyAgiDebuffs: Record<string, { penalty: number; duration: number }>;
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
    rage: Object.fromEntries(party.map((c) => [c.id, 0])),
    counterStances: {},
    tauntingIds: [],
    tauntBuffs: {},
    nextAttackBonuses: {},
    damageBuffs: {},
    enemyArmorDebuffs: {},
    enemyAgiDebuffs: {},
  };
}

/** Convert an inventory (id strings or entries) into stack counts. */
export function inventoryToCounts(
  inventory: readonly (string | { itemId: string })[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of inventory) {
    const id = typeof entry === "string" ? entry : entry.itemId;
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
 * Apply post-combat consumption to the real inventory: keep each entry only
 * while the combat's count snapshot still has stock for its item id. This
 * preserves per-instance state (the `identified` flag) that a plain
 * counts→list rebuild would destroy.
 */
export function reconcileInventoryAfterCombat<E extends { itemId: string }>(
  entries: readonly E[],
  counts: Record<string, number>
): E[] {
  const remaining = { ...counts };
  const out: E[] = [];
  for (const e of entries) {
    const left = remaining[e.itemId] ?? 0;
    if (left > 0) {
      out.push(e);
      remaining[e.itemId] = left - 1;
    }
  }
  return out;
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
    const fleer = s.party.find((c) => c.id === fleeAction.actorId);
    let success = false;
    if (fleer) {
      const eff = effStatsFor(s, fleer);
      const mods = perkModifiers(perksForCharacter(fleer), eff);
      success = attemptFlee(s.isBoss, eff.agi, mods.fleeBonusPercent, rng);
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
  tickStatuses(s, log, emit);
  deathCheck(s, emit);
  allyDeathCheck(s, emit);
  if (checkTermination(s, log)) return s;

  // Check for hidden characters being spotted by enemies
  checkSpotHidden(s, rng, log, emit);

  // Magic screens and fizzle fields deteriorate each round.
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

  // Tick technique-related temporary buffs/debuffs.
  tickTechniqueBuffs(s);

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

export interface TurnQueueEntry {
  kind: "player" | "enemy" | "ally";
  /** Character id, enemy instanceId, or summoned ally id. */
  id: string;
  agi: number;
  luk: number;
  roll: number;
}

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
    // EnemyDef has no luk field; default to average for the tie-breaker.
    entries.push({ kind: "enemy", id: e.instanceId, agi: e.agi, luk: 10, roll: rollD20(rng) });
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
    log(`${actor.name} is incapacitated and skips their action.`);
    return s;
  }

  if (action.kind === "flee") {
    const eff = effStatsFor(s, actor);
    const mods = perkModifiers(perksForCharacter(actor), eff);
    const success = attemptFlee(s.isBoss, eff.agi, mods.fleeBonusPercent, rng);
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

  tickStatuses(s, log, emit);
  deathCheck(s, emit);
  allyDeathCheck(s, emit);
  if (checkTermination(s, log)) return s;

  checkSpotHidden(s, rng, log, emit);

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

  s.silencedThisRound = [];

  // Tick technique-related temporary buffs/debuffs.
  tickTechniqueBuffs(s);

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
    return { kind: "doNothing", actor: enemy };
  }

  // Boss / special: flag-driven silence (Section 10.2). Generic — any enemy
  // with a "silenceRandom" special silences a random party member. Emits a
  // structured event so the scene shows the Silence banner + SILENCED popup.
  if (enemy.special.some((sp) => sp.kind === "silenceRandom")) {
    const target = pickRandom(livingParty, rng);
    if (target) {
      s.silencedThisRound.push(target.id);
      emit(`${enemy.name} casts Silence on ${target.name}!`, {
        type: "silence",
        actorId: enemy.instanceId,
        targetId: target.id,
      });
      return { kind: "silence", actor: enemy };
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
    const charAgi = char.stats.agi;
    
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
  if (livingAllies.length > 0) {
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

/** Lose all rage (called on Defend). */
function resetRage(s: CombatState, charId: string): void {
  if (charId in s.rage) s.rage[charId] = 0;
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
      resolveDefend(s, actor, emit);
      resetRage(s, actor.id);
      break;
    case "item":
      resolveItem(s, actor, action, log, emit);
      break;
    case "flee":
      resolveDefend(s, actor, emit);
      resetRage(s, actor.id);
      break;
    case "hide":
      resolveHide(s, actor, emit);
      break;
    case "ambush":
      resolveAmbush(s, actor, action.targetInstanceId, rng, log, emit);
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
  const weaponRange: WeaponRange = weapon?.range ?? "close"; // Default to close range if no weapon

  // Check if attacker can reach the target based on position and weapon range
  if (!canReach(actor.formationSlot, weaponRange, target.row)) {
    if (target.row === "back" && s.enemies.front.some((e) => e.currentHp > 0)) {
      log(
        `${actor.name} cannot reach ${target.name} in the back row with their ${weapon?.name || "weapon"} (front row still up).`
      );
    } else {
      log(
        `${actor.name} cannot reach ${target.name} from position ${actor.formationSlot + 1} with their ${weapon?.name || "weapon"}.`
      );
    }
    return;
  }

  // BeforeAttack hooks (e.g. Ambusher, Shadow, Momentum).
  let damageMultiplier = 1;
  let forcedCrit = false;
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
    isFromHide: actor.status.includes("hidden"),
    round: s.round,
  });

  // Evasive enemies have a dodge chance.
  if (target.special.some((sp) => sp.kind === "evasive")) {
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
  if (target.special.some((sp) => sp.kind === "flying") && weaponRange === "close") {
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

  // Blind: 50% hit rate (Section 7.5).
  if (actor.status.includes("blind")) {
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
  const base = effStats.str + actor.level + weaponBonus;
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

  // Apply reactive multipliers from BeforeAttack hooks before AC reduction.
  damage = Math.max(1, Math.round(damage * damageMultiplier));

  // Critical hit: chance based on effective LUK, capped at 25%.
  let crit = false;
  const critChance = Math.min(0.25, effStats.luk / 100 + mods.critChanceBonus);
  if (forcedCrit || rng() < critChance) {
    damage = Math.max(1, Math.round(damage * mods.critDamageMultiplier));
    crit = true;
    log(`${actor.name} lands a critical hit!`);
  }

  // Enemy AC reduces physical damage (with Disarm debuffs applied).
  damage = Math.max(1, damage - effectiveEnemyAc(s, target));

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

  // OnAttackHit hooks (e.g. Cleave, Warmaster).
  dispatchHook("OnAttackHit", perksForCharacter(actor), {
    state: s.perkState[actor.id],
    rng,
    damage,
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
  if (s.partyFizzleField > 0 && s.partyFizzleField >= actor.level) {
    emit(
      `${actor.name}'s spell fizzles in the enemy's anti-magic field.`,
      { type: "fizzle", actorId: actor.id }
    );
    return;
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

  // OnSpellResolve hooks (e.g. Spell Echo). Guard against echo re-triggering.
  let echoTriggered = false;
  dispatchHook("OnSpellResolve", perksForCharacter(actor), {
    state: pstate,
    rng,
    repeatSpellFree: () => {
      if (echoTriggered) return;
      echoTriggered = true;
      applySpell(s, actor, spell, action, rng, log, emit, 1);
    },
  });
}

function resolveDefend(
  s: CombatState,
  actor: Character,
  emit: (m: string, e: CombatEvent) => void
): void {
  s.defendBuff[actor.id] = 0.5;
  emit(`${actor.name} defends.`, { type: "defend", actorId: actor.id });
}

function resolveHide(
  _s: CombatState,
  actor: Character,
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

  // Critical hit: chance based on effective LUK, capped at 25%.
  let crit = false;
  const critChance = Math.min(0.25, effStats.luk / 100 + mods.critChanceBonus);
  if (rng() < critChance) {
    damage = Math.max(1, Math.round(damage * mods.critDamageMultiplier));
    crit = true;
    log(`${actor.name} lands a critical ambush!`);
  }

  // Enemy AC reduces physical damage (with Disarm debuffs applied).
  const reduced = Math.max(1, damage - effectiveEnemyAc(s, target));
  target.currentHp -= reduced;

  emit(
    `${actor.name} ambushes ${target.name} for ${reduced} damage!`,
    { type: "ambush", actorId: actor.id, targetId: target.instanceId, damage: reduced, crit }
  );
  wakeOnDamage(target, log);
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
      target.hp = Math.max(1, eff.power);
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
      for (const t of spellTargets(s, spell, action)) {
        // "undead" element only damages undead enemies.
        if (eff.element === "undead" && !t.special.some((sp) => sp.kind === "undead")) {
          continue;
        }
        const raw = Math.max(
          1,
          Math.round((eff.power + castingBonus) * powerMultiplier)
        );
        // Enemy AC reduces spell damage too (less than physical — half AC).
        const reduced = Math.max(1, raw - Math.floor(t.ac / 2));
        // Elemental affinity: resist (x0.5) / weak (x1.5) based on the target's special.
        let final = reduced;
        if (eff.element) {
          const affinity = t.special.find(
            (sp) => (sp.kind === "resistElement" || sp.kind === "weakElement") && sp.element === eff.element
          );
          if (affinity) {
            final = Math.max(1, Math.round(reduced * (affinity.kind === "weakElement" ? 1.5 : 0.5)));
          }
        }
        t.currentHp -= final;
        emit(
          `${spell.name} hits ${t.name} for ${final} damage.`,
          { type: "spellEffect", spellId: spell.id, targetId: t.instanceId, damage: final }
        );
        wakeOnDamage(t, log);
      }
      break;
    }
    case "heal": {
      const healPower = Math.max(
        1,
        Math.round((eff.power + castingBonus) * powerMultiplier)
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
      const ally: SummonedAlly = {
        id: `summon-${s.round}-${s.summonedAllies.length}`,
        name: eff.allyName ?? "Summoned Ally",
        hp: power * 6,
        maxHp: power * 6,
        attack: power * 3,
        ac: Math.max(1, Math.floor(power / 2)),
        agi: 50,
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
    return;
  }

  const base = actor.attack;
  const variance = 0.8 + rng() * 0.4;
  let damage = Math.max(1, Math.round(base * variance));
  damage = damageReductionFor(s, partyTarget, damage);

  const result = applyPartyDamage(s, partyTarget, damage, actor, rng, emit);
  emit(
    `${actor.name} hits ${partyTarget.name} for ${result.finalDamage} damage.`,
    { type: "attack", actorId: actor.instanceId, targetId: partyTarget.id, damage: result.finalDamage }
  );
  if (result.redirectTarget && result.redirectDamage > 0) {
    log(`${result.redirectDamage} damage is redirected to ${result.redirectTarget.name}!`);
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

  // Poison on hit (Cobweb, Acid Puddle).
  if (actor.special.some((sp) => sp.kind === "poisonOnHit")) {
    if (!partyTarget.status.includes("poison")) {
      partyTarget.status.push("poison");
      log(`${partyTarget.name} is poisoned!`);
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
  const tauntBuff = s.tauntBuffs[target.id]?.bonus ?? 0;
  const flatReduction = armorBonus + spellBuff + tauntBuff;
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

function attemptFlee(
  isBoss: boolean,
  effAgi: number,
  fleeBonusPercent: number,
  rng: Rng
): boolean {
  if (isBoss) return false; // 0% vs boss (Section 7.2)
  const chance =
    0.95 + Math.min((effAgi - 10) * 0.02, 0.1) + fleeBonusPercent;
  return rng() < chance;
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
      c.hp = Math.max(0, c.hp - 2);
      tick(`${c.name} suffers 2 poison damage.`, c.id, 2);
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
      tick(`${e.name} suffers 2 poison damage.`, e.instanceId, 2);
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
  };
}

// Re-export helpers the combat UI needs
export { charRow };
export type { Stats, SpellEffect, SpellTarget, EnemySpecial, TechniqueDef, TechniqueEffect, TechniqueTarget };

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
}

// ---------------------------------------------------------------------------
// Technique resolution
// ---------------------------------------------------------------------------

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
    const weaponRange: WeaponRange = loadout?.weapon?.range ?? "close";
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

  // Shadow Strike: auto-crit from hidden, 2x crit multiplier, ignores all AC.
  const isShadowStrike = tech.id === "thief-shadow-strike";
  const isPerfectStrike = tech.id === "duelist-perfect-strike";
  const forceCrit = isShadowStrike || isPerfectStrike || (actor.status.includes("hidden") && isShadowStrike);

  // Calculate base damage (same formula as resolveAttack).
  const effStats = effStatsFor(s, actor);
  const mods = perkModifiers(perksForCharacter(actor), effStats);
  const loadout = s.loadout[actor.id];
  const weapon = loadout?.weapon;
  const weaponBonus = weapon?.attackBonus ?? 0;
  const base = effStats.str + actor.level + weaponBonus;
  const isThief = actor.class === "Thief";
  const weaponRange = weapon?.range ?? "close";
  const rowMultiplier = charRow(actor) === "back" && weaponRange === "close" && !isThief && !ignoresRange ? 0.4 : 1;
  const variance = 0.8 + rng() * 0.4;
  let damage = Math.max(1, Math.round(base * rowMultiplier * variance * mods.meleeDamageMultiplier)) + mods.meleeBonusDamage;

  // Apply technique multiplier
  damage = Math.max(1, Math.round(damage * multiplier));

  // Damage buff (Battle Cry)
  const dmgBuff = s.damageBuffs[actor.id];
  if (dmgBuff) {
    damage = Math.max(1, Math.round(damage * dmgBuff.multiplier));
  }

  // Critical hit
  let crit = false;
  const critChance = Math.min(0.25, effStats.luk / 100 + mods.critChanceBonus + extraCrit);
  if (forceCrit || rng() < critChance) {
    const critMult = isShadowStrike ? mods.critDamageMultiplier * 2 : isPerfectStrike ? 2.5 : mods.critDamageMultiplier;
    damage = Math.max(1, Math.round(damage * critMult));
    crit = true;
    log(`${actor.name} lands a critical hit with ${tech.name}!`);
  }

  // Enemy AC reduction (with armor pen and debuffs)
  const effectiveAc = effectiveEnemyAc(s, target);
  const acReduction = armorPen !== undefined ? Math.round(effectiveAc * (1 - armorPen)) : effectiveAc;
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
