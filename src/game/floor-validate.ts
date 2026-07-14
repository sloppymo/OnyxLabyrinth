/**
 * Floor map validation — symmetric edges, overlay consistency, reachability,
 * and content references (items, enemies, encounter tables, cross-floor links).
 *
 * Mirrors the invariants the campaign floors are tested against in
 * src/data/floors.test.ts so custom packs get the same guarantees.
 */

import { FLOORS, type FloorDef } from "../data/floors";
import { MAP_SPRITES_BY_ID } from "../data/map-sprites";
import { ITEMS_BY_ID } from "../data/items";
import { ENEMIES_BY_ID, ENCOUNTER_TABLES } from "../data/enemies";
import type { FloorMapJSON, CellJSON } from "./floor-map";
import { floorDefToMap, cellIsPassable } from "./floor-map";

export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  at?: { x: number; y: number };
}

const OPPOSITE: Record<"n" | "e" | "s" | "w", "n" | "e" | "s" | "w"> = {
  n: "s",
  e: "w",
  s: "n",
  w: "e",
};

const DELTA: Record<"n" | "e" | "s" | "w", [number, number]> = {
  n: [0, -1],
  e: [1, 0],
  s: [0, 1],
  w: [-1, 0],
};

const DIR_EDGE: Record<"n" | "e" | "s" | "w", keyof CellJSON> = {
  n: "n",
  e: "e",
  s: "s",
  w: "w",
};

export interface ValidateContext {
  /**
   * Floors that will exist at runtime alongside this map (campaign floors +
   * the rest of the content pack). Used to verify teleporter/chute targets
   * and stairs. Defaults to the campaign FLOORS; the map being validated
   * always shadows the same id.
   */
  floors?: readonly FloorDef[];
}

export function validateFloorMap(
  map: FloorMapJSON,
  context?: ValidateContext
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (map.width < 3 || map.height < 3) {
    issues.push({
      severity: "error",
      code: "size_too_small",
      message: "Floor should be at least 3×3",
    });
  }

  if (map.encounterRate < 0 || map.encounterRate > 1) {
    issues.push({
      severity: "error",
      code: "encounter_rate",
      message: "encounterRate must be between 0 and 1",
    });
  }

  if (!inBoundsGrid(map, map.startX, map.startY)) {
    issues.push({
      severity: "error",
      code: "start_oob",
      message: `start (${map.startX},${map.startY}) is out of bounds`,
      at: { x: map.startX, y: map.startY },
    });
  } else {
    const startCell = map.grid[map.startY][map.startX];
    if (!cellIsPassable(startCell)) {
      issues.push({
        severity: "error",
        code: "start_solid",
        message: "Start position is inside solid rock (no open edges)",
        at: { x: map.startX, y: map.startY },
      });
    }
  }

  validateSymmetricEdges(map, issues);
  validateOverlayTiles(map, issues);
  validateLockedDoors(map, issues, context?.floors ?? FLOORS);
  validateLockedEdgeCoverage(map, issues);
  validateReachability(map, issues);
  validateDuplicateOverlays(map, issues);
  validateItemRefs(map, issues);
  validateNpcRefs(map, issues);
  validateFloorLinks(map, issues, context?.floors ?? FLOORS);
  validateStairsTargets(map, issues, context?.floors ?? FLOORS);
  validateEncounterConfig(map, issues);

  return issues;
}

export function validateFloorDef(
  floor: FloorDef,
  context?: ValidateContext
): ValidationIssue[] {
  return validateFloorMap(floorDefToMap(floor), context);
}

export function hasValidationErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

function inBoundsGrid(map: FloorMapJSON, x: number, y: number): boolean {
  return y >= 0 && y < map.height && x >= 0 && x < map.width;
}

function validateSymmetricEdges(map: FloorMapJSON, issues: ValidationIssue[]): void {
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const cell = map.grid[y][x];
      for (const dir of ["n", "e", "s", "w"] as const) {
        const edge = cell[DIR_EDGE[dir]] as string;
        const [dx, dy] = DELTA[dir];
        const nx = x + dx;
        const ny = y + dy;
        if (!inBoundsGrid(map, nx, ny)) {
          if (edge !== "wall") {
            issues.push({
              severity: "error",
              code: "edge_leaks_boundary",
              message: `Edge ${dir} at (${x},${y}) is ${edge} but leads outside the map`,
              at: { x, y },
            });
          }
          continue;
        }
        const neighbor = map.grid[ny][nx];
        const opp = OPPOSITE[dir];
        const neighborEdge = neighbor[DIR_EDGE[opp]] as string;
        if (edge !== neighborEdge) {
          issues.push({
            severity: "error",
            code: "edge_asymmetric",
            message: `(${x},${y}).${dir}=${edge} but (${nx},${ny}).${opp}=${neighborEdge}`,
            at: { x, y },
          });
        }
      }
    }
  }
}

function validateOverlayTiles(map: FloorMapJSON, issues: ValidationIssue[]): void {
  const expectTile = (
    x: number,
    y: number,
    expected: string,
    code: string,
    label: string
  ) => {
    if (!inBoundsGrid(map, x, y)) {
      issues.push({
        severity: "error",
        code: "overlay_oob",
        message: `${label} at (${x},${y}) is out of bounds`,
        at: { x, y },
      });
      return;
    }
    const tile = map.grid[y][x].tile;
    if (tile !== expected) {
      issues.push({
        severity: "error",
        code,
        message: `${label} at (${x},${y}) needs cell.tile="${expected}" (got ${tile ?? "none"})`,
        at: { x, y },
      });
    }
  };

  for (const t of map.treasures ?? []) {
    expectTile(t.x, t.y, "treasure", "treasure_tile", "Treasure");
    if (!t.itemIds.length) {
      issues.push({
        severity: "warning",
        code: "treasure_empty",
        message: `Treasure at (${t.x},${t.y}) has no itemIds`,
        at: { x: t.x, y: t.y },
      });
    }
  }
  for (const w of map.waters ?? []) {
    expectTile(w.x, w.y, "water", "water_tile", "Water");
  }
  for (const n of map.npcs ?? []) {
    expectTile(n.x, n.y, "npc", "npc_tile", `NPC ${n.id}`);
    if (!n.combatEnemyIds?.length) {
      issues.push({
        severity: "warning",
        code: "npc_no_combat",
        message: `NPC ${n.id} has no combatEnemyIds (attack will fail)`,
        at: { x: n.x, y: n.y },
      });
    }
  }
  for (const e of map.events ?? []) {
    expectTile(e.x, e.y, "event", "event_tile", "Event");
  }
  for (const t of map.teleporters ?? []) {
    expectTile(t.x, t.y, "teleporter", "teleporter_tile", "Teleporter");
  }
  for (const c of map.chuteDrops ?? []) {
    expectTile(c.x, c.y, "chute", "chute_tile", "Chute");
  }
}

function validateLockedDoors(
  map: FloorMapJSON,
  issues: ValidationIssue[],
  floors: readonly FloorDef[]
): void {
  const keyObtainable = (keyId: string): boolean =>
    (map.treasures ?? []).some((t) => t.itemIds.includes(keyId)) ||
    floors.some(
      (f) => f.id !== map.id && (f.treasures ?? []).some((t) => t.itemIds.includes(keyId))
    );
  for (const d of map.lockedDoors ?? []) {
    if (!inBoundsGrid(map, d.x, d.y)) {
      issues.push({
        severity: "error",
        code: "lock_oob",
        message: `Locked door at (${d.x},${d.y}) out of bounds`,
        at: { x: d.x, y: d.y },
      });
      continue;
    }
    const edge = map.grid[d.y][d.x][d.dir];
    if (edge !== "locked") {
      issues.push({
        severity: "error",
        code: "lock_edge_mismatch",
        message: `lockedDoors entry (${d.x},${d.y}) ${d.dir} but grid edge is "${edge}"`,
        at: { x: d.x, y: d.y },
      });
    }
    if (!d.keyId.trim()) {
      issues.push({
        severity: "error",
        code: "lock_no_key",
        message: `Locked door at (${d.x},${d.y}) missing keyId`,
        at: { x: d.x, y: d.y },
      });
    } else if (!d.keyId.endsWith("-key")) {
      // Keys reach the party's key ring only via treasure itemIds ending in
      // "-key" (game/features.ts) — any other keyId can never be obtained.
      issues.push({
        severity: "error",
        code: "lock_key_invalid",
        message: `Locked door at (${d.x},${d.y}) keyId "${d.keyId}" must end with "-key" (keys are granted by treasure chests)`,
        at: { x: d.x, y: d.y },
      });
    } else if (!keyObtainable(d.keyId)) {
      issues.push({
        severity: "warning",
        code: "lock_key_offmap",
        message: `No chest on this floor (or a known floor) holds "${d.keyId}" — the door can never be opened`,
        at: { x: d.x, y: d.y },
      });
    }
  }
}

/** Every locked edge needs a lockedDoors entry on its approach or opposite side (parity with floors.test.ts). */
function validateLockedEdgeCoverage(map: FloorMapJSON, issues: ValidationIssue[]): void {
  const defs = new Set(
    (map.lockedDoors ?? []).map((d) => `${d.x},${d.y},${d.dir}`)
  );
  const reported = new Set<string>();
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      for (const dir of ["n", "e", "s", "w"] as const) {
        if (map.grid[y][x][dir] !== "locked") continue;
        const [dx, dy] = DELTA[dir];
        const ox = x + dx;
        const oy = y + dy;
        const canonical =
          dir === "s" || dir === "e" ? `${x},${y},${dir}` : `${ox},${oy},${OPPOSITE[dir]}`;
        if (reported.has(canonical)) continue;
        reported.add(canonical);
        if (!defs.has(`${x},${y},${dir}`) && !defs.has(`${ox},${oy},${OPPOSITE[dir]}`)) {
          issues.push({
            severity: "error",
            code: "locked_edge_no_entry",
            message: `Locked edge at (${x},${y}) ${dir} has no lockedDoors entry — it can never be unlocked`,
            at: { x, y },
          });
        }
      }
    }
  }
}

/** True when the id resolves to an obtainable item: a real item or a "*-key" key-ring id. */
function isObtainableItemId(id: string): boolean {
  return id.endsWith("-key") || ITEMS_BY_ID[id] !== undefined;
}

function validateItemRefs(map: FloorMapJSON, issues: ValidationIssue[]): void {
  for (const t of map.treasures ?? []) {
    for (const itemId of t.itemIds) {
      if (!isObtainableItemId(itemId)) {
        issues.push({
          severity: "error",
          code: "item_unknown",
          message: `Treasure at (${t.x},${t.y}) references unknown item "${itemId}"`,
          at: { x: t.x, y: t.y },
        });
      }
    }
  }
  for (const e of map.events ?? []) {
    if (e.kind === "reward") {
      if (!e.itemId) {
        issues.push({
          severity: "error",
          code: "event_no_item",
          message: `Reward event at (${e.x},${e.y}) has no itemId`,
          at: { x: e.x, y: e.y },
        });
      } else if (!isObtainableItemId(e.itemId)) {
        issues.push({
          severity: "error",
          code: "item_unknown",
          message: `Event at (${e.x},${e.y}) references unknown item "${e.itemId}"`,
          at: { x: e.x, y: e.y },
        });
      }
    }
    if ((e.kind === "damage" || e.kind === "heal") && !(e.power && e.power > 0)) {
      issues.push({
        severity: "warning",
        code: "event_no_power",
        message: `${e.kind} event at (${e.x},${e.y}) has no positive power — it will do nothing`,
        at: { x: e.x, y: e.y },
      });
    }
  }
}

function validateNpcRefs(map: FloorMapJSON, issues: ValidationIssue[]): void {
  const seenIds = new Set<string>();
  for (const n of map.npcs ?? []) {
    if (seenIds.has(n.id)) {
      issues.push({
        severity: "warning",
        code: "npc_dup_id",
        message: `Duplicate NPC id "${n.id}" — kill persistence is keyed by id`,
        at: { x: n.x, y: n.y },
      });
    }
    seenIds.add(n.id);
    for (const enemyId of n.combatEnemyIds ?? []) {
      if (!ENEMIES_BY_ID[enemyId]) {
        issues.push({
          severity: "error",
          code: "npc_enemy_unknown",
          message: `NPC ${n.id} combatEnemyIds references unknown enemy "${enemyId}"`,
          at: { x: n.x, y: n.y },
        });
      }
    }
    const itemRefs: [string | undefined, string][] = [
      [n.wantsItemId, "wantsItemId"],
      [n.rewardItemId, "rewardItemId"],
      ...(n.trades ?? []).flatMap(
        (tr): [string | undefined, string][] => [
          [tr.giveItemId, "trade giveItemId"],
          [tr.receiveItemId, "trade receiveItemId"],
        ]
      ),
    ];
    for (const [id, label] of itemRefs) {
      if (id && !isObtainableItemId(id)) {
        issues.push({
          severity: "error",
          code: "item_unknown",
          message: `NPC ${n.id} ${label} references unknown item "${id}"`,
          at: { x: n.x, y: n.y },
        });
      }
    }
  }
}

/** Teleporter / chute targets: floor known, in bounds, lands on a carved cell. */
function validateFloorLinks(
  map: FloorMapJSON,
  issues: ValidationIssue[],
  floors: readonly FloorDef[]
): void {
  const findTarget = (
    id: number
  ): { width: number; height: number; grid: readonly (readonly CellJSON[])[] } | undefined => {
    if (id === map.id) return map;
    const f = floors.find((fl) => fl.id === id);
    return f ? { width: f.width, height: f.height, grid: f.grid } : undefined;
  };

  const links = [
    ...(map.teleporters ?? []).map((t) => ({ ...t, label: "Teleporter" })),
    ...(map.chuteDrops ?? []).map((c) => ({ ...c, label: "Chute" })),
  ];
  for (const link of links) {
    const target = findTarget(link.toFloorId);
    if (!target) {
      issues.push({
        severity: "warning",
        code: "link_floor_unknown",
        message: `${link.label} at (${link.x},${link.y}) targets floor ${link.toFloorId}, which is not a campaign floor — OK only if your pack ships it`,
        at: { x: link.x, y: link.y },
      });
      continue;
    }
    if (
      link.toY < 0 ||
      link.toY >= target.height ||
      link.toX < 0 ||
      link.toX >= target.width
    ) {
      issues.push({
        severity: "error",
        code: "link_oob",
        message: `${link.label} at (${link.x},${link.y}) lands out of bounds at (${link.toX},${link.toY}) on floor ${link.toFloorId}`,
        at: { x: link.x, y: link.y },
      });
      continue;
    }
    const cell = target.grid[link.toY][link.toX];
    if (!cellIsPassable(cell)) {
      issues.push({
        severity: "error",
        code: "link_solid",
        message: `${link.label} at (${link.x},${link.y}) lands inside solid rock at (${link.toX},${link.toY}) on floor ${link.toFloorId}`,
        at: { x: link.x, y: link.y },
      });
    }
  }
}

/**
 * Stairs use floorId ± 1 (game/features.ts handleStairs) and land at the
 * target floor's startX/startY — warn when the implied neighbor is missing.
 */
function validateStairsTargets(
  map: FloorMapJSON,
  issues: ValidationIssue[],
  floors: readonly FloorDef[]
): void {
  const knownIds = new Set<number>([map.id, ...floors.map((f) => f.id)]);
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.grid[y][x].tile;
      if (tile !== "stairs_up" && tile !== "stairs_down") continue;
      const targetId = tile === "stairs_up" ? map.id - 1 : map.id + 1;
      if (!knownIds.has(targetId)) {
        issues.push({
          severity: "warning",
          code: "stairs_target_missing",
          message: `${tile} at (${x},${y}) implies floor ${targetId} (stairs always use floorId ± 1) — it does not exist; stepping shows "nothing above/below". Use teleporters for non-contiguous links`,
          at: { x, y },
        });
      }
    }
  }
}

function validateEncounterConfig(map: FloorMapJSON, issues: ValidationIssue[]): void {
  if (map.encounterTable?.length) {
    issues.push({
      severity: "info",
      code: "encounter_table_unused",
      message:
        "encounterTable is deprecated and ignored by the engine — combat tables come from ENCOUNTER_TABLES in src/data/enemies.ts, keyed by floor id (or a zone's tableFloorId)",
    });
  }
  const hasOwnTable = !!ENCOUNTER_TABLES[map.id]?.length;
  if (!hasOwnTable && map.encounterRate > 0) {
    issues.push({
      severity: "warning",
      code: "no_encounter_table",
      message: `Floor id ${map.id} has no ENCOUNTER_TABLES entry — random encounters will never spawn except inside zones with tableFloorId set`,
    });
  }
  const seenZoneIds = new Set<string>();
  for (const z of map.encounterZones ?? []) {
    if (seenZoneIds.has(z.id)) {
      issues.push({
        severity: "warning",
        code: "zone_dup_id",
        message: `Duplicate encounter zone id "${z.id}"`,
      });
    }
    seenZoneIds.add(z.id);
    if (z.tableFloorId !== undefined && !ENCOUNTER_TABLES[z.tableFloorId]?.length) {
      issues.push({
        severity: "error",
        code: "zone_table_unknown",
        message: `Encounter zone ${z.id} tableFloorId ${z.tableFloorId} has no ENCOUNTER_TABLES entry (valid ids: ${Object.keys(ENCOUNTER_TABLES).join(", ")})`,
      });
    }
  }
}

function validateDuplicateOverlays(map: FloorMapJSON, issues: ValidationIssue[]): void {
  const seen = new Set<string>();
  const check = (x: number, y: number) => {
    const k = `${x},${y}`;
    if (seen.has(k)) {
      issues.push({
        severity: "warning",
        code: "overlay_overlap",
        message: `Multiple overlays reference (${x},${y}) — last writer wins in-game`,
        at: { x, y },
      });
    }
    seen.add(k);
  };
  for (const t of map.treasures ?? []) check(t.x, t.y);
  for (const n of map.npcs ?? []) check(n.x, n.y);
  for (const e of map.events ?? []) check(e.x, e.y);
}

function validateReachability(map: FloorMapJSON, issues: ValidationIssue[]): void {
  if (!inBoundsGrid(map, map.startX, map.startY)) return;

  const visited = new Set<string>();
  const queue: [number, number][] = [[map.startX, map.startY]];
  const key = (x: number, y: number) => `${x},${y}`;

  while (queue.length) {
    const [x, y] = queue.shift()!;
    const k = key(x, y);
    if (visited.has(k)) continue;
    visited.add(k);

    const cell = map.grid[y][x];
    for (const dir of ["n", "e", "s", "w"] as const) {
      const edge = cell[dir];
      if (edge === "wall") continue;
      const [dx, dy] = DELTA[dir];
      const nx = x + dx;
      const ny = y + dy;
      if (inBoundsGrid(map, nx, ny) && !visited.has(key(nx, ny))) {
        queue.push([nx, ny]);
      }
    }
  }

  const requireReachable = (
    x: number,
    y: number,
    label: string,
    severity: ValidationSeverity = "error"
  ) => {
    if (!visited.has(key(x, y))) {
      issues.push({
        severity,
        code: "unreachable",
        message: `${label} at (${x},${y}) is not reachable from start`,
        at: { x, y },
      });
    }
  };

  for (const t of map.treasures ?? []) {
    requireReachable(t.x, t.y, "Treasure");
  }
  for (const n of map.npcs ?? []) {
    requireReachable(n.x, n.y, `NPC ${n.id}`, "warning");
  }
  for (const e of map.events ?? []) {
    requireReachable(e.x, e.y, "Event", "warning");
  }

  let hasStairsDown = false;
  let hasStairsUp = false;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.grid[y][x].tile;
      if (tile === "stairs_down") {
        hasStairsDown = true;
        requireReachable(x, y, "stairs_down");
      }
      if (tile === "stairs_up") {
        hasStairsUp = true;
        requireReachable(x, y, "stairs_up", "warning");
      }
    }
  }

  if (!hasStairsDown && !hasStairsUp) {
    issues.push({
      severity: "warning",
      code: "no_stairs",
      message: "No stairs_up or stairs_down tile — OK for hub/test maps",
    });
  }

  for (const z of map.encounterZones ?? []) {
    if (!inBoundsGrid(map, z.x1, z.y1) || !inBoundsGrid(map, z.x2, z.y2)) {
      issues.push({
        severity: "error",
        code: "zone_oob",
        message: `Encounter zone ${z.id} extends out of bounds`,
      });
    }
    if (z.rateMul < 0) {
      issues.push({
        severity: "error",
        code: "zone_rate",
        message: `Encounter zone ${z.id} has negative rateMul`,
      });
    }
  }

  for (const s of map.mapSprites ?? []) {
    if (!inBoundsGrid(map, s.x, s.y)) {
      issues.push({
        severity: "error",
        code: "sprite_oob",
        message: `Map sprite "${s.spriteId}" at (${s.x},${s.y}) is out of bounds`,
        at: { x: s.x, y: s.y },
      });
    }
    if (!MAP_SPRITES_BY_ID[s.spriteId]) {
      issues.push({
        severity: "error",
        code: "sprite_unknown",
        message: `Unknown map sprite id "${s.spriteId}" at (${s.x},${s.y})`,
        at: { x: s.x, y: s.y },
      });
    }
  }
}
