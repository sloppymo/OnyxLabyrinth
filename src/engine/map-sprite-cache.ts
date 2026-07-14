/**
 * Image cache for static map decor sprites.
 */

import { MAP_SPRITES, mapSpriteUrl, type MapSpriteDef } from "../data/map-sprites";

const cache = new Map<string, HTMLImageElement | null>();
let loadPromise: Promise<void> | null = null;

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export function loadMapSprites(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = Promise.all(
    MAP_SPRITES.map(async (def) => {
      const img = await loadImage(mapSpriteUrl(def));
      cache.set(def.id, img);
    })
  ).then(() => {});
  return loadPromise;
}

export function getMapSpriteImage(spriteId: string): HTMLImageElement | null {
  return cache.get(spriteId) ?? null;
}

export function getMapSpriteDef(spriteId: string): MapSpriteDef | undefined {
  return MAP_SPRITES.find((s) => s.id === spriteId);
}
