import { describe, expect, it } from "vitest";
import { createAdversarialTriangle, playerView } from "../game/card-trial/engine";
import { CardTrialSparseUi } from "./card-trial-sparse";
import type { CardTrialViewHandlers } from "./card-trial-view";

const noop: CardTrialViewHandlers = {
  onHoverCard: () => {},
  onConfirmCard: () => {},
  onMove: () => {},
  onPass: () => {},
  onHoverTarget: () => {},
  onConfirmTarget: () => {},
  onCancel: () => {},
};

function visiblePlates(host: HTMLElement): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>(".ct-actor-chip")].filter((plate) => !plate.hidden);
}

describe("CardTrialSparseUi", () => {
  it("renders a physical hand and actor HUD without the legacy blue panes", () => {
    const host = document.createElement("div");
    const ui = new CardTrialSparseUi(host);
    const view = playerView(createAdversarialTriangle());
    ui.sync(
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
    expect(host.querySelector(".ct-windows")).toBeNull();
    expect(host.querySelector(".ct-intents")).toBeNull();
    expect(host.querySelector(".ct-hand")).toBeNull();
    expect(host.querySelector(".ct-party")).toBeNull();
    expect(host.querySelectorAll(".ct2-card").length).toBe(5);
    expect(host.querySelector('[data-act="move"]')?.textContent).toContain("MOVE");
    expect(host.querySelector('[data-act="pass"]')?.textContent).toContain("PASS");
    expect(host.querySelector(".ct-energy")?.textContent).toMatch(/Energy\s*3\/3/i);
    expect(host.querySelector(".ct-deck")?.textContent).toMatch(
      new RegExp(`Deck\\s*${view.drawCount}`, "i")
    );
    expect(host.querySelector(".ct-sparse-rat")?.textContent).toMatch(/Rat\s*Front/i);
    const plates = visiblePlates(host);
    expect(plates).toHaveLength(1);
    expect(plates[0]?.textContent).toContain("Rat King");
    expect([...host.querySelectorAll<HTMLButtonElement>(".ct-actor-chip")].filter((plate) => plate.hidden).map((plate) => plate.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("Old Man"), expect.stringContaining("Cleaver")])
    );
    expect(host.querySelector(".ct-chip-intent")).toBeNull();
    expect(host.querySelector<HTMLDivElement>(".ct-instruction-strip")?.hidden).toBe(true);
    expect([...host.querySelectorAll<HTMLImageElement>(".ct-legal-marker")].filter((marker) => !marker.hidden)).toHaveLength(0);
    expect(host.querySelector<HTMLImageElement>('[data-actor="rat-king"] .ct-current-ring')?.hidden).toBe(false);
    expect(host.textContent).not.toMatch(/\bEND TURN\b/);
    expect([...host.querySelectorAll(".ct2-card")].some((c) => c.textContent?.includes("Swarm the Wound"))).toBe(
      true
    );
    ui.destroy();
  });

  it("shows Barrier-aware intent details only while held", () => {
    const host = document.createElement("div");
    const ui = new CardTrialSparseUi(host);
    const trial = createAdversarialTriangle();
    trial.heroes["rat-king"].guard = 5;
    const view = playerView(trial);
    const base = {
      view,
      phase: "hand" as const,
      cursor: 0,
      targetIds: [] as string[],
      targetCursor: 0,
      flash: null,
      result: null,
    };
    ui.sync(base, noop);
    expect((host.querySelector(".ct-sparse-details") as HTMLElement).hidden).toBe(true);
    const ratPlate = [...host.querySelectorAll<HTMLButtonElement>(".ct-actor-chip.hero")]
      .find((plate) => plate.textContent?.includes("Rat King"));
    expect(ratPlate?.textContent).not.toContain("Barrier 5");
    ui.sync({ ...base, detailsHeld: true }, noop);
    const details = host.querySelector(".ct-sparse-details") as HTMLElement;
    expect(details.hidden).toBe(false);
    expect(details.textContent).toContain("FIGHT 2");
    expect(details.textContent).toMatch(/Cleaver\s*·\s*Front/i);
    expect(details.textContent).toMatch(/Ash\s*·\s*Back\s*·\s*Opened/i);
    expect(details.textContent).toMatch(/CLEAVER.*our Front.*11/i);
    expect(details.textContent).toMatch(/ASH.*our Back.*8/i);
    expect(details.textContent).toContain("Barrier 5");
    expect(details.textContent).toMatch(/\d+\s*→\s*\d+\s*HP/);
    expect(ratPlate?.textContent).not.toContain("Barrier 5");
    expect([...host.querySelectorAll<HTMLButtonElement>(".ct-actor-chip")].every((plate) => !plate.textContent?.includes("our Front"))).toBe(true);
    expect(host.querySelector(".ct-chip-intent")).toBeNull();
    ui.destroy();
  });

  it("uses battlefield chips for targeting instead of a legacy target pane", () => {
    const host = document.createElement("div");
    const ui = new CardTrialSparseUi(host);
    const view = playerView(createAdversarialTriangle());
    const ids = view.enemies.filter((e) => !e.dead).map((e) => e.id);
    let hovered = -1;
    let confirmed = -1;
    ui.sync(
      {
        view,
        phase: "target",
        cursor: 0,
        targetIds: ids,
        targetCursor: 0,
        flash: null,
        result: null,
      },
      {
        ...noop,
        onHoverTarget: (i) => {
          hovered = i;
        },
        onConfirmTarget: (i) => {
          confirmed = i;
        },
      }
    );
    expect(host.querySelector(".ct-target")).toBeNull();
    expect(host.querySelector(".ct-sparse-target-hint")?.textContent).toMatch(/target/i);
    const plates = visiblePlates(host);
    expect(plates).toHaveLength(2);
    expect(plates.map((plate) => plate.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("Rat King")])
    );
    const selected = host.querySelector(".ct-actor-chip.enemy.targetable.targeted") as HTMLButtonElement;
    expect(selected).toBeTruthy();
    selected.dispatchEvent(new Event("pointerenter", { bubbles: true }));
    selected.click();
    expect(hovered).toBeGreaterThanOrEqual(0);
    expect(confirmed).toBeGreaterThanOrEqual(0);
    const hiddenLegalPlate = [...host.querySelectorAll<HTMLButtonElement>(".ct-actor-chip.enemy.targetable")]
      .find((plate) => plate.hidden);
    expect(hiddenLegalPlate).toBeTruthy();
    const hiddenLegalRoot = hiddenLegalPlate?.closest(".ct-actor-indicator") as HTMLElement;
    const edgeCue = hiddenLegalRoot.querySelector(".ct-target-edge") as HTMLDivElement;
    expect(edgeCue.hidden).toBe(false);
    edgeCue.dispatchEvent(new Event("pointerenter", { bubbles: true }));
    edgeCue.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(hovered).toBeGreaterThanOrEqual(0);
    expect(confirmed).toBeGreaterThanOrEqual(0);
    ui.destroy();
  });

  it("gives Move and Pass selected chrome when the utility cursor is there", () => {
    const host = document.createElement("div");
    const ui = new CardTrialSparseUi(host);
    const view = playerView(createAdversarialTriangle());
    ui.sync(
      {
        view,
        phase: "hand",
        cursor: view.hand.length,
        targetIds: [],
        targetCursor: 0,
        flash: null,
        result: null,
      },
      noop
    );
    expect(host.querySelector('[data-act="move"]')?.classList.contains("selected")).toBe(true);
    expect(host.querySelectorAll(".ct2-card.focused").length).toBe(0);
    ui.sync(
      {
        view,
        phase: "hand",
        cursor: view.hand.length + 1,
        targetIds: [],
        targetCursor: 0,
        flash: null,
        result: null,
      },
      noop
    );
    expect(host.querySelector('[data-act="pass"]')?.classList.contains("selected")).toBe(true);
    ui.destroy();
  });
});
