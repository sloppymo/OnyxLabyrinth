// Deterministically expands Floor 1 eastward and carves only The Camp's
// approved approach + 10x10 first-pass shell. Existing coordinates and
// authored overlays are preserved by value.
//
// Usage: node scripts/carve-floor1-camp-shell.mjs
//
// The extra x=35..39 columns intentionally remain solid future headroom.

import { readFileSync, writeFileSync } from "node:fs";

const FLOOR_PATH = new URL("../src/content/floors/floor-1.json", import.meta.url);
const TARGET_WIDTH = 40;
const TARGET_HEIGHT = 28;
const CAMP = { x1: 25, y1: 8, x2: 34, y2: 17 };

const floor = JSON.parse(readFileSync(FLOOR_PATH, "utf8"));

if (floor.height !== TARGET_HEIGHT || floor.grid.length !== TARGET_HEIGHT) {
  throw new Error(`Expected the approved 28-row Floor 1, got ${floor.height}`);
}
if (![24, TARGET_WIDTH].includes(floor.width)) {
  throw new Error(`Expected Floor 1 width 24 or ${TARGET_WIDTH}, got ${floor.width}`);
}

const solidCell = () => ({ n: "wall", e: "wall", s: "wall", w: "wall" });

for (const [y, row] of floor.grid.entries()) {
  if (![24, TARGET_WIDTH].includes(row.length)) {
    throw new Error(`Unexpected row ${y} width ${row.length}`);
  }
  while (row.length < TARGET_WIDTH) row.push(solidCell());
}
floor.width = TARGET_WIDTH;

const opposite = { n: "s", e: "w", s: "n", w: "e" };
const delta = {
  n: [0, -1],
  e: [1, 0],
  s: [0, 1],
  w: [-1, 0],
};

function setEdge(x, y, dir, edge) {
  const cell = floor.grid[y]?.[x];
  if (!cell) throw new Error(`Cell (${x},${y}) is out of bounds`);
  cell[dir] = edge;
  const [dx, dy] = delta[dir];
  const neighbor = floor.grid[y + dy]?.[x + dx];
  if (!neighbor) throw new Error(`Neighbor of (${x},${y}) ${dir} is out of bounds`);
  neighbor[opposite[dir]] = edge;
}

// Broad open heart: all internal tile boundaries are open. The perimeter
// remains masonry, with one west-facing threshold at y=12.
for (let y = CAMP.y1; y <= CAMP.y2; y++) {
  for (let x = CAMP.x1; x <= CAMP.x2; x++) {
    if (x < CAMP.x2) setEdge(x, y, "e", "open");
    if (y < CAMP.y2) setEdge(x, y, "s", "open");
  }
}

// Existing east route -> enclosed approach -> Camp threshold.
setEdge(21, 12, "e", "open");
setEdge(22, 12, "e", "open");
setEdge(23, 12, "e", "open");
setEdge(24, 12, "e", "door");

const campTilesetZone = {
  id: "the-camp",
  x1: CAMP.x1,
  y1: CAMP.y1,
  x2: CAMP.x2,
  y2: CAMP.y2,
  theme: "camp",
};
floor.tilesetZones = [
  ...(floor.tilesetZones ?? []).filter((zone) => zone.id !== campTilesetZone.id),
  campTilesetZone,
];

const campEncounterZone = {
  id: "the-camp-refuge",
  x1: CAMP.x1,
  y1: CAMP.y1,
  x2: CAMP.x2,
  y2: CAMP.y2,
  rateMul: 0,
  safeZone: true,
};
floor.encounterZones = [
  ...(floor.encounterZones ?? []).filter((zone) => zone.id !== campEncounterZone.id),
  campEncounterZone,
];

// Three sparse star cells break the visual reading of "blue roof" without
// covering the central field in obvious ceiling furniture. Two variants keep
// the tiny celestial marks from forming a regular stamp grid.
const campSkyFeatureIds = new Set(["camp-sky-star-a", "camp-sky-star-b"]);
floor.ceilingFeatures = [
  ...(floor.ceilingFeatures ?? []).filter((feature) => !campSkyFeatureIds.has(feature.spriteId)),
  { x: 28, y: 10, spriteId: "camp-sky-star-a" },
  { x: 33, y: 15, spriteId: "camp-sky-star-b" },
  { x: 27, y: 16, spriteId: "camp-sky-star-b" },
];

const campSpriteIds = new Set([
  "camp-tent-large",
  "camp-wagon",
  "camp-fire",
  "camp-dead-tree",
  "camp-supply-stack",
  "camp-smith-work-area",
  "camp-map-table",
  "camp-palisade-checkpoint",
  "camp-armor-rack",
  "camp-barrel-stack",
  "camp-bedrolls",
  "camp-cookpot",
  "camp-crate-stack",
  "camp-gear-pile",
  "camp-grindstone",
  "camp-handcart",
  "camp-lantern-post",
  "camp-rough-fence",
  "camp-tent-small",
  "camp-weapon-rack",
  "camp-adventurer-cards",
  "camp-adventurer-map-study",
  "camp-adventurer-shield-repair",
  "camp-adventurer-sleeping",
  "camp-adventurer-stew",
  "camp-adventurer-watch",
  "camp-adventurer-wounded",
]);
floor.mapSprites = [
  ...(floor.mapSprites ?? []).filter((sprite) => !campSpriteIds.has(sprite.spriteId)),
  { x: 26, y: 9, spriteId: "camp-tent-large" },
  { x: 33, y: 9, spriteId: "camp-wagon" },
  { x: 29, y: 12, spriteId: "camp-fire" },
  { x: 33, y: 14, spriteId: "camp-dead-tree" },
  { x: 31, y: 9, spriteId: "camp-supply-stack" },
  { x: 31, y: 15, spriteId: "camp-smith-work-area" },
  { x: 28, y: 10, spriteId: "camp-map-table" },
  { x: 34, y: 8, spriteId: "camp-palisade-checkpoint" },
  { x: 33, y: 16, spriteId: "camp-armor-rack" },
  { x: 34, y: 10, spriteId: "camp-barrel-stack" },
  { x: 25, y: 10, spriteId: "camp-bedrolls" },
  { x: 30, y: 13, spriteId: "camp-cookpot" },
  { x: 30, y: 8, spriteId: "camp-crate-stack" },
  { x: 27, y: 14, spriteId: "camp-gear-pile" },
  { x: 32, y: 16, spriteId: "camp-grindstone" },
  { x: 32, y: 11, spriteId: "camp-handcart" },
  { x: 31, y: 11, spriteId: "camp-lantern-post" },
  { x: 25, y: 16, spriteId: "camp-rough-fence" },
  { x: 26, y: 15, spriteId: "camp-tent-small" },
  { x: 34, y: 16, spriteId: "camp-weapon-rack" },
  { x: 27, y: 13, spriteId: "camp-adventurer-cards" },
  { x: 29, y: 10, spriteId: "camp-adventurer-map-study" },
  { x: 30, y: 16, spriteId: "camp-adventurer-shield-repair" },
  { x: 26, y: 11, spriteId: "camp-adventurer-sleeping" },
  { x: 31, y: 13, spriteId: "camp-adventurer-stew" },
  { x: 25, y: 13, spriteId: "camp-adventurer-watch" },
  { x: 33, y: 11, spriteId: "camp-adventurer-wounded" },
];

// One existing root curtain at the far edge is the physical false-sky clue.
// It stays out of the central sky and visually ties to the dead tree below.
floor.ceilingSprites = [
  ...(floor.ceilingSprites ?? []).filter(
    (sprite) => !(sprite.x === 34 && sprite.y === 14 && sprite.spriteId === "f1-root-curtain")
  ),
  { x: 34, y: 14, spriteId: "f1-root-curtain", scale: 0.55 },
];

const campDoorFeatureId = "camp-entrance-gate";
floor.doorFeatures = [
  ...(floor.doorFeatures ?? []).filter((feature) => feature.spriteId !== campDoorFeatureId),
  { x: 24, y: 12, dir: "e", spriteId: campDoorFeatureId },
  { x: 25, y: 12, dir: "w", spriteId: campDoorFeatureId },
];

floor.floorRevision = Math.max(6, floor.floorRevision ?? 0);

writeFileSync(FLOOR_PATH, `${JSON.stringify(floor, null, 2)}\n`);
console.log(
  `Expanded Floor 1 to ${TARGET_WIDTH}x${TARGET_HEIGHT}; Camp heart (${CAMP.x1},${CAMP.y1})-(${CAMP.x2},${CAMP.y2})`
);
