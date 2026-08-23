/**
 * FF6-style combat choreography engine (DOM-free).
 *
 * Painter lives in combat-scene.ts and imports this module — never the reverse.
 *
 * Layout (mirroring FF6):
 *   - Enemies on the LEFT in one diagonal column (mechanical front/back
 *     zippered into a single cascade — not two visual ranks), party on
 *     the RIGHT in one diagonal queue of animated sprites facing left.
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
 * summoned allies reuse enemy strips (also face RIGHT) and are mirrored the
 * same way so they face the enemy line;
 * enemies use enemy-sprite-cache strips when available and fall back to
 * procedural silhouettes.
 */

import type {
  BarkLandmark,
  CombatState,
  CombatEvent,
  EnemyInstance,
  SummonedAlly,
} from "../game/combat-types";
import { loadEnemySpriteBundle } from "./enemy-sprite-cache";
import type { PartySpriteState } from "./party-sprite-cache";
import type { EffectSprite } from "./effect-sprite-cache";
import { spellById } from "../data/spells";
import { enemyAbilityById } from "../data/enemy-abilities";
import {
  barkDurationMs,
  barkPriority as policyBarkPriority,
  libraryBarkCanInterrupt,
} from "../data/combat-bark-policy";
import type { CombatBarkTrigger } from "../data/combat-bark-library/types";
import { enemyIsUndead } from "./combat-audio";
import { warnAsset } from "./asset-warn";
import type { SpriteStrip } from "./sprite-manifest";
import {
  type CombatImpactState,
  type IlluminationProfile,
  type EnvironmentLightImpulse,
  createImpactState,
  resetImpactState,
  ELEMENT_ILLUMINATION_DEFAULTS,
  triggerImpactPresentation,
  shiftPresentationClocks,
  resolveIllumination,
  preScanDamageEvents,
  classifyHitSequence,
  syncReducedMotionFromMediaQuery,
  shouldReplaceEnvironmentLight,
} from "./combat-impact-fx";

export type { CombatImpactState, CameraZoomImpulse, EnvironmentLightImpulse, ActorFlashImpulse, IlluminationProfile } from "./combat-impact-fx";

export { enemyIsUndead } from "./combat-audio";
import {
  geometryForBackdrop,
  partySlot,
  cardTrialHeroSlot,
  enemySlot,
  allySlot,
  resolveSlot,
  ART_FOOT_FROM_TOP,
  type BackdropGeometry,
  type ResolvedSlot,
} from "./combat-scene-math";
import {
  approachOffset,
  contactTime,
  deterministicNoise,
  meleeMotionProfile,
  motionStyleForActor,
  type CombatMotionStyle,
  type MeleeMotionProfile,
} from "./combat-motion";

// --- Palette -----------------------------------------------------------------

export const COLORS = {
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
export const PARTY_SIZE = 300;
/** Enemy sprite draw size at scale 1.0. Matched to PARTY_SIZE so dense
 *  packs overlap less in the left cascade (visual-design-pass follow-up). */
export const ENEMY_SIZE = 300;
/** Boss sprites still tower over trash (~33% larger), but smaller than the
 *  old 480 so a zipper neighbor remains readable. */
export const BOSS_SIZE = 400;
/** Card Trial hero row slide; deliberately inside the 150–250ms brief. */
export const PARTY_ROW_MOVE_MS = 200;

export type ActorScreenPos = {
  x: number;
  /** Visual center (popups / projectiles / markers). */
  y: number;
  /** Quantized depth scale (0.75 / 0.875 / 1.0). */
  scale: number;
  footY: number;
  drawY: number;
};

export function geoFor(backdropId?: string | null): BackdropGeometry {
  return geometryForBackdrop(backdropId);
}

export function toScreenPos(r: ResolvedSlot): ActorScreenPos {
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

/**
 * Single row-aware party-slot seam. With no Card Trial profile (the campaign
 * path), this returns the same dense index slot partyPos has always used.
 */
export function partySlotForActor(
  state: Pick<CombatState, "partyFormation">,
  index: number,
  actorId: string,
  rowOverride?: "front" | "back"
): ReturnType<typeof partySlot> {
  const formation = state.partyFormation;
  if (formation?.kind !== "card-trial-rows") return partySlot(index);
  const actor = formation.rowsByActorId[actorId];
  if (!actor) return partySlot(index);
  return cardTrialHeroSlot(rowOverride ?? actor.row, actorId);
}

/**
 * Resolve a party actor through the active backdrop. Sprite painters may
 * supply strip/status-specific foot geometry; choreography/findActor use the
 * pack default. All callers share partySlotForActor, so sprites and VFX cannot
 * disagree about which formation anchor an actor owns.
 */
export function partyActorPos(
  state: Pick<CombatState, "partyFormation">,
  index: number,
  actorId: string,
  w: number,
  _h: number,
  backdropId?: string | null,
  opts: {
    rowOverride?: "front" | "back";
    spriteHeight?: number;
    artFootFromTop?: number;
  } = {}
): ActorScreenPos {
  return toScreenPos(
    resolveSlot(
      partySlotForActor(state, index, actorId, opts.rowOverride),
      geoFor(backdropId),
      {
        spriteHeight: opts.spriteHeight ?? PARTY_SIZE,
        canvasWidth: w,
        artFootFromTop: opts.artFootFromTop ?? ART_FOOT_FROM_TOP,
      }
    )
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


// --- Actor animation state -------------------------------------------------------

/** Extended sprite state (party strips + generic mapping for enemies). */
export type ActorSpriteState = PartySpriteState; // idle|walk|attack|attack_ranged|cast|hurt|death

export interface ActorAnim {
  state: ActorSpriteState;
  stateStart: number;
  /** State-local strip speed multiplier; presentation only. */
  frameRateScale: number;
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
    frameRateScale: 1,
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
export function animOffset(anim: ActorAnim, now: number): { x: number; y: number } {
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

export function setAnimState(anim: ActorAnim, state: ActorSpriteState, now: number): void {
  anim.state = state;
  anim.stateStart = now;
  anim.frameRateScale =
    state === "attack" || state === "attack_ranged"
      ? 1.18
      : state === "hurt"
        ? 1.1
        : state === "death"
          ? 1
          : state === "cast"
            ? 0.95
            : 1;
}

/**
 * Actor sprite strip speed (1 = normal, <1 = slower).
 * Kept separate from effect playback so spell VFX can linger without
 * dragging walk/attack choreography as hard.
 */
export const ANIM_SPEED = 0.67;

/**
 * Spell/projectile/burst/field strip speed. Lower than ANIM_SPEED so
 * impact FX read a beat longer instead of flashing through their frames.
 */
export const EFFECT_ANIM_SPEED = 0.42;

/**
 * Compute the frame index for a strip given the anim state age.
 * Looping strips cycle; non-looping strips hold their last frame.
 */
export function frameIndexFor(strip: SpriteStrip, stateAge: number, frameRateScale = 1): number {
  const idx = Math.floor((stateAge / 1000) * strip.fps * ANIM_SPEED * frameRateScale);
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
  /**
   * Actor this popup belongs to. Presentation metadata only — nothing in
   * choreography reads it. The Phaser stage uses it to find the sprite that was
   * just healed (green popup) so it can Shine the body rather than guessing
   * from popup coordinates.
   */
  actorId?: string;
}

export const POPUP_DURATION = 1350;

/** Dialog bark — sibling channel to damage popups (spec 2026-07-26). */
export interface CombatBark {
  text: string;
  actorId: string;
  start: number;
  color: string;
  priority: number;
  source: "legacy" | "library";
  speaker?: string;
  landmark?: BarkLandmark;
  /** Wall-clock lifetime; already scaled by playbackRate at push. */
  durationMs: number;
}

export const BARK_DURATION_BASE = 1900;
export const BARK_COLOR = "#f0e0c0";
/** Pathological safety only — shipping death line is ~300px at 19px FF36. */
export const BARK_MAX_WIDTH_PX = 340;
const BARK_WINDOW_MS = 100;
const BARK_GLOBAL_CAP = 2;
const LIBRARY_BARK_COOLDOWN_MS = 2400;

let barksEnabled = true;

/** Module mute (no settings bag in v1). Also exposed via debug. */
export function setBarksEnabled(on: boolean): void {
  barksEnabled = on;
}

export function getBarksEnabled(): boolean {
  return barksEnabled;
}

/** FF6 bounce: quick rise with overshoot, settle, brief hold, fade. */
export function popupOffsetY(t: number): number {
  // t in [0,1]. Rise for first 35%, small bounce, hold.
  if (t < 0.2) return -28 * (t / 0.2);
  if (t < 0.35) return -28 + 10 * ((t - 0.2) / 0.15);
  if (t < 0.5) return -18 - 4 * ((t - 0.35) / 0.15);
  return -22;
}

// --- Choreography ------------------------------------------------------------------

export interface ChoreoStep {
  at: number; // ms offset from choreo start
  run: (scene: CombatScene, now: number) => void;
  fired: boolean;
}

export interface Choreography {
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

/** Transient, row-clock-derived presentation data for one pending hero move. */
export interface PartyFormationTransition {
  fromRow: "front" | "back";
  toRow: "front" | "back";
  rowEnteredAt: number;
}

export interface CombatScene {
  state: CombatState;
  partyAnims: Map<string, ActorAnim>;
  enemyAnims: Map<string, ActorAnim>;
  allyAnims: Map<string, ActorAnim>;
  /** Derived on state sync; consumed by a matching partyRowMove event. */
  partyFormationTransitions: Map<string, PartyFormationTransition>;
  /** Enemies removed from the living arrays but still animating death. */
  enemyCorpses: EnemyInstance[];
  allyCorpses: SummonedAlly[];
  /**
   * Stable visual formation slot per enemy instance id, assigned once (lowest
   * free slot in that enemy's row) and kept for the rest of combat — even
   * after death — so a mid-row kill doesn't make survivors teleport to fill
   * the gap or make the corpse's death animation play in the wrong spot.
   * Without this, position was `list.findIndex(...)` into the live
   * (post-death, compacted) array, recomputed fresh every frame.
   */
  enemySlots: Map<string, number>;
  /** Same stable-slot treatment as `enemySlots`, for summoned allies. */
  allySlots: Map<string, number>;
  popups: DamagePopup[];
  /** Dialog barks (sibling channel — not damage popups). */
  barks: CombatBark[];
  /** Last displayed library bark in wall-clock time. Legacy barks do not use this. */
  lastLibraryBarkAt: number;
  /**
   * Recent non-death bark pushes for the ~100ms global window
   * ({ start, priority } kept so we can keep top-2 by priority).
   */
  barkWindow: { at: number; priority: number }[];
  /** Spell/skill name banner (top window). */
  banner: string | null;
  bannerUntil: number;
  /** When the current banner appeared — drives its fade-in/out. */
  bannerStart: number;
  /**
   * Boss intro nameplate — separate from the spell banner so the first enemy
   * turn's resolveAndPlay clear doesn't wipe the reveal.
   */
  introNameplate: string | null;
  introNameplateUntil: number;
  introNameplateStart: number;
  /** Boss enemy def id — drives per-boss nameplate accent / silhouette FX. */
  introBossId: string | null;
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
  /** Shared impact presentation state (hit-stop, zoom, env light, actor flash). */
  impact: CombatImpactState;
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
  // Sync reduced-motion preference from the browser before any combat effects.
  syncReducedMotionFromMediaQuery();
  // Lazy-load any summon sprite bundles that aren't yet cached (e.g. a
  // summon spell was cast for the first time this session).
  for (const ally of state.summonedAllies) {
    if (ally.spriteId) loadEnemySpriteBundle(ally.spriteId).catch(() => {});
  }
  const scene: CombatScene = {
    state,
    partyAnims: new Map(),
    enemyAnims: new Map(),
    allyAnims: new Map(),
    partyFormationTransitions: new Map(),
    enemyCorpses: [],
    allyCorpses: [],
    enemySlots: new Map(),
    allySlots: new Map(),
    popups: [],
    barks: [],
    lastLibraryBarkAt: -Infinity,
    barkWindow: [],
    banner: null,
    bannerUntil: 0,
    bannerStart: 0,
    introNameplate: null,
    introNameplateUntil: 0,
    introNameplateStart: 0,
    introBossId: null,
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
    impact: createImpactState(),
  };
  // Pre-seed slots in encounter / array order so the leftmost sprite matches
  // the target-select menu (which walks the same arrays). Without this,
  // whichever actor findActor touches first (highest initiative) claimed
  // slot 0 and scrambled visual order vs. menu order.
  for (const row of ["front", "back"] as const) {
    for (const e of state.enemies[row]) {
      enemySlotIndex(scene, row, e.instanceId);
    }
  }
  for (const a of state.summonedAllies) {
    allySlotIndex(scene, a.id);
  }
  return scene;
}

/**
 * Swap authoritative combat state while deriving any Card Trial row change
 * from its row + monotonic entry clock. ActorAnim remains the only owner of
 * in-flight interpolation; this map merely bridges one state swap to its
 * matching presentation event.
 */
export function setCombatSceneState(
  scene: CombatScene,
  state: CombatState
): void {
  const previous = scene.state.partyFormation;
  const next = state.partyFormation;
  scene.partyFormationTransitions.clear();
  if (
    previous?.kind === "card-trial-rows" &&
    next?.kind === "card-trial-rows"
  ) {
    for (const [actorId, destination] of Object.entries(
      next.rowsByActorId
    )) {
      const origin = previous.rowsByActorId[actorId];
      if (
        origin &&
        origin.row !== destination.row &&
        destination.rowEnteredAt > origin.rowEnteredAt
      ) {
        scene.partyFormationTransitions.set(actorId, {
          fromRow: origin.row,
          toRow: destination.row,
          rowEnteredAt: destination.rowEnteredAt,
        });
      }
    }
  }
  scene.state = state;
}

// --- Actor lookup helpers -------------------------------------------------------------

function anims(scene: CombatScene, kind: SceneCursor["kind"]): Map<string, ActorAnim> {
  return kind === "enemy"
    ? scene.enemyAnims
    : kind === "ally"
      ? scene.allyAnims
      : scene.partyAnims;
}

export function getAnim(scene: CombatScene, kind: SceneCursor["kind"], id: string, now: number): ActorAnim {
  const map = anims(scene, kind);
  let a = map.get(id);
  if (!a) {
    a = newActorAnim(now);
    map.set(id, a);
  }
  return a;
}

/**
 * Assign (or recall) a stable slot number for `id` within `occupyingIds`: the
 * lowest non-negative integer not already claimed by another occupant of the
 * group. Occupants are currently-living members *and* same-row fading corpses
 * — a death frees the number only after the corpse is purged from the scene,
 * so a same-turn / next-turn summon can't render full-opacity on top of a
 * still-fading body. Once assigned, an id keeps its slot for the rest of
 * combat (callers look it up directly rather than re-deriving it).
 */
function assignSlot(
  slots: Map<string, number>,
  occupyingIds: readonly string[],
  id: string
): number {
  const cached = slots.get(id);
  if (cached !== undefined) return cached;
  const used = new Set<number>();
  for (const otherId of occupyingIds) {
    if (otherId === id) continue;
    const s = slots.get(otherId);
    if (s !== undefined) used.add(s);
  }
  let n = 0;
  while (used.has(n)) n++;
  slots.set(id, n);
  return n;
}

function enemyOccupyingIds(scene: CombatScene, row: "front" | "back"): string[] {
  const living = scene.state.enemies[row].map((e) => e.instanceId);
  const corpses = scene.enemyCorpses
    .filter((e) => e.row === row)
    .map((e) => e.instanceId);
  return [...living, ...corpses];
}

export function enemySlotIndex(scene: CombatScene, row: "front" | "back", instanceId: string): number {
  return assignSlot(scene.enemySlots, enemyOccupyingIds(scene, row), instanceId);
}

export function allySlotIndex(scene: CombatScene, id: string): number {
  const livingIds = scene.state.summonedAllies.map((a) => a.id);
  const corpseIds = scene.allyCorpses.map((a) => a.id);
  return assignSlot(scene.allySlots, [...livingIds, ...corpseIds], id);
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
    const p = partyActorPos(s, pi, id, w, h, bd);
    return { kind: "party", ...p, class: s.party[pi].class };
  }
  for (const row of ["front", "back"] as const) {
    const list = s.enemies[row];
    const idx = list.findIndex((e) => e.instanceId === id);
    if (idx >= 0) {
      const base = list[idx]!.isBoss ? BOSS_SIZE : ENEMY_SIZE;
      const slot = enemySlotIndex(scene, row, id);
      const p = enemyPos(slot, row, w, h, bd, base);
      return { kind: "enemy", ...p };
    }
  }
  const corpseIdx = scene.enemyCorpses.findIndex((e) => e.instanceId === id);
  if (corpseIdx >= 0) {
    const e = scene.enemyCorpses[corpseIdx];
    const base = e.isBoss ? BOSS_SIZE : ENEMY_SIZE;
    const slot = scene.enemySlots.get(id) ?? enemySlotIndex(scene, e.row, id);
    const p = enemyPos(slot, e.row, w, h, bd, base);
    return { kind: "enemy", ...p };
  }
  const ai = s.summonedAllies.findIndex((a) => a.id === id);
  if (ai >= 0) {
    const slot = allySlotIndex(scene, id);
    const p = allyPos(slot, w, h, bd);
    return { kind: "ally", ...p };
  }
  const allyCorpseIdx = scene.allyCorpses.findIndex((a) => a.id === id);
  if (allyCorpseIdx >= 0) {
    const a = scene.allyCorpses[allyCorpseIdx]!;
    const slot = scene.allySlots.get(id) ?? allySlotIndex(scene, a.id);
    const p = allyPos(slot, w, h, bd);
    return { kind: "ally", ...p };
  }
  return null;
}

/** Resolve an actor's live paint position, including an in-flight move tween. */
function visualActor(
  scene: CombatScene,
  id: string,
  w: number,
  h: number,
  now: number
): ReturnType<typeof findActor> {
  const actor = findActor(scene, id, w, h);
  if (!actor) return null;
  const offset = animOffset(getAnim(scene, actor.kind, id, now), now);
  return {
    ...actor,
    x: actor.x + offset.x,
    y: actor.y + offset.y,
    footY: actor.footY + offset.y,
  };
}

/** Look up an actor's maximum HP for impact strength classification. */
function actorMaxHp(scene: CombatScene, id: string): number {
  const s = scene.state;
  const pc = s.party.find((c) => c.id === id);
  if (pc) return pc.maxHp;
  for (const row of ["front", "back"] as const) {
    const e = s.enemies[row].find((en) => en.instanceId === id);
    if (e) return e.hp;
  }
  const corpse = scene.enemyCorpses.find((e) => e.instanceId === id);
  if (corpse) return corpse.hp;
  const ally = s.summonedAllies.find((a) => a.id === id);
  if (ally) return ally.maxHp;
  const allyCorpse = scene.allyCorpses.find((a) => a.id === id);
  if (allyCorpse) return allyCorpse.maxHp;
  return 100; // fallback
}

// --- Choreography construction ----------------------------------------------------------

/** Slightly longer cast window so multishot volleys and charge sprites can breathe. */
const CAST_MS = 1100;
const CAST_IMPACT = CAST_MS * 0.65;
const MULTI_TARGET_STAGGER = 150;
export const DEATH_FADE_MS = 1050;
const BURST_MS = 620;
const FIELD_MS = 920;
const PROJECTILE_STAGGER_MS = 90;

/** Scale with a stable ±jitter so repeated seeded presentations are identical. */
function varyScale(base: number, jitter = 0.16, seed = 0): number {
  if (jitter <= 0) return base;
  return base * (1 + (deterministicNoise(seed) * 2 - 1) * jitter);
}

function step(at: number, run: (scene: CombatScene, now: number) => void): ChoreoStep {
  return { at, run, fired: false };
}

function actorMotionDescriptor(scene: CombatScene, id: string): {
  kind: SceneCursor["kind"];
  className?: string;
  enemyId?: string;
} | null {
  const party = scene.state.party.find((c) => c.id === id);
  if (party) return { kind: "party", className: party.class };
  for (const row of ["front", "back"] as const) {
    const enemy = scene.state.enemies[row].find((e) => e.instanceId === id);
    if (enemy) return { kind: "enemy", enemyId: enemy.id };
  }
  const corpse = scene.enemyCorpses.find((e) => e.instanceId === id);
  if (corpse) return { kind: "enemy", enemyId: corpse.id };
  const ally = scene.state.summonedAllies.find((a) => a.id === id);
  if (ally) return { kind: "ally", enemyId: ally.spriteId };
  return null;
}

export function motionStyleForSceneActor(scene: CombatScene, id: string): CombatMotionStyle {
  const descriptor = actorMotionDescriptor(scene, id);
  return descriptor ? motionStyleForActor(descriptor) : "stationary";
}

function profileForAttack(
  scene: CombatScene,
  actorId: string,
  opts: { critical?: boolean; ranged?: boolean; technique?: boolean } = {}
): MeleeMotionProfile {
  const style = motionStyleForSceneActor(scene, actorId);
  return meleeMotionProfile(style, {
    critical: opts.critical,
    ranged: opts.ranged,
    // Techniques are deliberately a little more committed than ordinary
    // attacks, while their rules/damage remain entirely in the game layer.
    weight: opts.technique ? "heavy" : undefined,
  });
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
  const actor = visualActor(scene, id, w, h, now);
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
    actorId: id,
  });
}

/**
 * Push a dialog bark above an actor. Live-anchored by actorId at draw time.
 * Respects mute, per-actor replace/drop, death-exempt global window.
 */
export function pushBark(
  scene: CombatScene,
  opts: {
    actorId: string;
    trigger: CombatBarkTrigger;
    text: string;
    source?: "legacy" | "library";
    speaker?: string;
    landmark?: BarkLandmark;
    priority?: number;
    durationMs?: number;
  },
  now: number
): boolean {
  if (!barksEnabled) return false;
  const source = opts.source ?? "legacy";
  // Char-based pathological guard (draw also clamps). ~11px/char at 19px FF36.
  if (opts.text.length * 11 > BARK_MAX_WIDTH_PX + 40) return false;

  const priority = opts.priority ?? policyBarkPriority(opts.trigger, source);
  const existing = scene.barks.find((b) => b.actorId === opts.actorId);
  if (existing) {
    if (priority <= existing.priority) return false;
    scene.barks = scene.barks.filter((b) => b.actorId !== opts.actorId);
  }

  if (source === "library") {
    // The old MVP channel remains authoritative for its three proven lines.
    // A library line never covers one of those lines, and library lines do
    // not stack on top of one another in the same combat beat.
    if (scene.barks.some((b) => b.source === "legacy")) return false;
    const activeLibrary = scene.barks.find((b) => b.source === "library");
    if (activeLibrary) {
      if (priority <= activeLibrary.priority) return false;
      scene.barks = scene.barks.filter((b) => b.source !== "library");
    }
    const high = libraryBarkCanInterrupt(opts.trigger);
    if (!high && now - scene.lastLibraryBarkAt < LIBRARY_BARK_COOLDOWN_MS) return false;
  }

  if (opts.trigger !== "death") {
    scene.barkWindow = scene.barkWindow.filter((e) => now - e.at <= BARK_WINDOW_MS);
    const inWindow = scene.barkWindow.length;
    if (inWindow >= BARK_GLOBAL_CAP) {
      const minPri = Math.min(...scene.barkWindow.map((e) => e.priority));
      if (priority <= minPri) return false;
      // Drop one lowest-priority window slot to make room.
      const dropAt = scene.barkWindow.findIndex((e) => e.priority === minPri);
      if (dropAt >= 0) scene.barkWindow.splice(dropAt, 1);
    }
    scene.barkWindow.push({ at: now, priority });
  }

  const rate = Math.max(1, scene.playbackRate || 1);
  scene.barks.push({
    text: opts.text,
    actorId: opts.actorId,
    start: now,
    color: BARK_COLOR,
    priority,
    source,
    speaker: opts.speaker,
    landmark: opts.landmark,
    durationMs: (opts.durationMs ?? barkDurationMs(opts.text, source)) / rate,
  });
  if (source === "library") scene.lastLibraryBarkAt = now;
  return true;
}

/**
 * Soft whiff burst for evade/miss only (Slice 3). Shared by party→enemy and
 * enemy→party — both emit `miss`/`techniqueMiss` into the same playTurn case.
 * Soft spark vocabulary (not damage boom, heal cross, or Tech slash/stun).
 */
export const MISS_PRESENTATION = {
  effect: "dispel_sparks",
  /** 16×16 cells → ~88px on screen; readable but still under the MISS popup. */
  scale: 5.5,
  durationMs: 360,
  color: COLORS.miss,
} as const;

/**
 * MISS popup + restrained soft-spark burst. No hurt anim, shake, or impact
 * particles — those stay on the hit path only.
 */
function missImpactSteps(
  t: number,
  targetId: string,
  w: number,
  h: number
): ChoreoStep[] {
  return [
    step(t, (scene, now) => {
      const actor = visualActor(scene, targetId, w, h, now);
      pushPopup(scene, targetId, "MISS", MISS_PRESENTATION.color, now, w, h, false);
      if (!actor) return;
      scene.effects.push({
        type: "burst",
        x: actor.x,
        y: actor.y,
        color: MISS_PRESENTATION.color,
        effect: MISS_PRESENTATION.effect,
        scale: MISS_PRESENTATION.scale,
        start: now,
        duration: MISS_PRESENTATION.durationMs,
      });
    }),
  ];
}

/** Optional impact presentation parameters for hit-stop / zoom / flash / env light. */
interface ImpactPresentationOpts {
  actorId?: string;
  crit?: boolean;
  heavy?: boolean;
  spellId?: string;
  spellTier?: number;
  isBossSignature?: boolean;
  isArea?: boolean;
  isFirstHit?: boolean;
  isFinalHit?: boolean;
  /** Presentation-only Card Trial Guard amount absorbed at this impact. */
  guardAbsorbed?: number;
  allowHitStop?: boolean;
  illumination?: IlluminationProfile;
  effectColor?: string;
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
  damageAmount?: number,
  underlay?: string,
  underlayScale?: number,
  impactOpts?: ImpactPresentationOpts
): ChoreoStep[] {
  return [
    step(t, (scene, now) => {
      const actor = visualActor(scene, targetId, w, h, now);
      const guardAbsorbed = impactOpts?.guardAbsorbed ?? 0;
      const fullyBlocked = guardAbsorbed > 0 && (damageAmount ?? 0) <= 0;
      if (actor && hurt && !fullyBlocked) {
        const anim = getAnim(scene, actor.kind, targetId, now);
        setAnimState(anim, "hurt", now);
        // Scale flash intensity by damage: 0.25 at small hits → 0.65 at big hits.
        const dmg = damageAmount ?? 0;
        anim.hitFlashIntensity = Math.max(0.25, Math.min(0.65, 0.25 + dmg / 180));
        // Brief recoil: enemies kick left (toward party), party/allies kick right.
        // Distance scales with damage so a heavy hit reads as a stagger and a
        // scratch barely registers.
        const recoilDir = actor.kind === "enemy" ? -1 : 1;
        const strength = impactOpts?.crit ? 1.45 : impactOpts?.heavy ? 1.2 : 1;
        const recoilPx = Math.max(5, Math.min(22, (5 + dmg / 25) * strength));
        const recoilMs = impactOpts?.crit ? 120 : impactOpts?.heavy ? 105 : 80;
        startMove(anim, recoilDir * recoilPx * actor.scale, 0, recoilMs, now, scene.playbackRate);
      }
      if (fullyBlocked) {
        pushPopup(scene, targetId, "BLOCK", COLORS.sp, now, w, h, true);
      } else {
        pushPopup(scene, targetId, text, color, now, w, h, big);
      }
      if (actor) {
        if (guardAbsorbed > 0) {
          scene.effects.push({
            type: "burst",
            x: actor.x,
            y: actor.y,
            color: COLORS.sp,
            effect: "px_shield",
            scale: fullyBlocked ? 1.0 : 0.78,
            glow: true,
            start: now,
            duration: 360,
          });
          if (!fullyBlocked) {
            pushPopup(scene, targetId, `-${guardAbsorbed} G`, COLORS.sp, now, w, h, false);
          }
        }
        if (underlay) {
          scene.effects.push({
            type: "burst",
            x: actor.x,
            y: actor.y,
            color,
            effect: underlay,
            scale: underlayScale ?? 1,
            start: now,
            duration: 280,
          });
        }
        if (effect) {
          scene.effects.push({
            type: "burst",
            x: actor.x,
            y: actor.y,
            color,
            effect,
            scale,
            start: now,
            // Long enough for multi-frame melee strips (slash_attack is 12
            // cells) to play a beat before the burst fades.
            duration: 450,
          });
        }
        if (hurt) {
          addScreenShake(scene, big ? 5 : 2.5, now, big ? 350 : 200);
          spawnImpactParticles(scene, actor.x, actor.y, color, big);
          pushLightGlow(scene, actor.x, actor.y, color, big ? 110 : 80, now, 320);
        }
      }
      // Trigger shared impact presentation (hit-stop, zoom, flash, env light).
      // Called after all visual effects are pushed so the held frame is complete.
      if (impactOpts && hurt && (damageAmount ?? 0) > 0 && !fullyBlocked) {
        triggerImpactPresentation(scene.impact, {
          actorId: impactOpts.actorId ?? targetId,
          targetId,
          damage: damageAmount ?? 0,
          crit: impactOpts.crit,
          spellId: impactOpts.spellId,
          isArea: impactOpts.isArea,
          isFirstHit: impactOpts.isFirstHit,
          isFinalHit: impactOpts.isFinalHit,
          allowHitStop: impactOpts.allowHitStop,
          x: actor?.x ?? w * 0.5,
          y: actor?.y ?? h * 0.5,
          targetMaxHp: actorMaxHp(scene, targetId),
          spellTier: impactOpts.spellTier,
          isBossSignature: impactOpts.isBossSignature,
          illumination: impactOpts.illumination,
          effectColor: impactOpts.effectColor ?? color,
        }, now, scene.playbackRate);
      }
    }),
    // Ease recoil home, then return to idle after the hurt strip.
    step(t + (impactOpts?.crit ? 120 : impactOpts?.heavy ? 105 : 80), (scene, now) => {
      const actor = findActor(scene, targetId, w, h);
      if (!actor || !hurt) return;
      const anim = getAnim(scene, actor.kind, targetId, now);
      const settleMs = impactOpts?.crit ? 165 : impactOpts?.heavy ? 145 : 120;
      startMove(anim, 0, 0, settleMs, now, scene.playbackRate);
    }),
    step(
      t +
        (impactOpts?.crit ? 120 : impactOpts?.heavy ? 105 : 80) +
        (impactOpts?.crit ? 165 : impactOpts?.heavy ? 145 : 120) +
        80,
      (scene, now) => {
      const actor = findActor(scene, targetId, w, h);
      if (!actor) return;
      const anim = getAnim(scene, actor.kind, targetId, now);
      if (anim.state === "hurt") setAnimState(anim, "idle", now);
      }
    ),
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
    const seed = x * 0.11 + y * 0.07 + i * 17.3;
    const angle = deterministicNoise(seed) * Math.PI * 2;
    const speed = 1.5 + deterministicNoise(seed + 1.7) * 2.5;
    scene.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.5,
      life: 0,
      maxLife: 350 + deterministicNoise(seed + 3.1) * 250,
      size: 2 + deterministicNoise(seed + 4.4) * 2,
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
    const seed = x * 0.13 + y * 0.09 + i * 19.1;
    const angle = deterministicNoise(seed) * Math.PI * 2;
    const speed = 1 + deterministicNoise(seed + 1.9) * 2;
    scene.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0,
      maxLife: 400 + deterministicNoise(seed + 3.3) * 300,
      size: 2 + deterministicNoise(seed + 4.6) * 2,
      color,
      gravity: 0.05,
      glow: true,
    });
  }
}

// --- Spell visual style mapping ------------------------------------------------

export interface EffectStyle {
  color: string;
  /** Projectile effect name (used for single-target casts). */
  projectile?: string;
  /** Burst effect name on impact. */
  burst: string;
  /** Field overlay effect for area/row spells. */
  field?: string;
  /** Drawn under the primary burst at the same impact (glow twin). */
  burstUnderlay?: string;
  burstUnderlayScale?: number;
  /** Drawn under the primary field (iso/glow twins). */
  fieldUnderlay?: string;
  fieldUnderlayScale?: number;
  /** Default scale for all effect stages. */
  scale?: number;
  /** Per-stage scale overrides (fall back to `scale` then 1). */
  projectileScale?: number;
  burstScale?: number;
  fieldScale?: number;
  /** Optional charge sprite drawn above the caster during the cast animation. */
  charge?: string;
  chargeScale?: number;
  /** Override charge linger (default = cast→impact window). Presentation only. */
  chargeDurationMs?: number;
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
  /** Elemental environment illumination profile for impact lighting. */
  illumination?: IlluminationProfile;
}

/** Soft cap so stacked particle sprinkles can't flood the effect list. */
const MAX_SCENE_EFFECTS = 40;
const MAX_PARTICLE_BURSTS = 4;

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
  // Underlay first so primary sits on top (draw order = push order).
  if (style.burstUnderlay) {
    scene.effects.push({
      type: "burst",
      x,
      y,
      color: style.color,
      effect: style.burstUnderlay,
      scale: varyScale(style.burstUnderlayScale ?? base * 1.05, 0.08, now * 0.01 + 1),
      glow: true,
      start: now,
      duration,
    });
  }
  for (let i = 0; i < count; i++) {
    const seed = now * 0.01 + i * 23.7;
    const ox = count > 1 ? (i - (count - 1) / 2) * 24 + (deterministicNoise(seed) * 12 - 6) : 0;
    const oy = count > 1 ? deterministicNoise(seed + 1.4) * 18 - 9 : 0;
    scene.effects.push({
      type: "burst",
      x: x + ox,
      y: y + oy,
      color: style.color,
      effect: style.burst,
      scale: varyScale(base, count > 1 ? 0.22 : 0.1, seed + 2.8),
      glow: style.glow,
      start: now + i * 45,
      duration: duration + i * 40,
    });
  }
  // Light the floor under the burst so the spell illuminates the room.
  const glowRadius = Math.min(190, 60 + base * 28);
  pushLightGlow(scene, x, y, style.color, glowRadius, now, Math.max(320, duration * 0.7));
}

/**
 * Push area field layer(s). Underlay first; when underlay is the iso fire twin,
 * also push `fire_explosion_iso_glow` (locked Meteor/Immolate layering).
 */
function pushFieldLayers(
  scene: CombatScene,
  fieldX: number,
  h: number,
  style: EffectStyle,
  now: number,
  fieldDuration: number,
  fieldBase: number
): void {
  if (style.fieldUnderlay) {
    scene.effects.push({
      type: "field",
      x: fieldX,
      y: h * 0.42,
      color: style.color,
      effect: style.fieldUnderlay,
      scale: varyScale((style.fieldUnderlayScale ?? fieldBase) * 0.9, 0.06, now * 0.01 + 2),
      glow: true,
      start: now,
      duration: fieldDuration,
    });
    // Special case: iso under mushroom gets its glow twin as a third layer.
    if (style.fieldUnderlay === "fire_explosion_iso") {
      scene.effects.push({
        type: "field",
        x: fieldX + 8,
        y: h * 0.44,
        color: style.color,
        effect: "fire_explosion_iso_glow",
        scale: varyScale(fieldBase * 0.85, 0.08, now * 0.01 + 3),
        glow: true,
        start: now + 40,
        duration: fieldDuration - 40,
      });
    }
  }
  scene.effects.push({
    type: "field",
    x: fieldX,
    y: h * 0.42,
    color: style.color,
    effect: style.field ?? style.burst,
    scale: varyScale(fieldBase, 0.06, now * 0.01 + 4),
    glow: style.glow,
    start: now,
    duration: fieldDuration,
  });
  scene.effects.push({
    type: "field",
    x: fieldX + 18,
    y: h * 0.46,
    color: style.color,
    effect: style.field ?? style.burst,
    scale: varyScale(fieldBase * 0.72, 0.1, now * 0.01 + 5),
    glow: style.glow,
    start: now + 70,
    duration: fieldDuration - 80,
  });
}

/** Micro particle sprinkles (8×8 elemental strips). Capped for perf. */
function pushParticleSprinkles(
  scene: CombatScene,
  x: number,
  y: number,
  color: string,
  effect: string,
  now: number,
  count: number,
  scale: number,
  opts?: { underlay?: string; underlayScale?: number }
): void {
  if (scene.effects.length > MAX_SCENE_EFFECTS) return;
  const n = Math.min(MAX_PARTICLE_BURSTS, Math.max(1, count));
  if (opts?.underlay) {
    scene.effects.push({
      type: "burst",
      x,
      y,
      color,
      effect: opts.underlay,
      scale: opts.underlayScale ?? scale * 1.1,
      glow: true,
      start: now,
      duration: 320,
    });
  }
  for (let i = 0; i < n; i++) {
    const seed = now * 0.01 + i * 29.3;
    const ox = (i - (n - 1) / 2) * 14 + (deterministicNoise(seed) * 8 - 4);
    const oy = deterministicNoise(seed + 1.6) * 12 - 6;
    scene.effects.push({
      type: "burst",
      x: x + ox,
      y: y + oy,
      color,
      effect,
      scale: varyScale(scale, 0.2, seed + 2.2),
      start: now + i * 35,
      duration: 360 + i * 30,
    });
  }
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
    const seed = now * 0.01 + i * 31.1;
    const drift = count > 1 ? deterministicNoise(seed) * 14 - 7 : 0;
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
      scale: varyScale(base, jitter, seed + 2.4),
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
    const seed = now * 0.01 + i * 37.9;
    const tx = baseX + deterministicNoise(seed) * spanX;
    const ty = h * 0.28 + deterministicNoise(seed + 1.2) * h * 0.22;
    const fx = tx + (deterministicNoise(seed + 2.4) * 40 - 20);
    const fy = h * 0.04 + deterministicNoise(seed + 3.6) * 20;
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
      scale: varyScale(base * (0.75 + deterministicNoise(seed + 4.8) * 0.45), jitter, seed + 6),
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
    fieldUnderlay: "large_fire_glow",
    scale: 2.5,
    charge: "mp_fire_bomb_full",
    chargeScale: 0.6,
    projectileCount: 1,
    projectilePath: "riseDash",
    riseFrac: 0.56,
    riseLift: 68,
    illumination: ELEMENT_ILLUMINATION_DEFAULTS.fire,
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
    illumination: ELEMENT_ILLUMINATION_DEFAULTS.cold,
  },
  // Physical was previously burst-only with no field/charge; the retro2
  // crescent-slash reads as a blade arc, a much better fit than the
  // undead-shared zombie_explosion.
  physical: { color: "#f5f0e6", burst: "retro2_crescent_slash", burstScale: 1.3, field: "retro_crescent_arc", fieldScale: 1.1, illumination: ELEMENT_ILLUMINATION_DEFAULTS.physical },
  undead: { color: "#c080ff", projectile: "red_lightning_blast", burst: "zombie_explosion", field: "red_energy_glow", scale: 1.3, charge: "red_lightning_blast_glow", chargeScale: 0.4, projectileCount: 1 },
  lightning: {
    color: "#ffd769",
    projectile: "lightning_blast",
    burst: "mp_lightning",
    burstScale: 1.1,
    burstUnderlay: "lightning_blast_glow",
    burstUnderlayScale: 1.2,
    field: "lightning_energy_glow",
    scale: 1.8,
    charge: "mp_lightning_full",
    chargeScale: 0.55,
    projectileCount: 1,
    illumination: ELEMENT_ILLUMINATION_DEFAULTS.lightning,
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
  divine: { color: "#ffe8a0", burst: "retro_starburst", burstScale: 1.6, field: "retro_sun_ring", fieldScale: 1.3, charge: "retro_sun_ring", chargeScale: 0.5, illumination: ELEMENT_ILLUMINATION_DEFAULTS.divine },
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
    projectile: "fireball",
    projectileScale: 2.8,
    projectilePath: "riseDash",
    riseFrac: 0.56,
    riseLift: 66,
    // Fire mushroom + glow twin — reads as magic, not a sword slash (vs Tech).
    burst: "fz_explosion",
    burstScale: 1.45,
    burstUnderlay: "fire_explosion_glow",
    burstUnderlayScale: 1.25,
    burstCount: 2,
    glow: true,
    charge: "mp_fire_bomb_full",
    chargeScale: 0.55,
  },
  "mage-spark": {
    color: "#d0e8ff",
    // px_magic_ray (visual-design-pass 2026-07-27 item 5) is wired correctly
    // but the source asset itself is a flat gradient band with no bolt
    // silhouette — it reads as a color swatch, not lightning, at any scale.
    // lightning_blast is a real jagged-fork bolt strip, already horizontal
    // (54x18 native, vs. px_ sprites' 16x16 square), already used as the
    // generic "lightning" element's projectile — reused here instead of
    // authoring new art.
    projectile: "lightning_blast",
    projectileScale: 1.8,
    projectilePath: "riseDash",
    riseFrac: 0.54,
    riseLift: 62,
    burst: "px_magic_sparks",
    burstScale: 6.0,
    burstUnderlay: "lightning_blast_glow",
    burstUnderlayScale: 1.0,
    charge: "mp_spark_full",
    chargeScale: 0.65,
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
    field: "ice_burst_grey",
    fieldScale: 1.05,
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
    projectile: "px_arcane_bolt",
    projectileScale: 2.8,
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
  // Tier-2 healing vocabulary: a stronger cross impact, a monochrome cleanse,
  // and a restrained party-wide bloom instead of three identical heal orbs.
  "priest-cure-serious": {
    color: "#8fffb0",
    projectile: "heal_sparks",
    projectileScale: 2.1,
    burst: "priest_heal",
    burstScale: 1.15,
    scale: 1.2,
  },
  "priest-cure-blind": {
    color: "#f5f0e6",
    burst: "px_black_white_sparks",
    burstScale: 6.0,
    scale: 1.1,
  },
  "priest-mass-cure": {
    color: "#8fffb0",
    projectile: "heal_sparks",
    projectileScale: 1.65,
    projectileCount: 3,
    projectileScaleJitter: 0.15,
    burst: "heal_sparks",
    burstScale: 2.4,
    burstCount: 2,
    field: "priest_heal",
    fieldScale: 0.82,
    scale: 1.15,
  },
  // Higher-tier single-target heals: escalate Critical past Serious's spark→cross,
  // give Regenerate a soft lingering spark knit (not a bigger punch), and reserve
  // a divine sun underlay for Heal — single-target miracle, not mass bloom / Raise Dead.
  "priest-cure-critical": {
    color: "#8fffb0",
    projectile: "priest_heal",
    projectileScale: 1.1,
    burst: "priest_heal",
    burstScale: 1.5,
    burstCount: 2,
    scale: 1.3,
  },
  "priest-regenerate": {
    color: "#8fffb0",
    projectile: "heal_sparks",
    projectileScale: 1.45,
    burst: "heal_sparks",
    burstScale: 2.8,
    burstCount: 3,
    burstDurationMs: 1400,
    burstUnderlay: "px_magic_sparks",
    burstUnderlayScale: 4.8,
    scale: 1.1,
  },
  "priest-heal": {
    color: "#c8ffe0",
    charge: "retro_sun_ring",
    chargeScale: 0.55,
    projectile: "priest_heal",
    projectileScale: 1.35,
    burst: "priest_heal",
    burstScale: 1.75,
    burstCount: 2,
    burstUnderlay: "retro_sun_ring",
    burstUnderlayScale: 1.35,
    scale: 1.4,
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
    charge: "mp_fire_bomb_full",
    chargeScale: 0.65,
  },
  // Immolate — mushroom-cloud column + 3 staggered fireballs; iso underlay twin.
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
    fieldUnderlay: "fire_explosion_iso",
    charge: "mp_fire_bomb_full",
    chargeScale: 0.7,
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
  // Summons — Foozle portal swirl per school + elemental particle sprinkles.
  "mage-summon-fire-elemental": {
    color: "#ff9a3a",
    burst: "fz_portal_orange",
    burstScale: 1.3,
    burstUnderlay: "elemental_v1",
    burstUnderlayScale: 10,
    burstCount: 1,
    field: "fz_portal_orange",
    fieldScale: 0.7,
  },
  "mage-conjure-elemental": {
    color: "#c080ff",
    burst: "fz_portal",
    burstScale: 1.2,
    burstUnderlay: "elemental_v2",
    burstUnderlayScale: 10,
    field: "fz_portal",
    fieldScale: 0.7,
  },
  "mage-gate": {
    color: "#c080ff",
    burst: "fz_portal",
    burstScale: 1.6,
    burstUnderlay: "elemental_v1",
    burstUnderlayScale: 11,
    field: "fz_portal",
    fieldScale: 0.9,
    fieldUnderlay: "retro3_sigil_charge",
    fieldUnderlayScale: 1.4,
    charge: "mp_dark_bolt_full",
    chargeScale: 0.45,
  },
  "priest-summon-guardian": {
    color: "#ffe27a",
    burst: "fz_portal_gold",
    burstScale: 1.2,
    burstUnderlay: "elemental_v2",
    burstUnderlayScale: 9,
    field: "fz_portal_gold",
    fieldScale: 0.7,
  },
  "priest-summon-celestial-guardian": {
    color: "#ffe27a",
    burst: "fz_portal_gold",
    burstScale: 1.5,
    burstUnderlay: "elemental_v1",
    burstUnderlayScale: 10,
    field: "fz_portal_gold",
    fieldScale: 0.8,
  },
  "priest-summon-celestial": {
    color: "#ffe27a",
    burst: "fz_portal_gold",
    burstScale: 1.3,
    burstUnderlay: "elemental_v2",
    burstUnderlayScale: 9,
    field: "fz_portal_gold",
    fieldScale: 0.7,
  },
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
  // Hold Person / Power Word: Stun — both are disable/paralysis singleEnemy and
  // both used to fall through to STATUS_STYLES.paralysis → free_stunburst @1.2,
  // so a soft T2 bind and a T4 spoken command looked identical. Split by
  // spell-id override only — do NOT touch the global paralysis STATUS_STYLES
  // (enemy-inflicted paralysis / technique underlays must stay coherent), and
  // leave mage-web's free_tangle alone.
  //
  // Hold Person (T2): a soft arcane bolt carries a locking ring to ONE body.
  // free_wardring expands late (same linger need as Shield of Faith); no field
  // — singleEnemy would never push one. free_tangle stays Web's vine signature.
  "mage-hold-person": {
    color: "#c8c4b8",
    projectile: "px_arcane_bolt",
    projectileScale: 2.2,
    burst: "free_wardring",
    burstScale: 1.35,
    burstDurationMs: 900,
  },
  // Power Word: Stun (T4): abrupt spoken command — no travel time. Keeps the
  // stun-star vocabulary of the global paralysis fallback but punches harder
  // (larger scale + shockwave underlay twin) so it reads as a word of power,
  // not a Fighter technique hit (those pair free_slash + free_stunburst).
  "mage-power-word-stun": {
    color: "#c8c4b8",
    burst: "free_stunburst",
    burstScale: 1.65,
    burstUnderlay: "retro_shockwave",
    burstUnderlayScale: 1.4,
    burstCount: 2,
  },
  // Silence/Dispel — ward-ring + B/W sparkle burst for the cancel beat.
  "mage-silence": {
    color: "#7fe0e0",
    field: "free_wardring",
    fieldScale: 0.7,
    burst: "px_black_white_sparks",
    burstScale: 5.5,
  },
  "mage-dispel-magic": {
    color: "#7fe0e0",
    field: "free_wardring",
    fieldScale: 0.7,
    burst: "px_black_white_sparks",
    burstScale: 5.5,
  },

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
  // Priest wards — Shield of Faith (T1, singleAlly) and Bless (T3, allAllies)
  // are both `buff/armor` and both used to fall through to the bare px_shield
  // kind fallback, so "one ally" and "the whole party" looked identical.
  // They are split along the grammar the choreography already enforces:
  // only a non-area cast draws a caster→target projectile, and a `field` is
  // only pushed for area targets (a field on Shield of Faith would be dead
  // data, so its absence is the honest "not party-wide" signal).
  //
  // Shield of Faith: a ward-sphere is carried to ONE ally and snaps shut as a
  // ring flare around that body. px_shield is a fully opaque disc, so it is
  // pulled well under the fallback's 1.6 — at 1.6 it swallowed the ally it was
  // protecting (verified in capture) — and the transparent free_wardring
  // underlay is the layer that carries the size. (free_wardring also backs
  // Silence/Dispel, but those only ever field the ENEMY side.)
  "priest-shield-of-faith": {
    color: COLORS.sp,
    projectile: "px_shield",
    projectileScale: 1.1,
    burst: "px_shield",
    burstScale: 1.2,
    burstUnderlay: "free_wardring",
    burstUnderlayScale: 1.9,
    // free_wardring only reaches its expanded-ring frames ~400ms in (strip fps
    // × EFFECT_ANIM_SPEED), so the default 620ms burst died as a bare dot. The
    // longer linger is also what lets the bubble fade off the ally's sprite.
    burstDurationMs: 900,
    scale: 1.2,
  },
  // Bless: a blessing sigil inscribed over the whole party — a large slow glyph
  // hangs over the party column while a small one flickers on each ally. No
  // projectile is thrown at anyone. retro3_sigil_charge was registered but had
  // never rendered (mage-gate declares it as a fieldUnderlay, and Gate targets
  // "self", so that field is never pushed) — it is unclaimed ward vocabulary,
  // and deliberately not Holy Aura's solar vortex or Spell Shield's square.
  "priest-bless": {
    color: "#ffe27a",
    burst: "retro3_sigil_charge",
    burstScale: 0.95,
    field: "retro3_sigil_charge",
    fieldScale: 1.15,
    fieldDurationMs: 1000,
    scale: 1.15,
  },
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
    fieldUnderlay: "fire_explosion_iso",
    charge: "mp_fire_bomb_full",
    chargeScale: 0.7,
  },
  "mage-disintegrate": {
    color: "#c080ff",
    projectile: "px_black_white_ray",
    projectileScale: 2.8,
    projectilePath: "riseDash",
    riseFrac: 0.6,
    riseLift: 78,
    burst: "px_darkness_orb",
    burstScale: 7.0,
    burstCount: 2,
    burstUnderlay: "mp_dark_bolt",
    burstUnderlayScale: 1.1,
    field: "px_darkness_bolt",
    fieldScale: 5.5,
    charge: "mp_dark_bolt_full",
    chargeScale: 0.55,
  },
  "mage-shrink": {
    color: "#a0d8ff",
    burst: "ice_burst_grey",
    burstScale: 1.4,
    scale: 1.15,
  },
  "priest-giant-strength": {
    color: "#e8a060",
    burst: "px_shield",
    burstScale: 1.8,
    scale: 1.25,
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
  slow: { color: "#d6f7ff", burst: "ice_burst_grey", burstScale: 1.15, glow: true },
  // Burn DoT (Meteor Swarm followup) — fire burst + glow twin underlay.
  burn: {
    color: "#ff9a50",
    burst: "fire_explosion",
    burstScale: 1.1,
    burstUnderlay: "fire_explosion_glow",
    burstUnderlayScale: 1.15,
  },
};

/**
 * Shared visual language for the authored chemistry verbs. These are kept in
 * the choreography module so Canvas and Phaser receive the same effect ids,
 * colors, and timing; neither painter infers chemistry from ordinary damage.
 */
const CHEMISTRY_STYLES: Record<string, EffectStyle> = {
  throwAlly: {
    color: "#d8ef68",
    projectile: "red_energy",
    burst: "red_energy_glow",
    burstUnderlay: "dispel_sparks",
    burstScale: 1.35,
    scale: 1.25,
    glow: true,
  },
  consumeAlly: {
    color: "#c080ff",
    burst: "zombie_explosion",
    burstUnderlay: "red_energy_glow",
    burstUnderlayScale: 1.1,
    burstScale: 1.25,
    scale: 1.2,
    glow: true,
  },
  detonateAlly: {
    color: "#ff8c42",
    projectile: "mp_fire_bomb",
    burst: "fire_explosion",
    burstUnderlay: "fire_explosion_glow",
    burstScale: 1.35,
    scale: 1.35,
    glow: true,
  },
  packStrike: {
    color: "#f5f0e6",
    burst: "retro2_crescent_slash",
    burstUnderlay: "free_stunburst",
    burstUnderlayScale: 0.9,
    burstScale: 1.25,
    scale: 1.2,
  },
  guardAlly: {
    color: "#7fe0e0",
    burst: "px_shield",
    burstScale: 1.5,
    scale: 1.25,
    glow: true,
  },
  overload: {
    color: "#7fe0e0",
    projectile: "rune-beam",
    burst: "lightning_blast",
    burstUnderlay: "lightning_blast_glow",
    burstScale: 1.35,
    scale: 1.25,
    glow: true,
  },
};

function chemistryStyleForEvent(
  event: Extract<CombatEvent, { type: "chemistry" }>
): EffectStyle {
  // Bone Harvest shares the consumeAlly presentation key with the generic
  // resource verb, but its payoff is restorative and should read as such.
  if (event.chemistryId === "chem-bone-harvest") {
    return {
      color: COLORS.heal,
      burst: "priest_heal",
      burstUnderlay: "retro2_solar_ring",
      burstUnderlayScale: 0.9,
      burstScale: 1.25,
      scale: 1.2,
      glow: true,
    };
  }
  return CHEMISTRY_STYLES[event.presentation ?? "consumeAlly"] ?? CHEMISTRY_STYLES.consumeAlly!;
}

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
    return { color: COLORS.spellBurst, burst: "fire_explosion", burstUnderlay: "fire_explosion_glow" };
  }
  const spell = spellId ? spellById(spellId) : undefined;
  if (spell) {
    const eff = spell.effect;
    if (eff.kind === "damage" && eff.element) {
      return ELEMENT_STYLES[eff.element] ?? { color: COLORS.spellBurst, burst: "fire_explosion", burstUnderlay: "fire_explosion_glow" };
    }
    if (eff.kind === "heal") {
      return { color: COLORS.heal, projectile: "priest_heal", burst: "priest_heal", scale: 1.2 };
    }
    if (eff.kind === "buff" || eff.kind === "magicScreen") {
      return { color: COLORS.sp, burst: "px_shield", burstScale: 1.6, field: "px_shield", fieldScale: 0.8, scale: 1.2 };
    }
    if (eff.kind === "cure" || eff.kind === "resurrect" || eff.kind === "massResurrect") {
      return { color: COLORS.heal, burst: "priest_heal", scale: 1.2 };
    }
    if (eff.kind === "disable" && eff.status) {
      return STATUS_STYLES[eff.status] ?? { color: COLORS.poison, burst: "red_energy" };
    }
    if (eff.kind === "fizzleField" || eff.kind === "dispelMagic") {
      return {
        color: "#7fe0e0",
        field: "free_wardring",
        fieldScale: 0.7,
        burst: "px_black_white_sparks",
        burstScale: 5.5,
      };
    }
    if (eff.kind === "combatStatus") {
      return eff.status === "giantStrength"
        ? { color: "#e8a060", burst: "px_shield", burstScale: 1.8, scale: 1.25 }
        : { color: "#a0d8ff", burst: "ice_burst_grey", burstScale: 1.4, scale: 1.15 };
    }
    if (eff.kind === "summon") {
      return {
        color: COLORS.sp,
        burst: "fz_portal",
        burstScale: 1.1,
        burstUnderlay: "elemental_v1",
        burstUnderlayScale: 10,
        field: "fz_portal",
        fieldScale: 0.6,
        scale: 1.2,
      };
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
    return { color: COLORS.dmg, burst: "fire_explosion", burstUnderlay: "fire_explosion_glow" };
  }
  return { color: COLORS.spellBurst, burst: "fire_explosion", burstUnderlay: "fire_explosion_glow" };
}

export type MeleeHitEffect = {
  effect: string;
  scale: number;
  underlay?: string;
  underlayScale?: number;
};

/** Resolve melee hit burst (+ optional staff underlay) from class / crit. */
export function resolveMeleeHitEffect(
  className: string | undefined,
  opts: { crit?: boolean; technique?: boolean } = {}
): MeleeHitEffect {
  // Techniques: blade/spark language — never elemental puff strips (combat-only
  // pass: Mag vs Tech must differ without reading the banner).
  if (opts.technique) {
    const base =
      className === "Mage"
        ? {
            effect: opts.crit ? "wizard_attack2" : "wizard_attack1",
            scale: opts.crit ? 1.35 : 1.2,
            underlay: "staff_attack" as string | undefined,
            underlayScale: 0.9,
          }
        : className === "Priest"
          ? {
              effect: "priest_attack",
              scale: 1.2,
              underlay: "staff_attack" as string | undefined,
              underlayScale: 0.9,
            }
          : className === "Fighter" || className === "Duelist"
            ? {
                effect: "free_slash",
                scale: opts.crit ? 1.75 : 1.55,
                underlay: "free_stunburst" as string | undefined,
                underlayScale: 0.95,
              }
            : {
                effect: "slash_attack",
                scale: opts.crit ? 4.6 : 4.2,
                underlay: "free_stunburst" as string | undefined,
                underlayScale: 0.85,
              };
    return base;
  }
  if (className === "Mage") {
    return {
      effect: opts.crit ? "wizard_attack2" : "wizard_attack1",
      scale: opts.crit ? 1.25 : 1.1,
      underlay: "staff_attack",
      underlayScale: 0.85,
    };
  }
  if (className === "Priest") {
    return {
      effect: "priest_attack",
      scale: 1.1,
      underlay: "staff_attack",
      underlayScale: 0.85,
    };
  }
  if (className === "Fighter" || className === "Duelist") {
    return { effect: "free_slash", scale: 1.4 };
  }
  // slash_attack cells are 25×21 — scale up so the strike reads at combat size.
  return { effect: "slash_attack", scale: 4 };
}

/**
 * Explicit inventory of effect ids referenced by combat presentation styles /
 * helpers. Prefer this over regex-scanning the file (P5 unused-id guard).
 */
export function collectReferencedEffectIds(): Set<string> {
  const ids = new Set<string>();
  const add = (s?: string): void => {
    if (s) ids.add(s);
  };
  const addStyle = (style: EffectStyle): void => {
    add(style.projectile);
    add(style.burst);
    add(style.field);
    add(style.charge);
    add(style.burstUnderlay);
    add(style.fieldUnderlay);
  };
  for (const style of Object.values(ELEMENT_STYLES)) addStyle(style);
  for (const style of Object.values(SPELL_OVERRIDES)) addStyle(style);
  for (const style of Object.values(STATUS_STYLES)) addStyle(style);
  for (const style of Object.values(CHEMISTRY_STYLES)) addStyle(style);
  // Bone Harvest uses the restorative variant of the consumeAlly key.
  ids.add("retro2_solar_ring");
  // Iso glow is pushed as a special-case third field layer.
  ids.add("fire_explosion_iso_glow");
  // Melee / projectile / death / particle / analyze hardcodes.
  for (const id of [
    "wizard_attack1",
    "wizard_attack2",
    "priest_attack",
    "staff_attack",
    "free_slash",
    "slash_attack",
    "free_stunburst",
    "arrow",
    "arrow_archer",
    "arrow_skeleton",
    "cannonball",
    "rune-beam",
    "demon-arrow",
    "eye-beam",
    "ghostfire-beam",
    "lava-spike",
    "warlock-magic",
    "zombie_death_explosion",
    "zombie_explosion",
    "elemental_v1",
    "elemental_v2",
    "extra_elemental",
    "extra_elemental_glow",
    "px_black_white_sparks",
    "fireball",
    "priest_heal",
    "lightning_energy",
    "red_energy",
    "lightning_energy_glow",
    // Slice 3 miss whiff (also referenced via STATUS_STYLES.poison / dispel
    // styles — listed explicitly so the miss path stays discoverable).
    MISS_PRESENTATION.effect,
  ]) {
    ids.add(id);
  }
  return ids;
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

// --- Special melee choreography: coordinated pack-tactic leap ---------------
// Used by enemy abilities flagged `presentation: "meleeGangUp"` (e.g. Orc's
// Pack Leap, data/enemy-abilities.ts): the attacker mounts a living ally of
// the same species, leaps past the front line to land beside the target,
// strikes, then leaps back into formation. Falls back to a plain in-place
// hop (no mount) when no eligible ally is found at animation time — the
// mount is resolved per-step from live scene state, never cached, since the
// same enemy id could in principle be re-used by a future solo spawn.

const GANG_UP_MOUNT_MS = 260;
const GANG_UP_HOLD_MS = 90;
const GANG_UP_LEAP_OUT_MS = 300;
const GANG_UP_LEAP_LAND_MS = 220;
const GANG_UP_ATTACK_MS = 560;
const GANG_UP_RETURN_OUT_MS = 260;
const GANG_UP_RETURN_IN_MS = 320;
const GANG_UP_DURATION_MS =
  GANG_UP_MOUNT_MS +
  GANG_UP_HOLD_MS +
  GANG_UP_LEAP_OUT_MS +
  GANG_UP_LEAP_LAND_MS +
  GANG_UP_ATTACK_MS +
  GANG_UP_RETURN_OUT_MS +
  GANG_UP_RETURN_IN_MS;

/** A living ally sharing the attacker's species id, to mount for the leap. */
function findGangUpMount(scene: CombatScene, attackerId: string): EnemyInstance | null {
  const all = [...scene.state.enemies.front, ...scene.state.enemies.back];
  const self = all.find((e) => e.instanceId === attackerId);
  if (!self) return null;
  return (
    all.find((e) => e.instanceId !== attackerId && e.id === self.id && e.currentHp > 0) ?? null
  );
}

function pushMeleeGangUpSteps(
  base: number,
  attackerId: string,
  targetId: string,
  damage: number,
  spellId: string,
  w: number,
  h: number
): ChoreoStep[] {
  const steps: ChoreoStep[] = [];
  let t = base;

  // Phase 1: hop onto an ally's back (or a stand-in vertical hop if solo).
  steps.push(
    step(t, (sc, n) => {
      const attacker = findActor(sc, attackerId, w, h);
      if (!attacker) return;
      const a = getAnim(sc, "enemy", attackerId, n);
      setAnimState(a, "walk", n);
      const mount = findGangUpMount(sc, attackerId);
      const mountPos = mount ? findActor(sc, mount.instanceId, w, h) : null;
      if (mount && mountPos) {
        startMove(
          a,
          (mountPos.x - attacker.x) * 0.8,
          mountPos.y - attacker.y - 30,
          GANG_UP_MOUNT_MS,
          n,
          sc.playbackRate
        );
        const mountAnim = getAnim(sc, "enemy", mount.instanceId, n);
        startMove(mountAnim, 0, 6, 100, n, sc.playbackRate);
        return;
      }
      startMove(a, 0, -26, GANG_UP_MOUNT_MS, n, sc.playbackRate);
    }),
    step(t + GANG_UP_MOUNT_MS, (sc, n) => {
      const mount = findGangUpMount(sc, attackerId);
      if (!mount) return;
      const mountAnim = getAnim(sc, "enemy", mount.instanceId, n);
      startMove(mountAnim, 0, 0, 120, n, sc.playbackRate);
    })
  );
  t += GANG_UP_MOUNT_MS + GANG_UP_HOLD_MS;

  // Phase 2: leap forward as a two-part rise/fall arc, landing just short of
  // the target so the strike reads as "right in front of them", not on them.
  const leapStart = t;
  steps.push(
    step(leapStart, (sc, n) => {
      const attacker = findActor(sc, attackerId, w, h);
      const target = findActor(sc, targetId, w, h);
      if (!attacker || !target) return;
      const a = getAnim(sc, "enemy", attackerId, n);
      const cur = animOffset(a, n);
      const apexDx = (target.x - attacker.x) * 0.55;
      const apexDy = Math.min(cur.y, -30) - 70;
      startMove(a, apexDx, apexDy, GANG_UP_LEAP_OUT_MS, n, sc.playbackRate);
    }),
    step(leapStart + GANG_UP_LEAP_OUT_MS, (sc, n) => {
      const attacker = findActor(sc, attackerId, w, h);
      const target = findActor(sc, targetId, w, h);
      if (!attacker || !target) return;
      const a = getAnim(sc, "enemy", attackerId, n);
      const landDx = target.x - attacker.x - 55;
      const landDy = target.y - attacker.y;
      startMove(a, landDx, landDy, GANG_UP_LEAP_LAND_MS, n, sc.playbackRate);
    })
  );
  t = leapStart + GANG_UP_LEAP_OUT_MS + GANG_UP_LEAP_LAND_MS;

  // Phase 3: attack pose + impact on the target.
  const attackAt = t;
  steps.push(
    step(attackAt, (sc, n) => {
      const attacker = findActor(sc, attackerId, w, h);
      if (!attacker) return;
      setAnimState(getAnim(sc, "enemy", attackerId, n), "attack", n);
    })
  );
  const impactAt = attackAt + GANG_UP_ATTACK_MS * 0.55;
  const style = resolveEffectStyle(spellId);
  steps.push(
    step(impactAt, (sc, n) => {
      const target = findActor(sc, targetId, w, h);
      if (!target) return;
      pushBursts(sc, target.x, target.y, style, n, burstDurationFor(spellId));
      spawnSparkleParticles(sc, target.x, target.y, style.color, 8);
      addScreenShake(sc, spellShakeAmount(spellId, damage), n, 250);
    }),
    ...impactSteps(impactAt, targetId, `${damage}`, COLORS.dmg, w, h, true, false, undefined, undefined, damage)
  );
  t = attackAt + GANG_UP_ATTACK_MS;
  steps.push(
    step(t, (sc, n) => {
      const attacker = findActor(sc, attackerId, w, h);
      if (!attacker) return;
      const a = getAnim(sc, "enemy", attackerId, n);
      if (a.state === "attack" || a.state === "attack_ranged") setAnimState(a, "idle", n);
    })
  );

  // Phase 4: leap back into formation — a mirrored arc back to the home slot.
  const backStart = t;
  steps.push(
    step(backStart, (sc, n) => {
      const a = getAnim(sc, "enemy", attackerId, n);
      setAnimState(a, "walk", n);
      const cur = animOffset(a, n);
      startMove(a, cur.x * 0.5, Math.min(cur.y, -20) - 50, GANG_UP_RETURN_OUT_MS, n, sc.playbackRate);
    }),
    step(backStart + GANG_UP_RETURN_OUT_MS, (sc, n) => {
      const a = getAnim(sc, "enemy", attackerId, n);
      startMove(a, 0, 0, GANG_UP_RETURN_IN_MS, n, sc.playbackRate);
    }),
    step(backStart + GANG_UP_RETURN_OUT_MS + GANG_UP_RETURN_IN_MS, (sc, n) => {
      const a = getAnim(sc, "enemy", attackerId, n);
      if (a.state === "walk") setAnimState(a, "idle", n);
    })
  );

  return steps;
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

  // Clear any impact presentation state from the previous turn.
  resetImpactState(scene.impact);

  // Card Trial swaps the authoritative formation profile before presenting
  // the resolved events. Seed each matching actor at its old row as an offset
  // from the new-row base, following the established rowAdvance convention.
  // Keeping this pre-scan separate is important for Parting Blow: its attack
  // event precedes hero-move, so the actor must remain at the old anchor until
  // the later move beat begins instead of teleporting before the strike.
  const pendingPartyMoves = new Map<
    string,
    {
      eventIndex: number;
      rowEnteredAt: number;
      offset: { x: number; y: number };
    }
  >();
  for (let i = 0; i < events.length; i++) {
    const evt = events[i];
    if (!evt || evt.type !== "partyRowMove") continue;
    const transition = scene.partyFormationTransitions.get(evt.actorId);
    if (
      !transition ||
      transition.toRow !== evt.row ||
      transition.rowEnteredAt !== evt.rowEnteredAt
    ) {
      continue;
    }
    const partyIndex = scene.state.party.findIndex((c) => c.id === evt.actorId);
    if (partyIndex < 0) continue;
    const oldPos = partyActorPos(
      scene.state,
      partyIndex,
      evt.actorId,
      w,
      h,
      scene.backdropId,
      { rowOverride: transition.fromRow }
    );
    const newPos = partyActorPos(
      scene.state,
      partyIndex,
      evt.actorId,
      w,
      h,
      scene.backdropId,
      { rowOverride: transition.toRow }
    );
    const offset = { x: oldPos.x - newPos.x, y: oldPos.y - newPos.y };
    pendingPartyMoves.set(evt.actorId, {
      eventIndex: i,
      rowEnteredAt: evt.rowEnteredAt,
      offset,
    });
    const anim = getAnim(scene, "party", evt.actorId, now);
    anim.moveFromX = offset.x;
    anim.moveFromY = offset.y;
    anim.moveToX = offset.x;
    anim.moveToY = offset.y;
    anim.moveStart = now;
    anim.moveDuration = 0;
  }

  let buildingEventIndex = -1;
  const formationHomeOffset = (actorId: string): { x: number; y: number } => {
    const pending = pendingPartyMoves.get(actorId);
    return pending && pending.eventIndex > buildingEventIndex
      ? pending.offset
      : { x: 0, y: 0 };
  };

  // Track the one actor currently away from its stable slot so a multi-event
  // turn can return it exactly once. The resolver remains authoritative; this
  // is only a visual offset ledger.
  let approached: { id: string; kind: SceneCursor["kind"]; returnMs: number } | null = null;

  // Reserve enough tail time for a killing-blow death bark to actually be
  // read, even when it's the last event of the turn — otherwise playback
  // completes (and the round/turn advances, or the victory screen appears)
  // while the line is still mid-bounce (spec 2026-07-26 §10).
  let lastDeathBarkVisibleUntil = 0;
  let lastActionTiming: Partial<Record<BarkLandmark, number>> | null = null;

  const approach = (
    actorId: string,
    targetId: string | undefined,
    profile: MeleeMotionProfile
  ): void => {
    const actor = findActor(scene, actorId, w, h);
    if (!actor) return;
    const target = targetId ? findActor(scene, targetId, w, h) : null;
    const actorHome = formationHomeOffset(actorId);
    const targetHome = targetId
      ? formationHomeOffset(targetId)
      : { x: 0, y: 0 };
    const offset = approachOffset(
      {
        actorX: actor.x + actorHome.x,
        actorY: actor.y + actorHome.y,
        targetX:
          target === null
            ? actor.x + actorHome.x + (actor.kind === "enemy" ? 180 : -180)
            : target.x + targetHome.x,
        targetY: target === null ? actor.y + actorHome.y : target.y + targetHome.y,
        actorScale: actor.scale,
        canvasWidth: w,
        canvasHeight: h,
      },
      profile
    );
    approached = { id: actorId, kind: actor.kind, returnMs: profile.returnMs };
    const coilMs = Math.min(profile.anticipationMs, profile.approachMs * 0.42);
    steps.push(
      step(t, (sc, n) => {
        const a = getAnim(sc, actor.kind, actorId, n);
        setAnimState(a, "walk", n);
        startMove(
          a,
          actorHome.x + offset.x * -0.12,
          actorHome.y + offset.y * -0.12,
          coilMs,
          n,
          sc.playbackRate
        );
      }),
      step(t + coilMs, (sc, n) => {
        const a = getAnim(sc, actor.kind, actorId, n);
        startMove(
          a,
          actorHome.x + offset.x,
          actorHome.y + offset.y,
          profile.approachMs - coilMs,
          n,
          sc.playbackRate
        );
      })
    );
  };

  const returnHome = (returnMs = approached?.returnMs ?? 120): void => {
    if (!approached) return;
    const { id, kind } = approached;
    const home = formationHomeOffset(id);
    steps.push(
      step(t, (sc, n) => {
        const a = getAnim(sc, kind, id, n);
        setAnimState(a, "walk", n);
        startMove(a, home.x, home.y, returnMs, n, sc.playbackRate);
      }),
      step(t + returnMs, (sc, n) => {
        const a = getAnim(sc, kind, id, n);
        // Snap the canonical neutral offset at the boundary. This makes an
        // interrupted/large-jump frame safe for both painters.
        a.moveFromX = home.x;
        a.moveFromY = home.y;
        a.moveToX = home.x;
        a.moveToY = home.y;
        a.moveDuration = 0;
        if (a.state === "walk") setAnimState(a, "idle", n);
      })
    );
    t += returnMs;
    approached = null;
  };

  const clearAttackIfPlaying = (a: ActorAnim, n: number): void => {
    if (a.state === "attack" || a.state === "attack_ranged") setAnimState(a, "idle", n);
  };

  const attackAnim = (
    actorId: string,
    animState: ActorSpriteState = "attack",
    profile: MeleeMotionProfile
  ): void => {
    const coilMs = profile.anticipationMs;
    steps.push(
      step(t, (sc, n) => {
        const actor = findActor(sc, actorId, w, h);
        if (!actor) return;
        const a = getAnim(sc, actor.kind, actorId, n);
        startMove(a, 0, profile.liftPx * 0.25, coilMs, n, sc.playbackRate);
      }),
      step(t + coilMs, (sc, n) => {
        const actor = findActor(sc, actorId, w, h);
        if (!actor) return;
        const a = getAnim(sc, actor.kind, actorId, n);
        setAnimState(a, animState, n);
        startMove(a, 0, profile.liftPx, profile.strikeMs - coilMs, n, sc.playbackRate);
      }),
      step(t + coilMs + profile.strikeMs, (sc, n) => {
        const actor = findActor(sc, actorId, w, h);
        if (!actor) return;
        const a = getAnim(sc, actor.kind, actorId, n);
        startMove(a, 0, 0, profile.returnMs, n, sc.playbackRate);
        clearAttackIfPlaying(a, n);
      })
    );
  };

  const castAnim = (actorId: string): void => {
    // A Card Trial movement card's ordinary name-banner/cast beat can precede
    // its partyRowMove event. Keep that actor braced around the derived old
    // row until the actual move beat instead of snapping it to the new base.
    // Outside that narrow pending-transition window this is exactly {0, 0}.
    const home = formationHomeOffset(actorId);
    steps.push(
      step(t, (sc, n) => {
        const actor = findActor(sc, actorId, w, h);
        if (!actor) return;
        const anim = getAnim(sc, actor.kind, actorId, n);
        setAnimState(anim, "cast", n);
        // A caster braces and lifts into the spell instead of standing as a
        // static effect anchor. The release beat gets a small extra lift;
        // both motions remain bounded and return to the canonical slot.
        startMove(
          anim,
          home.x,
          home.y - 8 * actor.scale,
          260,
          n,
          sc.playbackRate
        );
      }),
      step(t + CAST_IMPACT, (sc, n) => {
        const actor = findActor(sc, actorId, w, h);
        if (!actor) return;
        const anim = getAnim(sc, actor.kind, actorId, n);
        startMove(
          anim,
          home.x,
          home.y - 14 * actor.scale,
          120,
          n,
          sc.playbackRate
        );
      }),
      step(t + CAST_MS, (sc, n) => {
        const actor = findActor(sc, actorId, w, h);
        if (!actor) return;
        const a = getAnim(sc, actor.kind, actorId, n);
        startMove(a, home.x, home.y, 150, n, sc.playbackRate);
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

  // Pre-scan damage events to determine first/final hit sequencing for
  // impact presentation (hit-stop throttling, multi-hit rules).
  const damageInfos = preScanDamageEvents(events);
  const hitSequence = classifyHitSequence(damageInfos);

  for (let evtIndex = 0; evtIndex < events.length; evtIndex++) {
    buildingEventIndex = evtIndex;
    const evt = events[evtIndex];
    if (!evt) continue;

    switch (evt.type) {
      case "attack":
      case "ambush":
      case "techniqueHit": {
        // Presentation follows the action's weapon range, not class. Long-
        // range swings use `attack_ranged` (Thief bow strip); everything else
        // — close/short/medium attacks, ambush, techniques — uses melee
        // `attack` (Thief dagger/slash strip).
        const isRanged = evt.type === "attack" && evt.range === "long";
        const attackState: ActorSpriteState = isRanged ? "attack_ranged" : "attack";
        const attacker = findActor(scene, evt.actorId, w, h);
        const hitEffect = resolveMeleeHitEffect(attacker?.class, {
          crit: evt.crit === true,
          technique: evt.type === "techniqueHit",
        });
        const profile = profileForAttack(scene, evt.actorId, {
          critical: evt.crit === true,
          ranged: isRanged,
          technique: evt.type === "techniqueHit",
        });
        if (isRanged) {
          // Ranged: no approach; fire a projectile from attacker to target.
          const base = t;
          attackAnim(evt.actorId, attackState, profile);
          const releaseAt = base + profile.anticipationMs + profile.strikeMs * 0.2;
          const impact = base + contactTime(profile);
          steps.push(
            step(releaseAt, (sc, n) => {
              const from = visualActor(sc, evt.actorId, w, h, n);
              const to = visualActor(sc, evt.targetId, w, h, n);
              if (!from || !to) return;
              sc.effects.push({
                type: "projectile",
                x: from.x, y: from.y,
                fromX: from.x, fromY: from.y - 20 * from.scale,
                toX: to.x, toY: to.y,
                color: COLORS.dmg,
                ...projectileForActor(scene, evt.actorId, attacker?.class),
                start: n,
                duration: Math.max(80, impact - releaseAt),
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
              hitEffect.effect,
              hitEffect.scale,
                evt.damage,
                hitEffect.underlay,
                hitEffect.underlayScale,
                {
                  actorId: evt.actorId,
                  crit: evt.crit === true,
                  heavy: profile.weight === "heavy",
                  guardAbsorbed: evt.type === "attack" ? evt.absorbed : undefined,
                  isFirstHit: hitSequence.get(evtIndex)?.isFirst,
                  isFinalHit: hitSequence.get(evtIndex)?.isFinal,
                }
              )
          );
          t = base + profile.anticipationMs + profile.strikeMs + profile.returnMs;
          lastActionTiming = {
            anticipation: base,
            release: releaseAt,
            contact: impact,
            reaction: impact,
            settle: t,
          };
        } else {
          // Technique wind-up: a brief charge glow on the attacker before the
          // approach, so techniques read as deliberate power moves rather than
          // instant swings. Purely visual — does not change t or gameplay state.
          if (evt.type === "techniqueHit") {
            steps.push(
              step(t, (sc, n) => {
                const actor = findActor(sc, evt.actorId, w, h);
                if (!actor) return;
                // Warm steel-gold charge glow under the attacker.
                pushLightGlow(sc, actor.x, actor.y + 8, "#f0e6d0", 70, n, 280);
                // Brief gathering spark effect.
                sc.effects.push({
                  type: "charge",
                  x: actor.x,
                  y: actor.y - 12 * actor.scale,
                  color: "#f0e6d0",
                  effect: "free_stunburst",
                  scale: 0.7,
                  start: n,
                  duration: 220,
                });
              })
            );
          }
          // TypeScript cannot see assignments performed by the nested
          // approach/return helpers while it narrows the local variable.
          // Read it through an explicit snapshot so chained hits retain the
          // visual commitment without weakening the runtime invariant.
          const activeApproach = approached as {
            id: string;
            kind: SceneCursor["kind"];
            returnMs: number;
          } | null;
          const continuingMelee = activeApproach !== null && activeApproach.id === evt.actorId;
          if (!continuingMelee) approach(evt.actorId, evt.targetId, profile);
          const base = t;
          const techniqueCrit = evt.type === "techniqueHit" && evt.crit === true;
          const techniqueTarget = evt.type === "techniqueHit" ? evt.targetId : null;
          const attackAt = continuingMelee ? base : base + profile.approachMs;
          lastActionTiming = {
            anticipation: base,
            release: attackAt,
            contact: attackAt + profile.strikeMs * profile.contactFraction,
            reaction: attackAt + profile.strikeMs * profile.contactFraction,
            settle: attackAt + profile.strikeMs + profile.returnMs,
          };
          steps.push(
            step(attackAt, (sc, n) => {
              const actor = findActor(sc, evt.actorId, w, h);
              if (!actor) return;
              const anim = getAnim(sc, actor.kind, evt.actorId, n);
              setAnimState(anim, attackState, n);
              const current = animOffset(anim, n);
              // A chained multi-hit keeps its forward commitment and only
              // repeats the compact strike/recoil beat. The first hit got the
              // full approach above; the final hit returns through returnHome.
              startMove(
                anim,
                current.x,
                profile.liftPx,
                profile.strikeMs,
                n,
                sc.playbackRate
              );
            }),
            step(attackAt + profile.strikeMs, (sc, n) => {
              const actor = findActor(sc, evt.actorId, w, h);
              if (!actor) return;
              clearAttackIfPlaying(getAnim(sc, actor.kind, evt.actorId, n), n);
            })
          );
          steps.push(
            ...impactSteps(
              attackAt + profile.strikeMs * profile.contactFraction,
              evt.targetId,
              `${evt.damage}`,
              evt.crit === true ? COLORS.crit : COLORS.dmg,
              w,
              h,
              true,
              evt.crit === true,
              hitEffect.effect,
              hitEffect.scale,
              evt.damage,
              hitEffect.underlay,
              hitEffect.underlayScale,
              {
                actorId: evt.actorId,
                crit: evt.crit === true,
                heavy: profile.weight === "heavy",
                guardAbsorbed: evt.type === "attack" ? evt.absorbed : undefined,
                isFirstHit: hitSequence.get(evtIndex)?.isFirst,
                isFinalHit: hitSequence.get(evtIndex)?.isFinal,
              }
            )
          );
          if (techniqueTarget) {
            steps.push(
              step(attackAt + profile.strikeMs * profile.contactFraction, (sc, n) => {
                const to = visualActor(sc, techniqueTarget, w, h, n);
                if (!to) return;
                // Steel sparks — not extra_elemental (that read as low-tier magic).
                // Techniques get more debris and a wider underlay than basic attacks
                // so the contact frame reads as heavier.
                pushParticleSprinkles(
                  sc,
                  to.x,
                  to.y,
                  techniqueCrit ? COLORS.crit : "#f0e6d0",
                  "px_black_white_sparks",
                  n,
                  techniqueCrit ? 6 : 4,
                  8,
                  {
                    underlay: "free_stunburst",
                    underlayScale: techniqueCrit ? 1.3 : 1.1,
                  }
                );
                // Dust kick at the target's feet — physical, not elemental.
                pushLightGlow(sc, to.x, to.y + 6, "#c8b890", 90, n, 350);
                // Stronger screen shake for techniques vs basic attacks.
                addScreenShake(sc, techniqueCrit ? 6 : 4, n, 300);
              })
            );
          }
          t = attackAt + profile.strikeMs;
          const next = events[evtIndex + 1];
          const continues =
            !!next &&
            (next.type === "attack" || next.type === "techniqueHit") &&
            next.actorId === evt.actorId;
          if (continues) {
            // Give each hit a short visible reset without replaying the full
            // travel. This is deliberately below a normal attack's return.
            const interHitMs = Math.min(90, Math.max(55, Math.round(profile.returnMs * 0.45)));
            steps.push(
              step(t, (sc, n) => {
                const actor = findActor(sc, evt.actorId, w, h);
                if (!actor) return;
                const anim = getAnim(sc, actor.kind, evt.actorId, n);
                const current = animOffset(anim, n);
                startMove(anim, current.x, 0, interHitMs, n, sc.playbackRate);
              })
            );
            t += interHitMs;
          } else {
            returnHome();
          }
        }
        break;
      }

      case "miss":
      case "techniqueMiss": {
        if (evt.type === "miss" && evt.reason === "noTarget") break;
        const missProfile = profileForAttack(scene, evt.actorId);
        approach(evt.actorId, evt.targetId, missProfile);
        const base = t;
        const attackAt = base + missProfile.approachMs;
        lastActionTiming = {
          anticipation: base,
          release: attackAt,
          contact: attackAt + missProfile.strikeMs * missProfile.contactFraction,
          reaction: attackAt + missProfile.strikeMs * missProfile.contactFraction,
          settle: attackAt + missProfile.strikeMs + missProfile.returnMs,
        };
        steps.push(
          step(attackAt, (sc, n) => {
            const actor = findActor(sc, evt.actorId, w, h);
            if (!actor) return;
            const anim = getAnim(sc, actor.kind, evt.actorId, n);
            setAnimState(anim, "attack", n);
            const current = animOffset(anim, n);
            startMove(anim, current.x, missProfile.liftPx, missProfile.strikeMs, n, sc.playbackRate);
          })
        );
        if (evt.targetId) {
          // Shared choke for both directions (party→enemy and enemy→party).
          steps.push(
            ...missImpactSteps(
              attackAt + missProfile.strikeMs * missProfile.contactFraction,
              evt.targetId,
              w,
              h
            )
          );
        }
        steps.push(
          step(attackAt + missProfile.strikeMs, (sc, n) => {
            const actor = findActor(sc, evt.actorId, w, h);
            if (!actor) return;
            clearAttackIfPlaying(getAnim(sc, actor.kind, evt.actorId, n), n);
          })
        );
        t = attackAt + missProfile.strikeMs;
        returnHome();
        break;
      }

      case "technique": {
        // Show the technique name as a banner (like spell cast banner).
        showBanner(techniqueNameFor(evt.techniqueId), CAST_MS + 600);
        castAnim(evt.actorId);
        lastActionTiming = {
          anticipation: t,
          release: t + CAST_IMPACT * 0.6,
          contact: t + CAST_IMPACT,
          reaction: t + CAST_IMPACT,
          settle: t + CAST_MS,
        };
        t += CAST_MS * 0.6;
        break;
      }

      case "techniqueStatus": {
        // Status VFX on the target.
        const impactAt = t + 100;
        const status = evt.statusInflicted;
        const effectName = status === "paralysis" ? "lightning_energy"
          : status === "poison" ? "red_energy"
          : status === "slow" ? "ice_burst_grey"
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

      case "chemistry": {
        const style = chemistryStyleForEvent(evt);
        const label = evt.phase === "break" ? "COMBO BREAK" : evt.name.toUpperCase();
        const actorAt = (sc: CombatScene, n: number): void => {
          const actor = findActor(sc, evt.actorId, w, h);
          if (!actor) return;
          const anim = getAnim(sc, actor.kind, evt.actorId, n);
          if (evt.phase !== "break") setAnimState(anim, "cast", n);
          pushLightGlow(sc, actor.x, actor.y + 8, style.color, 95, n, 520);
        };

        if (evt.phase === "telegraph") {
          showBanner(label, 1200);
          steps.push(
            step(t, (sc, n) => {
              actorAt(sc, n);
              if (evt.resourceId) {
                const resource = findActor(sc, evt.resourceId, w, h);
                if (resource) {
                  pushBursts(sc, resource.x, resource.y, style, n, 420);
                  scene.effects.push({
                    type: "charge",
                    x: resource.x,
                    y: resource.y - 30,
                    color: style.color,
                    effect: style.burst,
                    scale: (style.scale ?? 1) * 0.7,
                    start: n,
                    duration: 520,
                  });
                }
              }
              if (evt.targetId) {
                pushPopup(sc, evt.targetId, "TARGET", COLORS.cursor, n, w, h, false);
              }
            })
          );
          t += evt.presentation === "detonateAlly" ? 320 : 560;
          break;
        }

        if (evt.phase === "resolve") {
          showBanner(label, evt.presentation === "detonateAlly" ? 900 : 1250);
          steps.push(step(t, actorAt));

          if (evt.presentation === "guardAlly" && evt.targetId) {
            steps.push(
              step(t + 80, (sc, n) => {
                const target = findActor(sc, evt.targetId!, w, h);
                if (!target) return;
                pushBursts(sc, target.x, target.y, style, n, 420);
                pushPopup(sc, evt.targetId!, "GUARDED", style.color, n, w, h, true);
              })
            );
            t += 360;
          } else if (evt.presentation === "packStrike" && evt.partnerId && evt.targetId) {
            const base = t;
            steps.push(
              step(base, (sc, n) => {
                const actor = findActor(sc, evt.actorId, w, h);
                const partner = findActor(sc, evt.partnerId!, w, h);
                const target = findActor(sc, evt.targetId!, w, h);
                if (!actor || !partner || !target) return;
                startMove(
                  getAnim(sc, actor.kind, evt.actorId, n),
                  target.x - actor.x - 58,
                  target.y - actor.y - 18,
                  420,
                  n,
                  sc.playbackRate
                );
                startMove(
                  getAnim(sc, partner.kind, evt.partnerId!, n),
                  target.x - partner.x - 92,
                  target.y - partner.y + 22,
                  420,
                  n,
                  sc.playbackRate
                );
                pushPopup(sc, evt.targetId!, "MARKED", COLORS.cursor, n, w, h, false);
              }),
              step(base + 300, (sc, n) => {
                const actor = findActor(sc, evt.actorId, w, h);
                const partner = findActor(sc, evt.partnerId!, w, h);
                if (actor) setAnimState(getAnim(sc, actor.kind, evt.actorId, n), "attack", n);
                if (partner) setAnimState(getAnim(sc, partner.kind, evt.partnerId!, n), "attack", n);
              }),
              step(base + 1050, (sc, n) => {
                const actor = findActor(sc, evt.actorId, w, h);
                const partner = findActor(sc, evt.partnerId!, w, h);
                if (actor) {
                  const anim = getAnim(sc, actor.kind, evt.actorId, n);
                  setAnimState(anim, "walk", n);
                  startMove(anim, 0, 0, 360, n, sc.playbackRate);
                }
                if (partner) {
                  const anim = getAnim(sc, partner.kind, evt.partnerId!, n);
                  setAnimState(anim, "walk", n);
                  startMove(anim, 0, 0, 360, n, sc.playbackRate);
                }
              }),
              step(base + 1410, (sc, n) => {
                const actor = findActor(sc, evt.actorId, w, h);
                const partner = findActor(sc, evt.partnerId!, w, h);
                if (actor) setAnimState(getAnim(sc, actor.kind, evt.actorId, n), "idle", n);
                if (partner) setAnimState(getAnim(sc, partner.kind, evt.partnerId!, n), "idle", n);
              })
            );
            t = base + 700;
          } else if (evt.presentation === "throwAlly" && evt.resourceId && evt.targetId) {
            // The resource is pulled into the caster first, then a shared
            // projectile arc carries the same exact committed body to the
            // target. The body remains in the scene until the consume event.
            steps.push(
              step(t, (sc, n) => {
                const actor = findActor(sc, evt.actorId, w, h);
                const resource = findActor(sc, evt.resourceId!, w, h);
                if (!actor || !resource) return;
                const resourceAnim = getAnim(sc, resource.kind, evt.resourceId!, n);
                startMove(
                  resourceAnim,
                  actor.x - resource.x,
                  actor.y - resource.y - 18,
                  220,
                  n,
                  sc.playbackRate
                );
              }),
              step(t + 180, (sc, n) => {
                const actor = findActor(sc, evt.actorId, w, h);
                const target = findActor(sc, evt.targetId!, w, h);
                if (!actor || !target || !style.projectile) return;
                pushProjectileVolley(
                  sc,
                  actor.x,
                  actor.y - 24,
                  target.x,
                  target.y,
                  style,
                  n,
                  340,
                  1
                );
              })
            );
            t += 520;
          } else if (evt.presentation === "detonateAlly") {
            // Spawn Bomb is immediate: the pulse is the command telegraph,
            // and the consume beat below owns the flash/removal.
            steps.push(
              step(t + 80, (sc, n) => {
                if (!evt.resourceId) return;
                const resource = findActor(sc, evt.resourceId, w, h);
                if (resource) pushBursts(sc, resource.x, resource.y, style, n, 360);
              })
            );
            t += 220;
          } else {
            // Bone Harvest and ordinary consumeAlly signatures use the same
            // resource grab beat; overload keeps its living battery in place
            // and shows a visible tether/charge instead.
            if (evt.presentation === "overload" && evt.resourceId) {
              steps.push(
                step(t, (sc, n) => {
                  const actor = findActor(sc, evt.actorId, w, h);
                  const resource = findActor(sc, evt.resourceId!, w, h);
                  if (!actor || !resource) return;
                  if (style.projectile) {
                    sc.effects.push({
                      type: "projectile",
                      fromX: actor.x,
                      fromY: actor.y - 20,
                      toX: resource.x,
                      toY: resource.y,
                      x: actor.x,
                      y: actor.y - 20,
                      color: style.color,
                      effect: style.projectile,
                      scale: style.scale ?? 1,
                      glow: true,
                      start: n,
                      duration: 520,
                    });
                  }
                  sc.effects.push({
                    type: "charge",
                    x: resource.x,
                    y: resource.y - 28,
                    color: style.color,
                    effect: style.burst,
                    scale: (style.scale ?? 1) * 0.8,
                    start: n + 120,
                    duration: 650,
                  });
                  pushPopup(sc, evt.resourceId!, "CHARGED", style.color, n, w, h, true);
                })
              );
              t += 620;
            } else {
              steps.push(
                step(t, (sc, n) => {
                  if (!evt.resourceId) return;
                  const actor = findActor(sc, evt.actorId, w, h);
                  const resource = findActor(sc, evt.resourceId, w, h);
                  if (!actor || !resource) return;
                  startMove(
                    getAnim(sc, resource.kind, evt.resourceId!, n),
                    actor.x - resource.x,
                    actor.y - resource.y - 18,
                    220,
                    n,
                    sc.playbackRate
                  );
                })
              );
              t += 300;
            }
          }
          break;
        }

        if (evt.phase === "consume") {
          // Keep the exact body visible through the grab/arc. This flash is
          // the consumption beat; the following defeated event then runs the
          // normal shared corpse/death choreography and reward bookkeeping.
          steps.push(
            step(t, (sc, n) => {
              if (evt.resourceId) {
                const resource = findActor(sc, evt.resourceId, w, h);
                if (resource) {
                  const anim = getAnim(sc, resource.kind, evt.resourceId!, n);
                  const off = animOffset(anim, n);
                  pushBursts(sc, resource.x + off.x, resource.y + off.y, style, n, 380);
                  anim.hitFlashIntensity = 0.8;
                }
              }
              if (evt.presentation === "detonateAlly") {
                pushFieldLayers(sc, w * 0.72, h, style, n, 650, 2.0);
                addScreenShake(sc, 5, n, 320);
              }
              if (evt.presentation === "overload") {
                pushFieldLayers(sc, w * 0.56, h, style, n, 760, 2.2);
                addScreenShake(sc, 6, n, 360);
              }
              if (evt.chemistryId === "chem-bone-harvest") {
                const actor = findActor(sc, evt.actorId, w, h);
                if (actor) {
                  pushBursts(sc, actor.x, actor.y, style, n, 520);
                  pushPopup(sc, evt.actorId, "UP", COLORS.heal, n, w, h, true);
                }
              }
            })
          );
          t += 90;
          break;
        }

        if (evt.phase === "break") {
          showBanner("COMBO BREAK", 950);
          steps.push(
            step(t, (sc, n) => {
              const actor = findActor(sc, evt.actorId, w, h);
              if (actor) {
                pushPopup(sc, evt.actorId, "BREAK", COLORS.miss, n, w, h, true);
                sc.effects.push({
                  type: "burst",
                  x: actor.x,
                  y: actor.y,
                  color: COLORS.miss,
                  effect: "px_black_white_sparks",
                  scale: 4.5,
                  start: n,
                  duration: 420,
                });
              }
              if (evt.targetId) {
                pushPopup(sc, evt.targetId, "SAFE", COLORS.heal, n, w, h, false);
              }
            })
          );
          t += 500;
          break;
        }

        if (evt.phase === "intercept") {
          showBanner("INTERCEPT", 720);
          steps.push(
            step(t, (sc, n) => {
              const guarder = evt.partnerId
                ? findActor(sc, evt.partnerId, w, h)
                : undefined;
              if (guarder) {
                pushBursts(sc, guarder.x, guarder.y, style, n, 420);
                pushPopup(sc, evt.partnerId!, "SHIELD", style.color, n, w, h, true);
              }
              if (evt.targetId) {
                pushPopup(sc, evt.targetId, "INTERCEPT", COLORS.cursor, n, w, h, false);
              }
            })
          );
          t += 420;
          break;
        }

        // Keep a safe fallback so a future chemistry phase cannot silently
        // vanish from the shared timeline.
        showBanner(label, 700);
        t += 300;
        break;
      }

      case "cast": {
        if (evt.cardPresentation === "rat") {
          showBanner(spellNameFor(evt.spellId), 720);
          castAnim(evt.actorId);
          steps.push(
            step(t + CAST_IMPACT, (sc, n) => {
              const actor = findActor(sc, evt.actorId, w, h);
              if (!actor) return;
              const style: EffectStyle = {
                color: "#b67a52",
                burst: "retro2_crescent_slash",
                burstScale: 1.1,
                scale: 1.1,
              };
              pushBursts(sc, actor.x, actor.y + 10, style, n, 360);
              pushPopup(sc, evt.actorId, "RAT", "#d8c4a0", n, w, h, false);
            })
          );
          t += 420;
          break;
        }
        // Chemistry owns its banner, actor motion, and bespoke effects through
        // the dedicated event above. Ordinary cast events are retained only
        // as the exact per-target damage/heal payload, so they still produce
        // one shared impact popup without reintroducing banner spam.
        if (evt.presentation && evt.presentation !== "meleeGangUp") {
          const isHeal = evt.heal !== undefined;
          const style = isHeal
            ? { color: COLORS.heal, burst: "priest_heal", burstScale: 1.2, scale: 1.2 }
            : CHEMISTRY_STYLES[evt.presentation] ?? CHEMISTRY_STYLES.consumeAlly!;
          if (evt.targetId && (evt.damage !== undefined || evt.heal !== undefined)) {
            const impactAt = t;
            steps.push(
              step(impactAt, (sc, n) => {
                const target = findActor(sc, evt.targetId!, w, h);
                if (!target) return;
                pushBursts(sc, target.x, target.y, style, n, 460);
                if (!isHeal) addScreenShake(sc, 3.5, n, 220);
              }),
              ...impactSteps(
                impactAt,
                evt.targetId,
                `${isHeal ? evt.heal : evt.damage}`,
                isHeal ? COLORS.heal : COLORS.dmg,
                w,
                h,
                !isHeal,
                false,
                undefined,
                undefined,
                evt.damage,
                undefined,
                undefined,
                {
                  actorId: evt.actorId,
                  spellId: evt.spellId,
                  allowHitStop: !isHeal,
                  effectColor: style.color,
                }
              )
            );
            t += 120;
          }
          break;
        }
        if (evt.presentation && evt.presentation !== "meleeGangUp") {
          warnAsset(`unknown cast presentation: ${evt.presentation}`);
        }
        if (evt.presentation === "meleeGangUp" && evt.targetId) {
          showBanner(spellNameFor(evt.spellId), 1400);
          steps.push(
            ...pushMeleeGangUpSteps(t, evt.actorId, evt.targetId, evt.damage ?? 0, evt.spellId, w, h)
          );
          t += GANG_UP_DURATION_MS;
          break;
        }
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
        lastActionTiming = {
          anticipation: t,
          release: t + (riseDash ? 40 : 100),
          contact: pendingImpactBase ?? t,
          reaction: pendingImpactBase ?? t,
          settle: t + castHold,
        };

        // Charge sprite gathers above the caster during the cast.
        if (style.charge) {
          steps.push(
            step(t, (sc, n) => {
              const actor = findActor(sc, evt.actorId, w, h);
              if (!actor) return;
              const defaultDur = (pendingImpactBase ?? CAST_IMPACT) - t + 80;
              sc.effects.push({
                type: "charge",
                x: actor.x, y: actor.y,
                color: style.color,
                effect: style.charge,
                scale: varyScale(style.chargeScale ?? style.scale ?? 0.8, 0.08, n * 0.01 + evtIndex),
                start: n,
                duration: style.chargeDurationMs ?? defaultDur,
              });
            })
          );
        }

        // Magic caster aura: a soft elemental-colored floor glow under the
        // caster that persists through the cast, making the charge phase read
        // as "gathering magic" even without the charge sprite. This is the
        // primary visual differentiator for the Magic verb — Attack and
        // Technique never light the floor under the attacker this way.
        steps.push(
          step(t, (sc, n) => {
            const actor = findActor(sc, evt.actorId, w, h);
            if (!actor) return;
            pushLightGlow(sc, actor.x, actor.y + 10, style.color, 100, n, castHold);
          })
        );

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

        // Pre-impact illumination prelude: arm the environment light before
        // the impact step fires so the prelude darkening (e.g. fire) is
        // visible to the renderer in the frames leading up to impact.
        const castIllumination = resolveIllumination(
          castSpell?.effect.kind === "damage" ? (castSpell.effect as { element?: string }).element : undefined,
          style.illumination
        );
        if (castIllumination && (castIllumination.preludeMs ?? 0) > 0) {
          const preludeMs = castIllumination.preludeMs!;
          const preludeTime = pendingImpactBase! - preludeMs;
          const illum = castIllumination;
          steps.push(
            step(preludeTime, (sc, n) => {
              const target = evt.targetId ? findActor(sc, evt.targetId, w, h) : null;
              const candidate: EnvironmentLightImpulse = {
                kind: illum.kind,
                start: n,
                impactAt: n + preludeMs,
                duration: illum.durationMs,
                color: illum.color,
                backdropDim: illum.backdropDim ?? 0.3,
                floorStrength: 0, // floor/rim/flash activate at impact
                rimStrength: 0,
                screenFlashStrength: 0,
                sourceX: target?.x ?? w * 0.5,
                sourceY: target?.y ?? h * 0.5,
              };
              if (shouldReplaceEnvironmentLight(sc.impact.environment, candidate, n)) {
                sc.impact.environment = candidate;
              }
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
            ...impactSteps(pendingImpactBase!, evt.targetId, text, isHeal ? COLORS.heal : COLORS.dmg, w, h, !isHeal, false, undefined, undefined, evt.damage, undefined, undefined, {
              actorId: evt.actorId,
              spellId: evt.spellId,
              spellTier: spellById(evt.spellId)?.tier,
              isArea: castIsArea,
              isFirstHit: hitSequence.get(evtIndex)?.isFirst,
              isFinalHit: hitSequence.get(evtIndex)?.isFinal,
              allowHitStop: !isHeal,
              illumination: !isHeal ? resolveIllumination(
                spellById(evt.spellId)?.effect.kind === "damage" ? (spellById(evt.spellId)!.effect as { element?: string }).element : undefined,
                style.illumination
              ) : undefined,
              effectColor: style.color,
            })
          );
          pendingImpactCount++;
        }
        t += castHold;
        break;
      }

      case "spellEffect": {
        if (evt.cardPresentation === "opened" || evt.cardPresentation === "consume-opened") {
          const consume = evt.cardPresentation === "consume-opened";
          const style: EffectStyle = consume
            ? {
                color: COLORS.crit,
                burst: "retro_starburst",
                burstUnderlay: "retro2_crescent_slash",
                burstUnderlayScale: 0.8,
                burstScale: 1.1,
                scale: 1.1,
              }
            : {
                color: "#e8a84a",
                burst: "retro2_crescent_slash",
                burstScale: 1.0,
                scale: 1.0,
              };
          showBanner(consume ? "EXPLOIT" : "OPENED", consume ? 720 : 650);
          steps.push(
            step(t, (sc, n) => {
              const target = findActor(sc, evt.targetId ?? "", w, h);
              if (evt.cardPresentationSourceId) {
                pushPopup(sc, evt.cardPresentationSourceId, "CLOSED", COLORS.miss, n, w, h, false);
              }
              if (!target) return;
              pushBursts(sc, target.x, target.y, style, n, consume ? 420 : 360);
              pushPopup(sc, evt.targetId!, consume ? "EXPLOIT" : "OPENED", style.color, n, w, h, true);
              if (consume) addScreenShake(sc, 3, n, 220);
            })
          );
          t += consume ? 180 : 240;
          break;
        }
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
              pushFieldLayers(sc, fieldX, h, style, n, fieldDuration, fieldBase);
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
              pushFieldLayers(sc, fieldX, h, style, n, fieldDuration, fieldBase);
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
              // Support verb: healing and buff effects get an upward aura
              // ring and rising motes — no damage-style screen shake. This
              // is the primary visual differentiator for the Support verb:
              // the motion is upward and gentle, not a punch.
              if (isHeal) {
                // Expanding warm aura ring at the target's feet.
                pushLightGlow(sc, target.x, target.y + 8, style.color, 120, n, 600);
                // Rising sparkle motes — more than the damage path, warm-toned.
                spawnSparkleParticles(sc, target.x, target.y - 20, style.color, 16);
              }
            }
          })
        );
        if (text) {
          const spell = spellById(evt.spellId);
          const spellTier = spell?.tier;
          const illum = resolveIllumination(
            spell?.effect.kind === "damage" ? (spell.effect as { element?: string }).element : undefined,
            style.illumination
          );
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
              evt.damage,
              undefined,
              undefined,
              {
                spellId: evt.spellId,
                spellTier,
                isArea: !!isArea,
                isFirstHit: hitSequence.get(evtIndex)?.isFirst,
                isFinalHit: hitSequence.get(evtIndex)?.isFinal,
                allowHitStop: evt.damage !== undefined,
                illumination: evt.damage !== undefined ? illum : undefined,
                effectColor: style.color,
              }
            )
          );
        }
        t = Math.max(t, impactAt + 300);
        break;
      }

      case "defeated": {
        const targetId = evt.targetId;
        lastActionTiming = {
          anticipation: t,
          release: t,
          contact: t,
          reaction: t,
          settle: t,
        };
        // A death bark for this actor (if picked) is always the very next
        // event — combat-eor.ts emits it immediately after "defeated".
        const barkEvt = events[evtIndex + 1];
        const hasDeathBark =
          !!barkEvt &&
          barkEvt.type === "bark" &&
          barkEvt.trigger === "death" &&
          barkEvt.actorId === targetId;
        const deathBarkDuration =
          hasDeathBark && barkEvt.type === "bark"
            ? barkDurationMs(barkEvt.text, barkEvt.source ?? "legacy")
            : 0;
        steps.push(
          step(t, (sc, n) => {
            const actor = findActor(sc, targetId, w, h);
            const kind: SceneCursor["kind"] = actor?.kind ?? (evt.wasEnemy ? "enemy" : "party");
            const a = getAnim(sc, kind, targetId, n);
            setAnimState(a, "death", n);
            // Undead death sibling burst (presentation routing via special).
            if (evt.wasEnemy) {
              const enemy =
                sc.state.enemies.front.find((e) => e.instanceId === targetId) ??
                sc.state.enemies.back.find((e) => e.instanceId === targetId) ??
                sc.state.justDied.find((e) => e.instanceId === targetId);
              if (enemy && enemyIsUndead(enemy.id) && actor) {
                sc.effects.push({
                  type: "burst",
                  x: actor.x,
                  y: actor.y,
                  color: "#c080ff",
                  effect: "zombie_death_explosion",
                  scale: 1.35,
                  start: n,
                  duration: 500,
                });
              }
            }
            // Enemies and summoned allies fade out after the death plays;
            // KO'd party members hold the death pose. A death bark on this
            // actor holds the fade so the corpse (and its live anchor) stay
            // available until the line has had time to read (spec 2026-07-26).
            if (kind !== "party") {
              a.fadeOutStart = n + 450 + deathBarkDuration;
            }
          })
        );
        // Consecutive "defeated" events (e.g. an AoE wiping several enemies
        // at once) should all play their death animations together instead
        // of staggering — only advance the clock after the last one in the
        // run so they share the same start time. A death bark for this actor
        // sits between this "defeated" and the next one in the array; skip
        // over it when checking whether the run continues, or a bark on the
        // first of several simultaneous deaths would stagger the rest.
        let peek = evtIndex + 1;
        while (events[peek]?.type === "bark") peek++;
        const nextEvt = events[peek];
        if (!nextEvt || nextEvt.type !== "defeated") {
          t += evt.wasEnemy ? DEATH_FADE_MS : 450;
        }
        break;
      }

      case "partyRowMove": {
        const pending = pendingPartyMoves.get(evt.actorId);
        if (!pending || pending.rowEnteredAt !== evt.rowEnteredAt) break;
        const moveStart = t;
        steps.push(
          step(moveStart, (sc, n) => {
            const anim = getAnim(sc, "party", evt.actorId, n);
            setAnimState(anim, "walk", n);
            startMove(
              anim,
              0,
              0,
              PARTY_ROW_MOVE_MS,
              n,
              sc.playbackRate
            );
          }),
          step(moveStart + PARTY_ROW_MOVE_MS, (sc, n) => {
            const anim = getAnim(sc, "party", evt.actorId, n);
            // Exact resting convention: the new authoritative anchor is now
            // the base, so neutral presentation offset is zero.
            anim.moveFromX = 0;
            anim.moveFromY = 0;
            anim.moveToX = 0;
            anim.moveToY = 0;
            anim.moveStart = n;
            anim.moveDuration = 0;
            if (anim.state === "walk") setAnimState(anim, "idle", n);
            const transition = sc.partyFormationTransitions.get(evt.actorId);
            if (transition?.rowEnteredAt === evt.rowEnteredAt) {
              sc.partyFormationTransitions.delete(evt.actorId);
            }
          })
        );
        lastActionTiming = {
          anticipation: moveStart,
          release: moveStart,
          contact: moveStart + PARTY_ROW_MOVE_MS,
          reaction: moveStart + PARTY_ROW_MOVE_MS,
          settle: moveStart + PARTY_ROW_MOVE_MS,
        };
        t += PARTY_ROW_MOVE_MS;
        break;
      }

      case "rowAdvance": {
        // Back-row survivors slide into front-row stands after the front is
        // wiped (combat-eor promoteEnemyBackRow). Clear the cached back-row
        // slot index so assignSlot picks a free front index, then tween the
        // draw offset from the old screen position down to the new stand.
        const advanceId = evt.targetId;
        const ROW_ADVANCE_MS = 280;
        steps.push(
          step(t, (sc, n) => {
            const enemy =
              sc.state.enemies.front.find((e) => e.instanceId === advanceId) ??
              sc.state.enemies.back.find((e) => e.instanceId === advanceId);
            if (!enemy) return;
            const oldSlot = sc.enemySlots.get(advanceId);
            const size = enemy.isBoss ? BOSS_SIZE : ENEMY_SIZE;
            const oldPos =
              oldSlot !== undefined
                ? enemyPos(oldSlot, "back", w, h, sc.backdropId, size)
                : null;
            sc.enemySlots.delete(advanceId);
            const newSlot = enemySlotIndex(sc, "front", advanceId);
            const newPos = enemyPos(newSlot, "front", w, h, sc.backdropId, size);
            if (!oldPos) return;
            const a = getAnim(sc, "enemy", advanceId, n);
            // Base draw pos has jumped to newPos; seed offset so the sprite
            // still appears at oldPos, then ease back to zero.
            const dx = oldPos.x - newPos.x;
            const dy = oldPos.y - newPos.y;
            a.moveFromX = dx;
            a.moveFromY = dy;
            a.moveToX = dx;
            a.moveToY = dy;
            a.moveDuration = 0;
            a.moveStart = n;
            startMove(a, 0, 0, ROW_ADVANCE_MS, n, sc.playbackRate);
            setAnimState(a, "walk", n);
          })
        );
        steps.push(
          step(t + ROW_ADVANCE_MS, (sc, n) => {
            const a = sc.enemyAnims.get(advanceId);
            if (!a) return;
            clearAttackIfPlaying(a, n);
            if (a.state === "walk") setAnimState(a, "idle", n);
          })
        );
        // Batch consecutive advances so a whole back row slides together.
        let peekAdv = evtIndex + 1;
        while (events[peekAdv]?.type === "bark") peekAdv++;
        const nextAdv = events[peekAdv];
        if (!nextAdv || nextAdv.type !== "rowAdvance") {
          t += ROW_ADVANCE_MS + 80;
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
          step(t, (sc, n) => {
            const actor = findActor(sc, evt.actorId, w, h);
            if (actor) {
              const style: EffectStyle = {
                color: COLORS.sp,
                burst: "px_shield",
                burstScale: 1.35,
                scale: 1.1,
                glow: true,
              };
              pushBursts(sc, actor.x, actor.y, style, n, 420);
              pushLightGlow(sc, actor.x, actor.y + 10, style.color, 80, n, 360);
            }
            pushPopup(
              sc,
              evt.actorId,
              evt.amount ? `+${evt.amount} GUARD` : "GUARD",
              COLORS.sp,
              n,
              w,
              h,
              true
            );
          })
        );
        t += 350;
        break;
      }

      case "statusTick": {
        const tickColor = evt.status === "burn" ? "#ff9a50" : COLORS.poison;
        const tickStyle = STATUS_STYLES[evt.status] ?? {
          color: tickColor,
          burst: "dispel_sparks",
        };
        steps.push(
          step(t, (sc, n) => {
            const target = findActor(sc, evt.targetId, w, h);
            if (target) pushBursts(sc, target.x, target.y, tickStyle, n);
          }),
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
          step(t, (sc, n) => {
            pushPopup(sc, evt.targetId, "SILENCED", COLORS.poison, n, w, h);
            const target = findActor(sc, evt.targetId, w, h);
            if (target) {
              sc.effects.push({
                type: "burst",
                x: target.x,
                y: target.y,
                color: "#7fe0e0",
                effect: "px_black_white_sparks",
                scale: 5.5,
                start: n,
                duration: 400,
              });
            }
          })
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
        steps.push(
          step(t, (sc, n) => {
            const target = findActor(sc, evt.targetId, w, h);
            if (!target) return;
            sc.effects.push({
              type: "burst",
              x: target.x,
              y: target.y,
              color: "#d0e8ff",
              effect: "px_black_white_sparks",
              scale: 5.0,
              start: n,
              duration: 420,
            });
          })
        );
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
          step(t, (sc, n) => {
            pushPopup(sc, evt.actorId, "FIZZLE", COLORS.miss, n, w, h);
            const actor = findActor(sc, evt.actorId, w, h);
            if (actor) {
              sc.effects.push({
                type: "burst",
                x: actor.x,
                y: actor.y,
                color: "#c8c4b8",
                effect: "px_black_white_sparks",
                scale: 4.5,
                start: n,
                duration: 360,
              });
            }
          })
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

      case "bark": {
        const barkEvt = evt;
        const source = barkEvt.source ?? "legacy";
        const delay = source === "legacy" && evt.trigger === "heavyHit" ? 180 : 0;
        const landmarkAt = barkEvt.landmark ? lastActionTiming?.[barkEvt.landmark] : undefined;
        const startAt = landmarkAt ?? t + delay;
        const durationMs = barkEvt.durationMs ?? barkDurationMs(barkEvt.text, source);
        steps.push(
          step(startAt, (sc, n) => {
            pushBark(
              sc,
              {
                actorId: barkEvt.actorId,
                trigger: barkEvt.trigger,
                text: barkEvt.text,
                source,
                speaker: barkEvt.speaker,
                landmark: barkEvt.landmark,
                durationMs,
                priority: policyBarkPriority(barkEvt.trigger, source),
              },
              n
            );
          })
        );
        if (barkEvt.trigger === "death") {
          // Reserve time up to roughly where the bark's own fade begins
          // (t≈0.8 of its duration) so a killing-blow line reads even when
          // it's the last event of the turn.
          lastDeathBarkVisibleUntil = Math.max(
            lastDeathBarkVisibleUntil,
            startAt + Math.round(durationMs * 0.8)
          );
        }
        break;
      }
    }
  }

  returnHome();

  // Give trailing impact effects a short settle beat. Ordinary attacks must
  // not spend a quarter-second idling after the attacker has already returned;
  // bespoke Chemistry steps may schedule after the logical cursor, while a
  // death bark can push the ledger farther still.
  const lastVisualStepAt = steps.reduce((maxAt, choreoStep) => Math.max(maxAt, choreoStep.at), 0);
  const duration = Math.max(t + 100, lastVisualStepAt + 260, lastDeathBarkVisibleUntil);
  scene.choreo = { start: now, duration, steps };
  return duration;
}

/** True when the current choreography (if any) has fully played out. */
export function isPlaybackDone(scene: CombatScene, now: number): boolean {
  // During a hit-stop freeze, playback is not done — the scene is held.
  if (scene.impact.freezeUntilWallTime > now) return false;
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
  scene.barks = [];
  scene.barkWindow = [];
  resetImpactState(scene.impact);
}

/**
 * Sync scene bookkeeping after a turn's state swap: move enemies/allies that
 * died this turn into the corpse lists so their death animations can play
 * even though they're gone from the living arrays.
 */
export function absorbDeaths(scene: CombatScene, state: CombatState): void {
  setCombatSceneState(scene, state);
  for (const e of state.justDied) {
    if (!scene.enemyCorpses.some((c) => c.instanceId === e.instanceId)) {
      // Push first so same-turn multi-kills see each other as occupants
      // when claiming a never-assigned slot (turn-1 riposte etc.).
      scene.enemyCorpses.push(e);
      if (!scene.enemySlots.has(e.instanceId)) {
        enemySlotIndex(scene, e.row, e.instanceId);
      }
    }
  }
  for (const a of state.justDiedAllies) {
    if (!scene.allyCorpses.some((c) => c.id === a.id)) {
      scene.allyCorpses.push(a);
      if (!scene.allySlots.has(a.id)) {
        allySlotIndex(scene, a.id);
      }
    }
  }
}

// --- Per-frame update ---------------------------------------------------------------

export function updateScene(scene: CombatScene, now: number): void {
  // --- Hit-stop: freeze all presentation clocks ---
  // When freezeUntilWallTime > now, the scene is frozen. We shift every
  // presentation timestamp forward by the real-time delta so nothing
  // visually advances.  freezeUntilWallTime itself is NOT shifted (real time).
  // Particles are not advanced.  lastUpdate is set to `now` to prevent a
  // large particle jump after unfreezing.
  if (scene.impact.freezeUntilWallTime > now) {
    const prevLast = scene.lastUpdate;
    if (prevLast !== undefined && prevLast < now) {
      shiftPresentationClocks(scene, now - prevLast);
    }
    scene.lastUpdate = now;
    return;
  }

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
      const choreoEndTime = scene.choreo.start + scene.choreo.duration;
      scene.choreo = null;
      // Preserve a legitimate final-hit hit-stop armed *before* the choreography
      // ended (frame-by-frame playback).  But if the freeze was armed by a step
      // that fired in this final batch (large time jump firing all remaining
      // steps at once), clear it — it's an artifact, not a real hold.
      if (scene.impact.lastFreezeWallTime >= choreoEndTime) {
        scene.impact.freezeUntilWallTime = 0;
      }
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
  scene.barks = scene.barks.filter((b) => now - b.start < b.durationMs);
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
  if (scene.introNameplate && now >= scene.introNameplateUntil) {
    scene.introNameplate = null;
    scene.introBossId = null;
  }
}

// --- Pure helpers shared with painters -------------------------------------------

/** Number of HP pips drawn under a damaged living enemy. */
export const HP_PIP_COUNT = 4;

/**
 * Lit pip count for an enemy HP readout, or null when pips should be hidden
 * (full HP or dead). Shared by canvas and Phaser painters.
 */
export function enemyHpPipsLit(enemy: { currentHp: number; hp: number }): number | null {
  if (enemy.currentHp >= enemy.hp || enemy.currentHp <= 0) return null;
  return Math.max(1, Math.ceil((enemy.currentHp / enemy.hp) * HP_PIP_COUNT));
}

/** Map an actor sprite state onto the enemy strip keys (no walk/cast strips). */
export function enemyStripState(state: ActorSpriteState): "idle" | "attacking" | "hit" | "defeated" {
  switch (state) {
    case "attack":
    case "attack_ranged":
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

/** Compute the current frame index for an effect sprite strip. */
export function effectFrame(sprite: EffectSprite, start: number, now: number, type: SceneEffect["type"]): number {
  const strip = sprite.strip;
  if (strip.frameCount <= 1 || strip.fps <= 0) return 0;
  const elapsed = Math.max(0, now - start);
  const idx = Math.floor((elapsed / 1000) * strip.fps * EFFECT_ANIM_SPEED);
  const shouldLoop = type === "projectile" || type === "charge" || strip.loop === true;
  return shouldLoop ? idx % strip.frameCount : Math.min(strip.frameCount - 1, idx);
}

/** Per-boss nameplate / silhouette accents (display differentiation only). */
export const BOSS_PRESENTATION: Record<
  string,
  { tag: string; accent: string; glow: string; subtitle: string }
> = {
  "headmasters-echo": {
    tag: "THE DEAD BOY",
    accent: "#e07040",
    glow: "rgba(220, 90, 30, 0.45)",
    subtitle: "Forge of Ashes",
  },
  "headmasters-echo-remnant": {
    tag: "THE LONELY GIRL",
    accent: "#a878d0",
    glow: "rgba(140, 80, 200, 0.4)",
    subtitle: "Cursed Library",
  },
  "headmasters-echo-ascendant": {
    tag: "THE CRYING MAN",
    accent: "#70b0d8",
    glow: "rgba(80, 140, 200, 0.42)",
    subtitle: "Drowned Sanctum",
  },
};

/**
 * Arm the boss intro nameplate. Call once when a boss fight opens — separate
 * from the spell banner so resolveAndPlay's banner clear can't wipe it.
 */
export function setBossIntroNameplate(
  scene: CombatScene,
  name: string,
  now: number,
  durationMs = 2800,
  bossId?: string
): void {
  scene.introNameplate = name;
  scene.introNameplateStart = now;
  scene.introNameplateUntil = now + durationMs;
  scene.introBossId = bossId ?? null;
}
