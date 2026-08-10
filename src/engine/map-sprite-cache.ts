/**
 * Image cache for static map decor sprites.
 */

import { MAP_SPRITES, mapSpriteUrl, type MapSpriteDef } from "../data/map-sprites";
import { alphaBounds, keyOutBackground, type AlphaBounds } from "./sprite-alpha";

/**
 * Decor billboards are drawn straight through `ctx.drawImage`, so anything
 * opaque in the source paints over the corridor. The original pack is RGB with
 * a baked near-black background; `prepareSprite` keys it out once at load and
 * caches the result as its own canvas.
 *
 * A plain `HTMLCanvasElement` is safe to cache across frames — unlike a
 * `CanvasPattern`, it is not bound to the corridor's 2D context, so
 * `shell.resizeCorridorCanvas()` resetting that bitmap cannot invalidate it.
 */
export type MapSpriteImage = HTMLImageElement | HTMLCanvasElement;

type CachedMapSprite = { image: MapSpriteImage; alphaBounds: AlphaBounds };

const cache = new Map<string, CachedMapSprite | null>();
let loadPromise: Promise<void> | null = null;

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Return a drawable with the baked background keyed to transparency, or the
 * original image when nothing needed doing (already has alpha) or when the
 * canvas work is unavailable. Never throws — a failed key must degrade to the
 * old behaviour, not lose the sprite.
 */
function prepareSprite(img: HTMLImageElement): CachedMapSprite | null {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return {
        image: img,
        alphaBounds: { x: 0, y: 0, width: w, height: h, bottomPadding: 0 },
      };
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, w, h);
    keyOutBackground(pixels.data, w, h);
    const bounds = alphaBounds(pixels.data, w, h);
    if (!bounds) return null;
    ctx.putImageData(pixels, 0, 0);
    return { image: canvas, alphaBounds: bounds };
  } catch {
    // Tainted canvas or a headless context with no getImageData: keep the
    // original rather than dropping the decor entirely.
    return {
      image: img,
      alphaBounds: { x: 0, y: 0, width: w, height: h, bottomPadding: 0 },
    };
  }
}

export function loadMapSprites(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = Promise.all(
    MAP_SPRITES.map(async (def) => {
      const img = await loadImage(mapSpriteUrl(def));
      cache.set(def.id, img ? prepareSprite(img) : null);
    })
  ).then(() => {});
  return loadPromise;
}

export function getMapSpriteImage(spriteId: string): MapSpriteImage | null {
  return cache.get(spriteId)?.image ?? null;
}

/** Content bounds calculated from the post-keyed image. */
export function getMapSpriteAlphaBounds(spriteId: string): AlphaBounds | null {
  return cache.get(spriteId)?.alphaBounds ?? null;
}

export function getMapSpriteDef(spriteId: string): MapSpriteDef | undefined {
  return MAP_SPRITES.find((s) => s.id === spriteId);
}
