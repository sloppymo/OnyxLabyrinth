import type { GameMode } from "../types";

/** Priority-ordered controller consumer for gamepad/keyboard routing. */
export type ControllerRouteKind =
  | "perk"
  | "combat"
  | "save"
  | "spell"
  | "npc"
  | "action_ring"
  | "town"
  | "camp"
  | "game_over"
  | "party_creation"
  | "title"
  | "arena"
  | "trap"
  | "dungeon"
  | "none";

export interface ControllerRouteContext {
  mode: GameMode;
  hasPerkSelect: boolean;
  hasCombat: boolean;
  hasSave: boolean;
  hasSpellMenu: boolean;
  hasNpc: boolean;
  hasActionRing: boolean;
  hasTown: boolean;
  hasCamp: boolean;
  hasGameOver: boolean;
  hasPartyCreation: boolean;
  hasTitle: boolean;
  hasPendingTrap: boolean;
  hasTrapPrompt: boolean;
}

/** Pick the highest-priority input consumer for the current session flags. */
export function resolveControllerRoute(ctx: ControllerRouteContext): ControllerRouteKind {
  if (ctx.mode === "title" && ctx.hasPerkSelect) return "perk";
  if (ctx.mode === "combat" && ctx.hasCombat) return "combat";
  if (ctx.mode === "title" && ctx.hasSave) return "save";
  if (ctx.mode === "title" && ctx.hasSpellMenu) return "spell";
  if (ctx.mode === "title" && ctx.hasNpc) return "npc";
  if (ctx.mode === "title" && ctx.hasActionRing) return "action_ring";
  if (ctx.mode === "town" && ctx.hasTown) return "town";
  if (ctx.mode === "camp" && ctx.hasCamp) return "camp";
  if (ctx.mode === "game_over" && ctx.hasGameOver) return "game_over";
  if (ctx.mode === "party_creation" && ctx.hasPartyCreation) return "party_creation";
  if (ctx.mode === "title" && ctx.hasTitle) return "title";
  if (ctx.mode === "arena") return "arena";
  if (ctx.mode === "dungeon" && ctx.hasPendingTrap && ctx.hasTrapPrompt) return "trap";
  if (ctx.mode === "dungeon") return "dungeon";
  return "none";
}
