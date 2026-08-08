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
  { id: "chest-unlocked", name: "Unlocked Chest", file: "chest-unlocked.png", baseSize: 40 },
  // Corridor feature props, built by `scripts/generate-maze-props.mjs`. These
  // ids are the ones `data/maze-props.ts` looks up, so registering them here is
  // what swaps a feature from its text glyph to art — no renderer change.
  // `baseSize` is tuned against how much of the 32x32 cell each prop fills, so
  // a stele reads as taller than a chest without either one dwarfing the other.
  { id: "chest-closed", name: "Closed Chest", file: "chest-closed.png", baseSize: 34 },
  { id: "chest-open", name: "Opened Chest", file: "chest-open.png", baseSize: 34 },
  { id: "cistern-basin", name: "Cistern Basin", file: "cistern-basin.png", baseSize: 30 },
  { id: "antimagic-ward", name: "Antimagic Ward", file: "antimagic-ward.png", baseSize: 38 },
  { id: "darkness-idol", name: "Darkness Idol", file: "darkness-idol.png", baseSize: 34 },
  { id: "teleporter-disc", name: "Teleporter Disc", file: "teleporter-disc.png", baseSize: 40 },
  { id: "anvil-altar", name: "Anvil Altar", file: "anvil-altar.png", baseSize: 34 },
  { id: "forge-guardian-statue", name: "Forge Guardian Statue", file: "forge-guardian-statue.png", baseSize: 40 },
  { id: "choir-statue", name: "Stone Chorister Statue", file: "choir-statue.png", baseSize: 38 },
  { id: "cantor-lectern", name: "Cantor's Lectern", file: "cantor-lectern.png", baseSize: 32 },
];

export const MAP_SPRITES_BY_ID: Record<string, MapSpriteDef> = Object.fromEntries(
  MAP_SPRITES.map((s) => [s.id, s])
);

export function mapSpriteUrl(def: MapSpriteDef): string {
  const base = import.meta.env.BASE_URL ?? "/";
  return `${base}assets/map-sprites/${def.file}`;
}
