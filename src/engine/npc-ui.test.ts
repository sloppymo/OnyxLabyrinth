/**
 * Tests for the dungeon NPC interaction overlay.
 *
 * These catch input-routing regressions in the "borrowed title mode" overlay,
 * where multiple listeners (save menu, spell menu, NPC panel, perk overlay)
 * guard on their own controller instance.
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
    const controller = new NPCControllerCtor({
      panel: document.querySelector<HTMLDivElement>("#combat-panel")!,
      state,
      npc,
      onClose: (message: string) => {
        closeMessage = message;
      },
      onFight: (n: NPCDef) => {
        fightNpc = n;
      },
    });
    return { controller, closeMessage: () => closeMessage, fightNpc: () => fightNpc };
  }

  it("renders the root menu and greeting", () => {
    const npc = makeNPC();
    const state = makeState(npc);
    const { controller } = freshController(state, npc);

    const panel = document.querySelector<HTMLDivElement>("#combat-panel")!;
    expect(panel.textContent).toContain("Odo");
    expect(panel.textContent).toContain("A visitor!");
    expect(panel.textContent).toContain("Talk");
    expect(panel.textContent).toContain("Attack");

    controller.destroy();
  });

  it("opens the Talk phase with the 't' hotkey", () => {
    const npc = makeNPC();
    const state = makeState(npc);
    const { controller } = freshController(state, npc);

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

    controller.handleKey("b");

    const panel = document.querySelector<HTMLDivElement>("#combat-panel")!;
    expect(panel.textContent).toContain("Your Antidote for Robe +2");

    controller.destroy();
  });

  it("leaves with the 'l' hotkey", () => {
    const npc = makeNPC();
    const state = makeState(npc);
    const { controller, closeMessage } = freshController(state, npc);

    controller.handleKey("l");

    expect(closeMessage()).toBe("You step away.");

    controller.destroy();
  });

  it("starts a fight with the 'a' hotkey", () => {
    const npc = makeNPC();
    const state = makeState(npc);
    const { controller, fightNpc } = freshController(state, npc);

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

    controller.handleKey("b");
    controller.handleKey("Enter");

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

    controller.handleKey("b"); // Browse
    controller.handleKey("Enter"); // Inspect Isovoid
    controller.handleKey("ArrowDown"); // Must not change the confirmation target
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
    expect(text).toContain("Browse Iso-Spells");
    expect(text).not.toContain("Attack");
    expect(text).not.toContain("Steal");
    expect(text).not.toContain("Barter");
    expect(text).not.toContain("Give");
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

  it("types a keyword in Ask mode and submits with Enter", () => {
    const npc = makeNPC({
      topics: [{ key: "hello", hidden: true, response: "Greetings." }],
    });
    const state = makeState(npc);
    const { controller } = freshController(state, npc);

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
});
