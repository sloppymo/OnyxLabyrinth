/**
 * Enemy-side resolution: enemy abilities (damage/multiHit/drain/heal/status/
 * buff/debuff/summon/fizzleField/magicScreen), enemy melee and casts, and
 * summoned-ally attacks. Decisions live in combat-ai.ts; this module only
 * executes resolved intents against the already-cloned CombatState.
 */

import type { Character } from "./party";
import { charRow } from "./party";
import { ENEMIES_BY_ID } from "../data/enemies";
import type { EnemyAbilityDef } from "../data/enemy-abilities";
import { enemyAbilityById } from "../data/enemy-abilities";
import { classHasTechniques } from "../data/techniques";
import { perkModifiers, perksForCharacter } from "./perks";
import {
  effStatsFor,
  damageReductionFor,
  applyPartyDamage,
  scaledAbilityPower,
  isArcaneEnemyAbility,
  isStatusImmune,
  plainHitDamage,
  wakeOnDamage,
  pickRandom,
} from "./combat-shared";
import { gainRage } from "./combat-techniques";
import type {
  CombatEvent,
  CombatState,
  EnemyAction,
  EnemyInstance,
  Rng,
  SummonedAlly,
  WeaponRange,
} from "./combat-types";

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

export function resolveEnemyAction(
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
export function resolveAllyAction(
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
