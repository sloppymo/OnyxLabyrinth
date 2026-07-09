import {
  ENEMY_SPRITE_DEFS,
  spriteStateToStripKey,
  type EnemySpriteDef,
  type EnemySpriteState,
  type SpriteStrip,
} from "./sprite-manifest";

export type EnemyAnimationState =
  | "idle"
  | "attacking"
  | "hit"
  | "defeated";

export interface EnemySpriteBundle {
  def: EnemySpriteDef;
  images: Record<EnemySpriteState, HTMLImageElement | null>;
}

const stripImageCache: Map<string, HTMLImageElement | null> = new Map();
const bundleCache: Map<string, EnemySpriteBundle | null> = new Map();
const bundleLoadPromises: Map<string, Promise<EnemySpriteBundle | null>> =
  new Map();

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // graceful fallback to procedural
    img.src = src;
  });
}

async function loadBundle(id: string): Promise<EnemySpriteBundle | null> {
  const def = ENEMY_SPRITE_DEFS[id];
  if (!def) return null;

  const images: Record<EnemySpriteState, HTMLImageElement | null> = {
    idle: null,
    attack: null,
    hurt: null,
    death: null,
  };

  for (const key of Object.keys(def) as EnemySpriteState[]) {
    const strip = def[key];
    let img = stripImageCache.get(strip.url);
    if (!img) {
      img = await loadImage(strip.url);
      stripImageCache.set(strip.url, img);
    }
    images[key] = img;
  }

  const bundle: EnemySpriteBundle = { def, images };
  bundleCache.set(id, bundle);
  return bundle;
}

/**
 * Legacy loader that returns a map of enemy id -> idle frame image.
 * Useful for eager preloading at app boot; the full bundle is cached
 * for frame-sliced animation.
 */
export function loadEnemySprites(): Promise<
  Map<string, HTMLImageElement | null>
> {
  const promises = Object.keys(ENEMY_SPRITE_DEFS).map(async (id) => {
    const bundle = await loadBundle(id);
    return [id, bundle?.images.idle ?? null] as const;
  });
  return Promise.all(promises).then((entries) => new Map(entries));
}

/** Lazy-load the sprite bundle for a single enemy. */
export function loadEnemySpriteBundle(
  id: string
): Promise<EnemySpriteBundle | null> {
  const cached = bundleCache.get(id);
  if (cached) return Promise.resolve(cached);

  const existing = bundleLoadPromises.get(id);
  if (existing) return existing;

  const promise = loadBundle(id);
  bundleLoadPromises.set(id, promise);
  return promise;
}

/** Return the cached bundle if it has finished loading, otherwise undefined. */
export function getEnemySpriteBundle(
  id: string
): EnemySpriteBundle | null | undefined {
  return bundleCache.get(id);
}

/** Return a single strip and its loaded image for a given animation state. */
export function getEnemySpriteStrip(
  id: string,
  state: EnemyAnimationState
): { strip: SpriteStrip; img: HTMLImageElement | null } | null {
  const bundle = bundleCache.get(id);
  if (!bundle) return null;
  const key = spriteStateToStripKey(state);
  return { strip: bundle.def[key], img: bundle.images[key] };
}

/** Legacy accessor: return the idle-frame image for an enemy, if loaded. */
export function getEnemySprite(id: string): HTMLImageElement | null | undefined {
  return bundleCache.get(id)?.images.idle;
}
