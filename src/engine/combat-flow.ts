/**
 * Pure tempo-UX helpers for combat (target defaults, sticky Repeat).
 * No combat math — controller wiring only.
 */

export interface HpEntity {
  instanceId?: string;
  id?: string;
  currentHp?: number;
  hp: number;
  maxHp?: number;
}

/** Prefer last-hit enemy if still in the living list; else lowest current HP%. */
export function preferredEnemyIndex(
  enemies: ReadonlyArray<{ instanceId: string; currentHp: number; hp: number }>,
  lastHitId: string | null
): number {
  if (enemies.length === 0) return 0;
  if (lastHitId) {
    const i = enemies.findIndex((e) => e.instanceId === lastHitId);
    if (i >= 0) return i;
  }
  let best = 0;
  let bestPct = Number.POSITIVE_INFINITY;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const pct = e.hp > 0 ? e.currentHp / e.hp : 1;
    if (pct < bestPct) {
      bestPct = pct;
      best = i;
    }
  }
  return best;
}

/**
 * Prefer lowest HP% among living allies (hp > 0). If all living are full,
 * keep index 0 of the full list (first party slot).
 */
export function preferredAllyIndex(
  allies: ReadonlyArray<{ id: string; hp: number; maxHp: number }>
): number {
  if (allies.length === 0) return 0;
  const livingIdx: number[] = [];
  for (let i = 0; i < allies.length; i++) {
    if (allies[i].hp > 0) livingIdx.push(i);
  }
  if (livingIdx.length === 0) return 0;

  let allFull = true;
  let best = livingIdx[0];
  let bestPct = allies[best].hp / Math.max(1, allies[best].maxHp);
  for (const i of livingIdx) {
    const pct = allies[i].hp / Math.max(1, allies[i].maxHp);
    if (pct < 1 - 1e-9) allFull = false;
    if (pct < bestPct) {
      bestPct = pct;
      best = i;
    }
  }
  return allFull ? 0 : best;
}

/** Sticky last command remembered on the combat controller (not saved). */
export interface StickyAction {
  kind: "attack" | "ambush";
  actorId: string;
  targetId: string;
}

export type RepeatFailReason =
  | "no-sticky"
  | "wrong-actor"
  | "no-target"
  | "dead-target";

/** Whether the sticky Attack/Ambush can fire for this actor against living enemies. */
export function canRepeatAttack(
  sticky: StickyAction | undefined,
  actorId: string,
  livingEnemyIds: ReadonlyArray<string>
): { ok: true } | { ok: false; reason: RepeatFailReason } {
  if (!sticky) return { ok: false, reason: "no-sticky" };
  if (sticky.actorId !== actorId) return { ok: false, reason: "wrong-actor" };
  if (livingEnemyIds.length === 0) return { ok: false, reason: "no-target" };
  if (!livingEnemyIds.includes(sticky.targetId)) {
    return { ok: false, reason: "dead-target" };
  }
  return { ok: true };
}

export function repeatFailFlash(reason: RepeatFailReason): string {
  switch (reason) {
    case "no-sticky":
      return "Nothing to repeat!";
    case "wrong-actor":
      return "Nothing to repeat!";
    case "no-target":
      return "No target!";
    case "dead-target":
      return "No target!";
  }
}

/** Pull the latest player-hit enemy id from this turn's events (party-shared). */
export function lastHitEnemyIdFromEvents(
  events: ReadonlyArray<{ type: string; actorId?: string; targetId?: string | null } | null>,
  partyIds: ReadonlySet<string>
): string | null {
  let last: string | null = null;
  for (const e of events) {
    if (!e || e.targetId == null || e.targetId === "") continue;
    if (!e.actorId || !partyIds.has(e.actorId)) continue;
    if (
      e.type === "attack" ||
      e.type === "miss" ||
      e.type === "ambush" ||
      e.type === "techniqueHit" ||
      e.type === "techniqueMiss" ||
      e.type === "cast" ||
      e.type === "spellEffect"
    ) {
      last = e.targetId;
    }
  }
  return last;
}

/** Last resolved command for Bravely-style party Auto (never Flee/Item). */
export type LastCommand =
  | { kind: "attack" | "ambush"; targetId: string }
  | { kind: "defend" }
  | { kind: "hide" }
  | {
      kind: "cast";
      spellId: string;
      targetInstanceId?: string;
      targetAllyId?: string;
      targetRow?: "front" | "back";
    }
  | {
      kind: "technique";
      techniqueId: string;
      targetInstanceId?: string;
      targetAllyId?: string;
      targetRow?: "front" | "back";
    };

/** Compact SP / Rage line for the acting character's menu. */
export function menuResourceLine(
  sp: number,
  maxSp: number,
  rage: number | null
): string {
  const parts = [`SP ${sp}/${maxSp}`];
  if (rage !== null) parts.push(`Rage ${rage}`);
  return parts.join(" · ");
}

