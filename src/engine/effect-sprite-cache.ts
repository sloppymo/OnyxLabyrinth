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
  // Tiny RPG Character Asset Pack 02 projectiles.
  cannonball: {
    name: "cannonball",
    url: "cannonball.png",
    frameWidth: 100,
    frameHeight: 100,
    frameCount: 1,
    fps: 0,
  },
  "rune-beam": {
    name: "rune-beam",
    url: "rune-beam.png",
    frameWidth: 100,
    frameHeight: 100,
    frameCount: 7,
    fps: 12,
    loop: true,
  },
  "demon-arrow": {
    name: "demon-arrow",
    url: "demon-arrow.png",
    frameWidth: 100,
    frameHeight: 100,
    frameCount: 1,
    fps: 0,
  },
  "eye-beam": {
    name: "eye-beam",
    url: "eye-beam.png",
    frameWidth: 100,
    frameHeight: 100,
    frameCount: 3,
    fps: 12,
    loop: true,
  },
  "ghostfire-beam": {
    name: "ghostfire-beam",
    url: "ghostfire-beam.png",
    frameWidth: 100,
    frameHeight: 100,
    frameCount: 3,
    fps: 12,
    loop: true,
  },
  "lava-spike": {
    name: "lava-spike",
    url: "lava-spike.png",
    frameWidth: 100,
    frameHeight: 100,
    frameCount: 5,
    fps: 12,
    loop: false,
  },
  "warlock-magic": {
    name: "warlock-magic",
    url: "warlock-magic.png",
    frameWidth: 100,
    frameHeight: 100,
    frameCount: 9,
    fps: 12,
    loop: true,
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

  // --- Downloaded pack: Pixelart Spells (DevWizard, CC0) — 16x16 strips ---
  px_fireball: { name: "px_fireball", url: "pixelart-fireball.png", frameWidth: 16, frameHeight: 16, frameCount: 6, fps: 12 },
  px_firebomb: { name: "px_firebomb", url: "pixelart-firebomb.png", frameWidth: 16, frameHeight: 16, frameCount: 6, fps: 12 },
  px_ice_lance: { name: "px_ice_lance", url: "pixelart-ice-lance.png", frameWidth: 16, frameHeight: 16, frameCount: 4, fps: 12 },
  px_bolt_purity: { name: "px_bolt_purity", url: "pixelart-bolt-of-purity.png", frameWidth: 16, frameHeight: 16, frameCount: 6, fps: 12 },
  px_light_bolt: { name: "px_light_bolt", url: "pixelart-light-bolt.png", frameWidth: 16, frameHeight: 16, frameCount: 6, fps: 12 },
  px_shield: { name: "px_shield", url: "pixelart-shield.png", frameWidth: 48, frameHeight: 48, frameCount: 6, fps: 12 },
  px_magic_sparks: { name: "px_magic_sparks", url: "pixelart-magic-sparks.png", frameWidth: 16, frameHeight: 16, frameCount: 6, fps: 12 },
  px_darkness_orb: { name: "px_darkness_orb", url: "pixelart-darkness-orb.png", frameWidth: 16, frameHeight: 16, frameCount: 6, fps: 12 },
  // Future-spell candidates
  px_arcane_bolt: { name: "px_arcane_bolt", url: "pixelart-arcane-bolt.png", frameWidth: 16, frameHeight: 16, frameCount: 6, fps: 12 },
  px_black_white_ray: { name: "px_black_white_ray", url: "pixelart-black-white-ray.png", frameWidth: 16, frameHeight: 16, frameCount: 8, fps: 12 },
  px_black_white_sparks: { name: "px_black_white_sparks", url: "pixelart-black-white-sparks.png", frameWidth: 16, frameHeight: 16, frameCount: 6, fps: 12 },
  px_darkness_bolt: { name: "px_darkness_bolt", url: "pixelart-darkness-bolt.png", frameWidth: 16, frameHeight: 16, frameCount: 6, fps: 12 },
  px_magic_orb: { name: "px_magic_orb", url: "pixelart-magic-orb.png", frameWidth: 16, frameHeight: 16, frameCount: 6, fps: 12 },
  px_magic_ray: { name: "px_magic_ray", url: "pixelart-magic-ray.png", frameWidth: 16, frameHeight: 16, frameCount: 8, fps: 12 },
  px_plant_missle: { name: "px_plant_missle", url: "pixelart-plant-missle.png", frameWidth: 16, frameHeight: 16, frameCount: 6, fps: 12 },
  px_pure_bolt_2: { name: "px_pure_bolt_2", url: "pixelart-pure-bolt-2.png", frameWidth: 16, frameHeight: 16, frameCount: 6, fps: 12 },
  px_rock_sling: { name: "px_rock_sling", url: "pixelart-rock-sling.png", frameWidth: 16, frameHeight: 16, frameCount: 1, fps: 0 },
  px_splash: { name: "px_splash", url: "pixelart-splash.png", frameWidth: 32, frameHeight: 32, frameCount: 6, fps: 12 },
  px_water_blast: { name: "px_water_blast", url: "pixelart-water-blast.png", frameWidth: 16, frameHeight: 16, frameCount: 6, fps: 12 },
  px_water_bolt: { name: "px_water_bolt", url: "pixelart-water-bolt.png", frameWidth: 16, frameHeight: 16, frameCount: 6, fps: 12 },
  px_water_orb: { name: "px_water_orb", url: "pixelart-water-orb.png", frameWidth: 16, frameHeight: 16, frameCount: 6, fps: 12 },
  px_wind_bolt: { name: "px_wind_bolt", url: "pixelart-wind-bolt.png", frameWidth: 16, frameHeight: 16, frameCount: 6, fps: 12 },

  // --- Downloaded pack: Magic Pack 9 (ansimuz, royalty-free) — NON-SQUARE frames ---
  // mp_fire_bomb is trimmed to the 7 orange-fire frames (source frames 7-13); the
  // original strip opens with a blue charge-ring telegraph that a fixed 400ms burst
  // never plays past, so bursts using the full strip never showed fire at all.
  mp_fire_bomb: { name: "mp_fire_bomb", url: "magicpack-fire-bomb.png", frameWidth: 64, frameHeight: 64, frameCount: 7, fps: 25 },
  mp_lightning: { name: "mp_lightning", url: "magicpack-lightning.png", frameWidth: 64, frameHeight: 128, frameCount: 10, fps: 14 },
  mp_spark: { name: "mp_spark", url: "magicpack-spark.png", frameWidth: 32, frameHeight: 32, frameCount: 7, fps: 14 },
  mp_dark_bolt: { name: "mp_dark_bolt", url: "magicpack-dark-bolt.png", frameWidth: 64, frameHeight: 88, frameCount: 11, fps: 14 },
  // Full individual-frame variants (one extra frame each)
  mp_fire_bomb_full: { name: "mp_fire_bomb_full", url: "magicpack-fire-bomb-full.png", frameWidth: 64, frameHeight: 64, frameCount: 15, fps: 15 },
  mp_lightning_full: { name: "mp_lightning_full", url: "magicpack-lightning-full.png", frameWidth: 64, frameHeight: 128, frameCount: 11, fps: 15 },
  mp_spark_full: { name: "mp_spark_full", url: "magicpack-spark-full.png", frameWidth: 32, frameHeight: 32, frameCount: 8, fps: 16 },
  mp_dark_bolt_full: { name: "mp_dark_bolt_full", url: "magicpack-dark-bolt-full.png", frameWidth: 64, frameHeight: 88, frameCount: 12, fps: 15 },

  // --- Downloaded pack: Foozle Pixel Magic Effects (CC0) — 64x64 strips ---
  fz_fireball: { name: "fz_fireball", url: "foozle-fireball.png", frameWidth: 64, frameHeight: 64, frameCount: 10, fps: 12 },
  fz_explosion: { name: "fz_explosion", url: "foozle-explosion.png", frameWidth: 64, frameHeight: 64, frameCount: 7, fps: 12 },
  fz_molten_spear: { name: "fz_molten_spear", url: "foozle-molten-spear.png", frameWidth: 64, frameHeight: 64, frameCount: 12, fps: 12 },
  fz_water: { name: "fz_water", url: "foozle-water.png", frameWidth: 64, frameHeight: 64, frameCount: 10, fps: 12 },
  fz_water_geyser: { name: "fz_water_geyser", url: "foozle-water_geyser.png", frameWidth: 64, frameHeight: 64, frameCount: 13, fps: 12 },
  fz_earth_spike: { name: "fz_earth_spike", url: "foozle-earth_spike.png", frameWidth: 64, frameHeight: 64, frameCount: 9, fps: 12 },
  fz_rocks: { name: "fz_rocks", url: "foozle-rocks.png", frameWidth: 64, frameHeight: 64, frameCount: 10, fps: 12 },
  fz_wind: { name: "fz_wind", url: "foozle-wind.png", frameWidth: 64, frameHeight: 64, frameCount: 10, fps: 12 },
  fz_tornado: { name: "fz_tornado", url: "foozle-tornado.png", frameWidth: 64, frameHeight: 64, frameCount: 9, fps: 12 },
  fz_icons: { name: "fz_icons", url: "foozle-icons.png", frameWidth: 32, frameHeight: 32, frameCount: 10, fps: 0 },
  fz_portal: { name: "fz_portal", url: "foozle-portal.png", frameWidth: 64, frameHeight: 64, frameCount: 10, fps: 12 },
  fz_portal_gold: { name: "fz_portal_gold", url: "foozle-portal-gold.png", frameWidth: 64, frameHeight: 64, frameCount: 10, fps: 12 },
  fz_portal_orange: { name: "fz_portal_orange", url: "foozle-portal-orange.png", frameWidth: 64, frameHeight: 64, frameCount: 10, fps: 12 },

  // --- Baked recolor variants (engine cannot tint strips at runtime) ---
  heal_sparks: { name: "heal_sparks", url: "heal-sparks.png", frameWidth: 16, frameHeight: 16, frameCount: 6, fps: 12 },
  dispel_sparks: { name: "dispel_sparks", url: "dispel-sparks.png", frameWidth: 16, frameHeight: 16, frameCount: 6, fps: 12 },

  // --- Downloaded pack: "Free" spell-effects sampler (~/Downloads/Spell Effects/Free,
  // no bundled license file — verify provenance before shipping) — 180 designs, each a
  // 9-color x 64x64 sheet; single color rows cropped out per use below. ---
  free_sunburst: { name: "free_sunburst", url: "free-sunburst.png", frameWidth: 64, frameHeight: 64, frameCount: 9, fps: 12 },
  free_moon: { name: "free_moon", url: "free-moon.png", frameWidth: 64, frameHeight: 64, frameCount: 10, fps: 12 },
  free_stunburst: { name: "free_stunburst", url: "free-stunburst.png", frameWidth: 64, frameHeight: 64, frameCount: 10, fps: 12 },
  free_wardring: { name: "free_wardring", url: "free-wardring.png", frameWidth: 64, frameHeight: 64, frameCount: 14, fps: 12 },
  free_tangle: { name: "free_tangle", url: "free-tangle.png", frameWidth: 64, frameHeight: 64, frameCount: 12, fps: 12 },
  free_slash: { name: "free_slash", url: "free-slash.png", frameWidth: 64, frameHeight: 64, frameCount: 8, fps: 12 },
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
