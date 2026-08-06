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
  /**
   * Optional foot inset (0–1 from top of frame). Defaults to pack norm 0.57
   * in the ground-plane resolver; set when art feet aren't at the pack locus.
   */
  artFootFromTop?: number;
  /**
   * Optional head-top inset (0–1 from top of frame). Defaults to pack norm
   * 0.38 in the marker/cursor anchor; set when art heads aren't at the pack
   * locus (tall knights, floaters, squat blobs).
   */
  artTopFromTop?: number;
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
  loop = false,
  artFootFromTop?: number
): SpriteStrip {
  return {
    url: `${ASSET_BASE}assets/enemies/${enemyId}/${state}.png`,
    frameWidth: 100,
    frameHeight: 100,
    frameCount,
    fps,
    loop,
    ...(artFootFromTop !== undefined ? { artFootFromTop } : {}),
  };
}

/** Apply the same foot inset to every state strip (squat / floater packs). */
function withFoot(def: EnemySpriteDef, artFootFromTop: number): EnemySpriteDef {
  return {
    idle: { ...def.idle, artFootFromTop },
    attack: { ...def.attack, artFootFromTop },
    hurt: { ...def.hurt, artFootFromTop },
    death: { ...def.death, artFootFromTop },
  };
}

/** Apply the same head-top inset to every state strip (tall / squat packs). */
function withTop(def: EnemySpriteDef, artTopFromTop: number): EnemySpriteDef {
  return {
    idle: { ...def.idle, artTopFromTop },
    attack: { ...def.attack, artTopFromTop },
    hurt: { ...def.hurt, artTopFromTop },
    death: { ...def.death, artTopFromTop },
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
  // Floor 5 elite (campaign progression sprint) — reuses the Stone Guardian
  // strip; a tougher variant of the same silhouette, not new art.
  "drowned-sentinel": {
    idle: strip("stone-guardian", "idle", 6, 6, true),
    attack: strip("stone-guardian", "attack", 7, 10),
    hurt: strip("stone-guardian", "hurt", 4, 8),
    death: strip("stone-guardian", "death", 4, 6),
  },
  // Floor-3 boss "The Dead Boy" — original forged-child revenant strip.
  // Idle art spans y=20..62; anchor the feet/chain and cursor to that compact body.
  "headmasters-echo": withTop(
    withFoot(
      {
        idle: strip("headmasters-echo", "idle", 6, 6, true),
        attack: strip("headmasters-echo", "attack", 9, 10),
        hurt: strip("headmasters-echo", "hurt", 4, 8),
        death: strip("headmasters-echo", "death", 6, 6),
      },
      0.63
    ),
    0.2
  ),
  // Floor-4 boss "The Lonely Girl" — warlock pack (hooded, liturgical).
  "headmasters-echo-remnant": withTop(
    {
      idle: strip("warlock", "idle", 6, 6, true),
      attack: strip("warlock", "attack", 7, 10),
      hurt: strip("warlock", "hurt", 4, 8),
      death: strip("warlock", "death", 11, 8),
    },
    0.33
  ),
  // Floor-5 boss "The Crying Man" — holy reliquary armor (summon pack).
  "headmasters-echo-ascendant": withTop(
    withFoot(
      {
        idle: strip("summon-holy-guardian", "idle", 6, 6, true),
        attack: strip("summon-holy-guardian", "attack", 6, 10),
        hurt: strip("summon-holy-guardian", "hurt", 4, 8),
        death: strip("summon-holy-guardian", "death", 4, 6),
      },
      0.72
    ),
    0.27
  ),
  "animated-armor": withTop(
    withFoot(
      {
        idle: strip("animated-armor", "idle", 6, 6, true),
        attack: strip("animated-armor", "attack", 6, 10),
        hurt: strip("animated-armor", "hurt", 4, 8),
        death: strip("animated-armor", "death", 4, 6),
      },
      0.72
    ),
    0.27
  ),
  // Floor 5 elite (campaign progression sprint) — reuses Animated Armor's strip.
  "flood-brute": withTop(
    withFoot(
      {
        idle: strip("animated-armor", "idle", 6, 6, true),
        attack: strip("animated-armor", "attack", 6, 10),
        hurt: strip("animated-armor", "hurt", 4, 8),
        death: strip("animated-armor", "death", 4, 6),
      },
      0.72
    ),
    0.27
  ),
  "acid-puddle": withFoot(
    {
      idle: strip("acid-puddle", "idle", 6, 6, true),
      attack: strip("acid-puddle", "attack", 6, 10),
      hurt: strip("acid-puddle", "hurt", 4, 8),
      death: strip("acid-puddle", "death", 4, 6),
    },
    // Squat puddle: pack opaque ends ~0.57 but shadow core hangs below footY —
    // plant lower so the blob nests into the ellipse (no daylight gap).
    0.5
  ),
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
  "flame-golem": withTop(
    {
      idle: strip("flame-golem", "idle", 6, 6, true),
      attack: strip("flame-golem", "attack", 9, 10),
      hurt: strip("flame-golem", "hurt", 4, 8),
      death: strip("flame-golem", "death", 6, 6),
    },
    // Measured idle art top 0.29 (tall golem); pack default 0.38 sinks the cursor.
    0.29
  ),
  "ice-golem": withTop(
    withFoot(
      {
        idle: strip("ice-golem", "idle", 6, 6, true),
        attack: strip("ice-golem", "attack", 9, 10),
        hurt: strip("ice-golem", "hurt", 4, 8),
        death: strip("ice-golem", "death", 6, 6),
      },
      0.75
    ),
    0.24
  ),
  "lava-slime": withFoot(
    {
      idle: strip("lava-slime", "idle", 6, 6, true),
      attack: strip("lava-slime", "attack", 6, 10),
      hurt: strip("lava-slime", "hurt", 4, 8),
      death: strip("lava-slime", "death", 4, 6),
    },
    0.5
  ),
  hellhound: {
    idle: strip("hellhound", "idle", 6, 8, true),
    attack: strip("hellhound", "attack", 8, 10),
    hurt: strip("hellhound", "hurt", 4, 8),
    death: strip("hellhound", "death", 4, 6),
  },
  "displacer-beast": withTop(
    withFoot(
      {
        idle: strip("displacer-beast", "idle", 6, 8, true),
        attack: strip("displacer-beast", "attack", 8, 10),
        hurt: strip("displacer-beast", "hurt", 4, 8),
        death: strip("displacer-beast", "death", 4, 6),
      },
      0.68
    ),
    0.32
  ),
  hellbat: withTop(
    withFoot(
      {
        idle: strip("hellbat", "idle", 6, 8, true),
        attack: strip("hellbat", "attack", 6, 10),
        hurt: strip("hellbat", "hurt", 4, 8),
        death: strip("hellbat", "death", 4, 6),
      },
      // Measured opaque bottom ~0.50 (short flyer); pack default 0.57 floats it.
      0.5
    ),
    // Measured idle art top 0.32.
    0.32
  ),
  "black-knight": withTop(
    {
      idle: strip("black-knight", "idle", 6, 6, true),
      attack: strip("black-knight", "attack", 16, 12),
      hurt: strip("black-knight", "hurt", 4, 8),
      death: strip("black-knight", "death", 4, 6),
    },
    // Measured idle art top 0.27 (tall knight); pack default 0.38 sinks the cursor.
    0.27
  ),
  "viper-man": withTop(
    withFoot(
      {
        idle: strip("viper-man", "idle", 6, 6, true),
        attack: strip("viper-man", "attack", 16, 12),
        hurt: strip("viper-man", "hurt", 4, 8),
        death: strip("viper-man", "death", 4, 6),
      },
      // Measured idle art bottom 0.75.
      0.75
    ),
    // Measured idle art top 0.25.
    0.25
  ),
  // Floor 4 elite (campaign progression sprint) — reuses Black Knight's strip.
  "iron-chorister": withTop(
    {
      idle: strip("black-knight", "idle", 6, 6, true),
      attack: strip("black-knight", "attack", 16, 12),
      hurt: strip("black-knight", "hurt", 4, 8),
      death: strip("black-knight", "death", 4, 6),
    },
    0.27
  ),
  minotaur: {
    idle: strip("minotaur", "idle", 6, 6, true),
    attack: strip("minotaur", "attack", 8, 10),
    hurt: strip("minotaur", "hurt", 4, 8),
    death: strip("minotaur", "death", 4, 6),
  },
  warlock: withTop(
    {
      idle: strip("warlock", "idle", 6, 6, true),
      attack: strip("warlock", "attack", 7, 10),
      hurt: strip("warlock", "hurt", 4, 8),
      death: strip("warlock", "death", 11, 8),
    },
    // Measured idle art top 0.33.
    0.33
  ),
  demon: {
    idle: strip("demon", "idle", 6, 6, true),
    attack: strip("demon", "attack", 7, 10),
    hurt: strip("demon", "hurt", 4, 8),
    death: strip("demon", "death", 4, 6),
  },
  demoness: withTop(
    {
      idle: strip("demoness", "idle", 6, 6, true),
      attack: strip("demoness", "attack", 9, 10),
      hurt: strip("demoness", "hurt", 4, 8),
      death: strip("demoness", "death", 4, 6),
    },
    // Measured idle art top 0.31.
    0.31
  ),
  "eyeball-monster": withTop(
    withFoot(
      {
        idle: strip("eyeball-monster", "idle", 6, 6, true),
        attack: strip("eyeball-monster", "attack", 8, 10),
        hurt: strip("eyeball-monster", "hurt", 4, 8),
        death: strip("eyeball-monster", "death", 4, 6),
      },
      0.52
    ),
    // Measured idle art top 0.44 (squat eye); pack default 0.38 floats the cursor.
    0.44
  ),
  ghostfire: withTop(
    {
      idle: strip("ghostfire", "idle", 6, 8, true),
      attack: strip("ghostfire", "attack", 6, 10),
      hurt: strip("ghostfire", "hurt", 4, 8),
      death: strip("ghostfire", "death", 6, 6),
    },
    // Measured idle art top 0.26 (tall flame); pack default 0.38 sinks the cursor.
    0.26
  ),
  // Pack 02 remaining variants (knights, blood monsters, demon kin):
  "ironclad-knight": {
    idle: strip("ironclad-knight", "idle", 6, 6, true),
    attack: strip("ironclad-knight", "attack", 7, 10),
    hurt: strip("ironclad-knight", "hurt", 4, 8),
    death: strip("ironclad-knight", "death", 4, 6),
  },
  // Floor 4 elite (campaign progression sprint) — reuses Ironclad Knight's strip.
  "choir-warden": {
    idle: strip("ironclad-knight", "idle", 6, 6, true),
    attack: strip("ironclad-knight", "attack", 7, 10),
    hurt: strip("ironclad-knight", "hurt", 4, 8),
    death: strip("ironclad-knight", "death", 4, 6),
  },
  "rune-knight": withTop(
    {
      idle: strip("rune-knight", "idle", 6, 6, true),
      attack: strip("rune-knight", "attack", 8, 10),
      hurt: strip("rune-knight", "hurt", 4, 8),
      death: strip("rune-knight", "death", 10, 8),
    },
    // Measured idle art top 0.29 (tall knight); pack default 0.38 sinks the cursor.
    0.29
  ),
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
  "demon-spawn": withTop(
    {
      idle: strip("demon-spawn", "idle", 6, 6, true),
      attack: strip("demon-spawn", "attack", 6, 10),
      hurt: strip("demon-spawn", "hurt", 4, 8),
      death: strip("demon-spawn", "death", 4, 6),
    },
    // Measured idle art top 0.32.
    0.32
  ),
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
  slime: withFoot(
    {
      idle: strip("slime", "idle", 6, 6, true),
      attack: strip("slime", "attack", 6, 10),
      hurt: strip("slime", "hurt", 4, 8),
      death: strip("slime", "death", 4, 6),
    },
    0.5
  ),
  skeleton: {
    idle: strip("skeleton", "idle", 6, 6, true),
    attack: strip("skeleton", "attack", 6, 10),
    hurt: strip("skeleton", "hurt", 4, 8),
    death: strip("skeleton", "death", 4, 6),
  },
  "red-skeleton": {
    idle: strip("red-skeleton", "idle", 6, 6, true),
    attack: strip("red-skeleton", "attack", 6, 10),
    hurt: strip("red-skeleton", "hurt", 4, 8),
    death: strip("red-skeleton", "death", 4, 6),
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
  "elite-orc": withTop(
    {
      idle: strip("elite-orc", "idle", 6, 6, true),
      attack: strip("elite-orc", "attack", 7, 10),
      hurt: strip("elite-orc", "hurt", 4, 8),
      death: strip("elite-orc", "death", 4, 6),
    },
    // Measured idle art top 0.33.
    0.33
  ),
  werewolf: {
    idle: strip("werewolf", "idle", 6, 6, true),
    attack: strip("werewolf", "attack", 9, 10),
    hurt: strip("werewolf", "hurt", 4, 8),
    death: strip("werewolf", "death", 4, 6),
  },
  // "The Party That Returned" (Floor 1 capstone) — a ruined four-person
  // adventuring party. No new art: each borrows an existing strip whose
  // silhouette fits its role (armored front-liner, quick front-liner,
  // robed caster, ghostly support), same convention as choir-warden
  // borrowing ironclad-knight above.
  "ruined-vanguard": {
    idle: strip("armored-skeleton", "idle", 6, 6, true),
    attack: strip("armored-skeleton", "attack", 8, 10),
    hurt: strip("armored-skeleton", "hurt", 4, 8),
    death: strip("armored-skeleton", "death", 4, 6),
  },
  "hollow-knifeman": {
    idle: strip("skeleton", "idle", 6, 6, true),
    attack: strip("skeleton", "attack", 6, 10),
    hurt: strip("skeleton", "hurt", 4, 8),
    death: strip("skeleton", "death", 4, 6),
  },
  "ash-scribe": withTop(
    {
      idle: strip("warlock", "idle", 6, 6, true),
      attack: strip("warlock", "attack", 7, 10),
      hurt: strip("warlock", "hurt", 4, 8),
      death: strip("warlock", "death", 11, 8),
    },
    0.33
  ),
  "drowned-cantor": withTop(
    {
      idle: strip("ghostfire", "idle", 6, 8, true),
      attack: strip("ghostfire", "attack", 6, 10),
      hurt: strip("ghostfire", "hurt", 4, 8),
      death: strip("ghostfire", "death", 6, 6),
    },
    0.26
  ),
  // Summoned ally sprites. Most are recolored enemy strips generated by
  // scripts/recolor-sprites.mjs; summon-celestial uses original ophanim art.
  "summon-slime": withFoot(
    {
      idle: strip("summon-slime", "idle", 6, 6, true),
      attack: strip("summon-slime", "attack", 6, 10),
      hurt: strip("summon-slime", "hurt", 4, 8),
      death: strip("summon-slime", "death", 4, 6),
    },
    0.5
  ),
  "summon-fire-elemental": withFoot(
    {
      idle: strip("summon-fire-elemental", "idle", 6, 6, true),
      attack: strip("summon-fire-elemental", "attack", 6, 10),
      hurt: strip("summon-fire-elemental", "hurt", 4, 8),
      death: strip("summon-fire-elemental", "death", 4, 6),
    },
    0.5
  ),
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
  "summon-holy-guardian": withTop(
    withFoot(
      {
        idle: strip("summon-holy-guardian", "idle", 6, 6, true),
        attack: strip("summon-holy-guardian", "attack", 6, 10),
        hurt: strip("summon-holy-guardian", "hurt", 4, 8),
        death: strip("summon-holy-guardian", "death", 4, 6),
      },
      0.72
    ),
    0.27
  ),
  "summon-celestial-guardian": withTop(
    withFoot(
      {
        idle: strip("summon-celestial-guardian", "idle", 6, 6, true),
        attack: strip("summon-celestial-guardian", "attack", 6, 10),
        hurt: strip("summon-celestial-guardian", "hurt", 4, 8),
        death: strip("summon-celestial-guardian", "death", 4, 6),
      },
      0.72
    ),
    0.27
  ),
  "summon-celestial": withTop(
    withFoot(
      {
        idle: strip("summon-celestial", "idle", 6, 6, true),
        attack: strip("summon-celestial", "attack", 6, 10),
        hurt: strip("summon-celestial", "hurt", 4, 8),
        death: strip("summon-celestial", "death", 4, 6),
      },
      0.61
    ),
    0.22
  ),
};

/**
 * Explicit opt-out list for enemies that intentionally use the procedural
 * fallback in combat-scene.ts instead of a sprite strip. A missing entry here
 * is a loud signal that an enemy was added without sprite coverage.
 */
export const PROCEDURAL_ENEMY_SPRITE_OPT_OUTS: Record<string, { reason: string }> = {
  "discordant-cantor": { reason: "procedural choir — no shipped sprite strip" },
  "null-acolyte": { reason: "procedural choir — no shipped sprite strip" },
  "choir-magus": { reason: "procedural choir — no shipped sprite strip" },
  "cistern-wraith": { reason: "procedural wraith — no shipped sprite strip" },
  "weeping-revenant": { reason: "procedural revenant — no shipped sprite strip" },
  "undertow-caller": { reason: "procedural caller — no shipped sprite strip" },
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
