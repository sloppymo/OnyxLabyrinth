/**
 * Tile feature -> corridor prop sprite.
 *
 * The corridor draws a feature as a billboarded PNG when one of these ids
 * resolves in `MAP_SPRITES`, and falls back to the text glyph when none does.
 * That makes shipping a prop a two-line change with no code edit:
 *
 *   1. drop the cleaned PNG in `public/assets/map-sprites/`
 *   2. add its `MAP_SPRITES` entry in `src/data/map-sprites.ts`
 *
 * Each feature lists ids in **preference order**, so this table doubles as the
 * work queue: name the ideal art first and the acceptable stand-in after it.
 * Listing art that does not exist yet is deliberately safe — the lookup misses
 * and the next candidate (or the glyph) takes over. Ids match the asset map in
 * `docs/MAZE-EVENT-SPRITE-PROMPT.md`.
 */
import type { TileFeature } from "../types";

/** Candidate props for features in their default (untouched) state. */
export const FEATURE_PROP_SPRITES: Partial<Record<TileFeature, readonly string[]>> = {
  // `chest-unlocked` is an open chest heaped with coin — it reads as "there is
  // treasure here", which is why it stands in for an unlooted chest until the
  // purpose-made closed chest exists. It must never mark an emptied one.
  treasure: ["chest-closed", "chest-unlocked"],
  teleporter: ["teleporter-disc"],
  antimagic: ["antimagic-ward"],
  darkness: ["darkness-idol"],
  water: ["cistern-basin"],
};

/**
 * Candidates for a chest that has already been emptied — the landmark that
 * makes a cleared wing read as cleared. Deliberately NOT `chest-unlocked`:
 * that art still shows gold, so using it here would advertise loot the party
 * already took. Until this art ships, a looted chest draws nothing at all,
 * which is exactly the behaviour that shipped before.
 */
export const LOOTED_TREASURE_SPRITES: readonly string[] = ["chest-open", "chest-empty"];

/** Extra state a feature can be in that changes which prop it draws. */
export interface FeaturePropState {
  looted?: boolean;
}

/**
 * Sprite ids this feature may draw, best first. Empty when the feature has no
 * prop assigned and should fall back to its glyph.
 */
export function featurePropSpriteIds(
  feature: TileFeature,
  state: FeaturePropState = {}
): readonly string[] {
  if (feature === "treasure" && state.looted) return LOOTED_TREASURE_SPRITES;
  return FEATURE_PROP_SPRITES[feature] ?? [];
}
