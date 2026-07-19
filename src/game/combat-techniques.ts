/**
 * Technique (rage) system: the rage resource itself, per-round technique
 * buff ticking, and resolution of every TechniqueEffect kind. Rage is the
 * melee-technique resource — gained by attacking/taking damage, spent on
 * techniques — so the resource and its consumer live in one module.
 * Operates on the already-cloned CombatState (see combat.ts header).
 */

import type { Character } from "./party";
import { charRow } from "./party";
import type { EnemySpecial } from "../data/enemies";
import type { DamageElement } from "../data/spells";
import type { TechniqueDef, TechniqueEffect } from "../data/techniques";
import { techniqueById, classHasTechniques, maxRageForLevel } from "../data/techniques";
import { dispatchHook, perkModifiers, perksForCharacter } from "./perks";
import {
  effStatsFor,
  tagDamageMultiplier,
  effectiveEnemyAc,
  findEnemy,
  critChanceFromLukAndBonuses,
  warlordDamageMultiplier,
  wakeOnDamage,
  pickRandom,
} from "./combat-shared";
import { canReach, effectiveWeaponRange } from "./combat-reach";
import type {
  CombatEvent,
  CombatState,
  EnemyInstance,
  PlayerAction,
  Rng,
  WeaponRange,
} from "./combat-types";

// ---------------------------------------------------------------------------
// Rage
// ---------------------------------------------------------------------------

/** Rage a character starts combat with: half their pool for technique classes, 0 for casters. */
export function startingRageFor(char: Character): number {
  if (!classHasTechniques(char.class)) return 0;
  return Math.floor(maxRageForLevel(char.level) / 2);
}

/** Add rage to a character (capped at maxRage). No-op for non-technique classes. */
export function gainRage(s: CombatState, charId: string, amount: number): void {
  if (!(charId in s.rage)) return;
  const char = s.party.find((c) => c.id === charId);
  if (!char || !classHasTechniques(char.class)) return;
  const cap = maxRageForLevel(char.level);
  s.rage[charId] = Math.min(cap, (s.rage[charId] ?? 0) + amount);
}

/** Spend rage for a technique. Returns true if the character had enough. */
export function spendRage(s: CombatState, charId: string, cost: number): boolean {
  const current = s.rage[charId] ?? 0;
  if (current < cost) return false;
  s.rage[charId] = current - cost;
  return true;
}

// ---------------------------------------------------------------------------
// Technique buffs/debuffs tick
// ---------------------------------------------------------------------------

/** Decrement durations and expire technique-related temporary effects. */
export function tickTechniqueBuffs(s: CombatState): void {
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

export function resolveTechnique(
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
