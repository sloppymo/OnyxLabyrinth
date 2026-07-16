/**
 * Dungeon contextual prompt resolution (tranche B).
 *
 * Prompts are *state* — recomputed from the world every frame — never
 * event-queued and never cleared on player input. Messages (shell.setMessage)
 * are the opposite.
 *
 * v1 lexicon: only verbs that have a real binding. Passable doors need no
 * prompt (walking through is the verb). Ahead-tile flavor (chest/npc/stairs)
 * is visible in the corridor art; binding those to invent keys was deferred.
 */

import type { GameState } from "../types";
import { edgeInDirection, inBounds } from "../game/dungeon";

export type InputKind = "keyboard" | "gamepad";

export interface ContextualPrompt {
  /** Face button / key glyph shown to the player (A, U, …). */
  glyph: string;
  /** Short verb (“Unlock”, …). */
  verb: string;
  /** Stable id for input routing. */
  action: "unlock";
}

/** Resolve the single contextual interact verb, or null if none. */
export function resolveContextualPrompt(
  state: GameState,
  inputKind: InputKind
): ContextualPrompt | null {
  if (state.pendingTrap) return null;

  const { floor, player } = state;
  if (!inBounds(floor.grid, player.x, player.y)) return null;

  const cell = floor.grid[player.y][player.x];
  const edge = edgeInDirection(cell, player.facing);

  if (edge === "locked") {
    return {
      glyph: inputKind === "keyboard" ? "U" : "A",
      verb: "Unlock",
      action: "unlock",
    };
  }

  return null;
}

export function formatContextualPrompt(prompt: ContextualPrompt): string {
  return `${prompt.glyph} ${prompt.verb}`;
}
