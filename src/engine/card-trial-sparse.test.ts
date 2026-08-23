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
    expect(host.querySelector(".ct-energy")?.textContent).toMatch(/◆\s*3\/3/);
    expect(host.querySelector(".ct-draw")?.textContent).toMatch(/Draw/);
    expect(host.querySelector(".ct-sparse-rat")?.textContent).toMatch(/RAT Front/);
    expect(host.querySelectorAll(".ct-actor-chip.hero").length).toBe(2);
    expect(host.querySelectorAll(".ct-actor-chip.enemy").length).toBeGreaterThan(0);
    expect(host.querySelector(".ct-chip-atk")?.textContent).toMatch(/ATK/);
    expect(host.textContent).not.toMatch(/\bEND TURN\b/);
    expect([...host.querySelectorAll(".ct2-card")].some((c) => c.textContent?.includes("Swarm the Wound"))).toBe(
      true
    );
    ui.destroy();
  });

  it("shows Guard-aware intent details only while held", () => {
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
    ui.sync({ ...base, detailsHeld: true }, noop);
    const details = host.querySelector(".ct-sparse-details") as HTMLElement;
    expect(details.hidden).toBe(false);
    expect(details.textContent).toContain("Guard 5");
    expect(details.textContent).toMatch(/\d+\s*→\s*\d+\s*HP/);
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
    const chip = host.querySelector(".ct-actor-chip.enemy.targetable") as HTMLButtonElement;
    expect(chip).toBeTruthy();
    chip.dispatchEvent(new Event("pointerenter", { bubbles: true }));
    chip.click();
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
