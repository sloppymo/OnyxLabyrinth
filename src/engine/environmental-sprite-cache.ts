import {
  ENVIRONMENTAL_SPRITES,
  environmentalSpriteUrl,
  getEnvironmentalSpriteAsset,
} from "../data/environmental-sprites";

const cache = new Map<string, HTMLImageElement | null>();
let loadPromise: Promise<void> | null = null;

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

export function loadEnvironmentalSprites(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = Promise.all(
    ENVIRONMENTAL_SPRITES.map(async (asset) => {
      cache.set(asset.id, await loadImage(environmentalSpriteUrl(asset)));
    })
  ).then(() => undefined);
  return loadPromise;
}

export function getEnvironmentalSpriteImage(id: string): HTMLImageElement | null {
  return cache.get(id) ?? null;
}

export { getEnvironmentalSpriteAsset };

export function resetEnvironmentalSpriteCacheForTests(): void {
  cache.clear();
  loadPromise = null;
}
