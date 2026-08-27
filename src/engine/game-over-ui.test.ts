import { describe, it, expect } from "vitest";
import { GameOverController } from "./game-over-ui";
import { createCombatTestRoster } from "../game/test-roster";

function makePanel(): HTMLElement {
  return document.createElement("div");
}

describe("GameOverController", () => {
  it("campaign wipe shows century beat and wake-in-town prompt", () => {
    const panel = makePanel();
    const party = createCombatTestRoster().map((c) => ({ ...c, hp: 0 }));
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
    expect(panel.classList.contains("game-over-host")).toBe(true);
    expect(panel.dataset.gameOverContext).toBe("campaign");
  });

  it("Arena wipe keeps the joke but omits century / town copy", () => {
    const panel = makePanel();
    const party = createCombatTestRoster().map((c) => ({ ...c, hp: 0 }));
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
    expect(panel.dataset.gameOverContext).toBe("arena");
  });

  it("continues on the first Enter — the wipe-confirm key never reaches this controller", () => {
    const panel = makePanel();
    const party = createCombatTestRoster().map((c) => ({ ...c, hp: 0 }));
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

    ctrl.handleKey("Enter");
    expect(continued).toBe(1);
    expect(panel.style.display).toBe("none");
    expect(panel.classList.contains("game-over-host")).toBe(false);
    expect(panel.dataset.gameOverContext).toBeUndefined();
  });
});
