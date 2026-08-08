// One-shot room-assembly mutation for the Church of Saint Namanda.
// Carves the nave+apse into previously-unused Floor 1 rock at x=8-11,y=2-9,
// relocates the existing namanda-church-door to the church's own mouth
// (11,9)/(11,10) instead of the chapel-wing junction at (10,10)/(11,10) so
// crossing the door delivers an IMMEDIATE material transition (see
// docs/namanda-church-art-review for the full writeup), and wires the P0/P1
// art registered in wall-features.ts/map-sprites.ts.
//
// Run once: node scripts/assemble-namanda-church.mjs
// Idempotent guard: bails out if the church zone is already present.
import { readFileSync, writeFileSync } from "node:fs";

const FLOOR_PATHS = [
  "src/content/floors/floor-1.json",
  "tools/floor-data/floor-1.json",
  "public/tools/floor-data/floor-1.json",
];

function cell(grid, x, y) {
  return grid[y][x];
}

function setEdge(grid, x, y, dir, value) {
  grid[y][x][dir] = value;
}

// Sets a pair of edges consistently: (x1,y1)'s edge in `dir1` and the
// neighbor's opposite edge, to the same value.
const OPPOSITE = { n: "s", s: "n", e: "w", w: "e" };

function link(grid, x, y, dir, value) {
  const [nx, ny] = { n: [x, y - 1], s: [x, y + 1], e: [x + 1, y], w: [x - 1, y] }[dir];
  setEdge(grid, x, y, dir, value);
  setEdge(grid, nx, ny, OPPOSITE[dir], value);
}

function assemble(floor) {
  const grid = floor.grid;

  if ((floor.tilesetZones ?? []).some((z) => z.id === "namanda-church")) {
    console.log(`  already assembled, skipping`);
    return;
  }

  // --- Relocate the hero door: chapel-wing junction -> church's own mouth.
  // (10,10)/(11,10) reverts to a plain corridor edge; (11,9)/(11,10) becomes
  // the new door.
  link(grid, 10, 10, "e", "open");
  link(grid, 11, 10, "n", "door");

  // --- Carve the room. ------------------------------------------------
  // Apse (row 2): two cells, narrower than the nave (recessed niche feel).
  link(grid, 9, 2, "e", "open");
  link(grid, 9, 2, "s", "open");
  link(grid, 10, 2, "s", "open");

  // Row 3 (kneeling row): full 4-wide, opens up into the apse above.
  for (const x of [8, 9, 10, 11]) link(grid, x, 3, "s", "open");
  link(grid, 8, 3, "e", "open");
  link(grid, 9, 3, "e", "open");
  link(grid, 10, 3, "e", "open");

  // Rows 4-7 (nave): full 4-wide open hall.
  for (let y = 4; y <= 7; y++) {
    for (const x of [8, 9, 10, 11]) link(grid, x, y, "s", "open");
    link(grid, 8, y, "e", "open");
    link(grid, 9, y, "e", "open");
    link(grid, 10, y, "e", "open");
  }

  // Row 8 (narthex): full 4-wide, only the east column continues south.
  link(grid, 8, 8, "e", "open");
  link(grid, 9, 8, "e", "open");
  link(grid, 10, 8, "e", "open");
  link(grid, 11, 8, "s", "open");

  // Row 9 (threshold): single east-column cell, connects down to the door.
  // (its "s" edge to (11,10) was already set to "door" above via link())

  // --- Interaction tile: the altar/kneeling-rail trigger, no NPC. ------
  cell(grid, 10, 3).tile = "npc";

  // --- Tileset zones (namanda pale-stone theme). Split in two so the
  // rectangle never re-themes Sister Caldris's existing chapel corridor
  // cells at (8,9)/(9,9)/(10,9), which sit just outside this room. ------
  floor.tilesetZones = floor.tilesetZones ?? [];
  floor.tilesetZones.push(
    { id: "namanda-church", x1: 8, y1: 2, x2: 11, y2: 8, theme: "namanda" },
    { id: "namanda-church-threshold", x1: 11, y1: 9, x2: 11, y2: 9, theme: "namanda" }
  );

  // --- Door features: drop the old placement, add the relocated one. --
  floor.doorFeatures = (floor.doorFeatures ?? []).filter(
    (d) => !((d.x === 10 && d.y === 10) || (d.x === 11 && d.y === 10 && d.dir === "w"))
  );
  floor.doorFeatures.push(
    { x: 11, y: 10, dir: "n", spriteId: "namanda-church-door" },
    { x: 11, y: 9, dir: "s", spriteId: "namanda-church-door" }
  );

  // --- Wall features: apse backdrop + votive wall + reliquary niche. ---
  floor.wallFeatures = floor.wallFeatures ?? [];
  floor.wallFeatures.push(
    { x: 9, y: 2, dir: "n", spriteId: "namanda-altar" },
    { x: 10, y: 2, dir: "n", spriteId: "namanda-relief" },
    { x: 8, y: 6, dir: "w", spriteId: "namanda-votive-wall" },
    { x: 11, y: 4, dir: "e", spriteId: "namanda-reliquary-niche" }
  );

  // --- Map sprites: font (narthex) + one bench (nave). -----------------
  floor.mapSprites = floor.mapSprites ?? [];
  floor.mapSprites.push(
    { x: 9, y: 8, spriteId: "namanda-font" },
    { x: 9, y: 6, spriteId: "namanda-bench" }
  );

  // --- Ceiling sprite: reuse the existing accepted censer. -------------
  floor.ceilingSprites = floor.ceilingSprites ?? [];
  floor.ceilingSprites.push({ x: 10, y: 5, spriteId: "f1-censer" });

  // --- NPC entry for the interaction tile (never fought; combatEnemyIds
  // is empty and openNPCPanel() intercepts this id before ever reaching
  // the generic NPCController). mapSpriteId gives it real art instead of
  // the default "&" glyph billboard. ------------------------------------
  floor.npcs = floor.npcs ?? [];
  floor.npcs.push({
    id: "namanda-altar",
    name: "Namanda's altar",
    title: "silent and waiting",
    x: 10,
    y: 3,
    greeting: "",
    returnGreeting: "",
    topics: [],
    combatEnemyIds: [],
    mapSpriteId: "namanda-kneeling-rail",
  });

  floor.floorRevision = (floor.floorRevision ?? 0) + 1;
}

for (const path of FLOOR_PATHS) {
  console.log(`Assembling ${path}`);
  const floor = JSON.parse(readFileSync(path, "utf8"));
  assemble(floor);
  writeFileSync(path, JSON.stringify(floor, null, 2) + "\n");
}
console.log("Done.");
