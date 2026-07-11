/**
 * Tests for the perk selection overlay.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { PerkSelectController } from "./perk-select-ui";
import { createGameState } from "../game/state";
import { createCharacter } from "../game/party";
import { FLOORS } from "../data/floors";
import type { PendingPerkChoice } from "../game/perks";

function makePanel(): HTMLElement {
  const panel = document.createElement("div");
  panel.id = "combat-panel";
  return panel;
}

function makeStateWithLevel3Fighter(): ReturnType<typeof createGameState> {
  const state = createGameState(FLOORS[0]);
  state.party = [createCharacter("c1", "Aria", "Human", "Good", "Fighter", 0)];
  state.party[0].level = 3;
  state.party[0].xp = 60;
  return state;
}

describe("PerkSelectController", () => {
  it("renders both perk cards for the character's tier", () => {
    const panel = makePanel();
    const state = makeStateWithLevel3Fighter();
    const queue: PendingPerkChoice[] = [{ charId: "c1", tier: 1 }];

    new PerkSelectController({ panel, state, queue, onDone: () => {} });

    expect(panel.innerHTML).toContain("Aria");
    expect(panel.innerHTML).toContain("Choose a Tier 1 Perk");
    expect(panel.innerHTML).toContain("Cleave");
    expect(panel.innerHTML).toContain("Toughness");
  });

  it("selects the left card by default", () => {
    const panel = makePanel();
    const state = makeStateWithLevel3Fighter();
    const queue: PendingPerkChoice[] = [{ charId: "c1", tier: 1 }];

    const ctrl = new PerkSelectController({ panel, state, queue, onDone: () => {} });
    const cards = panel.querySelectorAll(".perk-select-card");
    expect(cards[0].classList.contains("selected")).toBe(true);
    expect(cards[1].classList.contains("selected")).toBe(false);
  });

  it("moves selection with arrow keys", () => {
    const panel = makePanel();
    const state = makeStateWithLevel3Fighter();
    const queue: PendingPerkChoice[] = [{ charId: "c1", tier: 1 }];

    const ctrl = new PerkSelectController({ panel, state, queue, onDone: () => {} });
    ctrl.handleKey("ArrowRight");

    let cards = panel.querySelectorAll(".perk-select-card");
    expect(cards[0].classList.contains("selected")).toBe(false);
    expect(cards[1].classList.contains("selected")).toBe(true);

    ctrl.handleKey("ArrowLeft");
    cards = panel.querySelectorAll(".perk-select-card");
    expect(cards[0].classList.contains("selected")).toBe(true);
    expect(cards[1].classList.contains("selected")).toBe(false);
  });

  it("applies the selected perk and advances the queue on Enter", () => {
    const panel = makePanel();
    const state = makeStateWithLevel3Fighter();
    const queue: PendingPerkChoice[] = [{ charId: "c1", tier: 1 }];
    let done = false;

    const ctrl = new PerkSelectController({
      panel,
      state,
      queue,
      onDone: () => {
        done = true;
      },
    });

    // Right card is Toughness.
    ctrl.handleKey("ArrowRight");
    ctrl.handleKey("Enter");

    expect(state.party[0].perkIds).toContain("fighter-toughness");
    expect(done).toBe(true);
    expect(panel.innerHTML).toBe("");
  });

  it("handles multiple queued characters one at a time", () => {
    const panel = makePanel();
    const state = makeStateWithLevel3Fighter();
    state.party.push(createCharacter("c2", "Bram", "Human", "Good", "Fighter", 1));
    state.party[1].level = 3;
    state.party[1].xp = 60;
    const queue: PendingPerkChoice[] = [
      { charId: "c1", tier: 1 },
      { charId: "c2", tier: 1 },
    ];
    let done = false;

    const ctrl = new PerkSelectController({
      panel,
      state,
      queue,
      onDone: () => {
        done = true;
      },
    });

    // Confirm Aria's choice.
    ctrl.handleKey("Enter");
    expect(state.party[0].perkIds).toHaveLength(1);
    expect(done).toBe(false);
    expect(panel.innerHTML).toContain("Bram");

    // Confirm Bram's choice.
    ctrl.handleKey("Enter");
    expect(state.party[1].perkIds).toHaveLength(1);
    expect(done).toBe(true);
  });
});
