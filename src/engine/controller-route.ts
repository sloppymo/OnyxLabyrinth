import type { GameMode } from "../types";

/**
 * Overlay ids live on `UiStack`. Base ids come from `resolveControllerRoute`.
 * A new overlay id must be added here so snapshot/route consumers stay typed.
 */
export type OverlayRouteKind =
  | "perk"
  | "save"
  | "spell"
  | "npc"
  | "tavern"
  | "namanda"
  | "action_ring"
  | "trap"
  | "dialog";

export type BaseRouteKind =
  | "combat"
  | "card_trial"
  | "town"
  | "camp"
  | "game_over"
  | "prologue"
  | "ending"
  | "title"
  | "arena"
  | "dungeon"
  | "none";

export type ControllerRouteKind = OverlayRouteKind | BaseRouteKind;

/** Base-screen flags. Overlay ownership lives on `UiStack`, not here. */
export interface ControllerRouteContext {
  mode: GameMode;
  hasCombat: boolean;
  hasCardTrial: boolean;
  hasTown: boolean;
  hasCamp: boolean;
  hasGameOver: boolean;
  hasPrologue: boolean;
  hasEnding: boolean;
  hasTitle: boolean;
}

/** Pick the base-screen input consumer. Overlays are not represented here. */
export function resolveControllerRoute(ctx: ControllerRouteContext): BaseRouteKind {
  if (ctx.mode === "title" && ctx.hasEnding) return "ending";
  // Card Trial may paint with mode "combat" (stage) or "arena" (lobby).
  // It must own input before Classic combat/Arena.
  if (ctx.hasCardTrial) return "card_trial";
  if (ctx.mode === "combat" && ctx.hasCombat) return "combat";
  if (ctx.mode === "town" && ctx.hasTown) return "town";
  if (ctx.mode === "camp" && ctx.hasCamp) return "camp";
  if (ctx.mode === "game_over" && ctx.hasGameOver) return "game_over";
  if (ctx.mode === "title" && ctx.hasPrologue) return "prologue";
  if (ctx.mode === "title" && ctx.hasTitle) return "title";
  if (ctx.mode === "arena") return "arena";
  if (ctx.mode === "dungeon") return "dungeon";
  return "none";
}

/** Compile-time exhaustiveness for base-route dispatch. Missing cases fail tsc. */
export function assertUnhandledRoute(route: never): never {
  throw new Error(`unhandled controller route: ${String(route)}`);
}
