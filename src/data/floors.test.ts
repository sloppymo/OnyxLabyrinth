import { describe, it, expect } from "vitest";
import { FLOORS, cloneFloor, type FloorDef } from "./floors";
import { getFloors, findFloor } from "../game/floor-registry";
import { ITEMS_BY_ID } from "./items";
import type { Grid } from "../types";
import { resolveTilesetTheme, themeAt } from "../game/floor-map";
import { encounterTableFloorId } from "../game/encounters";

/** BFS over the edge grid from the floor's start position.
 *  Returns the set of "x,y" cells reachable through the given edge types.
 *  Raft-channel water tiles are always impassable (they require the raft
 *  key item, which this BFS does not model). Chute drops on the same floor
 *  create one-way reachability connections. Raft route dock-to-dock
 *  connections are included only when `options.withRaft` is true. */
function reachableCells(
  floor: FloorDef,
  passable: Set<string>,
  options?: { withRaft?: boolean }
): Set<string> {
  const seen = new Set<string>([`${floor.startX},${floor.startY}`]);
  const queue: [number, number][] = [[floor.startX, floor.startY]];
  const steps: ["n" | "e" | "s" | "w", number, number][] = [
    ["n", 0, -1],
    ["e", 1, 0],
    ["s", 0, 1],
    ["w", -1, 0],
  ];
  // Build raft-channel water set (impassable without raft).
  const raftChannelTiles = new Set<string>();
  for (const w of floor.waters ?? []) {
    if (w.raftChannel) raftChannelTiles.add(`${w.x},${w.y}`);
  }
  // Chute drops on the same floor create reachability connections.
  const sameFloorChutes = new Map<string, [number, number]>();
  for (const c of floor.chuteDrops ?? []) {
    if (c.toFloorId === floor.id) {
      sameFloorChutes.set(`${c.x},${c.y}`, [c.toX, c.toY]);
    }
  }
  // Raft routes create dock-to-dock connections (only included when
  // options.withRaft is true — the raft is acquirable via the chute
  // pocket, similar to how OPEN_OR_LOCKED assumes all keys are available).
  const raftConnections = new Map<string, [number, number][]>();
  if (options?.withRaft) {
    for (const route of floor.raftRoutes ?? []) {
      const fromKey = `${route.fromDock.x},${route.fromDock.y}`;
      const toKey = `${route.toDock.x},${route.toDock.y}`;
      if (!raftConnections.has(fromKey)) raftConnections.set(fromKey, []);
      if (!raftConnections.has(toKey)) raftConnections.set(toKey, []);
      raftConnections.get(fromKey)!.push([route.toDock.x, route.toDock.y]);
      if (route.bidirectional) {
        raftConnections.get(toKey)!.push([route.fromDock.x, route.fromDock.y]);
      }
    }
  }
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    for (const [dir, dx, dy] of steps) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= floor.width || ny >= floor.height) continue;
      if (!passable.has(floor.grid[y][x][dir])) continue;
      // Raft-channel water is impassable without the raft.
      if (raftChannelTiles.has(`${nx},${ny}`)) continue;
      const key = `${nx},${ny}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push([nx, ny]);
      }
    }
    // Apply chute drops (one-way teleport to destination on same floor)
    const chuteKey = `${x},${y}`;
    if (sameFloorChutes.has(chuteKey)) {
      const [tx, ty] = sameFloorChutes.get(chuteKey)!;
      const tKey = `${tx},${ty}`;
      if (!seen.has(tKey)) {
        seen.add(tKey);
        queue.push([tx, ty]);
      }
    }
    // Apply raft route connections (dock-to-dock, bidirectional if flagged)
    if (raftConnections.has(chuteKey)) {
      for (const [tx, ty] of raftConnections.get(chuteKey)!) {
        const tKey = `${tx},${ty}`;
        if (!seen.has(tKey)) {
          seen.add(tKey);
          queue.push([tx, ty]);
        }
      }
    }
  }
  return seen;
}

const OPEN = new Set(["open", "door"]);
const OPEN_OR_LOCKED = new Set(["open", "door", "locked"]);
// "barred" included: same "assume every gate is eventually resolvable"
// philosophy as OPEN_OR_LOCKED assuming all keys are found — the one
// existing barred gate is assumed openable from its correct side, and
// Floor 1's stairsGuardian edge is assumed openable by winning its fight.
const OPEN_OR_LOCKED_OR_BARRED = new Set(["open", "door", "locked", "barred"]);

function featureCells(grid: Grid): { x: number; y: number; tile: string }[] {
  const cells: { x: number; y: number; tile: string }[] = [];
  grid.forEach((row, y) =>
    row.forEach((cell, x) => {
      if (cell.tile) cells.push({ x, y, tile: cell.tile });
    })
  );
  return cells;
}

describe("floor definitions", () => {
  it("hand-carved campaign floors are 2..3 (floor 1 ships as JSON)", () => {
    expect(FLOORS.map((f) => f.id)).toEqual([2, 3]);
  });

  it("runtime list includes merged floor 1 from content pack", () => {
    const f1 = findFloor(1);
    expect(f1?.name).toBe("The Hall of Five Wounds");
    expect(getFloors().map((f) => f.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("grids match their declared dimensions", () => {
    for (const floor of getFloors()) {
      expect(floor.grid.length, floor.name).toBe(floor.height);
      for (const row of floor.grid) {
        expect(row.length, floor.name).toBe(floor.width);
      }
    }
  });

  it("all edges are symmetric and the outer boundary is solid wall", () => {
    for (const floor of getFloors()) {
      for (let y = 0; y < floor.height; y++) {
        for (let x = 0; x < floor.width; x++) {
          const cell = floor.grid[y][x];
          if (x < floor.width - 1) {
            expect(cell.e, `${floor.name} (${x},${y}) e/w`).toBe(floor.grid[y][x + 1].w);
          }
          if (y < floor.height - 1) {
            expect(cell.s, `${floor.name} (${x},${y}) s/n`).toBe(floor.grid[y + 1][x].n);
          }
          if (x === 0) expect(cell.w, `${floor.name} (${x},${y})`).toBe("wall");
          if (x === floor.width - 1) expect(cell.e, `${floor.name} (${x},${y})`).toBe("wall");
          if (y === 0) expect(cell.n, `${floor.name} (${x},${y})`).toBe("wall");
          if (y === floor.height - 1) expect(cell.s, `${floor.name} (${x},${y})`).toBe("wall");
        }
      }
    }
  });

  it("links the campaign linearly via stairs", () => {
    const tiles = (f: FloorDef) => featureCells(f.grid).map((c) => c.tile);
    const f1 = findFloor(1)!;
    const f2 = findFloor(2)!;
    const f3 = findFloor(3)!;
    expect(tiles(f1)).toContain("stairs_down");
    expect(tiles(f1)).not.toContain("stairs_up");
    expect(tiles(f2)).toContain("stairs_up");
    expect(tiles(f2)).toContain("stairs_down");
    expect(tiles(f3)).toContain("stairs_up");
    expect(tiles(f3)).toContain("stairs_down");
  });

  it("every tile feature is reachable from the start (locked doors openable by key/thief, raft routes included)", () => {
    for (const floor of getFloors()) {
      const reached = reachableCells(floor, OPEN_OR_LOCKED_OR_BARRED, { withRaft: true });
      // Raft-channel water tiles are impassable terrain — the player
      // crosses them via raft animation but never stands on them.
      const raftChannelTiles = new Set(
        (floor.waters ?? []).filter((w) => w.raftChannel).map((w) => `${w.x},${w.y}`)
      );
      for (const { x, y, tile } of featureCells(floor.grid)) {
        if (raftChannelTiles.has(`${x},${y}`)) continue;
        expect(reached.has(`${x},${y}`), `${floor.name}: ${tile} at (${x},${y}) unreachable`).toBe(
          true
        );
      }
    }
  });

  it("treasure tiles and treasure definitions match 1:1", () => {
    for (const floor of getFloors()) {
      const tileSet = new Set(
        featureCells(floor.grid)
          .filter((c) => c.tile === "treasure")
          .map((c) => `${c.x},${c.y}`)
      );
      const defSet = new Set((floor.treasures ?? []).map((t) => `${t.x},${t.y}`));
      expect(tileSet, floor.name).toEqual(defSet);
    }
  });

  it("treasure contents are valid item ids or key ids", () => {
    for (const floor of getFloors()) {
      for (const treasure of floor.treasures ?? []) {
        for (const itemId of treasure.itemIds) {
          const valid = itemId.endsWith("-key") || ITEMS_BY_ID[itemId] !== undefined;
          expect(valid, `${floor.name}: unknown item "${itemId}"`).toBe(true);
        }
      }
    }
  });

  it("every lockedDoors entry sits on an actual locked edge", () => {
    for (const floor of getFloors()) {
      for (const door of floor.lockedDoors ?? []) {
        expect(
          floor.grid[door.y][door.x][door.dir],
          `${floor.name}: lockedDoors (${door.x},${door.y}) ${door.dir}`
        ).toBe("locked");
      }
    }
  });

  it("every locked edge has a lockedDoors entry on its approach side", () => {
    for (const floor of getFloors()) {
      const defs = new Set(
        (floor.lockedDoors ?? []).map((d) => `${d.x},${d.y},${d.dir}`)
      );
      for (let y = 0; y < floor.height; y++) {
        for (let x = 0; x < floor.width; x++) {
          for (const dir of ["n", "e", "s", "w"] as const) {
            if (floor.grid[y][x][dir] !== "locked") continue;
            const opposite =
              dir === "n"
                ? `${x},${y - 1},s`
                : dir === "s"
                  ? `${x},${y + 1},n`
                  : dir === "e"
                    ? `${x + 1},${y},w`
                    : `${x - 1},${y},e`;
            expect(
              defs.has(`${x},${y},${dir}`) || defs.has(opposite),
              `${floor.name}: locked edge (${x},${y}) ${dir} has no lockedDoors entry`
            ).toBe(true);
          }
        }
      }
    }
  });

  it("every locked door's key exists in some treasure chest", () => {
    const allItems = getFloors().flatMap((f) => (f.treasures ?? []).flatMap((t) => t.itemIds));
    for (const floor of getFloors()) {
      for (const door of floor.lockedDoors ?? []) {
        expect(allItems, `${floor.name}: no chest holds "${door.keyId}"`).toContain(door.keyId);
      }
    }
  });

  it("first key of each floor's chain is reachable without passing any locked door", () => {
    const f1 = findFloor(1)!;
    const f1Open = reachableCells(f1, OPEN);
    const cryptChest = f1.treasures!.find((t) => t.itemIds.includes("crypt-key"))!;
    expect(f1Open.has(`${cryptChest.x},${cryptChest.y}`)).toBe(true);

    const f3 = findFloor(3)!;
    const f3Open = reachableCells(f3, OPEN);
    const forgeChest = f3.treasures!.find((t) => t.itemIds.includes("forge-key"))!;
    expect(f3Open.has(`${forgeChest.x},${forgeChest.y}`)).toBe(true);
  });

  it("floor 1 gates the lexicon behind the crypt key and stairs behind the raft AND the returned-party fight", () => {
    const f1 = findFloor(1)!;
    const open = reachableCells(f1, OPEN);
    const afterCrypt = reachableCells(f1, OPEN_OR_LOCKED);
    const afterCryptAndRaft = reachableCells(f1, OPEN_OR_LOCKED, { withRaft: true });
    const afterCryptRaftAndGuardian = reachableCells(f1, OPEN_OR_LOCKED_OR_BARRED, {
      withRaft: true,
    });
    const lexiconChest = f1.treasures!.find((t) => t.itemIds.includes("lexicon-key"))!;
    const stairs = featureCells(f1.grid).filter((cell) => cell.tile === "stairs_down");
    expect(stairs).toHaveLength(1);
    // Lexicon is gated behind the crypt-key locked door.
    expect(open.has(`${lexiconChest.x},${lexiconChest.y}`)).toBe(false);
    expect(afterCrypt.has(`${lexiconChest.x},${lexiconChest.y}`)).toBe(true);
    // Stairs are gated behind the raft (raft-channel water is impassable
    // even with all keys). Without the raft, stairs are unreachable.
    expect(open.has(`${stairs[0].x},${stairs[0].y}`)).toBe(false);
    expect(afterCrypt.has(`${stairs[0].x},${stairs[0].y}`)).toBe(false);
    // The raft alone is no longer enough: "The Party That Returned"
    // (stairsGuardian) bars the last stretch until it's defeated.
    expect(afterCryptAndRaft.has(`${stairs[0].x},${stairs[0].y}`)).toBe(false);
    // Raft + winning the guardian fight: stairs are finally reachable.
    expect(afterCryptRaftAndGuardian.has(`${stairs[0].x},${stairs[0].y}`)).toBe(true);
  });

  it("floor 1 visibly uses all five built-in themes plus its custom zone themes", () => {
    const f1 = findFloor(1)!;
    const themes = new Set<string>([resolveTilesetTheme(f1)]);
    for (let y = 0; y < f1.height; y++) {
      for (let x = 0; x < f1.width; x++) themes.add(themeAt(f1, x, y));
    }
      // Custom (non-built-in) zone themes: Hot Boi's tavern, Isobel's shop,
      // Namanda's church, and the dark descent threshold at the Kept Gate.
      expect([...themes].sort()).toEqual(["descent", "f1", "f2", "f3", "f4", "f5", "hotboi", "isobel", "namanda"]);
  });

  it("floor 1 keeps campaign encounter and lore contracts", () => {
    const f1 = findFloor(1)!;
    expect(f1.encounterRate).toBeCloseTo(0.05);
    expect(f1.encounterPacing).toEqual({ cooldown: 14, pityStart: 34, pityForce: 52 });
    expect((f1.encounterZones ?? []).every((zone) => zone.tableFloorId === undefined)).toBe(true);
    expect(f1.npcs).toHaveLength(9);
    expect((f1.events ?? []).every((event) => event.message.length <= 60)).toBe(true);
    const playerFacingCopy = JSON.stringify({
      name: f1.name,
      npcs: f1.npcs,
      events: f1.events,
    });
    expect(playerFacingCopy).not.toMatch(/headmaster|academy|first descent/i);
    expect(playerFacingCopy).not.toMatch(/\becho\b/i);
  });

  it("floor 1 has an accessible trapped chest for the trap tutorial", () => {
    const f1 = findFloor(1)!;
    const f1Open = reachableCells(f1, OPEN);
    const trapChest = f1.treasures!.find((t) => t.trap !== undefined && f1Open.has(`${t.x},${t.y}`));
    expect(trapChest, "no reachable trapped chest on floor 1").toBeDefined();
    expect(trapChest!.trap).toBe("poison");
  });

  it("floor 1 introduces at least three NPCs before its locked wing", () => {
    const f1 = findFloor(1)!;
    const f1Open = reachableCells(f1, OPEN);
    const earlyNpcs = (f1.npcs ?? []).filter((npc) => f1Open.has(`${npc.x},${npc.y}`));
    expect(earlyNpcs.length).toBeGreaterThanOrEqual(3);
  });

  it("teleporters and chutes only target existing floors at carved, in-bounds cells", () => {
    const all = getFloors();
    for (const floor of all) {
      const links = [...(floor.teleporters ?? []), ...(floor.chuteDrops ?? [])];
      for (const link of links) {
        const target = all.find((f) => f.id === link.toFloorId);
        expect(target, `${floor.name}: link to missing floor ${link.toFloorId}`).toBeDefined();
        const cell = target!.grid[link.toY]?.[link.toX];
        expect(cell, `${floor.name}: link lands out of bounds`).toBeDefined();
        const carved = [cell!.n, cell!.e, cell!.s, cell!.w].some((e) => e !== "wall");
        expect(carved, `${floor.name}: link lands inside solid rock`).toBe(true);
      }
    }
  });

  it("cloneFloor produces an independent deep copy", () => {
    const clone = cloneFloor(findFloor(1)!);
    clone.grid[0][0].n = "door";
    clone.treasures![0].itemIds.push("x");
    clone.tilesetZones![0].theme = "changed";
    expect(findFloor(1)!.grid[0][0].n).toBe("wall");
    expect(findFloor(1)!.treasures![0].itemIds).not.toContain("x");
    expect(findFloor(1)!.tilesetZones![0].theme).not.toBe("changed");
  });

  it("cloneFloor preserves wallFeatures as an independent deep copy", () => {
    // Regression test: cloneFloor lists fields explicitly (like floorDefToMap
    // / mapToFloorDef), so a new FloorDef field silently vanishes on every
    // floor transition unless it's added here too. transitionToFloor()
    // (game/features.ts) calls cloneFloor on every floor load — this is
    // exactly the path that dropped wallFeatures for a full render-loop
    // silently the first time it was wired in.
    const source: FloorDef = {
      ...findFloor(2)!,
      wallFeatures: [{ x: 1, y: 1, dir: "n", spriteId: "test-switch" }],
    };
    const clone = cloneFloor(source);
    expect(clone.wallFeatures).toEqual(source.wallFeatures);
    clone.wallFeatures![0].spriteId = "changed";
    expect(source.wallFeatures![0].spriteId).toBe("test-switch");
  });

  it("cloneFloor preserves ceilingSprites and ceilingFeatures as independent deep copies", () => {
    // Same regression shape as the wallFeatures case above, for the two
    // fields the ceiling-art pass added.
    const source: FloorDef = {
      ...findFloor(2)!,
      ceilingSprites: [{ x: 1, y: 1, spriteId: "test-chain", scale: 1.5 }],
      ceilingFeatures: [{ x: 2, y: 2, spriteId: "test-grate" }],
    };
    const clone = cloneFloor(source);
    expect(clone.ceilingSprites).toEqual(source.ceilingSprites);
    expect(clone.ceilingFeatures).toEqual(source.ceilingFeatures);
    clone.ceilingSprites![0].spriteId = "changed";
    clone.ceilingFeatures![0].spriteId = "changed";
    expect(source.ceilingSprites![0].spriteId).toBe("test-chain");
    expect(source.ceilingFeatures![0].spriteId).toBe("test-grate");
  });
});

describe("floor 2 (The Cursed Library) redesign regressions", () => {
  it("the north-corridor darkness stretch is two real tiles, not clobbered by the event", () => {
    // A `setTile` overwrite bug once put the bookcase event on top of the
    // second darkness tile at (8,2), so the corridor only ever read as dark
    // from one approach direction. Guard against that regressing: both
    // (7,2) and (8,2) must stay "darkness", and the event must sit just past
    // them at (9,2), on lit ground, regardless of travel direction.
    const f2 = findFloor(2)!;
    expect(f2.grid[2][7].tile).toBe("darkness");
    expect(f2.grid[2][8].tile).toBe("darkness");
    expect(f2.grid[2][9].tile).toBe("event");
    expect(f2.events?.some((e) => e.x === 9 && e.y === 2)).toBe(true);
    expect(f2.events?.some((e) => e.x === 8 && e.y === 2)).toBe(false);
  });

  it("the forbidden-wing chest is the real climax: alarm trap, curated zone table", () => {
    const f2 = findFloor(2)!;
    const chest = f2.treasures?.find((t) => t.x === 12 && t.y === 8);
    expect(chest?.trap).toBe("alarm");
    expect(chest?.itemIds).toContain("furnace-key");
    const zone = f2.encounterZones?.find((z) => z.id === "forbidden-wing-hot");
    expect(zone?.tableFloorId).toBe(6);
  });

  it("the forbidden wing reads as visually distinct via the f2b tileset zone", () => {
    const f2 = findFloor(2)!;
    const zone = f2.tilesetZones?.find((z) => z.id === "forbidden-wing");
    expect(zone).toEqual({ id: "forbidden-wing", x1: 11, y1: 6, x2: 12, y2: 9, theme: "f2b" });
    expect(themeAt(f2, 12, 7)).toBe("f2b"); // furnace-key chest
    expect(themeAt(f2, 11, 6)).toBe("f2b"); // antimagic foreshadow tile
    // Boundary check: just outside the zone must stay the floor's base theme.
    expect(themeAt(f2, 12, 5)).toBe("f2");
    expect(themeAt(f2, 2, 2)).toBe("f2");
  });

  it("the furnace-key chest is the only floor-2 tile that resolves to the guardian table", () => {
    const f2 = findFloor(2)!;
    expect(encounterTableFloorId(f2, 12, 8)).toBe(6);
    expect(encounterTableFloorId(f2, 12, 3)).toBe(2); // scriptorium uses ordinary table
    // No other floor-2 encounter zone references table 6.
    expect(f2.encounterZones?.some((z) => z.id !== "forbidden-wing-hot" && z.tableFloorId === 6)).toBe(false);
  });

  it("the furnace-key chest is marked as a climax", () => {
    const f2 = findFloor(2)!;
    const chest = f2.treasures?.find((t) => t.x === 12 && t.y === 8);
    expect(chest?.climax?.id).toBe("floor2-guardian");
  });

  it("cloneFloor preserves treasure.climax and produces an independent copy", () => {
    const original = findFloor(2)!;
    const originalChest = original.treasures?.find((t) => t.x === 12 && t.y === 8);
    expect(originalChest?.climax).toEqual({ id: "floor2-guardian" });

    const clone = cloneFloor(original);
    const cloneChest = clone.treasures?.find((t) => t.x === 12 && t.y === 8);

    // Preserved with the correct id.
    expect(cloneChest?.climax).toEqual({ id: "floor2-guardian" });

    // Independent object — mutating the clone must not affect the source.
    cloneChest!.climax = { id: "mutated" };
    expect(originalChest?.climax).toEqual({ id: "floor2-guardian" });
  });
});

describe("Floor 3 'Duelist's Vigil' content", () => {
  it("the trophy chest is the real Grand Forge climax: alarm trap, curated zone table", () => {
    const f3 = findFloor(3)!;
    const chest = f3.treasures?.find((t) => t.x === 9 && t.y === 13);
    expect(chest?.trap).toBe("alarm");
    expect(chest?.climax?.id).toBe("floor3-guardian");
    const zone = f3.encounterZones?.find((z) => z.id === "grand-forge-guardian");
    expect(zone?.tableFloorId).toBe(7);
    expect(zone?.rateMul).toBeGreaterThan(1);
  });

  it("the trophy chest is the only floor-3 tile that resolves to the guardian table", () => {
    const f3 = findFloor(3)!;
    expect(encounterTableFloorId(f3, 9, 13)).toBe(7);
    expect(encounterTableFloorId(f3, 13, 2)).toBe(3); // slag vault uses the ordinary table
    expect(f3.encounterZones?.some((z) => z.id !== "grand-forge-guardian" && z.tableFloorId === 7)).toBe(false);
  });

  it("the statue's foreshadowing tile still exists and is not itself a second fight", () => {
    const f3 = findFloor(3)!;
    expect(f3.events?.some((e) => e.x === 6 && e.y === 11 && e.kind === "message")).toBe(true);
    // No treasure/trap/climax lives at the statue's own tile — it's folded
    // into the Grand Forge's one guaranteed formation (ENCOUNTER_TABLES[7]),
    // not a separate mandatory fight.
    expect(f3.treasures?.some((t) => t.x === 6 && t.y === 11)).toBe(false);
  });

  it("the fused-smith event grants the smith's signet ring on step, once", () => {
    const f3 = findFloor(3)!;
    const event = f3.events?.find((e) => e.x === 14 && e.y === 9);
    expect(event?.kind).toBe("reward");
    expect(event?.itemId).toBe("smiths-signet-ring");
  });

  it("cloneFloor preserves the climax field (regression: it used to be dropped, silencing the escrow path on every real floor load)", () => {
    const f3 = findFloor(3)!;
    const cloned = cloneFloor(f3);
    const chest = cloned.treasures?.find((t) => t.x === 9 && t.y === 13);
    expect(chest?.climax?.id).toBe("floor3-guardian");
    // Same regression, Floor 2's climax chest.
    const f2 = findFloor(2)!;
    const clonedF2 = cloneFloor(f2);
    const f2chest = clonedF2.treasures?.find((t) => t.x === 12 && t.y === 8);
    expect(f2chest?.climax?.id).toBe("floor2-guardian");
  });

  it("Kazeharu has a hidden recruitment topic in addition to his original three", () => {
    const f3 = findFloor(3)!;
    const kazeharu = f3.npcs?.find((n) => n.id === "kazeharu");
    expect(kazeharu?.topics.some((t) => t.key === "master")).toBe(true);
    expect(kazeharu?.topics.some((t) => t.key === "duel")).toBe(true);
    expect(kazeharu?.topics.some((t) => t.key === "forge")).toBe(true);
    expect(kazeharu?.topics.some((t) => t.key === "join" && t.hidden)).toBe(true);
  });
});
