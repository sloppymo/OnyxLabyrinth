const EFFECT_BASE = (import.meta.env.BASE_URL ?? "/") + "assets/effects/";

export interface EffectStrip {
  name: string;
  url: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  fps: number;
  loop?: boolean;
}

export interface EffectSprite {
  img: HTMLImageElement | null;
  strip: EffectStrip;
  /** Columns in the source sheet (computed after load). */
  cols: number;
  rows: number;
}

const EFFECT_STRIPS: Record<string, EffectStrip> = {
  arrow: {
    name: "arrow",
    url: "arrow.png",
    frameWidth: 32,
    frameHeight: 32,
    frameCount: 1,
    fps: 0,
  },
  arrow_archer: {
    name: "arrow_archer",
    url: "arrow_archer.png",
    frameWidth: 32,
    frameHeight: 32,
    frameCount: 1,
    fps: 0,
  },
  arrow_skeleton: {
    name: "arrow_skeleton",
    url: "arrow_skeleton.png",
    frameWidth: 32,
    frameHeight: 32,
    frameCount: 1,
    fps: 0,
  },
  fireball: {
    name: "fireball",
    url: "fireball.png",
    frameWidth: 16,
    frameHeight: 16,
    frameCount: 12,
    fps: 12,
  },
  fire_explosion: {
    name: "fire_explosion",
    url: "fire_explosion.png",
    frameWidth: 28,
    frameHeight: 28,
    frameCount: 12,
    fps: 12,
  },
  fire_explosion_glow: {
    name: "fire_explosion_glow",
    url: "fire_explosion_glow.png",
    frameWidth: 28,
    frameHeight: 28,
    frameCount: 12,
    fps: 12,
  },
  fire_explosion_iso: {
    name: "fire_explosion_iso",
    url: "fire_explosion_iso.png",
    frameWidth: 28,
    frameHeight: 28,
    frameCount: 12,
    fps: 12,
  },
  fire_explosion_iso_glow: {
    name: "fire_explosion_iso_glow",
    url: "fire_explosion_iso_glow.png",
    frameWidth: 28,
    frameHeight: 28,
    frameCount: 12,
    fps: 12,
  },
  large_fire: {
    name: "large_fire",
    url: "large_fire.png",
    frameWidth: 28,
    frameHeight: 28,
    frameCount: 12,
    fps: 12,
  },
  large_fire_glow: {
    name: "large_fire_glow",
    url: "large_fire_glow.png",
    frameWidth: 28,
    frameHeight: 28,
    frameCount: 12,
    fps: 12,
  },
  ice_burst: {
    name: "ice_burst",
    url: "ice_burst.png",
    frameWidth: 48,
    frameHeight: 48,
    frameCount: 8,
    fps: 12,
  },
  ice_burst_glow: {
    name: "ice_burst_glow",
    url: "ice_burst_glow.png",
    frameWidth: 48,
    frameHeight: 48,
    frameCount: 8,
    fps: 12,
  },
  ice_burst_dark: {
    name: "ice_burst_dark",
    url: "ice_burst_dark.png",
    frameWidth: 48,
    frameHeight: 48,
    frameCount: 8,
    fps: 12,
  },
  ice_burst_grey: {
    name: "ice_burst_grey",
    url: "ice_burst_grey.png",
    frameWidth: 48,
    frameHeight: 48,
    frameCount: 8,
    fps: 12,
  },
  ice_burst_naked: {
    name: "ice_burst_naked",
    url: "ice_burst_naked.png",
    frameWidth: 48,
    frameHeight: 48,
    frameCount: 8,
    fps: 12,
  },
  ice_burst_transparent: {
    name: "ice_burst_transparent",
    url: "ice_burst_transparent.png",
    frameWidth: 48,
    frameHeight: 48,
    frameCount: 8,
    fps: 12,
  },
  lightning_blast: {
    name: "lightning_blast",
    url: "lightning_blast.png",
    frameWidth: 54,
    frameHeight: 18,
    frameCount: 9,
    fps: 12,
  },
  lightning_blast_glow: {
    name: "lightning_blast_glow",
    url: "lightning_blast_glow.png",
    frameWidth: 54,
    frameHeight: 18,
    frameCount: 9,
    fps: 12,
  },
  red_lightning_blast: {
    name: "red_lightning_blast",
    url: "red_lightning_blast.png",
    frameWidth: 54,
    frameHeight: 18,
    frameCount: 9,
    fps: 12,
  },
  red_lightning_blast_glow: {
    name: "red_lightning_blast_glow",
    url: "red_lightning_blast_glow.png",
    frameWidth: 54,
    frameHeight: 18,
    frameCount: 9,
    fps: 12,
  },
  lightning_energy: {
    name: "lightning_energy",
    url: "lightning_energy.png",
    frameWidth: 48,
    frameHeight: 48,
    frameCount: 9,
    fps: 12,
  },
  lightning_energy_glow: {
    name: "lightning_energy_glow",
    url: "lightning_energy_glow.png",
    frameWidth: 48,
    frameHeight: 48,
    frameCount: 9,
    fps: 12,
  },
  red_energy: {
    name: "red_energy",
    url: "red_energy.png",
    frameWidth: 48,
    frameHeight: 48,
    frameCount: 9,
    fps: 12,
  },
  red_energy_glow: {
    name: "red_energy_glow",
    url: "red_energy_glow.png",
    frameWidth: 48,
    frameHeight: 48,
    frameCount: 9,
    fps: 12,
  },
  elemental_v1: {
    name: "elemental_v1",
    url: "elemental_v1.png",
    frameWidth: 8,
    frameHeight: 8,
    frameCount: 26,
    fps: 12,
  },
  elemental_v2: {
    name: "elemental_v2",
    url: "elemental_v2.png",
    frameWidth: 8,
    frameHeight: 8,
    frameCount: 26,
    fps: 12,
  },
  extra_elemental: {
    name: "extra_elemental",
    url: "extra_elemental.png",
    frameWidth: 14,
    frameHeight: 14,
    frameCount: 36,
    fps: 12,
  },
  extra_elemental_glow: {
    name: "extra_elemental_glow",
    url: "extra_elemental_glow.png",
    frameWidth: 14,
    frameHeight: 14,
    frameCount: 36,
    fps: 12,
  },
  slash_attack: {
    name: "slash_attack",
    url: "slash_attack.png",
    frameWidth: 50,
    frameHeight: 126,
    frameCount: 1,
    fps: 0,
  },
  staff_attack: {
    name: "staff_attack",
    url: "staff_attack.png",
    frameWidth: 32,
    frameHeight: 64,
    frameCount: 1,
    fps: 0,
  },
  wizard_attack1: {
    name: "wizard_attack1",
    url: "wizard_attack1.png",
    frameWidth: 100,
    frameHeight: 100,
    frameCount: 10,
    fps: 12,
  },
  wizard_attack2: {
    name: "wizard_attack2",
    url: "wizard_attack2.png",
    frameWidth: 100,
    frameHeight: 100,
    frameCount: 7,
    fps: 12,
  },
  priest_attack: {
    name: "priest_attack",
    url: "priest_attack.png",
    frameWidth: 100,
    frameHeight: 100,
    frameCount: 5,
    fps: 12,
  },
  priest_heal: {
    name: "priest_heal",
    url: "priest_heal.png",
    frameWidth: 100,
    frameHeight: 100,
    frameCount: 4,
    fps: 12,
  },
  zombie_explosion: {
    name: "zombie_explosion",
    url: "zombie_explosion.png",
    frameWidth: 72,
    frameHeight: 64,
    frameCount: 4,
    fps: 12,
  },
  zombie_death_explosion: {
    name: "zombie_death_explosion",
    url: "zombie_death_explosion.png",
    frameWidth: 72,
    frameHeight: 64,
    frameCount: 4,
    fps: 12,
  },
};

const effectCache: Map<string, EffectSprite> = new Map();
const effectLoadPromises: Map<string, Promise<EffectSprite>> = new Map();

function fullUrl(strip: EffectStrip): string {
  return EFFECT_BASE + strip.url;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadEffect(name: string): Promise<EffectSprite> {
  const strip = EFFECT_STRIPS[name];
  if (!strip) {
    throw new Error(`Unknown effect: ${name}`);
  }

  const cached = effectCache.get(name);
  if (cached) return cached;

  const existing = effectLoadPromises.get(name);
  if (existing) return existing;

  const promise = loadImage(fullUrl(strip)).then((img) => {
    const cols = img ? Math.max(1, Math.floor(img.naturalWidth / strip.frameWidth)) : 1;
    const rows = img ? Math.max(1, Math.floor(img.naturalHeight / strip.frameHeight)) : 1;
    const sprite: EffectSprite = { img, strip, cols, rows };
    effectCache.set(name, sprite);
    return sprite;
  });

  effectLoadPromises.set(name, promise);
  return promise;
}

/** Preload all effect sprites without blocking the render loop. */
export function loadEffectSprites(): Promise<EffectSprite[]> {
  return Promise.all(Object.keys(EFFECT_STRIPS).map((name) => loadEffect(name)));
}

/** Return a cached effect sprite, or null if it failed to load. */
export function getEffectSprite(name: string): EffectSprite | null {
  return effectCache.get(name) ?? null;
}

/** Return the strip definition for an effect (image may not be loaded yet). */
export function getEffectStrip(name: string): EffectStrip | undefined {
  return EFFECT_STRIPS[name];
}
