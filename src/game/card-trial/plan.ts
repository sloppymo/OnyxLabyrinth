/**
 * Named planning helpers shared by the Card Trial resolver and UI forecast.
 * These are not a universal effect DSL: each helper names one existing rule.
 */

import type { CardId, CardTrialRowMode, PlayerRow } from "./types";
import { CARD_DEFS } from "./cards";

export function planIgnoreRow(rowMode: CardTrialRowMode): boolean {
  return rowMode === "none";
}

export function baseHitWouldKill(hp: number, damage: number | null): boolean {
  return damage !== null && hp > 0 && damage >= hp;
}

export function openerWillApply(opens: boolean, hp: number, damage: number | null): boolean {
  return opens && !baseHitWouldKill(hp, damage);
}

/** Hush halves the current intent's damage, rounding up. */
export function hushHalves(damage: number): number {
  return Math.ceil(damage / 2);
}

export function cardOpens(id: CardId): boolean {
  return CARD_DEFS[id].opens;
}

export function plannedOpenerLabel(
  id: CardId,
  targetHp: number | undefined,
  damage: number | null
): "Open" | "Kill · no Open" | null {
  if (!CARD_DEFS[id].opens) return null;
  if (targetHp === undefined) return "Open";
  return openerWillApply(true, targetHp, damage) ? "Open" : "Kill · no Open";
}

export function plannedCrown(id: CardId): boolean {
  return id === "king-of-the-heap";
}

export function plannedOmen(id: CardId): boolean {
  return id === "the-threshold";
}

export function plannedHush(id: CardId): boolean {
  return id === "the-staff-speaks";
}

export function effectivePlanningRow(
  row: PlayerRow,
  rowMode: CardTrialRowMode
): PlayerRow {
  return planIgnoreRow(rowMode) ? "back" : row;
}
