/**
 * Wall-embedded environmental decals — switches, plaques, reliefs, locks,
 * vents. Distinct from `data/map-sprites.ts`: those billboard-float in front
 * of the corridor, these composite onto one specific wall face. Placed via
 * `FloorDef.wallFeatures` (`{x, y, dir, spriteId}`), rendered by the
 * wall-feature helpers in `src/engine/render-math.ts`.
 */

export interface WallFeatureSpriteDef {
  id: string;
  name: string;
  /** Filename under public/assets/wall-features/ */
  file: string;
  /** Fraction (0-1] of the wall face's width the decal occupies, centered. */
  widthFrac: number;
  /** Fraction (0-1] of the wall face's height the decal occupies. */
  heightFrac: number;
  /** Vertical placement of the decal within the wall face. */
  anchor: "center" | "bottom" | "top";
}

export const WALL_FEATURES: readonly WallFeatureSpriteDef[] = [];

export const WALL_FEATURES_BY_ID: Record<string, WallFeatureSpriteDef> = Object.fromEntries(
  WALL_FEATURES.map((f) => [f.id, f])
);

export function wallFeatureUrl(def: WallFeatureSpriteDef): string {
  const base = import.meta.env.BASE_URL ?? "/";
  return `${base}assets/wall-features/${def.file}`;
}
