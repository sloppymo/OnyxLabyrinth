/**
 * Presentation recipes for baked combat arenas.
 *
 * The renderer stays theme-agnostic: theme ids are resolved here into a small
 * vocabulary of visual treatments. 256x224 is intentional — the 768x672
 * combat surface is an exact 3x scale of the SNES-native raster.
 */

export const COMBAT_BACKDROP_NATIVE_W = 256;
export const COMBAT_BACKDROP_NATIVE_H = 224;

export type ArenaWaterStyle = "none" | "sluice";
export type ArenaLandmarkStyle = "none" | "f1-sluice";
export type ArenaLightingStyle = "none" | "f1-flooded";
export type ArenaAmbientStyle = "none" | "f1-flooded";

export interface CombatBackdropRecipe {
  nativeWidth: number;
  nativeHeight: number;
  depthBands: number;
  palette: readonly string[] | null;
  water: ArenaWaterStyle;
  neutralizeBakedWater: boolean;
  landmark: ArenaLandmarkStyle;
  lighting: ArenaLightingStyle;
  ambient: ArenaAmbientStyle;
}

const DEFAULT_RECIPE: CombatBackdropRecipe = {
  nativeWidth: COMBAT_BACKDROP_NATIVE_W,
  nativeHeight: COMBAT_BACKDROP_NATIVE_H,
  depthBands: 7,
  palette: null,
  water: "none",
  neutralizeBakedWater: false,
  landmark: "none",
  lighting: "none",
  ambient: "none",
};

/** Fixed, mossy dungeon palette: charcoal stone, sickly water, and torch gold. */
export const F1_BATTLEFIELD_PALETTE = [
  "#080806", "#0e0d0a", "#14150f", "#191c15", "#20251c", "#293126",
  "#323c2e", "#3b4937", "#465541", "#52634b", "#62745a", "#75866a",
  "#1a2a21", "#20382a", "#294b34", "#315e3d", "#3b7149", "#4d8258",
  "#503a21", "#74502a", "#a16e31", "#d59b3c", "#f2c75c", "#ffe48a",
  "#8c3030", "#c24b3d", "#d8d0af", "#f0ead2",
] as const;

const F1_RECIPE: CombatBackdropRecipe = {
  ...DEFAULT_RECIPE,
  depthBands: 8,
  palette: F1_BATTLEFIELD_PALETTE,
  water: "sluice",
  neutralizeBakedWater: true,
  landmark: "f1-sluice",
  lighting: "f1-flooded",
  ambient: "f1-flooded",
};

export function combatBackdropRecipeForTheme(theme: string): CombatBackdropRecipe {
  return theme === "f1" ? F1_RECIPE : DEFAULT_RECIPE;
}

export function combatBackdropRecipeForId(backdropId?: string | null): CombatBackdropRecipe {
  if (!backdropId?.startsWith("theme:")) return DEFAULT_RECIPE;
  return combatBackdropRecipeForTheme(backdropId.slice("theme:".length));
}
