import { describe, it, expect } from "vitest";
import { FLOORS, type FloorDef } from "../data/floors";
import {
  floorDefToMap,
  mapToFloorDef,
  parseFloorMapJSON,
  newFloorMapJSON,
  type FloorMapJSON,
} from "./floor-map";
import { validateFloorMap, validateFloorDef } from "./floor-validate";
import { getFloors } from "./floor-registry";
import { carveRoom, setTile, setEdge } from "./dungeon";
import demoFloorRaw from "../content/floors/floor-4-demo.json";

/** Small carved test floor: open 1..4 room, start inside. */
function testFloor(): FloorDef {
  const floor = mapToFloorDef(newFloorMapJSON(6, 6));
  carveRoom(floor.grid, 1, 1, 4, 4);
  floor.startX = 2;
  floor.startY = 2;
  return floor;
}

function issuesFor(floor: FloorDef): { code: string; severity: string }[] {
  return validateFloorDef(floor).map((i) => ({ code: i.code, severity: i.severity }));
}

function codes(floor: FloorDef): string[] {
  return issuesFor(floor).map((i) => i.code);
}

describe("floor-validate content checks", () => {
  it("campaign floors validate with zero errors and zero warnings", () => {
    // Registry context so floor 3's stairs_down resolves to the floor-4 pack.
    for (const floor of FLOORS) {
      const issues = validateFloorDef(floor, { floors: getFloors() }).filter(
        (i) => i.severity !== "info"
      );
      expect(issues, `floor ${floor.id}: ${issues.map((e) => e.message).join("; ")}`).toEqual([]);
    }
  });

  it("shipped demo pack parses and has no errors", () => {
    const map = parseFloorMapJSON(JSON.parse(JSON.stringify(demoFloorRaw)));
    const errors = validateFloorMap(map).filter((i) => i.severity === "error");
    expect(errors, errors.map((e) => e.message).join("; ")).toEqual([]);
  });

  it("flags unknown treasure item ids but accepts *-key ids", () => {
    const floor = testFloor();
    setTile(floor.grid, 2, 2, "treasure");
    floor.treasures = [{ x: 2, y: 2, itemIds: ["not-a-real-item", "custom-key"] }];
    const issues = validateFloorDef(floor);
    const itemErrors = issues.filter((i) => i.code === "item_unknown");
    expect(itemErrors.length).toBe(1);
    expect(itemErrors[0].message).toContain("not-a-real-item");
  });

  it("flags reward events without or with unknown itemId", () => {
    const floor = testFloor();
    setTile(floor.grid, 2, 3, "event");
    setTile(floor.grid, 3, 3, "event");
    floor.events = [
      { x: 2, y: 3, kind: "reward", message: "loot" },
      { x: 3, y: 3, kind: "reward", message: "loot", itemId: "bogus" },
    ];
    const c = codes(floor);
    expect(c).toContain("event_no_item");
    expect(c).toContain("item_unknown");
  });

  it("warns on damage events with no power", () => {
    const floor = testFloor();
    setTile(floor.grid, 2, 3, "event");
    floor.events = [{ x: 2, y: 3, kind: "damage", message: "ouch" }];
    expect(codes(floor)).toContain("event_no_power");
  });

  it("flags NPC combatEnemyIds that are not real enemies", () => {
    const floor = testFloor();
    setTile(floor.grid, 3, 2, "npc");
    floor.npcs = [
      {
        id: "test-npc",
        name: "Test",
        title: "tester",
        x: 3,
        y: 2,
        greeting: "hi",
        returnGreeting: "hi again",
        topics: [{ key: "a", response: "b" }],
        combatEnemyIds: ["skeleton", "no-such-enemy"],
      },
    ];
    const issues = validateFloorDef(floor).filter((i) => i.code === "npc_enemy_unknown");
    expect(issues.length).toBe(1);
    expect(issues[0].message).toContain("no-such-enemy");
  });

  it("errors on locked edges with no lockedDoors entry, once per physical edge", () => {
    const floor = testFloor();
    setEdge(floor.grid, 2, 2, "e", "locked");
    setEdge(floor.grid, 3, 2, "w", "locked");
    const issues = validateFloorDef(floor).filter((i) => i.code === "locked_edge_no_entry");
    expect(issues.length).toBe(1);
  });

  it("accepts a lockedDoors entry on either side of the edge", () => {
    for (const entry of [
      { x: 2, y: 2, dir: "e" as const, keyId: "test-key" },
      { x: 3, y: 2, dir: "w" as const, keyId: "test-key" },
    ]) {
      const floor = testFloor();
      setEdge(floor.grid, 2, 2, "e", "locked");
      setEdge(floor.grid, 3, 2, "w", "locked");
      setTile(floor.grid, 1, 1, "treasure");
      floor.treasures = [{ x: 1, y: 1, itemIds: ["test-key"] }];
      floor.lockedDoors = [entry];
      expect(codes(floor)).not.toContain("locked_edge_no_entry");
    }
  });

  it("rejects lock keyIds that do not end in -key and warns on unobtainable keys", () => {
    const floor = testFloor();
    setEdge(floor.grid, 2, 2, "e", "locked");
    setEdge(floor.grid, 3, 2, "w", "locked");
    floor.lockedDoors = [{ x: 2, y: 2, dir: "e", keyId: "healing-potion" }];
    expect(codes(floor)).toContain("lock_key_invalid");

    floor.lockedDoors = [{ x: 2, y: 2, dir: "e", keyId: "phantom-key" }];
    expect(codes(floor)).toContain("lock_key_offmap");
  });

  it("does not warn when the key sits in another known floor's chest", () => {
    // lexicon-key is chested on campaign floor 1 and unlocks floor 2.
    const floor2 = FLOORS[1];
    const issues = validateFloorDef(floor2);
    expect(issues.map((i) => i.code)).not.toContain("lock_key_offmap");
  });

  it("validates teleporter targets: unknown floor, oob, solid rock", () => {
    const base = () => {
      const floor = testFloor();
      setTile(floor.grid, 3, 3, "teleporter");
      return floor;
    };

    let floor = base();
    floor.teleporters = [{ x: 3, y: 3, toFloorId: 99, toX: 1, toY: 1 }];
    expect(codes(floor)).toContain("link_floor_unknown");

    floor = base();
    floor.id = 1; // shadows campaign floor 1: self-map used for target checks
    floor.teleporters = [{ x: 3, y: 3, toFloorId: 1, toX: 50, toY: 1 }];
    expect(codes(floor)).toContain("link_oob");

    floor = base();
    floor.id = 1;
    floor.teleporters = [{ x: 3, y: 3, toFloorId: 1, toX: 0, toY: 0 }];
    expect(codes(floor)).toContain("link_solid");

    floor = base();
    floor.id = 1;
    floor.teleporters = [{ x: 3, y: 3, toFloorId: 1, toX: 2, toY: 2 }];
    expect(codes(floor)).not.toContain("link_oob");
    expect(codes(floor)).not.toContain("link_solid");

    // Cross-floor: campaign floor 2's start is always carved.
    floor = base();
    floor.teleporters = [
      { x: 3, y: 3, toFloorId: 2, toX: FLOORS[1].startX, toY: FLOORS[1].startY },
    ];
    const c = codes(floor);
    expect(c).not.toContain("link_floor_unknown");
    expect(c).not.toContain("link_solid");
  });

  it("warns when stairs imply a floor id that does not exist", () => {
    const floor = testFloor();
    floor.id = 42;
    setTile(floor.grid, 2, 3, "stairs_down");
    setTile(floor.grid, 3, 3, "stairs_up");
    const stairs = validateFloorDef(floor).filter((i) => i.code === "stairs_target_missing");
    expect(stairs.length).toBe(2);
  });

  it("does not warn for stairs whose neighbor exists", () => {
    const floor = testFloor();
    floor.id = 2;
    setTile(floor.grid, 2, 3, "stairs_down");
    setTile(floor.grid, 3, 3, "stairs_up");
    expect(codes(floor)).not.toContain("stairs_target_missing");
  });

  it("reports deprecated encounterTable and missing encounter tables", () => {
    const floor = testFloor();
    floor.id = 42;
    floor.encounterTable = ["slime"];
    const c = codes(floor);
    expect(c).toContain("encounter_table_unused");
    expect(c).toContain("no_encounter_table");
  });

  it("errors on zone tableFloorId with no table and warns on duplicate zone ids", () => {
    const floor = testFloor();
    floor.encounterZones = [
      { id: "z1", x1: 1, y1: 1, x2: 2, y2: 2, rateMul: 1, tableFloorId: 77 },
      { id: "z1", x1: 3, y1: 3, x2: 4, y2: 4, rateMul: 0 },
    ];
    const c = codes(floor);
    expect(c).toContain("zone_table_unknown");
    expect(c).toContain("zone_dup_id");
  });

  it("warns on duplicate NPC ids", () => {
    const floor = testFloor();
    setTile(floor.grid, 2, 3, "npc");
    setTile(floor.grid, 3, 3, "npc");
    const npc = (x: number, y: number) => ({
      id: "same-id",
      name: "Twin",
      title: "twin",
      x,
      y,
      greeting: "hi",
      returnGreeting: "hi",
      topics: [{ key: "a", response: "b" }],
      combatEnemyIds: ["skeleton"],
    });
    floor.npcs = [npc(2, 3), npc(3, 3)];
    expect(codes(floor)).toContain("npc_dup_id");
  });

  it("accepts extra pack floors through the context option", () => {
    const floor = testFloor();
    setTile(floor.grid, 3, 3, "teleporter");
    floor.teleporters = [{ x: 3, y: 3, toFloorId: 99, toX: 2, toY: 2 }];

    const packMate = testFloor();
    packMate.id = 99;

    const map: FloorMapJSON = floorDefToMap(floor);
    const withContext = validateFloorMap(map, { floors: [...FLOORS, packMate] });
    expect(withContext.map((i) => i.code)).not.toContain("link_floor_unknown");
  });
});
