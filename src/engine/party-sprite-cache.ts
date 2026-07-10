/**
 * Party sprite cache — animated 100×100 side-view strips for party members
 * in the FF6-style combat scene.
 *
 * Assets live at public/assets/party/<class>/<state>.png (same convention as
 * the enemy strips in public/assets/enemies/). Every frame is 100×100 px and
 * strips are horizontal, so the frame count is DERIVED at load time from
 * image width / 100 — no hand-maintained frame tables.
 *
 * Class → pack mapping (done at copy time in public/assets/party/):
 *   Fighter → Knight, Mage → Wizard, Priest → Priest,
 *   Thief → Archer, Halberdier → Armored Axeman.
 *
 * States: idle / walk / attack / cast / hurt / death. `cast` is optional
 * (only Mage and Priest ship one) and falls back to `attack`.
 *
 * The pack sprites face RIGHT. The combat renderer places the party on the
 * right side of the screen facing left, so it draws them mirrored.
 */

import type { CharacterClass } from "../game/party";
import type { SpriteStrip } from "./sprite-manifest";

export type PartySpriteState =
  | "idle"
  | "walk"
  | "attack"
  | "cast"
  | "hurt"
  | "death";

const FRAME_SIZE = 100;

const ASSET_BASE = import.meta.env.BASE_URL ?? "/";

/** Class → asset directory name under public/assets/party/. */
export const PARTY_SPRITE_DIRS: Record<CharacterClass, string> = {
  Fighter: "fighter",
  Mage: "mage",
  Priest: "priest",
  Thief: "thief",
  Halberdier: "halberdier",
};

/** Per-state playback config. Frame counts come from the loaded image. */
const STATE_CONFIG: Record<PartySpriteState, { fps: number; loop: boolean }> = {
  idle: { fps: 6, loop: true },
  walk: { fps: 10, loop: true },
  attack: { fps: 12, loop: false },
  cast: { fps: 10, loop: false },
  hurt: { fps: 10, loop: false },
  death: { fps: 8, loop: false },
};

const ALL_STATES = Object.keys(STATE_CONFIG) as PartySpriteState[];

export interface PartySpriteBundle {
  /** Loaded strip images by state (null = failed or absent, e.g. no cast). */
  images: Partial<Record<PartySpriteState, HTMLImageElement | null>>;
  /** Derived strips by state (null when the image is missing). */
  strips: Partial<Record<PartySpriteState, SpriteStrip | null>>;
}

const bundleCache: Map<string, PartySpriteBundle> = new Map();
const bundleLoadPromises: Map<string, Promise<PartySpriteBundle>> = new Map();

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // graceful fallback to procedural
    img.src = src;
  });
}

/** Build a SpriteStrip from a loaded strip image (frame count from width). */
function stripFromImage(
  img: HTMLImageElement,
  url: string,
  state: PartySpriteState
): SpriteStrip | null {
  const frameCount = Math.floor(img.naturalWidth / FRAME_SIZE);
  if (frameCount < 1 || img.naturalHeight !== FRAME_SIZE) return null;
  const cfg = STATE_CONFIG[state];
  return {
    url,
    frameWidth: FRAME_SIZE,
    frameHeight: FRAME_SIZE,
    frameCount,
    fps: cfg.fps,
    loop: cfg.loop,
  };
}

async function loadBundle(dir: string): Promise<PartySpriteBundle> {
  const bundle: PartySpriteBundle = { images: {}, strips: {} };
  await Promise.all(
    ALL_STATES.map(async (state) => {
      const url = `${ASSET_BASE}assets/party/${dir}/${state}.png`;
      const img = await loadImage(url);
      bundle.images[state] = img;
      bundle.strips[state] = img ? stripFromImage(img, url, state) : null;
    })
  );
  bundleCache.set(dir, bundle);
  return bundle;
}

/** Preload sprites for every class. Call at boot alongside loadEnemySprites. */
export function loadPartySprites(): Promise<Map<string, PartySpriteBundle>> {
  const promises = Object.values(PARTY_SPRITE_DIRS).map(async (dir) => {
    const bundle = await loadPartySpriteBundle(dir);
    return [dir, bundle] as const;
  });
  return Promise.all(promises).then((entries) => new Map(entries));
}

/** Lazy-load one class directory's bundle (deduped). */
export function loadPartySpriteBundle(dir: string): Promise<PartySpriteBundle> {
  const cached = bundleCache.get(dir);
  if (cached) return Promise.resolve(cached);
  const existing = bundleLoadPromises.get(dir);
  if (existing) return existing;
  const promise = loadBundle(dir);
  bundleLoadPromises.set(dir, promise);
  return promise;
}

/**
 * Return the strip + image for a class and state, if loaded.
 * `cast` falls back to `attack`; anything else missing returns null so the
 * renderer can fall back to the procedural silhouette.
 */
export function getPartySpriteStrip(
  cls: CharacterClass,
  state: PartySpriteState
): { strip: SpriteStrip; img: HTMLImageElement } | null {
  const dir = PARTY_SPRITE_DIRS[cls];
  const bundle = bundleCache.get(dir);
  if (!bundle) return null;

  const tryState = (st: PartySpriteState) => {
    const strip = bundle.strips[st];
    const img = bundle.images[st];
    return strip && img ? { strip, img } : null;
  };

  return tryState(state) ?? (state === "cast" ? tryState("attack") : null);
}

/** Test hook: clear all caches. */
export function clearPartySpriteCache(): void {
  bundleCache.clear();
  bundleLoadPromises.clear();
}
