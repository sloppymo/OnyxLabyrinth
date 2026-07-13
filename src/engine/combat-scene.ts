/**
 * FF6-style combat scene — canvas renderer + turn choreography engine.
 *
 * Layout (mirroring FF6):
 *   - Enemies on the LEFT (front row toward center, back row behind),
 *     party on the RIGHT in two staggered columns of animated sprites
 *     facing left.
 *   - The battle scene fills the whole canvas; the FF6 menu windows are DOM
 *     overlays along the bottom (combat-select-action-view.ts).
 *   - A slim blue banner window at the top shows spell/skill names during
 *     playback (drawn here on the canvas).
 *
 * Rhythm: the controller resolves one turn at a time (per-turn combat API)
 * and hands the turn's structured CombatEvents to playTurn(), which builds a
 * timed choreography: walk forward → attack animation → hurt animation +
 * bouncing damage number at the moment of impact → walk back. No text
 * gating — everything is communicated by animation, damage popups (white =
 * damage, green = heal, purple = poison, "MISS") and the spell banner.
 *
 * Sprites: party members use the animated 100×100 strips from
 * party-sprite-cache (pack art faces RIGHT, so the party is drawn mirrored);
 * enemies use enemy-sprite-cache strips when available and fall back to
 * procedural silhouettes.
 */

import type { Character } from "../game/party";
import type { CombatState, CombatEvent, EnemyInstance, SummonedAlly } from "../game/combat";
import { getEnemySpriteStrip, loadEnemySpriteBundle } from "./enemy-sprite-cache";
import { getPartySpriteStrip, type PartySpriteState } from "./party-sprite-cache";
import { getEffectSprite, type EffectSprite } from "./effect-sprite-cache";
import { spellById } from "../data/spells";
import type { SpriteStrip } from "./sprite-manifest";
import combatBgUrl from "../assets/combat-bg.png";

// --- Palette -----------------------------------------------------------------

const COLORS = {
  dmg: "#f5f0e6",
  crit: "#ffd769",
  heal: "#6fe06f",
  poison: "#c080ff",
  miss: "#c8c4b8",
  sp: "#7fb8f0",
  banner: "#f5f0e6",
  cursor: "#ffd700",
  shadow: "rgba(0,0,0,0.35)",
  // Procedural fallback colors (same family as the old renderer).
  classFighter: "#c44",
  classMage: "#48c",
  classPriest: "#e0d0a0",
  classThief: "#4a4",
  classHalberdier: "#a55",
  classDuelist: "#a6c",
  classCrusader: "#ea4",
  enemyFallback: "#8a7a5a",
  spellBurst: "#48c",
} as const;

// --- Layout ------------------------------------------------------------------

/** Party sprite draw size (px, square). Frames are 100×100 but the character
 *  art only fills ~40% of the frame, so draw large. */
const PARTY_SIZE = 210;
/** Enemy sprite draw size for image strips. */
const ENEMY_SIZE = 300;
/** Vertical spacing between members of a party column. */
const PARTY_ROW_SPACING = 78;
/** Vertical spacing between enemies in a row. */
const ENEMY_ROW_SPACING = 78;

/** Screen position (sprite center) of party member at array index i.
 *  The DOM menu windows overlay the bottom of the canvas starting around
 *  y≈365 (six-item menu), so the third rank's feet must stay above that. */
export function partyPos(i: number, w: number, h: number): { x: number; y: number } {
  const front = i < 3;
  const idx = i % 3;
  // FF6 diagonal: each successive member a bit lower and a bit further right.
  // topY keeps the first rank's feet (anchor + ~7% of sprite size — the pack
  // art's baseline, see drawShadow callers) clearly on the floor plane, which
  // starts at h*0.214 in the generated background.
  const colX = front ? w * 0.66 : w * 0.79;
  const topY = h * 0.25 + (front ? 0 : 26);
  return { x: colX + idx * 12, y: topY + idx * PARTY_ROW_SPACING };
}

/** Screen position (sprite center) of an enemy in its row. */
export function enemyPos(
  idxInRow: number,
  row: "front" | "back",
  w: number,
  h: number
): { x: number; y: number } {
  const colX = row === "front" ? w * 0.31 : w * 0.16;
  const topY = h * 0.27 + (row === "back" ? 24 : 0);
  return { x: colX + idxInRow * 14, y: topY + idxInRow * ENEMY_ROW_SPACING };
}

/** Screen position of a summoned ally (between party and enemies). */
export function allyPos(i: number, w: number, h: number): { x: number; y: number } {
  return { x: w * 0.55, y: h * 0.32 + i * PARTY_ROW_SPACING };
}

// --- Background ----------------------------------------------------------------

let combatBgImage: HTMLImageElement | null = null;
function getCombatBg(): HTMLImageElement | null {
  if (!combatBgImage) {
    combatBgImage = new Image();
    combatBgImage.src = combatBgUrl;
  }
  return combatBgImage;
}

// --- Actor animation state -------------------------------------------------------

/** Extended sprite state (party strips + generic mapping for enemies). */
export type ActorSpriteState = PartySpriteState; // idle|walk|attack|cast|hurt|death

export interface ActorAnim {
  state: ActorSpriteState;
  stateStart: number;
  /** Screen-space offset tween from the slot position (walk forward/back). */
  moveFromX: number;
  moveFromY: number;
  moveToX: number;
  moveToY: number;
  moveStart: number;
  moveDuration: number;
  opacity: number;
  /** For enemies: fade out after death completes. */
  fadeOutStart: number | null;
  /** Intensity of the hurt flash (0–1), scaled by damage relative to max HP. */
  hitFlashIntensity: number;
}

export function newActorAnim(now: number): ActorAnim {
  return {
    state: "idle",
    stateStart: now,
    moveFromX: 0,
    moveFromY: 0,
    moveToX: 0,
    moveToY: 0,
    moveStart: now,
    moveDuration: 0,
    opacity: 1,
    fadeOutStart: null,
    hitFlashIntensity: 0,
  };
}

/** Current tweened screen offset for an actor. */
function animOffset(anim: ActorAnim, now: number): { x: number; y: number } {
  if (anim.moveDuration <= 0) return { x: anim.moveToX, y: anim.moveToY };
  const t = Math.min(1, (now - anim.moveStart) / anim.moveDuration);
  // Ease in-out.
  const e = t < 0.5 ? 2 * t * t : 1 - (1 - t) * (1 - t) * 2;
  return {
    x: anim.moveFromX + (anim.moveToX - anim.moveFromX) * e,
    y: anim.moveFromY + (anim.moveToY - anim.moveFromY) * e,
  };
}

function startMove(
  anim: ActorAnim,
  toX: number,
  toY: number,
  duration: number,
  now: number
): void {
  const cur = animOffset(anim, now);
  anim.moveFromX = cur.x;
  anim.moveFromY = cur.y;
  anim.moveToX = toX;
  anim.moveToY = toY;
  anim.moveStart = now;
  anim.moveDuration = duration;
}

function setAnimState(anim: ActorAnim, state: ActorSpriteState, now: number): void {
  anim.state = state;
  anim.stateStart = now;
}

/**
 * Compute the frame index for a strip given the anim state age.
 * Looping strips cycle; non-looping strips hold their last frame.
 */
function frameIndexFor(strip: SpriteStrip, stateAge: number): number {
  const idx = Math.floor((stateAge / 1000) * strip.fps);
  if (strip.loop) return idx % strip.frameCount;
  return Math.min(strip.frameCount - 1, idx);
}

// --- Damage popups ----------------------------------------------------------------

export interface DamagePopup {
  text: string;
  x: number;
  y: number;
  color: string;
  start: number;
  /** Larger text for crits / boss damage. */
  big?: boolean;
}

const POPUP_DURATION = 900;

/** FF6 bounce: quick rise with overshoot, settle, brief hold, fade. */
function popupOffsetY(t: number): number {
  // t in [0,1]. Rise for first 35%, small bounce, hold.
  if (t < 0.2) return -38 * (t / 0.2);
  if (t < 0.35) return -38 + 14 * ((t - 0.2) / 0.15);
  if (t < 0.5) return -24 - 6 * ((t - 0.35) / 0.15);
  return -30;
}

// --- Choreography ------------------------------------------------------------------

interface ChoreoStep {
  at: number; // ms offset from choreo start
  run: (scene: CombatScene, now: number) => void;
  fired: boolean;
}

interface Choreography {
  start: number;
  duration: number;
  steps: ChoreoStep[];
}

// --- Scene state --------------------------------------------------------------------

export interface SceneCursor {
  kind: "enemy" | "party" | "ally";
  id: string;
}

export interface CombatScene {
  state: CombatState;
  partyAnims: Map<string, ActorAnim>;
  enemyAnims: Map<string, ActorAnim>;
  allyAnims: Map<string, ActorAnim>;
  /** Enemies removed from the living arrays but still animating death. */
  enemyCorpses: EnemyInstance[];
  allyCorpses: SummonedAlly[];
  popups: DamagePopup[];
  /** Spell/skill name banner (top window). */
  banner: string | null;
  bannerUntil: number;
  /** Blinking cursor over a selection candidate (target phase). */
  cursor: SceneCursor | null;
  /** The actor whose menu is open (bouncing hand marker). */
  activeActorId: string | null;
  choreo: Choreography | null;
  /** Simple spell burst / projectile / field effects. */
  effects: SceneEffect[];
  /** Screen-shake amount and expiry. */
  screenShake: { amount: number; until: number };
  /** Loose particle effects (sparks, embers, shards). */
  particles: Particle[];
  /** Last update timestamp for frame-rate-independent particle updates. */
  lastUpdate?: number;
}

export interface SceneEffect {
  type: "burst" | "projectile" | "field" | "charge";
  x: number;
  y: number;
  color: string;
  /** Name of the effect sprite strip to draw (from effect-sprite-cache). */
  effect?: string;
  /** Start frame offset for multi-animation sheets (default 0). */
  frameOffset?: number;
  /** Scale factor for the drawn effect. */
  scale?: number;
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
  start: number;
  duration: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  /** Gravity / deceleration. */
  gravity?: number;
  /** If true, render with additive blending. */
  glow?: boolean;
}

export function createScene(state: CombatState): CombatScene {
  // Lazy-load any summon sprite bundles that aren't yet cached (e.g. a
  // summon spell was cast for the first time this session).
  for (const ally of state.summonedAllies) {
    if (ally.spriteId) loadEnemySpriteBundle(ally.spriteId).catch(() => {});
  }
  return {
    state,
    partyAnims: new Map(),
    enemyAnims: new Map(),
    allyAnims: new Map(),
    enemyCorpses: [],
    allyCorpses: [],
    popups: [],
    banner: null,
    bannerUntil: 0,
    cursor: null,
    activeActorId: null,
    choreo: null,
    effects: [],
    screenShake: { amount: 0, until: 0 },
    particles: [],
  };
}

// --- Actor lookup helpers -------------------------------------------------------------

function anims(scene: CombatScene, kind: SceneCursor["kind"]): Map<string, ActorAnim> {
  return kind === "enemy"
    ? scene.enemyAnims
    : kind === "ally"
      ? scene.allyAnims
      : scene.partyAnims;
}

function getAnim(scene: CombatScene, kind: SceneCursor["kind"], id: string, now: number): ActorAnim {
  const map = anims(scene, kind);
  let a = map.get(id);
  if (!a) {
    a = newActorAnim(now);
    map.set(id, a);
  }
  return a;
}

/** Resolve an actor id (character / enemy instance / summon) to kind + position. */
export function findActor(
  scene: CombatScene,
  id: string,
  w: number,
  h: number
): { kind: SceneCursor["kind"]; x: number; y: number; class?: string } | null {
  const s = scene.state;
  const pi = s.party.findIndex((c) => c.id === id);
  if (pi >= 0) {
    const p = partyPos(pi, w, h);
    return { kind: "party", ...p, class: s.party[pi].class };
  }
  for (const row of ["front", "back"] as const) {
    const list = s.enemies[row];
    const idx = list.findIndex((e) => e.instanceId === id);
    if (idx >= 0) {
      const p = enemyPos(idx, row, w, h);
      return { kind: "enemy", ...p };
    }
  }
  const corpseIdx = scene.enemyCorpses.findIndex((e) => e.instanceId === id);
  if (corpseIdx >= 0) {
    const e = scene.enemyCorpses[corpseIdx];
    // Corpses keep their last row slot (end of row).
    const living = scene.state.enemies[e.row].length;
    const p = enemyPos(living + corpseIdx, e.row, w, h);
    return { kind: "enemy", ...p };
  }
  const ai = s.summonedAllies.findIndex((a) => a.id === id);
  if (ai >= 0) {
    const p = allyPos(ai, w, h);
    return { kind: "ally", ...p };
  }
  // Ally corpses keep drawing after removal from summonedAllies (matching
  // how they're rendered: at slots after the living allies).
  const allyCorpseIdx = scene.allyCorpses.findIndex((a) => a.id === id);
  if (allyCorpseIdx >= 0) {
    const p = allyPos(s.summonedAllies.length + allyCorpseIdx, w, h);
    return { kind: "ally", ...p };
  }
  return null;
}

// --- Choreography construction ----------------------------------------------------------

const APPROACH_MS = 350;
const ATTACK_MS = 560;
const PAUSE_BEFORE_ATTACK_MS = 300;
const IMPACT_AT = APPROACH_MS + PAUSE_BEFORE_ATTACK_MS + ATTACK_MS * 0.55;
const RETURN_MS = 280;
const CAST_MS = 600;
const CAST_IMPACT = CAST_MS * 0.65;
const MULTI_TARGET_STAGGER = 90;
const DEATH_FADE_MS = 700;

function step(at: number, run: (scene: CombatScene, now: number) => void): ChoreoStep {
  return { at, run, fired: false };
}

/** How far an attacker steps toward the other side (party steps left, enemies right). */
function approachDelta(kind: SceneCursor["kind"]): number {
  return kind === "enemy" ? 70 : -70;
}

/** Push a damage/heal/miss popup over an actor. */
function pushPopup(
  scene: CombatScene,
  id: string,
  text: string,
  color: string,
  now: number,
  w: number,
  h: number,
  big = false
): void {
  const actor = findActor(scene, id, w, h);
  if (!actor) return;
  // Jitter x slightly so stacked popups (multi-hit) don't overlap exactly.
  const jitter = (scene.popups.length % 3) * 10 - 10;
  scene.popups.push({
    text,
    x: actor.x + jitter,
    y: actor.y - 55,
    color,
    start: now,
    big,
  });
}

/** Trigger hurt anim + popup on a target at impact. */
function impactSteps(
  t: number,
  targetId: string,
  text: string,
  color: string,
  w: number,
  h: number,
  hurt = true,
  big = false,
  effect?: string,
  scale?: number,
  damageAmount?: number
): ChoreoStep[] {
  return [
    step(t, (scene, now) => {
      const actor = findActor(scene, targetId, w, h);
      if (actor && hurt) {
        const anim = getAnim(scene, actor.kind, targetId, now);
        setAnimState(anim, "hurt", now);
        // Scale flash intensity by damage: 0.15 at small hits → 0.6 at big hits.
        const dmg = damageAmount ?? 0;
        anim.hitFlashIntensity = Math.max(0.15, Math.min(0.6, 0.15 + dmg / 200));
      }
      pushPopup(scene, targetId, text, color, now, w, h, big);
      if (actor) {
        if (effect) {
          scene.effects.push({
            type: "burst",
            x: actor.x,
            y: actor.y,
            color,
            effect,
            scale,
            start: now,
            duration: 250,
          });
        }
        if (hurt) {
          addScreenShake(scene, big ? 5 : 2.5, now, big ? 350 : 200);
          spawnImpactParticles(scene, actor.x, actor.y, color, big);
        }
      }
    }),
    // Return the target to idle after the hurt strip finishes (unless dead —
    // a later "defeated" step overrides).
    step(t + 450, (scene, now) => {
      const actor = findActor(scene, targetId, w, h);
      if (!actor) return;
      const anim = getAnim(scene, actor.kind, targetId, now);
      if (anim.state === "hurt") setAnimState(anim, "idle", now);
    }),
  ];
}

/** Add (or increase) screen shake. */
function addScreenShake(scene: CombatScene, amount: number, now: number, duration: number): void {
  scene.screenShake = {
    amount: Math.max(scene.screenShake.amount, amount),
    until: Math.max(scene.screenShake.until, now + duration),
  };
}

/** Spawn a burst of impact particles at (x, y). */
function spawnImpactParticles(
  scene: CombatScene,
  x: number,
  y: number,
  color: string,
  big: boolean
): void {
  const count = big ? 14 : 8;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 2.5;
    scene.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.5,
      life: 0,
      maxLife: 350 + Math.random() * 250,
      size: 2 + Math.random() * 2,
      color,
      gravity: 0.08,
      glow: true,
    });
  }
}

/** Spawn a directional spray of particles from a projectile impact. */
function spawnSparkleParticles(
  scene: CombatScene,
  x: number,
  y: number,
  color: string,
  count: number
): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 2;
    scene.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0,
      maxLife: 400 + Math.random() * 300,
      size: 2 + Math.random() * 2,
      color,
      gravity: 0.05,
      glow: true,
    });
  }
}

// --- Spell visual style mapping ------------------------------------------------

interface EffectStyle {
  color: string;
  /** Projectile effect name (used for single-target casts). */
  projectile?: string;
  /** Burst effect name on impact. */
  burst: string;
  /** Field overlay effect for area/row spells. */
  field?: string;
  /** Default scale for all effect stages. */
  scale?: number;
  /** Per-stage scale overrides (fall back to `scale` then 1). */
  projectileScale?: number;
  burstScale?: number;
  fieldScale?: number;
  /** Optional charge sprite drawn above the caster during the cast animation. */
  charge?: string;
  chargeScale?: number;
  /** Number of parallel projectiles for single-target casts (default 1). */
  projectileCount?: number;
}

const ELEMENT_STYLES: Record<string, EffectStyle> = {
  fire: { color: "#ff8c42", projectile: "fireball", burst: "fire_explosion", field: "large_fire", scale: 2.5, charge: "fireball", chargeScale: 0.4, projectileCount: 1 },
  cold: { color: "#80e0ff", projectile: "wizard_attack2", burst: "ice_burst", field: "ice_burst_glow", scale: 1.2, charge: "ice_burst", chargeScale: 0.4, projectileCount: 1 },
  physical: { color: "#f5f0e6", burst: "zombie_explosion" },
  undead: { color: "#c080ff", projectile: "red_energy", burst: "red_energy", field: "red_energy", scale: 1.3, charge: "red_energy", chargeScale: 0.4, projectileCount: 1 },
  lightning: { color: "#ffd769", projectile: "lightning_blast", burst: "lightning_energy", field: "lightning_energy_glow", scale: 1.3, charge: "lightning_blast", chargeScale: 0.4, projectileCount: 1 },
  poison: { color: "#c080ff", projectile: "red_energy", burst: "red_energy_glow", field: "red_energy_glow", scale: 1.3, charge: "red_energy_glow", chargeScale: 0.4, projectileCount: 1 },
  water: { color: "#4fd0ff", projectile: "fz_water", burst: "fz_water_geyser", field: "fz_water_geyser", scale: 1.6, charge: "fz_water", chargeScale: 0.5, projectileCount: 1 },
  earth: { color: "#b8a080", projectile: "fz_earth_spike", burst: "fz_rocks", field: "fz_rocks", scale: 1.5, charge: "fz_earth_spike", chargeScale: 0.5, projectileCount: 1 },
  wind: { color: "#d0ffe0", projectile: "fz_wind", burst: "fz_tornado", field: "fz_tornado", scale: 1.4, charge: "fz_wind", chargeScale: 0.5, projectileCount: 1 },
};

/** Per-spell visual overrides for alternate effect variants. */
const SPELL_OVERRIDES: Record<string, EffectStyle> = {
  // Fire
  "mage-ember": { color: "#ff8c42", projectile: "fireball", burst: "fire_explosion_glow", field: "large_fire", scale: 2.5 },
  // Cold
  "mage-frostbite": { color: "#80e0ff", projectile: "wizard_attack2", burst: "ice_burst_glow", scale: 1.2 },
  // Poison
  "mage-poison-spray": { color: "#c080ff", projectile: "red_lightning_blast_glow", burst: "red_energy_glow", scale: 1.3 },
  // Priest holy
  "priest-guiding-bolt": { color: "#7fb8f0", projectile: "priest_attack", projectileScale: 1, burst: "lightning_energy_glow", burstScale: 1.3, scale: 1 },
  // Divine (priest smite)
  "priest-divine-smite": { color: "#ffe8a0", projectile: "priest_attack", projectileScale: 1.2, burst: "lightning_energy_glow", burstScale: 1.5, scale: 1.2 },
};

const STATUS_STYLES: Record<string, EffectStyle> = {
  sleep: { color: "#c080ff", burst: "ice_burst_glow" },
  poison: { color: "#c080ff", burst: "red_energy" },
  paralysis: { color: "#c8c4b8", burst: "lightning_energy" },
  blind: { color: "#c8c4b8", burst: "lightning_energy" },
};

export function resolveEffectStyle(
  spellId: string | undefined,
  evt?: { isHeal?: boolean; isBuff?: boolean; isDebuff?: boolean; statusInflicted?: string; statusCured?: string; damage?: number; heal?: number }
): EffectStyle {
  if (spellId && SPELL_OVERRIDES[spellId]) {
    return SPELL_OVERRIDES[spellId];
  }
  const spell = spellId ? spellById(spellId) : undefined;
  if (spell) {
    const eff = spell.effect;
    if (eff.kind === "damage" && eff.element) {
      return ELEMENT_STYLES[eff.element] ?? { color: COLORS.spellBurst, burst: "fire_explosion" };
    }
    if (eff.kind === "heal") {
      return { color: COLORS.heal, projectile: "priest_heal", burst: "priest_heal", scale: 1.2 };
    }
    if (eff.kind === "buff" || eff.kind === "magicScreen") {
      return { color: COLORS.sp, burst: "lightning_energy", field: "lightning_energy", scale: 1.2 };
    }
    if (eff.kind === "cure" || eff.kind === "resurrect") {
      return { color: COLORS.heal, burst: "priest_heal", scale: 1.2 };
    }
    if (eff.kind === "disable" && eff.status) {
      return STATUS_STYLES[eff.status] ?? { color: COLORS.poison, burst: "red_energy" };
    }
    if (eff.kind === "fizzleField" || eff.kind === "dispelMagic") {
      return { color: COLORS.poison, field: "red_energy", burst: "red_energy" };
    }
    if (eff.kind === "summon") {
      return { color: COLORS.sp, burst: "lightning_energy", field: "lightning_energy", scale: 1.2 };
    }
  }

  // Fallback for items or unknown spell IDs.
  const e = evt ?? {};
  if (e.heal !== undefined || e.statusCured || e.isBuff) {
    return { color: COLORS.heal, burst: "priest_heal", scale: 1.2 };
  }
  if (e.statusInflicted) {
    return STATUS_STYLES[e.statusInflicted] ?? { color: COLORS.poison, burst: "red_energy" };
  }
  if (e.isDebuff) {
    return { color: COLORS.poison, burst: "red_energy" };
  }
  if (e.damage !== undefined) {
    return { color: COLORS.dmg, burst: "fire_explosion" };
  }
  return { color: COLORS.spellBurst, burst: "fire_explosion" };
}

function meleeEffectForActor(className: string | undefined): string {
  if (className === "Mage" || className === "Priest") return "staff_attack";
  return "slash_attack";
}

function projectileEffectForActor(className: string | undefined): string {
  if (className === "Thief") return "arrow_archer";
  return "arrow";
}

/**
 * Build and start the choreography for one resolved turn.
 * `events` are the structured CombatEvents appended by that turn (nulls are
 * log-only lines and are skipped — FF6 minimal text). Returns the total
 * playback duration in ms.
 */
export function playTurn(
  scene: CombatScene,
  events: CombatEvent[],
  spellNameFor: (spellId: string) => string,
  now: number,
  w: number,
  h: number,
  techniqueNameFor: (techniqueId: string) => string = () => "Technique"
): number {
  const steps: ChoreoStep[] = [];
  let t = 0;

  // Track whether the acting entity walked forward so we only walk back once.
  let approachedId: string | null = null;
  let approachedKind: SceneCursor["kind"] | null = null;

  const approach = (actorId: string, targetId?: string): void => {
    const actor = findActor(scene, actorId, w, h);
    if (!actor) return;
    approachedId = actorId;
    approachedKind = actor.kind;
    // If we have a target, jump directly toward it; otherwise use the
    // classic fixed-step approach toward the other side.
    let dx: number;
    if (targetId) {
      const target = findActor(scene, targetId, w, h);
      if (target) {
        // Stop just short of the target (offset toward the attacker's side).
        const offset = actor.kind === "party" ? 40 : -40;
        dx = target.x + offset - actor.x;
      } else {
        dx = approachDelta(actor.kind);
      }
    } else {
      dx = approachDelta(actor.kind);
    }
    steps.push(
      step(t, (sc, n) => {
        const a = getAnim(sc, actor.kind, actorId, n);
        setAnimState(a, "walk", n);
        startMove(a, dx, 0, APPROACH_MS, n);
      })
    );
  };

  const returnHome = (): void => {
    if (!approachedId || !approachedKind) return;
    const id = approachedId;
    const kind = approachedKind;
    steps.push(
      step(t, (sc, n) => {
        const a = getAnim(sc, kind, id, n);
        setAnimState(a, "walk", n);
        startMove(a, 0, 0, RETURN_MS, n);
      }),
      step(t + RETURN_MS, (sc, n) => {
        const a = getAnim(sc, kind, id, n);
        if (a.state === "walk") setAnimState(a, "idle", n);
      })
    );
    t += RETURN_MS;
    approachedId = null;
    approachedKind = null;
  };

  const attackAnim = (actorId: string): void => {
    steps.push(
      step(t, (sc, n) => {
        const actor = findActor(sc, actorId, w, h);
        if (!actor) return;
        setAnimState(getAnim(sc, actor.kind, actorId, n), "attack", n);
      }),
      step(t + ATTACK_MS, (sc, n) => {
        const actor = findActor(sc, actorId, w, h);
        if (!actor) return;
        const a = getAnim(sc, actor.kind, actorId, n);
        if (a.state === "attack") setAnimState(a, "idle", n);
      })
    );
  };

  const castAnim = (actorId: string): void => {
    steps.push(
      step(t, (sc, n) => {
        const actor = findActor(sc, actorId, w, h);
        if (!actor) return;
        setAnimState(getAnim(sc, actor.kind, actorId, n), "cast", n);
      }),
      step(t + CAST_MS, (sc, n) => {
        const actor = findActor(sc, actorId, w, h);
        if (!actor) return;
        const a = getAnim(sc, actor.kind, actorId, n);
        if (a.state === "cast") setAnimState(a, "idle", n);
      })
    );
  };

  const showBanner = (text: string, durationMs: number): void => {
    steps.push(
      step(t, (sc, n) => {
        sc.banner = text;
        sc.bannerUntil = n + durationMs;
      })
    );
  };

  // Whether a cast event is in flight; its spellEffect events land at a
  // shared impact time with a stagger.
  let pendingImpactBase: number | null = null;
  let pendingImpactCount = 0;
  let fieldPushed = false;

  for (const evt of events) {
    if (!evt) continue;

    switch (evt.type) {
      case "attack":
      case "ambush":
      case "techniqueHit": {
        const isRanged = evt.type === "attack" && evt.range === "long";
        const attacker = findActor(scene, evt.actorId, w, h);
        const hitEffect = meleeEffectForActor(attacker?.class);
        if (isRanged) {
          // Ranged: no approach; fire a projectile from attacker to target.
          attackAnim(evt.actorId);
          const impact = t + ATTACK_MS * 0.55;
          steps.push(
            step(t + ATTACK_MS * 0.2, (sc, n) => {
              const from = findActor(sc, evt.actorId, w, h);
              const to = findActor(sc, evt.targetId, w, h);
              if (!from || !to) return;
              sc.effects.push({
                type: "projectile",
                x: from.x, y: from.y,
                fromX: from.x, fromY: from.y,
                toX: to.x, toY: to.y,
                color: COLORS.dmg,
                effect: projectileEffectForActor(attacker?.class),
                scale: 2.5,
                start: n,
                duration: impact - (t + ATTACK_MS * 0.2),
              });
            })
          );
          steps.push(
            ...impactSteps(
              impact,
              evt.targetId,
              `${evt.damage}`,
              evt.crit === true ? COLORS.crit : COLORS.dmg,
              w,
              h,
              true,
              evt.crit === true,
              hitEffect,
              1,
              evt.damage
            )
          );
          t += ATTACK_MS + 200;
        } else {
          approach(evt.actorId, evt.targetId);
          const base = t;
          // Approach → pause briefly at the target → attack animation.
          steps.push(
            step(base + APPROACH_MS, (sc, n) => {
              // Arrived — switch to idle for a brief beat before attacking.
              const actor = findActor(sc, evt.actorId, w, h);
              if (!actor) return;
              const a = getAnim(sc, actor.kind, evt.actorId, n);
              if (a.state === "walk") setAnimState(a, "idle", n);
            }),
            step(base + APPROACH_MS + PAUSE_BEFORE_ATTACK_MS, (sc, n) => {
              const actor = findActor(sc, evt.actorId, w, h);
              if (!actor) return;
              setAnimState(getAnim(sc, actor.kind, evt.actorId, n), "attack", n);
            }),
            step(base + APPROACH_MS + PAUSE_BEFORE_ATTACK_MS + ATTACK_MS, (sc, n) => {
              const actor = findActor(sc, evt.actorId, w, h);
              if (!actor) return;
              const a = getAnim(sc, actor.kind, evt.actorId, n);
              if (a.state === "attack") setAnimState(a, "idle", n);
            })
          );
          steps.push(
            ...impactSteps(
              base + IMPACT_AT,
              evt.targetId,
              `${evt.damage}`,
              evt.crit === true ? COLORS.crit : COLORS.dmg,
              w,
              h,
              true,
              evt.crit === true,
              hitEffect,
              1,
              evt.damage
            )
          );
          t = base + APPROACH_MS + PAUSE_BEFORE_ATTACK_MS + ATTACK_MS;
          returnHome();
        }
        break;
      }

      case "miss":
      case "techniqueMiss": {
        if (evt.type === "miss" && evt.reason === "noTarget") break;
        approach(evt.actorId, evt.targetId);
        const base = t;
        steps.push(
          step(base + APPROACH_MS, (sc, n) => {
            const actor = findActor(sc, evt.actorId, w, h);
            if (!actor) return;
            const a = getAnim(sc, actor.kind, evt.actorId, n);
            if (a.state === "walk") setAnimState(a, "idle", n);
          }),
          step(base + APPROACH_MS + PAUSE_BEFORE_ATTACK_MS, (sc, n) => {
            const actor = findActor(sc, evt.actorId, w, h);
            if (!actor) return;
            setAnimState(getAnim(sc, actor.kind, evt.actorId, n), "attack", n);
          })
        );
        if (evt.targetId) {
          steps.push(
            ...impactSteps(base + IMPACT_AT, evt.targetId, "MISS", COLORS.miss, w, h, false)
          );
        }
        steps.push(
          step(base + APPROACH_MS + PAUSE_BEFORE_ATTACK_MS + ATTACK_MS, (sc, n) => {
            const actor = findActor(sc, evt.actorId, w, h);
            if (!actor) return;
            const a = getAnim(sc, actor.kind, evt.actorId, n);
            if (a.state === "attack") setAnimState(a, "idle", n);
          })
        );
        t = base + APPROACH_MS + PAUSE_BEFORE_ATTACK_MS + ATTACK_MS;
        returnHome();
        break;
      }

      case "technique": {
        // Show the technique name as a banner (like spell cast banner).
        showBanner(techniqueNameFor(evt.techniqueId), CAST_MS + 600);
        castAnim(evt.actorId);
        t += CAST_MS * 0.6;
        break;
      }

      case "techniqueStatus": {
        // Status VFX on the target.
        const impactAt = t + 100;
        const status = evt.statusInflicted;
        const effectName = status === "paralysis" ? "lightning_energy"
          : status === "poison" ? "red_energy"
          : status === "slow" ? "ice_burst_glow"
          : status === "armorDown" ? "slash"
          : "lightning_energy_glow";
        const color = status === "poison" ? COLORS.poison
          : status === "paralysis" ? COLORS.dmg
          : COLORS.spellBurst;
        steps.push(
          ...impactSteps(
            impactAt,
            evt.targetId,
            status,
            color,
            w, h, false, false, effectName, 1.2
          )
        );
        t = impactAt + 200;
        break;
      }

      case "techniqueBuff": {
        // Buff VFX on the target (heal, armor buff, etc.).
        const impactAt = t + 100;
        steps.push(
          ...impactSteps(
            impactAt,
            evt.targetId,
            "Buff",
            COLORS.heal,
            w, h, false, false, "lightning_energy_glow", 1.2
          )
        );
        t = impactAt + 200;
        break;
      }

      case "cast": {
        showBanner(spellNameFor(evt.spellId), CAST_MS + 900);
        castAnim(evt.actorId);
        pendingImpactBase = t + CAST_IMPACT;
        pendingImpactCount = 0;
        fieldPushed = false;

        const style = resolveEffectStyle(evt.spellId, evt);
        // Charge sprite gathers above the caster during the cast.
        if (style.charge) {
          steps.push(
            step(t, (sc, n) => {
              const actor = findActor(sc, evt.actorId, w, h);
              if (!actor) return;
              sc.effects.push({
                type: "charge",
                x: actor.x, y: actor.y,
                color: style.color,
                effect: style.charge,
                scale: style.chargeScale ?? style.scale ?? 0.8,
                start: n,
                duration: CAST_IMPACT,
              });
            })
          );
        }

        // For a single target, launch projectile(s) from caster to target.
        if (evt.targetId && style.projectile) {
          const projectileLaunch = t + 100;
          const impact = pendingImpactBase;
          const count = style.projectileCount ?? 1;
          steps.push(
            step(projectileLaunch, (sc, n) => {
              const from = findActor(sc, evt.actorId, w, h);
              const to = findActor(sc, evt.targetId!, w, h);
              if (!from || !to) return;
              for (let i = 0; i < count; i++) {
                const stagger = i * 60;
                const offset = (i - (count - 1) / 2) * 18;
                sc.effects.push({
                  type: "projectile",
                  x: from.x, y: from.y,
                  fromX: from.x, fromY: from.y + offset,
                  toX: to.x, toY: to.y + offset,
                  color: style.color,
                  effect: style.projectile,
                  scale: style.projectileScale ?? style.scale ?? 1,
                  start: n + stagger,
                  duration: impact - projectileLaunch,
                });
              }
            })
          );
        }

        // Enemy casts / items carry their damage/heal directly on the cast event.
        if (evt.targetId && (evt.damage !== undefined || evt.heal !== undefined)) {
          const isHeal = evt.heal !== undefined;
          const text = isHeal ? `${evt.heal}` : `${evt.damage}`;
          steps.push(
            step(pendingImpactBase, (sc, n) => {
              const target = findActor(sc, evt.targetId!, w, h);
              if (target) {
                sc.effects.push({
                  type: "burst",
                  x: target.x, y: target.y,
                  color: style.color,
                  effect: style.burst,
                  scale: style.burstScale ?? style.scale ?? 1,
                  start: n, duration: 400,
                });
                spawnSparkleParticles(sc, target.x, target.y, style.color, isHeal ? 12 : 8);
                if (!isHeal) addScreenShake(sc, isHeal ? 1 : 3, n, 200);
              }
            }),
            ...impactSteps(pendingImpactBase, evt.targetId, text, isHeal ? COLORS.heal : COLORS.dmg, w, h, !isHeal, false, undefined, undefined, evt.damage)
          );
          pendingImpactCount++;
        }
        t += CAST_MS;
        break;
      }

      case "spellEffect": {
        // Lands at the pending cast's impact time (staggered per target),
        // or immediately if there was no cast event (item use etc.).
        const impactAt =
          pendingImpactBase !== null
            ? pendingImpactBase + pendingImpactCount * MULTI_TARGET_STAGGER
            : t;
        pendingImpactCount++;
        const style = resolveEffectStyle(evt.spellId, evt);
        const targetId = evt.targetId;
        const spell = spellById(evt.spellId);
        // Lazy-load summon sprite bundle when a summon spell fires mid-combat.
        if (spell?.effect.kind === "summon" && spell.effect.spriteId) {
          loadEnemySpriteBundle(spell.effect.spriteId).catch(() => {});
        }
        const isArea =
          spell &&
          (spell.target === "allEnemies" ||
            spell.target === "allAllies" ||
            spell.target === "groupEnemies" ||
            spell.target === "groupAllies");
        if (targetId && isArea && !fieldPushed) {
          fieldPushed = true;
          const fieldX =
            spell.target === "allEnemies" || spell.target === "groupEnemies" ? w * 0.26 : w * 0.72;
          steps.push(
            step(impactAt, (sc, n) => {
              sc.effects.push({
                type: "field",
                x: fieldX,
                y: h * 0.42,
                color: style.color,
                effect: style.field ?? style.burst,
                scale: (style.fieldScale ?? style.scale ?? 1) * 2,
                start: n,
                duration: 650,
              });
              addScreenShake(sc, fieldX < w * 0.5 ? 4 : 2, n, 300);
            })
          );
        }

        if (!targetId) {
          // Field-wide spells (fizzle field, dispel) have no single target:
          // burst over the affected side so the cast is visibly doing
          // something. Debuffs land on the enemy side, buffs on the party.
          const fieldX = evt.isDebuff ? w * 0.26 : w * 0.72;
          steps.push(
            step(impactAt, (sc, n) => {
              sc.effects.push({
                type: "field",
                x: fieldX,
                y: h * 0.42,
                color: style.color,
                effect: style.field ?? style.burst,
                scale: (style.fieldScale ?? style.scale ?? 1) * 2,
                start: n,
                duration: 650,
              });
              addScreenShake(sc, evt.isDebuff ? 4 : 2, n, 300);
            })
          );
          t = Math.max(t, impactAt + 300);
          break;
        }

        const isHeal = evt.heal !== undefined || evt.isBuff === true || evt.statusCured !== undefined;
        const text =
          evt.damage !== undefined
            ? `${evt.damage}`
            : evt.heal !== undefined
              ? `${evt.heal}`
              : evt.statusInflicted
                ? evt.statusInflicted.toUpperCase()
                : evt.statusCured
                  ? "CURED"
                  : evt.isBuff
                    ? "UP"
                    : evt.isDebuff
                      ? "DOWN"
                      : "";
        steps.push(
          step(impactAt, (sc, n) => {
            const target = findActor(sc, targetId, w, h);
            if (target) {
              sc.effects.push({
                type: "burst",
                x: target.x, y: target.y,
                color: style.color,
                effect: style.burst,
                scale: style.burstScale ?? style.scale ?? 1,
                start: n, duration: 400,
              });
              spawnSparkleParticles(sc, target.x, target.y, style.color, isHeal ? 12 : 8);
              if (!isHeal && evt.damage !== undefined) {
                addScreenShake(sc, evt.damage && evt.damage > 20 ? 5 : 3, n, 200);
              }
            }
          })
        );
        if (text) {
          steps.push(
            ...impactSteps(
              impactAt,
              targetId,
              text,
              isHeal ? COLORS.heal : evt.damage !== undefined ? COLORS.dmg : COLORS.poison,
              w,
              h,
              evt.damage !== undefined,
              false,
              undefined,
              undefined,
              evt.damage
            )
          );
        }
        t = Math.max(t, impactAt + 300);
        break;
      }

      case "defeated": {
        const targetId = evt.targetId;
        steps.push(
          step(t, (sc, n) => {
            const actor = findActor(sc, targetId, w, h);
            const kind: SceneCursor["kind"] = actor?.kind ?? (evt.wasEnemy ? "enemy" : "party");
            const a = getAnim(sc, kind, targetId, n);
            setAnimState(a, "death", n);
            // Enemies and summoned allies fade out after the death plays;
            // KO'd party members hold the death pose.
            if (kind !== "party") {
              a.fadeOutStart = n + 450;
            }
          })
        );
        t += evt.wasEnemy ? DEATH_FADE_MS : 450;
        break;
      }

      case "revived": {
        steps.push(
          step(t, (sc, n) => {
            const actor = findActor(sc, evt.targetId, w, h);
            if (!actor) return;
            const a = getAnim(sc, actor.kind, evt.targetId, n);
            a.opacity = 1;
            a.fadeOutStart = null;
            setAnimState(a, "idle", n);
            sc.effects.push({
              type: "burst",
              x: actor.x, y: actor.y,
              color: COLORS.heal,
              effect: "priest_heal",
              scale: 1.4,
              start: n, duration: 500,
            });
            spawnSparkleParticles(sc, actor.x, actor.y, COLORS.heal, 16);
            pushPopup(sc, evt.targetId, "REVIVED", COLORS.heal, n, w, h);
          })
        );
        t += 500;
        break;
      }

      case "defend": {
        steps.push(
          step(t, (sc, n) => pushPopup(sc, evt.actorId, "GUARD", COLORS.sp, n, w, h))
        );
        t += 350;
        break;
      }

      case "statusTick": {
        steps.push(
          ...impactSteps(t, evt.targetId, `${evt.damage}`, COLORS.poison, w, h, false, false, undefined, undefined, evt.damage)
        );
        t += 250;
        break;
      }

      case "statusEnd":
        break;

      case "flee": {
        if (!evt.success) showBanner("Can't run away!", 900);
        t += 500;
        break;
      }

      case "silence": {
        showBanner("Silence", 900);
        steps.push(
          step(t, (sc, n) => pushPopup(sc, evt.targetId, "SILENCED", COLORS.poison, n, w, h))
        );
        t += 500;
        break;
      }

      case "fizzle": {
        steps.push(
          step(t, (sc, n) => pushPopup(sc, evt.actorId, "FIZZLE", COLORS.miss, n, w, h))
        );
        t += 400;
        break;
      }

      case "hide": {
        steps.push(
          step(t, (sc, n) => pushPopup(sc, evt.actorId, "HIDDEN", COLORS.sp, n, w, h))
        );
        t += 350;
        break;
      }

      case "spotted": {
        steps.push(
          step(t, (sc, n) => pushPopup(sc, evt.actorId, "SPOTTED!", COLORS.miss, n, w, h))
        );
        t += 350;
        break;
      }
    }
  }

  returnHome();

  // Give trailing popups a beat to play out.
  const duration = t + 260;
  scene.choreo = { start: now, duration, steps };
  return duration;
}

/** True when the current choreography (if any) has fully played out. */
export function isPlaybackDone(scene: CombatScene, now: number): boolean {
  if (!scene.choreo) return true;
  return now - scene.choreo.start >= scene.choreo.duration;
}

/**
 * Sync scene bookkeeping after a turn's state swap: move enemies/allies that
 * died this turn into the corpse lists so their death animations can play
 * even though they're gone from the living arrays.
 */
export function absorbDeaths(scene: CombatScene, state: CombatState): void {
  scene.state = state;
  for (const e of state.justDied) {
    if (!scene.enemyCorpses.some((c) => c.instanceId === e.instanceId)) {
      scene.enemyCorpses.push(e);
    }
  }
  for (const a of state.justDiedAllies) {
    if (!scene.allyCorpses.some((c) => c.id === a.id)) {
      scene.allyCorpses.push(a);
    }
  }
}

// --- Per-frame update ---------------------------------------------------------------

export function updateScene(scene: CombatScene, now: number): void {
  // Fire due choreography steps.
  if (scene.choreo) {
    const elapsed = now - scene.choreo.start;
    for (const s of scene.choreo.steps) {
      if (!s.fired && elapsed >= s.at) {
        s.fired = true;
        s.run(scene, now);
      }
    }
    if (elapsed >= scene.choreo.duration) {
      scene.choreo = null;
    }
  }

  // Death fade-outs.
  for (const map of [scene.enemyAnims, scene.allyAnims]) {
    for (const anim of map.values()) {
      if (anim.fadeOutStart !== null && now >= anim.fadeOutStart) {
        anim.opacity = Math.max(0, 1 - (now - anim.fadeOutStart) / DEATH_FADE_MS);
      }
    }
  }

  // Purge fully faded corpses.
  scene.enemyCorpses = scene.enemyCorpses.filter((e) => {
    const anim = scene.enemyAnims.get(e.instanceId);
    return !anim || anim.opacity > 0;
  });
  scene.allyCorpses = scene.allyCorpses.filter((a) => {
    const anim = scene.allyAnims.get(a.id);
    return !anim || anim.opacity > 0;
  });

  // Expire popups and effects.
  scene.popups = scene.popups.filter((p) => now - p.start < POPUP_DURATION);
  scene.effects = scene.effects.filter((e) => now - e.start < e.duration);

  // Update particles.
  const delta = scene.lastUpdate ? now - scene.lastUpdate : 16;
  scene.lastUpdate = now;
  const dt = delta / 16;
  for (const p of scene.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += (p.gravity ?? 0) * dt;
    p.life += delta;
  }
  scene.particles = scene.particles.filter((p) => p.life < p.maxLife);

  // Update screen shake.
  if (scene.screenShake.until <= now) {
    scene.screenShake.amount = Math.max(0, scene.screenShake.amount * 0.85);
    if (scene.screenShake.amount < 0.1) scene.screenShake.amount = 0;
  }

  // Expire banner.
  if (scene.banner && now >= scene.bannerUntil) scene.banner = null;
}

// --- Drawing ---------------------------------------------------------------------------

function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number): void {
  ctx.fillStyle = COLORS.shadow;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, rx * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Draw one frame of a sprite strip centered at (x, y-baseline), optionally
 * mirrored horizontally. `size` is the square draw size.
 */
function drawStripFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  strip: SpriteStrip,
  frame: number,
  x: number,
  y: number,
  size: number,
  mirror: boolean,
  opacity: number
): void {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x, y);
  if (mirror) ctx.scale(-1, 1);
  ctx.drawImage(
    img,
    frame * strip.frameWidth,
    0,
    strip.frameWidth,
    strip.frameHeight,
    -size / 2,
    -size / 2,
    size,
    size
  );
  ctx.restore();
}

/** Map an actor sprite state onto the enemy strip keys (no walk/cast strips). */
function enemyStripState(state: ActorSpriteState): "idle" | "attacking" | "hit" | "defeated" {
  switch (state) {
    case "attack":
    case "cast":
    case "walk":
      return "attacking";
    case "hurt":
      return "hit";
    case "death":
      return "defeated";
    default:
      return "idle";
  }
}

/** Procedural fallback for enemies with no image strip. */
function drawEnemyFallback(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  enemy: EnemyInstance,
  anim: ActorAnim,
  now: number
): void {
  const w = 104;
  const h = 122;
  ctx.save();
  ctx.globalAlpha = anim.opacity;
  const bob = anim.state === "idle" ? Math.sin(now / 700 + x * 0.02) * 2 : 0;
  const py = y + bob;
  if (anim.state === "death") {
    ctx.translate(x, py);
    ctx.rotate(-Math.PI / 2);
    ctx.translate(-x, -py);
  }
  ctx.fillStyle = enemy.isBoss ? "#a44" : COLORS.enemyFallback;
  ctx.beginPath();
  ctx.ellipse(x, py - h * 0.25, w / 2.4, h / 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eyes face the party (right).
  ctx.fillStyle = "#14110d";
  ctx.fillRect(x + 6, py - h * 0.32, 5, 5);
  ctx.fillRect(x + 18, py - h * 0.32, 5, 5);
  if (anim.state === "hurt") {
    const intensity = anim.hitFlashIntensity || 0.3;
    const sz = 1 + intensity * 0.3;
    ctx.globalAlpha = intensity * 0.5;
    ctx.fillStyle = "#ff4040";
    ctx.beginPath();
    ctx.ellipse(x, py - h * 0.25, (w / 2.2) * sz, (h / 2.8) * sz, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Procedural fallback for party members while sprites are loading. */
function drawPartyFallback(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  char: Character,
  anim: ActorAnim
): void {
  ctx.save();
  ctx.globalAlpha = anim.opacity;
  const colors: Record<string, string> = {
    Fighter: COLORS.classFighter,
    Mage: COLORS.classMage,
    Priest: COLORS.classPriest,
    Thief: COLORS.classThief,
    Halberdier: COLORS.classHalberdier,
    Duelist: COLORS.classDuelist,
    Crusader: COLORS.classCrusader,
  };
  ctx.fillStyle = colors[char.class] ?? "#ccc";
  ctx.fillRect(x - 12, y - 44, 24, 36);
  ctx.beginPath();
  ctx.arc(x, y - 52, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Draw one party member. */
function drawPartyMember(
  ctx: CanvasRenderingContext2D,
  char: Character,
  index: number,
  scene: CombatScene,
  now: number,
  w: number,
  h: number
): void {
  const anim = getAnim(scene, "party", char.id, now);
  const slot = partyPos(index, w, h);
  const off = animOffset(anim, now);
  const x = slot.x + off.x;
  const y = slot.y + off.y;

  const isDead = char.hp <= 0 || char.status.includes("knockedOut");
  if (isDead && anim.state !== "death") setAnimState(anim, "death", now);
  if (!isDead && anim.state === "death") setAnimState(anim, "idle", now);

  const hidden = char.status.includes("hidden");

  // The pack art only fills the middle of the 100px frame: measured feet sit
  // ~7% of the frame below center and the body spans ~25% of the frame wide,
  // so the shadow hugs the visible sprite instead of floating detached below.
  drawShadow(ctx, x, y + PARTY_SIZE * 0.07, PARTY_SIZE * 0.13);

  const stripInfo = getPartySpriteStrip(char.class, anim.state);
  const opacity = (hidden ? 0.35 : 1) * anim.opacity;
  if (stripInfo) {
    const stateAge = now - anim.stateStart;
    const frame = frameIndexFor(stripInfo.strip, stateAge);
    // Pack art faces right; the party faces LEFT toward the enemies.
    drawStripFrame(ctx, stripInfo.img, stripInfo.strip, frame, x, y, PARTY_SIZE, true, opacity);
  } else {
    drawPartyFallback(ctx, x, y, char, anim);
  }

  // Hurt flash overlay.
  if (anim.state === "hurt" && now - anim.stateStart < 200) {
    const intensity = anim.hitFlashIntensity || 0.3;
    const sz = 1 + intensity * 0.3;
    ctx.save();
    ctx.globalAlpha = intensity * 0.4;
    ctx.fillStyle = "#ff4040";
    ctx.fillRect(
      x - (PARTY_SIZE / 4) * sz,
      y - (PARTY_SIZE / 2.4) * sz,
      (PARTY_SIZE / 2) * sz,
      PARTY_SIZE * 0.8 * sz
    );
    ctx.restore();
  }

  // The character art only fills the middle of the frame (measured art top
  // ≈11% of sprite size above center), so anchor the marker just above the
  // visible sprite, not the frame edge.
  drawMarkers(ctx, scene, "party", char.id, x, y - PARTY_SIZE * 0.16, now);
}

/** Draw one enemy (living or corpse). */
function drawEnemy(
  ctx: CanvasRenderingContext2D,
  enemy: EnemyInstance,
  idxInRow: number,
  scene: CombatScene,
  now: number,
  w: number,
  h: number
): void {
  const anim = getAnim(scene, "enemy", enemy.instanceId, now);
  if (anim.opacity <= 0) return;
  const slot = enemyPos(idxInRow, enemy.row, w, h);
  const off = animOffset(anim, now);
  const x = slot.x + off.x;
  const y = slot.y + off.y;

  // Same measured art metrics as the party sprites: feet ~7% below frame
  // center, body ~25% of the frame wide.
  drawShadow(ctx, x, y + ENEMY_SIZE * 0.07, ENEMY_SIZE * 0.13);

  const stripInfo = getEnemySpriteStrip(enemy.id, enemyStripState(anim.state));
  if (stripInfo?.img && stripInfo.img.naturalWidth > 0) {
    const { strip, img } = stripInfo;
    const stateAge = now - anim.stateStart;
    let frame: number;
    if (anim.state === "death") {
      frame = Math.min(strip.frameCount - 1, Math.floor((stateAge / 450) * strip.frameCount));
    } else if (strip.loop || anim.state === "idle") {
      frame = Math.floor((stateAge / 1000) * strip.fps) % strip.frameCount;
    } else {
      frame = Math.min(strip.frameCount - 1, Math.floor((stateAge / 1000) * strip.fps));
    }
    // Enemy strips are authored facing RIGHT — exactly toward the party in
    // the FF6 layout (enemies left, party right) — so no mirroring.
    drawStripFrame(ctx, img, strip, frame, x, y, ENEMY_SIZE, false, anim.opacity);
  } else {
    drawEnemyFallback(ctx, x, y, enemy, anim, now);
  }

  // Hurt flash.
  if (anim.state === "hurt" && now - anim.stateStart < 200) {
    const intensity = anim.hitFlashIntensity || 0.3;
    const sz = 1 + intensity * 0.3;
    ctx.save();
    ctx.globalAlpha = intensity * 0.4;
    ctx.fillStyle = "#ff4040";
    ctx.beginPath();
    ctx.ellipse(x, y, (ENEMY_SIZE / 2.6) * sz, (ENEMY_SIZE / 2.4) * sz, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Tallest enemy art tops out ≈16% of sprite size above center.
  drawMarkers(ctx, scene, "enemy", enemy.instanceId, x, y - ENEMY_SIZE * 0.2, now);
}

/** Draw a summoned ally (sprite if available, otherwise glowing orb). */
function drawAlly(
  ctx: CanvasRenderingContext2D,
  ally: SummonedAlly,
  index: number,
  scene: CombatScene,
  now: number,
  w: number,
  h: number
): void {
  const anim = getAnim(scene, "ally", ally.id, now);
  if (anim.opacity <= 0) return;
  const slot = allyPos(index, w, h);
  const off = animOffset(anim, now);
  const x = slot.x + off.x;
  const y = slot.y + off.y;

  // If the ally has a sprite id, try to draw it like an enemy.
  if (ally.spriteId) {
    const stripInfo = getEnemySpriteStrip(ally.spriteId, enemyStripState(anim.state));
    if (stripInfo?.img && stripInfo.img.naturalWidth > 0) {
      drawShadow(ctx, x, y + ENEMY_SIZE * 0.07, ENEMY_SIZE * 0.13);
      const { strip, img } = stripInfo;
      const stateAge = now - anim.stateStart;
      let frame: number;
      if (anim.state === "death") {
        frame = Math.min(strip.frameCount - 1, Math.floor((stateAge / 450) * strip.frameCount));
      } else if (strip.loop || anim.state === "idle") {
        frame = Math.floor((stateAge / 1000) * strip.fps) % strip.frameCount;
      } else {
        frame = Math.min(strip.frameCount - 1, Math.floor((stateAge / 1000) * strip.fps));
      }
      // Summon sprites face RIGHT (toward enemies), same as enemy art.
      drawStripFrame(ctx, img, strip, frame, x, y, ENEMY_SIZE, false, anim.opacity);
      // Hurt flash.
      if (anim.state === "hurt" && now - anim.stateStart < 200) {
        const intensity = anim.hitFlashIntensity || 0.3;
        const sz = 1 + intensity * 0.3;
        ctx.save();
        ctx.globalAlpha = intensity * 0.4 * anim.opacity;
        ctx.fillStyle = "#ff4040";
        ctx.beginPath();
        ctx.ellipse(x, y, (ENEMY_SIZE / 2.6) * sz, (ENEMY_SIZE / 2.4) * sz, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      drawMarkers(ctx, scene, "ally", ally.id, x, y - ENEMY_SIZE * 0.2, now);
      return;
    }
  }

  // Fallback: glowing orb (original procedural ally).
  drawShadow(ctx, x, y + 26, 20);
  ctx.save();
  ctx.globalAlpha = anim.opacity;
  const bob = Math.sin(now / 500 + index) * 3;
  ctx.fillStyle = COLORS.spellBurst;
  ctx.beginPath();
  ctx.arc(x, y + bob, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COLORS.spellBurst;
  ctx.lineWidth = 2;
  for (let i = -1; i <= 1; i += 2) {
    ctx.beginPath();
    ctx.moveTo(x + i * 9, y + bob);
    ctx.lineTo(x + i * 20, y + bob - 14);
    ctx.stroke();
  }
  ctx.restore();
  drawMarkers(ctx, scene, "ally", ally.id, x, y - 32, now);
}

/** Cursor (target selection) and active-actor hand markers. */
function drawMarkers(
  ctx: CanvasRenderingContext2D,
  scene: CombatScene,
  kind: SceneCursor["kind"],
  id: string,
  x: number,
  topY: number,
  now: number
): void {
  const isCursor = scene.cursor?.kind === kind && scene.cursor.id === id;
  const isActive = kind === "party" && scene.activeActorId === id;
  if (!isCursor && !isActive) return;

  const blink = Math.floor(now / 260) % 2 === 0;
  if (isCursor && !blink) return;

  const bounce = Math.sin(now / 180) * 3;
  ctx.save();
  ctx.fillStyle = COLORS.cursor;
  ctx.strokeStyle = "#14110d";
  ctx.lineWidth = 2;
  const y = topY - 14 + bounce;
  // Downward-pointing FF6 hand-ish triangle.
  ctx.beginPath();
  ctx.moveTo(x - 9, y - 12);
  ctx.lineTo(x + 9, y - 12);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Compute the current frame index for an effect sprite strip. */
function effectFrame(sprite: EffectSprite, start: number, now: number, type: SceneEffect["type"]): number {
  const strip = sprite.strip;
  if (strip.frameCount <= 1 || strip.fps <= 0) return 0;
  const elapsed = Math.max(0, now - start);
  const idx = Math.floor((elapsed / 1000) * strip.fps);
  const shouldLoop = type === "projectile" || type === "charge" || strip.loop === true;
  return shouldLoop ? idx % strip.frameCount : Math.min(strip.frameCount - 1, idx);
}

/** Draw a single effect sprite strip centered at the current origin. */
function drawEffectSprite(
  ctx: CanvasRenderingContext2D,
  effect: SceneEffect,
  type: SceneEffect["type"],
  t: number,
  now: number
): void {
  if (type === "charge") {
    drawChargeSprite(ctx, effect, t, now);
    return;
  }

  if (effect.effect) {
    const sprite = getEffectSprite(effect.effect);
    if (sprite && sprite.img) {
      const strip = sprite.strip;
      const frame = effectFrame(sprite, effect.start, now, type);
      const col = frame % sprite.cols;
      const row = Math.floor(frame / sprite.cols);
      const sx = col * strip.frameWidth;
      const sy = row * strip.frameHeight;
      const scale = effect.scale ?? 1;
      const dw = strip.frameWidth * scale;
      const dh = strip.frameHeight * scale;
      ctx.globalAlpha = type === "burst" ? 1 - t : type === "field" ? 1 - t * 0.5 : 1;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sprite.img, sx, sy, strip.frameWidth, strip.frameHeight, -dw / 2, -dh / 2, dw, dh);
      return;
    }
  }

  // Procedural fallback.
  if (type === "projectile") {
    ctx.fillStyle = effect.color;
    ctx.fillRect(-3, -1, 6, 2);
  } else {
    const radius = 12 + t * 36;
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + t;
      const r = radius * 0.7;
      ctx.fillStyle = effect.color;
      ctx.fillRect(Math.cos(angle) * r - 2, Math.sin(angle) * r - 2, 4, 4);
    }
  }
}

/** Draw a charge sprite pulsing above a caster. */
function drawChargeSprite(
  ctx: CanvasRenderingContext2D,
  effect: SceneEffect,
  t: number,
  now: number
): void {
  if (effect.effect) {
    const sprite = getEffectSprite(effect.effect);
    if (sprite && sprite.img) {
      const strip = sprite.strip;
      const frame = effectFrame(sprite, effect.start, now, "charge");
      const col = frame % sprite.cols;
      const row = Math.floor(frame / sprite.cols);
      const sx = col * strip.frameWidth;
      const sy = row * strip.frameHeight;
      const scale = (effect.scale ?? 1) * (1 + Math.sin(t * Math.PI * 2) * 0.15);
      const dw = strip.frameWidth * scale;
      const dh = strip.frameHeight * scale;
      ctx.globalAlpha = 0.7 + Math.sin(t * Math.PI * 2) * 0.3;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sprite.img, sx, sy, strip.frameWidth, strip.frameHeight, -dw / 2, -dh / 2, dw, dh);
      return;
    }
  }
  // Procedural fallback.
  const radius = 10 + t * 14;
  ctx.globalAlpha = 0.7 - t * 0.4;
  ctx.fillStyle = effect.color;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
}

/** Scene effects: spell bursts, projectiles, and field overlays. */
function drawEffects(ctx: CanvasRenderingContext2D, scene: CombatScene, now: number): void {
  for (const effect of scene.effects) {
    const tRaw = (now - effect.start) / effect.duration;
    const t = Math.min(1, Math.max(0, tRaw));
    ctx.save();
    if (effect.type === "burst" || effect.type === "field") {
      ctx.translate(effect.x, effect.y);
      drawEffectSprite(ctx, effect, effect.type, t, now);
    } else if (effect.type === "charge") {
      ctx.translate(effect.x, effect.y - 60);
      drawEffectSprite(ctx, effect, "charge", t, now);
    } else if (effect.type === "projectile") {
      const fromX = effect.fromX ?? effect.x;
      const fromY = effect.fromY ?? effect.y;
      const toX = effect.toX ?? effect.x;
      const toY = effect.toY ?? effect.y;
      const cx = fromX + (toX - fromX) * t;
      const cy = fromY + (toY - fromY) * t;
      const angle = Math.atan2(toY - fromY, toX - fromX);
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      drawEffectSprite(ctx, effect, "projectile", t, now);
    }
    ctx.restore();
  }
}

/** Draw loose impact particles behind the scene effects. */
function drawParticles(ctx: CanvasRenderingContext2D, scene: CombatScene): void {
  for (const p of scene.particles) {
    const life = p.life / p.maxLife;
    ctx.save();
    ctx.globalAlpha = 1 - life;
    if (p.glow) {
      ctx.globalCompositeOperation = "lighter";
    }
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (1 - life * 0.5), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** FF6-style bouncing damage popups. */
function drawPopups(ctx: CanvasRenderingContext2D, scene: CombatScene, now: number): void {
  for (const p of scene.popups) {
    const t = Math.min(1, (now - p.start) / POPUP_DURATION);
    const alpha = t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1;
    const dy = popupOffsetY(t);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `${p.big ? 30 : 24}px "FF36", monospace`;
    ctx.textAlign = "center";
    // Black outline for readability, FF6-style.
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#14110d";
    ctx.strokeText(p.text, p.x, p.y + dy);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y + dy);
    ctx.restore();
  }
}

/** FF6 blue gradient window (canvas version, used for the top banner). */
export function drawFF6Window(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const r = 6;
  ctx.save();
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, "#3048b0");
  grad.addColorStop(1, "#101c58");
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#e8e8f0";
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#5068c8";
  ctx.stroke();
  ctx.restore();
}

/** Small FF6 window in the top-left showing the current round. */
function drawRoundIndicator(ctx: CanvasRenderingContext2D, scene: CombatScene): void {
  const round = scene.state.round;
  if (round <= 0) return;
  ctx.save();
  ctx.font = '14px "FF36", monospace';
  const text = `Round ${round}`;
  const boxW = ctx.measureText(text).width + 28;
  const boxH = 28;
  drawFF6Window(ctx, 8, 8, boxW, boxH);
  ctx.fillStyle = COLORS.banner;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 8 + boxW / 2, 8 + boxH / 2 + 1);
  ctx.restore();
}

function drawBanner(ctx: CanvasRenderingContext2D, w: number, scene: CombatScene): void {
  if (!scene.banner) return;
  ctx.save();
  ctx.font = '22px "FF36", monospace';
  const textW = ctx.measureText(scene.banner).width;
  const boxW = Math.max(220, textW + 56);
  const boxH = 42;
  const x = (w - boxW) / 2;
  const y = 10;
  drawFF6Window(ctx, x, y, boxW, boxH);
  ctx.fillStyle = COLORS.banner;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(scene.banner, w / 2, y + boxH / 2 + 1);
  ctx.restore();
}

// --- Main render -----------------------------------------------------------------------

export function renderScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scene: CombatScene,
  now: number
): void {
  const s = scene.state;

  // Apply screen shake.
  const shakeT =
    scene.screenShake.until > now
      ? 1
      : Math.max(0, 1 - (now - scene.screenShake.until) / 200);
  const shakeAmount = scene.screenShake.amount * shakeT;
  const shakeX = shakeAmount > 0 ? (Math.random() - 0.5) * shakeAmount : 0;
  const shakeY = shakeAmount > 0 ? (Math.random() - 0.5) * shakeAmount : 0;
  ctx.save();
  ctx.translate(shakeX, shakeY);

  // Background.
  const bg = getCombatBg();
  if (bg?.complete && bg.naturalWidth > 0) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bg, 0, 0, w, h);
  } else {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#1a1612");
    grad.addColorStop(1, "#080705");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // Enemies: back row first, then front (front overlaps back).
  s.enemies.back.forEach((e, i) => drawEnemy(ctx, e, i, scene, now, w, h));
  s.enemies.front.forEach((e, i) => drawEnemy(ctx, e, i, scene, now, w, h));
  // Corpses still fading out (kept at end-of-row slots).
  scene.enemyCorpses.forEach((e, i) => {
    const living = e.row === "front" ? s.enemies.front.length : s.enemies.back.length;
    drawEnemy(ctx, e, living + i, scene, now, w, h);
  });

  // Summoned allies.
  s.summonedAllies.forEach((a, i) => drawAlly(ctx, a, i, scene, now, w, h));
  scene.allyCorpses.forEach((a, i) =>
    drawAlly(ctx, a, s.summonedAllies.length + i, scene, now, w, h)
  );

  // Party: back column first.
  for (let i = 3; i < s.party.length; i++) drawPartyMember(ctx, s.party[i], i, scene, now, w, h);
  for (let i = 0; i < Math.min(3, s.party.length); i++) {
    drawPartyMember(ctx, s.party[i], i, scene, now, w, h);
  }

  // Effects + popups on top.
  drawEffects(ctx, scene, now);
  drawParticles(ctx, scene);
  drawPopups(ctx, scene, now);

  // Banner window (top center) + round indicator (top left).
  drawBanner(ctx, w, scene);
  drawRoundIndicator(ctx, scene);

  ctx.restore();
}
