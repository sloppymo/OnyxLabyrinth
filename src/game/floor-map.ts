/**
 * Portable floor map format for editors, LLM authoring, and validation.
 *
 * Edge-based grids match src/types + game/dungeon.ts. Overlays (treasures,
 * locked doors, NPCs, …) mirror FloorDef in data/floors.ts.
 */

import type { EdgeType, Grid, TileFeature } from "../types";
import type {
  BarredGateDef,
  EventDef,
  FloorDef,
  EncounterZoneDef,
  NPCDef,
  RaftRouteDef,
  StairsGuardianDef,
  TeleporterLink,
  TilesetZoneDef,
  WaterDef,
} from "../data/floors";
import type { TrapType } from "../types";
import { buildSolidGrid } from "./dungeon";

export const FLOOR_MAP_FORMAT_VERSION = 1 as const;

/** Themes bundled with the game and therefore known to the pure validator. */
export const BUILT_IN_TILESET_THEMES = ["f1", "f2", "f3", "f4", "f5"] as const;

export interface CellJSON {
  n: EdgeType;
  e: EdgeType;
  s: EdgeType;
  w: EdgeType;
  tile?: TileFeature;
}

export interface LockedDoorJSON {
  x: number;
  y: number;
  dir: "n" | "e" | "s" | "w";
  keyId: string;
}

export interface WallFeatureJSON {
  x: number;
  y: number;
  dir: "n" | "e" | "s" | "w";
  spriteId: string;
}

export interface CeilingSpriteJSON {
  x: number;
  y: number;
  spriteId: string;
  scale?: number;
}

export interface CeilingFeatureJSON {
  x: number;
  y: number;
  spriteId: string;
}

export interface DoorFeatureJSON {
  x: number;
  y: number;
  dir: "n" | "e" | "s" | "w";
  spriteId: string;
}

export interface TreasureJSON {
  x: number;
  y: number;
  itemIds: string[];
  trap?: TrapType;
}

export interface ChuteDropJSON {
  x: number;
  y: number;
  toFloorId: number;
  toX: number;
  toY: number;
  /** If true, stepping onto this chute shows a confirmation dialog. */
  confirm?: boolean;
}

/** Serializable floor — round-trips with FloorDef. */
export interface FloorMapJSON {
  formatVersion: typeof FLOOR_MAP_FORMAT_VERSION;
  id: number;
  name: string;
  width: number;
  height: number;
  startX: number;
  startY: number;
  encounterRate: number;
  /** Texture theme under public/assets/tilesets/<theme>/. Defaults to f{id}. */
  tilesetTheme?: string;
  /** Rectangular per-cell theme overrides. Later overlapping zones win. */
  tilesetZones?: TilesetZoneDef[];
  grid: CellJSON[][];
  /**
   * @deprecated Ignored by the engine. Combat tables come from
   * ENCOUNTER_TABLES in src/data/enemies.ts, keyed by floor id (a zone's
   * tableFloorId can point at another floor's table).
   */
  encounterTable?: string[];
  encounterZones?: EncounterZoneDef[];
  mapSprites?: { x: number; y: number; spriteId: string }[];
  wallFeatures?: WallFeatureJSON[];
  ceilingSprites?: CeilingSpriteJSON[];
  ceilingFeatures?: CeilingFeatureJSON[];
  doorFeatures?: DoorFeatureJSON[];
  teleporters?: TeleporterLink[];
  chuteDrops?: ChuteDropJSON[];
  lockedDoors?: LockedDoorJSON[];
  treasures?: TreasureJSON[];
  waters?: WaterDef[];
  npcs?: NPCDef[];
  events?: EventDef[];
  floorRevision?: number;
  barredGates?: BarredGateDef[];
  raftRoutes?: RaftRouteDef[];
  stairsGuardian?: StairsGuardianDef;
}

/** Canonical tileset folder for a floor when none is set. */
export function defaultTilesetTheme(floorId: number): string {
  return `f${floorId}`;
}

export function resolveTilesetTheme(floor: {
  id: number;
  tilesetTheme?: string;
}): string {
  const t = floor.tilesetTheme?.trim();
  return t && t.length > 0 ? t : defaultTilesetTheme(floor.id);
}

export interface TilesetThemeSource {
  id: number;
  tilesetTheme?: string;
  tilesetZones?: readonly TilesetZoneDef[];
}

/**
 * Resolve the corridor material for one map cell.
 *
 * Rectangle bounds are inclusive. Zones are ordered paint layers: when they
 * overlap, the later entry wins. Cells outside every zone use the floor's
 * primary `tilesetTheme` (or `f{id}` when omitted).
 */
export function themeAt(floor: TilesetThemeSource, x: number, y: number): string {
  const zones = floor.tilesetZones;
  if (zones) {
    for (let i = zones.length - 1; i >= 0; i--) {
      const zone = zones[i];
      if (x >= zone.x1 && x <= zone.x2 && y >= zone.y1 && y <= zone.y2) {
        const theme = zone.theme.trim();
        if (theme) return theme;
      }
    }
  }
  return resolveTilesetTheme(floor);
}

/** Unique themes a floor may need, primary first, for eager cache loading. */
export function tilesetThemesForFloor(floor: TilesetThemeSource): string[] {
  const themes = new Set<string>([resolveTilesetTheme(floor)]);
  for (const zone of floor.tilesetZones ?? []) {
    const theme = zone.theme.trim();
    if (theme) themes.add(theme);
  }
  return [...themes];
}

/**
 * Theme for a blocking wall/door ray hit. `castRay` reports the cell it
 * stepped into, on the far side of the edge, so subtract the ray step on the
 * hit axis and sample the near (visible) cell instead.
 */
export function themeForWallHit(
  floor: TilesetThemeSource,
  hitX: number,
  hitY: number,
  side: "x" | "y",
  rayDirX: number,
  rayDirY: number
): string {
  const nearX = side === "x" ? hitX - Math.sign(rayDirX) : hitX;
  const nearY = side === "y" ? hitY - Math.sign(rayDirY) : hitY;
  return themeAt(floor, nearX, nearY);
}

export function emptyCellJSON(): CellJSON {
  return { n: "wall", e: "wall", s: "wall", w: "wall" };
}

export function newFloorMapJSON(
  width: number,
  height: number,
  partial?: Partial<Omit<FloorMapJSON, "formatVersion" | "width" | "height" | "grid">>
): FloorMapJSON {
  const grid: CellJSON[][] = [];
  for (let y = 0; y < height; y++) {
    const row: CellJSON[] = [];
    for (let x = 0; x < width; x++) {
      row.push(emptyCellJSON());
    }
    grid.push(row);
  }
  return {
    formatVersion: FLOOR_MAP_FORMAT_VERSION,
    id: partial?.id ?? 1,
    name: partial?.name ?? "Untitled Floor",
    width,
    height,
    startX: partial?.startX ?? Math.floor(width / 2),
    startY: partial?.startY ?? height - 1,
    encounterRate: partial?.encounterRate ?? 0.08,
    tilesetTheme: partial?.tilesetTheme,
    tilesetZones: partial?.tilesetZones,
    grid,
    encounterTable: partial?.encounterTable,
    encounterZones: partial?.encounterZones,
    mapSprites: partial?.mapSprites,
    wallFeatures: partial?.wallFeatures,
    ceilingSprites: partial?.ceilingSprites,
    ceilingFeatures: partial?.ceilingFeatures,
    doorFeatures: partial?.doorFeatures,
    teleporters: partial?.teleporters,
    chuteDrops: partial?.chuteDrops,
    lockedDoors: partial?.lockedDoors,
    treasures: partial?.treasures,
    waters: partial?.waters,
    npcs: partial?.npcs,
    events: partial?.events,
    floorRevision: partial?.floorRevision,
    barredGates: partial?.barredGates,
    raftRoutes: partial?.raftRoutes,
    stairsGuardian: partial?.stairsGuardian,
  };
}

export function floorDefToMap(floor: FloorDef): FloorMapJSON {
  return {
    formatVersion: FLOOR_MAP_FORMAT_VERSION,
    id: floor.id,
    name: floor.name,
    width: floor.width,
    height: floor.height,
    startX: floor.startX,
    startY: floor.startY,
    encounterRate: floor.encounterRate,
    tilesetTheme: floor.tilesetTheme,
    tilesetZones: floor.tilesetZones?.map((z) => ({ ...z })),
    grid: floor.grid.map((row) =>
      row.map((cell) => ({
        n: cell.n,
        e: cell.e,
        s: cell.s,
        w: cell.w,
        ...(cell.tile ? { tile: cell.tile } : {}),
      }))
    ),
    encounterTable: floor.encounterTable ? [...floor.encounterTable] : undefined,
    encounterZones: floor.encounterZones?.map((z) => ({ ...z })),
    mapSprites: floor.mapSprites?.map((s) => ({ ...s })),
    wallFeatures: floor.wallFeatures?.map((f) => ({ ...f })),
    ceilingSprites: floor.ceilingSprites?.map((s) => ({ ...s })),
    ceilingFeatures: floor.ceilingFeatures?.map((f) => ({ ...f })),
    doorFeatures: floor.doorFeatures?.map((f) => ({ ...f })),
    teleporters: floor.teleporters?.map((t) => ({ ...t })),
    chuteDrops: floor.chuteDrops?.map((c) => ({ ...c })),
    lockedDoors: floor.lockedDoors?.map((d) => ({ ...d })),
    treasures: floor.treasures?.map((t) => ({
      x: t.x,
      y: t.y,
      itemIds: [...t.itemIds],
      trap: t.trap,
    })),
    waters: floor.waters?.map((w) => ({
      ...w,
      effect: w.effect ? { ...w.effect } : undefined,
    })),
    npcs: floor.npcs ? [...floor.npcs] : undefined,
    events: floor.events ? [...floor.events] : undefined,
    floorRevision: floor.floorRevision,
    barredGates: floor.barredGates?.map((g) => ({ ...g })),
    raftRoutes: floor.raftRoutes?.map((r) => ({
      ...r,
      fromDock: { ...r.fromDock },
      toDock: { ...r.toDock },
      path: r.path.map((p) => ({ ...p })),
    })),
    stairsGuardian: floor.stairsGuardian
      ? { ...floor.stairsGuardian, spawns: floor.stairsGuardian.spawns.map((s) => ({ ...s })), introLines: [...floor.stairsGuardian.introLines] }
      : undefined,
  };
}

export function mapToGrid(map: FloorMapJSON): Grid {
  return map.grid.map((row) =>
    row.map((cell) => ({
      n: cell.n,
      e: cell.e,
      s: cell.s,
      w: cell.w,
      tile: cell.tile,
    }))
  );
}

export function mapToFloorDef(map: FloorMapJSON): FloorDef {
  return {
    id: map.id,
    name: map.name,
    width: map.width,
    height: map.height,
    grid: mapToGrid(map),
    startX: map.startX,
    startY: map.startY,
    encounterRate: map.encounterRate,
    tilesetTheme: map.tilesetTheme,
    tilesetZones: map.tilesetZones?.map((z) => ({ ...z })),
    encounterTable: map.encounterTable ? [...map.encounterTable] : undefined,
    encounterZones: map.encounterZones?.map((z) => ({ ...z })),
    mapSprites: map.mapSprites?.map((s) => ({ ...s })),
    wallFeatures: map.wallFeatures?.map((f) => ({ ...f })),
    ceilingSprites: map.ceilingSprites?.map((s) => ({ ...s })),
    ceilingFeatures: map.ceilingFeatures?.map((f) => ({ ...f })),
    doorFeatures: map.doorFeatures?.map((f) => ({ ...f })),
    teleporters: map.teleporters?.map((t) => ({ ...t })),
    chuteDrops: map.chuteDrops?.map((c) => ({ ...c })),
    lockedDoors: map.lockedDoors?.map((d) => ({ ...d })),
    treasures: map.treasures?.map((t) => ({
      x: t.x,
      y: t.y,
      itemIds: [...t.itemIds],
      trap: t.trap,
    })),
    waters: map.waters?.map((w) => ({
      ...w,
      effect: w.effect ? { ...w.effect } : undefined,
    })),
    npcs: map.npcs ? [...map.npcs] : undefined,
    events: map.events ? [...map.events] : undefined,
    floorRevision: map.floorRevision,
    barredGates: map.barredGates?.map((g) => ({ ...g })),
    raftRoutes: map.raftRoutes?.map((r) => ({
      ...r,
      fromDock: { ...r.fromDock },
      toDock: { ...r.toDock },
      path: r.path.map((p) => ({ ...p })),
    })),
    stairsGuardian: map.stairsGuardian
      ? { ...map.stairsGuardian, spawns: map.stairsGuardian.spawns.map((s) => ({ ...s })), introLines: [...map.stairsGuardian.introLines] }
      : undefined,
  };
}

/** Parse JSON from editor export or LLM output. */
export function parseFloorMapJSON(raw: unknown): FloorMapJSON {
  if (!raw || typeof raw !== "object") {
    throw new Error("Floor map must be a JSON object");
  }
  const o = raw as Record<string, unknown>;
  if (o.formatVersion !== FLOOR_MAP_FORMAT_VERSION) {
    throw new Error(`Unsupported formatVersion (expected ${FLOOR_MAP_FORMAT_VERSION})`);
  }
  const width = requireInt(o.width, "width");
  const height = requireInt(o.height, "height");
  if (!Array.isArray(o.grid) || o.grid.length !== height) {
    throw new Error(`grid must be ${height} rows`);
  }
  const grid: CellJSON[][] = [];
  for (let y = 0; y < height; y++) {
    const row = o.grid[y];
    if (!Array.isArray(row) || row.length !== width) {
      throw new Error(`grid row ${y} must have ${width} cells`);
    }
    grid.push(row.map((cell, x) => parseCell(cell, x, y)));
  }
  return {
    formatVersion: FLOOR_MAP_FORMAT_VERSION,
    id: requireInt(o.id, "id"),
    name: requireString(o.name, "name"),
    width,
    height,
    startX: requireInt(o.startX, "startX"),
    startY: requireInt(o.startY, "startY"),
    encounterRate: requireNumber(o.encounterRate, "encounterRate"),
    tilesetTheme: typeof o.tilesetTheme === "string" ? o.tilesetTheme : undefined,
    tilesetZones: parseOverlayArray(o.tilesetZones, "tilesetZones", parseTilesetZone),
    grid,
    encounterTable: optionalStringArray(o.encounterTable),
    encounterZones: parseOverlayArray(o.encounterZones, "encounterZones", parseZone),
    mapSprites: parseOverlayArray(o.mapSprites, "mapSprites", parseMapSprite),
    wallFeatures: parseOverlayArray(o.wallFeatures, "wallFeatures", parseWallFeature),
    ceilingSprites: parseOverlayArray(o.ceilingSprites, "ceilingSprites", parseCeilingSprite),
    ceilingFeatures: parseOverlayArray(o.ceilingFeatures, "ceilingFeatures", parseCeilingFeature),
    doorFeatures: parseOverlayArray(o.doorFeatures, "doorFeatures", parseDoorFeature),
    teleporters: parseOverlayArray(o.teleporters, "teleporters", parseTeleporter),
    chuteDrops: parseOverlayArray(o.chuteDrops, "chuteDrops", parseChute),
    lockedDoors: parseOverlayArray(o.lockedDoors, "lockedDoors", parseLockedDoor),
    treasures: parseOverlayArray(o.treasures, "treasures", parseTreasure),
    waters: parseOverlayArray(o.waters, "waters", parseWater),
    npcs: parseOverlayArray(o.npcs, "npcs", parseNpc),
    events: parseOverlayArray(o.events, "events", parseEvent),
    floorRevision: typeof o.floorRevision === "number" ? o.floorRevision : undefined,
    barredGates: parseOverlayArray(o.barredGates, "barredGates", parseBarredGate),
    raftRoutes: parseOverlayArray(o.raftRoutes, "raftRoutes", parseRaftRoute),
    stairsGuardian: o.stairsGuardian !== undefined
      ? parseStairsGuardian(o.stairsGuardian as Record<string, unknown>, "stairsGuardian")
      : undefined,
  };
}

// --- Overlay parsers ---------------------------------------------------------
// Each overlay entry is structurally checked so malformed editor exports or
// hand-written JSON fail at import with a clear message instead of crashing
// mid-game (previously these arrays were cast without inspection).

function parseOverlayArray<T>(
  v: unknown,
  name: string,
  parseEntry: (o: Record<string, unknown>, label: string) => T
): T[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) throw new Error(`${name} must be an array`);
  return v.map((entry, i) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`${name}[${i}] must be an object`);
    }
    return parseEntry(entry as Record<string, unknown>, `${name}[${i}]`);
  });
}

const DIRS = ["n", "e", "s", "w"] as const;

function parseDir(v: unknown, label: string): "n" | "e" | "s" | "w" {
  if (typeof v !== "string" || !DIRS.includes(v as (typeof DIRS)[number])) {
    throw new Error(`${label} must be one of n/e/s/w`);
  }
  return v as "n" | "e" | "s" | "w";
}

function optionalBool(v: unknown, label: string): boolean | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "boolean") throw new Error(`${label} must be a boolean`);
  return v;
}

function parseZone(o: Record<string, unknown>, l: string): EncounterZoneDef {
  const zone: EncounterZoneDef = {
    id: requireString(o.id, `${l}.id`),
    x1: requireInt(o.x1, `${l}.x1`),
    y1: requireInt(o.y1, `${l}.y1`),
    x2: requireInt(o.x2, `${l}.x2`),
    y2: requireInt(o.y2, `${l}.y2`),
    rateMul: requireNumber(o.rateMul, `${l}.rateMul`),
  };
  if (o.tableFloorId !== undefined) {
    zone.tableFloorId = requireInt(o.tableFloorId, `${l}.tableFloorId`);
  }
  const safeZone = optionalBool(o.safeZone, `${l}.safeZone`);
  if (safeZone !== undefined) zone.safeZone = safeZone;
  return zone;
}

function parseTilesetZone(o: Record<string, unknown>, l: string): TilesetZoneDef {
  return {
    id: requireString(o.id, `${l}.id`),
    x1: requireInt(o.x1, `${l}.x1`),
    y1: requireInt(o.y1, `${l}.y1`),
    x2: requireInt(o.x2, `${l}.x2`),
    y2: requireInt(o.y2, `${l}.y2`),
    theme: requireString(o.theme, `${l}.theme`),
  };
}

function parseMapSprite(
  o: Record<string, unknown>,
  l: string
): { x: number; y: number; spriteId: string } {
  return {
    x: requireInt(o.x, `${l}.x`),
    y: requireInt(o.y, `${l}.y`),
    spriteId: requireString(o.spriteId, `${l}.spriteId`),
  };
}

function parseWallFeature(o: Record<string, unknown>, l: string): WallFeatureJSON {
  return {
    x: requireInt(o.x, `${l}.x`),
    y: requireInt(o.y, `${l}.y`),
    dir: parseDir(o.dir, `${l}.dir`),
    spriteId: requireString(o.spriteId, `${l}.spriteId`),
  };
}

function parseCeilingSprite(o: Record<string, unknown>, l: string): CeilingSpriteJSON {
  const s: CeilingSpriteJSON = {
    x: requireInt(o.x, `${l}.x`),
    y: requireInt(o.y, `${l}.y`),
    spriteId: requireString(o.spriteId, `${l}.spriteId`),
  };
  if (o.scale !== undefined) {
    const scale = requireNumber(o.scale, `${l}.scale`);
    if (scale <= 0) throw new Error(`${l}.scale must be > 0`);
    s.scale = scale;
  }
  return s;
}

function parseCeilingFeature(o: Record<string, unknown>, l: string): CeilingFeatureJSON {
  return {
    x: requireInt(o.x, `${l}.x`),
    y: requireInt(o.y, `${l}.y`),
    spriteId: requireString(o.spriteId, `${l}.spriteId`),
  };
}

function parseDoorFeature(o: Record<string, unknown>, l: string): DoorFeatureJSON {
  return {
    x: requireInt(o.x, `${l}.x`),
    y: requireInt(o.y, `${l}.y`),
    dir: parseDir(o.dir, `${l}.dir`),
    spriteId: requireString(o.spriteId, `${l}.spriteId`),
  };
}

function parseTeleporter(o: Record<string, unknown>, l: string): TeleporterLink {
  return {
    x: requireInt(o.x, `${l}.x`),
    y: requireInt(o.y, `${l}.y`),
    toFloorId: requireInt(o.toFloorId, `${l}.toFloorId`),
    toX: requireInt(o.toX, `${l}.toX`),
    toY: requireInt(o.toY, `${l}.toY`),
  };
}

function parseChute(o: Record<string, unknown>, l: string): ChuteDropJSON {
  const base = parseTeleporter(o, l);
  const confirm = optionalBool(o.confirm, `${l}.confirm`);
  return confirm !== undefined ? { ...base, confirm } : base;
}

function parseLockedDoor(o: Record<string, unknown>, l: string): LockedDoorJSON {
  return {
    x: requireInt(o.x, `${l}.x`),
    y: requireInt(o.y, `${l}.y`),
    dir: parseDir(o.dir, `${l}.dir`),
    keyId: requireString(o.keyId, `${l}.keyId`),
  };
}

const TRAP_TYPES: readonly TrapType[] = ["gas", "teleporter", "alarm", "stunner", "poison"];

function parseTreasure(o: Record<string, unknown>, l: string): TreasureJSON {
  const itemIds = o.itemIds;
  if (!Array.isArray(itemIds) || !itemIds.every((i) => typeof i === "string")) {
    throw new Error(`${l}.itemIds must be a string array`);
  }
  const t: TreasureJSON = {
    x: requireInt(o.x, `${l}.x`),
    y: requireInt(o.y, `${l}.y`),
    itemIds: [...itemIds],
  };
  if (o.trap !== undefined) {
    if (typeof o.trap !== "string" || !TRAP_TYPES.includes(o.trap as TrapType)) {
      throw new Error(`${l}.trap must be one of ${TRAP_TYPES.join("/")}`);
    }
    t.trap = o.trap as TrapType;
  }
  return t;
}

function parseWater(o: Record<string, unknown>, l: string): WaterDef {
  const depth = requireInt(o.depth, `${l}.depth`);
  if (depth < 1 || depth > 4) throw new Error(`${l}.depth must be 1-4`);
  const w: WaterDef = {
    x: requireInt(o.x, `${l}.x`),
    y: requireInt(o.y, `${l}.y`),
    depth: depth as WaterDef["depth"],
  };
  const raftChannel = optionalBool(o.raftChannel, `${l}.raftChannel`);
  if (raftChannel !== undefined) w.raftChannel = raftChannel;
  if (o.effect !== undefined) {
    if (!o.effect || typeof o.effect !== "object") {
      throw new Error(`${l}.effect must be an object`);
    }
    const e = o.effect as Record<string, unknown>;
    if (e.kind === "heal" || e.kind === "damage") {
      w.effect = { kind: e.kind, power: requireNumber(e.power, `${l}.effect.power`) };
    } else if (e.kind === "cure") {
      if (e.status !== "poison") throw new Error(`${l}.effect.status must be "poison"`);
      w.effect = { kind: "cure", status: "poison" };
    } else {
      throw new Error(`${l}.effect.kind must be heal/damage/cure`);
    }
  }
  return w;
}

const EVENT_KINDS = ["message", "damage", "heal", "reward", "keyReward"] as const;

function parseEvent(o: Record<string, unknown>, l: string): EventDef {
  if (typeof o.kind !== "string" || !EVENT_KINDS.includes(o.kind as EventDef["kind"])) {
    throw new Error(`${l}.kind must be one of ${EVENT_KINDS.join("/")}`);
  }
  const ev: EventDef = {
    x: requireInt(o.x, `${l}.x`),
    y: requireInt(o.y, `${l}.y`),
    kind: o.kind as EventDef["kind"],
    message: requireString(o.message, `${l}.message`),
  };
  if (o.power !== undefined) ev.power = requireNumber(o.power, `${l}.power`);
  if (o.itemId !== undefined) ev.itemId = requireString(o.itemId, `${l}.itemId`);
  const once = optionalBool(o.once, `${l}.once`);
  if (once !== undefined) ev.once = once;
  return ev;
}

function parseNpc(o: Record<string, unknown>, l: string): NPCDef {
  const topicsRaw = o.topics;
  if (!Array.isArray(topicsRaw)) throw new Error(`${l}.topics must be an array`);
  const topics = topicsRaw.map((t, i) => {
    if (!t || typeof t !== "object") throw new Error(`${l}.topics[${i}] must be an object`);
    const to = t as Record<string, unknown>;
    const topic: NPCDef["topics"][number] = {
      key: requireString(to.key, `${l}.topics[${i}].key`),
      response: requireString(to.response, `${l}.topics[${i}].response`),
    };
    const hidden = optionalBool(to.hidden, `${l}.topics[${i}].hidden`);
    if (hidden !== undefined) topic.hidden = hidden;
    return topic;
  });
  const combatRaw = o.combatEnemyIds;
  if (!Array.isArray(combatRaw) || !combatRaw.every((i) => typeof i === "string")) {
    throw new Error(`${l}.combatEnemyIds must be a string array`);
  }
  const npc: NPCDef = {
    id: requireString(o.id, `${l}.id`),
    name: requireString(o.name, `${l}.name`),
    title: requireString(o.title, `${l}.title`),
    x: requireInt(o.x, `${l}.x`),
    y: requireInt(o.y, `${l}.y`),
    greeting: requireString(o.greeting, `${l}.greeting`),
    returnGreeting: requireString(o.returnGreeting, `${l}.returnGreeting`),
    topics,
    combatEnemyIds: [...combatRaw],
  };
  if (o.wantsItemId !== undefined) {
    npc.wantsItemId = requireString(o.wantsItemId, `${l}.wantsItemId`);
  }
  if (o.rewardItemId !== undefined) {
    npc.rewardItemId = requireString(o.rewardItemId, `${l}.rewardItemId`);
  }
  if (o.mapSpriteId !== undefined) {
    npc.mapSpriteId = requireString(o.mapSpriteId, `${l}.mapSpriteId`);
  }
  if (o.capabilities !== undefined) {
    if (!o.capabilities || typeof o.capabilities !== "object") {
      throw new Error(`${l}.capabilities must be an object`);
    }
    const caps = o.capabilities as Record<string, unknown>;
    const capabilities: NonNullable<NPCDef["capabilities"]> = {};
    for (const key of ["talk", "barter", "give", "steal", "attack"] as const) {
      const val = optionalBool(caps[key], `${l}.capabilities.${key}`);
      if (val !== undefined) capabilities[key] = val;
    }
    npc.capabilities = capabilities;
  }
  if (o.trades !== undefined) {
    if (!Array.isArray(o.trades)) throw new Error(`${l}.trades must be an array`);
    npc.trades = o.trades.map((t, i) => {
      if (!t || typeof t !== "object") throw new Error(`${l}.trades[${i}] must be an object`);
      const tr = t as Record<string, unknown>;
      const trade: NonNullable<NPCDef["trades"]>[number] = {
        giveItemId: requireString(tr.giveItemId, `${l}.trades[${i}].giveItemId`),
        receiveItemId: requireString(tr.receiveItemId, `${l}.trades[${i}].receiveItemId`),
      };
      const once = optionalBool(tr.once, `${l}.trades[${i}].once`);
      if (once !== undefined) trade.once = once;
      return trade;
    });
  }
  return npc;
}

const DIR_NAMES = ["n", "e", "s", "w"] as const;
type DirName = (typeof DIR_NAMES)[number];

function parseDirName(v: unknown, label: string): DirName {
  if (typeof v !== "string" || !DIR_NAMES.includes(v as DirName)) {
    throw new Error(`${label} must be one of n/e/s/w`);
  }
  return v as DirName;
}

function parseBarredGate(o: Record<string, unknown>, l: string): BarredGateDef {
  return {
    x: requireInt(o.x, `${l}.x`),
    y: requireInt(o.y, `${l}.y`),
    dir: parseDirName(o.dir, `${l}.dir`),
    opensFrom: parseDirName(o.opensFrom, `${l}.opensFrom`),
  };
}

function parsePoint(o: Record<string, unknown>, l: string): { x: number; y: number } {
  return { x: requireInt(o.x, `${l}.x`), y: requireInt(o.y, `${l}.y`) };
}

function parseRaftRoute(o: Record<string, unknown>, l: string): RaftRouteDef {
  const pathRaw = o.path;
  if (!Array.isArray(pathRaw) || pathRaw.length < 2) {
    throw new Error(`${l}.path must be an array of at least 2 points`);
  }
  const path = pathRaw.map((p, i) => {
    if (!p || typeof p !== "object") throw new Error(`${l}.path[${i}] must be an object`);
    return parsePoint(p as Record<string, unknown>, `${l}.path[${i}]`);
  });
  return {
    id: requireString(o.id, `${l}.id`),
    fromDock: parsePoint(o.fromDock as Record<string, unknown>, `${l}.fromDock`),
    fromApproach: parseDirName(o.fromApproach, `${l}.fromApproach`),
    toDock: parsePoint(o.toDock as Record<string, unknown>, `${l}.toDock`),
    toApproach: parseDirName(o.toApproach, `${l}.toApproach`),
    path,
    bidirectional: optionalBool(o.bidirectional, `${l}.bidirectional`) ?? true,
  };
}

function parseSpawnRow(v: unknown, label: string): "front" | "back" {
  if (v !== "front" && v !== "back") {
    throw new Error(`${label} must be "front" or "back"`);
  }
  return v;
}

function parseStairsGuardian(o: Record<string, unknown>, l: string): StairsGuardianDef {
  const spawnsRaw = o.spawns;
  if (!Array.isArray(spawnsRaw) || spawnsRaw.length === 0) {
    throw new Error(`${l}.spawns must be a non-empty array`);
  }
  const spawns = spawnsRaw.map((s, i) => {
    if (!s || typeof s !== "object") throw new Error(`${l}.spawns[${i}] must be an object`);
    const so = s as Record<string, unknown>;
    return {
      enemyId: requireString(so.enemyId, `${l}.spawns[${i}].enemyId`),
      row: parseSpawnRow(so.row, `${l}.spawns[${i}].row`),
    };
  });
  const introRaw = o.introLines;
  if (!Array.isArray(introRaw) || !introRaw.every((s) => typeof s === "string") || introRaw.length === 0) {
    throw new Error(`${l}.introLines must be a non-empty string array`);
  }
  const guardian: StairsGuardianDef = {
    id: requireString(o.id, `${l}.id`),
    x: requireInt(o.x, `${l}.x`),
    y: requireInt(o.y, `${l}.y`),
    spawns,
    introLines: [...introRaw],
    victoryLine: requireString(o.victoryLine, `${l}.victoryLine`),
    blocksDir: parseDirName(o.blocksDir, `${l}.blocksDir`),
  };
  if (o.rewardItemId !== undefined) {
    guardian.rewardItemId = requireString(o.rewardItemId, `${l}.rewardItemId`);
  }
  return guardian;
}

function parseCell(raw: unknown, x: number, y: number): CellJSON {
  if (!raw || typeof raw !== "object") {
    throw new Error(`cell (${x},${y}) must be an object`);
  }
  const c = raw as Record<string, unknown>;
  const cell: CellJSON = {
    n: parseEdge(c.n, `(${x},${y}).n`),
    e: parseEdge(c.e, `(${x},${y}).e`),
    s: parseEdge(c.s, `(${x},${y}).s`),
    w: parseEdge(c.w, `(${x},${y}).w`),
  };
  if (c.tile !== undefined) {
    cell.tile = parseTile(c.tile, x, y);
  }
  return cell;
}

const EDGE_TYPES: readonly EdgeType[] = ["open", "wall", "door", "locked", "barred"];
const TILE_FEATURES: readonly TileFeature[] = [
  "stairs_up",
  "stairs_down",
  "teleporter",
  "chute",
  "darkness",
  "treasure",
  "antimagic",
  "water",
  "npc",
  "event",
  "guardian",
];

function parseEdge(v: unknown, label: string): EdgeType {
  if (typeof v !== "string" || !EDGE_TYPES.includes(v as EdgeType)) {
    throw new Error(`Invalid edge ${label}`);
  }
  return v as EdgeType;
}

function parseTile(v: unknown, x: number, y: number): TileFeature {
  if (typeof v !== "string" || !TILE_FEATURES.includes(v as TileFeature)) {
    throw new Error(`Invalid tile at (${x},${y})`);
  }
  return v as TileFeature;
}

function requireInt(v: unknown, name: string): number {
  if (typeof v !== "number" || !Number.isInteger(v)) {
    throw new Error(`${name} must be an integer`);
  }
  return v;
}

function requireNumber(v: unknown, name: string): number {
  if (typeof v !== "number" || Number.isNaN(v)) {
    throw new Error(`${name} must be a number`);
  }
  return v;
}

function requireString(v: unknown, name: string): string {
  if (typeof v !== "string" || !v.trim()) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return v;
}

function optionalStringArray(v: unknown): string[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) {
    throw new Error("encounterTable must be a string array");
  }
  return [...v];
}

/** Parse a single NPCDef from untrusted JSON (editor's advanced NPC panel). */
export function parseNpcJSON(raw: unknown): NPCDef {
  if (!raw || typeof raw !== "object") throw new Error("NPC must be an object");
  return parseNpc(raw as Record<string, unknown>, "npc");
}

/** True when the cell has at least one non-wall edge (walkable interior). */
export function cellIsPassable(cell: CellJSON): boolean {
  return cell.n !== "wall" || cell.e !== "wall" || cell.s !== "wall" || cell.w !== "wall";
}

/** Create a blank solid map matching game floors. */
export function solidMap(width: number, height: number): FloorMapJSON {
  const grid = buildSolidGrid(width, height);
  return floorDefToMap({
    id: 1,
    name: "New Floor",
    width,
    height,
    grid,
    startX: Math.floor(width / 2),
    startY: height - 1,
    encounterRate: 0.08,
  });
}
