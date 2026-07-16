/**
 * Tests for the save/load menu controller — Enter / action-pick path.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { SaveController } from "./save-ui";
import { createGameState } from "../game/state";
import { FLOORS } from "../data/floors";
import { saveToSlot } from "../game/save";

function makePanel(): HTMLElement {
  const panel = document.createElement("div");
  panel.id = "save-panel";
  return panel;
}

describe("SaveController action pick", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("browsing Enter opens action pick menu", () => {
    const panel = makePanel();
    const state = createGameState(FLOORS[0]);
    const ctrl = new SaveController({ panel, state, onLoaded: () => {}, onClose: () => {} });

    ctrl.handleKey("Enter");

    expect(panel.innerHTML).toContain("save-actions");
    expect(panel.innerHTML).toContain("Save");
    expect(panel.innerHTML).toContain("Load");
    expect(panel.innerHTML).toContain("Delete");
    expect(panel.innerHTML).toContain("Cancel");
    expect(panel.innerHTML).toContain("D-pad action · A confirm · B back");
  });

  it("browsing Space opens action pick menu", () => {
    const panel = makePanel();
    const state = createGameState(FLOORS[0]);
    const ctrl = new SaveController({ panel, state, onLoaded: () => {}, onClose: () => {} });

    ctrl.handleKey(" ");

    expect(panel.innerHTML).toContain("save-actions");
  });

  it("action pick Enter on Save saves to empty slot", () => {
    const panel = makePanel();
    const state = createGameState(FLOORS[0]);
    const ctrl = new SaveController({ panel, state, onLoaded: () => {}, onClose: () => {} });

    ctrl.handleKey("Enter");
    ctrl.handleKey("Enter");

    expect(panel.innerHTML).toContain("Saved to slot 1.");
  });

  it("action pick Enter on Save with filled slot goes to confirmOverwrite", () => {
    const panel = makePanel();
    const state = createGameState(FLOORS[0]);
    saveToSlot(state, 0);

    const ctrl = new SaveController({ panel, state, onLoaded: () => {}, onClose: () => {} });
    ctrl.handleKey("Enter");
    ctrl.handleKey("Enter");

    expect(panel.innerHTML).toContain("Overwrite? (Y/N)");
  });

  it("action pick arrows move selection", () => {
    const panel = makePanel();
    const state = createGameState(FLOORS[0]);
    const ctrl = new SaveController({ panel, state, onLoaded: () => {}, onClose: () => {} });

    ctrl.handleKey("Enter");
    expect(panel.querySelector(".save-action.selected")?.textContent).toContain("Save");

    ctrl.handleKey("ArrowDown");
    expect(panel.querySelector(".save-action.selected")?.textContent).toContain("Load");

    ctrl.handleKey("ArrowDown");
    expect(panel.querySelector(".save-action.selected")?.textContent).toContain("Delete");
  });

  it("action pick Load on empty slot flashes and stays", () => {
    const panel = makePanel();
    const state = createGameState(FLOORS[0]);
    const ctrl = new SaveController({ panel, state, onLoaded: () => {}, onClose: () => {} });

    ctrl.handleKey("Enter");
    ctrl.handleKey("ArrowDown"); // Load
    ctrl.handleKey("Enter");

    expect(panel.innerHTML).toContain("Slot 1 is empty.");
    expect(panel.innerHTML).toContain("save-actions");
  });

  it("action pick Escape returns to browsing", () => {
    const panel = makePanel();
    const state = createGameState(FLOORS[0]);
    const ctrl = new SaveController({ panel, state, onLoaded: () => {}, onClose: () => {} });

    ctrl.handleKey("Enter");
    ctrl.handleKey("Escape");

    expect(panel.innerHTML).not.toContain("save-actions");
    expect(panel.innerHTML).toContain("D-pad slot · A actions · B close");
    expect(panel.querySelector(".save-slot.selected")).not.toBeNull();
  });

  it("action pick Cancel returns to browsing", () => {
    const panel = makePanel();
    const state = createGameState(FLOORS[0]);
    const ctrl = new SaveController({ panel, state, onLoaded: () => {}, onClose: () => {} });

    ctrl.handleKey("Enter");
    ctrl.handleKey("ArrowDown");
    ctrl.handleKey("ArrowDown");
    ctrl.handleKey("ArrowDown"); // Cancel
    ctrl.handleKey("Enter");

    expect(panel.innerHTML).not.toContain("save-actions");
    expect(panel.querySelector(".save-slot.selected")).not.toBeNull();
  });

  it("confirmOverwrite Enter confirms like Y", () => {
    const panel = makePanel();
    const state = createGameState(FLOORS[0]);
    saveToSlot(state, 0);
    state.partyGold = 999;

    const ctrl = new SaveController({ panel, state, onLoaded: () => {}, onClose: () => {} });
    ctrl.handleKey("s");
    ctrl.handleKey("Enter");

    expect(panel.innerHTML).toContain("Saved to slot 1.");
  });

  it("confirmOverwrite Escape cancels like N", () => {
    const panel = makePanel();
    const state = createGameState(FLOORS[0]);
    saveToSlot(state, 0);

    const ctrl = new SaveController({ panel, state, onLoaded: () => {}, onClose: () => {} });
    ctrl.handleKey("s");
    expect(panel.innerHTML).toContain("Overwrite?");

    ctrl.handleKey("Escape");
    expect(panel.innerHTML).not.toContain("Overwrite?");
    expect(panel.innerHTML).toContain("D-pad slot · A actions · B close");
  });

  it("confirmLoad Enter confirms like Y", () => {
    const panel = makePanel();
    const state = createGameState(FLOORS[0]);
    saveToSlot(state, 0);
    let loaded = false;

    const ctrl = new SaveController({
      panel,
      state,
      onLoaded: () => {
        loaded = true;
      },
      onClose: () => {},
    });
    ctrl.handleKey("l");
    ctrl.handleKey("Enter");

    expect(loaded).toBe(true);
  });

  it("confirmDelete Enter confirms like Y", () => {
    const panel = makePanel();
    const state = createGameState(FLOORS[0]);
    saveToSlot(state, 0);

    const ctrl = new SaveController({ panel, state, onLoaded: () => {}, onClose: () => {} });
    ctrl.handleKey("d");
    ctrl.handleKey("Enter");

    expect(panel.innerHTML).toContain("Slot 1 deleted.");
  });

  it("S/L/D shortcuts still work from browsing", () => {
    const panel = makePanel();
    const state = createGameState(FLOORS[0]);
    const ctrl = new SaveController({ panel, state, onLoaded: () => {}, onClose: () => {} });

    ctrl.handleKey("s");
    expect(panel.innerHTML).toContain("Saved to slot 1.");
  });
});
