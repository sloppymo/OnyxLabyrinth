import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GameOverController } from "./game-over-ui";
import { createDefaultParty } from "../game/party";

function makePanel(): HTMLElement {
  return document.createElement("div");
}

describe("GameOverController", () => {
  it("campaign wipe shows century beat and wake-in-town prompt", () => {
    const panel = makePanel();
    const party = createDefaultParty().map((c) => ({ ...c, hp: 0 }));
    new GameOverController({
      panel,
      party,
      floorName: "The Crypt",
      worldYear: 3947,
      inArena: false,
      onContinue: () => {},
    });
    expect(panel.innerHTML).toContain("The labyrinth does not keep the dead.");
    expect(panel.innerHTML).toContain("Year 3947");
    expect(panel.innerHTML).toContain("Edgehollow is still waiting");
    expect(panel.innerHTML).toContain("wake in town");
    expect(panel.innerHTML).not.toContain("wake at the entrance");
  });

  it("Arena wipe keeps the joke but omits century / town copy", () => {
    const panel = makePanel();
    const party = createDefaultParty().map((c) => ({ ...c, hp: 0 }));
    new GameOverController({
      panel,
      party,
      floorName: "Arena",
      worldYear: 3847,
      inArena: true,
      onContinue: () => {},
    });
    expect(panel.innerHTML).toContain("The labyrinth does not keep the dead.");
    expect(panel.innerHTML).toContain("Press [Enter] to continue.");
    expect(panel.innerHTML).not.toContain("Year ");
    expect(panel.innerHTML).not.toContain("Edgehollow");
    expect(panel.innerHTML).not.toContain("wake in town");
  });

  describe("opening-key arming (wipe result → game over cascade)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("ignores Enter/Space until the next macrotask so the wipe-confirm key cannot dismiss the screen", () => {
      const panel = makePanel();
      const party = createDefaultParty().map((c) => ({ ...c, hp: 0 }));
      let continued = 0;
      const ctrl = new GameOverController({
        panel,
        party,
        floorName: "The Crypt",
        worldYear: 3947,
        onContinue: () => {
          continued += 1;
        },
      });

      // Same keydown that confirmed the combat wipe result still runs every
      // window listener in registration order; without arming, this would
      // call onContinue and skip the Game Over screen entirely.
      ctrl.handleKey("Enter");
      expect(continued).toBe(0);
      expect(panel.style.display).toBe("flex");

      ctrl.handleKey(" ");
      expect(continued).toBe(0);

      vi.runAllTimers();
      ctrl.handleKey("Enter");
      expect(continued).toBe(1);
      expect(panel.style.display).toBe("none");
    });
  });
});
