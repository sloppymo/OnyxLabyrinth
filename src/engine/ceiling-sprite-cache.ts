/**
 * Image cache for ceiling-hanging decor sprites.
 * Mirrors map-sprite-cache.ts's load/chroma-key/lookup contract.
 */

import { CEILING_SPRITES, ceilingSpriteUrl, type CeilingSpriteDef } from "../data/ceiling-sprites";
import { keyOutBackground } from "./sprite-alpha";

export type CeilingSpriteImage = HTMLImageElement | HTMLCanvasElement;

const cache = new Map<string, CeilingSpriteImage | null>();
let loadPromise: Promise<void> | null = null;

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Same background-keying contract as map-sprite-cache's prepareSprite. */
function prepareSprite(img: HTMLImageElement): CeilingSpriteImage {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return img;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return img;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, w, h);
    if (keyOutBackground(pixels.data, w, h) === 0) return img;
    ctx.putImageData(pixels, 0, 0);
    return canvas;
  } catch {
    return img;
  }
}

export function loadCeilingSprites(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = Promise.all(
    CEILING_SPRITES.map(async (def) => {
      const img = await loadImage(ceilingSpriteUrl(def));
      cache.set(def.id, img ? prepareSprite(img) : null);
    })
  ).then(() => {});
  return loadPromise;
}

export function getCeilingSpriteImage(spriteId: string): CeilingSpriteImage | null {
  return cache.get(spriteId) ?? null;
}

export function getCeilingSpriteDef(spriteId: string): CeilingSpriteDef | undefined {
  return CEILING_SPRITES.find((s) => s.id === spriteId);
}
