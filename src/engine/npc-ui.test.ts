/**
 * Tests for the dungeon NPC interaction overlay.
 *
 * These catch input-routing regressions in the "borrowed title mode" overlay,
 * where multiple listeners (save menu, spell menu, NPC panel, perk overlay)
 * guard on their own controller instance.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { createDefaultParty } from "../game/party";
import { defaultLoadoutForCharacter } from "../game/combat";
import type { GameState } from "../types";
import type { NPCDef } from "../data/floors";

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
    combatEnemyIds: ["samurai"],
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
    lastDungeon: null,
  };
}

describe("NPCController", () => {
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
