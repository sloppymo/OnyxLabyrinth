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
  /** Optional deterministic in-engine lettering composited over the art. */
  overlayText?: readonly string[];
  /** East-facing wall samples reverse the source texture horizontally. */
  overlayTextMirrored?: boolean;
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
  {
    id: "isobels-sign",
    name: "Isobel's ISO-SPELLS sign",
    file: "isobels-sign-pixellab.png",
    widthFrac: 0.58,
    heightFrac: 0.30,
    anchor: "center",
    overlayText: ["ISOBEL'S", "ISO-SPELLS"],
    overlayTextMirrored: true,
  },
  {
    id: "isobels-shelves",
    name: "Isobel's Spell Shelves",
    file: "isobels-shelf-pixellab.png",
    widthFrac: 0.82,
    heightFrac: 0.62,
    anchor: "bottom",
  },
  {
    id: "isobel-wall-charms",
    name: "Isobel's Hanging Charms",
    file: "isobel-wall-charms-pixellab.png",
    widthFrac: 0.44,
    heightFrac: 0.58,
    anchor: "center",
  },
  {
    id: "isobel-spellbook-stack",
    name: "Isobel's Spellbook Stack",
    file: "isobel-spellbook-stack-pixellab.png",
    widthFrac: 0.52,
    heightFrac: 0.58,
    anchor: "bottom",
  },
  // Hot Boi's Tavern interior — near-full-face bar composition (counter +
  // back-bar shelving baked as one decal per north-wall cell). widthFrac/
  // heightFrac verified empirically against a real F1 wall face before any
  // of these were generated (see art/pixellab/hot-bois-generation-log.md).
  // Not yet placed on any floor — registered for the art pass only, same
  // pattern as `vesper-guarded` in map-sprites.ts.
  {
    id: "hotboi-bar-left",
    name: "Hot Boi's Bar (West)",
    file: "hotboi-bar-left.png",
    widthFrac: 0.98,
    heightFrac: 0.95,
    anchor: "bottom",
  },
  {
    id: "hotboi-bar-center",
    name: "Hot Boi's Bar (Center)",
    file: "hotboi-bar-center.png",
    widthFrac: 0.98,
    heightFrac: 0.95,
    anchor: "bottom",
  },
  {
    id: "hotboi-bar-right",
    name: "Hot Boi's Bar (East)",
    file: "hotboi-bar-right.png",
    widthFrac: 0.98,
    heightFrac: 0.95,
    anchor: "bottom",
  },
  {
    id: "hotboi-hearth",
    name: "Hot Boi's Hearth",
    file: "hotboi-hearth.png",
    widthFrac: 0.98,
    heightFrac: 0.95,
    anchor: "bottom",
  },
  // Deliberately varied silhouettes/anchors vs. F1's wall-decal batch (which
  // drew a "C" for centered-rectangle repetition) — irregular collage,
  // top-mounted, and narrow-vertical, not three more boxes at eye height.
  {
    id: "hotboi-notice-board",
    name: "Hot Boi's Notices",
    file: "hotboi-notice-board.png",
    widthFrac: 0.4,
    heightFrac: 0.5,
    anchor: "bottom",
  },
  {
    id: "hotboi-monster-trophy",
    name: "Mounted Trophy",
    file: "hotboi-monster-trophy.png",
    widthFrac: 0.35,
    heightFrac: 0.45,
    anchor: "top",
  },
  {
    id: "hotboi-key-rack",
    name: "Hot Boi's Key Rack",
    file: "hotboi-key-rack.png",
    widthFrac: 0.18,
    heightFrac: 0.5,
    anchor: "center",
  },
  {
    id: "hotboi-kitchen-shelves",
    name: "Hot Boi's Kitchen Pantry",
    file: "hotboi-kitchen-shelves.png",
    widthFrac: 0.98,
    heightFrac: 0.95,
    anchor: "bottom",
  },
  // Church of Saint Namanda interior — apse backdrop (near-full-face, same
  // technique as Hot Boi's bar composition) plus a sparser votive wall and a
  // tall narrow reliquary niche, deliberately not another centered rectangle.
  {
    id: "namanda-altar",
    name: "Namanda's Altar",
    file: "namanda-altar.png",
    widthFrac: 0.95,
    heightFrac: 0.95,
    anchor: "bottom",
  },
  {
    id: "namanda-relief",
    name: "Namanda's Relief",
    file: "namanda-relief.png",
    widthFrac: 0.95,
    heightFrac: 0.95,
    anchor: "bottom",
  },
  {
    id: "namanda-votive-wall",
    name: "Votive Candle Wall",
    file: "namanda-votive-wall.png",
    widthFrac: 0.55,
    heightFrac: 0.6,
    anchor: "center",
  },
  {
    id: "namanda-reliquary-niche",
    name: "Reliquary Niche",
    file: "namanda-reliquary-niche.png",
    widthFrac: 0.22,
    heightFrac: 0.75,
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
