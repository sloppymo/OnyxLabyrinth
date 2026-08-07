/**
 * Scorchboard quest definitions for Hot Boi's tavern (Floor 1). Progress
 * lives on GameState.questStates (game/quests.ts); this file is the static
 * content half only — titles, board text, and reward wiring.
 *
 * All three quests deliberately reuse existing Floor 1 content instead of
 * adding new encounters:
 *  - "The Last Lantern" completes by talking to Sister Caldris, an existing
 *    dungeon NPC (src/content/floors/floor-1.json, id "sister-caldris").
 *  - "A Shield Left Behind" completes by carrying the shield+1 that already
 *    drops from the floor's existing trapped chest at (18,2).
 *  - "Fifth Chair" recruits the one authored companion (game/companion.ts)
 *    once the party has proven itself via Last Lantern; there is no
 *    separate dungeon step; see game/tavern.ts for the recruit action.
 */

import type { QuestDef } from "../game/quests";

export const QUEST_LAST_LANTERN: QuestDef = {
  id: "last-lantern",
  title: "The Last Lantern",
  boardText:
    "Someone sealed a woman in the north chapel and never came back for her. Find out if she's still herself. Report back either way.",
  acceptText:
    "\"Sister Caldris. Chapel wing, north end.\" Hot Boi wipes a mug. \"Nobody's checked on her in longer than anybody's proud of.\"",
  stages: [
    { text: "Find Sister Caldris in the chapel wing and see how she's holding up." },
  ],
  readyText: "You spoke with Sister Caldris. Report back to Hot Boi.",
  completeText:
    "\"Still singing, still herself. Good.\" He slides a few coins across the bar. \"That's worth more than it sounds.\"",
  failPolicy:
    "No failure state in this release — Sister Caldris cannot be killed or removed from the floor, so the objective is always reachable once accepted.",
  rewardGold: 60,
};

export const QUEST_SHIELD_LEFT_BEHIND: QuestDef = {
  id: "shield-left-behind",
  title: "A Shield Left Behind",
  boardText:
    "A marked shield went missing in the hot wing to the east — the kind of loss somebody comes back for. Bring it here if you find it.",
  acceptText:
    "\"You'll know it. Banding worn smooth on one side, like a hand held it a long time.\" Hot Boi doesn't say whose hand.",
  stages: [
    { text: "Find the marked shield in the eastern wing and bring it back." },
  ],
  readyText: "You're carrying the marked shield. Bring it to Hot Boi.",
  completeText:
    "Hot Boi turns it over once, sets it behind the bar. \"Didn't think this was coming back. Here.\"",
  failPolicy:
    "No time limit or fail state. Carrying or wearing the shield both count toward turn-in (game/tavern.ts hasShieldLeftBehind/consumeShieldLeftBehind). If it is sold or otherwise discarded entirely before turn-in, the quest stays active indefinitely — an honest limitation rather than a soft-lock, since nothing else in the campaign depends on finishing it.",
  rewardGold: 90,
  rewardItemId: "greater-healing-potion",
};

export const QUEST_FIFTH_CHAIR: QuestDef = {
  id: "fifth-chair",
  title: "Fifth Chair",
  boardText:
    "There's a fifth chair at the end of the bar. Vess has been sitting in it since her party didn't come back. She's done waiting to be asked.",
  acceptText:
    "Vess looks up before you finish talking. \"Took you long enough.\"",
  stages: [{ text: "Tell Vess she can travel with you." }],
  readyText: "Vess is ready to travel with the party. Confirm at the Companions desk.",
  completeText:
    "Vess stands, checks a strap that doesn't need checking. \"Try not to lose this one too.\"",
  failPolicy:
    "No failure state — recruitment is a conversation, not a task that can be botched. Losing Vess in combat sends her back to rest at the tavern (see Companions), never removes her permanently.",
  rewardCompanion: true,
};

export const FLOOR1_QUESTS: readonly QuestDef[] = [
  QUEST_LAST_LANTERN,
  QUEST_SHIELD_LEFT_BEHIND,
  QUEST_FIFTH_CHAIR,
];

export const FLOOR1_QUESTS_BY_ID: Record<string, QuestDef> = Object.fromEntries(
  FLOOR1_QUESTS.map((q) => [q.id, q])
);
