/**
 * Automap exploration reveal — BFS through passable edges so the map fills
 * as a connected corridor/room, not a plus-shaped smear through solid rock.
 */

import type { FloorDef } from "../data/floors";
import { DX, DY, edgeInDirection, inBounds } from "./dungeon";

/** How far (in open/door steps) vision spreads from the party each reveal. */
export const EXPLORE_VISION_DEPTH = 3;

/**
 * Mark the party's tile and every cell reachable through open/door edges
 * within `depth` steps. Locked/wall edges stop the flood — the wall line on
 * the explored cell still draws the boundary.
 */
export function revealAround(
  explored: Set<string>,
  floor: FloorDef,
  x: number,
  y: number,
  depth: number = EXPLORE_VISION_DEPTH
): void {
  const key = (cx: number, cy: number) => `${cx},${cy}`;
  const queue: { x: number; y: number; d: number }[] = [{ x, y, d: 0 }];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const k = key(cur.x, cur.y);
    if (seen.has(k)) continue;
    if (!inBounds(floor.grid, cur.x, cur.y)) continue;
    seen.add(k);
    explored.add(k);
    if (cur.d >= depth) continue;

    const cell = floor.grid[cur.y]![cur.x]!;
    for (let dir = 0; dir < 4; dir++) {
      const edge = edgeInDirection(cell, dir);
      if (edge === "wall" || edge === "locked") continue;
      const nx = cur.x + DX[dir]!;
      const ny = cur.y + DY[dir]!;
      const nk = key(nx, ny);
      if (seen.has(nk)) continue;
      queue.push({ x: nx, y: ny, d: cur.d + 1 });
    }
  }
}
