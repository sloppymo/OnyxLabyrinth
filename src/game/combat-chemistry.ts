/**
 * Shared formation-chemistry substrate.
 *
 * This module deliberately contains no renderer code and no broad enemy
 * taxonomy. A chemistry contract is eligible only when its ability supplies
 * an authored narrow group or an explicit enemy-id selector.
 */

import type {
  ChemistryResourceSelector,
  EnemyAbilityDef,
} from "../data/enemy-abilities";
import type {
  ChemistryCombatEvent,
  ChemistryReservation,
  ChemistryTelemetry,
  CombatState,
  EnemyInstance,
  EnemyGuard,
} from "./combat-types";

export function livingEnemies(s: CombatState): EnemyInstance[] {
  return [...s.enemies.front, ...s.enemies.back].filter((enemy) => enemy.currentHp > 0);
}

export function selectorMatches(
  enemy: EnemyInstance,
  selector: ChemistryResourceSelector
): boolean {
  if (selector.group !== undefined) {
    return enemy.chemistryGroups?.includes(selector.group) ?? false;
  }
  return selector.enemyIds.includes(enemy.id);
}

/**
 * Return exact resource candidates. Passive resource disability is ignored on
 * purpose: a sleeping/paralyzed/disabled body can still be ammunition. Only
 * living and unreserved instances are removed here.
 */
export function chemistryResourceCandidates(
  s: CombatState,
  selector: ChemistryResourceSelector,
  extraReserved: readonly string[] = []
): EnemyInstance[] {
  const reserved = new Set(extraReserved);
  for (const reservation of Object.values(s.chemistryReservations ?? {})) {
    if (reservation.resourceId) reserved.add(reservation.resourceId);
    if (reservation.partnerId) reserved.add(reservation.partnerId);
  }
  return livingEnemies(s)
    .filter((enemy) => !reserved.has(enemy.instanceId) && selectorMatches(enemy, selector))
    .sort((a, b) => {
      const serialA = a.spawnSerial ?? Number.MAX_SAFE_INTEGER;
      const serialB = b.spawnSerial ?? Number.MAX_SAFE_INTEGER;
      return serialA - serialB || a.instanceId.localeCompare(b.instanceId);
    });
}

export function selectChemistryResource(
  s: CombatState,
  selector: ChemistryResourceSelector,
  extraReserved: readonly string[] = []
): EnemyInstance | undefined {
  return chemistryResourceCandidates(s, selector, extraReserved)[0];
}

export function chemistryUseKey(actorId: string, abilityId: string): string {
  return `${actorId}:${abilityId}`;
}

export function chemistryUsesFor(
  s: CombatState,
  actorId: string,
  abilityId: string
): number {
  return s.chemistryUses?.[chemistryUseKey(actorId, abilityId)] ?? 0;
}

export function chemistryCapAvailable(
  s: CombatState,
  actorId: string,
  ability: EnemyAbilityDef
): boolean {
  return ability.maxUses === undefined ||
    chemistryUsesFor(s, actorId, ability.id) < ability.maxUses;
}

/** Spend a chemistry use at commitment/telegraph time, even if it later breaks. */
export function reserveChemistryUse(
  s: CombatState,
  actor: EnemyInstance,
  ability: EnemyAbilityDef,
  targetId: string | null,
  resourceId?: string,
  partnerId?: string
): ChemistryReservation | undefined {
  if (!ability.chemistryId || !chemistryCapAvailable(s, actor.instanceId, ability)) {
    return undefined;
  }
  if (!s.chemistryUses) s.chemistryUses = {};
  const key = chemistryUseKey(actor.instanceId, ability.id);
  s.chemistryUses[key] = (s.chemistryUses[key] ?? 0) + 1;
  const reservation: ChemistryReservation = {
    actorId: actor.instanceId,
    abilityId: ability.id,
    chemistryId: ability.chemistryId,
    targetId,
    resourceId,
    partnerId,
    committedRound: s.round,
  };
  if (!s.chemistryReservations) s.chemistryReservations = {};
  s.chemistryReservations[actor.instanceId] = reservation;
  markChemistryMetric(s, "attempted", ability.chemistryId);
  return reservation;
}

export function releaseChemistryReservation(
  s: CombatState,
  actorId: string
): ChemistryReservation | undefined {
  const reservation = s.chemistryReservations?.[actorId];
  if (reservation && s.chemistryReservations) delete s.chemistryReservations[actorId];
  return reservation;
}

export function chemistryReservationFor(
  s: CombatState,
  actorId: string
): ChemistryReservation | undefined {
  return s.chemistryReservations?.[actorId];
}

export function markChemistryMetric(
  s: CombatState,
  metric: keyof ChemistryTelemetry,
  chemistryId: string
): void {
  if (!s.chemistryTelemetry) {
    s.chemistryTelemetry = {
      present: {},
      eligible: {},
      telegraphed: {},
      attempted: {},
      resolved: {},
      broken: {},
    };
  }
  const bucket = s.chemistryTelemetry[metric];
  bucket[chemistryId] = (bucket[chemistryId] ?? 0) + 1;
}

export function chemistryEvent(
  s: CombatState,
  emit: (message: string, event: ChemistryCombatEvent) => void,
  message: string,
  event: Omit<ChemistryCombatEvent, "type">
): void {
  void s;
  emit(message, { type: "chemistry", ...event });
}

export function markConsumed(enemy: EnemyInstance): void {
  enemy.currentHp = 0;
  enemy.removalCause = "consumed";
}

export function markNormalDeath(enemy: EnemyInstance): void {
  if (!enemy.removalCause) enemy.removalCause = "combat";
}

export function actorDisabled(enemy: EnemyInstance): boolean {
  return enemy.currentHp <= 0 || enemy.status.includes("sleep") || enemy.status.includes("paralysis");
}

export function chemistryResourceAlive(s: CombatState, instanceId: string): boolean {
  return livingEnemies(s).some((enemy) => enemy.instanceId === instanceId);
}

/**
 * Return a currently valid guard token for an intended enemy target.
 * Guarding is intentionally bounded: a dead/disabled guarder, a dead target,
 * an expired token, or a self-targeted token never redirects damage.
 */
export function guardForTarget(
  s: CombatState,
  targetId: string
): EnemyGuard | undefined {
  const guard = s.enemyGuards?.[targetId];
  if (!guard) return undefined;
  const target = [...s.enemies.front, ...s.enemies.back].find(
    (enemy) => enemy.instanceId === targetId
  );
  const guarder = [...s.enemies.front, ...s.enemies.back].find(
    (enemy) => enemy.instanceId === guard.guarderId
  );
  if (
    !target ||
    target.currentHp <= 0 ||
    !guarder ||
    actorDisabled(guarder) ||
    guard.targetId !== targetId ||
    guard.guarderId === targetId ||
    s.round > guard.expiresRound
  ) {
    return undefined;
  }
  return guard;
}

/** Drop expired or invalid guards at a round boundary. */
export function pruneEnemyGuards(s: CombatState): void {
  if (!s.enemyGuards) return;
  for (const targetId of Object.keys(s.enemyGuards)) {
    if (!guardForTarget(s, targetId)) delete s.enemyGuards[targetId];
  }
}

/** Install one non-stackable guard token for an exact enemy target. */
export function setEnemyGuard(
  s: CombatState,
  guarder: EnemyInstance,
  target: EnemyInstance,
  ability: EnemyAbilityDef,
  duration: number
): boolean {
  if (!s.enemyGuards) s.enemyGuards = {};
  if (
    guarder.instanceId === target.instanceId ||
    guarder.currentHp <= 0 ||
    actorDisabled(guarder) ||
    target.currentHp <= 0 ||
    guardForTarget(s, target.instanceId)
  ) {
    return false;
  }
  s.enemyGuards[target.instanceId] = {
    guarderId: guarder.instanceId,
    targetId: target.instanceId,
    expiresRound: s.round + Math.max(1, duration) - 1,
    token: true,
    chemistryId: ability.chemistryId ?? "",
    abilityId: ability.id,
    name: ability.name,
  };
  return true;
}

/** Remove one token, returning it only when it was active and usable. */
export function consumeEnemyGuard(
  s: CombatState,
  targetId: string
): EnemyGuard | undefined {
  const guard = guardForTarget(s, targetId);
  if (!guard || !s.enemyGuards) return undefined;
  delete s.enemyGuards[targetId];
  return guard;
}

/**
 * Intercept one direct player action. The intended target remains in the
 * event/log for UI clarity, while the returned target is the exact guarder.
 * This helper is only called from player damage paths, so enemy-to-enemy
 * actions cannot accidentally enter the guard system.
 */
export function interceptEnemyGuard(
  s: CombatState,
  attackerId: string,
  intendedTarget: EnemyInstance,
  emit: (message: string, event: ChemistryCombatEvent) => void
): EnemyInstance {
  const guard = consumeEnemyGuard(s, intendedTarget.instanceId);
  if (!guard) return intendedTarget;
  const guarder = [...s.enemies.front, ...s.enemies.back].find(
    (enemy) => enemy.instanceId === guard.guarderId
  );
  if (!guarder) return intendedTarget;
  emit(
    `${guarder.name} intercepts the attack meant for ${intendedTarget.name}!`,
    {
      type: "chemistry",
      chemistryId: guard.chemistryId,
      abilityId: guard.abilityId,
      name: guard.name,
      phase: "intercept",
      actorId: attackerId,
      targetId: intendedTarget.instanceId,
      partnerId: guarder.instanceId,
      presentation: "guardAlly",
    }
  );
  return guarder;
}
