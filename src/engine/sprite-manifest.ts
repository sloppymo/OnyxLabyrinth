/**
 * Sprite strip manifest for enemy sprite-sheet animation.
 *
 * Each enemy that has image assets points to horizontal PNG strips where
 * every frame is 100x100 px. The combat renderer crops the current frame
 * at draw time and applies the same bob/lunge/hit-flash/rotate effects as
 * the procedural fallback.
 *
 * Mapping follows the asset audit recommendation:
 *   - Orc          -> big-titty-ogre
 *   - Knight       -> stone-guardian / animated-armor
 *   - Wizard       -> headmasters-echo
 *   - Skeleton     -> animated-armor (extra mapping)
 *   - Slime        -> acid-puddle
 *   - Werebear     -> failed-experiment
 *   - Soldier      -> training-dummy / lesser-construct
 *   - Priest       -> lab-assistant
 *
 * Enemies without a matching sprite (vermin, insects, books, moths, imps)
 * fall back to the procedural shapes in combat-scene.ts.
 */

export interface SpriteStrip {
  /** Public URL for the PNG strip. */
  url: string;
  /** Pixel width of a single frame. */
  frameWidth: number;
  /** Pixel height of a single frame. */
  frameHeight: number;
  /** Number of frames in the strip. */
  frameCount: number;
  /** Frames per second when looping or playing once. */
  fps: number;
  /** Whether the strip loops (idle) or plays once and holds (others). */
  loop: boolean;
}

export interface EnemySpriteDef {
  idle: SpriteStrip;
  attack: SpriteStrip;
  hurt: SpriteStrip;
  death: SpriteStrip;
}

export type EnemySpriteState = keyof EnemySpriteDef;

const ASSET_BASE = import.meta.env.BASE_URL ?? "/";

function strip(
  enemyId: string,
  state: EnemySpriteState,
  frameCount: number,
  fps = 8,
  loop = false
): SpriteStrip {
  return {
    url: `${ASSET_BASE}assets/enemies/${enemyId}/${state}.png`,
    frameWidth: 100,
    frameHeight: 100,
    frameCount,
    fps,
    loop,
  };
}

export const ENEMY_SPRITE_DEFS: Record<string, EnemySpriteDef> = {
  "big-titty-ogre": {
    idle: strip("big-titty-ogre", "idle", 6, 6, true),
    attack: strip("big-titty-ogre", "attack", 6, 10),
    hurt: strip("big-titty-ogre", "hurt", 4, 8),
    death: strip("big-titty-ogre", "death", 4, 6),
  },
  "stone-guardian": {
    idle: strip("stone-guardian", "idle", 6, 6, true),
    attack: strip("stone-guardian", "attack", 7, 10),
    hurt: strip("stone-guardian", "hurt", 4, 8),
    death: strip("stone-guardian", "death", 4, 6),
  },
  "headmasters-echo": {
    idle: strip("headmasters-echo", "idle", 6, 6, true),
    attack: strip("headmasters-echo", "attack", 6, 10),
    hurt: strip("headmasters-echo", "hurt", 4, 8),
    death: strip("headmasters-echo", "death", 4, 6),
  },
  "animated-armor": {
    idle: strip("animated-armor", "idle", 6, 6, true),
    attack: strip("animated-armor", "attack", 6, 10),
    hurt: strip("animated-armor", "hurt", 4, 8),
    death: strip("animated-armor", "death", 4, 6),
  },
  "acid-puddle": {
    idle: strip("acid-puddle", "idle", 6, 6, true),
    attack: strip("acid-puddle", "attack", 6, 10),
    hurt: strip("acid-puddle", "hurt", 4, 8),
    death: strip("acid-puddle", "death", 4, 6),
  },
  "failed-experiment": {
    idle: strip("failed-experiment", "idle", 6, 6, true),
    attack: strip("failed-experiment", "attack", 9, 10),
    hurt: strip("failed-experiment", "hurt", 4, 8),
    death: strip("failed-experiment", "death", 4, 6),
  },
  "training-dummy": {
    idle: strip("training-dummy", "idle", 6, 6, true),
    attack: strip("training-dummy", "attack", 6, 10),
    hurt: strip("training-dummy", "hurt", 4, 8),
    death: strip("training-dummy", "death", 4, 6),
  },
  "lesser-construct": {
    idle: strip("lesser-construct", "idle", 6, 6, true),
    attack: strip("lesser-construct", "attack", 6, 10),
    hurt: strip("lesser-construct", "hurt", 4, 8),
    death: strip("lesser-construct", "death", 4, 6),
  },
  "lab-assistant": {
    idle: strip("lab-assistant", "idle", 6, 6, true),
    attack: strip("lab-assistant", "attack", 9, 10),
    hurt: strip("lab-assistant", "hurt", 4, 8),
    death: strip("lab-assistant", "death", 4, 6),
  },
  // Re-themed bestiary (2026-07): the former blob-fallback enemies now map
  // onto Characters(100x100) pack monsters. Stats unchanged; ids/names/art only.
  // Pack 02 additions (demon / forge theme):
  "flame-golem": {
    idle: strip("flame-golem", "idle", 6, 6, true),
    attack: strip("flame-golem", "attack", 9, 10),
    hurt: strip("flame-golem", "hurt", 4, 8),
    death: strip("flame-golem", "death", 6, 6),
  },
  "lava-slime": {
    idle: strip("lava-slime", "idle", 6, 6, true),
    attack: strip("lava-slime", "attack", 6, 10),
    hurt: strip("lava-slime", "hurt", 4, 8),
    death: strip("lava-slime", "death", 4, 6),
  },
  hellhound: {
    idle: strip("hellhound", "idle", 6, 8, true),
    attack: strip("hellhound", "attack", 8, 10),
    hurt: strip("hellhound", "hurt", 4, 8),
    death: strip("hellhound", "death", 4, 6),
  },
  hellbat: {
    idle: strip("hellbat", "idle", 6, 8, true),
    attack: strip("hellbat", "attack", 6, 10),
    hurt: strip("hellbat", "hurt", 4, 8),
    death: strip("hellbat", "death", 4, 6),
  },
  "black-knight": {
    idle: strip("black-knight", "idle", 6, 6, true),
    attack: strip("black-knight", "attack", 16, 12),
    hurt: strip("black-knight", "hurt", 4, 8),
    death: strip("black-knight", "death", 4, 6),
  },
  minotaur: {
    idle: strip("minotaur", "idle", 6, 6, true),
    attack: strip("minotaur", "attack", 8, 10),
    hurt: strip("minotaur", "hurt", 4, 8),
    death: strip("minotaur", "death", 4, 6),
  },
  warlock: {
    idle: strip("warlock", "idle", 6, 6, true),
    attack: strip("warlock", "attack", 7, 10),
    hurt: strip("warlock", "hurt", 4, 8),
    death: strip("warlock", "death", 11, 8),
  },
  demon: {
    idle: strip("demon", "idle", 6, 6, true),
    attack: strip("demon", "attack", 7, 10),
    hurt: strip("demon", "hurt", 4, 8),
    death: strip("demon", "death", 4, 6),
  },
  demoness: {
    idle: strip("demoness", "idle", 6, 6, true),
    attack: strip("demoness", "attack", 9, 10),
    hurt: strip("demoness", "hurt", 4, 8),
    death: strip("demoness", "death", 4, 6),
  },
  "eyeball-monster": {
    idle: strip("eyeball-monster", "idle", 6, 6, true),
    attack: strip("eyeball-monster", "attack", 8, 10),
    hurt: strip("eyeball-monster", "hurt", 4, 8),
    death: strip("eyeball-monster", "death", 4, 6),
  },
  ghostfire: {
    idle: strip("ghostfire", "idle", 6, 8, true),
    attack: strip("ghostfire", "attack", 6, 10),
    hurt: strip("ghostfire", "hurt", 4, 8),
    death: strip("ghostfire", "death", 6, 6),
  },
  // Pack 02 remaining variants (knights, blood monsters, demon kin):
  "ironclad-knight": {
    idle: strip("ironclad-knight", "idle", 6, 6, true),
    attack: strip("ironclad-knight", "attack", 7, 10),
    hurt: strip("ironclad-knight", "hurt", 4, 8),
    death: strip("ironclad-knight", "death", 4, 6),
  },
  "rune-knight": {
    idle: strip("rune-knight", "idle", 6, 6, true),
    attack: strip("rune-knight", "attack", 8, 10),
    hurt: strip("rune-knight", "hurt", 4, 8),
    death: strip("rune-knight", "death", 10, 8),
  },
  "blood-monster": {
    idle: strip("blood-monster", "idle", 6, 6, true),
    attack: strip("blood-monster", "attack", 8, 10),
    hurt: strip("blood-monster", "hurt", 4, 8),
    death: strip("blood-monster", "death", 4, 6),
  },
  "blood-wraith": {
    idle: strip("blood-wraith", "idle", 6, 8, true),
    attack: strip("blood-wraith", "attack", 8, 10),
    hurt: strip("blood-wraith", "hurt", 4, 8),
    death: strip("blood-wraith", "death", 6, 6),
  },
  "demon-brawler": {
    idle: strip("demon-brawler", "idle", 6, 6, true),
    attack: strip("demon-brawler", "attack", 9, 10),
    hurt: strip("demon-brawler", "hurt", 4, 8),
    death: strip("demon-brawler", "death", 4, 6),
  },
  "demon-spawn": {
    idle: strip("demon-spawn", "idle", 6, 6, true),
    attack: strip("demon-spawn", "attack", 6, 10),
    hurt: strip("demon-spawn", "hurt", 4, 8),
    death: strip("demon-spawn", "death", 4, 6),
  },
  "demon-champion": {
    idle: strip("demon-champion", "idle", 6, 6, true),
    attack: strip("demon-champion", "attack", 11, 12),
    hurt: strip("demon-champion", "hurt", 4, 8),
    death: strip("demon-champion", "death", 4, 6),
  },
  "demon-mage": {
    idle: strip("demon-mage", "idle", 6, 6, true),
    attack: strip("demon-mage", "attack", 8, 10),
    hurt: strip("demon-mage", "hurt", 4, 8),
    death: strip("demon-mage", "death", 4, 6),
  },
  succubus: {
    idle: strip("succubus", "idle", 6, 6, true),
    attack: strip("succubus", "attack", 8, 10),
    hurt: strip("succubus", "hurt", 4, 8),
    death: strip("succubus", "death", 4, 6),
  },
  slime: {
    idle: strip("slime", "idle", 6, 6, true),
    attack: strip("slime", "attack", 6, 10),
    hurt: strip("slime", "hurt", 4, 8),
    death: strip("slime", "death", 4, 6),
  },
  skeleton: {
    idle: strip("skeleton", "idle", 6, 6, true),
    attack: strip("skeleton", "attack", 6, 10),
    hurt: strip("skeleton", "hurt", 4, 8),
    death: strip("skeleton", "death", 4, 6),
  },
  "armored-skeleton": {
    idle: strip("armored-skeleton", "idle", 6, 6, true),
    attack: strip("armored-skeleton", "attack", 8, 10),
    hurt: strip("armored-skeleton", "hurt", 4, 8),
    death: strip("armored-skeleton", "death", 4, 6),
  },
  "skeleton-archer": {
    idle: strip("skeleton-archer", "idle", 6, 6, true),
    attack: strip("skeleton-archer", "attack", 9, 10),
    hurt: strip("skeleton-archer", "hurt", 4, 8),
    death: strip("skeleton-archer", "death", 4, 6),
  },
  orc: {
    idle: strip("orc", "idle", 6, 6, true),
    attack: strip("orc", "attack", 6, 10),
    hurt: strip("orc", "hurt", 4, 8),
    death: strip("orc", "death", 4, 6),
  },
  "elite-orc": {
    idle: strip("elite-orc", "idle", 6, 6, true),
    attack: strip("elite-orc", "attack", 7, 10),
    hurt: strip("elite-orc", "hurt", 4, 8),
    death: strip("elite-orc", "death", 4, 6),
  },
  werewolf: {
    idle: strip("werewolf", "idle", 6, 6, true),
    attack: strip("werewolf", "attack", 9, 10),
    hurt: strip("werewolf", "hurt", 4, 8),
    death: strip("werewolf", "death", 4, 6),
  },
  // Summoned ally sprites — recolored enemy strips generated by
  // scripts/recolor-sprites.mjs. Same frame counts as their base sprites.
  "summon-slime": {
    idle: strip("summon-slime", "idle", 6, 6, true),
    attack: strip("summon-slime", "attack", 6, 10),
    hurt: strip("summon-slime", "hurt", 4, 8),
    death: strip("summon-slime", "death", 4, 6),
  },
  "summon-fire-elemental": {
    idle: strip("summon-fire-elemental", "idle", 6, 6, true),
    attack: strip("summon-fire-elemental", "attack", 6, 10),
    hurt: strip("summon-fire-elemental", "hurt", 4, 8),
    death: strip("summon-fire-elemental", "death", 4, 6),
  },
  "summon-eldritch-guardian": {
    idle: strip("summon-eldritch-guardian", "idle", 6, 6, true),
    attack: strip("summon-eldritch-guardian", "attack", 7, 10),
    hurt: strip("summon-eldritch-guardian", "hurt", 4, 8),
    death: strip("summon-eldritch-guardian", "death", 4, 6),
  },
  "summon-elemental": {
    idle: strip("summon-elemental", "idle", 6, 6, true),
    attack: strip("summon-elemental", "attack", 9, 10),
    hurt: strip("summon-elemental", "hurt", 4, 8),
    death: strip("summon-elemental", "death", 4, 6),
  },
  "summon-holy-guardian": {
    idle: strip("summon-holy-guardian", "idle", 6, 6, true),
    attack: strip("summon-holy-guardian", "attack", 6, 10),
    hurt: strip("summon-holy-guardian", "hurt", 4, 8),
    death: strip("summon-holy-guardian", "death", 4, 6),
  },
  "summon-celestial-guardian": {
    idle: strip("summon-celestial-guardian", "idle", 6, 6, true),
    attack: strip("summon-celestial-guardian", "attack", 6, 10),
    hurt: strip("summon-celestial-guardian", "hurt", 4, 8),
    death: strip("summon-celestial-guardian", "death", 4, 6),
  },
  "summon-celestial": {
    idle: strip("summon-celestial", "idle", 6, 6, true),
    attack: strip("summon-celestial", "attack", 6, 10),
    hurt: strip("summon-celestial", "hurt", 4, 8),
    death: strip("summon-celestial", "death", 4, 6),
  },
};

/** Convert the renderer's SpriteState to a strip key. */
export function spriteStateToStripKey(
  state: "idle" | "attacking" | "hit" | "defeated"
): EnemySpriteState {
  switch (state) {
    case "attacking":
      return "attack";
    case "hit":
      return "hurt";
    case "defeated":
      return "death";
    default:
      return "idle";
  }
}
