/**
 * Pure game-logic layer for Hot Boi's tavern: rest, rumor cycling, and
 * Scorchboard quest wiring. No DOM — consumed by engine/tavern-ui.ts.
 * Quest *mechanics* (accept/advance/complete) live in game/quests.ts;
 * this file is what decides WHEN those transitions should fire for the
 * three Floor 1 quests specifically.
 */

import type { GameState } from "../types";
import {
  REST_PRICE,
  RUMORS,
  unlockedRumors,
  hasRaft,
  type RumorDef,
} from "../data/hot-boi";
import { FLOOR1_QUESTS_BY_ID, FLOOR1_QUESTS } from "../data/quests-floor1";
import {
  acceptQuest,
  completeQuest,
  markQuestReady,
  questStatus,
  type QuestDef,
  type QuestStatus,
} from "./quests";
import { recruitCompanion, reviveCompanionAtTavern, FIFTH_CHAIR } from "./companion";
import { manualUnequip } from "./combat-equipment";

// --- Shield Left Behind: equipped-or-carried lookup ------------------------
// The shield is the normal thing to do with a shield, so the quest must
// recognize it worn as well as carried — otherwise equipping it makes the
// quest permanently unwinnable (its own failPolicy text used to admit this).

const SHIELD_LEFT_BEHIND_ITEM_ID = "shield+1";

function findEquippedShieldOwner(state: GameState): string | undefined {
  for (const [charId, loadout] of Object.entries(state.equipment)) {
    if (loadout.armor.some((a) => a.id === SHIELD_LEFT_BEHIND_ITEM_ID)) return charId;
  }
  return undefined;
}

function hasShieldLeftBehind(state: GameState): boolean {
  return (
    state.inventory.some((e) => e.itemId === SHIELD_LEFT_BEHIND_ITEM_ID) ||
    findEquippedShieldOwner(state) !== undefined
  );
}

/** Consumes the shield from wherever it is (inventory takes priority over
 *  an equipped copy, so a party carrying a spare never over-consumes the
 *  worn one). No-op if neither holds it — callers only reach here once
 *  hasShieldLeftBehind has already confirmed one exists. */
function consumeShieldLeftBehind(state: GameState): void {
  const idx = state.inventory.findIndex((e) => e.itemId === SHIELD_LEFT_BEHIND_ITEM_ID);
  if (idx >= 0) {
    state.inventory.splice(idx, 1);
    return;
  }
  const charId = findEquippedShieldOwner(state);
  if (!charId) return;
  const result = manualUnequip(state.equipment[charId], "shield");
  if (result) state.equipment[charId] = result.loadout;
}

// --- Rest --------------------------------------------------------------

export interface RestResult {
  ok: boolean;
  message: string;
}

/** Attempts to charge REST_PRICE and, on success, fully restores the
 *  living party (HP/SP to max, ordinary statuses cleared, KO'd members
 *  revived) — same restoration shape as the free Camp screen, EXCEPT
 *  Rest never touches `state.persistentBuffs`, so an active Light/
 *  Levitate utility spell survives a Rest but not a Camp. Gold is only
 *  ever deducted here, after the affordability check, and only once per
 *  call — the caller (tavern-ui.ts) is responsible for not calling this
 *  twice for one confirm keypress. */
export function restParty(state: GameState): RestResult {
  if (state.partyGold < REST_PRICE) {
    return { ok: false, message: "" };
  }
  state.partyGold -= REST_PRICE;
  for (const c of state.party) {
    c.hp = c.maxHp;
    c.sp = c.maxSp;
    c.status = [];
  }
  return { ok: true, message: "" };
}

// --- Rumors --------------------------------------------------------------

/**
 * Deterministic rumor cycling: no Math.random(), no seeded RNG needed.
 * `state.tavernRumorCursor` is a monotonically increasing counter; the
 * shown rumor is `unlocked[cursor % unlocked.length]`, then the cursor
 * advances. Because progression only ever grows the unlocked pool, this
 * guarantees no immediate repeat (as long as more than one rumor is
 * unlocked) and a full, stable cycle through the pool before any rumor
 * repeats, without ever needing to persist a shuffle.
 */
export function nextRumor(state: GameState): RumorDef | null {
  const pool = unlockedRumors(state);
  if (pool.length === 0) return null;
  const rumor = pool[state.tavernRumorCursor % pool.length];
  state.tavernRumorCursor++;
  return rumor;
}

export const RUMOR_COUNT = RUMORS.length;

// --- Scorchboard -----------------------------------------------------------

export interface ScorchboardEntry {
  def: QuestDef;
  status: QuestStatus;
}

/** Fifth Chair unlock gate: Last Lantern completed (Hot Boi vouching for
 *  the party) AND the party has the raft (Vess isn't offered until there's
 *  somewhere for her to go). Neither half is a generic quest-engine
 *  concept, so this lives here — the single source of truth for both
 *  visibility (scorchboardEntries) and acceptance (acceptScorchboardQuest),
 *  which must never drift apart from each other. */
function fifthChairUnlocked(state: GameState): boolean {
  return questStatus(state, "last-lantern") === "completed" && hasRaft(state);
}

/** Quests currently worth showing on the board. */
export function scorchboardEntries(state: GameState): ScorchboardEntry[] {
  return FLOOR1_QUESTS.filter((def) => {
    if (def.id === "fifth-chair") return fifthChairUnlocked(state);
    return true;
  }).map((def) => ({ def, status: questStatus(state, def.id) }));
}

/** Re-evaluates objective completion for every active quest. Called each
 *  time the Scorchboard screen opens so "ready to turn in" always reflects
 *  the party's current inventory/NPC-talk state without scattering these
 *  checks into features.ts/npc.ts/renderer code. */
export function refreshScorchboardReadiness(state: GameState): void {
  if (
    questStatus(state, "last-lantern") === "active" &&
    state.talkedToNPCs.includes("sister-caldris")
  ) {
    markQuestReady(state, "last-lantern");
  }
  if (
    questStatus(state, "shield-left-behind") === "active" &&
    hasShieldLeftBehind(state)
  ) {
    markQuestReady(state, "shield-left-behind");
  }
  // Fifth Chair has no dungeon step — accepting it is immediately ready.
  if (questStatus(state, "fifth-chair") === "active") {
    markQuestReady(state, "fifth-chair");
  }
}

export function acceptScorchboardQuest(state: GameState, questId: string): boolean {
  const def = FLOOR1_QUESTS_BY_ID[questId];
  if (!def) return false;
  // Belt-and-suspenders: tavern-ui.ts only ever offers ids sourced from
  // scorchboardEntries, but this keeps the invariant enforced at the
  // game-logic layer too, not just by UI construction.
  if (questId === "fifth-chair" && !fifthChairUnlocked(state)) {
    return false;
  }
  const accepted = acceptQuest(state, questId);
  if (accepted) refreshScorchboardReadiness(state);
  return accepted;
}

export interface TurnInResult {
  ok: boolean;
  goldGained: number;
  itemGained?: string;
  companionGained: boolean;
}

/** Turns in a ready quest exactly once and grants its reward exactly once
 *  (gated by quests.ts's completeQuest returning true only on the actual
 *  ready -> completed transition). Consumes the shield for the shield
 *  quest so it can't be turned in twice. */
export function turnInScorchboardQuest(state: GameState, questId: string): TurnInResult {
  const def = FLOOR1_QUESTS_BY_ID[questId];
  const result: TurnInResult = { ok: false, goldGained: 0, companionGained: false };
  if (!def) return result;
  if (!completeQuest(state, questId)) return result;
  result.ok = true;

  if (def.rewardGold) {
    state.partyGold += def.rewardGold;
    result.goldGained = def.rewardGold;
  }
  if (def.rewardItemId) {
    if (questId === "shield-left-behind") {
      consumeShieldLeftBehind(state);
    }
    state.inventory.push({ itemId: def.rewardItemId, identified: true });
    result.itemGained = def.rewardItemId;
  }
  if (def.rewardCompanion) {
    result.companionGained = recruitCompanion(state, FIFTH_CHAIR.id);
  }
  return result;
}

/** Called every time the tavern panel opens: marks the first-ever visit
 *  (for greeting selection), heals a fallen companion back up (they were
 *  never permanently lost, see game/companion.ts), and keeps Scorchboard
 *  readiness current for a quest completed while away. Returns whether
 *  this was the party's first visit. */
export function onTavernOpen(state: GameState): boolean {
  const firstVisit = !state.talkedToNPCs.includes("hot-boi");
  if (firstVisit) state.talkedToNPCs.push("hot-boi");
  reviveCompanionAtTavern(state);
  refreshScorchboardReadiness(state);
  return firstVisit;
}
