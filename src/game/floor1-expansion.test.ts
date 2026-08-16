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
    // Revision 10 (the Kept Gate entrance, appended south) added 6 more rows
    // on top of revision 9's 31; revision 11 added 4 more for the narrow
    // approach corridor ahead of the gate hall. See "Floor 1 revision 10/11"
    // below.
    expect(floor.height).toBe(41);
    expect(floor.width * floor.height).toBe(1148);
    expect(floor.floorRevision).toBeGreaterThanOrEqual(7);

    const walkable = floor.grid.flat().filter(isAuthoredCell).length;
    const change = walkable / BASELINE_WALKABLE_CELLS - 1;
    // Revision 9 alone landed at 374/274 (+36%); revisions 10-11 add the
    // gate hall and its approach corridor on top, so the combined change is
    // measured against the same pre-revision-9 baseline and no longer fits
    // revision 9's own 25–40% band in isolation.
    expect(walkable).toBe(403);
    expect(change).toBeGreaterThanOrEqual(0.25);
    expect(change).toBeLessThanOrEqual(0.50);
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
    // Revision 10 moved start into the new Kept Gate entrance; revision 11
    // pushed it further south down a narrow approach corridor. The old
    // revision-9 start (11,25) is still the doorway into the rest of F1.
    expect([floor.startX, floor.startY]).toEqual([11, 39]);
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
    // +1 for the revision 10 gate-hall entry message, +1 for the revision 11
    // gate-threshold beat just past the gate.
    expect(floor.events).toHaveLength(18);
    expect(floor.encounterZones).toHaveLength(11);
    expect(floor.mapSprites).toHaveLength(28);

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
    expect(
      floor.mapSprites
        ?.filter((sprite) => sprite.x === 17 && sprite.y === 28)
        .map((sprite) => sprite.spriteId)
    ).toEqual(["isobel-sales-counter", "isobel-sales-counter-front"]);
    expect(floor.grid[28][17].tile).toBe("npc");
    expect(floor.npcs?.find((npc) => npc.id === "isobel")).toMatchObject({ x: 17, y: 28 });
  });
});

describe("Floor 1 revision 10/11 — the Kept Gate entrance", () => {
  it("starts the player at the south end of a narrow approach corridor", () => {
    const state = createGameState(floor1());
    expect(state.player).toMatchObject({ x: 11, y: 39, facing: 0 });
  });

  it("carries the ported architecturalProp gate and its ceiling dressing", () => {
    const floor = floor1();
    const gate = floor.architecturalProps?.find((p) => p.id === "gate-unified");
    expect(gate).toMatchObject({ x: 11, y: 31, facing: "n", texture: "gate-kept.png" });
    const west = floor.architecturalProps?.find((p) => p.id === "gate-frame-west");
    const lintel = floor.architecturalProps?.find((p) => p.id === "gate-frame-lintel");
    expect(west?.depth).toBeGreaterThanOrEqual(0.5);
    expect(lintel?.depth).toBe(west?.depth);
    expect(gate?.depth).toBeLessThan(west!.depth!);
    expect(west!.offsetZ!).toBeGreaterThan(gate!.offsetZ!);
    expect(
      floor.ceilingSprites?.some((s) => s.spriteId === "descent-counterweight")
    ).toBe(true);
    const zone = floor.heightZones?.find((z) => z.id === "gate-hall");
    expect(zone).toMatchObject({ x1: 9, y1: 31, x2: 13, y2: 35, ceilingZ: 3 });
  });

  it("gives the gate a real approach: a 1-wide corridor outside the vaulted hall", () => {
    const floor = floor1();
    // Rows 36-39 are a narrow neck south of the 5x5 hall (which starts at
    // y31), so the gate is visible at a real distance before the ceiling
    // opens up — at 4 tiles out it would already fill ~48% of the horizontal
    // FOV, so this corridor is what gives the reveal room to breathe.
    for (let y = 36; y <= 39; y++) {
      expect(floor.grid[y][11].e).toBe("wall");
      expect(floor.grid[y][11].w).toBe("wall");
    }
    expect(floor.grid[35][11].s).toBe("open");
    expect(floor.grid[36][11].n).toBe("open");
    expect(floor.grid[39][11].s).toBe("wall");
    // Renderer-safe rock buffer still holds at the new absolute boundary.
    expect(floor.grid[40].every((c) => c.n === "wall" && c.e === "wall" && c.s === "wall" && c.w === "wall")).toBe(true);
  });

  it("routes into the old start through Surveyors-Rest, not a new shortcut", () => {
    const floor = floor1();
    expect(floor.grid[31][11].n).toBe("open");
    expect(floor.grid[30][11].s).toBe("open");
    expect(floor.grid[29][11].s).toBe("open");
    // Only the center column punches through; the rest of the old south
    // border stays sealed rock.
    expect(floor.grid[30][10].n).toBe("wall");
    expect(floor.grid[30][12].n).toBe("wall");
  });

  it("puts a minor threshold danger between the gate and the guaranteed-safe camp", () => {
    const floor = floor1();
    const threshold = floor.encounterZones?.find((z) => z.id === "gate-threshold");
    expect(threshold).toMatchObject({ x1: 9, y1: 30, x2: 13, y2: 30, rateMul: 1.4 });
    // Surveyors-Rest itself is still fully safe past the threshold row.
    const rest = floor.encounterZones?.find((z) => z.id === "surveyors-rest-safe");
    expect(rest).toMatchObject({ safeZone: true, rateMul: 0 });
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

describe("Floor 1 vertical graybox", () => {
  it("raises Index and Ember, keeps Central Hall from overlapping at x=9", () => {
    const floor = floor1();
    const index = floor.heightZones?.find((z) => z.id === "index-stack");
    const ramp = floor.heightZones?.find((z) => z.id === "index-ramp");
    const central = floor.heightZones?.find((z) => z.id === "central-hall");
    const ember = floor.heightZones?.find((z) => z.id === "ember-elevated");
    const stitchworks = floor.heightZones?.find((z) => z.id === "stitchworks-loft");

    expect(index).toMatchObject({ x1: 1, y1: 12, x2: 9, y2: 20, floorZ: 1, ceilingZ: 5 });
    expect(ramp).toMatchObject({ x1: 10, y1: 18, x2: 10, y2: 18, floorZ: 0, ceilingZ: 2.5 });
    expect(central).toMatchObject({ x1: 10, y1: 12, x2: 14, y2: 26, ceilingZ: 2 });
    expect(ember).toMatchObject({ x1: 14, y1: 2, x2: 22, y2: 11, floorZ: 1, ceilingZ: 4.2 });
    expect(stitchworks).toMatchObject({
      x1: 23,
      y1: 2,
      x2: 26,
      y2: 10,
      floorZ: 1,
      ceilingZ: 4.8,
    });
  });

  it("uses ceiling height as Wound orientation, not a single tall crypt", () => {
    const floor = floor1();
    const z = (id: string) => floor.heightZones?.find((h) => h.id === id);
    expect(z("chapel-vault")?.ceilingZ).toBe(4.2);
    expect(z("namanda-vault")?.ceilingZ).toBe(5.5);
    expect(z("cistern-channel")?.ceilingZ).toBe(1.2);
    expect(z("cistern-overflow")?.ceilingZ).toBe(2.6);
    expect(z("surveyors-rest")?.ceilingZ).toBe(1.15);
    expect(z("hotboi-tavern")?.ceilingZ).toBe(1.25);
    expect(z("namanda-vault")!.ceilingZ!).toBeGreaterThan(z("chapel-vault")!.ceilingZ!);
    expect(z("cistern-channel")!.ceilingZ!).toBeLessThan(z("central-hall")!.ceilingZ!);
    expect(z("index-stack")!.ceilingZ! - z("index-stack")!.floorZ!).toBe(4);
  });

  it("has three ramps at the audited connectors", () => {
    const floor = floor1();
    const ramps = floor.ramps || [];
    expect(ramps.some((r) => r.x === 10 && r.y === 18 && r.dir === "w")).toBe(true);
    expect(ramps.some((r) => r.x === 13 && r.y === 4 && r.dir === "e")).toBe(true);
    expect(ramps.some((r) => r.x === 13 && r.y === 10 && r.dir === "e")).toBe(true);
  });

  it("gives the Index ramp side walls so the player cannot slip sideways off the slope", () => {
    const floor = floor1();
    expect(floor.grid[18][10].n).toBe("wall");
    expect(floor.grid[18][10].s).toBe("wall");
    expect(floor.grid[18][10].w).toBe("open");
    expect(floor.grid[18][10].e).toBe("open");
  });

  it("seals the forbidden Index perimeter edges", () => {
    const floor = floor1();
    expect(floor.grid[12][9].e).toBe("wall");
    expect(floor.grid[12][10].w).toBe("wall");
    expect(floor.grid[15][9].e).toBe("wall");
    expect(floor.grid[15][10].w).toBe("wall");
    expect(floor.grid[19][9].e).toBe("wall");
    expect(floor.grid[19][10].w).toBe("wall");
    expect(floor.grid[20][9].e).toBe("wall");
    expect(floor.grid[20][10].w).toBe("wall");
    expect(floor.grid[20][9].s).toBe("wall");
    expect(floor.grid[21][9].n).toBe("wall");
  });

  it("seals the forbidden Ember perimeter edges", () => {
    const floor = floor1();
    expect(floor.grid[6][13].e).toBe("wall");
    expect(floor.grid[6][14].w).toBe("wall");
    expect(floor.grid[8][13].e).toBe("wall");
    expect(floor.grid[8][14].w).toBe("wall");
  });

  it("seals the forbidden Stitchworks perimeter edges", () => {
    const floor = floor1();
    expect(floor.grid[10][23].s).toBe("wall");
    expect(floor.grid[10][24].s).toBe("wall");
    expect(floor.grid[10][25].s).toBe("wall");
    expect(floor.grid[10][26].s).toBe("wall");
    expect(floor.grid[11][23].n).toBe("wall");
    expect(floor.grid[11][24].n).toBe("wall");
    expect(floor.grid[11][25].n).toBe("wall");
    expect(floor.grid[11][26].n).toBe("wall");
  });

  it("keeps the (24,11) barred gate unchanged as a base-level shortcut", () => {
    const floor = floor1();
    expect(floor.grid[11][24].s).toBe("barred");
    expect(floor.grid[12][24].n).toBe("barred");
    expect(canOpenBarredGate(floor, 24, 11, 2 as Direction)).toBe(true);
    expect(canOpenBarredGate(floor, 24, 12, 0 as Direction)).toBe(false);
  });
});
