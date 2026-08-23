import { describe, expect, it } from "vitest";
import { createAdversarialTriangle, playerView } from "../game/card-trial/engine";
import { renderCardTrialWindows } from "./card-trial-view";

const noop = {
  onHoverCard: () => {},
  onConfirmCard: () => {},
  onMove: () => {},
  onPass: () => {},
  onHoverTarget: () => {},
  onConfirmTarget: () => {},
  onCancel: () => {},
};

describe("Card Trial windows", () => {
  it("shows the acting hero hand, Opened mark, post-Guard intent, and Move utility", () => {
    const trial = createAdversarialTriangle();
    const host = document.createElement("div");
    renderCardTrialWindows(
      host,
      {
        view: playerView(trial),
        phase: "hand",
        cursor: 0,
        targetIds: [],
        targetCursor: 0,
        flash: null,
        result: null,
      },
      noop
    );
    const html = host.innerHTML;
    expect(html).toContain("Rat King");
    expect(html).toContain("energy");
    expect(html).toContain("King of the Heap");
    expect(html).toContain("Swarm the Wound");
    expect(html).not.toContain("CONSUME OPENED");
    expect(html).toMatch(/<div class="ct-consume armed">/);
    expect(host.querySelector(".ct-card.ct-consume-armed")).toBeNull();
    expect(html).toContain("Opened");
    expect(html).toContain("CLEAVER");
    expect(html).toContain("ASH");
    expect(html).toMatch(/loses <strong>11<\/strong> HP|11 HP|loses/);
    expect(html).toContain("Move 1");
    expect(html).toContain("RAT —");
    expect(html).toContain("ct-opened-mark");
    expect(host.querySelector(".ct-hero-row")).toBeNull();
    expect(host.querySelector(".ct-hand .ff6-menu-title")?.textContent).toBe(
      "Rat King · 3 energy"
    );
    expect(host.querySelector(".ct-rat")?.textContent).toContain("Front");
  });

  it("shows why a disabled card cannot be played", () => {
    const trial = createAdversarialTriangle();
    trial.heroes["rat-king"].energy = 0;
    const host = document.createElement("div");
    renderCardTrialWindows(
      host,
      {
        view: playerView(trial),
        phase: "hand",
        cursor: 0,
        targetIds: [],
        targetCursor: 0,
        flash: null,
        result: null,
      },
      noop
    );
    expect(host.querySelectorAll(".ct-card.disabled").length).toBeGreaterThan(0);
    expect(host.innerHTML).toContain("Not enough energy");
  });

  it("suppresses every legacy pane when hideLegacyPanes is set", () => {
    const trial = createAdversarialTriangle();
    const host = document.createElement("div");
    renderCardTrialWindows(
      host,
      {
        view: playerView(trial),
        phase: "hand",
        cursor: 0,
        targetIds: [],
        targetCursor: 0,
        flash: null,
        result: null,
        hideLegacyPanes: true,
      },
      noop
    );
    expect(host.innerHTML).toBe("");
    expect(host.querySelector(".ct-windows")).toBeNull();
    expect(host.querySelector(".ct-intents")).toBeNull();
    expect(host.querySelector(".ct-hand")).toBeNull();
  });
});
