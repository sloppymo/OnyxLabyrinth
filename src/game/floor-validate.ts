/**
 * Floor map validation — symmetric edges, overlay consistency, reachability,
 * and content references (items, enemies, encounter tables, cross-floor links).
 *
 * Mirrors the invariants the campaign floors are tested against in
 * src/data/floors.test.ts so custom packs get the same guarantees.
 */

import { type FloorDef } from "../data/floors";
import { getFloors } from "./floor-registry";
import { MAP_SPRITES_BY_ID } from "../data/map-sprites";
import { WALL_FEATURES_BY_ID } from "../data/wall-features";
import { CEILING_SPRITES_BY_ID } from "../data/ceiling-sprites";
import { CEILING_FEATURES_BY_ID } from "../data/ceiling-features";
import { DOOR_FEATURES_BY_ID } from "../data/door-features";
import { ITEMS_BY_ID } from "../data/items";
import { ENEMIES_BY_ID, ENCOUNTER_TABLES } from "../data/enemies";
import { spellById } from "../data/spells";
import type { FloorMapJSON, CellJSON } from "./floor-map";
import {
  BUILT_IN_TILESET_THEMES,
  floorDefToMap,
  cellIsPassable,
} from "./floor-map";
import { resolveCellVolume } from "../engine/maze-renderer/geometry/cell-volume";
import {
  isConnectorSide,
  maxFloorSurfaceZ,
  OPPOSITE_SURFACE_DIRECTION,
  resolveFloorSurface,
  surfacesConnectAcrossEdge,
} from "../engine/maze-renderer/geometry/floor-surface";

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
   * and stairs. Defaults to the runtime floor list from floor-registry.
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
  validateLockedDoors(map, issues, context?.floors ?? getFloors());
  validateLockedEdgeCoverage(map, issues);
  validateWallFeatures(map, issues);
  validateCeilingSprites(map, issues);
  validateCeilingFeatures(map, issues);
  validateDoorFeatures(map, issues);
  validateReachability(map, issues);
  validateDuplicateOverlays(map, issues);
  validateItemRefs(map, issues);
  validateNpcRefs(map, issues);
  validateStairsGuardianRefs(map, issues);
  validateFloorLinks(map, issues, context?.floors ?? getFloors());
  validateStairsTargets(map, issues, context?.floors ?? getFloors());
  validateEncounterConfig(map, issues);
  validateTilesetConfig(map, issues);
  validateHeightConfig(map, issues);

  return issues;
}

const MIN_HEIGHT_Z = -8;
const MAX_HEIGHT_Z = 16;
const MIN_CELL_CLEARANCE = 0.25;

function validateHeightConfig(
  map: FloorMapJSON,
  issues: ValidationIssue[]
): void {
  const zones = map.heightZones ?? [];
  const ids = new Set<string>();
  for (const zone of zones) {
    if (ids.has(zone.id)) {
      issues.push({
        severity: "error",
        code: "height_zone_duplicate_id",
        message: `Height zone id "${zone.id}" is duplicated`,
      });
    }
    ids.add(zone.id);
    if (zone.x1 > zone.x2 || zone.y1 > zone.y2) {
      issues.push({
        severity: "error",
        code: "height_zone_order",
        message: `Height zone ${zone.id} must use x1 <= x2 and y1 <= y2`,
      });
    }
    if (!inBoundsGrid(map, zone.x1, zone.y1) || !inBoundsGrid(map, zone.x2, zone.y2)) {
      issues.push({
        severity: "error",
        code: "height_zone_oob",
        message: `Height zone ${zone.id} extends out of bounds`,
      });
    }
    for (const [field, value] of [
      ["floorZ", zone.floorZ],
      ["ceilingZ", zone.ceilingZ],
    ] as const) {
      if (value === undefined) continue;
      if (!Number.isFinite(value)) {
        issues.push({
          severity: "error",
          code: "height_non_finite",
          message: `Height zone ${zone.id} ${field} must be finite`,
        });
      } else if (value < MIN_HEIGHT_Z || value > MAX_HEIGHT_Z) {
        issues.push({
          severity: "error",
          code: "height_out_of_range",
          message: `Height zone ${zone.id} ${field}=${value} must be between ${MIN_HEIGHT_Z} and ${MAX_HEIGHT_Z}`,
        });
      }
    }
  }

  validateRampConfig(map, issues);

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const volume = resolveCellVolume(map, x, y);
      if (!(volume.floorZ < volume.ceilingZ)) {
        issues.push({
          severity: "error",
          code: "height_volume_inverted",
          message: `Cell (${x},${y}) resolves to floorZ ${volume.floorZ} >= ceilingZ ${volume.ceilingZ}`,
          at: { x, y },
        });
      } else if (
        volume.ceilingZ - maxFloorSurfaceZ(resolveFloorSurface(map, x, y)) <
        MIN_CELL_CLEARANCE
      ) {
        issues.push({
          severity: "error",
          code: "height_clearance_too_small",
          message: `Cell (${x},${y}) vertical clearance above its highest floor surface must be at least ${MIN_CELL_CLEARANCE}`,
          at: { x, y },
        });
      }

      for (const dir of ["e", "s"] as const) {
        const edge = map.grid[y][x][dir];
        if (edge === "wall") continue;
        const [dx, dy] = DELTA[dir];
        const nx = x + dx;
        const ny = y + dy;
        if (!inBoundsGrid(map, nx, ny)) continue;
        const neighbor = resolveCellVolume(map, nx, ny);
        const overlapMin = Math.max(volume.floorZ, neighbor.floorZ);
        const overlapMax = Math.min(volume.ceilingZ, neighbor.ceilingZ);
        if (!(overlapMin < overlapMax)) {
          issues.push({
            severity: "error",
            code: "height_open_no_overlap",
            message: `Traversable ${dir} edge from (${x},${y}) has no overlapping air volume with (${nx},${ny})`,
            at: { x, y },
          });
        }
        if (!surfacesConnectAcrossEdge(map, x, y, dir)) {
          issues.push({
            severity: "error",
            code: "height_surface_mismatch",
            message: `Traversable ${dir} edge from (${x},${y}) has mismatched floor surfaces (${volume.floorZ} vs ${neighbor.floorZ}); add or correct a ramp/stair connector`,
            at: { x, y },
          });
        }
      }
    }
  }
}

function validateRampConfig(
  map: FloorMapJSON,
  issues: ValidationIssue[]
): void {
  const seen = new Set<string>();
  for (const ramp of map.ramps ?? []) {
    const key = `${ramp.x},${ramp.y}`;
    if (seen.has(key)) {
      issues.push({
        severity: "error",
        code: "ramp_duplicate",
        message: `Floor ${map.id} has multiple local connectors at (${ramp.x},${ramp.y})`,
        at: { x: ramp.x, y: ramp.y },
      });
      continue;
    }
    seen.add(key);
    if (!inBoundsGrid(map, ramp.x, ramp.y)) {
      issues.push({
        severity: "error",
        code: "ramp_oob",
        message: `Floor ${map.id} ramp (${ramp.x},${ramp.y}) is out of bounds`,
        at: { x: ramp.x, y: ramp.y },
      });
      continue;
    }

    const [dx, dy] = DELTA[ramp.dir];
    const hx = ramp.x + dx;
    const hy = ramp.y + dy;
    const downhill = OPPOSITE_SURFACE_DIRECTION[ramp.dir];
    const [ldx, ldy] = DELTA[downhill];
    const lx = ramp.x + ldx;
    const ly = ramp.y + ldy;
    if (!inBoundsGrid(map, hx, hy) || !inBoundsGrid(map, lx, ly)) {
      issues.push({
        severity: "error",
        code: "ramp_endpoint_oob",
        message: `Floor ${map.id} ramp (${ramp.x},${ramp.y}) ${ramp.dir} needs in-bounds low (${lx},${ly}) and high (${hx},${hy}) endpoints`,
        at: { x: ramp.x, y: ramp.y },
      });
      continue;
    }

    const surface = resolveFloorSurface(map, ramp.x, ramp.y);
    if (surface.kind === "flat") continue;
    if (!(surface.highZ > surface.lowZ)) {
      issues.push({
        severity: "error",
        code: surface.highZ === surface.lowZ ? "ramp_zero_rise" : "ramp_not_uphill",
        message: `Floor ${map.id} ramp (${ramp.x},${ramp.y}) ${ramp.dir} must rise from ${surface.lowZ}; uphill endpoint (${hx},${hy}) resolves to ${surface.highZ}`,
        at: { x: ramp.x, y: ramp.y },
      });
    }

    for (const endpoint of [
      { dir: downhill, label: "low", x: lx, y: ly, expected: surface.lowZ },
      { dir: ramp.dir, label: "high", x: hx, y: hy, expected: surface.highZ },
    ] as const) {
      const edge = map.grid[ramp.y][ramp.x][endpoint.dir];
      if (edge !== "open") {
        issues.push({
          severity: "error",
          code: "ramp_endpoint_edge",
          message: `Floor ${map.id} ramp (${ramp.x},${ramp.y}) ${endpoint.label} edge ${endpoint.dir} must be open (expected Z ${endpoint.expected}, actual edge ${edge})`,
          at: { x: ramp.x, y: ramp.y },
        });
      }
      if (!surfacesConnectAcrossEdge(map, ramp.x, ramp.y, endpoint.dir)) {
        issues.push({
          severity: "error",
          code: "ramp_endpoint_mismatch",
          message: `Floor ${map.id} ramp (${ramp.x},${ramp.y}) ${endpoint.label} edge ${endpoint.dir} does not meet (${endpoint.x},${endpoint.y}) at expected Z ${endpoint.expected}`,
          at: { x: ramp.x, y: ramp.y },
        });
      }
    }

    for (const dir of ["n", "e", "s", "w"] as const) {
      if (!isConnectorSide(surface, dir)) continue;
      const edge = map.grid[ramp.y][ramp.x][dir];
      if (edge !== "wall") {
        issues.push({
          severity: "error",
          code: "ramp_side_open",
          message: `Floor ${map.id} ramp (${ramp.x},${ramp.y}) side edge ${dir} must be wall; side entry has no unambiguous elevation`,
          at: { x: ramp.x, y: ramp.y },
        });
      }
    }

    const tile = map.grid[ramp.y][ramp.x].tile;
    if (tile === "stairs_up" || tile === "stairs_down") {
      issues.push({
        severity: "error",
        code: "ramp_interfloor_stairs_conflict",
        message: `Floor ${map.id} ramp (${ramp.x},${ramp.y}) cannot also be an inter-floor ${tile} tile`,
        at: { x: ramp.x, y: ramp.y },
      });
    }
    if (map.mapSprites?.some((sprite) => sprite.x === ramp.x && sprite.y === ramp.y)) {
      issues.push({
        severity: "error",
        code: "ramp_map_sprite_unsupported",
        message: `Floor ${map.id} ramp (${ramp.x},${ramp.y}) cannot contain a map sprite; place it on a flat landing`,
        at: { x: ramp.x, y: ramp.y },
      });
    }
    if (map.npcs?.some((npc) => npc.x === ramp.x && npc.y === ramp.y)) {
      issues.push({
        severity: "error",
        code: "ramp_npc_unsupported",
        message: `Floor ${map.id} ramp (${ramp.x},${ramp.y}) cannot contain an NPC; place it on a flat landing`,
        at: { x: ramp.x, y: ramp.y },
      });
    }
  }
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
    if (!n.combatEnemyIds?.length && n.capabilities?.attack !== false) {
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
  if (map.stairsGuardian) {
    const g = map.stairsGuardian;
    expectTile(g.x, g.y, "guardian", "guardian_tile", `Stairs guardian ${g.id}`);
  }
}

function validateStairsGuardianRefs(map: FloorMapJSON, issues: ValidationIssue[]): void {
  const g = map.stairsGuardian;
  if (!g) return;
  if (g.spawns.length === 0) {
    issues.push({
      severity: "error",
      code: "guardian_no_spawns",
      message: `Stairs guardian ${g.id} has no spawns`,
      at: { x: g.x, y: g.y },
    });
  }
  for (const spawn of g.spawns) {
    if (!ENEMIES_BY_ID[spawn.enemyId]) {
      issues.push({
        severity: "error",
        code: "guardian_enemy_unknown",
        message: `Stairs guardian ${g.id} spawns references unknown enemy "${spawn.enemyId}"`,
        at: { x: g.x, y: g.y },
      });
    }
  }
  if (g.rewardItemId && !isObtainableItemId(g.rewardItemId)) {
    issues.push({
      severity: "warning",
      code: "guardian_reward_item_unknown",
      message: `Stairs guardian ${g.id} rewardItemId "${g.rewardItemId}" is not a recognized item`,
      at: { x: g.x, y: g.y },
    });
  }
  if (inBoundsGrid(map, g.x, g.y)) {
    const edge = map.grid[g.y][g.x][DIR_EDGE[g.blocksDir]];
    if (edge !== "barred") {
      issues.push({
        severity: "error",
        code: "guardian_edge_unsealed",
        message: `Stairs guardian ${g.id} blocksDir "${g.blocksDir}" must be authored as "barred" (got "${edge}") — "wall" would fail reachability, and anything else lets a fled fight be walked past`,
        at: { x: g.x, y: g.y },
      });
    }
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

/**
 * Wall features are visual-only decals bound to a specific wall face — the
 * edge they name must actually be a plain "wall" (not door/locked/open;
 * doors already carry their own art, and there's no wall texture underneath
 * an open edge to composite onto) and the spriteId must resolve.
 */
function validateWallFeatures(map: FloorMapJSON, issues: ValidationIssue[]): void {
  for (const f of map.wallFeatures ?? []) {
    if (!inBoundsGrid(map, f.x, f.y)) {
      issues.push({
        severity: "error",
        code: "wall_feature_oob",
        message: `Wall feature "${f.spriteId}" at (${f.x},${f.y}) out of bounds`,
        at: { x: f.x, y: f.y },
      });
      continue;
    }
    const edge = map.grid[f.y][f.x][f.dir];
    if (edge !== "wall") {
      issues.push({
        severity: "error",
        code: "wall_feature_edge_mismatch",
        message: `wallFeatures entry (${f.x},${f.y}) ${f.dir} but grid edge is "${edge}" (must be "wall")`,
        at: { x: f.x, y: f.y },
      });
    }
    if (!WALL_FEATURES_BY_ID[f.spriteId]) {
      issues.push({
        severity: "error",
        code: "wall_feature_unknown",
        message: `Unknown wall feature id "${f.spriteId}" at (${f.x},${f.y})`,
        at: { x: f.x, y: f.y },
      });
    }
  }
}

/** Ceiling sprites are visual-only billboards — bounds + a known spriteId,
 *  plus a sanity check on the optional per-placement scale. */
function validateCeilingSprites(map: FloorMapJSON, issues: ValidationIssue[]): void {
  for (const s of map.ceilingSprites ?? []) {
    if (!inBoundsGrid(map, s.x, s.y)) {
      issues.push({
        severity: "error",
        code: "ceiling_sprite_oob",
        message: `Ceiling sprite "${s.spriteId}" at (${s.x},${s.y}) is out of bounds`,
        at: { x: s.x, y: s.y },
      });
    }
    if (!CEILING_SPRITES_BY_ID[s.spriteId]) {
      issues.push({
        severity: "error",
        code: "ceiling_sprite_unknown",
        message: `Unknown ceiling sprite id "${s.spriteId}" at (${s.x},${s.y})`,
        at: { x: s.x, y: s.y },
      });
    }
    if (s.scale !== undefined && (!Number.isFinite(s.scale) || s.scale <= 0)) {
      issues.push({
        severity: "error",
        code: "ceiling_sprite_scale",
        message: `Ceiling sprite "${s.spriteId}" at (${s.x},${s.y}) has invalid scale ${s.scale} (must be > 0)`,
        at: { x: s.x, y: s.y },
      });
    }
  }
}

/**
 * Ceiling features fully replace the sampled ceiling texture for one grid
 * cell, so — unlike the "last writer wins" overlays in
 * `validateDuplicateOverlays` — two entries on the same cell are a real
 * authoring error, not just a warning.
 */
function validateCeilingFeatures(map: FloorMapJSON, issues: ValidationIssue[]): void {
  const seenCells = new Set<string>();
  for (const f of map.ceilingFeatures ?? []) {
    if (!inBoundsGrid(map, f.x, f.y)) {
      issues.push({
        severity: "error",
        code: "ceiling_feature_oob",
        message: `Ceiling feature "${f.spriteId}" at (${f.x},${f.y}) is out of bounds`,
        at: { x: f.x, y: f.y },
      });
      continue;
    }
    const key = `${f.x},${f.y}`;
    if (seenCells.has(key)) {
      issues.push({
        severity: "error",
        code: "ceiling_feature_duplicate",
        message: `Multiple ceilingFeatures entries at (${f.x},${f.y}) — a cell can only sample one ceiling texture`,
        at: { x: f.x, y: f.y },
      });
    }
    seenCells.add(key);
    if (!CEILING_FEATURES_BY_ID[f.spriteId]) {
      issues.push({
        severity: "error",
        code: "ceiling_feature_unknown",
        message: `Unknown ceiling feature id "${f.spriteId}" at (${f.x},${f.y})`,
        at: { x: f.x, y: f.y },
      });
    }
  }
}

/**
 * A doorFeatures entry is a full-face art override for a "hero door" — the
 * edge it names must already be door-like (door/locked/barred, not a plain
 * wall or open passage, since there's no generic door texture underneath an
 * open edge to substitute) and the spriteId must resolve.
 */
function validateDoorFeatures(map: FloorMapJSON, issues: ValidationIssue[]): void {
  for (const f of map.doorFeatures ?? []) {
    if (!inBoundsGrid(map, f.x, f.y)) {
      issues.push({
        severity: "error",
        code: "door_feature_oob",
        message: `Door feature "${f.spriteId}" at (${f.x},${f.y}) out of bounds`,
        at: { x: f.x, y: f.y },
      });
      continue;
    }
    const edge = map.grid[f.y][f.x][f.dir];
    if (edge !== "door" && edge !== "locked" && edge !== "barred") {
      issues.push({
        severity: "error",
        code: "door_feature_edge_mismatch",
        message: `doorFeatures entry (${f.x},${f.y}) ${f.dir} but grid edge is "${edge}" (must be door/locked/barred)`,
        at: { x: f.x, y: f.y },
      });
    }
    if (!DOOR_FEATURES_BY_ID[f.spriteId]) {
      issues.push({
        severity: "error",
        code: "door_feature_unknown",
        message: `Unknown door feature id "${f.spriteId}" at (${f.x},${f.y})`,
        at: { x: f.x, y: f.y },
      });
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
    // Unlike mapSprites/wallFeatures/ceilingSprites, mapSpriteId is optional
    // by design (absent = the "&" glyph, not a bug) — only flag a value that
    // was actually set but doesn't resolve, which is a typo, not a missing
    // art pass.
    if (n.mapSpriteId && !MAP_SPRITES_BY_ID[n.mapSpriteId]) {
      issues.push({
        severity: "error",
        code: "npc_sprite_unknown",
        message: `NPC ${n.id} has unknown mapSpriteId "${n.mapSpriteId}"`,
        at: { x: n.x, y: n.y },
      });
    }
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
    const shopSpellIds = new Set<string>();
    for (const listing of n.shop?.inventory ?? []) {
      if (shopSpellIds.has(listing.spellId)) {
        issues.push({ severity: "error", code: "shop_spell_duplicate", message: `NPC ${n.id} shop lists spell "${listing.spellId}" more than once`, at: { x: n.x, y: n.y } });
      }
      shopSpellIds.add(listing.spellId);
      const spell = spellById(listing.spellId);
      if (!spell || spell.acquisition !== "iso-shop") {
        issues.push({ severity: "error", code: "shop_spell_unknown", message: `NPC ${n.id} shop references non-Iso spell "${listing.spellId}"`, at: { x: n.x, y: n.y } });
      }
      if (!Number.isInteger(listing.price) || listing.price <= 0) {
        issues.push({ severity: "error", code: "shop_price_invalid", message: `NPC ${n.id} shop price for "${listing.spellId}" must be a positive integer`, at: { x: n.x, y: n.y } });
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

function validateTilesetConfig(map: FloorMapJSON, issues: ValidationIssue[]): void {
  const knownThemes = new Set<string>(BUILT_IN_TILESET_THEMES);
  const primary = map.tilesetTheme?.trim();
  if (primary && !knownThemes.has(primary)) {
    issues.push({
      severity: "warning",
      code: "tileset_theme_unknown",
      message: `Primary tileset theme "${primary}" is not bundled (${BUILT_IN_TILESET_THEMES.join(", ")}); ensure public/assets/tilesets/${primary}/ ships with the map`,
    });
  }

  const zones = map.tilesetZones ?? [];
  const seenIds = new Set<string>();
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    if (seenIds.has(zone.id)) {
      issues.push({
        severity: "warning",
        code: "tileset_zone_dup_id",
        message: `Duplicate tileset zone id "${zone.id}"`,
      });
    }
    seenIds.add(zone.id);

    if (zone.x1 > zone.x2 || zone.y1 > zone.y2) {
      issues.push({
        severity: "error",
        code: "tileset_zone_order",
        message: `Tileset zone ${zone.id} must use x1 <= x2 and y1 <= y2`,
      });
    }
    if (!inBoundsGrid(map, zone.x1, zone.y1) || !inBoundsGrid(map, zone.x2, zone.y2)) {
      issues.push({
        severity: "error",
        code: "tileset_zone_oob",
        message: `Tileset zone ${zone.id} extends out of bounds`,
      });
    }

    const theme = zone.theme.trim();
    if (!theme) {
      issues.push({
        severity: "error",
        code: "tileset_zone_theme_empty",
        message: `Tileset zone ${zone.id} has an empty theme`,
      });
    } else if (!knownThemes.has(theme)) {
      issues.push({
        severity: "warning",
        code: "tileset_theme_unknown",
        message: `Tileset zone ${zone.id} theme "${theme}" is not bundled (${BUILT_IN_TILESET_THEMES.join(", ")}); ensure public/assets/tilesets/${theme}/ ships with the map`,
      });
    }

    for (let previous = 0; previous < i; previous++) {
      const other = zones[previous];
      const overlaps =
        zone.x1 <= other.x2 &&
        zone.x2 >= other.x1 &&
        zone.y1 <= other.y2 &&
        zone.y2 >= other.y1;
      if (overlaps) {
        issues.push({
          severity: "warning",
          code: "tileset_zone_overlap",
          message: `Tileset zone ${zone.id} overlaps ${other.id}; later zone ${zone.id} wins`,
        });
      }
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
