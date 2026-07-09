const EFFECT_BASE = (import.meta.env.BASE_URL ?? "/") + "assets/effects/";

const effectImageCache: Map<string, HTMLImageElement | null> = new Map();
const effectLoadPromises: Map<string, Promise<HTMLImageElement | null>> =
  new Map();

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadEffect(name: string): Promise<HTMLImageElement | null> {
  const cached = effectImageCache.get(name);
  if (cached !== undefined) return cached;

  const existing = effectLoadPromises.get(name);
  if (existing) return existing;

  const promise = loadImage(EFFECT_BASE + name + ".png");
  effectLoadPromises.set(name, promise);
  const img = await promise;
  effectImageCache.set(name, img);
  return img;
}

/** Preload all effect sprites without blocking the render loop. */
export function loadEffectSprites(): Promise<Map<string, HTMLImageElement | null>> {
  return loadEffect("arrow").then((img) => new Map([["arrow", img]]));
}

/** Return the cached arrow sprite, or null if it failed to load. */
export function getEffectSprite(name: string): HTMLImageElement | null {
  return effectImageCache.get(name) ?? null;
}
