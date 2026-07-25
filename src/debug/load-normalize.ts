import type { GameMode } from "../types";

/**
 * Modes that cannot be resumed after load (no controller is reconstructed).
 * Shared by the title-screen Continue path and debug `loadSave()`.
 */
export function normalizeLoadedMode(mode: GameMode): GameMode {
  if (mode === "title" || mode === "party_creation" || mode === "arena") {
    return "town";
  }
  return mode;
}
