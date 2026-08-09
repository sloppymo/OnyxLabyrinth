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
  /** Optional presentation-only warm light cast around a placed billboard. */
  light?: {
    color: string;
    radiusScale: number;
    intensity: number;
  };
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
  { id: "hotboi-bar-clutter", name: "Bar Clutter", file: "hotboi-bar-clutter.png", baseSize: 22 },
  { id: "hotboi-kitchen-clutter", name: "Kitchen Clutter", file: "hotboi-kitchen-clutter.png", baseSize: 22 },
  // The Camp — Floor 1's large false-outdoor refuge. Hero compositions are
  // intentionally much larger than ordinary corridor props; the supporting
  // and ambient scenes share the same PixelLab production family.
  { id: "camp-tent-large", name: "Camp Pavilion", file: "camp-tent-large.png", baseSize: 78 },
  { id: "camp-wagon", name: "Camp Supply Wagon", file: "camp-wagon.png", baseSize: 64 },
  {
    id: "camp-fire", name: "Camp Communal Fire", file: "camp-fire.png", baseSize: 42,
    light: { color: "255, 166, 76", radiusScale: 2.8, intensity: 0.26 },
  },
  { id: "camp-dead-tree", name: "Camp Dead Tree", file: "camp-dead-tree.png", baseSize: 78 },
  { id: "camp-supply-stack", name: "Camp Supply Mound", file: "camp-supply-stack.png", baseSize: 54 },
  { id: "camp-smith-work-area", name: "Camp Smith Work Area", file: "camp-smith-work-area.png", baseSize: 64 },
  { id: "camp-map-table", name: "Camp Expedition Table", file: "camp-map-table.png", baseSize: 46 },
  { id: "camp-palisade-checkpoint", name: "Camp Palisade Checkpoint", file: "camp-palisade-checkpoint.png", baseSize: 68 },
  { id: "camp-armor-rack", name: "Camp Armor Stand", file: "camp-armor-rack.png", baseSize: 42 },
  { id: "camp-barrel-stack", name: "Camp Barrel Stack", file: "camp-barrel-stack.png", baseSize: 42 },
  { id: "camp-bedrolls", name: "Camp Bedrolls", file: "camp-bedrolls.png", baseSize: 34 },
  { id: "camp-cookpot", name: "Camp Cookpot", file: "camp-cookpot.png", baseSize: 38 },
  { id: "camp-crate-stack", name: "Camp Crate Stack", file: "camp-crate-stack.png", baseSize: 42 },
  { id: "camp-gear-pile", name: "Camp Gear Pile", file: "camp-gear-pile.png", baseSize: 38 },
  { id: "camp-grindstone", name: "Camp Grindstone", file: "camp-grindstone.png", baseSize: 36 },
  { id: "camp-handcart", name: "Camp Handcart", file: "camp-handcart.png", baseSize: 42 },
  {
    id: "camp-lantern-post", name: "Camp Lantern Post", file: "camp-lantern-post.png", baseSize: 58,
    light: { color: "255, 191, 102", radiusScale: 2.15, intensity: 0.19 },
  },
  { id: "camp-rough-fence", name: "Camp Rough Fence", file: "camp-rough-fence.png", baseSize: 34 },
  { id: "camp-tent-small", name: "Camp Sleeping Tent", file: "camp-tent-small.png", baseSize: 54 },
  { id: "camp-weapon-rack", name: "Camp Weapon Rack", file: "camp-weapon-rack.png", baseSize: 46 },
  { id: "camp-adventurer-cards", name: "Adventurers Playing Cards", file: "camp-adventurer-cards.png", baseSize: 42 },
  { id: "camp-adventurer-map-study", name: "Adventurers Studying a Map", file: "camp-adventurer-map-study.png", baseSize: 44 },
  { id: "camp-adventurer-shield-repair", name: "Adventurer Repairing a Shield", file: "camp-adventurer-shield-repair.png", baseSize: 42 },
  { id: "camp-adventurer-sleeping", name: "Sleeping Adventurer", file: "camp-adventurer-sleeping.png", baseSize: 34 },
  { id: "camp-adventurer-stew", name: "Adventurer Tending Stew", file: "camp-adventurer-stew.png", baseSize: 42 },
  { id: "camp-adventurer-watch", name: "Camp Watch Keeper", file: "camp-adventurer-watch.png", baseSize: 48 },
  { id: "camp-adventurer-wounded", name: "Wounded Adventurer", file: "camp-adventurer-wounded.png", baseSize: 42 },
  // Hot Boi's tavern (Floor 1 hub) — an earlier, simpler prop set from
  // before the dedicated room's own asset pass existed. Kept registered
  // (not currently placed) in case the "tavern-sign" landmark is useful
  // pointing toward the room from the main corridor.
  { id: "tavern-door", name: "Tavern Door", file: "tavern-door.png", baseSize: 40 },
  { id: "tavern-sign", name: "Tavern Sign", file: "tavern-sign.png", baseSize: 30 },
  // Church of Saint Namanda interior furniture — humble, sparse per the
  // room's restraint brief (a few pieces implying a whole church, not rows
  // of them).
  { id: "namanda-font", name: "Namanda's Font", file: "namanda-font.png", baseSize: 30 },
  { id: "namanda-bench", name: "Namanda's Bench", file: "namanda-bench.png", baseSize: 18 },
  { id: "namanda-kneeling-rail", name: "Kneeling Rail", file: "namanda-kneeling-rail.png", baseSize: 20 },
  { id: "isobel-npc", name: "Isobel", file: "isobel-npc.svg", baseSize: 42 },
];

export const MAP_SPRITES_BY_ID: Record<string, MapSpriteDef> = Object.fromEntries(
  MAP_SPRITES.map((s) => [s.id, s])
);

export function mapSpriteUrl(def: MapSpriteDef): string {
  const base = import.meta.env.BASE_URL ?? "/";
  return `${base}assets/map-sprites/${def.file}`;
}
