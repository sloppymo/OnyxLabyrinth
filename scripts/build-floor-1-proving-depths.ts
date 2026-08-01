#!/usr/bin/env npx tsx
/**
 * Generates src/content/floors/floor-1.json — "The Hall of Five Wounds".
 *
 * The filename is retained for existing local workflows; the old Proving
 * Depths layout is intentionally replaced. Source layout:
 * scripts/floor-1-ascii.txt.
 *
 * Run: npx tsx scripts/build-floor-1-proving-depths.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { buildSolidGrid, carveRoom, setTile, setEdge } from "../src/game/dungeon";
import type { EdgeType, Grid } from "../src/types";
import { floorDefToMap } from "../src/game/floor-map";
import type { FloorDef } from "../src/data/floors";
import { validateFloorDef, hasValidationErrors } from "../src/game/floor-validate";
import { getFloors } from "../src/game/floor-registry";

type Dir = "n" | "e" | "s" | "w";

function parseAsciiFile(path: string): { width: number; height: number; floor: boolean[][] } {
  const lines = readFileSync(path, "utf8")
    .trimEnd()
    .split("\n");
  const height = lines.length;
  const width = Math.max(...lines.map((line) => line.length));
  const floor = lines.map((line) =>
    Array.from({ length: width }, (_, x) => line[x] === ".")
  );
  return { width, height, floor };
}

function connectFloorCells(grid: Grid, floor: boolean[][]): void {
  const height = floor.length;
  const width = floor[0].length;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!floor[y][x]) continue;
      carveRoom(grid, x, y, x, y);
      if (x + 1 < width && floor[y][x + 1]) {
        setBoth(grid, x, y, "e", "open");
      }
      if (y + 1 < height && floor[y + 1][x]) {
        setBoth(grid, x, y, "s", "open");
      }
    }
  }
}

function setBoth(grid: Grid, x: number, y: number, dir: Dir, edge: EdgeType): void {
  const dx = dir === "e" ? 1 : dir === "w" ? -1 : 0;
  const dy = dir === "s" ? 1 : dir === "n" ? -1 : 0;
  const opposite: Dir =
    dir === "n" ? "s" : dir === "s" ? "n" : dir === "e" ? "w" : "e";
  setEdge(grid, x, y, dir, edge);
  setEdge(grid, x + dx, y + dy, opposite, edge);
}

function build(): FloorDef {
  const { width, height, floor } = parseAsciiFile(
    join(process.cwd(), "scripts/floor-1-ascii.txt")
  );
  const grid = buildSolidGrid(width, height);
  connectFloorCells(grid, floor);

  // Material-boundary doors. Renderer faces use the near/visible cell theme,
  // so these panels deliberately read differently when approached in reverse.
  setBoth(grid, 10, 19, "w", "door"); // f1 ↔ f2
  setBoth(grid, 15, 12, "w", "door"); // f1 ↔ f5
  setBoth(grid, 11, 10, "w", "door"); // f3 ↔ f4
  setBoth(grid, 11, 12, "n", "locked"); // f1 → upper wounds

  setTile(grid, 20, 2, "stairs_down");

  for (const [x, y] of [
    [1, 18],
    [5, 12],
    [20, 12],
    [3, 4],
    [14, 8],
    [18, 2],
  ] as const) {
    setTile(grid, x, y, "treasure");
  }

  for (const [x, y] of [
    [10, 20],
    [5, 18],
    [20, 18],
    [7, 8],
  ] as const) {
    setTile(grid, x, y, "npc");
  }

  for (const [x, y] of [
    [11, 23],
    [9, 19],
    [3, 15],
    [11, 14],
    [17, 15],
    [5, 6],
    [7, 6],
    [12, 5],
    [18, 6],
  ] as const) {
    setTile(grid, x, y, "event");
  }

  setTile(grid, 3, 13, "teleporter");
  setTile(grid, 7, 17, "teleporter");

  for (const [x, y] of [
    [14, 20],
    [15, 20],
    [16, 20],
    [17, 20],
    [19, 15],
  ] as const) {
    setTile(grid, x, y, "water");
  }

  setTile(grid, 3, 5, "darkness");
  setTile(grid, 3, 6, "darkness");
  setTile(grid, 3, 7, "darkness");
  setTile(grid, 5, 4, "antimagic");

  return {
    id: 1,
    name: "The Hall of Five Wounds",
    width,
    height,
    grid,
    startX: 11,
    startY: 25,
    encounterRate: 0.08,
    tilesetTheme: "f1",
    tilesetZones: [
      { id: "unfinished-index", x1: 1, y1: 12, x2: 9, y2: 20, theme: "f2" },
      { id: "upward-cistern", x1: 15, y1: 12, x2: 22, y2: 20, theme: "f5" },
      { id: "cut-bell-chapel", x1: 1, y1: 2, x2: 10, y2: 11, theme: "f4" },
      { id: "ember-suture", x1: 11, y1: 2, x2: 22, y2: 11, theme: "f3" },
    ],
    lockedDoors: [{ x: 11, y: 12, dir: "n", keyId: "crypt-key" }],
    treasures: [
      { x: 1, y: 18, itemIds: ["antidote", "healing-potion"], trap: "poison" },
      { x: 5, y: 12, itemIds: ["dagger+1", "eye-drops"], trap: "stunner" },
      { x: 20, y: 12, itemIds: ["crypt-key", "healing-potion"] },
      { x: 3, y: 4, itemIds: ["holy-symbol", "healing-potion"], trap: "alarm" },
      {
        x: 14,
        y: 8,
        itemIds: ["lexicon-key", "short-sword+1", "healing-potion"],
        trap: "gas",
      },
      { x: 18, y: 2, itemIds: ["shield+1", "warden-sphere"], trap: "stunner" },
    ],
    teleporters: [
      { x: 3, y: 13, toFloorId: 1, toX: 7, toY: 17 },
      { x: 7, y: 17, toFloorId: 1, toX: 3, toY: 13 },
    ],
    waters: [
      { x: 14, y: 20, depth: 1 },
      { x: 15, y: 20, depth: 2 },
      { x: 16, y: 20, depth: 2 },
      { x: 17, y: 20, depth: 3 },
      { x: 19, y: 15, depth: 1, effect: { kind: "cure", status: "poison" } },
    ],
    npcs: [
      {
        id: "oren-bellkeeper",
        name: "Oren",
        title: "keeper of the cut bell",
        x: 10,
        y: 20,
        greeting:
          "The bell keeper holds a rope cut clean through. \"The bell rang when the gods left. It has not stopped; we learned not to hear it.\"",
        returnGreeting: "\"Five wounds. One lock. You are still between them.\"",
        topics: [
          {
            key: "wounds",
            response:
              "Five old places are bleeding into this hall. Follow the shelves for a dry road. Follow the water for a short one.",
          },
          {
            key: "years",
            response:
              "If the dark returns you, Edgehollow will be a century older. The bell will still be mid-swing.",
          },
          {
            key: "kept",
            hidden: true,
            response:
              "Some are not returned. Too deep, and the lock keeps the hand that tested it.",
          },
        ],
        combatEnemyIds: ["ironclad-knight"],
      },
      {
        id: "rill-of-pages",
        name: "Rill-of-Pages",
        title: "scribe of unwritten endings",
        x: 5,
        y: 18,
        greeting:
          "A scribe folds blank paper into tiny doors. \"All books here have the same last page.\"",
        returnGreeting: "Rill creases another door. It opens onto nothing.",
        topics: [
          {
            key: "page",
            response:
              "It says: lamp, bottom, one wish. The line beneath has been scraped away.",
          },
          {
            key: "route",
            response:
              "North aisle, then east. The dry stones reach the cistern key-chest.",
          },
          {
            key: "death",
            hidden: true,
            response:
              "Death left in the gods' shadow. These shelves have waited so long that dust forgot how to settle.",
          },
        ],
        combatEnemyIds: ["warlock"],
      },
      {
        id: "tallow-in-a-boat",
        name: "Tallow-in-a-Boat",
        title: "ferryman of a puddle",
        x: 20,
        y: 18,
        greeting:
          "A boat rests in water too shallow to float it. Tallow rows once and moves nowhere. \"Fare paid in questions.\"",
        returnGreeting: "Tallow measures the puddle with an oar. \"Deeper today.\"",
        topics: [
          {
            key: "water",
            response:
              "Four wet stones west make the short road. The northern shelf stays dry.",
          },
          {
            key: "chest",
            response:
              "The iron chest north never rusts. I stopped asking why before your oldest century.",
          },
          {
            key: "warm",
            hidden: true,
            response:
              "Water falls through every floor. Near the lamp at the bottom, it comes back warm.",
          },
        ],
        combatEnemyIds: ["slime", "slime"],
      },
      {
        id: "sister-caldris",
        name: "Sister Caldris",
        title: "last cantor of the cut bell",
        x: 7,
        y: 8,
        greeting:
          "A woman kneels where every sound dies. She mouths: \"Do not mistake silence for peace.\"",
        returnGreeting: "Caldris is still singing. The chapel is still refusing her.",
        topics: [
          {
            key: "bell",
            response:
              "The third bell has no tongue. Ask what was taken, not who took it.",
          },
          {
            key: "girl",
            response:
              "Far below, the lonely girl is still writing. Her page never ends.",
          },
          {
            key: "tongue",
            hidden: true,
            response:
              "A bell without a tongue remembers every hand that pulled it. So does this place.",
          },
        ],
        combatEnemyIds: ["skeleton", "skeleton"],
      },
    ],
    events: [
      { x: 11, y: 23, kind: "message", message: "Five wounds split one ancient hall." },
      { x: 9, y: 19, kind: "message", message: "Shelves begin where the stone should be." },
      { x: 3, y: 15, kind: "message", message: "The shelves list books not yet written." },
      {
        x: 11,
        y: 14,
        kind: "message",
        message: "Five metals meet at a lock shaped like a lamp.",
      },
      {
        x: 17,
        y: 15,
        kind: "message",
        message: "Black water drips upward, one bead at a time.",
      },
      { x: 5, y: 6, kind: "message", message: "THE THIRD BELL HAS NO TONGUE." },
      { x: 7, y: 6, kind: "heal", message: "A cold hand closes your wounds.", power: 8 },
      { x: 12, y: 5, kind: "damage", message: "Embers flower underfoot.", power: 4 },
      { x: 18, y: 6, kind: "message", message: "Iron sweats. Something below coughs once." },
    ],
    mapSprites: [
      { x: 10, y: 24, spriteId: "torch" },
      { x: 12, y: 24, spriteId: "torch" },
      { x: 4, y: 18, spriteId: "barrel" },
      { x: 7, y: 12, spriteId: "crate" },
      { x: 4, y: 4, spriteId: "bones" },
      { x: 16, y: 8, spriteId: "crate" },
      { x: 11, y: 11, spriteId: "torch" },
    ],
    encounterZones: [
      { id: "threshold-safe", x1: 9, y1: 12, x2: 14, y2: 26, rateMul: 0.35 },
      { id: "index-low", x1: 1, y1: 12, x2: 9, y2: 20, rateMul: 0.8 },
      { id: "cistern-risk", x1: 15, y1: 12, x2: 22, y2: 20, rateMul: 1.25 },
      { id: "chapel-hush", x1: 1, y1: 2, x2: 10, y2: 11, rateMul: 0.45 },
      { id: "suture-hot", x1: 11, y1: 2, x2: 22, y2: 11, rateMul: 1.5 },
    ],
  };
}

const floor = build();
const issues = validateFloorDef(floor, { floors: [...getFloors()] });
for (const issue of issues) {
  console.log(`${issue.severity.toUpperCase()} [${issue.code}] ${issue.message}`);
}
if (hasValidationErrors(issues)) process.exit(1);

const map = floorDefToMap(floor);
const out = join(process.cwd(), "src/content/floors/floor-1.json");
writeFileSync(out, `${JSON.stringify(map, null, 2)}\n`);
console.log(`Wrote ${out} (${floor.width}x${floor.height}) start=(${floor.startX},${floor.startY})`);
