import type { CombatState } from "../game/combat-types";

export type TorchSide = "left" | "right";

export const CARD_TRIAL_TORCH_SIDE: TorchSide = "left";

/** Design-pixel sconce X on the Card Trial plate. */
export const CARD_TRIAL_SCONCE_X = Math.round(0.14 * 768);

export interface RoomKeyLightInput {
  x: number;
  y: number;
  drawSize: number;
  opacity: number;
  visible: boolean;
  torchSide: TorchSide;
  sconceX: number;
}

export interface RoomLightRect {
  x: number;
  y: number;
  width: number;
  height: number;
  color: "#f0d2a8" | "#a8b8c8" | "#ffe8c0";
  alpha: number;
  blend: "multiply" | "add";
}

export interface RoomKeyLight {
  warmRect: RoomLightRect;
  coolRect: RoomLightRect;
  rimEdge: RoomLightRect;
  shadowDx: number;
  shadowScaleX: number;
  visible: boolean;
  /** Actor fade, kept separate from the constant overlay strengths. */
  alpha: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function sign(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

export function shouldApplyRoomLight(state: CombatState, enabled: boolean): boolean {
  return enabled && state.partyFormation?.kind === "card-trial-rows";
}

export function roomKeyLightForActor(input: RoomKeyLightInput): RoomKeyLight {
  const size = input.drawSize;
  const originX = input.x - size / 2;
  const originY = input.y - size / 2;
  const half = size / 2;
  const shown = input.visible && input.opacity > 0;
  const bodyAlpha = shown ? clamp01(input.opacity) : 0;
  const leftIsWarm = input.torchSide === "left";
  const warmX = leftIsWarm ? originX : originX + half;
  const coolX = leftIsWarm ? originX + half : originX;
  const rimX = leftIsWarm ? originX : originX + size - 1;

  return {
    warmRect: {
      x: warmX,
      y: originY,
      width: half,
      height: size,
      color: "#f0d2a8",
      alpha: shown ? 0.2 : 0,
      blend: "multiply",
    },
    coolRect: {
      x: coolX,
      y: originY,
      width: half,
      height: size,
      color: "#a8b8c8",
      alpha: shown ? 0.14 : 0,
      blend: "multiply",
    },
    rimEdge: {
      x: rimX,
      y: originY,
      width: 1,
      height: size,
      color: "#ffe8c0",
      alpha: shown ? 0.3 : 0,
      blend: "add",
    },
    shadowDx: sign(input.x - input.sconceX) * 0.08 * size,
    shadowScaleX: 1.25,
    visible: shown,
    alpha: bodyAlpha,
  };
}

export function contactShadowPlacement(
  baseX: number,
  baseWidth: number,
  recipe: RoomKeyLight | null
): { x: number; width: number } {
  if (!recipe || !recipe.visible) return { x: baseX, width: baseWidth };
  return { x: baseX + recipe.shadowDx, width: baseWidth * recipe.shadowScaleX };
}

export function roomLightRecipeOrNull(
  state: CombatState,
  enabled: boolean,
  input: RoomKeyLightInput
): RoomKeyLight | null {
  if (!shouldApplyRoomLight(state, enabled)) return null;
  return roomKeyLightForActor(input);
}

/** Pure URL-option parser. Callers provide the environment's search string. */
export function resolveRoomLightEnabled(search = ""): boolean {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return q.get("roomLight") !== "0";
}

/** Pure option normalizer used by both combat painters. */
export function normalizeCombatStageOpts<T extends { roomLightEnabled?: boolean }>(
  opts: T,
  search = ""
): T & { roomLightEnabled: boolean } {
  return {
    ...opts,
    roomLightEnabled: opts.roomLightEnabled ?? resolveRoomLightEnabled(search),
  };
}
