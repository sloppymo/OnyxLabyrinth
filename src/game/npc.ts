/**
 * Dungeon NPC interaction logic (pure — no DOM). The modal UI in
 * engine/npc-ui.ts drives these functions; combat hand-off (Attack, botched
 * Steal) is signaled back to main.ts through NPCActionResult.startFight.
 *
 * NPCs are additive content: hints, barter, and flavor. They never gate
 * campaign progression.
 */

import type { GameState } from "../types";
import type { NPCDef, NPCTradeDef } from "../data/floors";
import { ITEMS_BY_ID, displayNameFor } from "../data/items";

export interface NPCActionResult {
  message: string;
  /** When set, main.ts starts a fight against the NPC's formation. */
  startFight?: boolean;
}

const DEFAULT_DISPOSITION = 50;
const REWARD_THRESHOLD = 80;

/** The living NPC on the given tile, if any. */
export function npcAt(state: GameState, x: number, y: number): NPCDef | null {
  const npc = state.floor.npcs?.find((n) => n.x === x && n.y === y) ?? null;
  if (!npc || state.killedNPCs.includes(npc.id)) return null;
  return npc;
}

export function dispositionOf(state: GameState, npc: NPCDef): number {
  return state.npcDisposition[npc.id] ?? DEFAULT_DISPOSITION;
}

export function adjustDisposition(state: GameState, npc: NPCDef, delta: number): void {
  state.npcDisposition[npc.id] = Math.max(
    0,
    Math.min(100, dispositionOf(state, npc) + delta)
  );
}

/** One-word mood for the UI header. */
export function moodOf(state: GameState, npc: NPCDef): string {
  const d = dispositionOf(state, npc);
  if (d >= 80) return "devoted";
  if (d >= 60) return "friendly";
  if (d >= 40) return "wary";
  if (d >= 20) return "hostile";
  return "seething";
}

/** Greeting for the interaction header; marks the NPC as talked-to. */
export function greet(state: GameState, npc: NPCDef): string {
  if (state.talkedToNPCs.includes(npc.id)) return npc.returnGreeting;
  state.talkedToNPCs.push(npc.id);
  return npc.greeting;
}

/** Visible topic keys for the Talk menu (hidden topics need typed keywords). */
export function visibleTopics(npc: NPCDef): string[] {
  return npc.topics.filter((t) => !t.hidden).map((t) => t.key);
}

/** Answer a topic — from the menu or a typed keyword (case-insensitive). */
export function askTopic(npc: NPCDef, keyword: string): string {
  const key = keyword.trim().toLowerCase();
  if (!key) return `${npc.name} waits.`;
  const topic = npc.topics.find((t) => t.key.toLowerCase() === key);
  return topic ? topic.response : `${npc.name} has nothing to say about that.`;
}

/** Trades not yet consumed (one-time trades are recorded in npcTradesDone). */
export function availableTrades(state: GameState, npc: NPCDef): NPCTradeDef[] {
  return (npc.trades ?? []).filter(
    (t) => !state.npcTradesDone.includes(tradeKey(npc, t))
  );
}

function tradeKey(npc: NPCDef, t: NPCTradeDef): string {
  return `${npc.id}:${t.giveItemId}>${t.receiveItemId}`;
}

/** Execute a barter: swap the give-item for the receive-item. */
export function doTrade(state: GameState, npc: NPCDef, trade: NPCTradeDef): NPCActionResult {
  const idx = state.inventory.findIndex((e) => e.itemId === trade.giveItemId);
  const give = ITEMS_BY_ID[trade.giveItemId];
  const receive = ITEMS_BY_ID[trade.receiveItemId];
  if (!give || !receive) return { message: `${npc.name} shakes their head.` };
  if (idx < 0) {
    return { message: `You don't carry a ${give.name}.` };
  }
  state.inventory.splice(idx, 1);
  // Goods from an NPC's own hands are identified.
  state.inventory.push({ itemId: trade.receiveItemId, identified: true });
  if (trade.once) state.npcTradesDone.push(tradeKey(npc, trade));
  adjustDisposition(state, npc, 5);
  return { message: `${npc.name} takes the ${give.name} and hands over a ${receive.name}.` };
}

/**
 * Give an item. NPCs accept only what they want; the wanted gift raises
 * disposition sharply and earns the one-time reward at the threshold.
 */
export function giveItem(state: GameState, npc: NPCDef, invIndex: number): NPCActionResult {
  const entry = state.inventory[invIndex];
  if (!entry) return { message: "" };
  const item = ITEMS_BY_ID[entry.itemId];
  if (!item) return { message: "" };
  if (!npc.wantsItemId || entry.itemId !== npc.wantsItemId) {
    return {
      message: `${npc.name} has no use for ${displayNameFor(item, entry.identified)}.`,
    };
  }
  state.inventory.splice(invIndex, 1);
  const before = dispositionOf(state, npc);
  adjustDisposition(state, npc, 30);
  let message = `${npc.name} accepts the ${item.name} gratefully.`;
  if (
    npc.rewardItemId &&
    before < REWARD_THRESHOLD &&
    dispositionOf(state, npc) >= REWARD_THRESHOLD
  ) {
    const reward = ITEMS_BY_ID[npc.rewardItemId];
    if (reward) {
      state.inventory.push({ itemId: npc.rewardItemId, identified: true });
      message += ` "Take this — it has served me well." (${reward.name})`;
    }
  }
  return { message };
}

/**
 * Steal (Thief only). Success skims gold unnoticed; getting caught turns
 * the NPC hostile on the spot.
 */
export function stealFrom(
  state: GameState,
  npc: NPCDef,
  rng: () => number = Math.random
): NPCActionResult {
  const thief = state.party.find(
    (c) => c.class === "Thief" && c.hp > 0 && !c.status.includes("knockedOut")
  );
  if (!thief) return { message: "Only a living Thief could try that." };
  const chance = Math.min(0.9, ((thief.level + thief.stats.agi) / 2 + 15) / 100);
  if (rng() < chance) {
    const gold = 10 + Math.floor(rng() * 31); // 10-40
    state.partyGold += gold;
    return { message: `${thief.name} lifts ${gold} gold unnoticed.` };
  }
  adjustDisposition(state, npc, -40);
  return {
    message: `${npc.name} catches ${thief.name}'s hand in the pouch — steel is drawn!`,
    startFight: true,
  };
}

/** Mark the NPC dead and clear their tile. */
export function markKilled(state: GameState, npc: NPCDef): void {
  if (!state.killedNPCs.includes(npc.id)) state.killedNPCs.push(npc.id);
  const cell = state.floor.grid[npc.y]?.[npc.x];
  if (cell?.tile === "npc") cell.tile = undefined;
}

/** Clear tiles of already-killed NPCs on a freshly cloned floor. */
export function applyKilledNPCs(
  floor: { grid: { tile?: string }[][]; npcs?: NPCDef[] },
  killedNPCs: string[]
): void {
  for (const npc of floor.npcs ?? []) {
    if (!killedNPCs.includes(npc.id)) continue;
    const cell = floor.grid[npc.y]?.[npc.x];
    if (cell?.tile === "npc") cell.tile = undefined;
  }
}
