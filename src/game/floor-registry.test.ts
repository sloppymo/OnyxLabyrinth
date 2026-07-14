import { describe, it, expect } from "vitest";
import { FLOORS } from "../data/floors";
import { getFloors, findFloor, registerFloorDef, registerFloorMap } from "./floor-registry";
import { floorDefToMap, mapToFloorDef, newFloorMapJSON } from "./floor-map";
import { carveRoom } from "./dungeon";

describe("floor-registry", () => {
  it("serves campaign floors plus the shipped demo pack, sorted by id", () => {
    const ids = getFloors().map((f) => f.id);
    expect(ids).toEqual([1, 2, 3, 4]);
    expect(findFloor(4)?.name).toBe("The Practice Halls");
  });

  it("findFloor resolves campaign floors and misses unknown ids", () => {
    expect(findFloor(2)?.name).toBe(FLOORS[1].name);
    expect(findFloor(77)).toBeUndefined();
  });

  it("hot-registering a new id extends the list", () => {
    const floor = mapToFloorDef(newFloorMapJSON(5, 5, { id: 77, name: "Hot Floor" }));
    carveRoom(floor.grid, 1, 1, 3, 3);
    registerFloorDef(floor);
    expect(findFloor(77)?.name).toBe("Hot Floor");
    const ids = getFloors().map((f) => f.id);
    expect(ids).toEqual([1, 2, 3, 4, 77]);
  });

  it("hot-registering an existing id replaces it (playtest flow)", () => {
    const replacement = floorDefToMap(FLOORS[0]);
    replacement.name = "Modded Crypt";
    const registered = registerFloorMap(replacement);
    expect(registered.name).toBe("Modded Crypt");
    expect(findFloor(1)?.name).toBe("Modded Crypt");
    expect(getFloors().filter((f) => f.id === 1).length).toBe(1);
  });
});
