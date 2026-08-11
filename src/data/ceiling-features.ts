/**
 * Ceiling surface features — artwork that belongs to the ceiling PLANE
 * itself (grates, cracks, beams, hatches) rather than hanging into open
 * space. Distinct from `data/ceiling-sprites.ts`: those billboard-float
 * downward from an attachment point; these fully replace the sampled
 * ceiling texture for one grid cell, the same way a wall/floor tileset
 * texture is sampled per cell.
 *
 * Each entry's art must be authored at the same pixel dimensions as the
 * floor's ceiling.png (256x256 for the campaign tilesets) — the per-pixel
 * ceiling cast in `src/engine/renderer.ts` maps a cell's local (0,1) UV
 * across the full texture image, so a feature is really an alternate
 * "ceiling tile" for that one cell, not a decal composited over it.
 * Placed via `FloorDef.ceilingFeatures` (one per cell — a cell with two
 * entries is a validation error), rendered by swapping the cell's
 * `TextureSet.ceilingData` in `resolveFloorTextures`.
 */

export interface CeilingFeatureDef {
  id: string;
  name: string;
  /** Filename under public/assets/ceiling-features/ */
  file: string;
}

export const CEILING_FEATURES: readonly CeilingFeatureDef[] = [
  { id: "camp-sky-star-a", name: "Camp False-Sky Star A", file: "camp-sky-star-a.png" },
  { id: "camp-sky-star-b", name: "Camp False-Sky Star B", file: "camp-sky-star-b.png" },
  { id: "f1-ceiling-grate", name: "Iron Ceiling Grate", file: "f1-ceiling-grate.png" },
  { id: "f1-ceiling-crack-roots", name: "Cracked Ceiling with Roots", file: "f1-ceiling-crack-roots.png" },
  { id: "f1-ceiling-beam", name: "Heavy Wooden Cross-Beam", file: "f1-ceiling-beam.png" },
  { id: "f1-ceiling-chain-plate", name: "Rusted Chain Attachment Plate", file: "f1-ceiling-chain-plate.png" },
  { id: "f1-ceiling-drain", name: "Dark Circular Drain", file: "f1-ceiling-drain.png" },
  { id: "f1-ceiling-hole", name: "Broken Masonry Hole", file: "f1-ceiling-hole.png" },
  { id: "f1-ceiling-water-stain", name: "Water-Damaged Ceiling Patch", file: "f1-ceiling-water-stain.png" },
  { id: "f1-ceiling-namanda-mark", name: "Namanda Chapel Relief", file: "f1-ceiling-namanda-mark.png" },
  { id: "isobel-astral-medallion", name: "Iso-Spells Astral Medallion", file: "isobel-astral-medallion.png" },
  // The Sunken Processional (Level 2 "descent" kit).
  { id: "descent-ceiling-shaft", name: "Square Hoist Shaft", file: "descent-ceiling-shaft.png" },
  { id: "descent-ceiling-medallion", name: "Bronze Ring Medallion", file: "descent-ceiling-medallion.png" },
];

export const CEILING_FEATURES_BY_ID: Record<string, CeilingFeatureDef> = Object.fromEntries(
  CEILING_FEATURES.map((f) => [f.id, f])
);

export function ceilingFeatureUrl(def: CeilingFeatureDef): string {
  const base = import.meta.env.BASE_URL ?? "/";
  return `${base}assets/ceiling-features/${def.file}`;
}
