#!/usr/bin/env npx tsx
/**
 * Generates src/content/floors/floor-1.json — "The Proving Depths".
 * Layout traced from the approved reference map PNG (32px cells).
 *
 * Run: npx tsx scripts/build-floor-1-proving-depths.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { buildSolidGrid, carveRoom, setTile, setEdge } from "../src/game/dungeon";
import type { Grid } from "../src/types";
import { floorDefToMap } from "../src/game/floor-map";
import type { FloorDef } from "../src/data/floors";
import { validateFloorDef, hasValidationErrors } from "../src/game/floor-validate";
import { getFloors } from "../src/game/floor-registry";

function parseAsciiFile(path: string): { width: number; height: number; floor: boolean[][] } {
  const lines = readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.length > 0);
  const height = lines.length;
  const width = Math.max(...lines.map((l) => l.length));
  const floor: boolean[][] = [];
  for (let y = 0; y < height; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < width; x++) {
      row.push(lines[y][x] === ".");
    }
    floor.push(row);
  }
  return { width, height, floor };
}

function connectFloorCells(grid: Grid, floor: boolean[][]): void {
  const h = floor.length;
  const w = floor[0].length;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!floor[y][x]) continue;
      carveRoom(grid, x, y, x, y);
      if (x + 1 < w && floor[y][x + 1]) {
        setEdge(grid, x, y, "e", "open");
        setEdge(grid, x + 1, y, "w", "open");
      }
      if (y + 1 < h && floor[y + 1][x]) {
        setEdge(grid, x, y, "s", "open");
        setEdge(grid, x, y + 1, "n", "open");
      }
    }
  }
}

function lockBoth(grid: Grid, x: number, y: number, dir: "n" | "e" | "s" | "w"): void {
  setEdge(grid, x, y, dir, "locked");
  const dx = dir === "e" ? 1 : dir === "w" ? -1 : 0;
  const dy = dir === "s" ? 1 : dir === "n" ? -1 : 0;
  const opp: "n" | "e" | "s" | "w" =
    dir === "n" ? "s" : dir === "s" ? "n" : dir === "e" ? "w" : "e";
  setEdge(grid, x + dx, y + dy, opp, "locked");
}

/** Nearest floor cell to target, or target if already floor. */
function snap(floor: boolean[][], x: number, y: number): { x: number; y: number } {
  const h = floor.length;
  const w = floor[0].length;
  if (y >= 0 && y < h && x >= 0 && x < w && floor[y][x]) return { x, y };
  for (let r = 1; r < 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (ny >= 0 && ny < h && nx >= 0 && nx < w && floor[ny][nx]) return { x: nx, y: ny };
      }
    }
  }
  throw new Error(`No floor near (${x},${y})`);
}

function build(): FloorDef {
  const { width, height, floor } = parseAsciiFile(
    join(process.cwd(), "scripts/floor-1-ascii.txt")
  );
  const grid = buildSolidGrid(width, height);
  connectFloorCells(grid, floor);

  // Reference legend placements (32px trace grid).
  const start = snap(floor, 2, 22);
  const stairsDown = snap(floor, 5, 2);
  const silverLock = { x: 6, y: 5, dir: "e" as const };
  const brassLock = { x: 6, y: 23, dir: "n" as const };
  const silverChest = snap(floor, 20, 8);
  const brassChest = snap(floor, 4, 22);
  const lexiconChest = snap(floor, 9, 23);
  const orbGate = snap(floor, 10, 8);
  const tokenGate = snap(floor, 14, 22);
  const starPortal = snap(floor, 16, 10);
  const pitL2 = snap(floor, 7, 23);
  const chuteL6 = snap(floor, 15, 30);
  const voiceMain = snap(floor, 10, 14);
  const voiceWing = snap(floor, 14, 28);
  const pitTrap = snap(floor, 20, 14);
  const teleMain = snap(floor, 18, 12);
  const telePocket = snap(floor, 22, 28);
  const teleWingEntry = snap(floor, 14, 26);
  const teleWingDeep = snap(floor, 14, 29);
  const maro = snap(floor, 8, 6);
  const voss = snap(floor, 14, 6);
  const cauldron = snap(floor, 15, 6);
  const colossus = snap(floor, 19, 12);
  const lowing = snap(floor, 21, 11);
  const wardenChest = snap(floor, 11, 9);

  setTile(grid, stairsDown.x, stairsDown.y, "stairs_down");
  lockBoth(grid, silverLock.x, silverLock.y, silverLock.dir);
  lockBoth(grid, brassLock.x, brassLock.y, brassLock.dir);

  setTile(grid, teleMain.x, teleMain.y, "teleporter");
  setTile(grid, telePocket.x, telePocket.y, "teleporter");
  setTile(grid, teleWingEntry.x, teleWingEntry.y, "teleporter");
  setTile(grid, teleWingDeep.x, teleWingDeep.y, "teleporter");

  for (const { x, y } of [orbGate, tokenGate, starPortal, chuteL6, voiceMain, voiceWing]) {
    setTile(grid, x, y, "event");
  }
  setTile(grid, pitL2.x, pitL2.y, "event");
  setTile(grid, pitTrap.x, pitTrap.y, "event");

  for (const { x, y } of [silverChest, brassChest, lexiconChest, wardenChest]) {
    setTile(grid, x, y, "treasure");
  }

  setTile(grid, maro.x, maro.y, "npc");
  setTile(grid, voss.x, voss.y, "npc");
  setTile(grid, cauldron.x, cauldron.y, "npc");
  setTile(grid, colossus.x, colossus.y, "npc");
  setTile(grid, lowing.x, lowing.y, "npc");

  return {
    id: 1,
    name: "The Proving Depths",
    width,
    height,
    grid,
    startX: start.x,
    startY: start.y,
    encounterRate: 0.08,
    tilesetTheme: "f1",
    lockedDoors: [
      { x: silverLock.x, y: silverLock.y, dir: silverLock.dir, keyId: "crypt-key" },
      { x: brassLock.x, y: brassLock.y, dir: brassLock.dir, keyId: "brass-key" },
    ],
    treasures: [
      { x: silverChest.x, y: silverChest.y, itemIds: ["crypt-key", "healing-potion"] },
      { x: brassChest.x, y: brassChest.y, itemIds: ["brass-key", "antidote"], trap: "poison" },
      {
        x: lexiconChest.x,
        y: lexiconChest.y,
        itemIds: ["lexicon-key", "short-sword+1", "healing-potion"],
        trap: "gas",
      },
      { x: wardenChest.x, y: wardenChest.y, itemIds: ["warden-sphere"] },
    ],
    teleporters: [
      { x: teleMain.x, y: teleMain.y, toFloorId: 1, toX: telePocket.x, toY: telePocket.y },
      { x: telePocket.x, y: telePocket.y, toFloorId: 1, toX: teleMain.x, toY: teleMain.y },
      { x: teleWingEntry.x, y: teleWingEntry.y, toFloorId: 1, toX: teleWingDeep.x, toY: teleWingDeep.y },
      { x: teleWingDeep.x, y: teleWingDeep.y, toFloorId: 1, toX: teleWingEntry.x, toY: teleWingEntry.y },
    ],
    npcs: [
      {
        id: "maro",
        name: "Maro",
        title: "stranded swordsman",
        x: maro.x,
        y: maro.y,
        greeting:
          "A living face at last! I am Maro, once of the eastern guard. Something dragged my company down; only I crawled back out.",
        returnGreeting: "Still breathing, friend? Good. These depths have taken enough.",
        topics: [
          {
            key: "key",
            response:
              "The silver key lies east, past the twisting halls. The ward on the northern door will yield to it.",
          },
          {
            key: "echo",
            hidden: true,
            response:
              "…so the whispers reach even this floor? Pray you never meet the boy they talk about.",
          },
        ],
        wantsItemId: "healing-potion",
        rewardItemId: "long-sword+1",
        combatEnemyIds: ["ironclad-knight"],
      },
      {
        id: "voss",
        name: "Voss",
        title: "iron-nosed sentinel",
        x: voss.x,
        y: voss.y,
        greeting: "I lost my nose to a trap and my patience to tourists. State your business.",
        returnGreeting: "Still here? The silver key is east. I would not dawdle.",
        topics: [
          {
            key: "key",
            response: "East. Far east. Past the pit. The chest is guarded by nothing but your cowardice.",
          },
        ],
        combatEnemyIds: ["skeleton"],
      },
      {
        id: "cauldron",
        name: "The Cauldron",
        title: "laughing shrine",
        x: cauldron.x,
        y: cauldron.y,
        greeting:
          "HA! Another meal strolls in! …Kidding. Mostly. I am a kettle that learned to talk. Ask away.",
        returnGreeting: "Back for stew? There is none. There was never any.",
        topics: [
          {
            key: "brass",
            response: "Southwest branch. Bronze, brass, whatever — the lock hunger is the same.",
          },
        ],
        combatEnemyIds: ["slime"],
      },
      {
        id: "colossus",
        name: "The Shackled Colossus",
        title: "chained giant",
        x: colossus.x,
        y: colossus.y,
        greeting: "Chains rattle. The giant does not look up.",
        returnGreeting: "The chains hold. For now.",
        topics: [{ key: "free", response: "No key fits these shackles. Only blood." }],
        combatEnemyIds: ["acid-puddle"],
      },
      {
        id: "lowing-saint",
        name: "The Lowing Saint",
        title: "???",
        x: lowing.x,
        y: lowing.y,
        greeting: "Moo, says the saint. Moo, say the stones.",
        returnGreeting: "Moo.",
        topics: [],
        combatEnemyIds: ["skeleton"],
      },
    ],
    events: [
      {
        x: orbGate.x,
        y: orbGate.y,
        kind: "message",
        message: "A circular recess waits for a warden sphere. Yours is empty-handed.",
      },
      {
        x: tokenGate.x,
        y: tokenGate.y,
        kind: "message",
        message: "A slot for gate-tokens. Rust has welded it shut.",
      },
      {
        x: starPortal.x,
        y: starPortal.y,
        kind: "message",
        message: "A sealed arch. Nothing on the other side answers.",
      },
      {
        x: pitL2.x,
        y: pitL2.y,
        kind: "damage",
        message: "The floor gives way into a pit. You catch the lip — barely.",
        power: 6,
      },
      {
        x: chuteL6.x,
        y: chuteL6.y,
        kind: "message",
        message: "The chute drops into darkness. Not today.",
      },
      {
        x: voiceMain.x,
        y: voiceMain.y,
        kind: "message",
        message:
          "The walls repeat your footsteps a half-beat late — as if someone else walked here first.",
      },
      {
        x: voiceWing.x,
        y: voiceWing.y,
        kind: "message",
        message:
          "The walls repeat your footsteps a half-beat late — as if someone else walked here first.",
      },
      {
        x: pitTrap.x,
        y: pitTrap.y,
        kind: "damage",
        message: "A pit trap! Spikes graze your legs.",
        power: 5,
      },
    ],
    mapSprites: [
      { x: start.x, y: start.y, spriteId: "torch" },
      { x: stairsDown.x, y: stairsDown.y, spriteId: "bones" },
      { x: orbGate.x, y: orbGate.y, spriteId: "barrel" },
      { x: telePocket.x, y: telePocket.y, spriteId: "bones" },
    ],
    encounterZones: [
      { id: "entry-safe", x1: 0, y1: height - 8, x2: 8, y2: height - 1, rateMul: 0.5 },
      { id: "maze-hot", x1: 14, y1: 4, x2: 22, y2: 16, rateMul: 1.5 },
      { id: "pocket-hot", x1: 14, y1: height - 8, x2: width - 1, y2: height - 1, rateMul: 2.0 },
    ],
  };
}

const floor = build();
const map = floorDefToMap(floor);
const out = join(process.cwd(), "src/content/floors/floor-1.json");
writeFileSync(out, JSON.stringify(map, null, 2));
console.log(`Wrote ${out} (${floor.width}x${floor.height}) start=(${floor.startX},${floor.startY})`);

// Pre-merge validation against campaign neighbors.
const issues = validateFloorDef(floor, { floors: [...getFloors()] });
for (const i of issues) {
  console.log(`${i.severity.toUpperCase()} [${i.code}] ${i.message}`);
}
if (hasValidationErrors(issues)) process.exit(1);
