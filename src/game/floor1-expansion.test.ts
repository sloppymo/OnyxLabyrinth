import { describe, expect, it } from "vitest";
import { findFloor } from "./floor-registry";
import { createGameState } from "./state";
import {
  canOpenBarredGate,
  openBarredGate,
  resolveTraversal,
  type Direction,
} from "./traversal";
import { isSafeZoneAt } from "./encounters";

const BASELINE_WALKABLE_CELLS = 274;

function floor1() {
  const floor = findFloor(1);
  if (!floor) throw new Error("Floor 1 not found");
  return floor;
}

function isAuthoredCell(cell: { n: string; e: string; s: string; w: string }): boolean {
  return [cell.n, cell.e, cell.s, cell.w].some((edge) => edge !== "wall");
}

describe("Floor 1 revision 9 expansion", () => {
  it("expands the bounding grid by about 30% and meaningful walkable space by 25–35%", () => {
    const floor = floor1();
    expect(floor.width).toBe(28);
    expect(floor.height).toBe(31);
    expect(floor.width * floor.height).toBe(868);
    expect(floor.floorRevision).toBeGreaterThanOrEqual(7);

    const walkable = floor.grid.flat().filter(isAuthoredCell).length;
    const change = walkable / BASELINE_WALKABLE_CELLS - 1;
    expect(walkable).toBe(374);
    expect(change).toBeGreaterThanOrEqual(0.25);
    expect(change).toBeLessThanOrEqual(0.40);
  });

  it("leaves a full renderer-safe rock buffer around every absolute boundary", () => {
    const floor = floor1();
    for (let x = 0; x < floor.width; x++) {
      expect(isAuthoredCell(floor.grid[0][x])).toBe(false);
      expect(isAuthoredCell(floor.grid[floor.height - 1][x])).toBe(false);
    }
    for (let y = 0; y < floor.height; y++) {
      expect(isAuthoredCell(floor.grid[y][0])).toBe(false);
      expect(isAuthoredCell(floor.grid[y][floor.width - 1])).toBe(false);
    }
  });

  it("preserves every major pre-expansion landmark coordinate", () => {
    const floor = floor1();
    expect([floor.startX, floor.startY]).toEqual([11, 25]);
    expect(floor.grid[8][3].tile).toBe("chute");
    expect(floor.grid[21][19].tile).toBe("stairs_down");
    expect(floor.stairsGuardian && [floor.stairsGuardian.x, floor.stairsGuardian.y]).toEqual([
      18, 21,
    ]);

    const npcPosition = (id: string) => {
      const npc = floor.npcs?.find((candidate) => candidate.id === id);
      return npc && [npc.x, npc.y];
    };
    expect(npcPosition("hot-boi")).toEqual([20, 26]);
    expect(npcPosition("namanda-altar")).toEqual([10, 3]);
    expect(npcPosition("sister-caldris")).toEqual([7, 8]);
  });

  it("moves the crypt key into the overflow gallery while retaining the old chest", () => {
    const floor = floor1();
    const keyChest = floor.treasures?.find((treasure) =>
      treasure.itemIds.includes("crypt-key")
    );
    expect(keyChest && [keyChest.x, keyChest.y]).toEqual([26, 18]);

    const oldChest = floor.treasures?.find(
      (treasure) => treasure.x === 20 && treasure.y === 12
    );
    expect(oldChest?.itemIds).toEqual(["healing-potion"]);
    expect(floor.grid[12][20].tile).toBe("treasure");
  });

  it("adds proportional authored content without renaming save-stable existing ids", () => {
    const floor = floor1();
    expect(floor.treasures).toHaveLength(8);
    expect(floor.npcs).toHaveLength(9);
    expect(floor.events).toHaveLength(16);
    expect(floor.encounterZones).toHaveLength(10);
    expect(floor.mapSprites).toHaveLength(22);

    const newNpcIds = new Set(
      floor.npcs
        ?.filter((npc) => npc.id === "morrow-company" || npc.id === "second-survey")
        .map((npc) => npc.id)
    );
    expect(newNpcIds).toEqual(new Set(["morrow-company", "second-survey"]));
    expect(isSafeZoneAt(floor, 11, 29)).toBe(true);
  });

  it("gives Isobel a reachable six-cell side nook with its own safe zone", () => {
    const floor = floor1();
    const room = [
      [16, 27], [17, 27],
      [16, 28], [17, 28],
      [16, 29], [17, 29],
    ];
    expect(room.every(([x, y]) => isAuthoredCell(floor.grid[y][x]))).toBe(true);
    expect(floor.grid[28][15].e).toBe("door");
    expect(floor.grid[28][16].w).toBe("door");
    expect(isSafeZoneAt(floor, 17, 28)).toBe(true);
    expect(floor.grid[28][17].tile).toBe("npc");
    expect(floor.npcs?.find((npc) => npc.id === "isobel")).toMatchObject({ x: 17, y: 28 });
  });
});

describe("Floor 1 Stitchworks return gate", () => {
  it("is authored symmetrically and can only be released from the upper side", () => {
    const floor = floor1();
    expect(floor.grid[11][24].s).toBe("barred");
    expect(floor.grid[12][24].n).toBe("barred");
    expect(canOpenBarredGate(floor, 24, 11, 2 as Direction)).toBe(true);
    expect(canOpenBarredGate(floor, 24, 12, 0 as Direction)).toBe(false);
  });

  it("becomes a permanent two-way door after opening from the Stitchworks", () => {
    const state = createGameState(floor1());
    state.player.x = 24;
    state.player.y = 11;
    state.player.facing = 2;

    const blocked = resolveTraversal(state, 2 as Direction);
    expect(blocked.kind).toBe("barred-gate");
    if (blocked.kind === "barred-gate") expect(blocked.canOpen).toBe(true);

    expect(openBarredGate(state, 2 as Direction)).toBe(true);
    expect(state.floor.grid[11][24].s).toBe("door");
    expect(state.floor.grid[12][24].n).toBe("door");
    expect(resolveTraversal(state, 2 as Direction).kind).toBe("step");
  });
});
