import type { CellJSON, FloorMapJSON } from "../game/floor-map";

/** Synthetic vertical-traversal QA floor for Phase D browser/unit testing.
 *  A lower east-west corridor with an upper bridge over it, a ladder at the
 *  west end, water under the bridge, and different horizontal exits on the
 *  upper vs lower levels.
 */
export function createVerticalSyntheticQA(): FloorMapJSON {
  const width = 10;
  const height = 10;
  const cell = (): CellJSON => ({ n: "wall", e: "wall", s: "wall", w: "wall" });
  const grid = Array.from({ length: height }, () =>
    Array.from({ length: width }, cell)
  );

  // Lower corridor (y=4, x=1..6) and a southern courtyard for look-back.
  const lower = new Set<string>();
  for (let x = 1; x <= 6; x++) lower.add(`${x},4`);
  for (let x = 2; x <= 4; x++) {
    lower.add(`${x},3`);
    lower.add(`${x},5`);
  }
  // Upper bridge (y=4, x=1..4) at z=1.
  const upper = new Set<string>();
  for (let x = 1; x <= 4; x++) upper.add(`${x},4`);

  const directions = [
    ["n", 0, -1, "s"],
    ["e", 1, 0, "w"],
    ["s", 0, 1, "n"],
    ["w", -1, 0, "e"],
  ] as const;

  for (const key of lower) {
    const [x, y] = key.split(",").map(Number);
    for (const [dir, dx, dy, opposite] of directions) {
      if (!lower.has(`${x + dx},${y + dy}`)) continue;
      grid[y]![x]![dir] = "open";
      grid[y + dy]![x + dx]![opposite] = "open";
    }
  }

  // The lower can go one cell further east than the upper.
  // (4,4)-(5,4) and (5,4)-(6,4) are already open because both are in `lower`.

  // Water under the bridge at x=2.
  grid[4]![2]!.tile = "water";
  // A treasure under the bridge at x=3.
  grid[4]![3]!.tile = "treasure";

  return {
    formatVersion: 1,
    id: 93,
    name: "Synthetic Vertical QA",
    width,
    height,
    startX: 1,
    startY: 4,
    encounterRate: 0,
    tilesetTheme: "f1",
    heightZones: [
      { id: "bridge-air", x1: 1, y1: 4, x2: 4, y2: 4, ceilingZ: 2.5 },
      {
        id: "courtyard-s",
        x1: 2,
        y1: 5,
        x2: 4,
        y2: 5,
        ceilingZ: 1,
      },
    ],
    verticalLandings: [
      {
        id: "bridge-w",
        x: 1,
        y: 4,
        z: 1,
        edgeOverrides: { n: "wall", e: "open", s: "wall", w: "wall" },
      },
      {
        id: "bridge-mid-1",
        x: 2,
        y: 4,
        z: 1,
        edgeOverrides: { n: "wall", e: "open", s: "open", w: "open" },
      },
      {
        id: "bridge-mid-2",
        x: 3,
        y: 4,
        z: 1,
        edgeOverrides: { n: "wall", e: "open", s: "open", w: "open" },
      },
      {
        id: "bridge-e",
        x: 4,
        y: 4,
        z: 1,
        edgeOverrides: { n: "wall", e: "wall", s: "open", w: "open" },
      },
    ],
    ladders: [
      { id: "west-ladder", x: 1, y: 4, fromZ: 0, toZ: 1, facing: "n" },
    ],
    mapSprites: [
      { x: 6, y: 4, spriteId: "crate" },
      { x: 1, y: 5, spriteId: "barrel" },
      { x: 2, y: 5, spriteId: "bones" },
    ],
    grid,
  };
}
