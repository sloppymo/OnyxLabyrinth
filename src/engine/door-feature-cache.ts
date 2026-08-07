/**
 * Image cache for full-face door-panel overrides (see data/door-features.ts).
 * Mirrors wall-feature-cache.ts's load/chroma-key/lookup contract.
 */

import { DOOR_FEATURES, doorFeatureUrl, type DoorFeatureSpriteDef } from "../data/door-features";
import { keyOutBackground } from "./sprite-alpha";

export type DoorFeatureImage = HTMLImageElement | HTMLCanvasElement;

const cache = new Map<string, DoorFeatureImage | null>();
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
