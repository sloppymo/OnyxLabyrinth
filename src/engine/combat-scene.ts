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
import type { CombatState, CombatEvent, EnemyInstance, SummonedAlly } from "../game/combat-types";
import { getEnemySpriteStrip, loadEnemySpriteBundle } from "./enemy-sprite-cache";
import { getPartySpriteStrip, type PartySpriteState } from "./party-sprite-cache";
import { getEffectSprite, type EffectSprite } from "./effect-sprite-cache";
import { spellById } from "../data/spells";
import { enemyAbilityById } from "../data/enemy-abilities";
import type { SpriteStrip } from "./sprite-manifest";
import combatBgUrl from "../assets/combat-bg.png";
import {
  geometryForBackdrop,
  partySlot,
  enemySlot,
  allySlot,
  resolveSlot,
  ART_FOOT_FROM_TOP,
  artFootFromTopFor,
  artTopFromTopFor,
  visualHeadY,
  MARKER_TIP_GAP_PX,
  type BackdropGeometry,
  type ResolvedSlot,
} from "./combat-scene-math";

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
  cursorKill: "#e05050",
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

/** Party sprite draw size at scale 1.0 (near row). Frames are 100×100 but
 *  character art only fills ~40% of the frame, so draw large. */
const PARTY_SIZE = 300;
/** Enemy sprite draw size at scale 1.0. */
const ENEMY_SIZE = 340;
/** Boss sprites tower over regular enemies (at scale 1.0). */
const BOSS_SIZE = 480;

export type ActorScreenPos = {
  x: number;
  /** Visual center (popups / projectiles / markers). */
  y: number;
  /** Quantized depth scale (0.75 / 0.875 / 1.0). */
  scale: number;
  footY: number;
  drawY: number;
};

function geoFor(backdropId?: string | null): BackdropGeometry {
  return geometryForBackdrop(backdropId);
}

function toScreenPos(r: ResolvedSlot): ActorScreenPos {
  return {
    x: r.x,
    y: r.centerY,
    scale: r.scale,
    footY: r.footY,
    drawY: r.drawY,
  };
}

/** Screen position of party member at array index i (foot-anchored contract). */
export function partyPos(
  i: number,
  w: number,
  _h: number,
  backdropId?: string | null
): ActorScreenPos {
  return toScreenPos(
    resolveSlot(partySlot(i), geoFor(backdropId), {
      spriteHeight: PARTY_SIZE,
      canvasWidth: w,
      artFootFromTop: ART_FOOT_FROM_TOP,
    })
  );
}

/** Screen position of an enemy in its row. */
export function enemyPos(
  idxInRow: number,
  row: "front" | "back",
  w: number,
  _h: number,
  backdropId?: string | null,
  baseSize: number = ENEMY_SIZE
): ActorScreenPos {
  return toScreenPos(
    resolveSlot(enemySlot(idxInRow, row), geoFor(backdropId), {
      spriteHeight: baseSize,
      canvasWidth: w,
      artFootFromTop: ART_FOOT_FROM_TOP,
    })
  );
}

/** Screen position of a summoned ally (between party and enemies). */
export function allyPos(
  i: number,
  w: number,
  _h: number,
  backdropId?: string | null
): ActorScreenPos {
  return toScreenPos(
    resolveSlot(allySlot(i), geoFor(backdropId), {
      spriteHeight: ENEMY_SIZE,
      canvasWidth: w,
      artFootFromTop: ART_FOOT_FROM_TOP,
    })
  );
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
  now: number,
  playbackRate = 1
): void {
  const cur = animOffset(anim, now);
  anim.moveFromX = cur.x;
  anim.moveFromY = cur.y;
  anim.moveToX = toX;
  anim.moveToY = toY;
  anim.moveStart = now;
  // Keep walk/return in sync with a turbo'd choreography clock.
  anim.moveDuration = duration / Math.max(1, playbackRate);
}

function setAnimState(anim: ActorAnim, state: ActorSpriteState, now: number): void {
  anim.state = state;
  anim.stateStart = now;
}

/**
 * Actor sprite strip speed (1 = normal, <1 = slower).
 * Kept separate from effect playback so spell VFX can linger without
 * dragging walk/attack choreography as hard.
 */
const ANIM_SPEED = 0.67;

/**
 * Spell/projectile/burst/field strip speed. Lower than ANIM_SPEED so
 * impact FX read a beat longer instead of flashing through their frames.
 */
const EFFECT_ANIM_SPEED = 0.42;

/**
 * Compute the frame index for a strip given the anim state age.
 * Looping strips cycle; non-looping strips hold their last frame.
 */
function frameIndexFor(strip: SpriteStrip, stateAge: number): number {
  const idx = Math.floor((stateAge / 1000) * strip.fps * ANIM_SPEED);
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

const POPUP_DURATION = 1350;

/** FF6 bounce: quick rise with overshoot, settle, brief hold, fade. */
function popupOffsetY(t: number): number {
  // t in [0,1]. Rise for first 35%, small bounce, hold.
  if (t < 0.2) return -28 * (t / 0.2);
  if (t < 0.35) return -28 + 10 * ((t - 0.2) / 0.15);
  if (t < 0.5) return -18 - 4 * ((t - 0.35) / 0.15);
  return -22;
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
  /** Guaranteed-kill target — draw the hand cursor red. */
  kill?: boolean;
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
  /** When the current banner appeared — drives its fade-in/out. */
  bannerStart: number;
  /** Blinking cursor over a selection candidate (target phase). */
  cursor: SceneCursor | null;
  /** The actor whose menu is open (bouncing hand marker). */
  activeActorId: string | null;
  choreo: Choreography | null;
  /** Playback clock multiplier (1 = normal, 2 = hold-Shift / sticky FAST). */
  playbackRate: number;
  /** Sticky FAST is on — drawn as an on-canvas cue during playback. */
  showFastCue: boolean;
  /** Party Auto is on — drawn as an on-canvas cue. */
  showAutoCue: boolean;
  /** Simple spell burst / projectile / field effects. */
  effects: SceneEffect[];
  /** Screen-shake amount and expiry. */
  screenShake: { amount: number; until: number };
  /** Loose particle effects (sparks, embers, shards). */
  particles: Particle[];
  /** Short-lived additive radial glows drawn on the floor beneath impacts,
   *  under the sprites, so bursts read as light sources in the room. */
  lightGlows: LightGlow[];
  /** Last update timestamp for frame-rate-independent particle updates. */
  lastUpdate?: number;
  /** Baked corridor / arena backdrop. Null falls back to combat-bg.png. */
  backdrop: HTMLCanvasElement | null;
  /** Ground-plane geometry key (arena | theme:fN | combat-bg | corridor). */
  backdropId: string;
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
  /** If true, draw a white additive glow behind the sprite to pop against the blue background. */
  glow?: boolean;
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
  /**
   * Optional hover apex for rise→dash projectiles. When set with
   * `riseFrac`, the missile eases up to this point then rockets to the
   * target so the player can read the sprite before the strike.
   */
  apexX?: number;
  apexY?: number;
  /** Fraction of duration spent rising/hovering (rest is the dash). */
  riseFrac?: number;
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

/** Additive radial floor glow at an impact point, drawn before sprites. */
export interface LightGlow {
  x: number;
  y: number;
  color: string;
  radius: number;
  start: number;
  duration: number;
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
    bannerStart: 0,
    cursor: null,
    activeActorId: null,
    choreo: null,
    playbackRate: 1,
    showFastCue: false,
    showAutoCue: false,
    effects: [],
    screenShake: { amount: 0, until: 0 },
    particles: [],
    lightGlows: [],
    backdrop: null,
    backdropId: "arena",
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
): { kind: SceneCursor["kind"]; x: number; y: number; scale: number; footY: number; class?: string } | null {
  const s = scene.state;
  const bd = scene.backdropId;
  const pi = s.party.findIndex((c) => c.id === id);
  if (pi >= 0) {
    const p = partyPos(pi, w, h, bd);
    return { kind: "party", ...p, class: s.party[pi].class };
  }
  for (const row of ["front", "back"] as const) {
    const list = s.enemies[row];
    const idx = list.findIndex((e) => e.instanceId === id);
    if (idx >= 0) {
      const base = list[idx]!.isBoss ? BOSS_SIZE : ENEMY_SIZE;
      const p = enemyPos(idx, row, w, h, bd, base);
      return { kind: "enemy", ...p };
    }
  }
  const corpseIdx = scene.enemyCorpses.findIndex((e) => e.instanceId === id);
  if (corpseIdx >= 0) {
    const e = scene.enemyCorpses[corpseIdx];
    const living = scene.state.enemies[e.row].length;
    const base = e.isBoss ? BOSS_SIZE : ENEMY_SIZE;
    const p = enemyPos(living + corpseIdx, e.row, w, h, bd, base);
    return { kind: "enemy", ...p };
  }
  const ai = s.summonedAllies.findIndex((a) => a.id === id);
  if (ai >= 0) {
    const p = allyPos(ai, w, h, bd);
    return { kind: "ally", ...p };
  }
  const allyCorpseIdx = scene.allyCorpses.findIndex((a) => a.id === id);
  if (allyCorpseIdx >= 0) {
    const p = allyPos(s.summonedAllies.length + allyCorpseIdx, w, h, bd);
    return { kind: "ally", ...p };
  }
  return null;
}

// --- Choreography construction ----------------------------------------------------------

const APPROACH_MS = 525;
const ATTACK_MS = 840;
const IMPACT_AT = APPROACH_MS + ATTACK_MS * 0.55;
const RETURN_MS = 420;
/** Slightly longer cast window so multishot volleys and charge sprites can breathe. */
const CAST_MS = 1100;
const CAST_IMPACT = CAST_MS * 0.65;
const MULTI_TARGET_STAGGER = 150;
const DEATH_FADE_MS = 1050;
const BURST_MS = 620;
const FIELD_MS = 920;
const PROJECTILE_STAGGER_MS = 90;

/** Scale with a small random ±jitter so identical FX don't stamp perfectly. */
function varyScale(base: number, jitter = 0.16): number {
  if (jitter <= 0) return base;
  return base * (1 + (Math.random() * 2 - 1) * jitter);
}

function step(at: number, run: (scene: CombatScene, now: number) => void): ChoreoStep {
  return { at, run, fired: false };
}

/** How far an attacker steps toward the other side (party steps left, enemies right).
 *  Distances multiply by the actor's depth scale so far-row lunges don't overshoot. */
function approachDelta(kind: SceneCursor["kind"], scale = 1): number {
  return (kind === "enemy" ? 35 : -35) * scale;
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
    y: actor.y - 20 * actor.scale,
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
        // Scale flash intensity by damage: 0.25 at small hits → 0.65 at big hits.
        const dmg = damageAmount ?? 0;
        anim.hitFlashIntensity = Math.max(0.25, Math.min(0.65, 0.25 + dmg / 180));
        // Brief recoil: enemies kick left (toward party), party/allies kick right.
        // Distance scales with damage so a heavy hit reads as a stagger and a
        // scratch barely registers.
        const recoilDir = actor.kind === "enemy" ? -1 : 1;
        const recoilPx = Math.max(5, Math.min(16, 5 + dmg / 25));
        startMove(anim, recoilDir * recoilPx * actor.scale, 0, 80, now, scene.playbackRate);
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
          pushLightGlow(scene, actor.x, actor.y, color, big ? 110 : 80, now, 320);
        }
      }
    }),
    // Ease recoil home, then return to idle after the hurt strip.
    step(t + 80, (scene, now) => {
      const actor = findActor(scene, targetId, w, h);
      if (!actor || !hurt) return;
      const anim = getAnim(scene, actor.kind, targetId, now);
      startMove(anim, 0, 0, 120, now, scene.playbackRate);
    }),
    step(t + 450, (scene, now) => {
      const actor = findActor(scene, targetId, w, h);
      if (!actor) return;
      const anim = getAnim(scene, actor.kind, targetId, now);
      if (anim.state === "hurt") setAnimState(anim, "idle", now);
    }),
  ];
}

/** Add (or increase) screen shake. Capped so big spells never nauseate. */
function addScreenShake(scene: CombatScene, amount: number, now: number, duration: number): void {
  scene.screenShake = {
    amount: Math.min(8, Math.max(scene.screenShake.amount, amount)),
    until: Math.max(scene.screenShake.until, now + duration),
  };
}

/**
 * Screen-shake amount for a spell impact, scaled by spell tier so a T1 Spark
 * taps the camera while a T6 Meteor Swarm rattles it. Falls back to the old
 * damage heuristic for unknown IDs (items, enemy abilities), and never
 * shakes *less* than that heuristic did.
 */
function spellShakeAmount(spellId: string | undefined, damage?: number): number {
  const dmgAmount = damage !== undefined && damage > 20 ? 5 : 3;
  const spell = spellId ? spellById(spellId) : undefined;
  if (!spell) return dmgAmount;
  const tierAmount = Math.min(6.5, 2.5 + (spell.tier - 1) * 0.8);
  return Math.max(tierAmount, dmgAmount);
}

/**
 * Burst linger scaled by spell tier: T1–T3 keep the standard BURST_MS,
 * higher tiers hold the explosion on screen longer (T4 +90ms … capped ~980ms)
 * so endgame nukes briefly dominate the battlefield.
 */
function burstDurationFor(spellId: string | undefined): number | undefined {
  const spell = spellId ? spellById(spellId) : undefined;
  if (!spell) return undefined;
  return Math.min(BURST_MS + 360, BURST_MS + Math.max(0, spell.tier - 3) * 90);
}

/**
 * Push a short-lived additive floor glow beneath an impact so the burst
 * reads as a light source in the room, not an overlay. Drawn before sprites
 * in renderScene; capped so stacked multi-hits can't blow the frame out.
 */
function pushLightGlow(
  scene: CombatScene,
  x: number,
  y: number,
  color: string,
  radius: number,
  now: number,
  duration: number
): void {
  if (scene.lightGlows.length >= 6) scene.lightGlows.shift();
  scene.lightGlows.push({ x, y: y + 24, color, radius, start: now, duration });
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
  /** Number of parallel / raining projectiles (default 1). Higher for big spells. */
  projectileCount?: number;
  /** ±fraction applied to each projectile's scale (default 0.14 when count>1). */
  projectileScaleJitter?: number;
  /** Extra burst copies around the impact point (default 1). */
  burstCount?: number;
  /** Override linger for burst / field (defaults BURST_MS / FIELD_MS). */
  burstDurationMs?: number;
  fieldDurationMs?: number;
  /**
   * `riseDash` (default when set): projectile rises slowly above the caster
   * so the sprite can be read, then snaps toward the target. Omitted /
   * `straight` keeps the old linear fly-to.
   */
  projectilePath?: "straight" | "riseDash";
  /** Rise phase fraction of total flight (default 0.58 for riseDash). */
  riseFrac?: number;
  /** How far above the caster the hover apex sits, in px (default 72). */
  riseLift?: number;
  /** If true, draw a white additive glow behind the burst/field to make it pop against the blue background. */
  glow?: boolean;
}

/** Push one or more bursts around (x,y) with mild scale/position variety.
 *  `durationOverride` (tier-scaled) applies when the style has no explicit
 *  `burstDurationMs`. */
function pushBursts(
  scene: CombatScene,
  x: number,
  y: number,
  style: EffectStyle,
  now: number,
  durationOverride?: number
): void {
  const count = Math.max(1, style.burstCount ?? 1);
  const duration = style.burstDurationMs ?? durationOverride ?? BURST_MS;
  const base = style.burstScale ?? style.scale ?? 1;
  for (let i = 0; i < count; i++) {
    const ox = count > 1 ? (i - (count - 1) / 2) * 24 + (Math.random() * 12 - 6) : 0;
    const oy = count > 1 ? Math.random() * 18 - 9 : 0;
    scene.effects.push({
      type: "burst",
      x: x + ox,
      y: y + oy,
      color: style.color,
      effect: style.burst,
      scale: varyScale(base, count > 1 ? 0.22 : 0.1),
      glow: style.glow,
      start: now + i * 45,
      duration: duration + i * 40,
    });
  }
  // Light the floor under the burst so the spell illuminates the room.
  const glowRadius = Math.min(190, 60 + base * 28);
  pushLightGlow(scene, x, y, style.color, glowRadius, now, Math.max(320, duration * 0.7));
}

/** Launch a volley of projectiles from → to with stagger and scale jitter. */
function pushProjectileVolley(
  scene: CombatScene,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  style: EffectStyle,
  now: number,
  duration: number,
  count: number
): void {
  const base = style.projectileScale ?? style.scale ?? 1;
  const jitter = style.projectileScaleJitter ?? (count > 1 ? 0.18 : 0.08);
  const riseDash = style.projectilePath === "riseDash";
  const riseFrac = style.riseFrac ?? 0.58;
  const riseLift = style.riseLift ?? 72;
  // Rise→dash needs a longer flight window so the hover is readable; also
  // stagger less so the last missile still has time to dash before impact.
  const staggerMs = riseDash ? Math.min(PROJECTILE_STAGGER_MS, 55) : PROJECTILE_STAGGER_MS;
  const flight = riseDash ? Math.max(560, duration) : Math.max(220, duration);
  for (let i = 0; i < count; i++) {
    const stagger = i * staggerMs;
    const offset = (i - (count - 1) / 2) * 18;
    const drift = count > 1 ? Math.random() * 14 - 7 : 0;
    const startX = fromX;
    const startY = fromY + offset + drift;
    scene.effects.push({
      type: "projectile",
      x: startX,
      y: startY,
      fromX: startX,
      fromY: startY,
      toX: toX,
      toY: toY + offset * 0.6 + drift * 0.5,
      apexX: riseDash ? startX + offset * 0.35 + drift * 0.4 : undefined,
      apexY: riseDash ? startY - riseLift - Math.abs(offset) * 0.15 : undefined,
      riseFrac: riseDash ? riseFrac : undefined,
      color: style.color,
      effect: style.projectile,
      scale: varyScale(base, jitter),
      start: now + stagger,
      duration: Math.max(riseDash ? 480 : 220, flight - stagger * 0.35),
    });
  }
}

/**
 * Sample a projectile's screen position / facing at normalized time t∈[0,1].
 * Exported for unit tests — rise→dash spends `riseFrac` floating up to the
 * apex, then eases hard into the strike so the sprite is readable first.
 */
export function sampleProjectilePose(
  t: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  opts?: { apexX?: number; apexY?: number; riseFrac?: number }
): { x: number; y: number; angle: number; phase: "rise" | "dash" | "straight" } {
  const clamped = Math.min(1, Math.max(0, t));
  const apexX = opts?.apexX;
  const apexY = opts?.apexY;
  const riseFrac = opts?.riseFrac;
  if (
    apexX !== undefined &&
    apexY !== undefined &&
    riseFrac !== undefined &&
    riseFrac > 0.05 &&
    riseFrac < 0.95
  ) {
    if (clamped < riseFrac) {
      const u = clamped / riseFrac;
      // Ease-out: leave the hand quickly, settle into a hover above the head.
      const e = 1 - Math.pow(1 - u, 2.4);
      return {
        x: fromX + (apexX - fromX) * e,
        y: fromY + (apexY - fromY) * e,
        // Face mostly upward while rising so the sprite reads as an icon.
        angle: -Math.PI / 2 + Math.atan2(apexX - fromX, fromY - apexY) * 0.25,
        phase: "rise",
      };
    }
    const u = (clamped - riseFrac) / (1 - riseFrac);
    // Brief hang at the apex, then accelerate hard so most of the travel
    // packs into the final beat (read the sprite → whip to the target).
    const hold = 0.18;
    let e: number;
    if (u <= hold) {
      e = (u / hold) * 0.04;
    } else {
      const v = (u - hold) / (1 - hold);
      e = 0.04 + Math.pow(v, 1.65) * 0.96;
    }
    return {
      x: apexX + (toX - apexX) * e,
      y: apexY + (toY - apexY) * e,
      angle: Math.atan2(toY - apexY, toX - apexX),
      phase: "dash",
    };
  }
  return {
    x: fromX + (toX - fromX) * clamped,
    y: fromY + (toY - fromY) * clamped,
    angle: Math.atan2(toY - fromY, toX - fromX),
    phase: "straight",
  };
}

/** Sky-rain volley used by AOE nukes that declare a projectile + count>1. */
function pushAreaProjectileRain(
  scene: CombatScene,
  style: EffectStyle,
  now: number,
  duration: number,
  enemySide: boolean,
  w: number,
  h: number
): void {
  if (!style.projectile) return;
  const count = Math.max(1, style.projectileCount ?? 1);
  const baseX = enemySide ? w * 0.14 : w * 0.58;
  const spanX = w * 0.28;
  const base = style.projectileScale ?? style.scale ?? 1;
  const jitter = style.projectileScaleJitter ?? 0.22;
  for (let i = 0; i < count; i++) {
    const tx = baseX + Math.random() * spanX;
    const ty = h * 0.28 + Math.random() * h * 0.22;
    const fx = tx + (Math.random() * 40 - 20);
    const fy = h * 0.04 + Math.random() * 20;
    scene.effects.push({
      type: "projectile",
      x: fx,
      y: fy,
      fromX: fx,
      fromY: fy,
      toX: tx,
      toY: ty,
      color: style.color,
      effect: style.projectile,
      scale: varyScale(base * (0.75 + Math.random() * 0.45), jitter),
      start: now + i * PROJECTILE_STAGGER_MS,
      duration: Math.max(260, duration - i * 35),
    });
  }
}

const ELEMENT_STYLES: Record<string, EffectStyle> = {
  fire: {
    color: "#ff8c42",
    projectile: "fz_fireball",
    projectileScale: 0.7,
    burst: "mp_fire_bomb",
    burstScale: 1.15,
    field: "large_fire",
    scale: 2.5,
    charge: "fz_fireball",
    chargeScale: 0.15,
    projectileCount: 1,
    projectilePath: "riseDash",
    riseFrac: 0.56,
    riseLift: 68,
  },
  cold: {
    color: "#d6f7ff",
    projectile: "px_ice_lance",
    projectileScale: 2.5,
    burst: "ice_burst_glow",
    burstScale: 1.2,
    field: "ice_burst_glow",
    fieldScale: 1.2,
    scale: 1.2,
    charge: "px_ice_lance",
    chargeScale: 0.4,
    projectileCount: 1,
    glow: true,
    projectilePath: "riseDash",
    riseFrac: 0.55,
    riseLift: 70,
  },
  // Physical was previously burst-only with no field/charge; the retro2
  // crescent-slash reads as a blade arc, a much better fit than the
  // undead-shared zombie_explosion.
  physical: { color: "#f5f0e6", burst: "retro2_crescent_slash", burstScale: 1.3, field: "retro_crescent_arc", fieldScale: 1.1 },
  undead: { color: "#c080ff", projectile: "red_lightning_blast", burst: "zombie_explosion", field: "red_energy_glow", scale: 1.3, charge: "red_lightning_blast_glow", chargeScale: 0.4, projectileCount: 1 },
  lightning: {
    color: "#ffd769",
    projectile: "lightning_blast",
    burst: "mp_lightning",
    burstScale: 1.1,
    field: "lightning_energy_glow",
    scale: 1.8,
    charge: "lightning_blast",
    chargeScale: 0.4,
    projectileCount: 1,
  },
  // Poison — plant missile into verdant bloom (was red-lightning + verdant).
  poison: {
    color: "#c080ff",
    projectile: "px_plant_missle",
    projectileScale: 2.6,
    burst: "retro2_verdant_burst",
    burstScale: 1.2,
    field: "red_energy_glow",
    scale: 1.6,
    charge: "px_plant_missle",
    chargeScale: 0.45,
    projectileCount: 1,
  },
  water: {
    color: "#a0f0ff",
    projectile: "fz_water",
    burst: "fz_water_geyser",
    field: "fz_water_geyser",
    scale: 1.6,
    charge: "fz_water",
    chargeScale: 0.5,
    projectileCount: 1,
    glow: true,
    projectilePath: "riseDash",
    riseFrac: 0.54,
    riseLift: 64,
  },
  earth: {
    color: "#b8a080",
    projectile: "fz_earth_spike",
    burst: "fz_rocks",
    field: "retro2_earth_swirl",
    fieldScale: 1.4,
    scale: 1.5,
    charge: "retro2_earth_swirl",
    chargeScale: 0.45,
    projectileCount: 1,
    projectilePath: "riseDash",
    riseFrac: 0.52,
    riseLift: 58,
  },
  wind: { color: "#d0ffe0", projectile: "fz_wind", burst: "fz_tornado", field: "fz_tornado", scale: 1.4, charge: "fz_wind", chargeScale: 0.5, projectileCount: 1 },
  // Divine had no entry at all — any damage-element "divine" spell without a
  // SPELL_OVERRIDE was silently falling back to the generic fire_explosion.
  // Only priest-divine-smite currently uses this element and it has its own
  // override below, but this closes the gap for any future divine spell.
  divine: { color: "#ffe8a0", burst: "retro_starburst", burstScale: 1.6, field: "retro_sun_ring", fieldScale: 1.3, charge: "retro_sun_ring", chargeScale: 0.5 },
};

/** Per-spell visual overrides for alternate effect variants. */
const SPELL_OVERRIDES: Record<string, EffectStyle> = {
  // --- T1 bolts: Pixelart strips so early casts aren't miniature Fireballs ---
  "mage-fire-bolt": {
    color: "#ff8c42",
    projectile: "px_fireball",
    projectileScale: 2.8,
    projectilePath: "riseDash",
    riseFrac: 0.55,
    riseLift: 64,
    burst: "px_firebomb",
    burstScale: 6.5,
  },
  "mage-ember": {
    color: "#ff8c42",
    projectile: "px_fireball",
    projectileScale: 2.5,
    projectilePath: "riseDash",
    riseFrac: 0.56,
    riseLift: 66,
    burst: "fz_explosion",
    burstScale: 1.15,
  },
  "mage-spark": {
    color: "#d0e8ff",
    projectile: "px_arcane_bolt",
    projectileScale: 2.8,
    projectilePath: "riseDash",
    riseFrac: 0.54,
    riseLift: 62,
    burst: "px_magic_sparks",
    burstScale: 6.0,
  },
  "mage-frostbite": {
    color: "#d6f7ff",
    projectile: "px_ice_lance",
    projectileScale: 2.4,
    projectilePath: "riseDash",
    riseFrac: 0.55,
    riseLift: 64,
    burst: "ice_burst",
    burstScale: 1.15,
    glow: true,
  },
  "mage-water-bolt": {
    color: "#a0f0ff",
    projectile: "px_water_bolt",
    projectileScale: 2.8,
    projectilePath: "riseDash",
    riseFrac: 0.54,
    riseLift: 64,
    burst: "px_splash",
    burstScale: 6.5,
    glow: true,
  },
  "mage-tidal-wave": {
    color: "#a0f0ff",
    projectile: "px_water_orb",
    projectileScale: 2.6,
    projectileCount: 2,
    projectilePath: "riseDash",
    riseFrac: 0.56,
    riseLift: 70,
    burst: "px_water_blast",
    burstScale: 7.0,
    field: "fz_water_geyser",
    fieldScale: 1.2,
    glow: true,
  },
  "mage-stone-shard": {
    color: "#b8a080",
    projectile: "px_rock_sling",
    projectileScale: 2.8,
    projectilePath: "riseDash",
    riseFrac: 0.52,
    riseLift: 58,
    burst: "fz_rocks",
    burstScale: 1.1,
    field: "retro2_earth_swirl",
    fieldScale: 1.4,
    charge: "retro2_earth_swirl",
    chargeScale: 0.45,
  },
  "mage-gust": {
    color: "#d0ffe0",
    projectile: "px_wind_bolt",
    projectileScale: 2.8,
    projectilePath: "riseDash",
    riseFrac: 0.54,
    riseLift: 62,
    burst: "fz_wind",
    burstScale: 1.2,
  },
  "mage-arcane-ward": {
    color: "#7fe0e0",
    burst: "px_magic_orb",
    burstScale: 5.5,
    field: "px_shield",
    fieldScale: 0.75,
    scale: 1.15,
  },
  "priest-cure-wounds": {
    color: "#8fffb0",
    projectile: "heal_sparks",
    projectileScale: 1.8,
    burst: "px_magic_sparks",
    burstScale: 5.5,
    scale: 1.15,
  },

  // Fire — mid/high fire spells get multishot + bigger uneven bursts.
  "mage-fireball": {
    color: "#ff8c42",
    projectile: "fz_fireball",
    projectileScale: 0.78,
    projectileCount: 2,
    projectilePath: "riseDash",
    riseFrac: 0.6,
    riseLift: 76,
    burst: "mp_fire_bomb",
    burstScale: 1.55,
    burstCount: 2,
    field: "mp_fire_bomb",
    fieldScale: 1.4,
  },
  // Immolate — mushroom-cloud column + 3 staggered fireballs.
  "mage-immolate": {
    color: "#ff8c42",
    projectile: "fz_fireball",
    projectileScale: 0.72,
    projectileCount: 3,
    projectilePath: "riseDash",
    riseFrac: 0.62,
    riseLift: 80,
    burst: "retro_fire_mushroom",
    burstScale: 1.95,
    burstCount: 2,
    field: "retro_fire_mushroom",
    fieldScale: 1.55,
  },
  "mage-burning-hands": { color: "#ff8c42", burst: "px_firebomb", burstScale: 2.4, burstCount: 2, field: "px_firebomb", fieldScale: 2.2 },
  // Priest holy — dedicated holy-bolt art instead of the generic priest_attack strip,
  // one variant per spell so Guiding Bolt / Sacred Flame / Divine Smite read as distinct.
  "priest-sacred-flame": {
    color: "#ffe27a",
    projectile: "px_bolt_purity",
    projectileScale: 2.5,
    projectilePath: "riseDash",
    riseFrac: 0.6,
    riseLift: 74,
    burst: "heal_sparks",
    burstScale: 2.4,
    scale: 1,
  },
  "priest-guiding-bolt": {
    color: "#7fb8f0",
    projectile: "px_light_bolt",
    projectileScale: 2.4,
    projectileCount: 2,
    projectilePath: "riseDash",
    riseFrac: 0.58,
    riseLift: 72,
    burst: "heal_sparks",
    burstScale: 2.3,
    scale: 1,
  },
  // Divine Smite — dual purity bolts into a bigger corona.
  "priest-divine-smite": {
    color: "#ffe8a0",
    projectile: "px_pure_bolt_2",
    projectileScale: 2.55,
    projectileCount: 2,
    projectilePath: "riseDash",
    riseFrac: 0.62,
    riseLift: 82,
    burst: "retro_starburst",
    burstScale: 2.35,
    burstCount: 2,
    field: "retro_sun_ring",
    fieldScale: 1.5,
    scale: 1.2,
  },
  // Summons — Foozle portal swirl per school (base purple / orange fire / gold holy).
  "mage-summon-fire-elemental": { color: "#ff9a3a", burst: "fz_portal_orange", burstScale: 1.3, field: "fz_portal_orange", fieldScale: 0.7 },
  "mage-conjure-elemental": { color: "#c080ff", burst: "fz_portal", burstScale: 1.2, field: "fz_portal", fieldScale: 0.7 },
  "mage-gate": { color: "#c080ff", burst: "fz_portal", burstScale: 1.6, field: "fz_portal", fieldScale: 0.9, charge: "retro3_sigil_charge", chargeScale: 0.35 },
  "priest-summon-guardian": { color: "#ffe27a", burst: "fz_portal_gold", burstScale: 1.2, field: "fz_portal_gold", fieldScale: 0.7 },
  "priest-summon-celestial-guardian": { color: "#ffe27a", burst: "fz_portal_gold", burstScale: 1.5, field: "fz_portal_gold", fieldScale: 0.8 },
  "priest-summon-celestial": { color: "#ffe27a", burst: "fz_portal_gold", burstScale: 1.3, field: "fz_portal_gold", fieldScale: 0.7 },
  // Sunburst — Free pack flower burst for the flash, retro2 solar-ring field
  // for the lingering sacred corona (was the same burst twice).
  "priest-sunburst": {
    color: "#ffd76a",
    burst: "free_sunburst",
    burstScale: 1.55,
    burstCount: 2,
    field: "retro2_solar_ring",
    fieldScale: 1.5,
  },
  // Cold AOEs — ice lances rain before the field lands.
  "mage-cone-of-cold": {
    color: "#d6f7ff",
    projectile: "px_ice_lance",
    projectileScale: 2.2,
    projectileCount: 2,
    burst: "ice_burst_glow",
    burstScale: 1.35,
    burstCount: 2,
    field: "ice_burst_glow",
    fieldScale: 1.3,
    glow: true,
  },
  "mage-ice-storm": {
    color: "#d6f7ff",
    projectile: "px_ice_lance",
    projectileScale: 2.0,
    projectileCount: 4,
    burst: "ice_burst_dark",
    burstScale: 1.55,
    burstCount: 2,
    field: "ice_burst_glow",
    fieldScale: 1.45,
    glow: true,
  },
  // Web — shares STATUS_STYLES.paralysis's status kind with Hold Person/Power Word
  // Stun, but needs its own tangled-vine look rather than the shared "stun stars" burst.
  "mage-web": { color: "#c8c4b8", field: "free_tangle", fieldScale: 1.3, burst: "free_tangle", burstScale: 1.3 },
  // Silence/Dispel — a ward-ring sigil in place of the generic red_energy field.
  "mage-silence": { color: "#7fe0e0", field: "free_wardring", fieldScale: 0.7, burst: "free_wardring", burstScale: 1.1 },
  "mage-dispel-magic": { color: "#7fe0e0", field: "free_wardring", fieldScale: 0.7, burst: "free_wardring", burstScale: 1.1 },

  // --- New impact-pack overrides (2026 sprite additions) -------------------

  // Tempest — wind rain + long cross field.
  "mage-tempest": {
    color: "#d0ffe0",
    projectile: "fz_wind",
    projectileScale: 1.1,
    projectileCount: 3,
    burst: "retro2_wind_pinwheel",
    burstScale: 1.7,
    burstCount: 2,
    field: "retro3_wind_cross",
    fieldScale: 1.3,
    charge: "fz_wind",
    chargeScale: 0.5,
  },
  // Rock Slide — mid-tier earth AOE keeps rock bursts but layers the
  // earth-swirl field so it sits between Stone Shard (element default) and Quake.
  "mage-rock-slide": {
    color: "#b8a080",
    projectile: "fz_earth_spike",
    projectileScale: 1.15,
    projectileCount: 3,
    burst: "fz_rocks",
    burstScale: 1.4,
    burstCount: 2,
    field: "retro2_earth_swirl",
    fieldScale: 1.6,
    charge: "retro2_earth_swirl",
    chargeScale: 0.4,
  },
  // Quake — horizontal shockwave; twin bursts sell the ground rupture.
  "mage-quake": {
    color: "#b8a080",
    burst: "retro_shockwave",
    burstScale: 2.05,
    burstCount: 2,
    field: "retro_shockwave",
    fieldScale: 1.85,
  },
  // Deluge — geyser rain into aqua-vortex field.
  "mage-deluge": {
    color: "#4fd0ff",
    projectile: "fz_water",
    projectileScale: 1.05,
    projectileCount: 3,
    burst: "fz_water_geyser",
    burstScale: 1.45,
    burstCount: 2,
    field: "retro2_aqua_vortex",
    fieldScale: 1.5,
    charge: "fz_water",
    chargeScale: 0.5,
  },
  // Spell Shield — a distinct rounded ward-square instead of the generic
  // px_shield used by every other buff/magicScreen spell.
  "mage-spell-shield": { color: "#7fe0e0", burst: "retro2_ward_square", burstScale: 1.6, field: "retro2_ward_square", fieldScale: 0.9, scale: 1.2 },
  // Neutralize Poison — a purifying white sigil burst distinguishes it from
  // the other "cure" spells, which otherwise all share the plain heal look.
  "priest-neutralize-poison": { color: "#f5f0e6", burst: "retro2_arcane_sigil", burstScale: 1.5, scale: 1.2 },
  // Mass Heal — layers a soft radiant bloom field under the existing
  // priest_heal projectile/burst for the AOE-tier heal.
  "priest-mass-heal": { color: "#8fffb0", projectile: "priest_heal", burst: "priest_heal", burstCount: 2, field: "retro3_arcane_bloom", fieldScale: 1.2, scale: 1.25 },
  // Raise Dead — a radiating dot-flower burst for the moment a fallen ally
  // returns, distinct from ordinary healing.
  "priest-raise-dead": { color: "#ffe27a", burst: "retro_dot_flower", burstScale: 2.0, burstCount: 2, scale: 1.3 },

  // --- T6–T7 endgame ---------------------------------------------------------
  "mage-meteor-swarm": {
    color: "#ff6a20",
    projectile: "fz_molten_spear",
    projectileScale: 0.95,
    // Rain of variously-sized meteors before the mushroom/bomb field.
    projectileCount: 5,
    projectileScaleJitter: 0.35,
    burst: "fz_explosion",
    burstScale: 1.85,
    burstCount: 3,
    field: "retro_fire_mushroom",
    fieldScale: 1.65,
    fieldDurationMs: 1100,
    charge: "fz_fireball",
    chargeScale: 0.55,
  },
  "mage-disintegrate": {
    color: "#c080ff",
    projectile: "mp_dark_bolt",
    projectileScale: 1.15,
    projectilePath: "riseDash",
    riseFrac: 0.6,
    riseLift: 78,
    burst: "px_darkness_orb",
    burstScale: 7.0,
    burstCount: 2,
    field: "px_darkness_bolt",
    fieldScale: 5.5,
    charge: "mp_dark_bolt",
    chargeScale: 0.5,
  },
  "mage-freezing-sphere": {
    color: "#9ad8ff",
    projectile: "px_ice_lance",
    projectileScale: 2.2,
    projectileCount: 4,
    projectileScaleJitter: 0.25,
    burst: "ice_burst_glow",
    burstScale: 1.9,
    burstCount: 2,
    field: "ice_burst_naked",
    fieldScale: 1.7,
    charge: "ice_burst_transparent",
    chargeScale: 0.7,
    glow: true,
  },
  "priest-mass-regenerate": {
    color: "#8fffb0",
    projectile: "priest_heal",
    burst: "priest_heal",
    burstCount: 2,
    field: "retro3_arcane_bloom",
    fieldScale: 1.45,
    scale: 1.35,
  },
  "priest-holy-aura": {
    color: "#ffe8a0",
    // T7 aura: fuller 64×64 solar vortex; twin layers via field rain above.
    burst: "retro2_solar_ring",
    burstScale: 1.85,
    burstCount: 2,
    field: "retro2_solar_ring",
    fieldScale: 1.55,
    fieldDurationMs: 1100,
    scale: 1.35,
  },
};

const STATUS_STYLES: Record<string, EffectStyle> = {
  sleep: { color: "#8090ff", burst: "free_moon", burstScale: 1.3 },
  poison: { color: "#c080ff", burst: "dispel_sparks" },
  paralysis: { color: "#c8c4b8", burst: "free_stunburst", burstScale: 1.2 },
  blind: { color: "#c8c4b8", burst: "mp_spark" },
  // Burn DoT (Meteor Swarm followup) — reuses the existing fire burst so the
  // "is burning!" beat reads as fire, not the generic purple status sparks.
  burn: { color: "#ff9a50", burst: "fire_explosion", burstScale: 1.1 },
};

export function resolveEffectStyle(
  spellId: string | undefined,
  evt?: { isHeal?: boolean; isBuff?: boolean; isDebuff?: boolean; statusInflicted?: string; statusCured?: string; damage?: number; heal?: number },
  casterEnemyId?: string
): EffectStyle {
  // Enemy-specific spell projectiles from Tiny RPG Asset Pack 02.
  if (casterEnemyId) {
    switch (casterEnemyId) {
      case "warlock":
      case "demon-mage":
        return {
          color: "#c080ff",
          projectile: "warlock-magic",
          projectileScale: 1.3,
          burst: "mp_fire_bomb",
          burstScale: 1.2,
          scale: 1.3,
        };
      case "rune-knight":
        return {
          color: "#7fe0e0",
          projectile: "rune-beam",
          projectileScale: 1.3,
          burst: "lightning_energy_glow",
          burstScale: 1.2,
          scale: 1.3,
        };
      case "succubus":
        return {
          color: "#c080ff",
          projectile: "ghostfire-beam",
          projectileScale: 1.3,
          burst: "red_energy_glow",
          burstScale: 1.2,
          scale: 1.3,
        };
    }
  }

  if (spellId && SPELL_OVERRIDES[spellId]) {
    return SPELL_OVERRIDES[spellId];
  }
  // Enemy ability IDs (from data/enemy-abilities.ts) — look up the ability's
  // element and use the matching ELEMENT_STYLES entry for VFX.
  const enemyAbility = spellId ? enemyAbilityById(spellId) : undefined;
  if (enemyAbility) {
    const el = enemyAbility.element;
    if (el && ELEMENT_STYLES[el]) return ELEMENT_STYLES[el];
    // Ability effect kind fallbacks.
    const eff = enemyAbility.effect;
    if (eff.kind === "heal") return { color: COLORS.heal, projectile: "priest_heal", burst: "priest_heal", scale: 1.2 };
    if (eff.kind === "buff" || eff.kind === "magicScreen") return { color: COLORS.sp, burst: "px_shield", burstScale: 1.6, field: "px_shield", fieldScale: 0.8, scale: 1.2 };
    if (eff.kind === "status") return STATUS_STYLES[eff.status] ?? { color: COLORS.poison, burst: "red_energy" };
    if (eff.kind === "fizzleField") return { color: "#7fe0e0", field: "free_wardring", fieldScale: 0.7, burst: "free_wardring", burstScale: 1.1 };
    if (eff.kind === "summon") return { color: COLORS.sp, burst: "fz_portal", burstScale: 1.1, field: "fz_portal", fieldScale: 0.6, scale: 1.2 };
    return { color: COLORS.spellBurst, burst: "fire_explosion" };
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
      return { color: COLORS.sp, burst: "px_shield", burstScale: 1.6, field: "px_shield", fieldScale: 0.8, scale: 1.2 };
    }
    if (eff.kind === "cure" || eff.kind === "resurrect") {
      return { color: COLORS.heal, burst: "priest_heal", scale: 1.2 };
    }
    if (eff.kind === "disable" && eff.status) {
      return STATUS_STYLES[eff.status] ?? { color: COLORS.poison, burst: "red_energy" };
    }
    if (eff.kind === "fizzleField" || eff.kind === "dispelMagic") {
      return { color: "#7fe0e0", field: "free_wardring", fieldScale: 0.7, burst: "free_wardring", burstScale: 1.1 };
    }
    if (eff.kind === "summon") {
      return { color: COLORS.sp, burst: "fz_portal", burstScale: 1.1, field: "fz_portal", fieldScale: 0.6, scale: 1.2 };
    }
  }

  // Fallback for items or unknown spell IDs.
  const e = evt ?? {};
  if (e.heal !== undefined || e.statusCured || e.isBuff) {
    return { color: COLORS.heal, burst: "priest_heal", scale: 1.2 };
  }
  if (e.statusInflicted) {
    return STATUS_STYLES[e.statusInflicted] ?? { color: COLORS.poison, burst: "dispel_sparks" };
  }
  if (e.isDebuff) {
    return { color: COLORS.poison, burst: "dispel_sparks" };
  }
  if (e.damage !== undefined) {
    return { color: COLORS.dmg, burst: "fire_explosion" };
  }
  return { color: COLORS.spellBurst, burst: "fire_explosion" };
}

function meleeEffectForActor(className: string | undefined): string {
  if (className === "Mage") return "wizard_attack1";
  if (className === "Priest") return "priest_attack";
  if (className === "Fighter" || className === "Duelist") return "free_slash";
  return "slash_attack";
}

function projectileForActor(
  scene: CombatScene,
  actorId: string,
  className: string | undefined
): { effect: string; scale: number } {
  if (className === "Thief") return { effect: "arrow_archer", scale: 4 };
  // Enemy-specific projectiles from Tiny RPG Asset Pack 02.
  const enemy =
    scene.state.enemies.front.find((e) => e.instanceId === actorId) ??
    scene.state.enemies.back.find((e) => e.instanceId === actorId);
  if (enemy) {
    switch (enemy.id) {
      case "ironclad-knight":
        return { effect: "cannonball", scale: 1.3 };
      case "rune-knight":
        return { effect: "rune-beam", scale: 1.3 };
      case "demon-brawler":
        return { effect: "demon-arrow", scale: 1.3 };
      case "eyeball-monster":
        return { effect: "eye-beam", scale: 1.3 };
      case "ghostfire":
        return { effect: "ghostfire-beam", scale: 1.3 };
      case "skeleton-archer":
        return { effect: "arrow_skeleton", scale: 4 };
      case "lava-slime":
        return { effect: "lava-spike", scale: 1.3 };
      case "warlock":
        return { effect: "warlock-magic", scale: 1.3 };
    }
  }
  return { effect: "arrow", scale: 4 };
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

  const approach = (actorId: string): void => {
    const actor = findActor(scene, actorId, w, h);
    if (!actor) return;
    approachedId = actorId;
    approachedKind = actor.kind;
    // Symbolic step forward — just enough to read as committing to the
    // attack. Party steps left toward enemies, enemies step right.
    const dx = approachDelta(actor.kind, actor.scale);
    // Brief backward coil before the lunge, so the approach reads as a
    // wind-up rather than an instant snap toward the target. Total time
    // still adds up to APPROACH_MS, so downstream step timing is untouched.
    const coilMs = Math.min(90, APPROACH_MS * 0.35);
    steps.push(
      step(t, (sc, n) => {
        const a = getAnim(sc, actor.kind, actorId, n);
        setAnimState(a, "walk", n);
        startMove(a, dx * -0.18, 0, coilMs, n, sc.playbackRate);
      }),
      step(t + coilMs, (sc, n) => {
        const a = getAnim(sc, actor.kind, actorId, n);
        startMove(a, dx, 0, APPROACH_MS - coilMs, n, sc.playbackRate);
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
        startMove(a, 0, 0, RETURN_MS, n, sc.playbackRate);
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
    // Same coil-then-strike telegraph as approach(), for actors that don't
    // physically step forward (ranged attackers, the miss path).
    const coilMs = Math.min(70, ATTACK_MS * 0.3);
    steps.push(
      step(t, (sc, n) => {
        const actor = findActor(sc, actorId, w, h);
        if (!actor) return;
        const a = getAnim(sc, actor.kind, actorId, n);
        const coilDx = -approachDelta(actor.kind, actor.scale) * 0.12;
        startMove(a, coilDx, 0, coilMs, n, sc.playbackRate);
      }),
      step(t + coilMs, (sc, n) => {
        const actor = findActor(sc, actorId, w, h);
        if (!actor) return;
        const a = getAnim(sc, actor.kind, actorId, n);
        setAnimState(a, "attack", n);
        startMove(a, 0, 0, ATTACK_MS - coilMs, n, sc.playbackRate);
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
        sc.bannerStart = n;
        sc.bannerUntil = n + durationMs;
      })
    );
  };

  // Whether a cast event is in flight; its spellEffect events land at a
  // shared impact time with a stagger.
  let pendingImpactBase: number | null = null;
  let pendingImpactCount = 0;
  let fieldPushed = false;
  let pendingCastStyle: EffectStyle | null = null;

  for (let evtIndex = 0; evtIndex < events.length; evtIndex++) {
    const evt = events[evtIndex];
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
            step(t + ATTACK_MS * 0.1, (sc, n) => {
              const from = findActor(sc, evt.actorId, w, h);
              const to = findActor(sc, evt.targetId, w, h);
              if (!from || !to) return;
              sc.effects.push({
                type: "projectile",
                x: from.x, y: from.y,
                fromX: from.x, fromY: from.y - 20 * from.scale,
                toX: to.x, toY: to.y,
                color: COLORS.dmg,
                ...projectileForActor(scene, evt.actorId, attacker?.class),
                start: n,
                duration: impact - (t + ATTACK_MS * 0.1),
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
          approach(evt.actorId);
          const base = t;
          steps.push(
            step(base + APPROACH_MS, (sc, n) => {
              const actor = findActor(sc, evt.actorId, w, h);
              if (!actor) return;
              setAnimState(getAnim(sc, actor.kind, evt.actorId, n), "attack", n);
            }),
            step(base + APPROACH_MS + ATTACK_MS, (sc, n) => {
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
          t = base + APPROACH_MS + ATTACK_MS;
          returnHome();
        }
        break;
      }

      case "miss":
      case "techniqueMiss": {
        if (evt.type === "miss" && evt.reason === "noTarget") break;
        approach(evt.actorId);
        const base = t;
        steps.push(
          step(base + APPROACH_MS, (sc, n) => {
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
          step(base + APPROACH_MS + ATTACK_MS, (sc, n) => {
            const actor = findActor(sc, evt.actorId, w, h);
            if (!actor) return;
            const a = getAnim(sc, actor.kind, evt.actorId, n);
            if (a.state === "attack") setAnimState(a, "idle", n);
          })
        );
        t = base + APPROACH_MS + ATTACK_MS;
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
          : status === "armorDown" ? "free_slash"
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
        showBanner(spellNameFor(evt.spellId), CAST_MS + 400);
        castAnim(evt.actorId);
        pendingImpactBase = t + CAST_IMPACT;
        pendingImpactCount = 0;
        fieldPushed = false;

        const casterEnemyId =
          scene.state.enemies.front.find((e) => e.instanceId === evt.actorId) ??
          scene.state.enemies.back.find((e) => e.instanceId === evt.actorId);
        const style = resolveEffectStyle(
          evt.spellId,
          evt,
          casterEnemyId?.id
        );
        pendingCastStyle = style;

        const castSpell = spellById(evt.spellId);
        const castIsArea =
          !!castSpell &&
          (castSpell.target === "allEnemies" ||
            castSpell.target === "allAllies" ||
            castSpell.target === "groupEnemies" ||
            castSpell.target === "groupAllies");
        const riseDash =
          style.projectilePath === "riseDash" &&
          !!style.projectile &&
          !castIsArea;
        // Rise→dash needs a longer hover window before impact lands.
        if (riseDash) {
          pendingImpactBase = t + Math.max(CAST_IMPACT, 920);
        }
        const castHold = riseDash ? Math.max(CAST_MS, 1280) : CAST_MS;

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
                scale: varyScale(style.chargeScale ?? style.scale ?? 0.8, 0.08),
                start: n,
                duration: (pendingImpactBase ?? CAST_IMPACT) - t + 80,
              });
            })
          );
        }

        // AOE nukes with a declared projectile rain from above the affected
        // side (Meteor Swarm, Ice Storm, etc.) instead of a single beam.
        if (castIsArea && style.projectile && (style.projectileCount ?? 1) > 1) {
          const enemySide =
            castSpell!.target === "allEnemies" || castSpell!.target === "groupEnemies";
          steps.push(
            step(t + 80, (sc, n) => {
              pushAreaProjectileRain(
                sc,
                style,
                n,
                CAST_IMPACT - 80,
                enemySide,
                w,
                h
              );
            })
          );
        }

        // Single-target: launch a volley from caster toward the target.
        // Rise→dash launches earlier so the hover phase has room to breathe.
        if (evt.targetId && style.projectile && !castIsArea) {
          const projectileLaunch = t + (riseDash ? 40 : 100);
          const impact = pendingImpactBase!;
          const count = Math.max(1, style.projectileCount ?? 1);
          steps.push(
            step(projectileLaunch, (sc, n) => {
              const from = findActor(sc, evt.actorId, w, h);
              const to = findActor(sc, evt.targetId!, w, h);
              if (!from || !to) return;
              pushProjectileVolley(
                sc,
                from.x,
                from.y,
                to.x,
                to.y,
                style,
                n,
                impact - projectileLaunch,
                count
              );
            })
          );
        }

        // Enemy casts / items carry their damage/heal directly on the cast event.
        if (evt.targetId && (evt.damage !== undefined || evt.heal !== undefined)) {
          const isHeal = evt.heal !== undefined;
          const text = isHeal ? `${evt.heal}` : `${evt.damage}`;
          steps.push(
            step(pendingImpactBase!, (sc, n) => {
              const target = findActor(sc, evt.targetId!, w, h);
              if (target) {
                pushBursts(sc, target.x, target.y, style, n, burstDurationFor(evt.spellId));
                spawnSparkleParticles(sc, target.x, target.y, style.color, isHeal ? 12 : 8);
                if (!isHeal) {
                  addScreenShake(sc, spellShakeAmount(evt.spellId, evt.damage), n, 250);
                }
              }
            }),
            ...impactSteps(pendingImpactBase!, evt.targetId, text, isHeal ? COLORS.heal : COLORS.dmg, w, h, !isHeal, false, undefined, undefined, evt.damage)
          );
          pendingImpactCount++;
        }
        t += castHold;
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
        const style = pendingCastStyle ?? resolveEffectStyle(evt.spellId, evt);
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
          const fieldDuration = style.fieldDurationMs ?? FIELD_MS;
          const fieldBase = (style.fieldScale ?? style.scale ?? 1) * 2;
          steps.push(
            step(impactAt, (sc, n) => {
              // Twin field layers at slightly different scales read as depth
              // instead of one flat stamp.
              sc.effects.push({
                type: "field",
                x: fieldX,
                y: h * 0.42,
                color: style.color,
                effect: style.field ?? style.burst,
                scale: varyScale(fieldBase, 0.06),
                glow: style.glow,
                start: n,
                duration: fieldDuration,
              });
              sc.effects.push({
                type: "field",
                x: fieldX + 18,
                y: h * 0.46,
                color: style.color,
                effect: style.field ?? style.burst,
                scale: varyScale(fieldBase * 0.72, 0.1),
                glow: style.glow,
                start: n + 70,
                duration: fieldDuration - 80,
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
          const fieldDuration = style.fieldDurationMs ?? FIELD_MS;
          const fieldBase = (style.fieldScale ?? style.scale ?? 1) * 2;
          steps.push(
            step(impactAt, (sc, n) => {
              sc.effects.push({
                type: "field",
                x: fieldX,
                y: h * 0.42,
                color: style.color,
                effect: style.field ?? style.burst,
                scale: varyScale(fieldBase, 0.08),
                glow: style.glow,
                start: n,
                duration: fieldDuration,
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
              pushBursts(sc, target.x, target.y, style, n, burstDurationFor(evt.spellId));
              spawnSparkleParticles(sc, target.x, target.y, style.color, isHeal ? 12 : 8);
              if (!isHeal && evt.damage !== undefined) {
                addScreenShake(sc, spellShakeAmount(evt.spellId, evt.damage), n, 250);
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
        // Consecutive "defeated" events (e.g. an AoE wiping several enemies
        // at once) should all play their death animations together instead
        // of staggering — only advance the clock after the last one in the
        // run so they share the same start time.
        const nextEvt = events[evtIndex + 1];
        if (!nextEvt || nextEvt.type !== "defeated") {
          t += evt.wasEnemy ? DEATH_FADE_MS : 450;
        }
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
        const tickColor = evt.status === "burn" ? "#ff9a50" : COLORS.poison;
        steps.push(
          ...impactSteps(t, evt.targetId, `${evt.damage}`, tickColor, w, h, false, false, undefined, undefined, evt.damage)
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

      case "telegraph": {
        showBanner(spellNameFor(evt.abilityId), CAST_MS + 800);
        t += 600;
        break;
      }

      case "telegraphBreak": {
        showBanner("Interrupted!", 900);
        t += 500;
        break;
      }

      case "affinityDiscovered": {
        const label = evt.kind === "weak" ? "WEAK!" : "RESIST";
        const color = evt.kind === "weak" ? "#ffd24a" : COLORS.miss;
        steps.push(
          step(t, (sc, n) => pushPopup(sc, evt.targetId, label, color, n, w, h))
        );
        t += 400;
        break;
      }

      case "analyze": {
        showBanner("Analyze", 900);
        t += 500;
        break;
      }

      case "phaseChange": {
        showBanner(`${evt.name} grows stronger!`, 1200);
        t += 600;
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

      case "incapacitated": {
        const label = evt.reason === "sleep" ? "Asleep" : "Paralyzed";
        steps.push(
          step(t, (sc, n) => {
            sc.banner = label;
            sc.bannerStart = n;
            sc.bannerUntil = n + 700;
            pushPopup(sc, evt.actorId, label.toUpperCase(), COLORS.miss, n, w, h);
          })
        );
        t += 500;
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
 * Flush remaining choreography steps immediately (cosmetic skip). Damage
 * was already applied at resolve time — this only finishes the visuals.
 */
export function skipPlaybackToEnd(scene: CombatScene, now: number): void {
  if (!scene.choreo) return;
  for (const s of scene.choreo.steps) {
    if (!s.fired) {
      s.fired = true;
      s.run(scene, now);
    }
  }
  scene.choreo = null;
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
  // Fire due choreography steps. When playbackRate > 1, warp choreo.start
  // backward so wall-clock jumps and continuous frames both stay in sync
  // (absolute-time tests with rate=1 are unchanged).
  if (scene.choreo) {
    const rate = Math.max(1, scene.playbackRate || 1);
    if (rate > 1 && scene.lastUpdate !== undefined) {
      const dt = Math.max(0, now - scene.lastUpdate);
      scene.choreo.start -= dt * (rate - 1);
    }
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

  // Expire floor glows.
  scene.lightGlows = scene.lightGlows.filter((g) => now - g.start < g.duration);

  // Expire banner.
  if (scene.banner && now >= scene.bannerUntil) scene.banner = null;
}

// --- Drawing ---------------------------------------------------------------------------

/** Soft contact shadow at the foot baseline — plants the sprite on the floor.
 * Ellipse ry must stay in sync with CONTACT_SHADOW_BELOW_FOOT_PX in combat-scene-math.
 */
function drawContactShadow(
  ctx: CanvasRenderingContext2D,
  footX: number,
  footY: number,
  spriteWidth: number
): void {
  const rx = Math.max(8, spriteWidth * 0.28);
  const ry = rx * 0.28;
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.beginPath();
  // Bias the ellipse slightly upward so the dark core sits under the foot
  // plant (half-below centering left squat blobs floating over daylight).
  ctx.ellipse(footX, footY - ry * 0.35, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const HP_PIP_COUNT = 4;

/**
 * Small HP-tick readout under an enemy's feet — 4 pips, lit proportionally
 * to currentHp/maxHp. Only drawn once the enemy has taken damage (reads
 * straight off the live EnemyInstance; no separate "damaged" event/state
 * needed since currentHp < maxHp already means "hit at least once").
 */
function drawEnemyHpPips(
  ctx: CanvasRenderingContext2D,
  enemy: EnemyInstance,
  footX: number,
  footY: number,
  spriteWidth: number
): void {
  if (enemy.currentHp >= enemy.hp || enemy.currentHp <= 0) return;
  const lit = Math.max(
    1,
    Math.ceil((enemy.currentHp / enemy.hp) * HP_PIP_COUNT)
  );
  const pipW = 6;
  const gap = 2;
  const totalW = HP_PIP_COUNT * pipW + (HP_PIP_COUNT - 1) * gap;
  const startX = footX - totalW / 2;
  const y = footY + Math.max(4, spriteWidth * 0.08);
  const color =
    enemy.currentHp / enemy.hp <= 0.25
      ? "#f07070"
      : enemy.currentHp / enemy.hp <= 0.5
        ? "#e8a060"
        : "#ffe790";
  ctx.save();
  for (let i = 0; i < HP_PIP_COUNT; i++) {
    ctx.fillStyle = i < lit ? color : "rgba(16, 28, 88, 0.55)";
    ctx.fillRect(startX + i * (pipW + gap), y, pipW, 3);
  }
  ctx.restore();
}

/**
 * Status tints for strip sprites. Do NOT use source-atop + fillRect on the
 * live combat canvas — party draw size is ~300px, so that paints huge green/
 * orange slabs over floor + neighbors. Canvas `filter` only recolors the
 * pixels of this drawImage (transparent padding stays transparent).
 */
const POISON_FILTER = "sepia(0.18) hue-rotate(80deg) saturate(1.25)";
const BURN_FILTER = "sepia(0.22) hue-rotate(-30deg) saturate(1.35)";

/** Fallback-shape washes (procedural ellipses/rects — same geometry, safe). */
const POISON_TINT = "rgba(60, 190, 80, 0.28)";
const BURN_TINT = "rgba(255, 130, 40, 0.28)";

/**
 * Draw one frame of a sprite strip centered at (x, y-baseline), optionally
 * mirrored horizontally. `size` is the square draw size.
 * `tint` is POISON_TINT / BURN_TINT (or undefined).
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
  opacity: number,
  tint?: string
): void {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x, y);
  if (mirror) ctx.scale(-1, 1);
  if (tint === POISON_TINT) ctx.filter = POISON_FILTER;
  else if (tint === BURN_TINT) ctx.filter = BURN_FILTER;
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
  now: number,
  size: number = ENEMY_SIZE,
  frozen = false,
  tint?: string
): void {
  const scale = size / ENEMY_SIZE;
  const w = 104 * scale;
  const h = 122 * scale;
  ctx.save();
  ctx.globalAlpha = anim.opacity;
  const bob = anim.state === "idle" && !frozen ? Math.sin(now / 700 + x * 0.02) * 2 : 0;
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
  ctx.fillRect(x + 6 * scale, py - h * 0.32, 5 * scale, 5 * scale);
  ctx.fillRect(x + 18 * scale, py - h * 0.32, 5 * scale, 5 * scale);
  if (tint) {
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.ellipse(x, py - h * 0.25, w / 2.4, h / 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
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
  anim: ActorAnim,
  size: number = PARTY_SIZE,
  tint?: string
): void {
  const scale = size / PARTY_SIZE;
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
  ctx.fillRect(x - 12 * scale, y - 44 * scale, 24 * scale, 36 * scale);
  ctx.beginPath();
  ctx.arc(x, y - 52 * scale, 9 * scale, 0, Math.PI * 2);
  ctx.fill();
  if (tint) {
    ctx.fillStyle = tint;
    ctx.fillRect(x - 12 * scale, y - 44 * scale, 24 * scale, 36 * scale);
    ctx.beginPath();
    ctx.arc(x, y - 52 * scale, 9 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
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
  _h: number
): void {
  const anim = getAnim(scene, "party", char.id, now);
  const stripInfo = getPartySpriteStrip(char.class, anim.state);
  const artFoot = artFootFromTopFor({
    hasStrip: !!stripInfo,
    stripArtFootFromTop: stripInfo?.strip.artFootFromTop,
  });
  const artTop = artTopFromTopFor({
    hasStrip: !!stripInfo,
    stripArtTopFromTop: stripInfo?.strip.artTopFromTop,
  });
  const slot = toScreenPos(
    resolveSlot(partySlot(index), geoFor(scene.backdropId), {
      spriteHeight: PARTY_SIZE,
      canvasWidth: w,
      artFootFromTop: artFoot,
    })
  );
  const off = animOffset(anim, now);
  const x = slot.x + off.x;
  const y = slot.y + off.y;
  const footY = slot.footY + off.y;
  const drawSize = PARTY_SIZE * slot.scale;

  const isDead = char.hp <= 0 || char.status.includes("knockedOut");
  if (isDead && anim.state !== "death") setAnimState(anim, "death", now);
  if (!isDead && anim.state === "death") setAnimState(anim, "idle", now);

  const hidden = char.status.includes("hidden");

  drawContactShadow(ctx, x, footY, drawSize * 0.45);

  const frozen = char.status.includes("sleep") || char.status.includes("paralysis");
  const poisoned = char.status.includes("poison");
  const tint = poisoned ? POISON_TINT : undefined;

  const opacity = (hidden ? 0.35 : 1) * anim.opacity;
  if (stripInfo) {
    const stateAge = now - anim.stateStart;
    const frame = frozen && anim.state === "idle" ? 0 : frameIndexFor(stripInfo.strip, stateAge);
    drawStripFrame(ctx, stripInfo.img, stripInfo.strip, frame, x, y, drawSize, true, opacity, tint);
  } else {
    drawPartyFallback(ctx, x, y, char, anim, drawSize, tint);
    if (anim.state === "hurt" && now - anim.stateStart < 200) {
      const intensity = anim.hitFlashIntensity || 0.3;
      const sz = 1 + intensity * 0.3;
      ctx.save();
      ctx.globalAlpha = intensity * 0.4;
      ctx.fillStyle = "#ff4040";
      ctx.fillRect(
        x - (drawSize / 4) * sz,
        y - (drawSize / 2.4) * sz,
        (drawSize / 2) * sz,
        drawSize * 0.8 * sz
      );
      ctx.restore();
    }
  }

  drawMarkers(
    ctx,
    scene,
    "party",
    char.id,
    x,
    visualHeadY(slot.drawY + off.y, drawSize, artTop),
    now
  );
}

/** Draw one enemy (living or corpse). */
function drawEnemy(
  ctx: CanvasRenderingContext2D,
  enemy: EnemyInstance,
  idxInRow: number,
  scene: CombatScene,
  now: number,
  w: number,
  _h: number
): void {
  const anim = getAnim(scene, "enemy", enemy.instanceId, now);
  if (anim.opacity <= 0) return;
  const baseSize = enemy.isBoss ? BOSS_SIZE : ENEMY_SIZE;
  const stripInfo = getEnemySpriteStrip(enemy.id, enemyStripState(anim.state));
  const hasStrip = !!(stripInfo?.img && stripInfo.img.naturalWidth > 0);
  const artFoot = artFootFromTopFor({
    hasStrip,
    stripArtFootFromTop: stripInfo?.strip.artFootFromTop,
  });
  const artTop = artTopFromTopFor({
    hasStrip,
    stripArtTopFromTop: stripInfo?.strip.artTopFromTop,
  });
  const slot = toScreenPos(
    resolveSlot(enemySlot(idxInRow, enemy.row), geoFor(scene.backdropId), {
      spriteHeight: baseSize,
      canvasWidth: w,
      artFootFromTop: artFoot,
    })
  );
  const off = animOffset(anim, now);
  const x = slot.x + off.x;
  const y = slot.y + off.y;
  const footY = slot.footY + off.y;
  const drawSize = baseSize * slot.scale;

  const frozen = enemy.status.includes("sleep") || enemy.status.includes("paralysis");
  const burning = (scene.state.enemyDots[enemy.instanceId]?.length ?? 0) > 0;
  const tint = burning ? BURN_TINT : enemy.status.includes("poison") ? POISON_TINT : undefined;

  drawContactShadow(ctx, x, footY, drawSize * 0.45);

  if (hasStrip && stripInfo) {
    const { strip, img } = stripInfo;
    const stateAge = now - anim.stateStart;
    let frame: number;
    if (anim.state === "death") {
      frame = Math.min(strip.frameCount - 1, Math.floor((stateAge / 675) * strip.frameCount));
    } else if (frozen && anim.state === "idle") {
      frame = 0;
    } else if (strip.loop || anim.state === "idle") {
      frame = Math.floor((stateAge / 1000) * strip.fps * ANIM_SPEED) % strip.frameCount;
    } else {
      frame = Math.min(strip.frameCount - 1, Math.floor((stateAge / 1000) * strip.fps * ANIM_SPEED));
    }
    drawStripFrame(ctx, img!, strip, frame, x, y, drawSize, false, anim.opacity, tint);
  } else {
    drawEnemyFallback(ctx, x, y, enemy, anim, now, drawSize, frozen, tint);
  }

  drawEnemyHpPips(ctx, enemy, x, footY, drawSize);

  drawMarkers(
    ctx,
    scene,
    "enemy",
    enemy.instanceId,
    x,
    visualHeadY(slot.drawY + off.y, drawSize, artTop),
    now
  );
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
  const slot = allyPos(index, w, h, scene.backdropId);
  const off = animOffset(anim, now);
  const x = slot.x + off.x;
  const y = slot.y + off.y;
  const footY = slot.footY + off.y;
  const drawSize = ENEMY_SIZE * slot.scale;

  if (ally.spriteId) {
    const stripInfo = getEnemySpriteStrip(ally.spriteId, enemyStripState(anim.state));
    if (stripInfo?.img && stripInfo.img.naturalWidth > 0) {
      drawContactShadow(ctx, x, footY, drawSize * 0.45);
      const { strip, img } = stripInfo;
      const stateAge = now - anim.stateStart;
      let frame: number;
      if (anim.state === "death") {
        frame = Math.min(strip.frameCount - 1, Math.floor((stateAge / 675) * strip.frameCount));
      } else if (strip.loop || anim.state === "idle") {
        frame = Math.floor((stateAge / 1000) * strip.fps * ANIM_SPEED) % strip.frameCount;
      } else {
        frame = Math.min(strip.frameCount - 1, Math.floor((stateAge / 1000) * strip.fps * ANIM_SPEED));
      }
      drawStripFrame(ctx, img, strip, frame, x, y, drawSize, false, anim.opacity);
      const artTop = artTopFromTopFor({
        hasStrip: true,
        stripArtTopFromTop: strip.artTopFromTop,
      });
      drawMarkers(
        ctx,
        scene,
        "ally",
        ally.id,
        x,
        visualHeadY(slot.drawY + off.y, drawSize, artTop),
        now
      );
      return;
    }
  }

  drawContactShadow(ctx, x, footY, drawSize * 0.35);
  ctx.save();
  ctx.globalAlpha = anim.opacity;
  const bob = Math.sin(now / 500 + index) * 3 * slot.scale;
  ctx.fillStyle = COLORS.spellBurst;
  ctx.beginPath();
  ctx.arc(x, y + bob, 16 * slot.scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COLORS.spellBurst;
  ctx.lineWidth = 2;
  for (let i = -1; i <= 1; i += 2) {
    ctx.beginPath();
    ctx.moveTo(x + i * 9 * slot.scale, y + bob);
    ctx.lineTo(x + i * 20 * slot.scale, y + bob - 14 * slot.scale);
    ctx.stroke();
  }
  ctx.restore();
  drawMarkers(ctx, scene, "ally", ally.id, x, y - 16 * slot.scale, now);
}

/**
 * Cursor (target selection) and active-actor hand markers.
 * `topY` is the sprite's VISUAL HEAD y (art top, not a drawSize fraction) —
 * the triangle tip hovers MARKER_TIP_GAP_PX above it, FF6-tight.
 */
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

  // Bounce + soft opacity pulse (never fully off — hard blink was easy to
  // miss against busy floor art at Deck scale).
  const bounce = Math.sin(now / 180) * 3;
  const pulse = isCursor
    ? 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(now / 200))
    : 1;
  const fill =
    isCursor && scene.cursor?.kill ? COLORS.cursorKill : COLORS.cursor;
  const y = topY - MARKER_TIP_GAP_PX + bounce;

  ctx.save();
  ctx.globalAlpha = pulse;
  // Soft halo under the triangle for contrast on textured floors.
  if (isCursor) {
    ctx.fillStyle = "rgba(255, 236, 140, 0.45)";
    ctx.beginPath();
    ctx.moveTo(x - 12, y - 14);
    ctx.lineTo(x + 12, y - 14);
    ctx.lineTo(x, y + 3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = fill;
  ctx.strokeStyle = "#14110d";
  ctx.lineWidth = 2.5;
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
  const idx = Math.floor((elapsed / 1000) * strip.fps * EFFECT_ANIM_SPEED);
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
      const alpha = type === "burst" ? 1 - t : type === "field" ? 1 - t * 0.5 : 1;

      if (effect.glow && (type === "burst" || type === "field")) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = alpha * 0.6;
        const radius = Math.max(dw, dh) * 0.55;
        const grad = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius);
        grad.addColorStop(0, "rgba(255,255,255,0.85)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.globalAlpha = alpha;
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
      const pose = sampleProjectilePose(t, fromX, fromY, toX, toY, {
        apexX: effect.apexX,
        apexY: effect.apexY,
        riseFrac: effect.riseFrac,
      });
      // Slight scale-up while hovering so the sprite is easier to read.
      const drawScale =
        pose.phase === "rise" && effect.riseFrac
          ? (effect.scale ?? 1) * (1 + 0.18 * Math.min(1, t / effect.riseFrac))
          : effect.scale;
      ctx.translate(pose.x, pose.y);
      ctx.rotate(pose.angle);
      drawEffectSprite(ctx, { ...effect, scale: drawScale }, "projectile", t, now);
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

function drawBanner(
  ctx: CanvasRenderingContext2D,
  w: number,
  scene: CombatScene,
  now: number
): void {
  if (!scene.banner) return;
  // Fade in over the first 120ms, out over the last 220ms, and hold slightly
  // under full opacity so the spell effect — not the label — owns the moment.
  const age = now - scene.bannerStart;
  const remaining = scene.bannerUntil - now;
  let alpha = 0.88;
  if (age < 120) alpha *= Math.max(0, age / 120);
  else if (remaining < 220) alpha *= Math.max(0, remaining / 220);
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
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

  ctx.save();

  // Apply screen shake as a whole-scene jitter. The amount decays in
  // updateScene; ±amount/2 keeps even the max (8) comfortable.
  if (scene.screenShake.amount > 0) {
    const a = scene.screenShake.amount;
    ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
  }

  // Background: prefer the baked arena room backdrop (current floor tileset),
  // fall back to the static combat-bg.png image, then a plain gradient.
  const backdrop = scene.backdrop;
  if (backdrop) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(backdrop, 0, 0, w, h);
  } else {
    // Fall back to the static combat-bg.png gradient image.
    const bg = getCombatBg();
    if (bg && bg.complete && bg.naturalWidth > 0) {
      ctx.drawImage(bg, 0, 0, w, h);
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#0d0b08");
      grad.addColorStop(1, "#1f1b14");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // Floor illumination: additive radial glows under impacts, drawn before
  // sprites so bursts light the ground and sprite bottoms.
  if (scene.lightGlows.length > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const g of scene.lightGlows) {
      const p = (now - g.start) / g.duration;
      if (p < 0 || p >= 1) continue;
      const alpha = (1 - p) * 0.35;
      const r = g.radius * (0.6 + p * 0.5);
      const grad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, r);
      grad.addColorStop(0, g.color);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = alpha;
      ctx.fillStyle = grad;
      ctx.fillRect(g.x - r, g.y - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  // Combatants sorted by footY ascending (farther first). Contact shadows
  // draw inside each draw* call immediately before the sprite.
  type DrawCmd = { footY: number; draw: () => void };
  const cmds: DrawCmd[] = [];

  s.enemies.back.forEach((e, i) => {
    const pos = enemyPos(i, "back", w, h, scene.backdropId, e.isBoss ? BOSS_SIZE : ENEMY_SIZE);
    cmds.push({
      footY: pos.footY,
      draw: () => drawEnemy(ctx, e, i, scene, now, w, h),
    });
  });
  s.enemies.front.forEach((e, i) => {
    const pos = enemyPos(i, "front", w, h, scene.backdropId, e.isBoss ? BOSS_SIZE : ENEMY_SIZE);
    cmds.push({
      footY: pos.footY,
      draw: () => drawEnemy(ctx, e, i, scene, now, w, h),
    });
  });
  scene.enemyCorpses.forEach((e, i) => {
    const living = e.row === "front" ? s.enemies.front.length : s.enemies.back.length;
    const idx = living + i;
    const pos = enemyPos(idx, e.row, w, h, scene.backdropId, e.isBoss ? BOSS_SIZE : ENEMY_SIZE);
    cmds.push({
      footY: pos.footY,
      draw: () => drawEnemy(ctx, e, idx, scene, now, w, h),
    });
  });
  s.summonedAllies.forEach((a, i) => {
    const pos = allyPos(i, w, h, scene.backdropId);
    cmds.push({
      footY: pos.footY,
      draw: () => drawAlly(ctx, a, i, scene, now, w, h),
    });
  });
  scene.allyCorpses.forEach((a, i) => {
    const idx = s.summonedAllies.length + i;
    const pos = allyPos(idx, w, h, scene.backdropId);
    cmds.push({
      footY: pos.footY,
      draw: () => drawAlly(ctx, a, idx, scene, now, w, h),
    });
  });
  for (let i = 0; i < s.party.length; i++) {
    const char = s.party[i]!;
    // Visual stand position keys off the dense in-combat rank (i), not the
    // roster's original formationSlot (0-5, sparse once bench members drop
    // out) — matches findActor's convention and keeps the on-field cascade
    // gap-free regardless of which two roster slots got benched this fight.
    const pos = partyPos(i, w, h, scene.backdropId);
    cmds.push({
      footY: pos.footY,
      draw: () => drawPartyMember(ctx, char, i, scene, now, w, h),
    });
  }

  cmds.sort((a, b) => a.footY - b.footY);
  for (const c of cmds) c.draw();

  // Overlay VFX (effects, particles, popups, banners) stay above combatants.
  drawEffects(ctx, scene, now);
  drawParticles(ctx, scene);
  drawPopups(ctx, scene, now);

  // Banner window (top center). Round number now lives in the enemy-column
  // header of the unified footer window, not a separate canvas pill.
  drawBanner(ctx, w, scene, now);

  // Sticky FAST / AUTO cues (top-right).
  if (scene.showFastCue || scene.showAutoCue) {
    ctx.save();
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    let x = w - 16;
    if (scene.showFastCue) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(x - 56, 8, 64, 22);
      ctx.fillStyle = "#ffe566";
      ctx.fillText("FAST", x, 12);
      x -= 72;
    }
    if (scene.showAutoCue) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(x - 56, 8, 64, 22);
      ctx.fillStyle = "#7ec8ff";
      ctx.fillText("AUTO", x, 12);
    }
    ctx.restore();
  }

  ctx.restore();
}
