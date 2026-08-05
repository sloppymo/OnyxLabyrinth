/**
 * Minimal staged quest-state system for the Scorchboard (Hot Boi's tavern
 * job board). Quest *definitions* (data/quests.ts) are static content;
 * quest *progress* lives on GameState.questStates, keyed by stable quest id.
 *
 * Policy (tested in quests.test.ts):
 * - A quest with no recorded progress is implicitly "available".
 * - acceptQuest() only transitions available -> active. Accepting an
 *   already-active/ready/completed/failed quest is a no-op.
 * - advanceQuestStage() / setQuestFlag() / incrementQuestCounter() only
 *   mutate a quest that is currently "active" — progress reported before
 *   acceptance (or after completion) is silently ignored, never
 *   retroactively applied. This keeps "complete the objective before
 *   accepting" from secretly pre-completing the quest.
 * - markQuestReady() only transitions active -> ready.
 * - completeQuest() only transitions ready -> completed and returns whether
 *   the reward should be granted (true exactly once per quest).
 */

import type { GameState } from "../types";

export type QuestStatus = "available" | "active" | "ready" | "completed" | "failed";

export interface QuestProgress {
  status: QuestStatus;
  stage: number;
  counters?: Record<string, number>;
  flags?: Record<string, boolean>;
}

/** One step of a quest's Scorchboard text as it advances. */
export interface QuestStageDef {
  /** Board/journal text shown while the quest sits at this stage. */
  text: string;
}

export interface QuestDef {
  id: string;
  title: string;
  /** Notice-board text before the quest is accepted. */
  boardText: string;
  /** Hot Boi's line when the quest is accepted. */
  acceptText: string;
  /** Stage descriptions in order; stage 0 is the state right after accepting. */
  stages: QuestStageDef[];
  /** Board/turn-in text once the objective is complete and ready to turn in. */
  readyText: string;
  /** Hot Boi's line on successful turn-in. */
  completeText: string;
  /** What happens if the quest cannot be completed. Always shown somewhere
   *  even if the failure path isn't wired yet, per the design brief's
   *  "a failure policy, even if failure is currently impossible" rule. */
  failPolicy: string;
  rewardGold?: number;
  rewardItemId?: string;
  /** True if turning this quest in recruits the tavern's temporary companion. */
  rewardCompanion?: boolean;
}

/** Validates a quest definition list: unique ids, non-empty stage lists. */
export function validateQuestDefs(defs: readonly QuestDef[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const def of defs) {
    if (!def.id) errors.push("Quest with empty id");
    else if (seen.has(def.id)) errors.push(`Duplicate quest id: ${def.id}`);
    seen.add(def.id);
    if (def.stages.length === 0) errors.push(`Quest ${def.id} has no stages`);
  }
  return errors;
}

function progressFor(state: GameState, questId: string): QuestProgress | undefined {
  return state.questStates[questId];
}

export function questStatus(state: GameState, questId: string): QuestStatus {
  return progressFor(state, questId)?.status ?? "available";
}

export function questStage(state: GameState, questId: string): number {
  return progressFor(state, questId)?.stage ?? 0;
}

export function questFlag(state: GameState, questId: string, flag: string): boolean {
  return progressFor(state, questId)?.flags?.[flag] ?? false;
}

export function questCounter(state: GameState, questId: string, counter: string): number {
  return progressFor(state, questId)?.counters?.[counter] ?? 0;
}

/** available -> active. No-op for any other current status. */
export function acceptQuest(state: GameState, questId: string): boolean {
  const current = questStatus(state, questId);
  if (current !== "available") return false;
  state.questStates[questId] = { status: "active", stage: 0 };
  return true;
}

/** Only mutates a currently-active quest; ignored otherwise (see file policy). */
export function advanceQuestStage(state: GameState, questId: string, stage: number): boolean {
  const progress = progressFor(state, questId);
  if (!progress || progress.status !== "active") return false;
  progress.stage = stage;
  return true;
}

/** Only mutates a currently-active quest; ignored otherwise (see file policy). */
export function setQuestFlag(state: GameState, questId: string, flag: string, value: boolean): boolean {
  const progress = progressFor(state, questId);
  if (!progress || progress.status !== "active") return false;
  progress.flags ??= {};
  progress.flags[flag] = value;
  return true;
}

/** Only mutates a currently-active quest; ignored otherwise (see file policy). */
export function incrementQuestCounter(state: GameState, questId: string, counter: string, delta = 1): number {
  const progress = progressFor(state, questId);
  if (!progress || progress.status !== "active") return questCounter(state, questId, counter);
  progress.counters ??= {};
  progress.counters[counter] = (progress.counters[counter] ?? 0) + delta;
  return progress.counters[counter];
}

/** active -> ready. No-op otherwise. */
export function markQuestReady(state: GameState, questId: string): boolean {
  const progress = progressFor(state, questId);
  if (!progress || progress.status !== "active") return false;
  progress.status = "ready";
  return true;
}

/**
 * ready -> completed. Returns true exactly once (the turn the quest actually
 * completes) so the caller grants the reward exactly once; returns false for
 * any quest not currently "ready" (including one already completed).
 */
export function completeQuest(state: GameState, questId: string): boolean {
  const progress = progressFor(state, questId);
  if (!progress || progress.status !== "ready") return false;
  progress.status = "completed";
  return true;
}

/** active/ready -> failed. No-op for available/completed/failed. */
export function failQuest(state: GameState, questId: string): boolean {
  const progress = progressFor(state, questId);
  if (!progress || (progress.status !== "active" && progress.status !== "ready")) return false;
  progress.status = "failed";
  return true;
}
