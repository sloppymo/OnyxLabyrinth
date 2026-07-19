/**
 * Player action resolution: the resolvePlayerAction dispatcher and every
 * player verb — Attack, Cast, Defend, Hide, Ambush, Analyze, Move (row
 * swap), Item — plus the flee helpers. Damage pipelines run through
 * combat-shared helpers; techniques through combat-techniques; spell effects
 * through combat-spells. Operates on the already-cloned CombatState.
 */

import type { Character } from "./party";
import { charRow } from "./party";
import type { EnemySpecial } from "../data/enemies";
import { dispatchHook, perkModifiers, perksForCharacter } from "./perks";
import {
  effStatsFor,
  tagDamageMultiplier,
  effectiveEnemyAc,
  critChanceFromLukAndBonuses,
  warlordDamageMultiplier,
  wakeOnDamage,
  findEnemy,
  pickRandom,
} from "./combat-shared";
import { canReach, effectiveWeaponRange } from "./combat-reach";
import { resolveTechnique, gainRage } from "./combat-techniques";
import { applySpell } from "./combat-spells";
import type {
  CombatEvent,
  CombatState,
  PlayerAction,
  Rng,
  WeaponRange,
} from "./combat-types";

// ---------------------------------------------------------------------------
// Player action resolution
// ---------------------------------------------------------------------------

export function resolvePlayerAction(
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
// Flee
// ---------------------------------------------------------------------------

export function attemptFlee(
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
export function smokeBombFleeActive(s: CombatState): boolean {
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
