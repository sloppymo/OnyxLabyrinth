import { describe, it, expect, beforeEach } from "vitest";
import { serialize, deserialize } from "./save";
import { createGameState } from "./state";
import { FLOORS } from "../data/floors";
import { createDefaultParty } from "./party";
import type { GameState } from "../types";

describe("save serialization", () => {
  let state: GameState;

  beforeEach(() => {
    state = createGameState(FLOORS[0]);
    state.party = createDefaultParty();
    state.partyGold = 100;
    state.dayCount = 3;
    state.inventory = ["potion", "potion", "antidote"];
    state.keys = ["iron-key"];
    state.explored = new Set(["1,2", "3,4"]);
    state.unlockedDoors = new Set(["1:5:6:N"]);
  });

  it("round-trips state through serialize/deserialize", () => {
    const json = serialize(state);
    const restored = deserialize(json);
    expect(restored).not.toBeNull();
    if (!restored) return;

    expect(restored.floor.id).toBe(state.floor.id);
    expect(restored.partyGold).toBe(100);
    expect(restored.dayCount).toBe(3);
    expect(restored.inventory).toEqual(["potion", "potion", "antidote"]);
    expect(restored.keys).toEqual(["iron-key"]);
    expect(restored.explored).toEqual(new Set(["1,2", "3,4"]));
    expect(restored.unlockedDoors).toEqual(new Set(["1:5:6:N"]));
  });

  it("preserves party character data", () => {
    state.party[0].hp = 5;
    state.party[0].status = ["poison"];
    const json = serialize(state);
    const restored = deserialize(json);
    expect(restored).not.toBeNull();
    if (!restored) return;

    expect(restored.party[0].hp).toBe(5);
    expect(restored.party[0].status).toEqual(["poison"]);
    // Status array should be a copy, not a reference.
    expect(restored.party[0].status).not.toBe(state.party[0].status);
  });

  it("converts combat mode to dungeon on save", () => {
    state.mode = "combat";
    const json = serialize(state);
    const restored = deserialize(json);
    expect(restored).not.toBeNull();
    if (!restored) return;
    expect(restored.mode).toBe("dungeon");
  });

  it("rejects saves with incompatible version", () => {
    const json = serialize(state);
    // Tamper with the version.
    const tampered = JSON.parse(json);
    tampered.version = 999;
    const result = deserialize(JSON.stringify(tampered));
    expect(result).toBeNull();
  });

  it("rejects saves with older version (no migration)", () => {
    const json = serialize(state);
    const tampered = JSON.parse(json);
    tampered.version = 1;
    const result = deserialize(JSON.stringify(tampered));
    expect(result).toBeNull();
  });

  it("handles corrupted JSON gracefully", () => {
    const result = deserialize("not valid json{{{");
    expect(result).toBeNull();
  });

  it("preserves exploredByFloor data", () => {
    // Note: serialize() overwrites exploredByFloor[currentFloorId] with the
    // current explored set. So floor 1 gets the current explored tiles.
    state.explored = new Set(["1,2", "3,4"]);
    state.exploredByFloor = { 2: ["5,6", "7,8"] };
    const json = serialize(state);
    const restored = deserialize(json);
    expect(restored).not.toBeNull();
    if (!restored) return;
    // Floor 1 = current explored (overwritten by serialize).
    expect(restored.exploredByFloor[1]).toEqual(["1,2", "3,4"]);
    // Floor 2 = preserved from the manual set.
    expect(restored.exploredByFloor[2]).toEqual(["5,6", "7,8"]);
  });
});
