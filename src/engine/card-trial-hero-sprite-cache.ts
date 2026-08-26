/**
 * Card Trial-only hero strips.
 *
 * The campaign remains class-pack driven. This narrow cache swaps in the two
 * authored Card Trial protagonists only while the combat state carries the
 * `card-trial-rows` formation marker.
 */

import type { HeroId } from "../game/card-trial/types";
import type { SpriteStrip } from "./sprite-manifest";
import {
  PARTY_SPRITE_STATE_CONFIG,
  type PartySpriteState,
} from "./party-sprite-cache";
import { warnAsset } from "./asset-warn";

const ASSET_BASE = import.meta.env.BASE_URL ?? "/";
const FRAME_SIZE = 100;
const HERO_IDS = ["rat-king", "old-man"] as const satisfies readonly HeroId[];
const STATES = [
  "idle",
  "walk",
  "attack",
  "attack_ranged",
  "cast",
  "hurt",
  "death",
] as const satisfies readonly PartySpriteState[];

const ART_GEOMETRY: Record<HeroId, { foot: number; top: number }> = {
  // Measured from the opaque bounds in the authored 100 px source frames.
  // Keeping these as strip metadata makes the sprite, floor bounce, current-
  // actor ring, target reticle, and nameplate agree on the same visual feet.
  "rat-king": { foot: 0.65, top: 0.34 },
  "old-man": { foot: 0.7, top: 0.3 },
};

interface CardTrialHeroSpriteBundle {
  images: Partial<Record<PartySpriteState, HTMLImageElement | null>>;
  strips: Partial<Record<PartySpriteState, SpriteStrip | null>>;
}

const bundles = new Map<HeroId, CardTrialHeroSpriteBundle>();
const pending = new Map<HeroId, Promise<CardTrialHeroSpriteBundle>>();

function assetUrl(id: HeroId, state: PartySpriteState): string {
  return `${ASSET_BASE}assets/card-trial/heroes/${id}/${state}.png`;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      warnAsset(`failed to load Card Trial hero sprite: ${src}`);
      resolve(null);
    };
    image.src = src;
  });
}

async function loadBundle(id: HeroId): Promise<CardTrialHeroSpriteBundle> {
  const bundle: CardTrialHeroSpriteBundle = { images: {}, strips: {} };
  await Promise.all(
    STATES.map(async (state) => {
      const url = assetUrl(id, state);
      const image = await loadImage(url);
      bundle.images[state] = image;
      const frameCount = image ? Math.floor(image.naturalWidth / FRAME_SIZE) : 0;
      bundle.strips[state] = image && image.naturalHeight === FRAME_SIZE && frameCount > 0
        ? {
            url,
            frameWidth: FRAME_SIZE,
            frameHeight: FRAME_SIZE,
            frameCount,
            fps: PARTY_SPRITE_STATE_CONFIG[state].fps,
            loop: PARTY_SPRITE_STATE_CONFIG[state].loop,
            artFootFromTop: ART_GEOMETRY[id].foot,
            artTopFromTop: ART_GEOMETRY[id].top,
          }
        : null;
    })
  );
  bundles.set(id, bundle);
  return bundle;
}

export function isCardTrialHeroId(id: string): id is HeroId {
  return id === "rat-king" || id === "old-man";
}

export function cardTrialHeroTextureKey(id: HeroId, state: PartySpriteState): string {
  return `card-trial-hero:${id}:${state}`;
}

export function loadCardTrialHeroSpriteBundle(
  id: HeroId
): Promise<CardTrialHeroSpriteBundle> {
  const cached = bundles.get(id);
  if (cached) return Promise.resolve(cached);
  const existing = pending.get(id);
  if (existing) return existing;
  const promise = loadBundle(id);
  pending.set(id, promise);
  return promise;
}

export function loadCardTrialHeroSprites(): Promise<Map<HeroId, CardTrialHeroSpriteBundle>> {
  return Promise.all(
    HERO_IDS.map(async (id) => [id, await loadCardTrialHeroSpriteBundle(id)] as const)
  ).then((entries) => new Map(entries));
}

export function getCardTrialHeroSpriteStrip(
  actorId: string,
  state: PartySpriteState
): { strip: SpriteStrip; img: HTMLImageElement } | null {
  if (!isCardTrialHeroId(actorId)) return null;
  const bundle = bundles.get(actorId);
  const strip = bundle?.strips[state];
  const img = bundle?.images[state];
  return strip && img ? { strip, img } : null;
}

/** Test/lifecycle hook; production pooling never owns this module cache. */
export function clearCardTrialHeroSpriteCache(): void {
  bundles.clear();
  pending.clear();
}
