/**
 * Ceiling-hanging decor sprites (visual only). Physical objects suspended
 * downward from the dungeon ceiling — chains, cages, censers, roots, lanterns.
 *
 * Distinct from `data/map-sprites.ts`: those billboard-float with their base
 * resting on the floor. These billboard-float with their TOP pinned to the
 * ceiling line, so the object hangs down into the corridor instead of sitting
 * on it. Placed via `FloorDef.ceilingSprites`, rendered by
 * `drawCeilingSprites` in `src/engine/renderer.ts`.
 */

export interface CeilingSpriteDef {
  id: string;
  name: string;
  /** Filename under public/assets/ceiling-sprites/ */
  file: string;
  /** Drawn size in world-ish pixels at depth 0 (scaled by distance), same
   *  convention as MapSpriteDef.baseSize. */
  baseSize: number;
}

export const CEILING_SPRITES: readonly CeilingSpriteDef[] = [
  { id: "f1-chain-hook", name: "Heavy Chain and Hook", file: "f1-chain-hook.png", baseSize: 44 },
  { id: "f1-chain-long", name: "Long Rusted Chain", file: "f1-chain-long.png", baseSize: 46 },
  { id: "f1-chain-broken", name: "Short Broken Chain Pair", file: "f1-chain-broken.png", baseSize: 30 },
  { id: "f1-cage", name: "Hanging Iron Cage", file: "f1-cage.png", baseSize: 48 },
  { id: "f1-censer", name: "Hanging Censer", file: "f1-censer.png", baseSize: 34 },
  { id: "f1-bell-cracked", name: "Cracked Hanging Bell", file: "f1-bell-cracked.png", baseSize: 36 },
  { id: "f1-root-curtain", name: "Root and Vine Curtain", file: "f1-root-curtain.png", baseSize: 46 },
  { id: "f1-root-bundle", name: "Thick Root Bundle", file: "f1-root-bundle.png", baseSize: 40 },
  { id: "f1-lantern-hanging", name: "Hanging Lantern", file: "f1-lantern-hanging.png", baseSize: 32 },
  { id: "f1-forge-counterweight", name: "Forge Chain Counterweight", file: "f1-forge-counterweight.png", baseSize: 44 },
];

export const CEILING_SPRITES_BY_ID: Record<string, CeilingSpriteDef> = Object.fromEntries(
  CEILING_SPRITES.map((s) => [s.id, s])
);

export function ceilingSpriteUrl(def: CeilingSpriteDef): string {
  const base = import.meta.env.BASE_URL ?? "/";
  return `${base}assets/ceiling-sprites/${def.file}`;
}
