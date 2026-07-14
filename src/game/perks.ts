/**
 * Class perk system — design doc §5-§10.
 *
 * Perks are chosen at levels 3/6/9/12 (tiers 1-4), two mutually exclusive
 * options per tier, stored as `character.perkIds`. Most perks are simple
 * numeric passives aggregated by `perkModifiers()` and read directly by
 * combat formulas (damage multipliers, crit/evasion bonuses, SP cost, flat
 * stat bonuses) — this keeps the majority of the 56 perks fully data-driven
 * with no combat-internals changes needed to add more later.
 *
 * A smaller set of perks need reactive, stateful behavior (once-per-combat
 * triggers, counters, escalating stacks). Those subscribe to `CombatHook`s
 * and are dispatched via `dispatchHook()`, which the combat resolver calls
 * at fixed points. Per-character/per-combat scratch state for these lives in
 * `CombatState.perkState` (character id -> arbitrary bag), reset each combat.
 *
 * v1.0 — Playtest Values: only the perks registered below have reactive
 * hook behavior (plus a few wired directly in combat.ts: fighter-protector,
 * thief-backstab, thief-assassin, duelist-riposte, priest-saint); the rest
 * are numeric passives via `perkModifiers()` or, where neither applies,
 * documented no-op stubs (`// TODO(v1.1)`) flagged in their UI description.
 */

import type { Character, CharacterClass, Stats } from "./party";
import { ALL_PERKS } from "../data/perks";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CombatHook =
  | "OnCombatStart"
  | "OnCombatEnd"
  | "OnTurnStart"
  | "OnTurnEnd"
  | "BeforeAttack"
  | "AfterAttack"
  | "OnAttackHit"
  | "OnAttackMiss"
  | "OnCriticalHit"
  | "OnKill"
  | "BeforeDamageTaken"
  | "AfterDamageTaken"
  | "OnAllyWouldDie"
  | "OnSpellCast"
  | "OnSpellResolve"
  | "OnHide"
  | "OnDefend"
  | "OnRevive"
  | "OnHeal"
  | "OnStatusApplied"
  | "OnStatusRemoved";

/**
 * Structured effect parameters. Most fields are simple numeric knobs read
 * generically by `perkModifiers()`; the reactive perks additionally carry
 * hook-specific fields their handler reads directly. Untyped fields are
 * intentional — different perks use different subsets (design doc §8.2).
 */
export interface PerkEffect {
  /** Permanent additive stat bonus applied via effectiveStats(). */
  statModifiers?: Partial<Stats>;
  /** One-time % bump to maxHp applied when the perk is selected. */
  maxHpPercent?: number;
  /** One-time % bump to maxSp applied when the perk is selected. */
  maxSpPercent?: number;
  /** Extra fraction added to HP growth on every level-up after selection. */
  hpGrowthBonusPercent?: number;
  /** Extra fraction added to SP growth on every level-up after selection. */
  spGrowthBonusPercent?: number;
  /** Multiplies melee physical damage dealt (>1 buffs, <1 nerfs). */
  meleeDamageMultiplier?: number;
  /** Multiplies damage-spell power dealt (>1 buffs, <1 nerfs). */
  spellDamageMultiplier?: number;
  /** Multiplies physical damage taken (>1 = more damage taken, <1 = less). */
  damageTakenMultiplier?: number;
  /** Restricts damageTakenMultiplier to when the character is in the front row. */
  damageTakenFrontRowOnly?: boolean;
  /** Flat additive bonus to crit chance (0-1 scale). */
  critChanceBonus?: number;
  /** Multiplies crit damage (default 2x in combat.ts). */
  critDamageMultiplier?: number;
  /** Flat additive bonus to physical evasion (0-1 scale). */
  evasionBonusPercent?: number;
  /** Flat additive bonus to flee success chance (0-1 scale). */
  fleeBonusPercent?: number;
  /** Multiplies a spell's SP cost. */
  spCostMultiplier?: number;
  /** Restricts spCostMultiplier to spells of this effect kind ("heal" | "damage"); omitted = all spells. */
  spCostAppliesTo?: "heal" | "damage";
  /** Adds this stat (read from effective stats) as flat melee bonus damage. */
  meleeBonusDamageStat?: "pie";
  /** Bonus disarm/avoid chance added to the trap-check formula. */
  trapDisarmBonusPercent?: number;
  /** Multiplies damage taken from a trap that fires. */
  trapDamageMultiplier?: number;
  /** Shop price multiplier for this character's party (Swindler). */
  shopDiscountPercent?: number;
  [key: string]: unknown;
}

export interface PerkDef {
  id: string;
  class: CharacterClass;
  tier: 1 | 2 | 3 | 4;
  level: number;
  name: string;
  description: string;
  triggers: CombatHook[];
  effect: PerkEffect;
  tags: string[];
  oncePerCombat: boolean;
  priority: "normal" | "high";
}

/** One queued perk choice produced when a character levels past a tier threshold. */
export interface PendingPerkChoice {
  charId: string;
  tier: 1 | 2 | 3 | 4;
}

/** Levels at which a perk choice is offered, indexed by tier. */
export const PERK_TIER_LEVELS: Record<1 | 2 | 3 | 4, number> = {
  1: 3,
  2: 6,
  3: 9,
  4: 12,
};

export { ALL_PERKS } from "../data/perks";

export const PERKS_BY_ID: Record<string, PerkDef> = Object.fromEntries(
  ALL_PERKS.map((p) => [p.id, p])
);

/** Resolve a character's chosen perks to their full definitions. */
export function perksForCharacter(character: Pick<Character, "perkIds">): PerkDef[] {
  return character.perkIds
    .map((id) => PERKS_BY_ID[id])
    .filter((p): p is PerkDef => p !== undefined);
}

/** The two perk options offered for a class at a given tier. */
export function perkChoicesFor(cls: CharacterClass, tier: 1 | 2 | 3 | 4): PerkDef[] {
  return ALL_PERKS.filter((p) => p.class === cls && p.tier === tier);
}

/** True if `level` is one of the four tier thresholds (3/6/9/12). */
export function isPerkTierLevel(level: number): level is 3 | 6 | 9 | 12 {
  return level === 3 || level === 6 || level === 9 || level === 12;
}

/** Map a level (3/6/9/12) to its perk tier (1-4); null for any other level. */
export function tierForLevel(level: number): 1 | 2 | 3 | 4 | null {
  if (level === 3) return 1;
  if (level === 6) return 2;
  if (level === 9) return 3;
  if (level === 12) return 4;
  return null;
}

/**
 * Apply the one-time selection-time effects of a chosen perk (maxHp/maxSp %
 * bumps) to a character, and record the perk id. Full-heals to the new max
 * since this always runs immediately after a level-up's full restore.
 * Pure: returns a new Character.
 */
export function applyPerkSelection(character: Character, perkId: string): Character {
  const perk = PERKS_BY_ID[perkId];
  if (!perk) return character;

  let maxHp = character.maxHp;
  let maxSp = character.maxSp;
  if (perk.effect.maxHpPercent) {
    maxHp = Math.round(maxHp * (1 + perk.effect.maxHpPercent));
  }
  if (perk.effect.maxSpPercent) {
    maxSp = Math.round(maxSp * (1 + perk.effect.maxSpPercent));
  }

  return {
    ...character,
    maxHp,
    maxSp,
    hp: maxHp,
    sp: maxSp,
    perkIds: [...character.perkIds, perkId],
  };
}

// ---------------------------------------------------------------------------
// Generic passive modifier aggregation
// ---------------------------------------------------------------------------

export interface PerkModifiers {
  meleeDamageMultiplier: number;
  spellDamageMultiplier: number;
  /** Physical damage-taken multiplier that always applies. */
  damageTakenMultiplier: number;
  /** Physical damage-taken multiplier that applies only in the front row. */
  damageTakenMultiplierFrontRow: number;
  critChanceBonus: number;
  critDamageMultiplier: number;
  evasionBonusPercent: number;
  fleeBonusPercent: number;
  meleeBonusDamage: number;
  trapDisarmBonusPercent: number;
  trapDamageMultiplier: number;
  shopDiscountPercent: number;
  hpGrowthBonusPercent: number;
  spGrowthBonusPercent: number;
  spCostMultiplierFor: (spellKind: "heal" | "damage" | "other") => number;
}

/**
 * Fold every chosen perk's numeric fields into one struct combat/features/
 * town code can read without knowing which specific perk contributed it.
 * `effStats` (from effectiveStats()) is needed for meleeBonusDamageStat.
 */
export function perkModifiers(perks: PerkDef[], effStats: Stats): PerkModifiers {
  const out: PerkModifiers = {
    meleeDamageMultiplier: 1,
    spellDamageMultiplier: 1,
    damageTakenMultiplier: 1,
    damageTakenMultiplierFrontRow: 1,
    critChanceBonus: 0,
    critDamageMultiplier: 2,
    evasionBonusPercent: 0,
    fleeBonusPercent: 0,
    meleeBonusDamage: 0,
    trapDisarmBonusPercent: 0,
    trapDamageMultiplier: 1,
    shopDiscountPercent: 0,
    hpGrowthBonusPercent: 0,
    spGrowthBonusPercent: 0,
    spCostMultiplierFor: () => 1,
  };

  const spCostRules: { mult: number; appliesTo?: "heal" | "damage" }[] = [];

  for (const perk of perks) {
    const eff = perk.effect;
    if (eff.meleeDamageMultiplier) out.meleeDamageMultiplier *= eff.meleeDamageMultiplier;
    if (eff.spellDamageMultiplier) out.spellDamageMultiplier *= eff.spellDamageMultiplier;
    if (eff.damageTakenMultiplier) {
      if (eff.damageTakenFrontRowOnly) {
        out.damageTakenMultiplierFrontRow *= eff.damageTakenMultiplier;
      } else {
        out.damageTakenMultiplier *= eff.damageTakenMultiplier;
      }
    }
    if (eff.critChanceBonus) out.critChanceBonus += eff.critChanceBonus;
    if (eff.critDamageMultiplier) out.critDamageMultiplier = Math.max(out.critDamageMultiplier, eff.critDamageMultiplier);
    if (eff.evasionBonusPercent) out.evasionBonusPercent += eff.evasionBonusPercent;
    if (eff.fleeBonusPercent) out.fleeBonusPercent += eff.fleeBonusPercent;
    if (eff.meleeBonusDamageStat === "pie") out.meleeBonusDamage += effStats.pie;
    if (eff.trapDisarmBonusPercent) out.trapDisarmBonusPercent += eff.trapDisarmBonusPercent;
    if (eff.trapDamageMultiplier) out.trapDamageMultiplier *= eff.trapDamageMultiplier;
    if (eff.shopDiscountPercent) out.shopDiscountPercent += eff.shopDiscountPercent;
    if (eff.hpGrowthBonusPercent) out.hpGrowthBonusPercent += eff.hpGrowthBonusPercent;
    if (eff.spGrowthBonusPercent) out.spGrowthBonusPercent += eff.spGrowthBonusPercent;
    if (eff.spCostMultiplier) spCostRules.push({ mult: eff.spCostMultiplier, appliesTo: eff.spCostAppliesTo });
  }

  if (spCostRules.length > 0) {
    out.spCostMultiplierFor = (spellKind) => {
      let mult = 1;
      for (const rule of spCostRules) {
        if (!rule.appliesTo || rule.appliesTo === spellKind) mult *= rule.mult;
      }
      return mult;
    };
  }

  return out;
}

// ---------------------------------------------------------------------------
// Reactive hook dispatcher
// ---------------------------------------------------------------------------
// The 14 fully-implemented perks below need per-combat scratch state and/or
// to run at a specific moment the generic aggregator can't express (e.g.
// "once per combat", "every Nth cast", "counterattack the attacker").
// `PerkHookContext` carries the minimum each handler needs; combat.ts builds
// one at each call site and only passes hooks that perk actually triggers on.

export interface PerkHookContext {
  /** Combat-internal scratch bag for this character, persisted across the combat. */
  state: Record<string, unknown>;
  /** Convenience RNG so handlers can roll chances without importing combat.ts internals. */
  rng: () => number;
  [key: string]: unknown;
}

export type PerkHandler = (ctx: PerkHookContext) => void;

/** Handler registry: perk id -> hook -> handler. Populated below. */
const HANDLERS: Record<string, Partial<Record<CombatHook, PerkHandler>>> = {};

function register(id: string, hook: CombatHook, handler: PerkHandler): void {
  (HANDLERS[id] ??= {})[hook] = handler;
}

/**
 * Run every registered handler for `perks` that listens to `hook`, in
 * priority order (high before normal). Handlers mutate `ctx` in place;
 * callers read back whatever fields they care about afterward.
 */
export function dispatchHook(
  hook: CombatHook,
  perks: PerkDef[],
  ctx: PerkHookContext
): void {
  const active = perks
    .filter((p) => p.triggers.includes(hook) && HANDLERS[p.id]?.[hook])
    .sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "high" ? -1 : 1));
  for (const perk of active) {
    HANDLERS[perk.id]![hook]!(ctx);
  }
}

/** Fresh per-combat scratch state for one character. Combat.ts seeds this at combat start. */
export function freshPerkState(): Record<string, unknown> {
  return {};
}

// --- Fighter --------------------------------------------------------------

// fighter-cleave: 25% chance melee attacks also damage an adjacent front-row
// enemy. ctx carries: damage (the hit that just landed), dealCleaveDamage(fn).
register("fighter-cleave", "OnAttackHit", (ctx) => {
  const chance = 0.25;
  const dealCleave = ctx.dealCleaveDamage as ((dmg: number) => void) | undefined;
  const damage = ctx.damage as number | undefined;
  if (dealCleave && damage !== undefined && ctx.rng() < chance) {
    dealCleave(damage);
  }
});

// fighter-protector: allies directly behind this character can't be single-
// targeted by melee while the protector lives. The effect is implemented
// directly in combat.ts's target-pick step (no hook dispatch) because it must
// exclude protected slots from the targetable set before a target is chosen.

// fighter-last-stand: first time this character drops below 20% HP each
// combat, counterattack every adjacent (living) enemy for a plain hit.
register("fighter-last-stand", "AfterDamageTaken", (ctx) => {
  const state = ctx.state as { usedLastStand?: boolean };
  if (state.usedLastStand) return;
  const hpPct = ctx.hpPercentAfter as number | undefined;
  if (hpPct === undefined || hpPct >= 0.2 || hpPct <= 0) return;
  const counterAll = ctx.counterAllEnemies as (() => void) | undefined;
  if (counterAll) {
    state.usedLastStand = true;
    counterAll();
  }
});

// fighter-warmaster: melee attacks have a 35% chance to also hit every other
// front-row enemy at full damage.
register("fighter-warmaster", "OnAttackHit", (ctx) => {
  const chance = 0.35;
  const hitAllFrontRow = ctx.hitAllFrontRow as ((dmg: number) => void) | undefined;
  const damage = ctx.damage as number | undefined;
  if (hitAllFrontRow && damage !== undefined && ctx.rng() < chance) {
    hitAllFrontRow(damage);
  }
});

// --- Mage -------------------------------------------------------------------

// mage-spell-echo: every third spell cast this combat repeats for free on
// the same target.
register("mage-spell-echo", "OnSpellResolve", (ctx) => {
  const state = ctx.state as { spellCount?: number };
  state.spellCount = (state.spellCount ?? 0) + 1;
  if (state.spellCount % 3 === 0) {
    const repeat = ctx.repeatSpellFree as (() => void) | undefined;
    if (repeat) repeat();
  }
});

// mage-arcane-surge: after spending 50 SP in one combat, the next spell is
// free and deals +50% damage (one-time this combat).
register("mage-arcane-surge", "OnSpellCast", (ctx) => {
  const state = ctx.state as { spSpent?: number; surgeReady?: boolean; surgeUsed?: boolean };
  const spCost = ctx.spCost as number | undefined;
  if (state.surgeUsed) return;
  state.spSpent = (state.spSpent ?? 0) + (spCost ?? 0);
  if (!state.surgeReady && state.spSpent >= 50) {
    state.surgeReady = true;
  }
});

// mage-archmage: the first 3 spells each combat are free.
register("mage-archmage", "OnSpellCast", (ctx) => {
  const state = ctx.state as { freeSpellsUsed?: number };
  const used = state.freeSpellsUsed ?? 0;
  if (used < 3) {
    state.freeSpellsUsed = used + 1;
    const makeFree = ctx.makeSpellFree as (() => void) | undefined;
    if (makeFree) makeFree();
  }
});

// --- Priest -----------------------------------------------------------------

// priest-guardian-angel: the first ally (not self) who would die each combat
// survives at 1 HP instead.
register("priest-guardian-angel", "OnAllyWouldDie", (ctx) => {
  const state = ctx.state as { triggered?: boolean };
  if (state.triggered) return;
  const targetId = ctx.targetId as string | undefined;
  const ownId = ctx.ownId as string | undefined;
  if (targetId === undefined || ownId === undefined || targetId === ownId) return;
  const preventDeath = ctx.preventDeath as (() => void) | undefined;
  if (preventDeath) {
    state.triggered = true;
    preventDeath();
  }
});

// priest-martyr: half of all damage adjacent front-row allies take is
// redirected to the Priest instead.
register("priest-martyr", "BeforeDamageTaken", (ctx) => {
  const isAdjacentFrontAlly = ctx.isAdjacentFrontAlly as boolean | undefined;
  if (!isAdjacentFrontAlly) return;
  const redirect = ctx.redirectHalfDamage as (() => void) | undefined;
  if (redirect) redirect();
});

// --- Thief --------------------------------------------------------------

// thief-ambusher: the first attack each combat is always a critical hit.
register("thief-ambusher", "BeforeAttack", (ctx) => {
  const state = ctx.state as { used?: boolean };
  if (state.used) return;
  const forceCrit = ctx.forceCrit as (() => void) | undefined;
  if (forceCrit) {
    state.used = true;
    forceCrit();
  }
});

// thief-shadow: permanently hidden at combat start; the first attack each
// round made from Hide auto-crits.
register("thief-shadow", "OnCombatStart", (ctx) => {
  const grantHidden = ctx.grantHidden as (() => void) | undefined;
  if (grantHidden) grantHidden();
});
register("thief-shadow", "BeforeAttack", (ctx) => {
  const isFromHide = ctx.isFromHide as boolean | undefined;
  const state = ctx.state as { critUsedThisRound?: number };
  const round = ctx.round as number | undefined;
  if (!isFromHide || round === undefined) return;
  if (state.critUsedThisRound === round) return;
  const forceCrit = ctx.forceCrit as (() => void) | undefined;
  if (forceCrit) {
    state.critUsedThisRound = round;
    forceCrit();
  }
});

// --- Halberdier ---------------------------------------------------------

// halberdier-impale: 25% chance melee attacks also hit a second front-row
// enemy at full damage (same shape as fighter-cleave — the attack sites
// already provide the dealCleaveDamage callback).
register("halberdier-impale", "OnAttackHit", (ctx) => {
  const chance = 0.25;
  const dealCleave = ctx.dealCleaveDamage as ((dmg: number) => void) | undefined;
  const damage = ctx.damage as number | undefined;
  if (dealCleave && damage !== undefined && ctx.rng() < chance) {
    dealCleave(damage);
  }
});

// halberdier-hold-the-line: when an ally directly behind this character is
// attacked, counterattack the attacker for 50% damage.
register("halberdier-hold-the-line", "AfterDamageTaken", (ctx) => {
  const isAllyBehind = ctx.isAllyBehind as boolean | undefined;
  if (!isAllyBehind) return;
  const counter = ctx.counterAttacker as ((multiplier: number) => void) | undefined;
  if (counter) counter(0.5);
});

// --- Duelist --------------------------------------------------------------

// duelist-momentum: each consecutive hit on the same target grants +5%
// damage, resetting on a miss or target switch.
register("duelist-momentum", "BeforeAttack", (ctx) => {
  const state = ctx.state as { targetId?: string; stacks?: number };
  const targetId = ctx.targetId as string | undefined;
  if (targetId && state.targetId === targetId) {
    state.stacks = (state.stacks ?? 0) + 1;
  } else {
    state.targetId = targetId;
    state.stacks = 0;
  }
  const applyBonus = ctx.applyDamageMultiplier as ((mult: number) => void) | undefined;
  if (applyBonus) applyBonus(1 + (state.stacks ?? 0) * 0.05);
});
register("duelist-momentum", "OnAttackMiss", (ctx) => {
  const state = ctx.state as { targetId?: string; stacks?: number };
  state.stacks = 0;
  state.targetId = undefined;
});

// --- Crusader -----------------------------------------------------------

// crusader-retribution: when an adjacent ally is hit by an enemy attack, the
// attacker takes the Crusader's effective PIE as holy damage. The damage
// callback is provided by applyPartyDamage in combat.ts.
register("crusader-retribution", "AfterDamageTaken", (ctx) => {
  const isAdjacentAlly = ctx.isAdjacentAlly as boolean | undefined;
  if (!isAdjacentAlly) return;
  const retaliate = ctx.retaliateHolyDamage as (() => void) | undefined;
  if (retaliate) retaliate();
});

// crusader-paladin: once per combat, survive a lethal blow at 1 HP. The
// party-wide 10% damage reduction is still TODO(v1.1) — damageTakenMultiplier
// only applies to the perk holder, not the whole party.
register("crusader-paladin", "OnAllyWouldDie", (ctx) => {
  const state = ctx.state as { used?: boolean };
  if (state.used) return;
  const targetId = ctx.targetId as string | undefined;
  const ownId = ctx.ownId as string | undefined;
  if (targetId === undefined || ownId === undefined || targetId !== ownId) return;
  const preventDeath = ctx.preventDeath as (() => void) | undefined;
  if (preventDeath) {
    state.used = true;
    preventDeath();
  }
});
