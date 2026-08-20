import { describe, it, expect } from "vitest";
import { cloneFloor, FLOORS } from "../data/floors";
import { findFloor, getFloors } from "./floor-registry";
import {
  floorDefToMap,
  mapToFloorDef,
  parseFloorMapJSON,
  newFloorMapJSON,
  cellIsPassable,
  themeAt,
  themeForWallHit,
  tilesetThemesForFloor,
} from "./floor-map";
import { floorToAscii } from "./floor-ascii";
import { validateFloorDef, hasValidationErrors } from "./floor-validate";
import { carveRoom, setTile } from "./dungeon";

describe("floor-map", () => {
  it("round-trips campaign floor 1", () => {
    const f0 = findFloor(1)!;
    const map = floorDefToMap(f0);
    const f1 = mapToFloorDef(map);
    expect(f1.id).toBe(f0.id);
    expect(f1.grid[f0.startY][f0.startX].tile).toBe(f0.grid[f0.startY][f0.startX].tile);
    expect(f1.treasures?.length).toBe(f0.treasures?.length);
  });

  it("parses JSON export", () => {
    const map = floorDefToMap(FLOORS[1]);
    const raw = JSON.parse(JSON.stringify(map));
    const parsed = parseFloorMapJSON(raw);
    expect(parsed.name).toBe(map.name);
    expect(parsed.grid.length).toBe(map.height);
  });

  it("round-trips regional tileset zones", () => {
    const map = newFloorMapJSON(5, 5, { tilesetTheme: "f1" });
    map.tilesetZones = [
      { id: "stacks", x1: 1, y1: 1, x2: 2, y2: 3, theme: "f2" },
    ];
    const parsed = parseFloorMapJSON(JSON.parse(JSON.stringify(map)));
    const roundTrip = floorDefToMap(mapToFloorDef(parsed));
    expect(roundTrip.tilesetZones).toEqual(map.tilesetZones);
  });

  it("round-trips variable-height zones without changing the format version", () => {
    const map = newFloorMapJSON(5, 5);
    map.heightZones = [
      { id: "high-room", x1: 1, y1: 1, x2: 3, y2: 3, ceilingZ: 3 },
      { id: "future-step", x1: 2, y1: 2, x2: 2, y2: 2, floorZ: 0.5 },
    ];
    const parsed = parseFloorMapJSON(JSON.parse(JSON.stringify(map)));
    const roundTrip = floorDefToMap(mapToFloorDef(parsed));
    expect(roundTrip.formatVersion).toBe(1);
    expect(roundTrip.heightZones).toEqual(map.heightZones);
  });

  it("round-trips local ramps and stairs without changing formatVersion", () => {
    const map = newFloorMapJSON(5, 5);
    map.ramps = [
      { x: 1, y: 2, dir: "e", surface: "ramp" },
      { x: 3, y: 2, dir: "w", surface: "stairs" },
    ];
    const parsed = parseFloorMapJSON(JSON.parse(JSON.stringify(map)));
    const roundTrip = floorDefToMap(mapToFloorDef(parsed));
    expect(roundTrip.formatVersion).toBe(1);
    expect(roundTrip.ramps).toEqual(map.ramps);
  });

  it("round-trips floor-local encounter pacing", () => {
    const map = newFloorMapJSON(5, 5, {
      encounterPacing: { cooldown: 14, pityStart: 34, pityForce: 52 },
    });
    const parsed = parseFloorMapJSON(JSON.parse(JSON.stringify(map)));
    expect(parsed.encounterPacing).toEqual(map.encounterPacing);
    expect(floorDefToMap(mapToFloorDef(parsed)).encounterPacing).toEqual(
      map.encounterPacing
    );
  });

  it("parses and round-trips void and open-ceiling cells", () => {
    const map = newFloorMapJSON(5, 5);
    map.grid[2][1].void = true;
    map.grid[2][2].noCeiling = true;
    const parsed = parseFloorMapJSON(JSON.parse(JSON.stringify(map)));
    const roundTrip = floorDefToMap(mapToFloorDef(parsed));
    expect(roundTrip.grid[2][1]).toMatchObject({ void: true });
    expect(roundTrip.grid[2][2]).toMatchObject({ noCeiling: true });
    expect(cellIsPassable(roundTrip.grid[2][1])).toBe(false);
  });

  it("rejects false-valued void and noCeiling fields", () => {
    const raw = JSON.parse(JSON.stringify(newFloorMapJSON(5, 5)));
    raw.grid[2][1].void = false;
    expect(() => parseFloorMapJSON(raw)).toThrow(/void must be true/);
    delete raw.grid[2][1].void;
    raw.grid[2][1].noCeiling = "yes";
    expect(() => parseFloorMapJSON(raw)).toThrow(/noCeiling must be true/);
  });

  it("round-trips fixed architectural props", () => {
    const map = newFloorMapJSON(5, 5, {
      architecturalProps: [{
        id: "pillar",
        x: 2,
        y: 2,
        kind: "box",
        facing: "e",
        width: 0.7,
        height: 2.5,
        depth: 0.45,
        texture: "cyan.png",
        anchor: "floor",
        alphaMode: "opaque",
      }],
    });
    const parsed = parseFloorMapJSON(JSON.parse(JSON.stringify(map)));
    expect(parsed.architecturalProps).toEqual(map.architecturalProps);
    expect(floorDefToMap(mapToFloorDef(parsed)).architecturalProps).toEqual(
      map.architecturalProps
    );
  });

  it("round-trips fixed animated environmental sprites", () => {
    const map = newFloorMapJSON(5, 5, {
      environmentalSprites: [{
        id: "god-face",
        spriteId: "abyss-face",
        centerX: 3.5,
        centerY: 2,
        centerZ: 1.5,
        facing: "w",
        width: 6,
        height: 4,
      }],
    });
    const parsed = parseFloorMapJSON(JSON.parse(JSON.stringify(map)));
    expect(floorDefToMap(mapToFloorDef(parsed)).environmentalSprites).toEqual(
      map.environmentalSprites
    );
  });

  it("rejects invalid architectural prop dimensions and kinds", () => {
    const base = () => JSON.parse(JSON.stringify(floorDefToMap(findFloor(1)!)));
    const raw = base();
    raw.architecturalProps = [{
      id: "bad",
      x: 1,
      y: 1,
      kind: "mesh",
      facing: "n",
      width: 0,
      height: 1,
      texture: "bad.png",
    }];
    expect(() => parseFloorMapJSON(raw)).toThrow(/kind must be plane or box/);
    raw.architecturalProps[0].kind = "box";
    expect(() => parseFloorMapJSON(raw)).toThrow(/dimensions must be > 0/);
  });

  it("preserves architectural props through the mutable floor clone", () => {
    const map = newFloorMapJSON(4, 4, {
      architecturalProps: [{
        id: "beam",
        x: 1,
        y: 1,
        kind: "box",
        facing: "n",
        width: 1,
        height: 0.25,
        depth: 0.2,
        texture: "magenta.png",
        anchor: "ceiling",
      }],
    });
    expect(cloneFloor(mapToFloorDef(map)).architecturalProps).toEqual(
      map.architecturalProps
    );
  });

  it("resolves cell themes with primary fallback and last-zone-wins overlap", () => {
    const floor = {
      id: 1,
      tilesetTheme: "f1",
      tilesetZones: [
        { id: "wide", x1: 1, y1: 1, x2: 4, y2: 4, theme: "f2" },
        { id: "top", x1: 3, y1: 2, x2: 4, y2: 3, theme: "f5" },
      ],
    };
    expect(themeAt(floor, 0, 0)).toBe("f1");
    expect(themeAt(floor, 2, 2)).toBe("f2");
    expect(themeAt(floor, 3, 2)).toBe("f5");
    expect(tilesetThemesForFloor(floor)).toEqual(["f1", "f2", "f5"]);
  });

  it("uses the near visible cell theme for wall and door boundaries", () => {
    const floor = {
      id: 1,
      tilesetTheme: "f1",
      tilesetZones: [
        { id: "east", x1: 2, y1: 0, x2: 4, y2: 4, theme: "f3" },
        { id: "south", x1: 0, y1: 2, x2: 1, y2: 4, theme: "f4" },
      ],
    };
    // Eastbound ray stepped into (2,1): visible side is west cell (1,1).
    expect(themeForWallHit(floor, 2, 1, "x", 1, 0)).toBe("f1");
    // Westbound ray stepped into (1,1): visible side is east cell (2,1).
    expect(themeForWallHit(floor, 1, 1, "x", -1, 0)).toBe("f3");
    // Southbound ray stepped into (1,2): visible side is north cell (1,1).
    expect(themeForWallHit(floor, 1, 2, "y", 0, 1)).toBe("f1");
    // Northbound ray stepped into (1,1): visible side is south cell (1,2).
    expect(themeForWallHit(floor, 1, 1, "y", 0, -1)).toBe("f4");
  });

  it("rejects malformed overlay entries with precise errors", () => {
    const base = () => JSON.parse(JSON.stringify(floorDefToMap(findFloor(1)!)));

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
    raw.events = [{ x: 1, y: 1, kind: "message", message: "talk", dialogueId: 7 }];
    expect(() => parseFloorMapJSON(raw)).toThrow(/events\[0\]\.dialogueId/);

    raw = base();
    raw.events = [
      {
        x: 1,
        y: 1,
        kind: "message",
        message: "Two figures argue.",
        dialogueId: "rat-king-old-man-thesis",
      },
    ];
    expect(parseFloorMapJSON(raw).events?.[0]?.dialogueId).toBe("rat-king-old-man-thesis");

    raw.events = [
      {
        x: 1,
        y: 1,
        kind: "message",
        message: "The Kept Gate.",
        dialogueId: "great-gate-old-man-rat-king",
      },
    ];
    expect(parseFloorMapJSON(raw).events?.[0]?.dialogueId).toBe(
      "great-gate-old-man-rat-king",
    );

    raw = base();
    raw.npcs = [{ id: "a", name: "A", title: "t", x: 1, y: 1, greeting: "g", returnGreeting: "r", topics: "nope", combatEnemyIds: [] }];
    expect(() => parseFloorMapJSON(raw)).toThrow(/npcs\[0\]\.topics/);

    raw = base();
    raw.encounterZones = [{ id: "z", x1: 0, y1: 0, x2: 1, y2: 1 }];
    expect(() => parseFloorMapJSON(raw)).toThrow(/rateMul/);

    raw = base();
    raw.tilesetZones = [{ id: "z", x1: 0, y1: 0, x2: 1, y2: 1 }];
    expect(() => parseFloorMapJSON(raw)).toThrow(/tilesetZones\[0\]\.theme/);

    raw = base();
    raw.heightZones = [{ id: "z", x1: 0, y1: 0, x2: 1, y2: 1 }];
    expect(() => parseFloorMapJSON(raw)).toThrow(/heightZones\[0\].*floorZ.*ceilingZ/);

    raw = base();
    raw.heightZones = [{ id: "z", x1: 0, y1: 0, x2: 1, y2: 1, ceilingZ: "high" }];
    expect(() => parseFloorMapJSON(raw)).toThrow(/heightZones\[0\]\.ceilingZ/);

    raw = base();
    raw.ramps = [{ x: 1, y: 1, dir: "q", surface: "ramp" }];
    expect(() => parseFloorMapJSON(raw)).toThrow(/ramps\[0\]\.dir/);

    raw = base();
    raw.ramps = [{ x: 1, y: 1, dir: "n", surface: "escalator" }];
    expect(() => parseFloorMapJSON(raw)).toThrow(/ramps\[0\]\.surface/);
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
        mapSpriteId: "vesper",
        portraitId: "isobel",
        portraitSide: "left",
        dialogueAccent: "cold",
      },
    ];
    const parsed = parseFloorMapJSON(JSON.parse(JSON.stringify(map)));
    expect(parsed.waters?.[0].effect).toEqual({ kind: "heal", power: 4 });
    expect(parsed.npcs?.[0].topics[0].hidden).toBe(true);
    expect(parsed.npcs?.[0].trades?.[0].once).toBe(true);
    expect(parsed.npcs?.[0].wantsItemId).toBe("holy-symbol");
    expect(parsed.npcs?.[0].mapSpriteId).toBe("vesper");
    expect(parsed.npcs?.[0].portraitId).toBe("isobel");
    expect(parsed.npcs?.[0].portraitSide).toBe("left");
    expect(parsed.npcs?.[0].dialogueAccent).toBe("cold");
  });

  it("leaves mapSpriteId undefined when the JSON omits it", () => {
    const map = newFloorMapJSON(5, 5);
    map.npcs = [
      {
        id: "n",
        name: "N",
        title: "t",
        x: 2,
        y: 2,
        greeting: "g",
        returnGreeting: "r",
        topics: [],
        combatEnemyIds: [],
      },
    ];
    const parsed = parseFloorMapJSON(JSON.parse(JSON.stringify(map)));
    expect(parsed.npcs?.[0].mapSpriteId).toBeUndefined();
  });

  it("cellIsPassable detects carved room", () => {
    const floor = mapToFloorDef(newFloorMapJSON(5, 5));
    carveRoom(floor.grid, 1, 1, 3, 3);
    expect(cellIsPassable(floor.grid[2][2])).toBe(true);
    expect(cellIsPassable(floor.grid[0][0])).toBe(false);
  });
});

describe("treasure.climax portable-map round trip", () => {
  it("floorDefToMap preserves climax metadata", () => {
    const f2 = findFloor(2)!;
    const map = floorDefToMap(f2);
    const chest = map.treasures?.find((t) => t.x === 12 && t.y === 8);
    expect(chest?.climax).toEqual({ id: "floor2-guardian" });
  });

  it("floorDefToMap does not alias the source climax object", () => {
    const f2 = findFloor(2)!;
    const map = floorDefToMap(f2);
    const mapChest = map.treasures?.find((t) => t.x === 12 && t.y === 8)!;
    const srcChest = f2.treasures?.find((t) => t.x === 12 && t.y === 8)!;
    expect(mapChest.climax).not.toBe(srcChest.climax);
    expect(mapChest.climax).toEqual(srcChest.climax);
  });

  it("parseFloorMapJSON accepts a valid climax id", () => {
    const map = newFloorMapJSON(6, 6);
    map.treasures = [
      { x: 2, y: 2, itemIds: ["furnace-key"], trap: "alarm", climax: { id: "test-guardian" } },
    ];
    const parsed = parseFloorMapJSON(JSON.parse(JSON.stringify(map)));
    expect(parsed.treasures?.[0].climax).toEqual({ id: "test-guardian" });
  });

  it("mapToFloorDef preserves climax from a parsed map", () => {
    const map = newFloorMapJSON(6, 6);
    map.treasures = [
      { x: 2, y: 2, itemIds: ["furnace-key"], trap: "alarm", climax: { id: "test-guardian" } },
    ];
    const parsed = parseFloorMapJSON(JSON.parse(JSON.stringify(map)));
    const floor = mapToFloorDef(parsed);
    expect(floor.treasures?.[0].climax).toEqual({ id: "test-guardian" });
  });

  it("full round trip (FloorDef → JSON → parse → FloorDef) preserves the climax id", () => {
    const f2 = findFloor(2)!;
    const map = floorDefToMap(f2);
    const raw = JSON.parse(JSON.stringify(map));
    const parsed = parseFloorMapJSON(raw);
    const restored = mapToFloorDef(parsed);
    const chest = restored.treasures?.find((t) => t.x === 12 && t.y === 8);
    expect(chest?.climax).toEqual({ id: "floor2-guardian" });
  });

  it("mapToFloorDef does not alias the source climax object", () => {
    const map = newFloorMapJSON(6, 6);
    map.treasures = [
      { x: 2, y: 2, itemIds: ["furnace-key"], climax: { id: "test-guardian" } },
    ];
    const floor = mapToFloorDef(map);
    const floorChest = floor.treasures?.[0]!;
    const mapChest = map.treasures[0]!;
    expect(floorChest.climax).not.toBe(mapChest.climax);
    expect(floorChest.climax).toEqual(mapChest.climax);
  });

  it("rejects climax that is not an object", () => {
    const base = () => JSON.parse(JSON.stringify(floorDefToMap(findFloor(1)!)));
    const raw = base();
    raw.treasures = [{ x: 1, y: 1, itemIds: ["healing-potion"], climax: "not-an-object" }];
    expect(() => parseFloorMapJSON(raw)).toThrow(/treasures\[0\]\.climax must be an object/);
  });

  it("rejects climax.id that is not a non-empty string", () => {
    const base = () => JSON.parse(JSON.stringify(floorDefToMap(findFloor(1)!)));
    const raw = base();
    raw.treasures = [{ x: 1, y: 1, itemIds: ["healing-potion"], climax: { id: 42 } }];
    expect(() => parseFloorMapJSON(raw)).toThrow(/treasures\[0\]\.climax\.id must be a non-empty string/);

    const raw2 = base();
    raw2.treasures = [{ x: 1, y: 1, itemIds: ["healing-potion"], climax: { id: "" } }];
    expect(() => parseFloorMapJSON(raw2)).toThrow(/treasures\[0\]\.climax\.id must be a non-empty string/);
  });
});

describe("floor-ascii", () => {
  it("includes start marker and legend", () => {
    const ascii = floorToAscii(findFloor(1)!);
    expect(ascii).toContain("@");
    expect(ascii).toContain(findFloor(1)!.name);
    expect(ascii).toContain("crypt-key");
  });
});

describe("floor-validate", () => {
  it("campaign floors have no errors", () => {
    for (const floor of getFloors()) {
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
