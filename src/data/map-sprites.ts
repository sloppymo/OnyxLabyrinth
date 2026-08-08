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
  { id: "vesper", name: "Vesper, the Last Cantor", file: "vesper.png", baseSize: 42 },
  // Earlier art for the same character — slate isn't legible at range, kept
  // for its own read (guarded, mask-like) rather than as a discarded draft.
  // Not currently assigned to any NPC; registered so it's available to use.
  { id: "vesper-guarded", name: "Vesper, the Last Cantor (guarded)", file: "vesper-guarded.png", baseSize: 42 },
  // Hot Boi's Tavern interior — proprietor billboard via the per-instance
  // NPC corridor-billboard hook (same mechanism as Vesper). Not yet assigned
  // to any npcs[] entry on a floor; registered for the art pass only.
  { id: "hotboi-npc", name: "Hot Boi", file: "hotboi-npc.png", baseSize: 44 },
  // Central structural pillar for Hot Boi's — visual-only billboard, NOT a
  // solid obstruction. There is no 4-sided solid-interior-cell primitive in
  // this renderer (walls are per-edge, not per-cell-fill), and adding one is
  // out of scope for an art pass. baseSize is deliberately far above any
  // other prop here — it needs to read floor-to-ceiling, not knee-high.
  { id: "hotboi-pillar", name: "Hot Boi's Central Pillar", file: "hotboi-pillar.png", baseSize: 74 },
  // Hot Boi's Tavern furniture. Not yet placed on any floor.
  { id: "hotboi-table", name: "Hot Boi's Table", file: "hotboi-table.png", baseSize: 30 },
  { id: "hotboi-bench", name: "Hot Boi's Bench", file: "hotboi-bench.png", baseSize: 28 },
  { id: "hotboi-keg-stack", name: "Hot Boi's Keg Stack", file: "hotboi-keg-stack.png", baseSize: 32 },
  { id: "hotboi-kitchen-stove", name: "Hot Boi's Kitchen Stove", file: "hotboi-kitchen-stove.png", baseSize: 34 },
  { id: "hotboi-kitchen-prep", name: "Hot Boi's Prep Table", file: "hotboi-kitchen-prep.png", baseSize: 32 },
];

export const MAP_SPRITES_BY_ID: Record<string, MapSpriteDef> = Object.fromEntries(
  MAP_SPRITES.map((s) => [s.id, s])
);

export function mapSpriteUrl(def: MapSpriteDef): string {
  const base = import.meta.env.BASE_URL ?? "/";
  return `${base}assets/map-sprites/${def.file}`;
}
