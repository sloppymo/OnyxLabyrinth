import { describe, it, expect, vi } from "vitest";
import {
  effectiveAc,
  renderSelectActionPhase,
  ACTION_KINDS,
  type SelectActionView,
  type SelectActionHandlers,
} from "./combat-select-action-view";
import {
  createCombatState,
  type Loadout,
  type EnemyInstance,
  type EnemyFormation,
} from "../game/combat";
import { createDefaultParty } from "../game/party";
import { ITEMS_BY_ID } from "../data/items";
import { COMBAT_LOG_HISTORY } from "./combat-display";

// --- Test helpers -----------------------------------------------------------

function makeEnemy(id: string, name: string, hp: number): EnemyInstance {
  return {
    id,
    name,
    floors: [1],
    rowPreference: "front",
    hp,
    attack: 10,
    ac: 2,
    agi: 10,
    xp: 5,
    gold: 3,
    special: [],
    isBoss: false,
    instanceId: id,
    currentHp: hp,
    row: "front",
    status: [],
  };
}

function makeState(
  enemies: EnemyFormation = { front: [], back: [] },
  loadout: Record<string, Loadout> = {}
) {
  const party = createDefaultParty();
  const state = createCombatState(
    party,
    enemies,
    false,
    {},
    {},
    loadout
  );
  return state;
}

function render(view: Partial<SelectActionView> = {}, handlers?: Partial<SelectActionHandlers>) {
  const container = document.createElement("div");
  const state = makeState({ front: [makeEnemy("e1", "Rat", 10)], back: [] });
  state.round = 2;
  state.log = ["Round 1", "Rat bites Alice"];
  const fullView: SelectActionView = {
    state,
    currentCharacter: state.party[0],
    selectedIndex: 0,
    phase: "selectAction",
    prompt: "",
    selectionList: null,
    flash: null,
    ...view,
  };
  const fullHandlers: SelectActionHandlers = {
    onSelectIndex: vi.fn(),
    onConfirm: vi.fn(),
    onSelectChoice: vi.fn(),
    ...handlers,
  };
  renderSelectActionPhase(container, fullView, fullHandlers);
  return { container, state, handlers: fullHandlers };
}

describe("effectiveAc", () => {
  it("is 10 for a character with no armor and no buffs", () => {
    const state = makeState();
    const c = state.party[0];
    expect(effectiveAc(state, c)).toBe(10);
  });

  it("reflects equipped armor's defenseBonus", () => {
    const c = createDefaultParty()[0];
    const leather = ITEMS_BY_ID["leather"];
    expect(leather?.defenseBonus).toBeGreaterThan(0);
    const loadout: Record<string, Loadout> = {
      [c.id]: { armor: [leather!] },
    };
    const state = makeState({ front: [], back: [] }, loadout);
    // Overwrite party with our character so ids line up.
    state.party[0] = c;
    expect(effectiveAc(state, c)).toBe(10 - leather!.defenseBonus!);
  });

  it("sums multiple equipped armor pieces", () => {
    const c = createDefaultParty()[0];
    const leather = ITEMS_BY_ID["leather"]!;
    const loadout: Record<string, Loadout> = {
      [c.id]: { armor: [leather, leather] },
    };
    const state = makeState({ front: [], back: [] }, loadout);
    state.party[0] = c;
    expect(effectiveAc(state, c)).toBe(10 - leather.defenseBonus! * 2);
  });

  it("includes persistent spell armor buffs", () => {
    const c = createDefaultParty()[0];
    const state = makeState();
    state.party[0] = c;
    state.armorBuffs[c.id] = 3;
    expect(effectiveAc(state, c)).toBe(7);
  });

  it("combines equipped armor and spell buffs", () => {
    const c = createDefaultParty()[0];
    const leather = ITEMS_BY_ID["leather"]!;
    const loadout: Record<string, Loadout> = {
      [c.id]: { armor: [leather] },
    };
    const state = makeState({ front: [], back: [] }, loadout);
    state.party[0] = c;
    state.armorBuffs[c.id] = 3;
    expect(effectiveAc(state, c)).toBe(10 - leather.defenseBonus! - 3);
  });

  it("treats a character with no loadout entry as unarmored", () => {
    const c = createDefaultParty()[0];
    const state = makeState({ front: [], back: [] }, {});
    state.party[0] = c;
    expect(effectiveAc(state, c)).toBe(10);
  });
});

describe("renderSelectActionPhase", () => {
  it("renders the status bar with enemy count and round", () => {
    const state = makeState({ front: [makeEnemy("e1", "Rat", 10)], back: [] });
    state.round = 3;
    const { container } = render({ state });
    const left = container.querySelector(".combat-status-left");
    const right = container.querySelector(".combat-status-right");
    expect(left?.textContent).toBe("1 Rat");
    expect(right?.textContent).toBe("Round 3");
  });

  it("shows 'No enemies' and the round when no enemies remain", () => {
    const state = makeState();
    state.round = 5;
    const { container } = render({ state });
    const left = container.querySelector(".combat-status-left");
    const right = container.querySelector(".combat-status-right");
    expect(left?.textContent).toBe("No enemies");
    expect(right?.textContent).toBe("Round 5");
  });

  it("renders the last log entries up to COMBAT_LOG_HISTORY", () => {
    const state = makeState();
    state.log = Array.from({ length: 12 }, (_, i) => `Line ${i + 1}`);
    const { container } = render({ state });
    const lines = container.querySelectorAll(".combat-message-log .log-line");
    expect(lines.length).toBe(COMBAT_LOG_HISTORY);
    expect(lines[0]?.textContent).toBe("Line 5");
    expect(lines[lines.length - 1]?.textContent).toBe("Line 12");
  });

  it("renders the prompt and selection list in the message log", () => {
    const { container } = render({
      phase: "selectEnemyTarget",
      prompt: "Select target:",
      selectionList: [
        { index: 1, label: "1.Rat Unwounded" },
        { index: 2, label: "2.Goblin Wounded" },
      ],
    });
    const prompt = container.querySelector(".combat-message-log .log-line.prompt");
    expect(prompt?.textContent).toBe("Select target:");
    const items = container.querySelectorAll(".combat-message-log .selection-item");
    expect(items.length).toBe(2);
    expect(items[0]?.textContent).toBe("1.Rat Unwounded");
    expect(items[1]?.textContent).toBe("2.Goblin Wounded");
  });

  it("renders the action menu with all action kinds", () => {
    const { container } = render({ phase: "selectAction", selectedIndex: 1 });
    const items = container.querySelectorAll(".combat-action-item");
    // Action kinds are now dynamic based on character class, so just check that it renders
    expect(items.length).toBeGreaterThan(0);
    expect(items[1]?.classList.contains("selected")).toBe(true);
    const labels = Array.from(items).map((el) => el.querySelector(".combat-action-label")?.textContent);
    // Default character (Fighter) should have 5 actions: Attack, Cast, Defend, Item, Flee
    expect(labels).toContain("Attack");
    expect(labels).toContain("Cast");
    expect(labels).toContain("Defend");
    expect(labels).toContain("Item");
    expect(labels).toContain("Flee");
  });

  it("calls onSelectIndex and onConfirm when an action is clicked", () => {
    const { container, handlers } = render({ phase: "selectAction" });
    const items = container.querySelectorAll(".combat-action-item");
    items[2]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(handlers.onSelectIndex).toHaveBeenCalledWith(2);
    expect(handlers.onConfirm).toHaveBeenCalledWith("defend");
  });

  it("renders a selection menu and calls onSelectChoice on click", () => {
    const { container, handlers } = render({
      phase: "selectSpell",
      selectionList: [
        { index: 1, label: "1.Fire(3SP)" },
        { index: 2, label: "2.Heal(5SP)" },
      ],
    });
    const items = container.querySelectorAll(".combat-action-item");
    expect(items.length).toBe(2);
    items[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(handlers.onSelectChoice).toHaveBeenCalledWith(2);
  });

  it("renders the party strip with current/fallen states", () => {
    const state = makeState({ front: [makeEnemy("e1", "Rat", 10)], back: [] });
    state.party[1].hp = 0;
    state.party[1].status.push("knockedOut");
    const { container } = render({ state });
    const members = container.querySelectorAll(".combat-party-member");
    expect(members.length).toBe(state.party.length);
    expect(members[0]?.classList.contains("current")).toBe(true);
    expect(members[1]?.classList.contains("fallen")).toBe(true);
  });

  it("shows the action-selection hint only in selectAction phase", () => {
    const { container } = render({ phase: "selectAction" });
    const hint = container.querySelector(".combat-hint");
    expect(hint?.textContent).toContain("▲▼ choose");
    expect(hint?.textContent).toContain("click to select");
  });

  it("shows the number-key hint for list phases", () => {
    const { container } = render({ phase: "selectEnemyTarget" });
    const hint = container.querySelector(".combat-hint");
    expect(hint?.textContent).toContain("[1-9] choose");
  });

  it("shows the resolve hint in ready phase", () => {
    const { container } = render({ phase: "ready" });
    const hint = container.querySelector(".combat-hint");
    expect(hint?.textContent).toContain("Space/Enter to resolve round");
  });

  it("hides the actor header in ready phase", () => {
    const { container } = render({ phase: "ready" });
    const actorName = container.querySelector(".actor-name");
    expect(actorName).toBeNull();
  });

  it("keeps labels with internal spaces intact in selection lists", () => {
    const { container } = render({
      phase: "selectEnemyTarget",
      selectionList: [{ index: 1, label: "1.Big  Titty  Ogre  Unwounded" }],
    });
    const item = container.querySelector(".combat-message-log .selection-item");
    const menuItem = container.querySelector(".combat-action-item");
    expect(item?.textContent).toBe("1.Big  Titty  Ogre  Unwounded");
    expect(menuItem?.textContent).toBe("1.Big  Titty  Ogre  Unwounded");
  });
});
