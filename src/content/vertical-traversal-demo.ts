import type { CellJSON, FloorMapJSON } from "../game/floor-map";

/** Small, safe, dev-only showcase floor for live Renderer 2 demos. */
export function createVerticalTraversalDemoMap(): FloorMapJSON {
  const width = 10;
  const height = 13;
  const cell = (): CellJSON => ({ n: "wall", e: "wall", s: "wall", w: "wall" });
  const grid = Array.from({ length: height }, () =>
    Array.from({ length: width }, cell),
  );
  const air = new Set<string>();
  for (let x = 1; x <= 7; x++) air.add(`${x},2`);
  for (let x = 1; x <= 2; x++) air.add(`${x},6`);
  for (let y = 4; y <= 8; y++) for (let x = 3; x <= 6; x++) air.add(`${x},${y}`);
  for (let x = 1; x <= 5; x++) air.add(`${x},10`);
  const directions = [
    ["n", 0, -1, "s"], ["e", 1, 0, "w"],
    ["s", 0, 1, "n"], ["w", -1, 0, "e"],
  ] as const;
  for (const key of air) {
    const [x, y] = key.split(",").map(Number);
    for (const [dir, dx, dy, opposite] of directions) {
      if (!air.has(`${x + dx},${y + dy}`)) continue;
      grid[y]![x]![dir] = "open";
      grid[y + dy]![x + dx]![opposite] = "open";
    }
  }
  return {
    formatVersion: 1,
    id: 92,
    name: "Renderer 2 Vertical Traversal Laboratory",
    width,
    height,
    startX: 1,
    startY: 6,
    encounterRate: 0,
    tilesetTheme: "f1",
    heightZones: [
      { id: "start-air", x1: 1, y1: 6, x2: 1, y2: 6, ceilingZ: 3 },
      { id: "single-connector-air", x1: 2, y1: 6, x2: 2, y2: 6, ceilingZ: 2 },
      { id: "tall-high-room", x1: 3, y1: 4, x2: 6, y2: 8, floorZ: 1, ceilingZ: 3 },
      { id: "gradual-air", x1: 2, y1: 2, x2: 5, y2: 2, ceilingZ: 2 },
      { id: "gradual-quarter", x1: 3, y1: 2, x2: 3, y2: 2, floorZ: 0.25 },
      { id: "gradual-half", x1: 4, y1: 2, x2: 4, y2: 2, floorZ: 0.5 },
      { id: "gradual-three-quarter", x1: 5, y1: 2, x2: 5, y2: 2, floorZ: 0.75 },
      { id: "gradual-high", x1: 6, y1: 2, x2: 7, y2: 2, floorZ: 1, ceilingZ: 3 },
      { id: "stair-air", x1: 2, y1: 10, x2: 2, y2: 10, ceilingZ: 2 },
      { id: "stair-high", x1: 3, y1: 10, x2: 5, y2: 10, floorZ: 1, ceilingZ: 2.5 },
    ],
    ramps: [
      { x: 2, y: 6, dir: "e", surface: "ramp" },
      { x: 2, y: 2, dir: "e", surface: "ramp" },
      { x: 3, y: 2, dir: "e", surface: "ramp" },
      { x: 4, y: 2, dir: "e", surface: "ramp" },
      { x: 5, y: 2, dir: "e", surface: "ramp" },
      { x: 2, y: 10, dir: "e", surface: "stairs" },
    ],
    mapSprites: [
      { x: 5, y: 6, spriteId: "crate" },
      { x: 4, y: 7, spriteId: "barrel" },
      { x: 5, y: 7, spriteId: "bones" },
      { x: 5, y: 5, spriteId: "torch" },
      { x: 4, y: 5, spriteId: "camp-lantern-post" },
      { x: 4, y: 2, spriteId: "chest-closed" },
      { x: 7, y: 2, spriteId: "torch" },
      { x: 4, y: 10, spriteId: "anvil-altar" },
      { x: 5, y: 10, spriteId: "barrel" },
    ],
    wallFeatures: [
      { x: 3, y: 5, dir: "w", spriteId: "bell" },
      { x: 6, y: 7, dir: "e", spriteId: "writing-plaque" },
      { x: 4, y: 4, dir: "n", spriteId: "ember-scorch" },
      { x: 6, y: 5, dir: "e", spriteId: "upward-water" },
    ],
    ceilingFeatures: [
      { x: 4, y: 5, spriteId: "f1-ceiling-grate" },
      { x: 5, y: 7, spriteId: "f1-ceiling-beam" },
      { x: 6, y: 6, spriteId: "f1-ceiling-crack-roots" },
    ],
    ceilingSprites: [
      { x: 4, y: 6, spriteId: "f1-chain-long", scale: 1 },
      { x: 5, y: 5, spriteId: "f1-chain-long", scale: 0.8 },
    ],
    verticalLandings: [
      {
        id: "start-platform",
        x: 1,
        y: 6,
        z: 1,
        edgeOverrides: { n: "wall", e: "wall", s: "wall", w: "wall" },
      },
    ],
    ladders: [
      { id: "start-ladder", x: 1, y: 6, fromZ: 0, toZ: 1, facing: "e" },
    ],
    grid,
  };
}
