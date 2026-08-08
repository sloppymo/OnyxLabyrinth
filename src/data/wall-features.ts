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

export const WALL_FEATURES: readonly WallFeatureSpriteDef[] = [
  {
    id: "lamp-lock",
    name: "Lamp-shaped Lock",
    file: "lamp-lock.png",
    widthFrac: 0.3,
    heightFrac: 0.4,
    anchor: "center",
  },
  {
    id: "bell",
    name: "Tongueless Bell",
    file: "bell.png",
    widthFrac: 0.3,
    heightFrac: 0.55,
    anchor: "top",
  },
  {
    id: "bookshelf-intrusion",
    name: "Impossible Bookshelf",
    file: "bookshelf-intrusion.png",
    widthFrac: 0.4,
    heightFrac: 0.7,
    anchor: "bottom",
  },
  {
    id: "cold-hand",
    name: "Cold-Hand Shrine",
    file: "cold-hand.png",
    widthFrac: 0.28,
    heightFrac: 0.4,
    anchor: "center",
  },
  {
    id: "sweating-iron",
    name: "Sweating Iron Plate",
    file: "sweating-iron.png",
    widthFrac: 0.35,
    heightFrac: 0.45,
    anchor: "center",
  },
  {
    id: "ember-scorch",
    name: "Ember Scorch Mark",
    file: "ember-scorch.png",
    widthFrac: 0.3,
    heightFrac: 0.35,
    anchor: "bottom",
  },
  {
    id: "upward-water",
    name: "Upward-Dripping Water",
    file: "upward-water.png",
    widthFrac: 0.22,
    heightFrac: 0.35,
    anchor: "top",
  },
  {
    id: "writing-plaque",
    name: "Crooked Bronze Plate",
    file: "writing-plaque.png",
    widthFrac: 0.38,
    heightFrac: 0.24,
    anchor: "bottom",
  },
];

export const WALL_FEATURES_BY_ID: Record<string, WallFeatureSpriteDef> = Object.fromEntries(
  WALL_FEATURES.map((f) => [f.id, f])
);

export function wallFeatureUrl(def: WallFeatureSpriteDef): string {
  const base = import.meta.env.BASE_URL ?? "/";
  return `${base}assets/wall-features/${def.file}`;
}
