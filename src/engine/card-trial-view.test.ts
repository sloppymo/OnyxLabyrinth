import { describe, expect, it } from "vitest";
import { cardArtUrl } from "../game/card-trial/card-art";
import { createAdversarialTriangle, playerView } from "../game/card-trial/engine";
import type { CardId, HandCardView } from "../game/card-trial/types";
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

  it("renders shipped illustration fields inside a reserved aperture", () => {
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
    const cards = [...host.querySelectorAll<HTMLButtonElement>(".ct-card")];
    expect(cards.map((c) => c.querySelector(".ct-card-name")?.textContent)).toEqual([
      "King of the Heap",
      "Nip",
      "Nip",
      "Tide",
      "Swarm the Wound",
    ]);
    expect(cards.every((c) => c.querySelector(".ct-card-art"))).toBe(true);
    const srcs = cards.map((c) => c.querySelector("img.ct-card-art-img")?.getAttribute("src"));
    expect(srcs).toEqual([
      cardArtUrl("king-of-the-heap"),
      cardArtUrl("nip"),
      cardArtUrl("nip"),
      cardArtUrl("tide"),
      cardArtUrl("swarm-the-wound"),
    ]);
    expect(host.querySelector(".ct-card-cost")?.textContent).toBe("2");
    expect(host.querySelector(".ct-card-text")?.textContent).toContain("Deal 7");
    expect(host.querySelector(".ct-hand-row")?.classList.contains("ct-hand-fan")).toBe(false);
  });

  it("keeps a same-size fallback aperture for cards without art", () => {
    const trial = createAdversarialTriangle();
    const view = playerView(trial);
    const unmapped: HandCardView = {
      uid: "unmapped#test",
      defId: "__none__" as CardId,
      name: "Unmapped",
      cost: 1,
      text: "Fallback aperture.",
      opens: false,
      consume: "none",
      disabled: false,
      disabledReason: null,
      consumeArmed: false,
      consumeDimmed: false,
    };
    view.hand[2] = unmapped;
    const host = document.createElement("div");
    renderCardTrialWindows(
      host,
      {
        view,
        phase: "hand",
        cursor: 0,
        targetIds: [],
        targetCursor: 0,
        flash: null,
        result: null,
      },
      noop
    );
    const cards = [...host.querySelectorAll(".ct-card")];
    const fallback = cards[2]?.querySelector(".ct-card-art");
    expect(cards[2]?.querySelector(".ct-card-name")?.textContent).toBe("Unmapped");
    expect(fallback?.classList.contains("ct-card-art-fallback")).toBe(true);
    expect(cards[2]?.querySelector("img.ct-card-art-img")).toBeNull();
    expect(cards.every((c) => c.querySelector(".ct-card-art"))).toBe(true);
    expect(cards.filter((c) => c.querySelector("img.ct-card-art-img"))).toHaveLength(4);
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
});
