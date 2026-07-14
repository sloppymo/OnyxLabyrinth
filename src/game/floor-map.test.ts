import { describe, it, expect } from "vitest";
import { FLOORS } from "../data/floors";
import {
  floorDefToMap,
  mapToFloorDef,
  parseFloorMapJSON,
  newFloorMapJSON,
  cellIsPassable,
} from "./floor-map";
import { floorToAscii } from "./floor-ascii";
import { validateFloorDef, hasValidationErrors } from "./floor-validate";
import { carveRoom, setTile } from "./dungeon";

describe("floor-map", () => {
  it("round-trips campaign floor 1", () => {
    const f0 = FLOORS[0];
    const map = floorDefToMap(f0);
    const f1 = mapToFloorDef(map);
    expect(f1.id).toBe(f0.id);
    expect(f1.grid[5][5].e).toBe(f0.grid[5][5].e);
    expect(f1.treasures?.length).toBe(f0.treasures?.length);
  });

  it("parses JSON export", () => {
    const map = floorDefToMap(FLOORS[1]);
    const raw = JSON.parse(JSON.stringify(map));
    const parsed = parseFloorMapJSON(raw);
    expect(parsed.name).toBe(map.name);
    expect(parsed.grid.length).toBe(map.height);
  });

  it("rejects malformed overlay entries with precise errors", () => {
    const base = () => JSON.parse(JSON.stringify(floorDefToMap(FLOORS[0])));

    let raw = base();
    raw.lockedDoors = [{ x: 1, y: 1, dir: "q", keyId: "crypt-key" }];
    expect(() => parseFloorMapJSON(raw)).toThrow(/lockedDoors\[0\]\.dir/);

    raw = base();
    raw.treasures = [{ x: 1, y: 1, itemIds: "healing-potion" }];
    expect(() => parseFloorMapJSON(raw)).toThrow(/treasures\[0\]\.itemIds/);

    raw = base();
    raw.waters = [{ x: 1, y: 1, depth: 9 }];
    expect(() => parseFloorMapJSON(raw)).toThrow(/depth must be 1-4/);

    raw = base();
    raw.teleporters = [{ x: 1, y: 1, toFloorId: "two", toX: 0, toY: 0 }];
    expect(() => parseFloorMapJSON(raw)).toThrow(/teleporters\[0\]\.toFloorId/);

    raw = base();
    raw.events = [{ x: 1, y: 1, kind: "explode", message: "boom" }];
    expect(() => parseFloorMapJSON(raw)).toThrow(/events\[0\]\.kind/);

    raw = base();
    raw.npcs = [{ id: "a", name: "A", title: "t", x: 1, y: 1, greeting: "g", returnGreeting: "r", topics: "nope", combatEnemyIds: [] }];
    expect(() => parseFloorMapJSON(raw)).toThrow(/npcs\[0\]\.topics/);

    raw = base();
    raw.encounterZones = [{ id: "z", x1: 0, y1: 0, x2: 1, y2: 1 }];
    expect(() => parseFloorMapJSON(raw)).toThrow(/rateMul/);
  });

  it("preserves optional NPC and water fields through parse", () => {
    const map = newFloorMapJSON(5, 5);
    map.waters = [{ x: 1, y: 1, depth: 2, effect: { kind: "heal", power: 4 } }];
    map.npcs = [
      {
        id: "n",
        name: "N",
        title: "t",
        x: 2,
        y: 2,
        greeting: "g",
        returnGreeting: "r",
        topics: [{ key: "k", response: "v", hidden: true }],
        trades: [{ giveItemId: "healing-potion", receiveItemId: "antidote", once: true }],
        wantsItemId: "holy-symbol",
        rewardItemId: "long-sword+1",
        combatEnemyIds: ["skeleton"],
      },
    ];
    const parsed = parseFloorMapJSON(JSON.parse(JSON.stringify(map)));
    expect(parsed.waters?.[0].effect).toEqual({ kind: "heal", power: 4 });
    expect(parsed.npcs?.[0].topics[0].hidden).toBe(true);
    expect(parsed.npcs?.[0].trades?.[0].once).toBe(true);
    expect(parsed.npcs?.[0].wantsItemId).toBe("holy-symbol");
  });

  it("cellIsPassable detects carved room", () => {
    const floor = mapToFloorDef(newFloorMapJSON(5, 5));
    carveRoom(floor.grid, 1, 1, 3, 3);
    expect(cellIsPassable(floor.grid[2][2])).toBe(true);
    expect(cellIsPassable(floor.grid[0][0])).toBe(false);
  });
});

describe("floor-ascii", () => {
  it("includes start marker and legend", () => {
    const ascii = floorToAscii(FLOORS[0]);
    expect(ascii).toContain("@");
    expect(ascii).toContain("The Flooded Crypt");
    expect(ascii).toContain("crypt-key");
  });
});

describe("floor-validate", () => {
  it("campaign floors have no errors", () => {
    for (const floor of FLOORS) {
      const issues = validateFloorDef(floor);
      const errors = issues.filter((i) => i.severity === "error");
      expect(errors, `floor ${floor.id}: ${errors.map((e) => e.message).join("; ")}`).toEqual([]);
    }
  });

  it("flags asymmetric edge", () => {
    const map = newFloorMapJSON(4, 4);
    map.grid[1][1].e = "open";
    map.grid[1][2].w = "wall";
    const issues = validateFloorDef(mapToFloorDef(map));
    expect(hasValidationErrors(issues)).toBe(true);
    expect(issues.some((i) => i.code === "edge_asymmetric")).toBe(true);
  });

  it("flags treasure without tile", () => {
    const map = newFloorMapJSON(6, 6);
    carveRoom(mapToFloorDef(map).grid, 1, 1, 4, 4);
    const floor = mapToFloorDef(map);
    floor.treasures = [{ x: 2, y: 2, itemIds: ["healing-potion"] }];
    const issues = validateFloorDef(floor);
    expect(issues.some((i) => i.code === "treasure_tile")).toBe(true);
  });

  it("passes when treasure tile set", () => {
    const map = newFloorMapJSON(6, 6);
    const floor = mapToFloorDef(map);
    carveRoom(floor.grid, 1, 1, 4, 4);
    setTile(floor.grid, 2, 2, "treasure");
    floor.startX = 2;
    floor.startY = 2;
    floor.treasures = [{ x: 2, y: 2, itemIds: ["healing-potion"] }];
    const issues = validateFloorDef(floor);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
  });
});
