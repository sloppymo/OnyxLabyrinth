import { describe, it, expect } from "vitest";
import { TavernController } from "./tavern-ui";
import { createGameState } from "../game/state";
import { FLOORS } from "../data/floors";
import { REST_PRICE } from "../data/hot-boi";
import type { GameState } from "../types";

function openTavern(state: GameState): { ctrl: TavernController; panel: HTMLElement } {
  const panel = document.createElement("div");
  let closed = false;
  const ctrl = new TavernController({
    panel,
    state,
    onClose: () => {
      closed = true;
    },
    onSave: () => {},
  });
  void closed;
  return { ctrl, panel };
}

describe("TavernController — menu contents", () => {
  it("never exposes Attack or Steal", () => {
    const state = createGameState(FLOORS[0]);
    const { panel } = openTavern(state);
    expect(panel.textContent).not.toMatch(/Attack/);
    expect(panel.textContent).not.toMatch(/Steal/);
  });

  it("root menu lists Talk/Rest/Rumors/Scorchboard/Companions/Leave", () => {
    const state = createGameState(FLOORS[0]);
    const { panel } = openTavern(state);
    for (const label of ["Talk", "Rest", "Rumors", "Scorchboard", "Companions", "Leave"]) {
      expect(panel.textContent).toContain(label);
    }
  });
});

describe("TavernController — navigation", () => {
  it("Escape from a sub-screen returns to root, not straight to the dungeon", () => {
    const state = createGameState(FLOORS[0]);
    const { ctrl, panel } = openTavern(state);
    ctrl.handleKey("Enter"); // open Talk (root index 0)
    expect(panel.textContent).toMatch(/The Tavern/);
    ctrl.handleKey("Escape");
    expect(panel.textContent).toContain("Leave"); // back at the root menu
  });

  it("Escape from the root menu closes the panel", () => {
    const state = createGameState(FLOORS[0]);
    let closed = false;
    const panel = document.createElement("div");
    const ctrl = new TavernController({
      panel,
      state,
      onClose: () => {
        closed = true;
      },
      onSave: () => {},
    });
    ctrl.handleKey("Escape");
    expect(closed).toBe(true);
    expect(panel.style.display).toBe("none");
  });
});

describe("TavernController — Rest", () => {
  it("shows the correct price and requires confirmation before charging", () => {
    const state = createGameState(FLOORS[0]);
    state.partyGold = 100;
    const { ctrl, panel } = openTavern(state);
    ctrl.handleKey("ArrowDown"); // Rest
    ctrl.handleKey("Enter");
    expect(panel.textContent).toMatch(new RegExp(`${REST_PRICE} gold`));
    expect(state.partyGold).toBe(100); // not charged yet
  });

  it("charges gold exactly once even if Enter fires twice in a row (held key)", () => {
    const state = createGameState(FLOORS[0]);
    state.partyGold = 100;
    const { ctrl } = openTavern(state);
    ctrl.handleKey("ArrowDown"); // Rest
    ctrl.handleKey("Enter"); // open confirm screen
    ctrl.handleKey("Enter"); // confirm "Rest" (selected by default)
    expect(state.partyGold).toBe(100 - REST_PRICE);
    ctrl.handleKey("Enter"); // held-key repeat — now back at root, lands on "Talk"
    expect(state.partyGold).toBe(100 - REST_PRICE); // unchanged
  });

  it("blocks resting outright when the party can't pay", () => {
    const state = createGameState(FLOORS[0]);
    state.partyGold = REST_PRICE - 1;
    const { ctrl } = openTavern(state);
    ctrl.handleKey("ArrowDown"); // Rest
    ctrl.handleKey("Enter");
    const goldBefore = state.partyGold;
    ctrl.handleKey("Enter"); // only "Back" is selectable — no Rest option exists
    expect(state.partyGold).toBe(goldBefore);
  });

  it("restores HP/SP on a successful rest", () => {
    const state = createGameState(FLOORS[0]);
    state.partyGold = 100;
    state.party[0]!.hp = 1;
    const { ctrl } = openTavern(state);
    ctrl.handleKey("ArrowDown"); // Rest
    ctrl.handleKey("Enter");
    ctrl.handleKey("Enter"); // confirm
    expect(state.party[0]!.hp).toBe(state.party[0]!.maxHp);
  });
});

describe("TavernController — Rumors", () => {
  it("never shows the same rumor on two consecutive reads", () => {
    const state = createGameState(FLOORS[0]);
    const { ctrl, panel } = openTavern(state);
    ctrl.handleKey("ArrowDown");
    ctrl.handleKey("ArrowDown"); // Rumors
    ctrl.handleKey("Enter");
    const seen: string[] = [];
    for (let i = 0; i < 10; i++) {
      seen.push(panel.textContent ?? "");
      ctrl.handleKey("Enter"); // "Ask about something else" (index 0)
    }
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]).not.toBe(seen[i - 1]);
    }
  });
});

describe("TavernController — dialogue doesn't bleed across screens", () => {
  it("opening the Scorchboard right after Rest never shows the Rest prompt (regression)", () => {
    const state = createGameState(FLOORS[0]);
    state.partyGold = 100;
    const { ctrl, panel } = openTavern(state);
    ctrl.handleKey("ArrowDown"); // Rest
    ctrl.handleKey("Enter"); // "Rest for 20 gold?"
    ctrl.handleKey("Enter"); // confirm — back at root, gold spent
    ctrl.handleKey("ArrowDown");
    ctrl.handleKey("ArrowDown");
    ctrl.handleKey("ArrowDown"); // Scorchboard
    ctrl.handleKey("Enter");
    expect(panel.textContent).toMatch(/Scorchboard/);
    expect(panel.textContent).not.toMatch(/gold\?/);
  });

  it("root always shows the greeting, never a leftover sub-screen line", () => {
    const state = createGameState(FLOORS[0]);
    const { ctrl, panel } = openTavern(state);
    const greeting = panel.textContent;
    ctrl.handleKey("ArrowDown");
    ctrl.handleKey("ArrowDown"); // Rumors
    ctrl.handleKey("Enter");
    ctrl.handleKey("ArrowDown");
    ctrl.handleKey("Enter"); // "Back to the bar"
    expect(panel.textContent).toBe(greeting);
  });
});

describe("TavernController — Scorchboard", () => {
  function openScorchboard(state: GameState) {
    const { ctrl, panel } = openTavern(state);
    ctrl.handleKey("ArrowDown");
    ctrl.handleKey("ArrowDown");
    ctrl.handleKey("ArrowDown"); // Scorchboard
    ctrl.handleKey("Enter");
    return { ctrl, panel };
  }

  it("accepting Last Lantern moves it from available to in progress", () => {
    const state = createGameState(FLOORS[0]);
    const { ctrl, panel } = openScorchboard(state);
    expect(panel.textContent).toMatch(/The Last Lantern/);
    ctrl.handleKey("Enter"); // open detail (first entry)
    expect(panel.textContent).toMatch(/Accept/);
    ctrl.handleKey("Enter"); // Accept
    expect(panel.textContent).not.toMatch(/Accept/);
  });

  it("turning in Last Lantern grants gold exactly once", () => {
    const state = createGameState(FLOORS[0]);
    const { ctrl } = openScorchboard(state);
    ctrl.handleKey("Enter"); // detail
    ctrl.handleKey("Enter"); // Accept
    state.talkedToNPCs.push("sister-caldris");
    ctrl.handleKey("Escape"); // back to board (re-evaluates readiness)
    ctrl.handleKey("Enter"); // detail again — now ready
    const goldBefore = state.partyGold;
    ctrl.handleKey("Enter"); // Turn in
    expect(state.partyGold).toBeGreaterThan(goldBefore);
    const goldAfter = state.partyGold;
    ctrl.handleKey("Escape");
    ctrl.handleKey("Enter"); // detail a third time — completed, only "Back"
    ctrl.handleKey("Enter");
    expect(state.partyGold).toBe(goldAfter); // no second reward
  });
});
