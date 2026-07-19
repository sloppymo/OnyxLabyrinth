/**
 * Cross-cluster combat helpers shared by the resolution modules
 * (actions, spells, techniques, ai, enemy, eor). Everything here operates on
 * an already-cloned CombatState — public entry points clone, internal helpers
 * mutate the clone; this module keeps that convention, it does not own state.
 */

import type { Character, Stats, StatusEffect } from "./party";
import { charRow } from "./party";
import { effectiveStats } from "./effective-stats";
import { dispatchHook, perkModifiers, perksForCharacter, type PerkModifiers } from "./perks";
import type { SpellDef } from "../data/spells";
import type { EnemyAbilityDef } from "../data/enemy-abilities";
import type { CombatEvent, CombatState, EnemyInstance, Rng } from "./combat-types";

/** Enemy ability/heal powers were not part of the 2026-07 stat pass — scale at resolve time. */
export const ENEMY_ABILITY_POWER_SCALE = 1.6;
/** Summoned allies draw melee fire often, but no longer soak 100% of enemy attacks. */
export const SUMMON_MELEE_SOAK_CHANCE = 0.55;

/** Effective stats for a combatant, reading their loadout and chosen perks. */
export function effStatsFor(s: CombatState, c: Character): Stats {
  return effectiveStats(c, s.loadout[c.id], perksForCharacter(c));
}

/**
 * Perk damage multiplier against tagged enemies (Turn Undead, Judge,
 * Inquisitor). Reads the target's `special` tags; 1 when no tag matches.
 */
export function tagDamageMultiplier(mods: PerkModifiers, target: EnemyInstance): number {
  let mult = 1;
  if (mods.undeadDamageMultiplier !== 1 && target.special.some((sp) => sp.kind === "undead")) {
    mult *= mods.undeadDamageMultiplier;
  }
  if (mods.demonDamageMultiplier !== 1 && target.special.some((sp) => sp.kind === "demon")) {
    mult *= mods.demonDamageMultiplier;
  }
  return mult;
}

/** Effective AC of an enemy, accounting for armor debuffs (Disarm). */
export function effectiveEnemyAc(s: CombatState, enemy: EnemyInstance): number {
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
export function observeAffinity(
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
export function damageReductionFor(
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

export function findEnemy(s: CombatState, instanceId: string): EnemyInstance | undefined {
  return (
    s.enemies.front.find((e) => e.instanceId === instanceId) ??
    s.enemies.back.find((e) => e.instanceId === instanceId)
  );
}

/** Scale static ability power values to match the post-2026 enemy stat pass. */
export function scaledAbilityPower(power: number): number {
  return Math.max(1, Math.round(power * ENEMY_ABILITY_POWER_SCALE));
}

/** True for enemy abilities that should respect party magic screen / fizzle fields. */
export function isArcaneEnemyAbility(ability: EnemyAbilityDef): boolean {
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
export function critChanceFromLukAndBonuses(
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
export function applyDisableToEnemy(
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

export function addStatus(target: { status: StatusEffect[] }, st: StatusEffect): void {
  if (!target.status.includes(st)) target.status.push(st);
}

/** fighter-juggernaut: immune to enemy-inflicted status effects. */
export function isStatusImmune(s: CombatState, c: Character): boolean {
  return perkModifiers(perksForCharacter(c), effStatsFor(s, c)).statusImmune;
}

/** Physical damage wakes a sleeping target (Section 7.5). */
export function wakeOnDamage(
  target: { status: StatusEffect[]; name: string },
  log: (m: string) => void
): void {
  if (target.status.includes("sleep")) {
    target.status = target.status.filter((st) => st !== "sleep");
    log(`${target.name} wakes up!`);
  }
}

export function isAdjacentFrontRowAlly(a: Character, b: Character): boolean {
  if (a.formationSlot > 2 || b.formationSlot > 2) return false;
  return Math.abs(a.formationSlot - b.formationSlot) === 1;
}

export function isDirectlyBehind(protector: Character, target: Character): boolean {
  return (
    protector.formationSlot <= 2 &&
    target.formationSlot === protector.formationSlot + 3
  );
}

/** Adjacent = side-by-side in the same row, or the front/back pair
 *  (formation slots 0-2 front, 3-5 back). Never true for the same character. */
export function isAdjacentAlly(a: Character, b: Character): boolean {
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
export function warlordDamageMultiplier(s: CombatState, actor: Character): number {
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
export function plainHitDamage(s: CombatState, c: Character, rng: Rng): number {
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
export function applyPartyDamage(
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

export function cloneCharacter(c: Character): Character {
  return {
    ...c,
    stats: { ...c.stats },
    status: [...c.status],
    knownSpellIds: [...c.knownSpellIds],
    perkIds: [...c.perkIds],
  };
}

export function cloneEnemy(e: EnemyInstance): EnemyInstance {
  return {
    ...e,
    special: [...e.special],
    status: [...e.status],
    abilityCooldowns: e.abilityCooldowns ? { ...e.abilityCooldowns } : undefined,
  };
}

export function pickRandom<T>(arr: T[], rng: Rng): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}
