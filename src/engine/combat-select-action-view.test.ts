/**
 * Tests for the FF6 combat windows DOM renderer.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  renderCombatWindows,
  menuEntriesForCharacter,
  menuHintText,
  type CombatWindowsView,
  type CombatWindowsHandlers,
} from "./combat-select-action-view";
import { buildPalette } from "./combat-action-palette";
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
    onPaletteConfirm: () => {},
    onSelectionHover: () => {},
    onSelectionConfirm: () => {},
  };
}

function baseView(state: CombatState): CombatWindowsView {
  return {
    state,
    currentCharacterId: "c0",
    menuMode: "palette",
    palette: null,
    menuEntries: [],
    menuIndex: 0,
    selectionTitle: "",
    selectionEntries: [],
    selectionIndex: 0,
    flash: null,
    result: null,
  };
}

describe("menuEntriesForCharacter", () => {
  it("gives base FF6 actions + Technique to a Fighter", () => {
    const c = createCharacter("x", "X", "Human", "Neutral", "Fighter", 0);
    const kinds = menuEntriesForCharacter(c).map((e) => e.kind);
    expect(kinds).toEqual(["attack", "technique", "cast", "defend", "item", "flee"]);
  });

  it("adds Technique for Thief alongside Hide/Ambush", () => {
    const c = createCharacter("x", "X", "Human", "Neutral", "Thief", 0);
    const kinds = menuEntriesForCharacter(c).map((e) => e.kind);
    expect(kinds).toContain("technique");
    expect(kinds).toContain("hide");
    c.status.push("hidden");
    const kindsHidden = menuEntriesForCharacter(c).map((e) => e.kind);
    expect(kindsHidden).toContain("ambush");
    expect(kindsHidden).not.toContain("hide");
  });

  it("does not give Technique to Mage or Priest", () => {
    const mage = createCharacter("m", "M", "Elf", "Neutral", "Mage", 0);
    expect(menuEntriesForCharacter(mage).map((e) => e.kind)).not.toContain("technique");
    const priest = createCharacter("p", "P", "Gnome", "Good", "Priest", 0);
    expect(menuEntriesForCharacter(priest).map((e) => e.kind)).not.toContain("technique");
  });

  it("gives Crusader both Technique and Magic", () => {
    const c = createCharacter("c", "C", "Human", "Good", "Crusader", 0);
    const kinds = menuEntriesForCharacter(c).map((e) => e.kind);
    expect(kinds).toContain("technique");
    expect(kinds).toContain("cast");
  });

  it("inserts Repeat after Attack when requested", () => {
    const c = createCharacter("x", "X", "Human", "Neutral", "Fighter", 0);
    const kinds = menuEntriesForCharacter(c, true).map((e) => e.kind);
    expect(kinds[0]).toBe("attack");
    expect(kinds[1]).toBe("repeat");
    expect(menuHintText(menuEntriesForCharacter(c, true))).toContain("Z");
  });
});

describe("menuHintText", () => {
  it("includes T for technique users", () => {
    const c = createCharacter("x", "X", "Human", "Neutral", "Fighter", 0);
    expect(menuHintText(menuEntriesForCharacter(c))).toBe("↑↓ Enter · A/T/M/D/I/R");
  });

  it("omits T for pure casters", () => {
    const c = createCharacter("m", "M", "Elf", "Neutral", "Mage", 0);
    expect(menuHintText(menuEntriesForCharacter(c))).toBe("↑↓ Enter · A/M/D/I/R");
  });

  it("includes H for an unhidden Thief", () => {
    const c = createCharacter("t", "T", "Human", "Neutral", "Thief", 0);
    expect(menuHintText(menuEntriesForCharacter(c))).toContain("/H/");
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
    view.menuMode = "menu";
    view.menuEntries = menuEntriesForCharacter(state.party[0]);
    view.menuIndex = 1;
    renderCombatWindows(container, view, noopHandlers());
    const items = container.querySelectorAll(".ff6-menu .ff6-menu-item");
    expect(items[1].classList.contains("selected")).toBe(true);
    const current = container.querySelector(
      ".ff6-party-row.current .ff6-p-name-text"
    );
    expect(current?.textContent).toBe("Alice");
    // Acting uses an inverted plate — ▶ is menu-selection only.
    expect(container.querySelector(".ff6-party")?.textContent).not.toContain("▶");
  });

  it("renders the controller palette with four face slots", () => {
    const state = makeState([makeEnemy("rat-0")]);
    const fighter = state.party[0];
    const view = baseView(state);
    view.menuMode = "palette";
    view.palette = buildPalette(fighter, [], []);
    renderCombatWindows(container, view, noopHandlers());
    expect(container.querySelectorAll(".ff6-palette-slot")).toHaveLength(4);
    expect(container.textContent).toContain("Atk");
    expect(container.textContent).toContain("Magic");
    const disabled = container.querySelector(".ff6-palette-slot.disabled");
    expect(disabled?.textContent).toContain("Magic");
  });

  it("highlights an inspected party member in the roster", () => {
    const state = makeState([makeEnemy("rat-0")]);
    const view = baseView(state);
    view.currentCharacterId = "c0";
    view.inspectCharacterId = "c1";
    renderCombatWindows(container, view, noopHandlers());
    expect(container.querySelector(".ff6-party-row.inspect")).not.toBeNull();
    expect(container.querySelector(".ff6-party-inspect")?.textContent).toContain("Bob");
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
      { label: "Fire Bolt", detail: "3 SP" },
      { label: "Cure Wounds", detail: "4 SP", disabled: true },
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

  it("renders every row of a long (L9+) spell list and shows a position counter", () => {
    const state = makeState([makeEnemy("rat-0")]);
    const view = baseView(state);
    view.menuMode = "selection";
    view.selectionTitle = "Magic";
    view.selectionEntries = Array.from({ length: 29 }, (_, i) => ({
      label: `Spell ${i + 1}`,
      detail: `${i + 1} SP`,
    }));
    view.selectionIndex = 12;
    renderCombatWindows(container, view, noopHandlers());
    const rows = container.querySelectorAll(".ff6-selection-list .ff6-menu-item");
    expect(rows).toHaveLength(29);
    expect(rows[12].classList.contains("selected")).toBe(true);
    // Counter tells the player where the cursor is in the scrolling list.
    expect(container.querySelector(".ff6-menu-title")?.textContent).toBe("Magic 13/29");
  });

  it("keeps a plain title for short selection lists", () => {
    const state = makeState([makeEnemy("rat-0")]);
    const view = baseView(state);
    view.menuMode = "selection";
    view.selectionTitle = "Target";
    view.selectionEntries = [{ label: "Rat A" }, { label: "Rat B" }];
    view.selectionIndex = 0;
    renderCombatWindows(container, view, noopHandlers());
    expect(container.querySelector(".ff6-menu-title")?.textContent).toBe("Target");
  });

  it("uses the derived hint row for the action menu", () => {
    const state = makeState([makeEnemy("rat-0")]);
    const view = baseView(state);
    view.menuMode = "menu";
    view.menuEntries = menuEntriesForCharacter(state.party[0]);
    renderCombatWindows(container, view, noopHandlers());
    expect(container.querySelector(".ff6-hint-row")?.textContent).toBe(
      "↑↓ Enter · A/T/M/D/I/R"
    );
  });

  it("clicking a menu row fires onMenuConfirm with its index", () => {
    const state = makeState([makeEnemy("rat-0")]);
    let confirmed = -1;
    const handlers = noopHandlers();
    handlers.onMenuConfirm = (i) => {
      confirmed = i;
    };
    const view = baseView(state);
    view.menuMode = "menu";
    view.menuEntries = menuEntriesForCharacter(state.party[0]);
    renderCombatWindows(container, view, handlers);
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
    expect(summonRow?.querySelector(".ff6-p-res.none")?.textContent).toBe("—");
  });

  it("formats the party resource column as SP/RG cur/max with a positional dash", () => {
    const party = [
      createCharacter("c0", "Alice", "Human", "Neutral", "Fighter", 0),
      createCharacter("c1", "Bob", "Human", "Neutral", "Mage", 1),
    ];
    const state = createCombatState(party, { front: [makeEnemy("rat-0")], back: [] }, false);
    state.rage[party[0].id] = 3;
    renderCombatWindows(container, baseView(state), noopHandlers());
    const rows = container.querySelectorAll(".ff6-party-row");
    expect(rows[0].querySelector(".ff6-p-res.rg")?.textContent).toMatch(
      /^RG \d+\/\d+$/
    );
    expect(rows[1].querySelector(".ff6-p-res.sp")?.textContent).toBe(
      `SP ${party[1].sp}/${party[1].maxSp}`
    );
    // Exactly one resource cell per row — no orphan SP/Rage pair.
    expect(rows[0].querySelectorAll(".ff6-p-res")).toHaveLength(1);
    expect(rows[1].querySelectorAll(".ff6-p-res")).toHaveLength(1);
  });

  it("keeps a ≥1px HP bar fill whenever the character is alive", () => {
    const state = makeState([makeEnemy("rat-0")]);
    state.party[0].hp = 1;
    state.party[0].maxHp = 200;
    renderCombatWindows(container, baseView(state), noopHandlers());
    const fill = container.querySelector(
      ".ff6-party-row.current .ff6-p-bar-fill"
    ) as HTMLElement | null;
    expect(fill).not.toBeNull();
    expect(fill!.classList.contains("critical")).toBe(true);
    expect(fill!.classList.contains("empty")).toBe(false);
    expect(parseInt(fill!.style.width, 10)).toBeGreaterThanOrEqual(1);
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
