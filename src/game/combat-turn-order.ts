/**
 * Read-only turn-order view of the live FF6 initiative queue.
 *
 * Source of truth is the same `TurnQueueEntry[]` `beginRound` returns —
 * this module never re-sorts or re-rolls initiative. Acted entries are
 * dropped (not greyed); dead/missing actors are omitted; sleep/paralysis
 * are flagged as will-skip so the UI can grey them with a status tag.
 */

import type { CombatState, TurnQueueEntry } from "./combat-types";

export type TurnOrderSkipReason = "sleep" | "paralysis";

export interface TurnOrderViewEntry {
  kind: "player" | "enemy" | "ally";
  id: string;
  name: string;
  /** Actor whose turn is currently open or playing back. */
  current: boolean;
  /** Will auto-skip when reached (sleep / paralysis). */
  willSkip: boolean;
  skipReason: TurnOrderSkipReason | null;
}

function findName(state: CombatState, entry: TurnQueueEntry): string | null {
  if (entry.kind === "player") {
    return state.party.find((c) => c.id === entry.id)?.name ?? null;
  }
  if (entry.kind === "ally") {
    return state.summonedAllies.find((a) => a.id === entry.id)?.name ?? null;
  }
  const enemy = [...state.enemies.front, ...state.enemies.back].find(
    (e) => e.instanceId === entry.id
  );
  return enemy?.name ?? null;
}

function isAlive(state: CombatState, entry: TurnQueueEntry): boolean {
  if (entry.kind === "player") {
    const c = state.party.find((p) => p.id === entry.id);
    return !!c && c.hp > 0;
  }
  if (entry.kind === "ally") {
    const a = state.summonedAllies.find((x) => x.id === entry.id);
    return !!a && a.hp > 0;
  }
  const enemy = [...state.enemies.front, ...state.enemies.back].find(
    (e) => e.instanceId === entry.id
  );
  return !!enemy && enemy.currentHp > 0;
}

function skipInfo(
  state: CombatState,
  entry: TurnQueueEntry
): { willSkip: boolean; skipReason: TurnOrderSkipReason | null } {
  let status: string[] = [];
  if (entry.kind === "player") {
    status = state.party.find((c) => c.id === entry.id)?.status ?? [];
  } else if (entry.kind === "ally") {
    // Summoned allies have no status array today — they always act.
    return { willSkip: false, skipReason: null };
  } else {
    const enemy = [...state.enemies.front, ...state.enemies.back].find(
      (e) => e.instanceId === entry.id
    );
    status = enemy?.status ?? [];
  }
  if (status.includes("sleep")) return { willSkip: true, skipReason: "sleep" };
  if (status.includes("paralysis")) return { willSkip: true, skipReason: "paralysis" };
  return { willSkip: false, skipReason: null };
}

/**
 * Remaining actors for this round, in act order.
 *
 * `queueIndex` is the controller cursor *after* the current entry has been
 * taken (`nextTurn` does `queue[queueIndex++]`). Pass `actingId` as that
 * popped entry's id while its menu/playback is active so it stays at the
 * head of the list (highlighted). Acted-before entries are not returned.
 */
export function remainingTurnOrder(
  queue: readonly TurnQueueEntry[],
  queueIndex: number,
  state: CombatState,
  actingId: string | null = null
): TurnOrderViewEntry[] {
  const out: TurnOrderViewEntry[] = [];
  const seen = new Set<string>();

  const push = (entry: TurnQueueEntry, current: boolean): void => {
    if (seen.has(entry.id)) return;
    if (!isAlive(state, entry)) return;
    const name = findName(state, entry);
    if (!name) return;
    const { willSkip, skipReason } = skipInfo(state, entry);
    seen.add(entry.id);
    out.push({
      kind: entry.kind,
      id: entry.id,
      name,
      current,
      willSkip,
      skipReason,
    });
  };

  if (actingId && queueIndex > 0) {
    const acting = queue[queueIndex - 1];
    if (acting && acting.id === actingId) {
      push(acting, true);
    }
  } else if (actingId) {
    const acting = queue.find((e) => e.id === actingId);
    if (acting) push(acting, true);
  }

  for (let i = queueIndex; i < queue.length; i++) {
    push(queue[i]!, false);
  }

  return out;
}
