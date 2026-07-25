/**
 * Tests for town hub keyboard navigation — pad-friendly paths alongside letter hotkeys.
 */
import { describe, it, expect, vi } from "vitest";
import { TownController } from "./town-ui";
import { createGameState } from "../game/state";
import { FLOORS } from "../data/floors";
import { CURSED_BLADE } from "../data/items";
import { audio } from "./audio";

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
