/**
 * Full-face door-panel overrides — one-off "hero door" landmarks, distinct
 * from `wall-features.ts`'s small windowed decals. A door feature replaces
 * the entire generic theme door texture at one specific `door`/`locked`/
 * `barred` edge, the same substitution pattern the stairs panel uses
 * (`LoadedTileset.stairs`), just keyed by coordinate instead of by theme
 * since these are singular landmarks, not per-floor defaults.
 */

export interface DoorFeatureSpriteDef {
  id: string;
  name: string;
  /** Filename under public/assets/door-features/. Rendered at full wall-face size, like stairs.png. */
  file: string;
}

export const DOOR_FEATURES: readonly DoorFeatureSpriteDef[] = [
  {
    id: "hot-bois-tavern-door",
    name: "Hot Boi's Tavern Door",
    file: "hot-bois-tavern-door.png",
  },
  {
    id: "namanda-church-door",
    name: "Church of Saint Namanda Door",
    file: "namanda-church-door.png",
  },
];

export const DOOR_FEATURES_BY_ID: Record<string, DoorFeatureSpriteDef> = Object.fromEntries(
  DOOR_FEATURES.map((f) => [f.id, f])
);

export function doorFeatureUrl(def: DoorFeatureSpriteDef): string {
  const base = import.meta.env.BASE_URL ?? "/";
  return `${base}assets/door-features/${def.file}`;
}
