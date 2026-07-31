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
  quadraticCurveTo: vi.fn(),
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
import { ALL_SPELLS } from "../data/spells";

const SPELLS_BY_ID = Object.fromEntries(ALL_SPELLS.map((s) => [s.id, s]));

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
  ] as const)("routes %s keys via controller input", (phase) => {
    const controller = freshController();
    const c = setSelectionPhase(controller, phase);
    const before = c.selectionIndex;

    controller.handleKey("ArrowDown");

    expect(c.selectionIndex).toBe((before + 1) % c.selectionEntries.length);
    controller.destroy();
  });

  it("opens the skill list (techniques + Analyze) from the action palette", () => {
    const controller = freshController();
    const c = controller as any;
    c.phase = "palette";
    c.currentActorId = "c0";
    c.palette = {
      slots: [
        { kind: "attack" },
        { kind: "defend" },
        { kind: "cast", disabled: true },
        { kind: "skill", disabled: false },
      ],
      itemButton: "select",
      itemDisabled: false,
      autoButton: "start",
    };
    c.pending = null;

    controller.handleInput({ kind: "press", button: "y" });

    expect(c.phase).toBe("selectSkill");
    expect(c.selectionTitle).toBe("Skill");
    expect(c.selectionEntries.length).toBeGreaterThan(1);
    const labels = c.selectionEntries.map((e: { label: string }) => e.label);
    expect(labels).toContain("Analyze");
    expect(labels[labels.length - 1]).toBe("Move");
    controller.destroy();
  });

  it("Mage skill list contains Analyze and Move", () => {
    const controller = freshController();
    const c = controller as any;
    c.phase = "palette";
    c.currentActorId = "c1"; // Bob the Mage
    c.palette = {
      slots: [
        { kind: "attack" },
        { kind: "defend" },
        { kind: "cast", disabled: false },
        { kind: "skill", disabled: false },
      ],
      itemButton: "select",
      itemDisabled: false,
      autoButton: "start",
    };
    c.pending = null;

    controller.handleInput({ kind: "press", button: "y" });

    expect(c.phase).toBe("selectSkill");
    expect(c.selectionEntries.map((e: { label: string }) => e.label)).toEqual(["Analyze", "Move"]);
    controller.destroy();
  });

  it("Move opens a swap selection in a standard 4-person party (no row ever has room)", () => {
    // Front and back are always exactly 2/2 for the game's fixed 4-person
    // party, so Move can never slide into an empty slot — it always offers
    // a swap with a living ally in the opposite row.
    const party = [
      createCharacter("c0", "A", "Human", "Neutral", "Fighter", 0),
      createCharacter("c1", "B", "Human", "Neutral", "Mage", 1),
      createCharacter("c2", "C", "Human", "Neutral", "Thief", 2),
      createCharacter("c3", "D", "Human", "Neutral", "Priest", 3),
    ];
    const state = createCombatState(party, { front: [makeEnemy("rat-0")], back: [] }, false);
    const controller = new CombatControllerCtor(state, { onEnd: () => {} });
    const c = controller as any;
    c.phase = "palette";
    c.currentActorId = "c0";
    c.scene.activeActorId = "c0";
    c.palette = {
      slots: [
        { kind: "attack" },
        { kind: "defend" },
        { kind: "cast", disabled: true },
        { kind: "skill", disabled: false },
      ],
      itemButton: "select",
      itemDisabled: false,
      autoButton: "start",
    };
    c.pending = null;

    controller.handleInput({ kind: "press", button: "y" });
    c.selectionIndex = c.selectionEntries.length - 1; // Move
    controller.handleInput({ kind: "press", button: "a" });

    expect(c.phase).toBe("selectTarget");
    expect(c.selectionIds).toEqual(["c2", "c3"]);

    c.selectionIndex = 0; // swap with c2
    controller.handleInput({ kind: "press", button: "a" });

    expect(c.phase).toBe("playback");
    expect(c.state.party.find((p: { id: string }) => p.id === "c0").formationSlot).toBe(2);
    expect(c.state.party.find((p: { id: string }) => p.id === "c2").formationSlot).toBe(0);
    expect(c.lastCommandByActor.has("c0")).toBe(false);
    controller.destroy();
  });

  it("Move offers every living back-row ally as a swap target in a larger party", () => {
    const party = Array.from({ length: 6 }, (_, i) =>
      createCharacter(`c${i}`, `P${i}`, "Human", "Neutral", i < 3 ? "Fighter" : "Mage", i)
    );
    const state = createCombatState(party, { front: [makeEnemy("rat-0")], back: [] }, false);
    const controller = new CombatControllerCtor(state, { onEnd: () => {} });
    const c = controller as any;
    c.phase = "palette";
    c.currentActorId = "c0";
    c.scene.activeActorId = "c0";
    c.pending = null;

    controller.handleInput({ kind: "press", button: "y" });
    c.selectionIndex = c.selectionEntries.length - 1; // Move
    controller.handleInput({ kind: "press", button: "a" });

    expect(c.phase).toBe("selectTarget");
    expect(c.selectionIds).toEqual(["c2", "c3", "c4", "c5"]);

    c.selectionIndex = 0; // swap with c2
    controller.handleInput({ kind: "press", button: "a" });

    expect(c.phase).toBe("playback");
    expect(c.state.party.find((p: { id: string }) => p.id === "c0").formationSlot).toBe(2);
    expect(c.state.party.find((p: { id: string }) => p.id === "c2").formationSlot).toBe(0);
    controller.destroy();
  });

  it("the v shortcut fires Move", () => {
    const party = [
      createCharacter("c0", "A", "Human", "Neutral", "Fighter", 0),
      createCharacter("c1", "B", "Human", "Neutral", "Mage", 1),
      createCharacter("c2", "C", "Human", "Neutral", "Thief", 2),
      createCharacter("c3", "D", "Human", "Neutral", "Priest", 3),
    ];
    const state = createCombatState(party, { front: [makeEnemy("rat-0")], back: [] }, false);
    const controller = new CombatControllerCtor(state, { onEnd: () => {} });
    const c = controller as any;
    c.phase = "palette";
    c.currentActorId = "c0";
    c.scene.activeActorId = "c0";

    controller.handleKey("v");

    // Standard 4-person party: both rows are already full, so the shortcut
    // opens the swap picker rather than sliding immediately.
    expect(c.phase).toBe("selectTarget");
    expect(c.selectionIds).toEqual(["c2", "c3"]);
    controller.destroy();
  });

  it("confirming Analyze with one enemy fires immediately and is not remembered for Repeat", () => {
    const controller = freshController();
    const c = controller as any;
    c.phase = "palette";
    c.currentActorId = "c0";
    c.scene.activeActorId = "c0";
    c.palette = {
      slots: [
        { kind: "attack" },
        { kind: "defend" },
        { kind: "cast", disabled: true },
        { kind: "skill", disabled: false },
      ],
      itemButton: "select",
      itemDisabled: false,
      autoButton: "start",
    };
    c.pending = null;

    controller.handleInput({ kind: "press", button: "y" }); // open skill list
    // Move selection to the Analyze entry and confirm.
    c.selectionIndex = c.selectionEntries.findIndex((e: { label: string }) => e.label === "Analyze");
    controller.handleInput({ kind: "press", button: "a" });

    expect(c.phase).toBe("playback");
    expect(c.state.analyzedEnemies["Test Rat"]).toBe(true);
    expect(c.lastCommandByActor.has("c0")).toBe(false);
    controller.destroy();
  });

  it("the n shortcut fires Analyze directly", () => {
    const controller = freshController();
    const c = controller as any;
    c.phase = "palette";
    c.currentActorId = "c0";
    c.scene.activeActorId = "c0";

    controller.handleKey("n");

    expect(c.phase).toBe("playback");
    expect(c.state.analyzedEnemies["Test Rat"]).toBe(true);
    controller.destroy();
  });

  it("backs out of selectTechnique with Escape", () => {
    const controller = freshController();
    const c = setSelectionPhase(controller, "selectTechnique");

    controller.handleKey("Escape");

    expect(c.phase).toBe("palette");
    expect(c.pending).toBeNull();
    controller.destroy();
  });

  it("auto-confirms Attack when exactly one living enemy", () => {
    const controller = freshController();
    const c = controller as any;
    c.phase = "palette";
    c.currentActorId = "c0";
    c.scene.activeActorId = "c0";
    c.palette = {
      slots: [
        { kind: "attack" },
        { kind: "defend" },
        { kind: "cast", disabled: true },
        { kind: "skill", disabled: false },
      ],
      itemButton: "select",
      itemDisabled: false,
      autoButton: "start",
    };

    controller.handleKey("a");

    expect(c.stickyByActor.get("c0")).toEqual({
      kind: "attack",
      actorId: "c0",
      targetId: "rat-0",
    });
    expect(c.phase).toBe("playback");
    controller.destroy();
  });

  it("Repeat re-fires sticky Attack on the same target", () => {
    const controller = freshController();
    const c = controller as any;
    c.phase = "palette";
    c.currentActorId = "c0";
    c.stickyByActor.set("c0", {
      kind: "attack",
      actorId: "c0",
      targetId: "rat-0",
    });

    controller.handleKey("z");

    expect(c.phase).toBe("playback");
    expect(c.stickyByActor.get("c0")?.targetId).toBe("rat-0");
    controller.destroy();
  });

  it("Repeat flashes when sticky target is dead", () => {
    const controller = freshController();
    const c = controller as any;
    c.phase = "palette";
    c.currentActorId = "c0";
    c.stickyByActor.set("c0", {
      kind: "attack",
      actorId: "c0",
      targetId: "gone",
    });

    controller.handleKey("z");

    expect(c.phase).toBe("palette");
    expect(c.flash).toBe("No target!");
    controller.destroy();
  });

  it("prefocuses last-hit enemy in target select", () => {
    const party = [
      createCharacter("c0", "Alice", "Human", "Neutral", "Fighter", 0),
    ];
    const state = createCombatState(
      party,
      {
        front: [makeEnemy("rat-0"), makeEnemy("rat-1")],
        back: [],
      },
      false
    );
    // Boost rat-1 current HP so lowest-HP% alone wouldn't pick it.
    state.enemies.front[1].currentHp = 10;
    state.enemies.front[0].currentHp = 2;
    const controller = new CombatControllerCtor(state, { onEnd: () => {} });
    const c = controller as any;
    c.phase = "palette";
    c.currentActorId = "c0";
    c.lastHitEnemyId = "rat-1";
    c.pending = { kind: "attack" };
    c.openTargetSelect("enemy");

    expect(c.selectionIds[c.selectionIndex]).toBe("rat-1");
    controller.destroy();
  });

  it("Esc during playback skips choreography without ending the fight", () => {
    const controller = freshController();
    const c = controller as any;
    c.phase = "playback";
    c.scene.choreo = {
      start: performance.now(),
      duration: 5000,
      steps: [],
    };

    controller.handleKey("Escape");

    expect(c.scene.choreo).toBeNull();
    expect(c.phase).toBe("playback");
    expect(c.result).toBeNull();
    controller.destroy();
  });

  it("Q toggles party Auto and Q again disables without fleeing", () => {
    const controller = freshController();
    const c = controller as any;
    c.phase = "palette";
    c.currentActorId = "c0";
    c.palette = {
      slots: [
        { kind: "attack" },
        { kind: "defend" },
        { kind: "cast", disabled: true },
        { kind: "skill", disabled: false },
      ],
      itemButton: "select",
      itemDisabled: false,
      autoButton: "start",
    };
    c.lastCommandByActor.set("c0", {
      kind: "attack",
      targetId: "rat-0",
    });

    controller.handleKey("q");
    expect(c.partyAuto).toBe(true);
    expect(c.phase).toBe("playback");

    c.phase = "playback";
    controller.handleKey("q");
    expect(c.partyAuto).toBe(false);
    expect(c.result).toBeNull();
    controller.destroy();
  });

  it("party Auto never stores or fires Flee", () => {
    const controller = freshController();
    const c = controller as any;
    c.phase = "palette";
    c.currentActorId = "c0";
    c.chooseAction("flee");
    expect(c.lastCommandByActor.has("c0")).toBe(false);
    controller.destroy();
  });

  it("Auto falls back to Defend instead of repeating an unreachable Attack forever", () => {
    // Regression: a close-range weapon can never reach the back row
    // (combat-reach.ts). Before the fix, replaying a remembered attack
    // against a still-alive-but-unreachable target no-op'd every turn under
    // Auto instead of falling back — a real floor-4/5 death spiral.
    const closeRangeWeapon = {
      id: "test-close-blade",
      name: "Test Close Blade",
      type: "weapon",
      slot: "hand",
      attackBonus: 5,
      range: "close",
      price: 0,
    } as any;
    const party = [createCharacter("c0", "Alice", "Human", "Neutral", "Fighter", 0)];
    const backEnemy = { ...makeEnemy("boss-0"), row: "back" };
    const state = createCombatState(
      party,
      { front: [], back: [backEnemy] },
      true,
      {},
      {},
      { c0: { weapon: closeRangeWeapon, armor: [] } }
    );
    const controller = new CombatControllerCtor(state, { onEnd: () => {} });
    const c = controller as any;
    c.partyAuto = true;
    c.lastCommandByActor.set("c0", { kind: "attack", targetId: "boss-0" });

    c.openPaletteFor(state.party[0]);

    expect(c.lastCommandByActor.get("c0")).toEqual({ kind: "defend" });
    expect(c.phase).toBe("playback");
    controller.destroy();
  });

  it("Auto falls back to a reachable enemy when the remembered target is unreachable", () => {
    const closeRangeWeapon = {
      id: "test-close-blade",
      name: "Test Close Blade",
      type: "weapon",
      slot: "hand",
      attackBonus: 5,
      range: "close",
      price: 0,
    } as any;
    const party = [createCharacter("c0", "Alice", "Human", "Neutral", "Fighter", 0)];
    const backEnemy = { ...makeEnemy("boss-0"), row: "back" };
    const frontEnemy = makeEnemy("grunt-0");
    const state = createCombatState(
      party,
      { front: [frontEnemy], back: [backEnemy] },
      true,
      {},
      {},
      { c0: { weapon: closeRangeWeapon, armor: [] } }
    );
    const controller = new CombatControllerCtor(state, { onEnd: () => {} });
    const c = controller as any;
    c.partyAuto = true;
    c.lastCommandByActor.set("c0", { kind: "attack", targetId: "boss-0" });

    c.openPaletteFor(state.party[0]);

    expect(c.lastCommandByActor.get("c0")).toEqual({
      kind: "attack",
      targetId: "grunt-0",
    });
    controller.destroy();
  });

  it("LT/RT cycles party inspect without changing the actor", () => {
    const controller = freshController();
    const c = controller as any;
    c.phase = "palette";
    c.currentActorId = "c0";
    c.palette = {
      slots: [
        { kind: "attack" },
        { kind: "defend" },
        { kind: "cast", disabled: true },
        { kind: "skill", disabled: false },
      ],
      itemButton: "select",
      itemDisabled: false,
      autoButton: "start",
    };

    controller.handleInput({ kind: "press", button: "rt" });
    expect(c.inspectCharacterId).toBe("c1");
    expect(c.currentActorId).toBe("c0");

    controller.handleInput({ kind: "press", button: "lt" });
    expect(c.inspectCharacterId).toBeNull();

    controller.destroy();
  });

  it("Mage palette disables Magic when silenced", () => {
    const party = [
      createCharacter("c0", "Bob", "Human", "Neutral", "Mage", 1),
    ];
    party[0].knownSpellIds = ["mage-spark"];
    const state = createCombatState(party, { front: [makeEnemy("rat-0")], back: [] }, false);
    state.silencedThisRound = ["c0"];
    const controller = new CombatControllerCtor(state, { onEnd: () => {} });
    const c = controller as any;
    c.state.silencedThisRound = ["c0"];
    c.phase = "palette";
    c.currentActorId = "c0";
    c.palette = {
      slots: [
        { kind: "attack" },
        { kind: "defend" },
        { kind: "cast", disabled: true },
        { kind: "skill", disabled: true },
      ],
      itemButton: "select",
      itemDisabled: false,
      autoButton: "start",
    };

    controller.handleInput({ kind: "press", button: "x" });

    expect(c.flash).toBe("Silenced!");
    expect(c.phase).toBe("palette");
    controller.destroy();
  });

  it("the `h` shortcut rejects non-Thieves instead of burning the turn", () => {
    // Regression: `h` was unreachable until the palette whitelist was fixed.
    // resolveHide fizzles for non-Thieves but still spends the turn, so the
    // controller must reject it at the palette the way "cast" does.
    const party = [createCharacter("c0", "Bob", "Human", "Neutral", "Fighter", 1)];
    const state = createCombatState(party, { front: [makeEnemy("rat-0")], back: [] }, false);
    const controller = new CombatControllerCtor(state, { onEnd: () => {} });
    const c = controller as any;
    c.phase = "palette";
    c.currentActorId = "c0";

    controller.handleKey("h");

    expect(c.flash).toBe("Only a Thief can hide!");
    expect(c.phase).toBe("palette");
    controller.destroy();
  });

  it("the `h` shortcut hides a Thief and refuses to re-hide", () => {
    const party = [createCharacter("c0", "Sly", "Human", "Neutral", "Thief", 1)];
    const state = createCombatState(party, { front: [makeEnemy("rat-0")], back: [] }, false);
    const controller = new CombatControllerCtor(state, { onEnd: () => {} });
    const c = controller as any;
    c.phase = "palette";
    c.currentActorId = "c0";

    controller.handleKey("h");
    expect(c.flash).not.toBe("Only a Thief can hide!");

    // Second press while already hidden must not spend another turn.
    party[0].status.push("hidden");
    c.phase = "palette";
    c.currentActorId = "c0";
    controller.handleKey("h");
    expect(c.flash).toBe("Already hidden!");
    expect(c.phase).toBe("palette");
    controller.destroy();
  });

  it("Magic opens selectSpell with All tab and cycles categories with ←→ / 1–5", () => {
    const party = [createCharacter("c0", "Bob", "Human", "Neutral", "Mage", 0)];
    // Give a mixed book so tabs filter differently.
    party[0].knownSpellIds = [
      "mage-fire-bolt",
      "mage-arcane-ward",
      "mage-sleep",
    ];
    party[0].sp = 40;
    party[0].maxSp = 40;
    const state = createCombatState(
      party,
      { front: [makeEnemy("rat-0")], back: [] },
      false,
      SPELLS_BY_ID
    );
    const controller = new CombatControllerCtor(state, { onEnd: () => {} });
    const c = controller as any;
    c.phase = "palette";
    c.currentActorId = "c0";
    c.pending = null;
    c.palette = {
      slots: [
        { kind: "attack" },
        { kind: "defend" },
        { kind: "cast", disabled: false },
        { kind: "skill", disabled: false },
      ],
      itemButton: "select",
      itemDisabled: false,
      autoButton: "start",
    };

    controller.handleInput({ kind: "press", button: "x" });
    expect(c.phase).toBe("selectSpell");
    expect(c.spellCategoryTab).toBe("all");
    expect(c.selectionIds.length).toBe(3);

    controller.handleInput({ kind: "press", button: "right" });
    expect(c.spellCategoryTab).toBe("offense");
    expect(c.selectionIds).toEqual(["mage-fire-bolt"]);

    controller.handleKey("4"); // Buffs
    expect(c.spellCategoryTab).toBe("buffs");
    expect(c.selectionIds).toEqual(["mage-arcane-ward"]);

    controller.handleKey("5"); // Status
    expect(c.spellCategoryTab).toBe("status");
    expect(c.selectionIds).toEqual(["mage-sleep"]);

    controller.handleInput({ kind: "press", button: "b" });
    expect(c.phase).toBe("palette");
    controller.destroy();
  });

  it("empty Magic category stays on the sheet instead of backing out", () => {
    const party = [createCharacter("c0", "Bob", "Human", "Neutral", "Mage", 0)];
    party[0].knownSpellIds = ["mage-fire-bolt"];
    party[0].sp = 40;
    const state = createCombatState(
      party,
      { front: [makeEnemy("rat-0")], back: [] },
      false,
      SPELLS_BY_ID
    );
    const controller = new CombatControllerCtor(state, { onEnd: () => {} });
    const c = controller as any;
    c.phase = "selectSpell";
    c.currentActorId = "c0";
    c.pending = { kind: "cast" };
    c.spellCategoryTab = "defense";
    c.applySpellList(party[0]);

    expect(c.selectionIds).toEqual([]);
    controller.handleInput({ kind: "press", button: "up" });
    expect(c.phase).toBe("selectSpell");
    controller.handleInput({ kind: "press", button: "a" });
    expect(c.phase).toBe("selectSpell");
    controller.destroy();
  });
});
