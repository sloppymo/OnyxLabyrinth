// Debug-only game-state snapshot. Pure: no DOM, no engine imports, so the
// whole surface is unit-testable without a browser. main.ts wires this behind
// the ?debug=1 gate; nothing here is reachable in normal play.
//
// The snapshot exists so Playwright-driven playtests can read structured state
// instead of guessing from pixels. It reports `route` (which overlay actually
// owns input) alongside `mode`, because overlays keep the underlying
// GameState.mode — see AGENTS.md's UiStack pitfall.

import type { ControllerRouteKind } from "../engine/controller-route";
import type { FloorDef } from "../data/floors";
import type {
  EdgeType,
  Facing,
  GameState,
  PendingTrap,
  PlayerState,
  TileFeature,
} from "../types";

/** Read-only view of the live combat controller, supplied by combat-ui. */
export interface CombatDebugView {
  phase: string;
  actingCharId: string | null;
  roundEnding: boolean;
  playbackDone: boolean;
  selection: { title: string; entries: string[]; index: number } | null;
  round: number;
  enemies: CombatDebugEnemy[];
  party?: CombatDebugParty[];
  inventory?: Record<string, number>;
  recentLog: string[];
  result: string | null;
}

export interface CombatDebugParty {
  id: string;
  name: string;
  class: string;
  hp: number;
  maxHp: number;
  sp: number;
  maxSp: number;
  status: string[];
  knownSpellIds: string[];
}

export interface CombatDebugEnemy {
  id: string;
  name: string;
  /** Exact HP — debug-only; players see a descriptor instead. */
  hp: number;
  maxHp: number;
  row: string;
  status: string[];
}

export interface SnapshotInput {
  state: GameState;
  route: ControllerRouteKind;
  message: { text: string; visible: boolean };
  mapVisible: boolean;
  /** Session-only nonmodal heads-up map state. */
  mapOverlayVisible?: boolean;
  inArena: boolean;
  /** Quiescence — no pending mode fade, camera tween, prologue, or unfinished
   *  combat playback. Required (not defaulted) so a caller can't accidentally
   *  ship a snapshot asserting "idle" that nothing actually computed. */
  idle: boolean;
  combat?: CombatDebugView | null;
  /** Invariant violations for the current state (debug/invariants.ts). */
  warnings?: string[];
  /** Cue ids whose envelope has not elapsed yet (debug/audio-spy.ts). */
  soundsPlaying?: string[];
  /** Include an ASCII map render (omitted by default — the grid is large). */
  map?: boolean;
  mapRadius?: number;
}

export interface SnapshotParty {
  id: string;
  name: string;
  class: string;
  level: number;
  hp: number;
  maxHp: number;
  sp: number;
  maxSp: number;
  status: string[];
  perkIds: string[];
}

export interface Snapshot {
  schema: 1;
  mode: string;
  route: ControllerRouteKind;
  floor: { id: number; name: string; theme?: string };
  pos: { x: number; y: number; facing: Facing; compass: string };
  tile: TileFeature | null;
  flags: {
    inDarkness: boolean;
    inAntimagic: boolean;
    mapVisible: boolean;
    mapOverlayVisible: boolean;
    inArena: boolean;
    pendingTrap: PendingTrap | null;
  };
  party: SnapshotParty[];
  gold: number;
  keys: string[];
  cards: string[];
  inventory: { itemId: string; identified: boolean }[];
  buffs: { kind: string; remainingSteps: number }[];
  explored: string[];
  unlockedDoors: string[];
  message: { text: string; visible: boolean };
  idle: boolean;
  combat: CombatDebugView | null;
  /** Invariant violations — empty when the state is self-consistent. */
  warnings: string[];
  /** Audio cues still sounding at snapshot time. */
  soundsPlaying: string[];
  availableActions: string[];
  map: string[] | null;
}

const COMPASS = ["N", "E", "S", "W"] as const;

export function compassFor(facing: Facing): string {
  return COMPASS[facing] ?? "N";
}

/** Menu verbs shared by every list/cursor overlay. */
const MENU_ACTIONS = ["up", "down", "left", "right", "confirm", "cancel"];

const DUNGEON_ACTIONS = [
  "forward",
  "backward",
  "turnLeft",
  "turnRight",
  "camp",
  "map",
  "mapOverlay",
  "grimoire",
  "town",
  "unlock",
  "save",
];

/**
 * Legal input verbs for the current route. Playtest agents use this to
 * discover controls instead of relying on a hard-coded (and drifting) key list.
 */
export function availableActionsFor(
  route: ControllerRouteKind,
  _state: GameState,
  combat?: CombatDebugView | null
): string[] {
  switch (route) {
    case "dungeon":
      return [...DUNGEON_ACTIONS];
    case "trap":
      return ["inspect", "disarm", "open", "leave"];
    case "combat": {
      if (!combat) return [];
      // Playback owns the screen; input is swallowed until it finishes.
      if (combat.phase === "playback") return [];
      if (combat.phase === "result") return ["confirm"];
      return [...MENU_ACTIONS];
    }
    case "card_trial": {
      if (!combat) return [...MENU_ACTIONS];
      if (combat.phase === "playback") return [];
      if (combat.phase === "result") return ["confirm"];
      if (combat.phase === "target" || combat.phase === "target2") return [...MENU_ACTIONS];
      return [...MENU_ACTIONS, "move", "pass"];
    }
    case "none":
      return [];
    default:
      return [...MENU_ACTIONS];
  }
}

export function buildSnapshot(input: SnapshotInput): Snapshot {
  const { state } = input;
  const cell = state.floor.grid[state.player.y]?.[state.player.x];

  return {
    schema: 1,
    mode: state.mode,
    route: input.route,
    floor: {
      id: state.floor.id,
      name: state.floor.name,
      theme: state.floor.tilesetTheme,
    },
    pos: {
      x: state.player.x,
      y: state.player.y,
      facing: state.player.facing,
      compass: compassFor(state.player.facing),
    },
    tile: cell?.tile ?? null,
    flags: {
      inDarkness: state.inDarkness,
      inAntimagic: state.inAntimagic,
      mapVisible: input.mapVisible,
      mapOverlayVisible: input.mapOverlayVisible ?? false,
      inArena: input.inArena,
      pendingTrap: state.pendingTrap ? { ...state.pendingTrap } : null,
    },
    party: state.party.map((c) => ({
      id: c.id,
      name: c.name,
      class: c.class,
      level: c.level,
      hp: c.hp,
      maxHp: c.maxHp,
      sp: c.sp,
      maxSp: c.maxSp,
      status: [...c.status],
      perkIds: [...c.perkIds],
    })),
    gold: state.partyGold,
    keys: [...state.keys],
    cards: [...(state.cardCollection ?? [])],
    inventory: state.inventory.map((e) => ({ ...e })),
    buffs: state.persistentBuffs.map((b) => ({ ...b })),
    explored: [...state.explored],
    unlockedDoors: [...state.unlockedDoors],
    message: { ...input.message },
    idle: input.idle,
    combat: input.combat ? cloneCombatView(input.combat) : null,
    warnings: [...(input.warnings ?? [])],
    soundsPlaying: [...(input.soundsPlaying ?? [])],
    availableActions: availableActionsFor(input.route, state, input.combat),
    map: input.map
      ? asciiMap(state.floor, state.player, state.explored, input.mapRadius)
      : null,
  };
}

function cloneCombatView(view: CombatDebugView): CombatDebugView {
  return {
    ...view,
    selection: view.selection
      ? { ...view.selection, entries: [...view.selection.entries] }
      : null,
    enemies: view.enemies.map((e) => ({ ...e, status: [...e.status] })),
    party: view.party?.map((member) => ({ ...member, status: [...member.status], knownSpellIds: [...member.knownSpellIds] })),
    inventory: view.inventory ? { ...view.inventory } : undefined,
    recentLog: [...view.recentLog],
  };
}

// --- ASCII map ---------------------------------------------------------------

const FACING_GLYPH = ["^", ">", "v", "<"];

const TILE_GLYPH: Record<TileFeature, string> = {
  stairs_up: "U",
  stairs_down: "D",
  teleporter: "T",
  chute: "C",
  darkness: "K",
  treasure: "$",
  antimagic: "A",
  water: "W",
  npc: "N",
  event: "E",
  guardian: "G",
};

function horizontalEdge(edge: EdgeType): string {
  if (edge === "open") return " ";
  if (edge === "door") return "=";
  if (edge === "locked") return "x";
  return "-";
}

function verticalEdge(edge: EdgeType): string {
  if (edge === "open") return " ";
  if (edge === "door") return "+";
  if (edge === "locked") return "x";
  return "|";
}

/**
 * Render the grid as ASCII so an agent can navigate without screenshots.
 * `radius` limits the window to the cells around the player (whole floor when
 * omitted). Unexplored cells render as "?" so fog-of-war stays visible.
 */
export function asciiMap(
  floor: FloorDef,
  player: PlayerState,
  explored: Set<string>,
  radius?: number
): string[] {
  const minX = radius === undefined ? 0 : Math.max(0, player.x - radius);
  const maxX =
    radius === undefined ? floor.width - 1 : Math.min(floor.width - 1, player.x + radius);
  const minY = radius === undefined ? 0 : Math.max(0, player.y - radius);
  const maxY =
    radius === undefined ? floor.height - 1 : Math.min(floor.height - 1, player.y + radius);

  const lines: string[] = [];

  for (let y = minY; y <= maxY; y++) {
    let top = "";
    let mid = "";
    for (let x = minX; x <= maxX; x++) {
      const cell = floor.grid[y]?.[x];
      top += "." + horizontalEdge(cell?.n ?? "wall");
      mid += verticalEdge(cell?.w ?? "wall") + cellGlyph(floor, player, explored, x, y);
    }
    const lastCell = floor.grid[y]?.[maxX];
    top += ".";
    mid += verticalEdge(lastCell?.e ?? "wall");
    lines.push(top, mid);
  }

  let bottom = "";
  for (let x = minX; x <= maxX; x++) {
    const cell = floor.grid[maxY]?.[x];
    bottom += "." + horizontalEdge(cell?.s ?? "wall");
  }
  lines.push(bottom + ".");

  return lines;
}

function cellGlyph(
  floor: FloorDef,
  player: PlayerState,
  explored: Set<string>,
  x: number,
  y: number
): string {
  if (player.x === x && player.y === y) return FACING_GLYPH[player.facing] ?? "^";
  if (!explored.has(`${x},${y}`)) return "?";
  const tile = floor.grid[y]?.[x]?.tile;
  return tile ? TILE_GLYPH[tile] : " ";
}
