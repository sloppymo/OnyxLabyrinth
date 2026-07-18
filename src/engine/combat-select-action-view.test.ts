/**
 * Tests for the FF6 combat windows DOM renderer.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  renderCombatWindows,
  menuEntriesForCharacter,
  menuHintText,
  joinHintParts,
  playbackHintText,
  paletteHintText,
  type CombatWindowsView,
  type CombatWindowsHandlers,
} from "./combat-select-action-view";
import { buildPalette } from "./combat-action-palette";
import { createCombatState, type CombatState, type EnemyInstance } from "../game/combat";
import { createCharacter, type Character } from "../game/party";
import type { EnemyDef } from "../data/enemies";
import { MAGE_SPELLS } from "../data/spells";

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
    expect(kinds).toEqual(["attack", "technique", "cast", "defend", "item", "analyze", "move", "flee"]);
  });

  it("gives every class Analyze", () => {
    const mage = createCharacter("m", "M", "Elf", "Neutral", "Mage", 0);
    expect(menuEntriesForCharacter(mage).map((e) => e.kind)).toContain("analyze");
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
    expect(menuHintText(menuEntriesForCharacter(c))).toBe("Enter · A/T/M/D/I/N/V/R · ↑↓");
  });

  it("omits T for pure casters", () => {
    const c = createCharacter("m", "M", "Elf", "Neutral", "Mage", 0);
    expect(menuHintText(menuEntriesForCharacter(c))).toBe("Enter · A/M/D/I/N/V/R · ↑↓");
  });

  it("includes H for an unhidden Thief", () => {
    const c = createCharacter("t", "T", "Human", "Neutral", "Thief", 0);
    expect(menuHintText(menuEntriesForCharacter(c))).toContain("/H/");
  });
});

describe("joinHintParts / playbackHintText", () => {
  it("drops whole trailing segments instead of mid-word clipping", () => {
    expect(joinHintParts(["A", "B", "CDEFGHIJKLMNOP"], 12)).toBe("A · B");
    expect(playbackHintText("keyboard")).not.toMatch(/\w…$/);
    expect(playbackHintText("keyboard")).not.toMatch(/Esc:$/);
    expect(playbackHintText("keyboard").length).toBeLessThanOrEqual(24);
    expect(playbackHintText("gamepad").length).toBeLessThanOrEqual(24);
    const paletteHint = paletteHintText({ slots: [] } as never, false);
    expect(paletteHint).not.toContain("A:Atk");
    expect(paletteHint.length).toBeLessThanOrEqual(24);
    expect(paletteHint === "Sel:Item" || /(?:Run|Auto|Item)$/.test(paletteHint)).toBe(
      true
    );
  });

  it("registers every footer producer through FOOTER_HINT_PRODUCERS", async () => {
    const { FOOTER_HINT_PRODUCERS } = await import("./combat-select-action-view");
    expect(Object.keys(FOOTER_HINT_PRODUCERS).sort()).toEqual(
      ["menu", "palette", "playback"].sort()
    );
    for (const [id, fn] of Object.entries(FOOTER_HINT_PRODUCERS)) {
      expect(typeof fn).toBe("function");
      expect(id.length).toBeGreaterThan(0);
    }
  });

  it("drops least-important (tail) segments first", () => {
    expect(joinHintParts(["A:confirm", "B:back", "↑↓"], 20)).toBe("A:confirm · B:back");
    expect(playbackHintText("keyboard")).toMatch(/Shift:2×/);
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
    expect(container.querySelector(".ff6-command-popup")).not.toBeNull();
    expect(container.querySelector(".ff6-battle-enemies")).not.toBeNull();
    expect(container.querySelector(".ff6-party")).not.toBeNull();
  });

  it("marks the selected menu row and highlights the current actor", () => {
    const state = makeState([makeEnemy("rat-0")]);
    const view = baseView(state);
    view.menuMode = "menu";
    view.menuEntries = menuEntriesForCharacter(state.party[0]);
    view.menuIndex = 1;
    renderCombatWindows(container, view, noopHandlers());
    const items = container.querySelectorAll(".ff6-command-popup .ff6-menu-item");
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
    view.menuResourceLine = "RG 3/12";
    renderCombatWindows(container, view, noopHandlers());
    expect(container.querySelectorAll(".ff6-palette-slot")).toHaveLength(4);
    expect(container.textContent).toContain("Atk");
    expect(container.textContent).toContain("Magic");
    expect(container.textContent).toContain("Tech");
    expect(container.textContent).not.toContain("Skl");
    // Resource belongs in the popup header only — not duplicated under slots.
    expect(container.querySelector(".ff6-resource-row")).toBeNull();
    expect(container.querySelector(".ff6-popup-header")?.textContent).toContain("RG 3/12");
    const disabled = container.querySelector(".ff6-palette-slot.disabled");
    expect(disabled?.textContent).toContain("Magic");
  });

  it("puts full spell description on title when the detail pane clamps", () => {
    const state = makeState([makeEnemy("rat-0")]);
    const spell = MAGE_SPELLS.find((s) => s.id === "mage-arcane-ward")!;
    const view = baseView(state);
    view.menuMode = "selection";
    view.selectionTitle = "Magic";
    view.selectionEntries = [{ label: spell.name, detail: `${spell.spCost} SP` }];
    view.spellDetail = spell;
    renderCombatWindows(container, view, noopHandlers());
    const desc = container.querySelector(".ff6-spell-detail-desc") as HTMLElement;
    expect(desc?.title).toBe(spell.description);
    expect(container.querySelector(".ff6-hint-row")?.textContent).toBe(
      "A:confirm · B:back · ↑↓"
    );
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

  it("shows a charging tag for winding-up enemies", () => {
    const state = makeState([makeEnemy("rat-0")]);
    state.windUps["rat-0"] = { abilityId: "hellfire", name: "Hellfire", targetId: null };
    renderCombatWindows(container, baseView(state), noopHandlers());
    const row = container.querySelector(".ff6-enemy-row");
    expect(row?.textContent).toContain("Hellfire");
  });

  it("shows discovered affinity tags on the enemy row", () => {
    const state = makeState([makeEnemy("rat-0")]);
    state.observedAffinity["Test Rat"] = { weak: ["fire"], resist: ["water"] };
    renderCombatWindows(container, baseView(state), noopHandlers());
    const row = container.querySelector(".ff6-enemy-row");
    expect(row?.textContent).toContain("WK fire");
    expect(row?.textContent).toContain("RES water");
  });

  it("shows trait tags only for analyzed species", () => {
    const enemy = makeEnemy("rat-0");
    enemy.special = [{ kind: "flying" }, { kind: "evasive" }];
    const state = makeState([enemy]);
    renderCombatWindows(container, baseView(state), noopHandlers());
    expect(container.querySelector(".ff6-enemy-row")?.textContent).not.toContain("FLY");

    state.analyzedEnemies["Test Rat"] = true;
    renderCombatWindows(container, baseView(state), noopHandlers());
    const text = container.querySelector(".ff6-enemy-row")?.textContent;
    expect(text).toContain("FLY");
    expect(text).toContain("EVA");
  });

  it("renders resistPhysical with its percent", () => {
    const enemy = makeEnemy("rat-0");
    enemy.special = [{ kind: "resistPhysical", percent: 50 }];
    const state = makeState([enemy]);
    state.analyzedEnemies["Test Rat"] = true;
    renderCombatWindows(container, baseView(state), noopHandlers());
    expect(container.querySelector(".ff6-enemy-row")?.textContent).toContain("PHYS50");
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
    const rows = container.querySelectorAll(".ff6-command-popup .ff6-menu-item");
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
      "Enter · A/T/M/D/I/N/V/R · ↑↓"
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
    const rows = container.querySelectorAll<HTMLElement>(".ff6-command-popup .ff6-menu-item");
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
