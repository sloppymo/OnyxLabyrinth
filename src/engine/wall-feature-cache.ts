/**
 * Image cache for wall-embedded decals (see data/wall-features.ts).
 * Mirrors map-sprite-cache.ts's load/chroma-key/lookup contract.
 */

import { WALL_FEATURES, wallFeatureUrl, type WallFeatureSpriteDef } from "../data/wall-features";
import { keyOutBackground } from "./sprite-alpha";

export type WallFeatureImage = HTMLImageElement | HTMLCanvasElement;

const cache = new Map<string, WallFeatureImage | null>();
const textCache = new Map<string, HTMLCanvasElement | null>();
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
function prepareDecal(img: HTMLImageElement): WallFeatureImage {
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

export function loadWallFeatures(): Promise<void> {
  if (loadPromise) return loadPromise;
  const fontReady = "fonts" in document
    ? document.fonts.load('16px "FF36"').catch(() => undefined)
    : Promise.resolve();
  loadPromise = fontReady.then(() =>
    Promise.all(
      WALL_FEATURES.map(async (def) => {
        const img = await loadImage(wallFeatureUrl(def));
        cache.set(def.id, img ? prepareDecal(img) : null);
        textCache.set(def.id, buildOverlayText(def));
      })
    ).then(() => {})
  );
  return loadPromise;
}

/** Build optional sign lettering with the game's loaded pixel font, rather
 * than asking image generation to draw exact text. The canvas is sampled by
 * the renderer one vertical strip at a time just like the base decal. */
function buildOverlayText(def: WallFeatureSpriteDef): HTMLCanvasElement | null {
  if (!def.overlayText?.length) return null;
  const canvas = document.createElement("canvas");
  const width = 192;
  const height = 80;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '16px "FF36", monospace';
  ctx.fillStyle = "#2a2022";
  // East-facing wall faces are sampled right-to-left by the corridor
  // renderer. Mirror the complete text canvas so the glyphs (not merely the
  // character order) remain readable from the room. Reversing the string
  // alone produces backwards glyphs and a backwards label in-engine.
  if (def.overlayTextMirrored) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  const lineHeight = 23;
  const firstY = height / 2 - ((def.overlayText.length - 1) * lineHeight) / 2;
  for (const [index, line] of def.overlayText.entries()) {
    ctx.fillText(line, width / 2, firstY + index * lineHeight);
  }
  return canvas;
}

export function getWallFeatureImage(spriteId: string): WallFeatureImage | null {
  return cache.get(spriteId) ?? null;
}

export function getWallFeatureTextImage(spriteId: string): HTMLCanvasElement | null {
  return textCache.get(spriteId) ?? null;
}

export function getWallFeatureDef(spriteId: string): WallFeatureSpriteDef | undefined {
  return WALL_FEATURES.find((f) => f.id === spriteId);
}
