import { actingHero } from "../engine";
import type { CardTrialState } from "../types";
import { cloneFight } from "./clone";
import type { HeadlessAction } from "./legal-actions";

/**
 * Shallow, deterministic evidence that the current row changed an available
 * action. This is deliberately not an AI score or an optimal-play claim.
 */
export interface RowCounterfactualMetrics {
  decisionTurns: number;
  legalActionsCompared: number;
  rowSensitiveActions: number;
  turnsWithRowSensitiveAction: number;
  moveActionsCompared: number;
  moveActionsChangedState: number;
  maxAbsTacticalDelta: number;
}

export function emptyRowCounterfactual(): RowCounterfactualMetrics {
  return {
    decisionTurns: 0,
    legalActionsCompared: 0,
    rowSensitiveActions: 0,
    turnsWithRowSensitiveAction: 0,
    moveActionsCompared: 0,
    moveActionsChangedState: 0,
    maxAbsTacticalDelta: 0,
  };
}

export function addRowCounterfactual(
  into: RowCounterfactualMetrics,
  next: RowCounterfactualMetrics,
): void {
  into.decisionTurns += next.decisionTurns;
  into.legalActionsCompared += next.legalActionsCompared;
  into.rowSensitiveActions += next.rowSensitiveActions;
  into.turnsWithRowSensitiveAction += next.turnsWithRowSensitiveAction;
  into.moveActionsCompared += next.moveActionsCompared;
  into.moveActionsChangedState += next.moveActionsChangedState;
  into.maxAbsTacticalDelta = Math.max(into.maxAbsTacticalDelta, next.maxAbsTacticalDelta);
}

function stateFingerprint(s: CardTrialState): string {
  return JSON.stringify({
    heroes: (["rat-king", "old-man"] as const).map((id) => {
      const h = s.heroes[id];
      return [id, h.hp, h.guard, h.row];
    }),
    enemies: s.enemies.map((e) => [e.id, e.hp, e.intentIndex]),
    opened: s.opened
      ? [s.opened.enemyId, s.opened.createdBy, s.opened.movedBeforeConsume]
      : null,
    rat: s.rat ? s.rat.row : null,
    result: s.result,
  });
}

function tacticalScore(before: CardTrialState, after: CardTrialState): number {
  const enemyDamage = before.enemies.reduce((sum, e) => {
    const now = after.enemies.find((candidate) => candidate.id === e.id);
    return sum + Math.max(0, e.hp - (now?.hp ?? e.hp));
  }, 0);
  const heroLoss = (["rat-king", "old-man"] as const).reduce((sum, id) => {
    return sum + Math.max(0, before.heroes[id].hp - after.heroes[id].hp);
  }, 0);
  const guardGain = (["rat-king", "old-man"] as const).reduce((sum, id) => {
    return sum + (after.heroes[id].guard - before.heroes[id].guard);
  }, 0);
  // Damage and HP safety are intentionally weighted equally. This is only a
  // readable magnitude for comparing the two immediate branches.
  return enemyDamage * 10 - heroLoss * 10 + guardGain;
}

function toggledRow(s: CardTrialState): CardTrialState {
  const copy = cloneFight(s);
  const hero = actingHero(copy);
  if (hero) hero.row = hero.row === "front" ? "back" : "front";
  return copy;
}

export function measureRowCounterfactual(
  s: CardTrialState,
  actions: readonly HeadlessAction[],
  apply: (state: CardTrialState, action: HeadlessAction) => { ok: boolean },
): RowCounterfactualMetrics {
  const result = emptyRowCounterfactual();
  const hero = actingHero(s);
  if (!hero || s.ruleset?.rowMode === "none") return result;
  result.decisionTurns = 1;

  const alternateRoot = toggledRow(s);
  for (const action of actions) {
    const baseline = cloneFight(s);
    const alternate = cloneFight(alternateRoot);
    const baselineResult = apply(baseline, action);
    const alternateResult = apply(alternate, action);
    if (!baselineResult.ok || !alternateResult.ok) continue;
    result.legalActionsCompared += 1;
    const changed = stateFingerprint(baseline) !== stateFingerprint(alternate);
    if (changed) result.rowSensitiveActions += 1;
    if (action.kind === "move") {
      result.moveActionsCompared += 1;
      if (changed) result.moveActionsChangedState += 1;
    }
    const delta = Math.abs(tacticalScore(s, baseline) - tacticalScore(alternateRoot, alternate));
    result.maxAbsTacticalDelta = Math.max(result.maxAbsTacticalDelta, delta);
  }
  if (result.rowSensitiveActions > 0) result.turnsWithRowSensitiveAction = 1;
  return result;
}

