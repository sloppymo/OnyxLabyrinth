/**
 * Tests for the FF6 combat windows DOM renderer.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  renderCombatWindows,
  menuEntriesForCharacter,
  type CombatWindowsView,
  type CombatWindowsHandlers,
} from "./combat-select-action-view";
import { createCombatState, type CombatState, type EnemyInstance } from "../game/combat";
import { createCharacter, type Character } from "../game/party";
import type { EnemyDef } from "../data/enemies";

function makeEnemy(instanceId: string, name = "Test Rat"): EnemyInstance {
  const def = {
    id: "test-rat",
    name,
    hp: 10,
    attack: 4,
    ac: 0,
    agi: 5,
    xp: 3,
    gold: 2,
    rowPreference: "front",
    special: [],
    isBoss: false,
  } as EnemyDef;
  return { ...def, instanceId, currentHp: def.hp, row: "front", status: [] };
}

function makeState(enemies: EnemyInstance[]): CombatState {
  const party = [
    createCharacter("c0", "Alice", "Human", "Neutral", "Fighter", 0),
    createCharacter("c1", "Bob", "Human", "Neutral", "Thief", 1),
  ];
  return createCombatState(party, { front: enemies, back: [] }, false);
}

function noopHandlers(): CombatWindowsHandlers {
  return {
    onMenuHover: () => {},
    onMenuConfirm: () => {},
    onSelectionHover: () => {},
    onSelectionConfirm: () => {},
  };
}

function baseView(state: CombatState): CombatWindowsView {
  return {
    state,
    currentCharacterId: "c0",
    menuMode: "menu",
    menuEntries: menuEntriesForCharacter(state.party[0]),
    menuIndex: 0,
    selectionTitle: "",
    selectionEntries: [],
    selectionIndex: 0,
    flash: null,
    result: null,
  };
}

describe("menuEntriesForCharacter", () => {
  it("gives base FF6 actions to a Fighter", () => {
    const c = createCharacter("x", "X", "Human", "Neutral", "Fighter", 0);
    const kinds = menuEntriesForCharacter(c).map((e) => e.kind);
    expect(kinds).toEqual(["attack", "cast", "defend", "item", "flee"]);
  });

  it("adds Hide for a Thief, Ambush once hidden", () => {
    const c = createCharacter("x", "X", "Human", "Neutral", "Thief", 0);
    expect(menuEntriesForCharacter(c).map((e) => e.kind)).toContain("hide");
    c.status.push("hidden");
    const kinds = menuEntriesForCharacter(c).map((e) => e.kind);
    expect(kinds).toContain("ambush");
    expect(kinds).not.toContain("hide");
  });
});

describe("renderCombatWindows", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  it("renders the three FF6 windows", () => {
    const state = makeState([makeEnemy("rat-0")]);
    renderCombatWindows(container, baseView(state), noopHandlers());
    expect(container.querySelector(".ff6-menu")).not.toBeNull();
    expect(container.querySelector(".ff6-enemies")).not.toBeNull();
    expect(container.querySelector(".ff6-party")).not.toBeNull();
  });

  it("marks the selected menu row and highlights the current actor", () => {
    const state = makeState([makeEnemy("rat-0")]);
    const view = baseView(state);
    view.menuIndex = 1;
    renderCombatWindows(container, view, noopHandlers());
    const items = container.querySelectorAll(".ff6-menu .ff6-menu-item");
    expect(items[1].classList.contains("selected")).toBe(true);
    const current = container.querySelector(".ff6-party-row.current .ff6-p-name");
    expect(current?.textContent).toBe("Alice");
  });

  it("groups duplicate enemies with a count", () => {
    const state = makeState([
      makeEnemy("rat-0"),
      makeEnemy("rat-1"),
      makeEnemy("rat-2"),
    ]);
    renderCombatWindows(container, baseView(state), noopHandlers());
    const rows = container.querySelectorAll(".ff6-enemy-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Test Rat");
    expect(rows[0].textContent).toContain("×3");
  });

  it("omits dead enemies from the enemy window", () => {
    const dead = makeEnemy("rat-1");
    dead.currentHp = 0;
    const state = makeState([makeEnemy("rat-0"), dead]);
    renderCombatWindows(container, baseView(state), noopHandlers());
    expect(container.querySelectorAll(".ff6-enemy-row")).toHaveLength(1);
  });

  it("renders a selection list with details when menuMode is selection", () => {
    const state = makeState([makeEnemy("rat-0")]);
    const view = baseView(state);
    view.menuMode = "selection";
    view.selectionTitle = "Magic";
    view.selectionEntries = [
      { label: "Halito", detail: "3 SP" },
      { label: "Dios", detail: "4 SP", disabled: true },
    ];
    view.selectionIndex = 0;
    renderCombatWindows(container, view, noopHandlers());
    expect(container.querySelector(".ff6-menu-title")?.textContent).toBe("Magic");
    const rows = container.querySelectorAll(".ff6-menu .ff6-menu-item");
    expect(rows).toHaveLength(2);
    expect(rows[0].classList.contains("selected")).toBe(true);
    expect(rows[1].classList.contains("disabled")).toBe(true);
    expect(rows[1].textContent).toContain("4 SP");
  });

  it("clicking a menu row fires onMenuConfirm with its index", () => {
    const state = makeState([makeEnemy("rat-0")]);
    let confirmed = -1;
    const handlers = noopHandlers();
    handlers.onMenuConfirm = (i) => {
      confirmed = i;
    };
    renderCombatWindows(container, baseView(state), handlers);
    const rows = container.querySelectorAll<HTMLElement>(".ff6-menu .ff6-menu-item");
    rows[2].click();
    expect(confirmed).toBe(2);
  });

  it("shows KO styling for downed party members", () => {
    const state = makeState([makeEnemy("rat-0")]);
    state.party[1].hp = 0;
    (state.party[1] as Character).status.push("knockedOut");
    renderCombatWindows(container, baseView(state), noopHandlers());
    const rows = container.querySelectorAll(".ff6-party-row");
    expect(rows[1].classList.contains("ko")).toBe(true);
  });

  it("lists living summoned allies in the enemy window with HP", () => {
    const state = makeState([makeEnemy("rat-0")]);
    state.summonedAllies.push(
      { id: "s1", name: "Summoned Beast", hp: 12, maxHp: 18, attack: 5, ac: 1, agi: 50, row: "front" },
      { id: "s2", name: "Summoned Beast", hp: 0, maxHp: 18, attack: 5, ac: 1, agi: 50, row: "front" }
    );
    renderCombatWindows(container, baseView(state), noopHandlers());
    const rows = container.querySelectorAll(".ff6-enemy-row.summon");
    expect(rows).toHaveLength(1); // dead summon omitted
    expect(rows[0].textContent).toContain("Summoned Beast");
    expect(rows[0].textContent).toContain("12/18");
  });

  it("appends compact summoned ally rows to the party window", () => {
    const state = makeState([makeEnemy("rat-0")]);
    state.summonedAllies.push({
      id: "s1",
      name: "Summoned Elemental",
      hp: 4,
      maxHp: 18,
      attack: 5,
      ac: 1,
      agi: 50,
      row: "front",
    });
    renderCombatWindows(container, baseView(state), noopHandlers());
    const rows = container.querySelectorAll(".ff6-party .ff6-party-row");
    expect(rows).toHaveLength(3); // 2 party + 1 summon
    const summonRow = container.querySelector(".ff6-party-row.summon");
    expect(summonRow?.textContent).toContain("Summoned Elemental");
    expect(summonRow?.textContent).toContain("4/18");
    expect(summonRow?.querySelector(".ff6-p-bar-fill.critical")).not.toBeNull();
  });

  it("renders the result window when set", () => {
    const state = makeState([makeEnemy("rat-0")]);
    const view = baseView(state);
    view.result = { title: "Victory!", lines: ["Got 12 gold", "30 XP each"] };
    renderCombatWindows(container, view, noopHandlers());
    expect(container.querySelector(".ff6-result-title")?.textContent).toBe("Victory!");
    expect(container.querySelectorAll(".ff6-result-line")).toHaveLength(2);
  });
});
