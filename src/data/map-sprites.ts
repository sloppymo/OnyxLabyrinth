/**
 * Static dungeon decor sprites (non-interactive). Placed via floor map editor.
 */

export interface MapSpriteDef {
  id: string;
  name: string;
  /** Filename under public/assets/map-sprites/ */
  file: string;
  /** Drawn size in world-ish pixels at depth 0 (scaled by distance). */
  baseSize: number;
}

export const MAP_SPRITES: readonly MapSpriteDef[] = [
  { id: "torch", name: "Torch", file: "torch.png", baseSize: 28 },
  { id: "crate", name: "Crate", file: "crate.png", baseSize: 32 },
  { id: "bones", name: "Bones", file: "bones.png", baseSize: 30 },
  { id: "barrel", name: "Barrel", file: "barrel.png", baseSize: 32 },
];

export const MAP_SPRITES_BY_ID: Record<string, MapSpriteDef> = Object.fromEntries(
  MAP_SPRITES.map((s) => [s.id, s])
);

export function mapSpriteUrl(def: MapSpriteDef): string {
  const base = import.meta.env.BASE_URL ?? "/";
  return `${base}assets/map-sprites/${def.file}`;
}
