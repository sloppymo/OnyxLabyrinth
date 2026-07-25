import { describe, expect, it } from "vitest";
import { asciiMap, availableActionsFor, buildSnapshot } from "./snapshot";
import { createGameState } from "../game/state";
import type { FloorDef } from "../data/floors";
import type { Cell, GameState, Grid } from "../types";

/** Fully walled cell; individual edges are opened per test. */
function cell(overrides: Partial<Cell> = {}): Cell {
  return { n: "wall", e: "wall", s: "wall", w: "wall", ...overrides };
}

/**
 * 3x3 test floor. The middle row (y=1) is an open east-west corridor with a
 * door on the east edge of the centre cell and a treasure tile at (2,1).
 */
function testFloor(): FloorDef {
  const grid: Grid = [
    [cell(), cell(), cell()],
    [
      cell({ e: "open" }),
      cell({ w: "open", e: "door" }),
      cell({ w: "door", tile: "treasure" }),
    ],
    [cell(), cell(), cell()],
  ];
  return {
    id: 1,
    name: "Test Floor",
    width: 3,
    height: 3,
    grid,
    startX: 1,
    startY: 1,
    encounterRate: 0,
    tilesetTheme: "f1",
  };
}

function stateOnTestFloor(): GameState {
  const state = createGameState(testFloor());
  state.mode = "dungeon";
  state.player = { x: 1, y: 1, facing: 0 };
  return state;
}

const NO_MESSAGE = { text: "", visible: false };

describe("buildSnapshot", () => {
  it("reports the route rather than the bare mode for borrowed-title overlays", () => {
    const state = stateOnTestFloor();
    state.mode = "title";

    const snap = buildSnapshot({
      state,
      route: "save",
      message: NO_MESSAGE,
      mapVisible: false,
      inArena: false,
    });

    expect(snap.mode).toBe("title");
    expect(snap.route).toBe("save");
  });

  it("includes floor, position and compass for the current player state", () => {
    const state = stateOnTestFloor();
    state.player = { x: 2, y: 1, facing: 1 };

    const snap = buildSnapshot({
      state,
      route: "dungeon",
      message: NO_MESSAGE,
      mapVisible: false,
      inArena: false,
    });

    expect(snap.floor).toEqual({ id: 1, name: "Test Floor", theme: "f1" });
    expect(snap.pos).toEqual({ x: 2, y: 1, facing: 1, compass: "E" });
    expect(snap.tile).toBe("treasure");
  });

  it("serializes Set-valued state fields as arrays", () => {
    const state = stateOnTestFloor();
    state.explored.add("1,1");
    state.unlockedDoors.add("1:1:1:e");

    const snap = buildSnapshot({
      state,
      route: "dungeon",
      message: NO_MESSAGE,
      mapVisible: false,
      inArena: false,
    });

    expect(JSON.stringify(snap)).not.toContain("{}");
    expect(snap.explored).toEqual(["1,1"]);
    expect(snap.unlockedDoors).toEqual(["1:1:1:e"]);
  });

  it("omits the floor grid unless the map option is set", () => {
    const state = stateOnTestFloor();

    const withoutMap = buildSnapshot({
      state,
      route: "dungeon",
      message: NO_MESSAGE,
      mapVisible: false,
      inArena: false,
    });
    const withMap = buildSnapshot({
      state,
      route: "dungeon",
      message: NO_MESSAGE,
      mapVisible: false,
      inArena: false,
      map: true,
    });

    expect(withoutMap.map).toBeNull();
    expect(Array.isArray(withMap.map)).toBe(true);
  });

  it("summarizes the party without leaking character references", () => {
    const state = stateOnTestFloor();
    const first = state.party[0]!;

    const snap = buildSnapshot({
      state,
      route: "dungeon",
      message: NO_MESSAGE,
      mapVisible: false,
      inArena: false,
    });

    expect(snap.party).toHaveLength(state.party.length);
    expect(snap.party[0]).toMatchObject({
      id: first.id,
      name: first.name,
      level: first.level,
      hp: first.hp,
      maxHp: first.maxHp,
    });
    expect(snap.party[0]!.status).not.toBe(first.status);
  });

  it("exposes exact enemy HP when a combat view is supplied", () => {
    const state = stateOnTestFloor();
    state.mode = "combat";

    const snap = buildSnapshot({
      state,
      route: "combat",
      message: NO_MESSAGE,
      mapVisible: false,
      inArena: false,
      combat: {
        phase: "palette",
        actingCharId: "c1",
        roundEnding: false,
        playbackDone: true,
        selection: { title: "ATTACK", entries: ["Slime"], index: 0 },
        round: 2,
        enemies: [
          { id: "e1", name: "Slime", hp: 3, maxHp: 9, row: "front", status: [] },
        ],
        recentLog: ["Aria attacks!"],
        result: null,
      },
    });

    expect(snap.combat?.enemies[0]).toEqual({
      id: "e1",
      name: "Slime",
      hp: 3,
      maxHp: 9,
      row: "front",
      status: [],
    });
    expect(snap.combat?.round).toBe(2);
  });

  it("reports null combat outside of combat", () => {
    const snap = buildSnapshot({
      state: stateOnTestFloor(),
      route: "dungeon",
      message: NO_MESSAGE,
      mapVisible: false,
      inArena: false,
    });

    expect(snap.combat).toBeNull();
  });

  it("does not mutate the input state", () => {
    const state = stateOnTestFloor();
    const before = JSON.stringify({
      player: state.player,
      party: state.party,
      explored: [...state.explored],
    });

    buildSnapshot({
      state,
      route: "dungeon",
      message: NO_MESSAGE,
      mapVisible: false,
      inArena: false,
      map: true,
    });

    expect(
      JSON.stringify({
        player: state.player,
        party: state.party,
        explored: [...state.explored],
      })
    ).toBe(before);
  });
});

describe("availableActionsFor", () => {
  it("lists movement and menu verbs in the dungeon", () => {
    const actions = availableActionsFor("dungeon", stateOnTestFloor());

    expect(actions).toContain("forward");
    expect(actions).toContain("turnLeft");
    expect(actions).toContain("map");
    expect(actions).toContain("camp");
  });

  it("lists only the trap prompt verbs while a trap is pending", () => {
    const state = stateOnTestFloor();
    state.pendingTrap = { x: 1, y: 1, trapType: "gas", inspected: false };

    expect(availableActionsFor("trap", state)).toEqual([
      "inspect",
      "disarm",
      "open",
      "leave",
    ]);
  });

  it("lists menu navigation verbs for borrowed-title overlays", () => {
    const state = stateOnTestFloor();

    for (const route of ["save", "spell", "npc", "perk", "action_ring"] as const) {
      const actions = availableActionsFor(route, state);
      expect(actions, `route ${route}`).toContain("confirm");
      expect(actions, `route ${route}`).toContain("cancel");
    }
  });

  it("lists the combat palette verbs during a player turn", () => {
    const state = stateOnTestFloor();
    state.mode = "combat";

    const actions = availableActionsFor("combat", state, {
      phase: "palette",
      actingCharId: "c1",
      roundEnding: false,
      playbackDone: true,
      selection: null,
      round: 1,
      enemies: [],
      recentLog: [],
      result: null,
    });

    expect(actions).toContain("confirm");
    expect(actions).toContain("up");
  });

  it("offers no actions while combat playback is running", () => {
    const state = stateOnTestFloor();
    state.mode = "combat";

    const actions = availableActionsFor("combat", state, {
      phase: "playback",
      actingCharId: null,
      roundEnding: false,
      playbackDone: false,
      selection: null,
      round: 1,
      enemies: [],
      recentLog: [],
      result: null,
    });

    expect(actions).toEqual([]);
  });
});

describe("asciiMap", () => {
  it("marks the player with a facing glyph", () => {
    const floor = testFloor();
    const lines = asciiMap(floor, { x: 1, y: 1, facing: 0 }, new Set(["1,1"]));

    expect(lines.join("\n")).toContain("^");
  });

  it("renders walls, doors and unexplored cells", () => {
    const floor = testFloor();
    const lines = asciiMap(
      floor,
      { x: 1, y: 1, facing: 0 },
      new Set(["1,1", "2,1"])
    );
    const joined = lines.join("\n");

    expect(joined).toContain("+"); // door edge between (1,1) and (2,1)
    expect(joined).toContain("?"); // unexplored cells
    expect(lines.length).toBeGreaterThan(0);
  });

  it("limits output to the requested radius around the player", () => {
    const floor = testFloor();
    const full = asciiMap(floor, { x: 1, y: 1, facing: 0 }, new Set(["1,1"]));
    const tight = asciiMap(floor, { x: 1, y: 1, facing: 0 }, new Set(["1,1"]), 0);

    expect(tight.length).toBeLessThan(full.length);
  });
});
