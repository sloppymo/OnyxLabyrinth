/**
 * End-of-round bookkeeping: death/termination checks, boss phase advances,
 * status/DoT/regen ticking, hidden-spotting, screen/fizzle decay, silence
 * expiry, and ability-cooldown ticking. Shared by `resolveCombatRound`
 * (Phase 5) and the per-turn API's `endRound` via `runEndOfRound` — both
 * drivers MUST keep calling this one implementation (a prior drift bug:
 * the round path was missing Saint regen and the cooldown tick entirely).
 * Operates on the already-cloned CombatState.
 */

import { perksForCharacter } from "./perks";
import { addStatus, applyPartyDamage, findEnemy, observeAffinity } from "./combat-shared";
import { checkSpotHidden } from "./combat-ai";
import { tickTechniqueBuffs } from "./combat-techniques";
import { maybeEmitBark, enemyDefIdFromInstance } from "./combat-barks";
import { enemyAbilityById } from "../data/enemy-abilities";
import type { CombatEvent, CombatState, Rng, Row } from "./combat-types";
import { breakChemistry } from "./combat-enemy";
import { markNormalDeath, pruneEnemyGuards } from "./combat-chemistry";

/** Remove summoned allies that have been reduced to 0 HP. */
export function allyDeathCheck(
  s: CombatState,
  emit: (m: string, e: CombatEvent) => void
): void {
  s.summonedAllies = s.summonedAllies.filter((ally) => {
    if (ally.hp <= 0) {
      emit(`${ally.name} is banished.`, { type: "defeated", targetId: ally.id, wasEnemy: false });
      s.justDiedAllies.push(ally);
      s.deadAllyIds.push(ally.id);
      return false;
    }
    return true;
  });
}

export function deathCheck(
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
      delete s.giantStrengthTimers[c.id];
      emit(`${c.name} is knocked out!`, { type: "defeated", targetId: c.id, wasEnemy: false });
      maybeEmitBark(s, emit, {
        trigger: "death",
        actorId: c.id,
        classId: c.class,
        isParty: true,
      });
    }
  }
  s.enemies.front = s.enemies.front.filter((e) => {
    if (e.currentHp <= 0) {
      markNormalDeath(e);
      const deathVerb = e.removalCause === "consumed" ? "is consumed" : "is destroyed";
      emit(`${e.name} ${deathVerb}.`, { type: "defeated", targetId: e.instanceId, wasEnemy: true });
      maybeEmitBark(s, emit, {
        trigger: "death",
        actorId: e.instanceId,
        enemyDefId: enemyDefIdFromInstance(e),
        isParty: false,
      });
      if (e.rewardEligible !== false && !e.rewardAwarded) {
        s.goldEarned += e.gold || 0;
        s.xpEarned += e.xp || 0;
        e.rewardAwarded = true;
      }
      s.justDied.push({ ...e, status: [...e.status] });
      return false;
    }
    return true;
  });
  s.enemies.back = s.enemies.back.filter((e) => {
    if (e.currentHp <= 0) {
      markNormalDeath(e);
      const deathVerb = e.removalCause === "consumed" ? "is consumed" : "is destroyed";
      emit(`${e.name} ${deathVerb}.`, { type: "defeated", targetId: e.instanceId, wasEnemy: true });
      maybeEmitBark(s, emit, {
        trigger: "death",
        actorId: e.instanceId,
        enemyDefId: enemyDefIdFromInstance(e),
        isParty: false,
      });
      if (e.rewardEligible !== false && !e.rewardAwarded) {
        s.goldEarned += e.gold || 0;
        s.xpEarned += e.xp || 0;
        e.rewardAwarded = true;
      }
      s.justDied.push({ ...e, status: [...e.status] });
      return false;
    }
    return true;
  });

  // A player action can kill a chemistry actor before the round's previously
  // built enemy queue reaches that actor. Resolve the committed wind-up here
  // so actor death produces the same exact Combo Break as a stale per-turn
  // action, releases its reservation, and never leaves telemetry hanging.
  for (const [actorId, windUp] of Object.entries(s.windUps)) {
    if (!("chemistryId" in windUp) || !windUp.chemistryId) continue;
    const actor = s.justDied.find((enemy) => enemy.instanceId === actorId);
    if (!actor) continue;
    const ability = enemyAbilityById(windUp.abilityId);
    if (!ability) continue;
    breakChemistry(
      s,
      actor,
      ability,
      "actorDead",
      emit,
      windUp.resourceId,
      windUp.partnerId,
      windUp.targetId
    );
  }

  // Guard tokens are tied to living, able guarders and targets. Clear one as
  // soon as a death/disable has been observed, not only at the next round.
  pruneEnemyGuards(s);
  breakChemistryOnPartyWipe(s, emit);
  checkBossPhases(s, emit);
}

/**
 * A party wipe can terminate the resolution loop before a queued enemy beat
 * is visited. Any chemistry reservation committed for that beat is still a
 * spent use, but it must not remain telemetry-hanging or hold a resource
 * reservation into a state that can no longer resolve. A missing committed
 * party target is a target-dead break; an area/untargeted commitment uses the
 * existing target-invalid reason because no replacement target is allowed.
 */
function breakChemistryOnPartyWipe(
  s: CombatState,
  emit: (m: string, e: CombatEvent) => void
): void {
  if (s.party.some((character) => character.hp > 0)) return;
  for (const [actorId, reservation] of Object.entries(s.chemistryReservations ?? {})) {
    const actor = findEnemy(s, actorId) ?? s.justDied.find((enemy) => enemy.instanceId === actorId);
    const ability = enemyAbilityById(reservation.abilityId);
    if (!actor || !ability) continue;
    breakChemistry(
      s,
      actor,
      ability,
      reservation.targetId ? "targetDead" : "targetInvalid",
      emit,
      reservation.resourceId,
      reservation.partnerId,
      reservation.targetId
    );
  }
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

export function checkTermination(s: CombatState, log: (m: string) => void): boolean {
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
    // Apply Swindler gold bonus at victory (+25% if any Swindler landed a crit)
    if (s.swindlerGoldBonusActive) {
      const bonus = Math.round(s.goldEarned * 0.25);
      s.goldEarned += bonus;
      log(`Swindler's critical hit grants +${bonus} bonus gold!`);
    }
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
export function runEndOfRound(
  s: CombatState,
  rng: Rng,
  log: (m: string) => void,
  emit: (m: string, e: CombatEvent) => void
): boolean {
  tickStatuses(s, rng, log, emit);
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
    if (s.magicScreen === 0) s.magicScreenReduction = 0.5;
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
  rng: Rng,
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
      // Route through applyPartyDamage (attacker=null: no counter-attacks)
      // so lethal-save hooks (Guardian Angel, Paladin) and damage
      // redirection (Martyr) / SP absorption (Mana Shield) apply to poison.
      if (emit) {
        const result = applyPartyDamage(s, c, ps.damage, null, rng, emit);
        tick(`${c.name} suffers ${result.finalDamage} poison damage.`, c.id, result.finalDamage);
      } else {
        // No emit (legacy log-only path) — still route through the hook
        // layer so lethal saves apply, then log the final damage.
        const dummyEmit = (_m: string, _e: CombatEvent) => {};
        const result = applyPartyDamage(s, c, ps.damage, null, rng, dummyEmit);
        tick(`${c.name} suffers ${result.finalDamage} poison damage.`, c.id, result.finalDamage);
      }
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
    if (c.status.includes("undertow")) {
      // Expiry is the "endure it" counter. The mark does no damage on its
      // own — letting it run out is a real, if costly, answer.
      const remaining = (s.undertowTimers[c.id] ?? 3) - 1;
      if (remaining <= 0) {
        c.status = c.status.filter((st) => st !== "undertow");
        delete s.undertowTimers[c.id];
        log(`${c.name} is free of the undertow.`);
      } else {
        s.undertowTimers[c.id] = remaining;
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
    if (c.status.includes("giantStrength")) {
      const remaining = (s.giantStrengthTimers[c.id] ?? 3) - 1;
      if (remaining <= 0) {
        c.status = c.status.filter((st) => st !== "giantStrength");
        delete s.giantStrengthTimers[c.id];
        log(`${c.name}'s giant strength fades.`);
      } else {
        s.giantStrengthTimers[c.id] = remaining;
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
