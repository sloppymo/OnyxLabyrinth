import { describe, it, expect } from "vitest";
import { FLOORS, type FloorDef } from "../data/floors";
import { getFloors, findFloor } from "./floor-registry";
import {
  floorDefToMap,
  mapToFloorDef,
  parseFloorMapJSON,
  newFloorMapJSON,
  type FloorMapJSON,
} from "./floor-map";
import { validateFloorMap, validateFloorDef } from "./floor-validate";
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

function rampFloor(): FloorDef {
  const floor = mapToFloorDef(newFloorMapJSON(7, 5));
  carveRoom(floor.grid, 1, 2, 5, 2);
  floor.startX = 1;
  floor.startY = 2;
  floor.heightZones = [
    { id: "connector-air", x1: 2, y1: 2, x2: 2, y2: 2, ceilingZ: 2 },
    { id: "high", x1: 3, y1: 2, x2: 5, y2: 2, floorZ: 1, ceilingZ: 3 },
  ];
  floor.ramps = [{ x: 2, y: 2, dir: "e", surface: "ramp" }];
  return floor;
}

function issuesFor(floor: FloorDef): { code: string; severity: string }[] {
  return validateFloorDef(floor).map((i) => ({ code: i.code, severity: i.severity }));
}

function codes(floor: FloorDef): string[] {
  return issuesFor(floor).map((i) => i.code);
}

describe("floor-validate content checks", () => {
  it("accepts tall-ceiling zones over traversable cells", () => {
    const floor = testFloor();
    floor.heightZones = [
      { id: "tall-room", x1: 2, y1: 2, x2: 3, y2: 3, ceilingZ: 3 },
    ];
    const heightErrors = validateFloorDef(floor).filter(
      (issue) => issue.severity === "error" && issue.code.startsWith("height_")
    );
    expect(heightErrors).toEqual([]);
  });

  it("rejects invalid height volumes and out-of-bounds zones", () => {
    const floor = testFloor();
    floor.heightZones = [
      { id: "inverted", x1: 2, y1: 2, x2: 2, y2: 2, floorZ: 2, ceilingZ: 1 },
      { id: "outside", x1: 4, y1: 4, x2: 8, y2: 8, ceilingZ: 20 },
    ];
    const result = codes(floor);
    expect(result).toContain("height_volume_inverted");
    expect(result).toContain("height_zone_oob");
    expect(result).toContain("height_out_of_range");
  });

  it("rejects open portals whose air volumes do not overlap", () => {
    const floor = testFloor();
    floor.heightZones = [
      { id: "raised", x1: 3, y1: 2, x2: 3, y2: 2, floorZ: 2, ceilingZ: 3 },
    ];
    expect(codes(floor)).toContain("height_open_no_overlap");
  });

  it("rejects traversable floor steps without a matching connector", () => {
    const floor = testFloor();
    floor.heightZones = [
      { id: "step", x1: 3, y1: 2, x2: 3, y2: 2, floorZ: 0.5, ceilingZ: 2 },
    ];
    expect(codes(floor)).toContain("height_surface_mismatch");
  });

  it("accepts a bidirectional ramp with exact low/high endpoints", () => {
    const issues = validateFloorDef(rampFloor()).filter(
      (issue) => issue.severity === "error" &&
        (issue.code.startsWith("ramp_") || issue.code.startsWith("height_"))
    );
    expect(issues).toEqual([]);
  });

  it("rejects zero-rise, blocked-endpoint, side-open, and low-clearance ramps", () => {
    const zero = rampFloor();
    zero.heightZones = [
      { id: "flat", x1: 2, y1: 2, x2: 5, y2: 2, floorZ: 0, ceilingZ: 1 },
    ];
    expect(codes(zero)).toContain("ramp_zero_rise");

    const blocked = rampFloor();
    setEdge(blocked.grid, 2, 2, "e", "door");
    expect(codes(blocked)).toContain("ramp_endpoint_edge");

    const side = rampFloor();
    carveRoom(side.grid, 2, 1, 2, 2);
    expect(codes(side)).toContain("ramp_side_open");

    const low = rampFloor();
    low.heightZones![0].ceilingZ = 1.2;
    expect(codes(low)).toContain("height_clearance_too_small");
  });

  it("rejects duplicate, out-of-bounds, and occupied connector cells", () => {
    const floor = rampFloor();
    floor.ramps!.push({ ...floor.ramps![0], surface: "stairs" });
    floor.ramps!.push({ x: 99, y: 99, dir: "n", surface: "ramp" });
    floor.mapSprites = [{ x: 2, y: 2, spriteId: "crate" }];
    floor.npcs = [{
      id: "ramp-npc",
      name: "Ramp NPC",
      title: "Tester",
      x: 2,
      y: 2,
      greeting: "No.",
      returnGreeting: "Still no.",
      topics: [],
      combatEnemyIds: [],
    }];
    const result = codes(floor);
    expect(result).toContain("ramp_duplicate");
    expect(result).toContain("ramp_oob");
    expect(result).toContain("ramp_map_sprite_unsupported");
    expect(result).toContain("ramp_npc_unsupported");
  });

  it("campaign floors validate with zero errors and zero warnings", () => {
    for (const floor of getFloors()) {
      const issues = validateFloorDef(floor, { floors: getFloors() }).filter((i) => {
        if (i.severity === "info") return false;
        // hotboi-tavern is a deliberate one-off zone theme (a real,
        // shipped folder under public/assets/tilesets/hotboi/), not one of
        // the five numbered per-floor themes BUILT_IN_TILESET_THEMES
        // tracks — the validator's "not bundled" check is a false positive
        // here, not a missing-asset bug.
        if (i.code === "tileset_theme_unknown" && i.message.includes("hotboi")) return false;
        // namanda is the Church of Saint Namanda's own shipped theme folder
        // (public/assets/tilesets/namanda/), the same kind of deliberate
        // one-off zone as hotboi above.
        if (i.code === "tileset_theme_unknown" && i.message.includes("namanda")) return false;
        // The church's zone rectangles deliberately override the wider
        // cut-bell-chapel/ember-suture zones they sit inside of (last-zone-
        // wins is the documented precedence in floor-map.ts's themeAt) —
        // see art/pixellab-candidates/namanda-church for the room layout.
        if (i.code === "tileset_zone_overlap" && i.message.includes("namanda-church")) return false;
        // The altar is a physical interaction point, not a character — it
        // is deliberately unfightable (engine/namanda-ui.ts).
        if (i.code === "npc_no_combat" && i.message.includes("namanda-altar")) return false;
        return true;
      });
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

  it("does not flag an NPC with no mapSpriteId — absent is the default, not an error", () => {
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
        combatEnemyIds: [],
      },
    ];
    expect(codes(floor)).not.toContain("npc_sprite_unknown");
  });

  it("flags an NPC mapSpriteId that isn't registered in MAP_SPRITES", () => {
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
        combatEnemyIds: [],
        mapSpriteId: "no-such-sprite",
      },
    ];
    const issues = validateFloorDef(floor).filter((i) => i.code === "npc_sprite_unknown");
    expect(issues.length).toBe(1);
    expect(issues[0].message).toContain("no-such-sprite");
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
    const floor2 = findFloor(2)!;
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

  it("validates tileset zone bounds, themes, ids, and last-wins overlaps", () => {
    const floor = testFloor();
    floor.tilesetZones = [
      { id: "same", x1: 1, y1: 1, x2: 3, y2: 3, theme: "f2" },
      { id: "same", x1: 2, y1: 2, x2: 4, y2: 4, theme: "missing-theme" },
      { id: "reverse", x1: 4, y1: 4, x2: 3, y2: 3, theme: "f3" },
      { id: "outside", x1: 0, y1: 0, x2: 8, y2: 8, theme: "f4" },
    ];
    const c = codes(floor);
    expect(c).toContain("tileset_zone_dup_id");
    expect(c).toContain("tileset_zone_overlap");
    expect(c).toContain("tileset_theme_unknown");
    expect(c).toContain("tileset_zone_order");
    expect(c).toContain("tileset_zone_oob");
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

  it("rejects locked and barred edges whose heights would still block after opening", () => {
    const floor = testFloor();
    floor.heightZones = [
      { id: "low", x1: 2, y1: 2, x2: 2, y2: 2, floorZ: 0, ceilingZ: 2 },
      { id: "high", x1: 3, y1: 2, x2: 3, y2: 2, floorZ: 1, ceilingZ: 3 },
    ];
    setEdge(floor.grid, 2, 2, "e", "locked");
    setEdge(floor.grid, 3, 2, "w", "locked");
    expect(codes(floor)).toContain("height_surface_mismatch_sealed");

    const barred = testFloor();
    barred.heightZones = floor.heightZones;
    setEdge(barred.grid, 2, 2, "e", "barred");
    setEdge(barred.grid, 3, 2, "w", "barred");
    expect(codes(barred)).toContain("height_surface_mismatch_sealed");
  });

  it("accepts an open edge with matching heights once a barred gate is opened", () => {
    const floor = testFloor();
    floor.heightZones = [
      { id: "low", x1: 2, y1: 2, x2: 2, y2: 2, floorZ: 0, ceilingZ: 2 },
      { id: "high", x1: 3, y1: 2, x2: 3, y2: 2, floorZ: 0, ceilingZ: 2 },
    ];
    setEdge(floor.grid, 2, 2, "e", "barred");
    setEdge(floor.grid, 3, 2, "w", "barred");
    expect(
      validateFloorDef(floor).filter(
        (i) =>
          i.severity === "error" &&
          (i.code === "height_surface_mismatch" || i.code === "height_surface_mismatch_sealed")
      )
    ).toEqual([]);
  });

  it("rejects teleporter and chute destinations that land on a ramp", () => {
    const floor = rampFloor();
    setTile(floor.grid, 1, 2, "teleporter");
    floor.teleporters = [{ x: 1, y: 2, toFloorId: floor.id, toX: 2, toY: 2 }];
    expect(codes(floor)).toContain("link_lands_on_connector");

    const chute = rampFloor();
    chute.chuteDrops = [{ x: 1, y: 2, toFloorId: chute.id, toX: 2, toY: 2 }];
    expect(codes(chute)).toContain("link_lands_on_connector");
  });

  it("allows an elevated flat teleporter destination", () => {
    const floor = testFloor();
    floor.heightZones = [
      { id: "raised", x1: 2, y1: 2, x2: 2, y2: 2, floorZ: 2, ceilingZ: 3 },
    ];
    setTile(floor.grid, 3, 2, "teleporter");
    floor.teleporters = [{ x: 3, y: 2, toFloorId: floor.id, toX: 2, toY: 2 }];
    const errors = validateFloorDef(floor).filter(
      (i) => i.severity === "error" && i.code.startsWith("link_")
    );
    expect(errors).toEqual([]);
  });

  it("rejects connector cells occupied by interactive features", () => {
    const floor = rampFloor();
    for (const tile of ["treasure", "event", "water", "teleporter", "chute", "guardian"] as const) {
      const f = mapToFloorDef(floorDefToMap(floor));
      setTile(f.grid, 2, 2, tile);
      expect(codes(f)).toContain("ramp_tile_unsupported");
    }

    const overlays = rampFloor();
    overlays.treasures = [{ x: 2, y: 2, itemIds: ["crypt-key"] }];
    overlays.events = [{ x: 2, y: 2, kind: "message", message: "nope" }];
    overlays.waters = [{ x: 2, y: 2, depth: 1 }];
    overlays.teleporters = [{ x: 2, y: 2, toFloorId: 2, toX: 1, toY: 1 }];
    overlays.chuteDrops = [{ x: 2, y: 2, toFloorId: 2, toX: 1, toY: 1 }];
    const c = new Set(codes(overlays));
    expect(c).toContain("ramp_treasure_unsupported");
    expect(c).toContain("ramp_event_unsupported");
    expect(c).toContain("ramp_water_unsupported");
    expect(c).toContain("ramp_teleporter_unsupported");
    expect(c).toContain("ramp_chute_unsupported");
  });

  it("enforces minimum camera clearance", () => {
    const floor = rampFloor();
    floor.heightZones![0].ceilingZ = 1.2;
    expect(codes(floor)).toContain("height_clearance_too_small");
  });

  it("treats a ramp endpoint as reachable through height-aware BFS", () => {
    const floor = rampFloor();
    floor.treasures = [{ x: 4, y: 2, itemIds: ["crypt-key"] }];
    const errors = validateFloorDef(floor).filter(
      (i) => i.severity === "error" && i.code === "unreachable"
    );
    expect(errors).toEqual([]);
  });
});
