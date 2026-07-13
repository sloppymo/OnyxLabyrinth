/**
 * Regression tests for the FF6 combat controller's input routing.
 *
 * The history: a missing `selectTechnique` case in `handleKey()`'s phase
 * switch caused every melee "Tech" menu to soft-lock. These tests directly
 * verify that every selection phase routes to `handleSelectionKey`, without
 * relying on the animation/render loop that makes full controller tests flaky
 * in jsdom.
 */

import { describe, it, expect, beforeAll, vi } from "vitest";

// Set up the DOM shell before importing combat-ui, which pulls in shell.ts.
const app = document.createElement("div");
app.id = "app";
document.body.appendChild(app);

vi.stubGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  fillText: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  rotate: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  ellipse: vi.fn(),
  arc: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
  setTransform: vi.fn(),
  createLinearGradient: vi.fn(() => ({
    addColorStop: vi.fn(),
  })),
  globalAlpha: 1,
  imageSmoothingEnabled: true,
  fillStyle: "",
  strokeStyle: "",
  lineWidth: 1,
})) as any;

import { CombatController } from "./combat-ui";
import { createCombatState } from "../game/combat";
import { createCharacter } from "../game/party";
import type { EnemyDef } from "../data/enemies";

function makeEnemy(instanceId: string) {
  const def = {
    id: "test-rat",
    name: "Test Rat",
    hp: 10,
    attack: 4,
    ac: 0,
    agi: 5,
    xp: 3,
    gold: 2,
    rowPreference: "front",
    special: [],
    isBoss: false,
  } as EnemyDef;
  return { ...def, instanceId, currentHp: def.hp, row: "front", status: [] };
}

describe("CombatController input routing", () => {
  let CombatControllerCtor: typeof CombatController;

  beforeAll(async () => {
    const mod = await import("./combat-ui");
    CombatControllerCtor = mod.CombatController;
  });

  function freshController() {
    const party = [
      createCharacter("c0", "Alice", "Human", "Neutral", "Fighter", 0),
      createCharacter("c1", "Bob", "Human", "Neutral", "Mage", 1),
    ];
    const state = createCombatState(party, { front: [makeEnemy("rat-0")], back: [] }, false);
    return new CombatControllerCtor(state, { onEnd: () => {} });
  }

  function setSelectionPhase(
    controller: CombatController,
    phase: "selectTarget" | "selectSpell" | "selectItem" | "selectTechnique"
  ) {
    const c = controller as any;
    c.phase = phase;
    c.selectionEntries = [{ label: "Test", detail: "" }];
    c.selectionIds = ["test-id"];
    c.selectionIndex = 0;
    c.currentActorId = "c0";
    c.pending = { kind: phase === "selectTechnique" ? "technique" : "attack" };
    return c;
  }

  it.each([
    ["selectTarget"],
    ["selectSpell"],
    ["selectItem"],
    ["selectTechnique"],
  ] as const)("routes %s keys to handleSelectionKey", (phase) => {
    const controller = freshController();
    const c = setSelectionPhase(controller, phase);
    const spy = vi.spyOn(controller as any, "handleSelectionKey");

    controller.handleKey("ArrowDown");

    expect(spy).toHaveBeenCalledWith("ArrowDown");
    controller.destroy();
  });

  it("opens technique selection from the action menu", () => {
    const controller = freshController();
    const c = controller as any;
    c.phase = "menu";
    c.currentActorId = "c0";
    c.menuEntries = [
      { kind: "attack", label: "Attack" },
      { kind: "technique", label: "Tech" },
      { kind: "cast", label: "Magic" },
      { kind: "defend", label: "Defend" },
      { kind: "item", label: "Item" },
      { kind: "flee", label: "Run" },
    ];
    c.menuIndex = 1; // Technique
    c.pending = null;

    controller.handleKey("Enter");

    expect(c.phase).toBe("selectTechnique");
    expect(c.selectionTitle).toBe("Technique");
    expect(c.selectionEntries.length).toBeGreaterThan(0);
    controller.destroy();
  });

  it("backs out of selectTechnique with Escape", () => {
    const controller = freshController();
    const c = setSelectionPhase(controller, "selectTechnique");

    controller.handleKey("Escape");

    expect(c.phase).toBe("menu");
    expect(c.pending).toBeNull();
    controller.destroy();
  });
});
