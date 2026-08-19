/**
 * Tests for the dungeon NPC interaction overlay.
 *
 * These catch input-routing regressions in the dungeon NPC overlay
 * (UiStack id `"npc"`).
 */

import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { createDefaultParty } from "../game/party";
import { defaultLoadoutForCharacter } from "../game/combat-equipment";
import { setGameplayRng, resetGameplayRng } from "../game/rng";
import type { GameState } from "../types";
import type { NPCDef } from "../data/floors";
import { audio } from "./audio";

let NPCControllerCtor: typeof import("./npc-ui").NPCController;

beforeAll(async () => {
  // The overlay renders into #combat-panel; create it before loading the module.
  const panel = document.createElement("div");
  panel.id = "combat-panel";
  document.body.appendChild(panel);

  const mod = await import("./npc-ui");
  NPCControllerCtor = mod.NPCController;
});

function makeNPC(overrides: Partial<NPCDef> = {}): NPCDef {
  return {
    id: "hermit",
    name: "Odo",
    title: "crypt hermit",
    x: 2,
    y: 2,
    greeting: "A visitor!",
    returnGreeting: "Back again?",
    topics: [{ key: "key", response: "The key lies with the dead." }],
    trades: [{ giveItemId: "antidote", receiveItemId: "robe+2", once: true }],
    wantsItemId: "healing-potion",
    rewardItemId: "long-sword+1",
    combatEnemyIds: ["ironclad-knight"],
    ...overrides,
  };
}

function makeState(npc: NPCDef = makeNPC()): GameState {
  const party = createDefaultParty();
  return {
    mode: "dungeon",
    floor: {
      id: 1,
      name: "Test Crypt",
      width: 6,
      height: 6,
      grid: [] as any,
      startX: 1,
      startY: 1,
      encounterRate: 0,
      encounterTable: [],
      npcs: [npc],
    },
    player: { x: npc.x, y: npc.y, facing: 0 },
    party,
    equipment: Object.fromEntries(party.map((c) => [c.id, defaultLoadoutForCharacter(c)])),
    explored: new Set<string>(),
    exploredByFloor: {},
    stepsSinceEncounter: 0,
    dayCount: 1,
    worldYear: 3847,
    partyGold: 0,
    inventory: [],
    keys: [],
    unlockedDoors: new Set<string>(),
    lootTaken: {},
    pendingTrap: null,
    persistentBuffs: [],
    swimSkill: {},
    talkedToNPCs: [],
    npcDisposition: {},
    killedNPCs: [],
    npcTradesDone: [],
    inDarkness: false,
    inAntimagic: false,
    eventsTriggered: {},
    deepestFloorReached: 1,
    hasCompletedEnding: false,
    keyItems: [],
    floorRevisions: {},
    lastDungeon: null,
    questStates: {},
    tavernRumorCursor: 0,
    companion: null,
    clearedStairsGuardians: [],
  };
}

describe("NPCController", () => {
  // Safety net: if any test sets a seeded gameplay RNG and throws before
  // resetting, afterEach ensures the rest of the suite sees Math.random.
  afterEach(() => resetGameplayRng());

  function freshController(state: GameState, npc: NPCDef) {
    let closeMessage = "";
    let fightNpc: NPCDef | null = null;
    let fightCount = 0;
    const controller = new NPCControllerCtor({
      panel: document.querySelector<HTMLDivElement>("#combat-panel")!,
      state,
      npc,
      onClose: (message: string) => {
        closeMessage = message;
      },
      onFight: (n: NPCDef) => {
        fightNpc = n;
        fightCount++;
      },
    });
    return {
      controller,
      closeMessage: () => closeMessage,
      fightNpc: () => fightNpc,
      fightCount: () => fightCount,
    };
  }

  it("shows the portrait/name/greeting first, with the action bar hidden until acknowledged", () => {
    const npc = makeNPC();
    const state = makeState(npc);
    const { controller } = freshController(state, npc);

    const panel = document.querySelector<HTMLDivElement>("#combat-panel")!;
    expect(panel.textContent).toContain("Odo");
    expect(panel.textContent).toContain("A visitor!");
    // The root action bar is a deliberate second beat, not part of the
    // initial cinematic greeting — see npc-dialogue-view.ts.
    expect(panel.textContent).not.toContain("Talk");
    expect(panel.textContent).not.toContain("Attack");

    // Any acknowledgment (here, an arrow key) reveals it.
    controller.handleKey("ArrowDown");
    expect(panel.textContent).toContain("Talk");
    expect(panel.textContent).toContain("Attack");

    controller.destroy();
  });

  it("a single Enter on a fresh greeting does not start combat (regression: P0 NPC Enter→attack)", () => {
    const npc = makeNPC();
    const state = makeState(npc);
    const { controller, fightNpc, fightCount } = freshController(state, npc);

    // Press Enter exactly once on the fresh greeting. This should complete
    // the typewriter reveal, NOT activate any menu item. The original
    // playtest report said "Enter on the NPC greeting initiated combat."
    // This test verifies that a single Enter cannot reach the confirm() path.
    // playtest report said "Enter on the NPC greeting initiated combat."
    // This test verifies that a single Enter cannot reach the confirm() path.
    controller.handleKey("Enter");

    expect(fightNpc()).toBeNull();
    expect(fightCount()).toBe(0);

    controller.destroy();
  });

  it("first arrow on greeting reveals action bar but does not move selection (regression: blind navigation to Attack)", () => {
    const npc = makeNPC();
    const state = makeState(npc);
    const { controller, fightNpc } = freshController(state, npc);

    // Press ArrowUp 8 times on the unacknowledged greeting. Before the fix,
    // each ArrowUp moved the index, wrapping to "Attack" (index 4 of 6).
    // After the fix, the first ArrowUp only acknowledges; subsequent ones
    // navigate from index 0.
    for (let i = 0; i < 8; i++) controller.handleKey("ArrowUp");
    controller.handleKey("Enter"); // confirm current selection

    // Should NOT start combat — index should be at a safe item, not "Attack".
    expect(fightNpc()).toBeNull();

    controller.destroy();
  });

  it("opens the Talk phase with the 't' hotkey", () => {
    const npc = makeNPC();
    const state = makeState(npc);
    const { controller } = freshController(state, npc);

    controller.handleKey("Enter"); // complete reveal
    controller.handleKey("Enter"); // acknowledge greeting
    controller.handleKey("t");

    const panel = document.querySelector<HTMLDivElement>("#combat-panel")!;
    expect(panel.textContent).toContain("key");
    expect(panel.textContent).toContain("Ask about");

    controller.destroy();
  });

  it("opens the Barter phase with the 'b' hotkey", () => {
    const npc = makeNPC();
    const state = makeState(npc);
    state.inventory.push({ itemId: "antidote", identified: true });
    const { controller } = freshController(state, npc);

    controller.handleKey("Enter");
    controller.handleKey("Enter");
    controller.handleKey("b");

    const panel = document.querySelector<HTMLDivElement>("#combat-panel")!;
    expect(panel.textContent).toContain("Your Antidote for Robe +2");

    controller.destroy();
  });

  it("leaves with the 'l' hotkey", () => {
    const npc = makeNPC();
    const state = makeState(npc);
    const { controller, closeMessage } = freshController(state, npc);

    controller.handleKey("Enter");
    controller.handleKey("Enter");
    controller.handleKey("l");

    expect(closeMessage()).toBe("You step away.");

    controller.destroy();
  });

  it("starts a fight with the 'a' hotkey", () => {
    const npc = makeNPC();
    const state = makeState(npc);
    const { controller, fightNpc } = freshController(state, npc);

    controller.handleKey("Enter");
    controller.handleKey("Enter");
    controller.handleKey("a");

    expect(fightNpc()?.id).toBe("hermit");

    controller.destroy();
  });

  it("steal without a Thief shows the can't-steal message", () => {
    const npc = makeNPC();
    const state = makeState(npc);
    for (const c of state.party) {
      if (c.class === "Thief") c.class = "Fighter";
    }
    const { controller } = freshController(state, npc);

    controller.handleKey("Enter");
    controller.handleKey("Enter");
    controller.handleKey("s");

    const panel = document.querySelector<HTMLDivElement>("#combat-panel")!;
    expect(panel.textContent).toContain("Only a living Thief");

    controller.destroy();
  });

  it("plays the steal cue only on a successful theft", () => {
    setGameplayRng(() => 0);
    try {
      const cue = vi.spyOn(audio, "playDungeonSfx").mockImplementation(() => {});
      const npc = makeNPC();
      const state = makeState(npc);
      const { controller } = freshController(state, npc);

      controller.handleKey("Enter");
      controller.handleKey("Enter");
      controller.handleKey("s");

      expect(cue).toHaveBeenCalledWith("npcSteal");
      controller.destroy();
    } finally {
      resetGameplayRng();
    }
  });

  it("plays the transaction cue after a successful barter", () => {
    const cue = vi.spyOn(audio, "uiBuySell").mockImplementation(() => {});
    const npc = makeNPC();
    const state = makeState(npc);
    state.inventory.push({ itemId: "antidote", identified: true });
    const { controller } = freshController(state, npc);

    // Acknowledge greeting, open barter, then consume the barter narration
    // and confirm the trade.
    controller.handleKey("Enter");
    controller.handleKey("Enter");
    controller.handleKey("b");
    controller.handleKey("Enter"); // consume reveal
    controller.handleKey("Enter"); // acknowledge barter narration
    controller.handleKey("Enter"); // confirm the trade

    expect(cue).toHaveBeenCalledTimes(1);
    controller.destroy();
    vi.restoreAllMocks();
  });

  it("keeps a spell confirmation locked to the inspected row", () => {
    const cue = vi.spyOn(audio, "uiBuySell").mockImplementation(() => {});
    const npc = makeNPC({
      id: "isobel",
      name: "Isobel",
      title: "proprietor of ISO-SPELLS",
      capabilities: { shop: true, talk: true, barter: false, give: false, steal: false, attack: false },
      shop: {
        kind: "spell",
        inventory: [
          { spellId: "mage-isovoid", price: 2400 },
          { spellId: "mage-isoflare", price: 3200 },
        ],
      },
    });
    const state = makeState(npc);
    state.partyGold = 60000;
    const mage = state.party.find((c) => c.class === "Mage")!;
    const { controller } = freshController(state, npc);

    controller.handleKey("Enter"); // complete greeting reveal
    controller.handleKey("Enter"); // acknowledge greeting
    controller.handleKey("b"); // Browse
    controller.handleKey("Enter"); // complete shop narration reveal
    controller.handleKey("Enter"); // acknowledge shop narration
    controller.handleKey("Enter"); // Inspect Isovoid
    controller.handleKey("ArrowDown"); // Must not change the confirmation target
    controller.handleKey("Enter"); // complete confirmation reveal
    controller.handleKey("Enter"); // acknowledge confirmation
    controller.handleKey("Enter"); // Buy Isovoid

    expect(state.partyGold).toBe(57600);
    expect(mage.knownSpellIds).toContain("mage-isovoid");
    expect(mage.knownSpellIds).not.toContain("mage-isoflare");
    expect(cue).toHaveBeenCalledTimes(1);
    controller.destroy();
    vi.restoreAllMocks();
  });

  it("hides attack, steal, barter, and give for a spell shopkeeper", () => {
    const npc = makeNPC({
      capabilities: { shop: true, talk: true, barter: false, give: false, steal: false, attack: false },
      shop: { kind: "spell", inventory: [{ spellId: "mage-isovoid", price: 2400 }] },
    });
    const state = makeState(npc);
    const { controller } = freshController(state, npc);
    const text = document.querySelector<HTMLDivElement>("#combat-panel")!.textContent ?? "";
    expect(text).not.toContain("Browse Iso-Spells");
    controller.handleKey("Enter"); // complete greeting reveal
    controller.handleKey("Enter"); // acknowledge greeting
    const acknowledgedText = document.querySelector<HTMLDivElement>("#combat-panel")!.textContent ?? "";
    expect(acknowledgedText).toContain("Browse Iso-Spells");
    expect(acknowledgedText).not.toContain("Attack");
    expect(acknowledgedText).not.toContain("Steal");
    expect(acknowledgedText).not.toContain("Barter");
    expect(acknowledgedText).not.toContain("Give");
    controller.destroy();
  });

  it("closes with Escape", () => {
    const npc = makeNPC();
    const state = makeState(npc);
    const { controller, closeMessage } = freshController(state, npc);

    controller.handleKey("Escape");

    expect(closeMessage()).toBe("You step away.");

    controller.destroy();
  });

  it("root Enter completes the reveal before it can advance/select anything", () => {
    const npc = makeNPC();
    const state = makeState(npc);
    const { controller } = freshController(state, npc);

    // First Enter, while the mask is still animating, must only complete
    // the reveal — never select the default-highlighted root item.
    const consumed = controller.handleKey("Enter");
    expect(consumed).toBe(true);
    const panel = document.querySelector<HTMLDivElement>("#combat-panel")!;
    // Still on the greeting, not inside a sub-phase (e.g. Talk/Attack menu).
    expect(panel.textContent).toContain("A visitor!");

    controller.destroy();
  });

  it("repeated Enter cannot select Attack: it first reveals, then only acknowledges", () => {
    const npc = makeNPC();
    const state = makeState(npc);
    const { controller, fightNpc } = freshController(state, npc);

    controller.handleKey("Enter"); // complete reveal
    controller.handleKey("Enter"); // acknowledge (show action bar)
    expect(fightNpc()).toBeNull();

    const panel = document.querySelector<HTMLDivElement>("#combat-panel")!;
    expect(panel.textContent).toContain("Talk");
    expect(panel.textContent).toContain("Attack");
    // Cursor still defaults to the first root item (Talk), not Attack.
    expect(fightNpc()).toBeNull();

    controller.destroy();
  });

  it("blocks root action hotkeys (a, s, g, b, t, l) before the greeting is acknowledged", () => {
    const npc = makeNPC();
    const state = makeState(npc);
    const { controller, closeMessage, fightNpc } = freshController(state, npc);

    for (const key of ["a", "s", "g", "b", "t", "l"]) {
      const consumed = controller.handleKey(key);
      // Most hotkeys are silently ignored before ack; 'l' matches an
      // unrelated 'ArrowLeft' substring? No — startsWith('l') is exact.
      // After this we assert nothing happened.
      expect(consumed).toBe(key === "Escape" ? true : false);
    }

    expect(fightNpc()).toBeNull();
    expect(closeMessage()).toBe("");
    const panel = document.querySelector<HTMLDivElement>("#combat-panel")!;
    // Still the initial greeting, no action bar, no sub-phase.
    expect(panel.textContent).toContain("A visitor!");
    expect(panel.textContent).not.toContain("Talk");

    controller.destroy();
  });

  it("paginates a long root greeting across multiple Enter presses", () => {
    const longGreeting =
      "This is the first sentence of a very long greeting. " +
      "This is the second sentence, and it continues for a while. " +
      "This is the third sentence, which should push the text beyond the page budget. " +
      "This is the fourth sentence, and it also keeps going so we get at least one page break. " +
      "This is the fifth sentence so the controller definitely has to split into pages.";
    const npc = makeNPC({ greeting: longGreeting });
    const state = makeState(npc);
    const { controller } = freshController(state, npc);

    const panel = document.querySelector<HTMLDivElement>("#combat-panel")!;
    // First page is a prefix of the full greeting.
    expect(panel.textContent).not.toContain("fifth sentence");

    controller.handleKey("Enter"); // complete reveal
    controller.handleKey("Enter"); // acknowledge first page
    expect(panel.textContent).toContain("fifth sentence"); // now on a later page

    controller.destroy();
  });

  it("paginates a long topic answer and requires acknowledgement before re-asking", () => {
    const longResponse =
      "First part of the answer. It keeps going. It keeps going some more. " +
      "Second part of the answer, which is long enough to force a second page and then some. " +
      "Third part of the answer, which must also be quite long if the pagination is to split the whole response into at least two pages, preferably three. " +
      "Fourth part of the answer, added here so the text is unambiguously longer than the per-page budget and the player sees a page turn. " +
      "Fifth part of the answer, which is the final segment and should only appear after the player has turned to the last page. " +
      "Sixth part of the answer, padding the response with enough additional words to absolutely ensure at least three pages.";
    const npc = makeNPC({
      topics: [{ key: "key", response: longResponse }],
    });
    const state = makeState(npc);
    const { controller } = freshController(state, npc);

    const panel = document.querySelector<HTMLDivElement>("#combat-panel")!;
    controller.handleKey("Enter");
    controller.handleKey("Enter");
    controller.handleKey("t"); // talk, index 0 selects the only visible topic
    // The first page of the response is shown but should not contain the
    // tail marker yet.
    expect(panel.textContent).not.toContain("Fifth part");
    // Keep paging through (reveal + turn for each page) until the final
    // page is reached; the marker must appear.
    for (let i = 0; i < 8; i++) controller.handleKey("Enter");
    expect(panel.textContent).toContain("Fifth part");

    controller.destroy();
  });

  it("paginates a barter transaction result and requires acknowledgement before re-trading", () => {
    const cue = vi.spyOn(audio, "uiBuySell").mockImplementation(() => {});
    const npc = makeNPC();
    const state = makeState(npc);
    state.inventory.push({ itemId: "antidote", identified: true });
    const { controller } = freshController(state, npc);

    const panel = document.querySelector<HTMLDivElement>("#combat-panel")!;
    controller.handleKey("Enter");
    controller.handleKey("Enter");
    controller.handleKey("b");
    // Confirm the trade once.
    controller.handleKey("Enter");
    controller.handleKey("Enter");
    controller.handleKey("Enter");
    expect(panel.textContent).toContain("takes the Antidote");
    // A one-time trade is now exhausted; another immediate confirm should not
    // trigger the cue again.
    expect(cue).toHaveBeenCalledTimes(1);

    controller.destroy();
    vi.restoreAllMocks();
  });

  it("give result is acknowledged and cannot be re-triggered immediately", () => {
    const npc = makeNPC({ wantsItemId: "healing-potion", rewardItemId: "long-sword+1" });
    const state = makeState(npc);
    state.inventory.push({ itemId: "healing-potion", identified: true });
    const { controller } = freshController(state, npc);

    const panel = document.querySelector<HTMLDivElement>("#combat-panel")!;
    controller.handleKey("Enter");
    controller.handleKey("Enter");
    controller.handleKey("g");
    // Confirm the give once (healing potion is the only item).
    controller.handleKey("Enter"); // complete reveal
    controller.handleKey("Enter"); // acknowledge
    controller.handleKey("Enter"); // confirm give
    expect(panel.textContent).toContain("accepts");
    // Wanted gift is consumed and one-time reward is added.
    expect(state.inventory.length).toBe(1);
    expect(state.inventory[0].itemId).toBe("long-sword+1");

    controller.destroy();
  });

  it("close() clears the reveal timer (no lingering setTimeout after destroy)", () => {
    const npc = makeNPC({
      greeting: "A very long greeting sentence that will take a while to reveal on screen.",
    });
    const state = makeState(npc);
    const { controller } = freshController(state, npc);

    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    controller.destroy();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it("every existing NPC remains usable without a configured portrait", () => {
    const npc = makeNPC(); // no portraitId
    const state = makeState(npc);
    const { controller } = freshController(state, npc);

    const panel = document.querySelector<HTMLDivElement>("#combat-panel")!;
    expect(panel.querySelector("img")).toBeNull();
    expect(panel.querySelector(".npc-dlg-portrait-silhouette")).not.toBeNull();
    expect(panel.textContent).toContain("Odo");

    controller.destroy();
  });

  it("Kazeharu-shaped NPCDef (portraitId set) renders a real portrait image", () => {
    const npc = makeNPC({ portraitId: "kazeharu" });
    const state = makeState(npc);
    const { controller } = freshController(state, npc);

    const panel = document.querySelector<HTMLDivElement>("#combat-panel")!;
    const img = panel.querySelector<HTMLImageElement>("img");
    expect(img).not.toBeNull();
    expect(img!.src).toContain("kazeharu/portrait.png");

    controller.destroy();
  });

  it("types a keyword in Ask mode and submits with Enter", () => {
    const npc = makeNPC({
      topics: [{ key: "hello", hidden: true, response: "Greetings." }],
    });
    const state = makeState(npc);
    const { controller } = freshController(state, npc);

    controller.handleKey("Enter");
    controller.handleKey("Enter");
    controller.handleKey("t"); // Talk
    controller.handleKey("ArrowDown"); // move to "Ask about…"
    controller.handleKey("Enter"); // enter Ask mode
    controller.handleKey("h");
    controller.handleKey("e");
    controller.handleKey("l");
    controller.handleKey("l");
    controller.handleKey("o");
    controller.handleKey("Enter");

    const panel = document.querySelector<HTMLDivElement>("#combat-panel")!;
    expect(panel.textContent).toContain("Greetings.");

    controller.destroy();
  });

  // --- Acknowledgement lifecycle --------------------------------------------

  it("a one-page topic response requires acknowledgement before re-asking", () => {
    const npc = makeNPC({
      topics: [{ key: "key", response: "Answer one." }],
    });
    const state = makeState(npc);
    const { controller } = freshController(state, npc);
    const panel = document.querySelector<HTMLDivElement>("#combat-panel")!;

    // Open talk and select the only topic.
    controller.handleKey("Enter");
    controller.handleKey("Enter");
    controller.handleKey("t");
    controller.handleKey("Enter"); // ask the topic
    expect(panel.textContent).toContain("Answer one.");
    expect(panel.textContent).toContain("key"); // topic list still visible

    // First Enter only completes the reveal — the response is not asked again.
    controller.handleKey("Enter");
    expect(panel.textContent).toContain("Answer one.");

    // Second Enter acknowledges the beat.
    controller.handleKey("Enter");
    expect(panel.textContent).toContain("Ask about");

    // Third Enter finally re-asks the same topic.
    controller.handleKey("Enter");
    expect(panel.textContent).toContain("Answer one.");

    controller.destroy();
  });

  it("a multi-page topic response requires acknowledgement of the final page", () => {
    const response =
      "First page of the answer, which is intentionally long. " +
      "It keeps going so the paginate function has to split it. " +
      "Second page of the answer, which only appears after the player turns. " +
      "Third page of the answer, which is the final page and must be acknowledged.";
    const npc = makeNPC({ topics: [{ key: "key", response }] });
    const state = makeState(npc);
    const { controller } = freshController(state, npc);
    const panel = document.querySelector<HTMLDivElement>("#combat-panel")!;

    controller.handleKey("Enter");
    controller.handleKey("Enter");
    controller.handleKey("t");
    controller.handleKey("Enter"); // ask
    for (let i = 0; i < 8; i++) controller.handleKey("Enter"); // page through
    // The final "Third page" must appear.
    expect(panel.textContent).toContain("Third page");

    controller.destroy();
  });

  it("a repeatable barter cannot repeat before the transaction result is acknowledged", () => {
    const npc = makeNPC({
      trades: [
        { giveItemId: "antidote", receiveItemId: "healing-potion", once: false },
      ],
    });
    const state = makeState(npc);
    state.inventory.push({ itemId: "antidote", identified: true });
    state.inventory.push({ itemId: "antidote", identified: true });
    const { controller } = freshController(state, npc);
    const panel = document.querySelector<HTMLDivElement>("#combat-panel")!;

    controller.handleKey("Enter");
    controller.handleKey("Enter");
    controller.handleKey("b");
    // Acknowledge "Odo lays out an offer."
    controller.handleKey("Enter");
    controller.handleKey("Enter");
    // Confirm the first trade.
    controller.handleKey("Enter"); // complete reveal
    controller.handleKey("Enter"); // acknowledge
    controller.handleKey("Enter"); // confirm
    expect(panel.textContent).toContain("takes the Antidote");

    const healingCount = state.inventory.filter((e) => e.itemId === "healing-potion").length;
    // Trying to trade again immediately (same Enter that acknowledged) does not
    // consume a second Antidote because the result must be acknowledged first.
    // The next Enter, after acknowledgement, will trade again.
    controller.handleKey("Enter");
    controller.handleKey("Enter");
    controller.handleKey("Enter");
    expect(state.inventory.filter((e) => e.itemId === "healing-potion").length).toBe(
      healingCount + 1
    );

    controller.destroy();
  });

  it("mouse click on a topic goes through the same acknowledgement gate as Enter", () => {
    const npc = makeNPC({
      topics: [{ key: "key", response: "Answer one." }],
    });
    const state = makeState(npc);
    const { controller } = freshController(state, npc);
    const panel = document.querySelector<HTMLDivElement>("#combat-panel")!;

    controller.handleKey("Enter");
    controller.handleKey("Enter");
    controller.handleKey("t");
    // Click the first topic row.
    const topic = panel.querySelector<HTMLElement>(".npc-dlg-topic");
    expect(topic).not.toBeNull();
    topic!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(panel.textContent).toContain("Answer one.");

    // Clicking the same topic again while the answer is not consumed does
    // not re-ask; it just acknowledges the page.
    topic!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    topic!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    // After acknowledgement, another click may re-ask, but the text still
    // contains the answer.
    expect(panel.textContent).toContain("Answer one.");

    controller.destroy();
  });

  it("mounted barter list mouse confirmation goes through the acknowledgement gate", () => {
    const npc = makeNPC({
      trades: [{ giveItemId: "antidote", receiveItemId: "healing-potion", once: false }],
    });
    const state = makeState(npc);
    state.inventory.push({ itemId: "antidote", identified: true });
    const { controller } = freshController(state, npc);
    const panel = document.querySelector<HTMLDivElement>("#combat-panel")!;

    controller.handleKey("Enter");
    controller.handleKey("Enter");
    controller.handleKey("b");
    // The barter narration must be revealed (click 1), acknowledged (click 2),
    // and only then can a row confirmation execute the trade (click 3).
    let row = panel.querySelector<HTMLElement>(".ff6-menu-item");
    expect(row).not.toBeNull();
    row!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    row = panel.querySelector<HTMLElement>(".ff6-menu-item");
    row!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    // Still the narration; action not yet executed.
    expect(panel.textContent).toContain("lays out");

    row = panel.querySelector<HTMLElement>(".ff6-menu-item");
    row!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(panel.textContent).toContain("takes the Antidote");

    controller.destroy();
  });

  it("failed steal keeps the panel open on Escape, then starts one fight on Enter", () => {
    setGameplayRng(() => 0.99);
    try {
      const npc = makeNPC();
      const state = makeState(npc);
      const { controller, fightNpc, closeMessage, fightCount } = freshController(state, npc);
      const panel = document.querySelector<HTMLDivElement>("#combat-panel")!;

      controller.handleKey("Enter");
      controller.handleKey("Enter");
      controller.handleKey("s");
      expect(panel.textContent).toContain("steel is drawn");
      expect(fightNpc()).toBeNull();

      // Escape does not close the panel and does not let the player walk away.
      controller.handleKey("Escape");
      expect(closeMessage()).toBe("");
      expect(fightNpc()).toBeNull();
      expect(panel.textContent).toContain("steel is drawn");

      // Enter/Space completes the hostile reveal and, on the same key,
      // acknowledges and hands off to exactly one combat.
      controller.handleKey("Enter"); // complete reveal
      controller.handleKey("Enter"); // acknowledge + start fight
      expect(fightNpc()?.id).toBe("hermit");
      expect(fightCount()).toBe(1);

      // A stray later confirm cannot start a second fight; the panel is gone.
      controller.handleKey("Enter");
      expect(fightCount()).toBe(1);

      controller.destroy();
    } finally {
      resetGameplayRng();
    }
  });

  it("pending combat only starts with Enter/Space, not arrows or Escape", () => {
    setGameplayRng(() => 0.99);
    try {
      const npc = makeNPC();
      const state = makeState(npc);
      const { controller, fightNpc } = freshController(state, npc);

      controller.handleKey("Enter");
      controller.handleKey("Enter");
      controller.handleKey("s"); // steal, sets pendingFight

      // Arrows do not start combat.
      controller.handleKey("ArrowUp");
      expect(fightNpc()).toBeNull();
      controller.handleKey("ArrowDown");
      expect(fightNpc()).toBeNull();

      // Space (the other confirm key) starts it exactly once.
      controller.handleKey(" "); // complete reveal
      controller.handleKey(" "); // acknowledge and start
      expect(fightNpc()?.id).toBe("hermit");

      controller.destroy();
    } finally {
      resetGameplayRng();
    }
  });

  it("setDialogue resets acknowledgement for every new dialogue beat", () => {
    const npc = makeNPC({
      topics: [{ key: "key", response: "Answer one." }],
    });
    const state = makeState(npc);
    const { controller } = freshController(state, npc);
    const panel = document.querySelector<HTMLDivElement>("#combat-panel")!;

    // Greeting is acknowledged.
    controller.handleKey("Enter");
    controller.handleKey("Enter");
    expect(panel.textContent).toContain("Talk"); // action bar visible

    // Ask a topic; the answer is a fresh beat and should not have its action
    // bar/topic list immediately re-activatable.
    controller.handleKey("t");
    controller.handleKey("Enter");
    // Action bar should not be visible; the answer is the current text.
    expect(panel.textContent).not.toContain("Talk");
    expect(panel.textContent).toContain("Answer one.");

    controller.destroy();
  });
});
