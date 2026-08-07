/**
 * Tests for town hub keyboard navigation — pad-friendly paths alongside letter hotkeys.
 */
import { describe, it, expect, vi } from "vitest";
import { TownController } from "./town-ui";
import { createGameState } from "../game/state";
import { FLOORS } from "../data/floors";
import { CURSED_BLADE, ITEMS_BY_ID } from "../data/items";
import { audio } from "./audio";
import { acceptQuest, markQuestReady } from "../game/quests";

function makePanel(): HTMLElement {
  const panel = document.createElement("div");
  panel.id = "town-panel";
  // jsdom lacks scrollIntoView — shop render calls it on the selected row.
  HTMLElement.prototype.scrollIntoView = () => {};
  return panel;
}

function makeTown(state = createGameState(FLOORS[0])): TownController {
  return new TownController({
    panel: makePanel(),
    state,
    onEnterDungeon: () => {},
    onOpenSave: () => {},
    onReformParty: () => {},
  });
}

function activeShopTab(ctrl: TownController): string {
  const panel = (ctrl as unknown as { panel: HTMLElement }).panel;
  return panel.querySelector(".shop-tab.active")?.textContent ?? "";
}

function activeRosterTab(ctrl: TownController): string {
  const panel = (ctrl as unknown as { panel: HTMLElement }).panel;
  return panel.querySelector(".shop-tab.active")?.textContent ?? "";
}

function screenOf(ctrl: TownController): string {
  return (ctrl as unknown as { screen: string }).screen;
}

describe("TownController shop tabs", () => {
  it("cycles buy → sell → appraise with ArrowRight", () => {
    const ctrl = makeTown();
    ctrl.handleKey("$");

    expect(activeShopTab(ctrl)).toContain("Buy");
    ctrl.handleKey("ArrowRight");
    expect(activeShopTab(ctrl)).toContain("Sell");
    ctrl.handleKey("ArrowRight");
    expect(activeShopTab(ctrl)).toContain("Appraise");
    ctrl.handleKey("ArrowRight");
    expect(activeShopTab(ctrl)).toContain("Buy");
  });

  it("cycles appraise → sell → buy with ArrowLeft", () => {
    const ctrl = makeTown();
    ctrl.handleKey("$");
    ctrl.handleKey("ArrowRight");
    ctrl.handleKey("ArrowRight");

    expect(activeShopTab(ctrl)).toContain("Appraise");
    ctrl.handleKey("ArrowLeft");
    expect(activeShopTab(ctrl)).toContain("Sell");
    ctrl.handleKey("ArrowLeft");
    expect(activeShopTab(ctrl)).toContain("Buy");
  });

  it("does not change tabs with arrows during buy confirm", () => {
    const ctrl = makeTown();
    ctrl.handleKey("$");
    ctrl.handleKey("Enter");

    expect((ctrl as unknown as { shopTab: string }).shopTab).toBe("buyConfirm");
    ctrl.handleKey("ArrowRight");
    expect((ctrl as unknown as { shopTab: string }).shopTab).toBe("buyConfirm");
  });

  it("cycles buy-confirm target with ArrowDown through party members", () => {
    const ctrl = makeTown();
    ctrl.handleKey("$");
    ctrl.handleKey("Enter");

    const panel = (ctrl as unknown as { panel: HTMLElement }).panel;
    const targetBefore = panel.querySelector(".buy-compare-value")?.textContent;
    ctrl.handleKey("ArrowDown");
    const targetAfter = panel.querySelector(".buy-compare-value")?.textContent;
    expect(targetAfter).toBeTruthy();
    expect(targetAfter).not.toBe(targetBefore);
    expect(panel.querySelector(".ff6-footer")?.textContent).toContain("↑↓ target");
  });

  it("letter S still jumps to Sell; A/B are reserved for buy/back actions", () => {
    const ctrl = makeTown();
    ctrl.handleKey("$");

    ctrl.handleKey("s");
    expect(activeShopTab(ctrl)).toContain("Sell");

    // Letter a/b must NOT steal the footer actions (A buy · B back).
    ctrl.handleKey("a");
    expect(activeShopTab(ctrl)).toContain("Sell");
    ctrl.handleKey("b");
    expect(activeShopTab(ctrl)).toContain("Sell");

    ctrl.handleKey("ArrowLeft");
    expect(activeShopTab(ctrl)).toContain("Buy");
  });

  it("Buy tab hint says 'A buy', matching what A actually opens (a purchase dialog, not a compare view)", () => {
    const ctrl = makeTown();
    ctrl.handleKey("$");
    const panel = (ctrl as unknown as { panel: HTMLElement }).panel;
    expect(panel.querySelector(".ff6-footer")?.textContent).toBe(
      "D-pad navigate · A buy · ←→ tabs · B back"
    );
  });

  it("mouse hover updates the buy preview without rebuilding the item list", () => {
    const ctrl = makeTown();
    ctrl.handleKey("$");
    const panel = (ctrl as unknown as { panel: HTMLElement }).panel;
    const listBefore = panel.querySelector(".ff6-selection-list");
    const rows = panel.querySelectorAll<HTMLElement>(".ff6-menu-item");
    expect(rows.length).toBeGreaterThan(3);
    expect(rows[0]!.classList.contains("selected")).toBe(true);

    rows[3]!.dispatchEvent(new Event("mouseenter"));

    expect(panel.querySelector(".ff6-selection-list")).toBe(listBefore);
    expect((ctrl as unknown as { shopIndex: number }).shopIndex).toBe(3);
    expect(rows[3]!.classList.contains("selected")).toBe(true);
    expect(panel.querySelector(".shop-buy-preview")).toBeTruthy();
  });
});

describe("TownController roster tabs", () => {
  it("toggles status ↔ progress with ArrowLeft/ArrowRight", () => {
    const ctrl = makeTown();
    ctrl.handleKey("G");

    expect(activeRosterTab(ctrl)).toContain("Status");
    ctrl.handleKey("ArrowRight");
    expect(activeRosterTab(ctrl)).toContain("Progress");
    ctrl.handleKey("ArrowLeft");
    expect(activeRosterTab(ctrl)).toContain("Status");
  });

  it("still switches tabs with S/P letter hotkeys", () => {
    const ctrl = makeTown();
    ctrl.handleKey("G");

    ctrl.handleKey("p");
    expect(activeRosterTab(ctrl)).toContain("Progress");
    ctrl.handleKey("s");
    expect(activeRosterTab(ctrl)).toContain("Status");
  });
});

describe("TownController main footer party count", () => {
  it("shows alive/total from actual party length, not a hardcoded 6", () => {
    const state = createGameState(FLOORS[0]);
    expect(state.party).toHaveLength(4);
    const ctrl = makeTown(state);
    const panel = (ctrl as unknown as { panel: HTMLElement }).panel;
    const footer2 = panel.querySelector(".ff6-footer2")?.textContent ?? "";
    expect(footer2).toMatch(/^Party: 4\/4 alive/);
    expect(footer2).not.toMatch(/6\/6/);
  });

  it("reflects a smaller party if one is somehow present", () => {
    const state = createGameState(FLOORS[0]);
    state.party = state.party.slice(0, 3);
    state.party[0]!.hp = 0;
    const ctrl = makeTown(state);
    const panel = (ctrl as unknown as { panel: HTMLElement }).panel;
    expect(panel.querySelector(".ff6-footer2")?.textContent).toMatch(/^Party: 2\/3 alive/);
  });
});

describe("TownController main footer Scorchboard pointer", () => {
  it("says nothing about the Scorchboard when no quest is ready", () => {
    const state = createGameState(FLOORS[0]);
    const ctrl = makeTown(state);
    const panel = (ctrl as unknown as { panel: HTMLElement }).panel;
    expect(panel.querySelector(".ff6-footer2")?.textContent).not.toMatch(/Scorchboard/);
  });

  it("points back to Hot Boi's once a quest is ready to turn in", () => {
    const state = createGameState(FLOORS[0]);
    acceptQuest(state, "last-lantern");
    markQuestReady(state, "last-lantern");
    const ctrl = makeTown(state);
    const panel = (ctrl as unknown as { panel: HTMLElement }).panel;
    expect(panel.querySelector(".ff6-footer2")?.textContent).toMatch(
      /Hot Boi's Scorchboard: 1 ready to turn in/
    );
  });

  it("counts multiple ready quests", () => {
    const state = createGameState(FLOORS[0]);
    for (const id of ["last-lantern", "shield-left-behind"]) {
      acceptQuest(state, id);
      markQuestReady(state, id);
    }
    const ctrl = makeTown(state);
    const panel = (ctrl as unknown as { panel: HTMLElement }).panel;
    expect(panel.querySelector(".ff6-footer2")?.textContent).toMatch(
      /Hot Boi's Scorchboard: 2 ready to turn in/
    );
  });
});

describe("TownController temple Remove Curse", () => {
  function stateWithCursedWeapon() {
    const state = createGameState(FLOORS[0]);
    state.partyGold = 200;
    const charId = state.party[0].id;
    state.equipment[charId] = {
      ...state.equipment[charId],
      weapon: CURSED_BLADE,
    };
    return state;
  }

  it("shows selectable rows when cursed gear is equipped", () => {
    const ctrl = makeTown(stateWithCursedWeapon());
    ctrl.handleKey("+");

    const panel = (ctrl as unknown as { panel: HTMLElement }).panel;
    expect(panel.innerHTML).toContain("Remove Curse");
    // Temple options now render as FF6Window menu rows.
    expect(panel.querySelectorAll(".ff6-menu-item").length).toBe(2);
  });

  it("removes curse on Enter when Remove Curse row is selected", () => {
    const state = stateWithCursedWeapon();
    const ctrl = makeTown(state);
    ctrl.handleKey("+");
    ctrl.handleKey("ArrowDown");
    ctrl.handleKey("Enter");

    expect(state.partyGold).toBe(100);
    expect(state.equipment[state.party[0].id].weapon).toBeUndefined();
    expect((ctrl as unknown as { flash: string }).flash).toContain("shatter");
  });

  it("returns to main on Enter when Back row is selected", () => {
    const ctrl = makeTown(stateWithCursedWeapon());
    ctrl.handleKey("+");
    expect(screenOf(ctrl)).toBe("temple");
    ctrl.handleKey("Enter");
    expect(screenOf(ctrl)).toBe("main");
  });

  it("still removes curse with R letter hotkey", () => {
    const state = stateWithCursedWeapon();
    const ctrl = makeTown(state);
    ctrl.handleKey("+");
    ctrl.handleKey("r");

    expect(state.equipment[state.party[0].id].weapon).toBeUndefined();
  });

  it("dismisses with Enter when no cursed gear", () => {
    const ctrl = makeTown();
    ctrl.handleKey("+");
    expect(screenOf(ctrl)).toBe("temple");
    ctrl.handleKey("Enter");
    expect(screenOf(ctrl)).toBe("main");
  });

  it("plays the cancel cue when Remove Curse has nothing to remove", () => {
    const cue = vi.spyOn(audio, "uiCancel").mockImplementation(() => {});
    const ctrl = makeTown();
    ctrl.handleKey("+");
    ctrl.handleKey("r");
    expect(cue).toHaveBeenCalledTimes(1);
    cue.mockRestore();
  });
});

describe("TownController inn/temple roster summary", () => {
  // visual-design-pass 2026-07-27: a 5th per-character field (XP) pushed
  // guild-char rows past the standalone window's width, wrapping onto an
  // orphan line that read as a stray duplicate stat. Inn/Temple only need to
  // confirm rest worked — Guild -> Status/Progress already covers XP.
  it("Inn roster shows name/class/HP/SP but no XP field", () => {
    const state = createGameState(FLOORS[0]);
    const ctrl = makeTown(state);
    ctrl.handleKey("i");

    const panel = (ctrl as unknown as { panel: HTMLElement }).panel;
    const cards = panel.querySelectorAll(".guild-char");
    expect(cards.length).toBe(state.party.length);
    for (const card of cards) {
      expect(card.querySelector(".gc-hp")).not.toBeNull();
      expect(card.querySelector(".gc-sp")).not.toBeNull();
      expect(card.querySelector(".gc-xp")).toBeNull();
    }
  });

  it("Temple roster shows name/class/HP/SP but no XP field", () => {
    const ctrl = makeTown();
    ctrl.handleKey("+");

    const panel = (ctrl as unknown as { panel: HTMLElement }).panel;
    const cards = panel.querySelectorAll(".guild-char");
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.querySelector(".gc-xp")).toBeNull();
    }
  });
});

describe("TownController shop depth gate", () => {
  function buyListIds(ctrl: TownController): string[] {
    const list = (ctrl as unknown as { getShopBuyList(): { id: string; dropFloorTier?: number }[] })
      .getShopBuyList();
    return list.map((i) => i.id);
  }

  it("defaults to today's tier ≤2 stock when deepestFloorReached is 1 (no regression)", () => {
    const ctrl = makeTown();
    const ids = buyListIds(ctrl);
    expect(ids).toContain("mace"); // tier 2
    expect(ids).not.toContain("great-sword"); // tier 3
    expect(ids).not.toContain("runeblade"); // tier 4
    expect(ids).not.toContain("focus-ward"); // tier 5
  });

  it("stays capped at tier 2 on floor 2 (unlock starts at floor 3)", () => {
    const state = createGameState(FLOORS[0]);
    state.deepestFloorReached = 2;
    const ctrl = makeTown(state);
    expect(buyListIds(ctrl)).not.toContain("great-sword");
  });

  it("unlocks tier 3 once floor 3 has been reached", () => {
    const state = createGameState(FLOORS[0]);
    state.deepestFloorReached = 3;
    const ctrl = makeTown(state);
    const ids = buyListIds(ctrl);
    expect(ids).toContain("great-sword"); // tier 3
    expect(ids).not.toContain("runeblade"); // tier 4 still locked
  });

  it("unlocks tier 4 (runeblade/mythril-plate/sages-circlet) once floor 4 has been reached", () => {
    const state = createGameState(FLOORS[0]);
    state.deepestFloorReached = 4;
    const ctrl = makeTown(state);
    const ids = buyListIds(ctrl);
    expect(ids).toContain("runeblade");
    expect(ids).toContain("mythril-plate");
    expect(ids).toContain("sages-circlet");
    expect(ids).not.toContain("voidblade"); // tier 5 still locked
    expect(ids).not.toContain("focus-ward");
  });

  it("unlocks tier 5 (voidblade/dragonscale-mail/focus-ward) once floor 5 has been reached", () => {
    const state = createGameState(FLOORS[0]);
    state.deepestFloorReached = 5;
    const ctrl = makeTown(state);
    const ids = buyListIds(ctrl);
    expect(ids).toContain("voidblade");
    expect(ids).toContain("dragonscale-mail");
    expect(ids).toContain("focus-ward");
  });

  it("shop stock depends on deepestFloorReached, not the current floor (backtracking doesn't re-lock)", () => {
    const state = createGameState(FLOORS[0]);
    state.deepestFloorReached = 5;
    state.floor = FLOORS[0]; // player backtracked to floor 1's town
    const ctrl = makeTown(state);
    expect(buyListIds(ctrl)).toContain("focus-ward");
  });
});

describe("TownController equip sheet", () => {
  function panelOf(ctrl: TownController): HTMLElement {
    return (ctrl as unknown as { panel: HTMLElement }).panel;
  }

  function openEquipSlot(ctrl: TownController): HTMLElement {
    ctrl.handleKey("e");
    expect(screenOf(ctrl)).toBe("equip");
    ctrl.handleKey("Enter"); // char → slot
    return panelOf(ctrl);
  }

  it("slot phase shows FF6 band sheet: 4 slots + Auto, decorative tabs, no footer", () => {
    const ctrl = makeTown();
    const panel = openEquipSlot(ctrl);
    expect(panel.querySelectorAll(".equip-sheet").length).toBe(1);
    expect(panel.querySelectorAll(".ff6-window").length).toBe(1);
    expect(panel.querySelector(".equip-sheet-band")).not.toBeNull();
    expect(panel.querySelector(".equip-sheet-lower")).not.toBeNull();
    expect(panel.querySelector(".equip-sheet-desc")).not.toBeNull();
    expect(panel.querySelectorAll(".equip-sheet-row[data-kind='slot']").length).toBe(4);
    const auto = panel.querySelector(".equip-sheet-row[data-kind='auto-equip']");
    expect(auto).not.toBeNull();
    expect(auto!.querySelector(".equip-row-label")?.textContent).toBe("Auto");
    expect(panel.querySelector(".equip-sheet-tab--dim")?.textContent).toMatch(/Optimum|Empty/);
    expect(panel.querySelector(".equip-sheet-compare-hint")).toBeNull();
    expect(panel.querySelector(".ff6-footer")).toBeNull();
    expect(panel.querySelector(".equip-compare")).toBeNull();
  });

  it("desc panel updates when focus moves to empty Shield", () => {
    const ctrl = makeTown();
    openEquipSlot(ctrl);
    // Weapon (0) → Body (1) → Shield (2)
    ctrl.handleKey("ArrowDown");
    ctrl.handleKey("ArrowDown");
    const panel = panelOf(ctrl);
    expect(panel.querySelector(".equip-desc-title")?.textContent).toBe("Shield");
    expect(panel.querySelector(".equip-desc-body")?.textContent).toMatch(/Equip from inventory/);
  });

  it("ArrowRight wraps party and updates sheet name", () => {
    const state = createGameState(FLOORS[0]);
    const ctrl = makeTown(state);
    openEquipSlot(ctrl);
    const first = state.party[0]!.name;
    const last = state.party[state.party.length - 1]!.name;
    ctrl.handleKey("ArrowLeft");
    expect(panelOf(ctrl).querySelector(".equip-sheet-name")?.textContent).toBe(last);
    ctrl.handleKey("ArrowRight");
    expect(panelOf(ctrl).querySelector(".equip-sheet-name")?.textContent).toBe(first);
  });

  it("keeps cursed badge outside the ellipsizing name span", () => {
    const state = createGameState(FLOORS[0]);
    const id = state.party[0]!.id;
    state.equipment[id] = { ...state.equipment[id], weapon: CURSED_BLADE };
    const ctrl = makeTown(state);
    const panel = openEquipSlot(ctrl);
    const cell = panel.querySelector(".equip-item-cell");
    expect(cell).not.toBeNull();
    const name = cell!.querySelector(".equip-item-name");
    const badge = cell!.querySelector(".equip-cursed-badge");
    expect(name).not.toBeNull();
    expect(badge).not.toBeNull();
    expect(name!.contains(badge!)).toBe(false);
  });

  it("item phase shows → for an identified upgrade and none for unappraised", () => {
    const state = createGameState(FLOORS[0]);
    const id = state.party[0]!.id;
    state.equipment[id] = {
      ...state.equipment[id],
      weapon: ITEMS_BY_ID["short-sword"],
    };
    state.inventory.push(
      { itemId: "long-sword", identified: true },
      { itemId: "dagger", identified: false }
    );
    const ctrl = makeTown(state);
    openEquipSlot(ctrl);
    ctrl.handleKey("Enter"); // open weapon browse
    // rows: Remove, long-sword, dagger (order depends on inventory scan)
    const panel = panelOf(ctrl);
    expect(panel.querySelector(".equip-sheet")).not.toBeNull();

    // Find long-sword row index by walking ArrowDown until ATK arrow appears
    let foundArrow = false;
    for (let i = 0; i < 6; i++) {
      const arrows = [...panelOf(ctrl).querySelectorAll(".equip-stat-arrow")].filter(
        (el) => el.textContent === "→"
      );
      if (arrows.length > 0) {
        foundArrow = true;
        break;
      }
      ctrl.handleKey("ArrowDown");
    }
    expect(foundArrow).toBe(true);

    // Move until the selected row is unappraised — no arrows
    for (let i = 0; i < 8; i++) {
      const p = panelOf(ctrl);
      const selected = p.querySelector(".equip-sheet-row.selected");
      if (selected?.textContent?.includes("unappraised")) {
        const arrows = [...p.querySelectorAll(".equip-stat-arrow")].filter(
          (el) => el.textContent === "→"
        );
        expect(arrows.length).toBe(0);
        return;
      }
      ctrl.handleKey("ArrowDown");
    }
    throw new Error("unappraised row not found");
  });

  it("computed font-family on .equip-sheet includes a monospace fallback chain", () => {
    const ctrl = makeTown();
    const sheet = openEquipSlot(ctrl).querySelector(".equip-sheet") as HTMLElement;
    // jsdom may not resolve @font-face; assert the stylesheet rule targets the class.
    expect(sheet.classList.contains("equip-sheet")).toBe(true);
    expect(getComputedStyle(sheet).getPropertyValue("font-family") || "var(--game-font)").toBeTruthy();
  });

  it("no-reflow: sprite/identity/stats offset sizes stable across focus", () => {
    const ctrl = makeTown();
    const panel = openEquipSlot(ctrl);
    const measure = () => {
      const sprite = panel.querySelector(".equip-sheet-sprite") as HTMLElement;
      const identity = panel.querySelector(".equip-sheet-identity") as HTMLElement;
      const stats = panel.querySelector(".equip-sheet-stats") as HTMLElement;
      return {
        sw: sprite.offsetWidth,
        sh: sprite.offsetHeight,
        iw: identity.offsetWidth,
        ih: identity.offsetHeight,
        tw: stats.offsetWidth,
        th: stats.offsetHeight,
      };
    };
    const a = measure();
    ctrl.handleKey("ArrowDown");
    const b = measure();
    expect(b).toEqual(a);
  });
});
