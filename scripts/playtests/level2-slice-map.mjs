// Level 2 vertical slice — "The Sunken Processional".
// Builds the FloorMapJSON programmatically from a named-cell plan so the
// layout stays editable. Shared by the walk/capture playtest and the export
// step that produces src/content/floors/level-2-slice.json.
import { writeFileSync } from "node:fs";

export const LEVEL2_SLICE_ID = 6;

const wall = () => ({ n: "wall", e: "wall", s: "wall", w: "wall" });

// --- The route -------------------------------------------------------------
// A  approach corridor (1x)        (1,10) start -> (3,10)
// S  seam foreshadow (0 -> 2.5)    (4,10) + niches (4,9) (4,11)
// T  threshold antechamber (1.5x)  (5,10) (6,10), door at (4,10)e
// C  ramp climb (0 -> 1, air 2)    (6,9) (6,8) (6,7) (6,6)
// G  gallery (floorZ 1, air 3)     (6,5) (7,5) (8,5) (9,5)
// D  grand stair (1 -> 0, air 3)   (9,6) (9,7)
// H  procession hall (0 -> 3)      x 8..12 y 8..12 (5x5 chamber)
// K  votive chapel (0 -> 2)        (7,8) (7,9), door at (8,9)w
// R  return link (1x)              (7,10), door at (8,10)w

const AIR = [
  [1, 10], [2, 10], [3, 10],
  [4, 10], [4, 9], [4, 11],
  [5, 10], [6, 10],
  [6, 9], [6, 8], [6, 7], [6, 6],
  [6, 5], [7, 5], [8, 5], [9, 5],
  [9, 6], [9, 7],
  [8, 8], [9, 8], [10, 8], [11, 8], [12, 8],
  [8, 9], [9, 9], [10, 9], [11, 9], [12, 9],
  [8, 10], [9, 10], [10, 10], [11, 10], [12, 10],
  [8, 11], [9, 11], [10, 11], [11, 11], [12, 11],
  [8, 12], [9, 12], [10, 12], [11, 12], [12, 12],
  [7, 8], [7, 9],
  [7, 10],
];

const DOORS = [
  // [x, y, dir] — dir names the edge of (x,y) that is a door.
  [5, 10, "e"], // threshold door mid-antechamber, so the seam breathes first
  [8, 9, "w"], // chapel door
  [8, 10, "w"], // return-loop door
];

export function makeLevel2SliceMap({ theme = "f1" } = {}) {
  const width = 16;
  const height = 14;
  const grid = Array.from({ length: height }, () =>
    Array.from({ length: width }, wall)
  );
  const air = new Set(AIR.map(([x, y]) => `${x},${y}`));
  const directions = [
    ["n", 0, -1, "s"],
    ["e", 1, 0, "w"],
    ["s", 0, 1, "n"],
    ["w", -1, 0, "e"],
  ];
  for (const key of air) {
    const [x, y] = key.split(",").map(Number);
    for (const [dir, dx, dy, opposite] of directions) {
      if (!air.has(`${x + dx},${y + dy}`)) continue;
      grid[y][x][dir] = "open";
      grid[y + dy][x + dx][opposite] = "open";
    }
  }
  for (const [x, y, dir] of DOORS) {
    const [, dx, dy, opposite] = directions.find(([d]) => d === dir);
    grid[y][x][dir] = "door";
    grid[y + dy][x + dx][opposite] = "door";
  }
  // The chapel shares a grid line with the ramp climb; connector side edges
  // must be walls, so re-seal those shared edges after carving.
  for (const y of [8, 9]) {
    grid[y][6].e = "wall";
    grid[y][7].w = "wall";
  }
  // (7,8) is also grid-adjacent to the hall's (8,8), one row above the
  // intended chapel door at (8,9)w — reseal it so the chapel/return-link
  // column (7,8)-(7,9)-(7,10) has exactly its two designed hall doors
  // ((8,9)w chapel, (8,10)w return-loop), not a free third opening that
  // lets the threshold's return-link connector skip the whole climb.
  grid[8][7].e = "wall";
  grid[8][8].w = "wall";
  for (const [x, y] of [[5, 10], [9, 5], [7, 8], [10, 8]]) {
    grid[y][x].tile = "event";
  }
  return {
    formatVersion: 1,
    id: LEVEL2_SLICE_ID,
    name: "The Sunken Processional (Vertical Slice)",
    width,
    height,
    startX: 1,
    startY: 10,
    encounterRate: 0,
    tilesetTheme: theme,
    tilesetZones: [
      // Localized floor-only reskins: same wall/ceiling/door art, alternate
      // floorA/floorB pair (both slots ship the same texture, so the zone
      // reads correctly regardless of the (x+y)%2 floorA/floorB parity).
      { id: "hall-drain", x1: 8, y1: 10, x2: 8, y2: 10, theme: "descent-grate" },
      // Spans the full approach corridor so the inlay reads as a
      // continuous processional path, not a one-cell crossing seam.
      { id: "approach-inlay", x1: 1, y1: 10, x2: 3, y2: 10, theme: "descent-inlay" },
    ],
    heightZones: [
      { id: "seam", x1: 4, y1: 9, x2: 4, y2: 11, ceilingZ: 2.5 },
      { id: "antechamber", x1: 5, y1: 10, x2: 6, y2: 10, ceilingZ: 1.5 },
      { id: "climb-air", x1: 6, y1: 6, x2: 6, y2: 9, ceilingZ: 2 },
      { id: "climb-q1", x1: 6, y1: 8, x2: 6, y2: 8, floorZ: 0.25 },
      { id: "climb-q2", x1: 6, y1: 7, x2: 6, y2: 7, floorZ: 0.5 },
      { id: "climb-q3", x1: 6, y1: 6, x2: 6, y2: 6, floorZ: 0.75 },
      { id: "gallery", x1: 6, y1: 5, x2: 9, y2: 5, floorZ: 1, ceilingZ: 3 },
      { id: "stair-air", x1: 9, y1: 6, x2: 9, y2: 7, ceilingZ: 3 },
      { id: "stair-mid", x1: 9, y1: 6, x2: 9, y2: 6, floorZ: 0.5 },
      { id: "hall", x1: 8, y1: 8, x2: 12, y2: 12, ceilingZ: 3 },
      { id: "chapel", x1: 7, y1: 8, x2: 7, y2: 9, ceilingZ: 2 },
    ],
    ramps: [
      { x: 6, y: 9, dir: "n", surface: "ramp" },
      { x: 6, y: 8, dir: "n", surface: "ramp" },
      { x: 6, y: 7, dir: "n", surface: "ramp" },
      { x: 6, y: 6, dir: "n", surface: "ramp" },
      { x: 9, y: 6, dir: "n", surface: "stairs" },
      { x: 9, y: 7, dir: "n", surface: "stairs" },
    ],
    events: [
      {
        x: 5, y: 10, kind: "message", once: true,
        message: "The worked stone changes: older blocks, bronze-strapped, laid for a road that walked downward.",
      },
      {
        x: 9, y: 5, kind: "message", once: true,
        message: "The stair falls away into a hall built for a procession. Something enormous is sealed at the far end.",
      },
      {
        x: 7, y: 8, kind: "message", once: true,
        message: "A votive chapel. The offerings are dust — but someone has stacked the bowls neatly, recently.",
      },
      {
        x: 10, y: 8, kind: "message", once: true,
        message: "The gate has never opened. Chains as thick as your arm vanish into the dark above it.",
      },
    ],
    mapSprites: [
      { x: 7, y: 8, spriteId: "descent-offering-bowls" },
    ],
    wallFeatures: [
      { x: 2, y: 10, dir: "n", spriteId: "descent-sconce" },
      // Asymmetric side-wall pools keep the gate chamber mostly dark while
      // giving the lock and one pier a functional warm rake of light.
      { x: 8, y: 11, dir: "w", spriteId: "descent-sconce" },
      { x: 12, y: 9, dir: "e", spriteId: "descent-sconce" },
      { x: 6, y: 10, dir: "s", spriteId: "descent-niche-votive" },
      { x: 6, y: 8, dir: "w", spriteId: "descent-bronze-grate" },
      // The climb's middle two risers (6,7)/(6,6) were bare on both walls —
      // a sconce lights the way and the full-brightness relief (the subdued
      // sibling waits at the gallery top) gives it something to reveal.
      { x: 6, y: 7, dir: "e", spriteId: "descent-sconce" },
      { x: 6, y: 6, dir: "e", spriteId: "descent-relief-procession" },
      { x: 7, y: 5, dir: "n", spriteId: "descent-relief-procession-subdued" },
      { x: 7, y: 8, dir: "n", spriteId: "descent-niche-votive" },
      { x: 7, y: 10, dir: "s", spriteId: "descent-repair-plate" },
      { x: 9, y: 5, dir: "e", spriteId: "descent-structural-band" },
      { x: 12, y: 11, dir: "e", spriteId: "descent-sealed-valve" },
    ],
    architecturalProps: [
      // Naked blockout: shallow, wall-hugging supports frame the volume;
      // the gate is one unified destination silhouette on the south wall.
      { id: "hall-support-west-north", x: 8, y: 8, kind: "box", facing: "s", width: 0.22, height: 2.7, depth: 0.18, texture: "support-basalt.png", offsetX: -0.34, offsetZ: -0.34, alphaMode: "opaque" },
      { id: "hall-support-east-north", x: 12, y: 8, kind: "box", facing: "s", width: 0.22, height: 2.7, depth: 0.18, texture: "support-basalt.png", offsetX: 0.34, offsetZ: -0.34, alphaMode: "opaque" },
      { id: "hall-support-west-south", x: 8, y: 10, kind: "box", facing: "s", width: 0.22, height: 2.7, depth: 0.18, texture: "support-basalt.png", offsetX: -0.34, offsetZ: 0.34, alphaMode: "opaque" },
      { id: "hall-support-east-south", x: 12, y: 10, kind: "box", facing: "s", width: 0.22, height: 2.7, depth: 0.18, texture: "support-basalt.png", offsetX: 0.34, offsetZ: 0.34, alphaMode: "opaque" },
      { id: "gate-frame-west", x: 8, y: 12, kind: "box", facing: "s", width: 0.22, height: 2.8, depth: 0.16, texture: "support-basalt.png", offsetX: 0.12, offsetZ: 0.46, alphaMode: "opaque" },
      { id: "gate-frame-east", x: 12, y: 12, kind: "box", facing: "s", width: 0.22, height: 2.8, depth: 0.16, texture: "support-basalt.png", offsetX: -0.12, offsetZ: 0.46, alphaMode: "opaque" },
      { id: "gate-frame-lintel", x: 10, y: 12, kind: "box", facing: "s", width: 4.0, height: 0.34, depth: 0.16, texture: "support-basalt.png", offsetZ: 0.46, anchor: "ceiling", alphaMode: "opaque" },
      { id: "gate-unified", x: 10, y: 12, kind: "box", facing: "s", width: 3.55, height: 2.45, depth: 0.1, texture: "gate-kept.png", offsetZ: 0.48, alphaMode: "opaque" },
      // Masonry conduit stub, cut off mid-air above the drain grate below —
      // ties the wall infrastructure to the floor without new art; the gap
      // before it reaches the floor reads as the same disused/sealed
      // plumbing language as the valve at (12,11).
      { id: "grate-conduit-stub", x: 8, y: 10, kind: "box", facing: "e", width: 0.16, height: 0.9, depth: 0.14, texture: "support-basalt.png", offsetX: -0.3, anchor: "ceiling", alphaMode: "opaque" },
    ],
    ceilingFeatures: [
      { x: 4, y: 10, spriteId: "descent-ceiling-shaft" },
      { x: 10, y: 12, spriteId: "descent-ceiling-shaft" },
      { x: 9, y: 8, spriteId: "descent-ceiling-beam" },
    ],
    ceilingSprites: [
      { x: 4, y: 9, spriteId: "descent-chain-heavy", scale: 1.4 },
      { x: 4, y: 11, spriteId: "descent-chain-heavy", scale: 1.4 },
      { x: 7, y: 5, spriteId: "descent-censer", scale: 0.45 },
      { x: 10, y: 11, spriteId: "descent-chain-heavy", scale: 0.68 },
      { x: 9, y: 11, spriteId: "descent-counterweight", scale: 0.30 },
      { x: 7, y: 9, spriteId: "descent-censer", scale: 0.4 },
    ],
    grid,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] ?? "src/content/floors/level-2-slice.json";
  const theme = process.argv[3] ?? "f1";
  writeFileSync(out, JSON.stringify(makeLevel2SliceMap({ theme }), null, 2) + "\n");
  console.log(`wrote ${out} (theme ${theme})`);
}
