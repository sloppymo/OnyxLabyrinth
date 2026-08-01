import { describe, it, expect } from "vitest";
import { FLOORS, cloneFloor, type FloorDef } from "./floors";
import { getFloors, findFloor } from "../game/floor-registry";
import { ITEMS_BY_ID } from "./items";
import type { Grid } from "../types";
import { resolveTilesetTheme, themeAt } from "../game/floor-map";

/** BFS over the edge grid from the floor's start position.
 *  Returns the set of "x,y" cells reachable through the given edge types. */
function reachableCells(floor: FloorDef, passable: Set<string>): Set<string> {
  const seen = new Set<string>([`${floor.startX},${floor.startY}`]);
  const queue: [number, number][] = [[floor.startX, floor.startY]];
  const steps: ["n" | "e" | "s" | "w", number, number][] = [
    ["n", 0, -1],
    ["e", 1, 0],
    ["s", 0, 1],
    ["w", -1, 0],
  ];
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    for (const [dir, dx, dy] of steps) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= floor.width || ny >= floor.height) continue;
      if (!passable.has(floor.grid[y][x][dir])) continue;
      const key = `${nx},${ny}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push([nx, ny]);
      }
    }
  }
  return seen;
}

const OPEN = new Set(["open", "door"]);
const OPEN_OR_LOCKED = new Set(["open", "door", "locked"]);

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

  it("every tile feature is reachable from the start (locked doors openable by key/thief)", () => {
    for (const floor of getFloors()) {
      const reached = reachableCells(floor, OPEN_OR_LOCKED);
      for (const { x, y, tile } of featureCells(floor.grid)) {
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

  it("floor 1 gates the lexicon and its sole stair behind the crypt key", () => {
    const f1 = findFloor(1)!;
    const open = reachableCells(f1, OPEN);
    const afterCrypt = reachableCells(f1, OPEN_OR_LOCKED);
    const lexiconChest = f1.treasures!.find((t) => t.itemIds.includes("lexicon-key"))!;
    const stairs = featureCells(f1.grid).filter((cell) => cell.tile === "stairs_down");
    expect(stairs).toHaveLength(1);
    expect(open.has(`${lexiconChest.x},${lexiconChest.y}`)).toBe(false);
    expect(open.has(`${stairs[0].x},${stairs[0].y}`)).toBe(false);
    expect(afterCrypt.has(`${lexiconChest.x},${lexiconChest.y}`)).toBe(true);
    expect(afterCrypt.has(`${stairs[0].x},${stairs[0].y}`)).toBe(true);
  });

  it("floor 1 visibly uses all five built-in tileset themes", () => {
    const f1 = findFloor(1)!;
    const themes = new Set<string>([resolveTilesetTheme(f1)]);
    for (let y = 0; y < f1.height; y++) {
      for (let x = 0; x < f1.width; x++) themes.add(themeAt(f1, x, y));
    }
    expect([...themes].sort()).toEqual(["f1", "f2", "f3", "f4", "f5"]);
  });

  it("floor 1 keeps campaign encounter and lore contracts", () => {
    const f1 = findFloor(1)!;
    expect(f1.encounterRate).toBeCloseTo(0.08);
    expect((f1.encounterZones ?? []).every((zone) => zone.tableFloorId === undefined)).toBe(true);
    expect(f1.npcs).toHaveLength(4);
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
});
