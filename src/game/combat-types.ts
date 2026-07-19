/**
 * Combat domain types — pure type declarations shared by the combat engine,
 * the combat UI, the renderer, and save/state types.
 *
 * Leaf module: no runtime code besides type re-exports, and no imports from
 * engine/ or types/ — importing those here would create cycles (CombatState
 * is embedded in GameState; CombatEvent is consumed by five engine files).
 */

import type { Character, Stats, StatusEffect } from "./party";
import type { EnemyDef, EnemySpecial, Row } from "../data/enemies";
import type { SpellDef, SpellEffect, SpellTarget, DamageElement } from "../data/spells";
import type { ItemDef } from "../data/items";
import type { TechniqueDef, TechniqueEffect, TechniqueTarget } from "../data/techniques";

// Re-export types that the combat UI / main.ts needs
export type { Character, EnemyDef, SpellDef, ItemDef, Row, StatusEffect };

// Re-export helpers the combat UI needs
export type { Stats, SpellEffect, SpellTarget, EnemySpecial, TechniqueDef, TechniqueEffect, TechniqueTarget };

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
 * Pre-roll forecast for Attack (and Ambush UI). Conservative: no crits, no
 * reactive BeforeAttack hooks — so `guaranteedKill` never overclaims.
 */
export interface ActionPreview {
  hitChance: number;
  minDamage: number;
  maxDamage: number;
  guaranteedKill: boolean;
  unreachable?: boolean;
  noEffect?: boolean;
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
  /** Per-ability cooldown tracker: ability id → rounds remaining. */
  abilityCooldowns?: Record<string, number>;
  /** Whether this enemy has acted at least once this combat. */
  hasActed?: boolean;
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
  | { kind: "ambush"; actorId: string; targetInstanceId: string }
  | { kind: "analyze"; actorId: string; targetInstanceId: string }
  | { kind: "move"; actorId: string; targetAllyId?: string };

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
  | { type: "incapacitated"; actorId: string; reason: "sleep" | "paralysis" }
  | { type: "technique"; actorId: string; techniqueId: string; targetId: string | null }
  | { type: "techniqueHit"; actorId: string; techniqueId: string; targetId: string; damage: number; crit?: boolean }
  | { type: "techniqueMiss"; actorId: string; techniqueId: string; targetId: string }
  | { type: "techniqueStatus"; actorId: string; techniqueId: string; targetId: string; statusInflicted: string }
  | { type: "techniqueBuff"; actorId: string; techniqueId: string; targetId: string; isBuff?: boolean }
  | { type: "telegraph"; actorId: string; abilityId: string }
  | { type: "telegraphBreak"; actorId: string; abilityId: string }
  | { type: "affinityDiscovered"; targetId: string; element: string; kind: "weak" | "resist" }
  | { type: "analyze"; actorId: string; targetId: string }
  | { type: "phaseChange"; actorId: string; phase: number; name: string }
  | null;

/** Internal: target of an enemy melee attack. */
export type EnemyAttackTarget = { kind: "party"; id: string } | { kind: "ally"; id: string };

/** Internal: an enemy's resolved intent for the round. */
export type EnemyAction =
  | {
      kind: "attack";
      actor: EnemyInstance;
      target: EnemyAttackTarget;
    }
  | { kind: "cast"; actor: EnemyInstance; spellId: string; targetId: string }
  | { kind: "ability"; actor: EnemyInstance; abilityId: string; targetId: string }
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
   * Per-character rage (melee technique resource). Technique classes start at
   * half their max (floor), casters at 0; gained by attacking/taking damage,
   * spent on techniques. Defend no longer clears it.
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
  /**
   * Temporary attack debuffs on party members (char id -> penalty/duration).
   * Set by enemy Curse and similar abilities.
   */
  attackDebuffs: Record<string, { penalty: number; duration: number }>;
  /** Sleep countdown for party members and enemies (actor id -> rounds left). */
  sleepTimers: Record<string, number>;
  /** Blind countdown for party members (char id -> rounds left). */
  blindTimers: Record<string, number>;
  /**
   * Poison state per actor (char id or enemy instance id -> damage/round and
   * rounds left). Poison ticks its recorded damage at end of round and the
   * status is removed when the duration runs out. Poison Blade poisons at
   * 3/round; enemy poisonOnHit at 2/round (both 3 rounds).
   */
  poisonState: Record<string, { damage: number; duration: number }>;
  /**
   * Wind-up telegraphs: enemy instance id -> the big ability it is charging.
   * Set when the AI picks a windUp-flagged ability; fires on the enemy's next
   * turn; cleared if the enemy is incapacitated (disable = interrupt) or dies.
   */
  windUps: Record<string, { abilityId: string; name: string; targetId: string | null }>;
  /**
   * Species-level elemental affinity the party has discovered this combat
   * (enemy name -> discovered elements). First proc of a (name, element,
   * kind) triple logs + emits affinityDiscovered; the enemy window renders
   * WK/RES tags from it. Combat-scoped, never persisted.
   */
  observedAffinity: Record<string, { weak: string[]; resist: string[] }>;
  /** Species the party has Analyzed this combat (enemy name -> true). Gates trait tags. */
  analyzedEnemies: Record<string, true>;
  /**
   * Current phase per boss instance (1-based; missing = phase 1). Advanced by
   * checkBossPhases when the boss's HP% crosses a phaseThresholds entry.
   */
  bossPhases: Record<string, number>;
  /**
   * Successful disable lands per enemy instance (Web/Sleep/Hold stacking).
   * Fourth+ land is resisted until combat ends.
   */
  disableStacks: Record<string, number>;
  /**
   * Active damage-over-time effects on enemies (instance id -> list), from
   * spell followups (e.g. Meteor Swarm burn). Ticked in end-of-round status
   * processing; entries expire when duration reaches 0.
   */
  enemyDots: Record<
    string,
    { element: DamageElement; power: number; duration: number; spellId: string }[]
  >;
  /**
   * Active regen buffs on party members (char id -> entry), from spell
   * followups (e.g. Mass Regenerate). Ticked in end-of-round status
   * processing; recasting refreshes the entry.
   */
  regenBuffs: Record<string, { power: number; duration: number; spellId: string }>;
  /**
   * Monotonic counter for unique summoned-ally / enemy-summon instance ids
   * for the whole combat. Prevents id collisions from length/round-based
   * naming when multiple summons land in the same round or the roster
   * shrinks between summons (deaths reduce enemies.front/back length).
   */
  summonCounter: number;
  /**
   * Damage-taken reduction buffs with duration (char id -> entry), set by
   * crusader-holy-shield's OnDefend hook (+20% defense for 2 rounds on top
   * of the base Defend reduction). Applied as an extra multiplier in
   * damageReductionFor; ticked down in tickTechniqueBuffs like the other
   * duration-based buff maps.
   */
  holyShieldBuffs: Record<string, { multiplier: number; duration: number }>;
}

export type Rng = () => number;

export interface TurnQueueEntry {
  kind: "player" | "enemy" | "ally";
  /** Character id, enemy instanceId, or summoned ally id. */
  id: string;
  agi: number;
  luk: number;
  roll: number;
}
