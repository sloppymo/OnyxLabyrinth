/**
 * Enemy AI (Section 7.3 + 10.2): ability picks with conditions/cooldowns,
 * wind-up telegraphs, the flag-driven silenceRandom boss pattern, healer/
 * caster behavior, and melee targeting (taunt, Protector, hidden, summoned
 * allies as a front line). Operates on the already-cloned CombatState.
 */

import type { Character, StatusEffect } from "./party";
import { charRow } from "./party";
import type { EnemySpecial } from "../data/enemies";
import { ENEMIES_BY_ID } from "../data/enemies";
import { spellByName } from "../data/spells";
import type {
  EnemyAbilityDef,
  AbilityCondition,
  ChemistryResourceSelector,
} from "../data/enemy-abilities";
import { enemyAbilityById } from "../data/enemy-abilities";
import { perksForCharacter } from "./perks";
import { effStatsFor, pickRandom, SUMMON_MELEE_SOAK_CHANCE } from "./combat-shared";
import type {
  CombatEvent,
  CombatState,
  EnemyAction,
  EnemyAttackTarget,
  EnemyInstance,
  Rng,
  SummonedAlly,
  ChemistryWindUp,
} from "./combat-types";
import {
  actorDisabled,
  chemistryCapAvailable,
  chemistryResourceCandidates,
  guardForTarget,
  livingScalingAllyIds,
  markChemistryMetric,
  reserveChemistryUse,
  releaseChemistryReservation,
} from "./combat-chemistry";

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

/** Count living enemies sharing this enemy's def id (including self). */
function livingSameKindCount(s: CombatState, enemy: EnemyInstance): number {
  return [...s.enemies.front, ...s.enemies.back].filter(
    (e) => e.currentHp > 0 && e.id === enemy.id
  ).length;
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

function selectorHasLivingResource(
  s: CombatState,
  selector: ChemistryResourceSelector
): boolean {
  return chemistryResourceCandidates(s, selector).length > 0;
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
    case "minSameKind": return livingSameKindCount(s, enemy) >= cond.count;
    case "maxAllies":
      // "at most N allies alive" — must leave room for the summon itself.
      // Was `<=`, which let SUMMON_IMP fire at N=3 living and push a 4th.
      return livingAllyCount(s) < cond.count;
    case "partyHasStatus": return partyHasStatus(s, cond.status);
    case "partyMissingStatus": return !partyHasStatus(s, cond.status);
    case "allyPresent": return selectorHasLivingResource(s, cond.resource);
    case "firstTurn": return !enemy.hasActed;
    case "notFirstTurn": return !!enemy.hasActed;
    default: return false;
  }
}

/** Pick a target ID for an ability based on its target pattern. */
function pickAbilityTargetId(
  s: CombatState,
  ability: EnemyAbilityDef,
  rng: Rng,
  actor?: EnemyInstance
): string | null {
  const livingParty = s.party.filter((c) => c.hp > 0 && !c.status.includes("hidden"));
  const party = livingParty.length > 0 ? livingParty : s.party.filter((c) => c.hp > 0);
  const livingAllies = [...s.enemies.front, ...s.enemies.back].filter((e) => e.currentHp > 0);

  switch (ability.target) {
    case "self":
      return null;
    case "singleParty": {
      if (ability.preferWounded) {
        const wounded = party.filter((c) => c.hp < c.maxHp);
        const pool = wounded.length > 0 ? wounded : party;
        const t = [...pool].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        return t?.id ?? null;
      }
      const t = pickRandom(party, rng);
      return t?.id ?? null;
    }
    case "singleAlly": {
      if (ability.effect.kind === "guard" && ability.guardTargetIds) {
        const candidates = livingAllies
          .filter(
            (ally) =>
              ability.guardTargetIds!.includes(ally.id) &&
              ally.instanceId !== actor?.instanceId &&
              !guardForTarget(s, ally.instanceId)
          )
          .sort(
            (a, b) =>
              a.currentHp / a.hp - b.currentHp / b.hp ||
              a.instanceId.localeCompare(b.instanceId)
          );
        return candidates[0]?.instanceId ?? null;
      }
      const wounded = livingAllies.filter((e) => e.currentHp < e.hp);
      const t = wounded.length > 0 ? wounded.sort((a, b) => a.currentHp - b.currentHp)[0] : pickRandom(livingAllies, rng);
      return t?.instanceId ?? null;
    }
    case "groupParty":
    case "allParty":
    case "groupAlly":
    case "allAlly":
      if (
        ability.effect.kind === "consumeAlly" &&
        ability.effect.payoff.kind === "damage" &&
        ability.effect.payoff.target !== "singleParty"
      ) {
        return null;
      }
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
    if (ab.chemistryId && !s.chemistryEnabled) continue;
    if (ab.chemistryId && !chemistryCapAvailable(s, enemy.instanceId, ab)) continue;
    if (ab.maxUses !== undefined && (enemy.abilityUseCounts?.[ab.id] ?? 0) >= ab.maxUses) continue;
    if (!abilityConditionMet(s, enemy, ab.condition)) continue;
    // Don't pick a summon into a row that's already at the visual slot
    // cap (combat-scene-math ENEMY_*_SLOTS length 3). The resolve path
    // hard-caps too; skipping here avoids wasting the turn on a no-op.
    if (ab.effect.kind === "summon") {
      if ((s.enemySummonsCreated ?? 0) >= 4) continue;
      const def = ENEMIES_BY_ID[ab.effect.enemyId];
      const row = def?.rowPreference === "back" ? "back" : "front";
      if (s.enemies[row].filter((candidate) => candidate.currentHp > 0).length >= 3) continue;
    }
    if (ab.effect.kind === "consumeAlly") {
      if (chemistryResourceCandidates(s, ab.effect.resource).length === 0) continue;
    }
    if (ab.effect.kind === "packStrike") {
      const partner = chemistryResourceCandidates(s, { enemyIds: ab.effect.partnerIds });
      if (partner.length === 0) continue;
      const candidate = partner[0];
      if (actorDisabled(candidate) || s.enemyActedThisRound?.includes(candidate.instanceId)) continue;
    }
    if (ab.effect.kind === "guard" && !pickAbilityTargetId(s, ab, rng, enemy)) continue;
    if (ab.chemistryId) markChemistryMetric(s, "eligible", ab.chemistryId);
    valid.push({ ability: ab, weight: ab.weight });
  }
  if (valid.length === 0) return null;
  const total = valid.reduce((sum, v) => sum + v.weight, 0);
  let roll = rng() * total;
  for (const v of valid) {
    roll -= v.weight;
    if (roll <= 0) {
      const targetId = pickAbilityTargetId(s, v.ability, rng, enemy);
      if (v.ability.effect.kind === "guard" && !targetId) continue;
      return { ability: v.ability, targetId };
    }
  }
  const fallback = valid[0];
  return { ability: fallback.ability, targetId: pickAbilityTargetId(s, fallback.ability, rng, enemy) };
}

export function buildEnemyActions(
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
export function decideEnemyAction(
  s: CombatState,
  enemy: EnemyInstance,
  rng: Rng,
  emit: (m: string, e: CombatEvent) => void
): EnemyAction {
  const livingParty = s.party.filter((c) => c.hp > 0);
  if (livingParty.length === 0) return { kind: "doNothing", actor: enemy };

  // A committed pack partner loses its ordinary action for this round. If
  // the partner already acted before the leader, resolution will instead
  // break the leader's exact commitment with no retarget.
  const partnerReservation = Object.values(s.chemistryReservations ?? {}).find(
    (reservation) => reservation.partnerId === enemy.instanceId && reservation.actorId !== enemy.instanceId
  );
  if (partnerReservation) return { kind: "doNothing", actor: enemy };

  if (enemy.status.includes("sleep") || enemy.status.includes("paralysis")) {
    // Disable = interrupt: an incapacitated enemy loses its wind-up.
    const broken = s.windUps[enemy.instanceId];
    if (broken) {
      delete s.windUps[enemy.instanceId];
      if ("chemistryId" in broken && broken.chemistryId) {
        markChemistryMetric(s, "broken", broken.chemistryId);
        releaseChemistryReservation(s, enemy.instanceId);
        const brokenAbility = enemyAbilityById(broken.abilityId);
        emit(`${enemy.name}'s ${broken.name} is broken!`, {
          type: "chemistry",
          chemistryId: broken.chemistryId,
          abilityId: broken.abilityId,
          name: broken.name,
          phase: "break",
          actorId: enemy.instanceId,
          targetId: broken.targetId,
          resourceId: broken.resourceId,
          partnerId: broken.partnerId,
          reason: "actorDisabled",
          presentation:
            brokenAbility?.presentation === "meleeGangUp"
              ? undefined
              : brokenAbility?.presentation,
        });
      } else {
        emit(`${enemy.name}'s ${broken.name} is broken!`, {
          type: "telegraphBreak", actorId: enemy.instanceId, abilityId: broken.abilityId,
        });
      }
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
    if ("chemistryId" in windUp && windUp.chemistryId) {
      return {
        kind: "ability",
        actor: enemy,
        abilityId: ability.id,
        targetId: windUp.targetId ?? "",
        resourceId: windUp.resourceId,
        partnerId: windUp.partnerId,
        chemistryId: windUp.chemistryId,
      };
    }
    return {
      kind: "ability",
      actor: enemy,
      abilityId: ability.id,
      targetId: windUp.targetId ?? pickAbilityTargetId(s, ability, rng, enemy) ?? "",
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
    const useAbility = abilityPick.ability.chemistryId
      ? rng() < (abilityPick.ability.chemistryChance ?? 1)
      : rng() < abilityPick.ability.weight / (abilityPick.ability.weight + 2);
    if (useAbility) {
      const chemistry = abilityPick.ability.chemistryId;
      let resourceId: string | undefined;
      let partnerId: string | undefined;
      if (chemistry) {
        if (abilityPick.ability.effect.kind === "consumeAlly") {
          resourceId = chemistryResourceCandidates(s, abilityPick.ability.effect.resource)[0]?.instanceId;
          if (!resourceId) return fallbackEnemyAction(s, enemy, rng);
        } else if (abilityPick.ability.effect.kind === "packStrike") {
          const partner = chemistryResourceCandidates(s, { enemyIds: abilityPick.ability.effect.partnerIds })[0];
          if (!partner || actorDisabled(partner) || s.enemyActedThisRound?.includes(partner.instanceId)) {
            return fallbackEnemyAction(s, enemy, rng);
          }
          partnerId = partner.instanceId;
        }
        const reservation = reserveChemistryUse(
          s,
          enemy,
          abilityPick.ability,
          abilityPick.targetId,
          resourceId,
          partnerId
        );
        if (!reservation) return fallbackEnemyAction(s, enemy, rng);
        if (abilityPick.ability.cooldown && abilityPick.ability.cooldown > 0) {
          if (!enemy.abilityCooldowns) enemy.abilityCooldowns = {};
          enemy.abilityCooldowns[abilityPick.ability.id] = abilityPick.ability.cooldown;
        }
        if (partnerId) {
          if (!s.enemyActedThisRound) s.enemyActedThisRound = [];
          // Reservation is checked again at resolution so an earlier partner
          // turn in the round-based initiative can break without retargeting.
          if (!s.chemistryReservations) s.chemistryReservations = {};
        }
      }
      // Wind-up abilities telegraph instead of resolving: the party gets a
      // full round to answer (disable, Defend, blind, or kill).
      if (abilityPick.ability.windUp) {
        if (chemistry) {
          const windUp: ChemistryWindUp = {
            abilityId: abilityPick.ability.id,
            name: abilityPick.ability.name,
            targetId: abilityPick.targetId,
            resourceId,
            partnerId,
            chemistryId: chemistry,
            useReserved: true,
          };
          s.windUps[enemy.instanceId] = windUp;
          markChemistryMetric(s, "telegraphed", chemistry);
          // A scaled payoff must announce its current strength AT TELEGRAPH,
          // not only on resolution — the wind-up round is the only point where
          // the player can still act on the number. Without this the scaling
          // is invisible and the ability reads as a flat nuke with a fancy
          // animation.
          const scaling =
            abilityPick.ability.effect.kind === "damage"
              ? abilityPick.ability.effect.scaling
              : undefined;
          const amplifierIds = scaling
            ? livingScalingAllyIds(s, enemy, scaling)
            : undefined;
          const chorus = amplifierIds
            ? ` (${amplifierIds.length} ${amplifierIds.length === 1 ? "voice" : "voices"} answering)`
            : "";
          emit(`${enemy.name} begins charging ${abilityPick.ability.name}!${chorus}`, {
            type: "chemistry",
            chemistryId: chemistry,
            abilityId: abilityPick.ability.id,
            name: abilityPick.ability.name,
            phase: "telegraph",
            actorId: enemy.instanceId,
            targetId: abilityPick.targetId,
            resourceId,
            partnerId,
            amplifierIds,
            presentation: abilityPick.ability.presentation === "meleeGangUp"
              ? undefined
              : abilityPick.ability.presentation,
          });
        } else {
          s.windUps[enemy.instanceId] = {
            abilityId: abilityPick.ability.id,
            name: abilityPick.ability.name,
            targetId: abilityPick.targetId,
          };
          emit(`${enemy.name} begins charging ${abilityPick.ability.name}!`, {
            type: "telegraph", actorId: enemy.instanceId, abilityId: abilityPick.ability.id,
          });
        }
        return { kind: "doNothing", actor: enemy };
      }
      return {
        kind: "ability",
        actor: enemy,
        abilityId: abilityPick.ability.id,
        targetId: abilityPick.targetId ?? "",
        resourceId,
        partnerId,
        chemistryId: chemistry,
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
    // When preferTargetIds is authored, wounded preferred allies are healed
    // first — this expresses a authored relationship (e.g. the Cursed Scribe
    // stabilizing the Feral Scrivener) without new chemistry infrastructure.
    if (healerSpecial) {
      const wounded = [...s.enemies.front, ...s.enemies.back].filter(
        (e) => e.currentHp > 0 && e.currentHp < e.hp
      );
      const preferred = healerSpecial.preferTargetIds;
      const target = wounded.sort((a, b) => {
        const aPref = preferred?.includes(a.id) ? 0 : 1;
        const bPref = preferred?.includes(b.id) ? 0 : 1;
        if (aPref !== bPref) return aPref - bPref;
        return a.currentHp - b.currentHp;
      })[0];
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

function fallbackEnemyAction(s: CombatState, enemy: EnemyInstance, rng: Rng): EnemyAction {
  const target = pickMeleeTarget(s.party, s.summonedAllies, rng, s.tauntingIds);
  return target
    ? { kind: "attack", actor: enemy, target }
    : { kind: "doNothing", actor: enemy };
}

/**
 * Check if any hidden characters should be spotted this round.
 * Spot chance is based on enemy level vs character level + AGI.
 * Returns true if a hidden character was spotted.
 */
export function checkSpotHidden(
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
    if (c.formationSlot > 1) continue;
    if (!perksForCharacter(c).some((p) => p.id === "fighter-protector")) continue;
    protectedSlots.add(c.formationSlot + 2);
  }
  return protectedSlots;
}

export function pickMeleeTarget(
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
