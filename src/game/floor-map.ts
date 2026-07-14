/**
 * Portable floor map format for editors, LLM authoring, and validation.
 *
 * Edge-based grids match src/types + game/dungeon.ts. Overlays (treasures,
 * locked doors, NPCs, …) mirror FloorDef in data/floors.ts.
 */

import type { EdgeType, Grid, TileFeature } from "../types";
import type {
  EventDef,
  FloorDef,
  EncounterZoneDef,
  NPCDef,
  TeleporterLink,
  WaterDef,
} from "../data/floors";
import type { TrapType } from "../types";
import { buildSolidGrid } from "./dungeon";

export const FLOOR_MAP_FORMAT_VERSION = 1 as const;

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
  grid: CellJSON[][];
  /**
   * @deprecated Ignored by the engine. Combat tables come from
   * ENCOUNTER_TABLES in src/data/enemies.ts, keyed by floor id (a zone's
   * tableFloorId can point at another floor's table).
   */
  encounterTable?: string[];
  encounterZones?: EncounterZoneDef[];
  mapSprites?: { x: number; y: number; spriteId: string }[];
  teleporters?: TeleporterLink[];
  chuteDrops?: ChuteDropJSON[];
  lockedDoors?: LockedDoorJSON[];
  treasures?: TreasureJSON[];
  waters?: WaterDef[];
  npcs?: NPCDef[];
  events?: EventDef[];
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
    grid,
    encounterTable: partial?.encounterTable,
    encounterZones: partial?.encounterZones,
    mapSprites: partial?.mapSprites,
    teleporters: partial?.teleporters,
    chuteDrops: partial?.chuteDrops,
    lockedDoors: partial?.lockedDoors,
    treasures: partial?.treasures,
    waters: partial?.waters,
    npcs: partial?.npcs,
    events: partial?.events,
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
    encounterTable: map.encounterTable ? [...map.encounterTable] : undefined,
    encounterZones: map.encounterZones?.map((z) => ({ ...z })),
    mapSprites: map.mapSprites?.map((s) => ({ ...s })),
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
    grid,
    encounterTable: optionalStringArray(o.encounterTable),
    encounterZones: parseOverlayArray(o.encounterZones, "encounterZones", parseZone),
    mapSprites: parseOverlayArray(o.mapSprites, "mapSprites", parseMapSprite),
    teleporters: parseOverlayArray(o.teleporters, "teleporters", parseTeleporter),
    chuteDrops: parseOverlayArray(o.chuteDrops, "chuteDrops", parseChute),
    lockedDoors: parseOverlayArray(o.lockedDoors, "lockedDoors", parseLockedDoor),
    treasures: parseOverlayArray(o.treasures, "treasures", parseTreasure),
    waters: parseOverlayArray(o.waters, "waters", parseWater),
    npcs: parseOverlayArray(o.npcs, "npcs", parseNpc),
    events: parseOverlayArray(o.events, "events", parseEvent),
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
  return zone;
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
  return parseTeleporter(o, l);
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

const EVENT_KINDS = ["message", "damage", "heal", "reward"] as const;

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

const EDGE_TYPES: readonly EdgeType[] = ["open", "wall", "door", "locked"];
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
