/**
 * Image cache for full-face door-panel overrides (see data/door-features.ts).
 * Mirrors wall-feature-cache.ts's load/chroma-key/lookup contract.
 */

import { DOOR_FEATURES, doorFeatureUrl, type DoorFeatureSpriteDef } from "../data/door-features";
import { keyOutBackground } from "./sprite-alpha";

export type DoorFeatureImage = HTMLImageElement | HTMLCanvasElement;

const cache = new Map<string, DoorFeatureImage | null>();
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

/** Same background-keying contract as wall-feature-cache's prepareDecal. */
function preparePanel(img: HTMLImageElement): DoorFeatureImage {
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

export function loadDoorFeatures(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = Promise.all(
    DOOR_FEATURES.map(async (def) => {
      const img = await loadImage(doorFeatureUrl(def));
      cache.set(def.id, img ? preparePanel(img) : null);
      textCache.set(def.id, buildOverlayText(def));
    })
  ).then(() => {});
  return loadPromise;
}

export function getDoorFeatureImage(spriteId: string): DoorFeatureImage | null {
  return cache.get(spriteId) ?? null;
}

export function getDoorFeatureDef(spriteId: string): DoorFeatureSpriteDef | undefined {
  return DOOR_FEATURES.find((f) => f.id === spriteId);
}

function buildOverlayText(def: DoorFeatureSpriteDef): HTMLCanvasElement | null {
  if (!def.overlayText?.length) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '16px "FF36", monospace';
  ctx.fillStyle = "#f0d080";
  ctx.strokeStyle = "#24152f";
  ctx.lineWidth = 2;
  // Door samples are mirrored by the corridor's full-face panel path for
  // both approach edges. Mirror the overlay source once so the final glyphs
  // remain readable from either side of the same physical door asset.
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  const lineHeight = 23;
  const firstY = canvas.height / 2 - ((def.overlayText.length - 1) * lineHeight) / 2;
  for (const [index, line] of def.overlayText.entries()) {
    ctx.strokeText(line, canvas.width / 2, firstY + index * lineHeight);
    ctx.fillText(line, canvas.width / 2, firstY + index * lineHeight);
  }
  return canvas;
}

export function getDoorFeatureTextImage(spriteId: string): HTMLCanvasElement | null {
  return textCache.get(spriteId) ?? null;
}
