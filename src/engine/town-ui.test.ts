/**
 * Tests for town hub keyboard navigation — pad-friendly paths alongside letter hotkeys.
 */
import { describe, it, expect } from "vitest";
import { TownController } from "./town-ui";
import { createGameState } from "../game/state";
import { FLOORS } from "../data/floors";
import { CURSED_BLADE } from "../data/items";

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
    ctrl.handleKey("a");

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

  it("still switches tabs with B/S/A letter hotkeys", () => {
    const ctrl = makeTown();
    ctrl.handleKey("$");

    ctrl.handleKey("s");
    expect(activeShopTab(ctrl)).toContain("Sell");
    ctrl.handleKey("a");
    expect(activeShopTab(ctrl)).toContain("Appraise");
    ctrl.handleKey("b");
    expect(activeShopTab(ctrl)).toContain("Buy");
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
});
