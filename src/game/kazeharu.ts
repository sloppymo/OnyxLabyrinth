/**
 * Floor 3 "Duelist's Vigil" content: Kazeharu's recruitment gate, his
 * guest-ally presence in the Grand Forge climax, and how his vigil ends.
 *
 * Deliberately isolated from the generic NPC system in game/npc.ts — NPCs
 * are documented there as "additive content ... they never gate campaign
 * progression," and nothing here changes that: the Grand Forge climax
 * already exists and is already reachable without Kazeharu (see
 * data/floors.ts floor3() and data/enemies.ts ENCOUNTER_TABLES[7]). This
 * module only decides whether he's added to that one fight as a
 * combat-scoped guest (game/combat-types.ts SummonedAlly) — never a
 * permanent party member, never equipped, never XP-eligible.
 */
import type { GameState } from "../types";
import type { NPCDef } from "../data/floors";
import { dispositionOf, markKilled } from "./npc";
import type { SummonedAlly } from "./combat-types";

export const KAZEHARU_NPC_ID = "kazeharu";
export const KAZEHARU_GUEST_ID = "kazeharu-guest";
export const FLOOR3_GUARDIAN_CLIMAX_ID = "floor3-guardian";

const FORGE_OF_ASHES_FLOOR_ID = 3;
/** eventKey(14, 9) in game/features.ts — the fused-smith reward event. */
const SMITHS_RING_EVENT_KEY = "14,9";
/** Matches the "seething" mood tier in game/npc.ts's moodOf(). */
const HOSTILE_DISPOSITION = 20;

function isDeadOrHostile(state: GameState, npc: NPCDef): boolean {
  if (state.killedNPCs.includes(npc.id)) return true;
  return dispositionOf(state, npc) <= HOSTILE_DISPOSITION;
}

/** Whether the smith's signet ring has been recovered (the fused-smith
 *  reward event at (14,9), Floor 3) — one leg of the recruitment chain. */
export function hasSmithsRing(state: GameState): boolean {
  return state.eventsTriggered[FORGE_OF_ASHES_FLOOR_ID]?.has(SMITHS_RING_EVENT_KEY) ?? false;
}

/**
 * Whether the party has completed the two legwork steps of the chain
 * (learned the truth about his master, recovered the keepsake) and
 * Kazeharu isn't dead or hostile. Asking to join is the third, separate
 * step — see onKazeharuTopicAsked.
 */
export function kazeharuJoinEligible(state: GameState, npc: NPCDef): boolean {
  return !!state.kazeharuToldTruth && hasSmithsRing(state) && !isDeadOrHostile(state, npc);
}

/**
 * Side effects for Kazeharu's two stateful hidden topics ("master" and
 * "join"). Returns a response override, or undefined to fall back to the
 * topic's static text — every other NPC, and every other Kazeharu topic,
 * is completely unaffected by this function.
 */
export function onKazeharuTopicAsked(
  state: GameState,
  npc: NPCDef,
  key: string
): string | undefined {
  if (npc.id !== KAZEHARU_NPC_ID) return undefined;

  if (key === "master") {
    state.kazeharuToldTruth = true;
    return undefined; // static response stands
  }

  if (key === "join") {
    if (state.kazeharuRecruited) {
      return "I'm already coming. Lead the way.";
    }
    if (isDeadOrHostile(state, npc)) {
      return "You've given me no reason to stand beside you.";
    }
    if (!state.kazeharuToldTruth) {
      return "Not yet. You don't know what you're asking.";
    }
    if (!hasSmithsRing(state)) {
      return "Bring me something of his first, if you find it. Then ask again.";
    }
    state.kazeharuRecruited = true;
    return "Then I'm coming. Let's put the boy down.";
  }

  return undefined;
}

/**
 * Kazeharu's return-greeting override once the Grand Forge has an
 * outcome. Returns undefined (fall back to npc.returnGreeting, which
 * stays exactly as authored) if he was never recruited, or the guardian
 * hasn't been fought yet — skipping the content doesn't punish anyone.
 */
export function kazeharuReturnLine(state: GameState): string | undefined {
  if (state.kazeharuOutcome === "joinedSurvived") {
    return "The vigil's over. I don't know what comes next, but it isn't this room.";
  }
  // "joinedFell": he's dead; there's no one left to greet the party.
  return undefined;
}

/**
 * Guest ally for the Grand Forge climax, or null if Kazeharu shouldn't
 * join this attempt (never recruited, dead/hostile, or his part in the
 * climax already has an outcome). Purely combat-scoped: no equipment, no
 * XP, no party-roster change — see SummonedAlly in game/combat-types.ts.
 */
export function kazeharuGuestAlly(state: GameState): SummonedAlly | null {
  if (!state.kazeharuRecruited || state.kazeharuOutcome) return null;
  const npc = state.floor.npcs?.find((n) => n.id === KAZEHARU_NPC_ID);
  if (npc && isDeadOrHostile(state, npc)) return null;
  return {
    id: KAZEHARU_GUEST_ID,
    name: "Kazeharu",
    hp: 46,
    maxHp: 46,
    attack: 17,
    ac: 4,
    agi: 12,
    row: "front",
    spriteId: "black-knight",
    // One guaranteed, deciding opening strike — makes him read as an
    // authored duelist rather than a renamed BAMORDI/SOCORDI elemental.
    finishingStrikeBonus: 6,
  };
}

/** Keepsake weapon left behind only in the "joined & survived" outcome. */
const KEEPSAKE_ITEM_ID = "kazeharus-blade";

/**
 * Call once the Grand Forge guardian combat ends, if Kazeharu was in it.
 * `survived` should be `result.result === "victory" &&
 * !deadAllyIds.includes(KAZEHARU_GUEST_ID)` — computed by the caller from
 * the finished CombatState, since summonedAllies itself is emptied on
 * both victory and wipe (see combat-eor.ts checkTermination) and can't be
 * inspected after the fact.
 *
 * Awards the keepsake blade exactly once, only in the survived branch —
 * deliberately not routed through the generic NPCDef.rewardItemId/
 * wantsItemId mechanism (npc.ts's giveItem auto-awards at disposition 80
 * regardless of combat outcome, which would let it be earned without ever
 * setting foot in the Grand Forge).
 */
export function resolveKazeharuAfterForge(state: GameState, survived: boolean): void {
  if (!state.kazeharuRecruited || state.kazeharuOutcome) return;
  state.kazeharuOutcome = survived ? "joinedSurvived" : "joinedFell";
  if (survived) {
    state.inventory.push({ itemId: KEEPSAKE_ITEM_ID, identified: true });
    return;
  }
  // He died mid-fight: reflect it on the overworld too (killedNPCs + tile
  // clear), the same bookkeeping an ordinary NPC death uses — otherwise
  // the party could walk back to a "living" Kazeharu with nothing left to
  // say, which would read as a bug, not an ending.
  const npc = state.floor.npcs?.find((n) => n.id === KAZEHARU_NPC_ID);
  if (npc) markKilled(state, npc);
}
