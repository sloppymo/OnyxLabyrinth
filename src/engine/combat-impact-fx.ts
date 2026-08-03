/**
 * Shared combat impact presentation model (DOM-free, Phaser-free).
 *
 * This module owns the *decisions* for hit-stop, impact zoom, elemental
 * environment lighting, and actor white-flash — all derived from existing
 * combat data (damage, target HP, crit flag, spell tier, EffectStyle).
 *
 * `combat-choreography.ts` calls `triggerImpactPresentation()` to populate
 * `CombatImpactState` on the scene.  Both renderers (canvas `combat-scene.ts`
 * and Phaser `combat-phaser-stage.ts`) read that state every frame and paint
 * it identically.
 *
 * No combat rules, damage, AI, or events are changed here.
 */

// ---------------------------------------------------------------------------
// Feature switches
// ---------------------------------------------------------------------------

export const COMBAT_HIT_STOP_ENABLED = true;
export const COMBAT_IMPACT_ZOOM_ENABLED = true;
export const COMBAT_ENV_LIGHTING_ENABLED = true;
export const COMBAT_ACTOR_FLASH_ENABLED = true;

// ---------------------------------------------------------------------------
// Impulse shapes
// ---------------------------------------------------------------------------

export type EnvironmentLightKind =
  | "fire"
  | "cold"
  | "holy"
  | "lightning"
  | "water"
  | "earth"
  | "wind"
  | "poison"
  | "dark"
  | "physical";

export interface CameraZoomImpulse {
  start: number;
  duration: number;
  peakScale: number;
  focusX: number;
  focusY: number;
}

export interface EnvironmentLightImpulse {
  kind: EnvironmentLightKind;
  start: number;
  impactAt: number;
  duration: number;
  color: string;
  backdropDim: number;
  floorStrength: number;
  rimStrength: number;
  screenFlashStrength: number;
  sourceX: number;
  sourceY: number;
}

export interface ActorFlashImpulse {
  start: number;
  duration: number;
  color: string;
  strength: number;
  mode: "white" | "elemental";
}

export interface CombatImpactState {
  /** Wall-time until which the scene is frozen.  Uses real time (never shifted). */
  freezeUntilWallTime: number;
  /** Last wall time a freeze was started (for dedup / diagnostics). */
  lastFreezeWallTime: number;
  /** Accumulated freeze ms this turn (for cap enforcement). */
  accumulatedFreezeThisTurn: number;
  /** Number of full stops triggered this turn (AOE throttle). */
  fullStopsThisTurn: number;
  zoom: CameraZoomImpulse | null;
  environment: EnvironmentLightImpulse | null;
  actorFlashes: Map<string, ActorFlashImpulse>;
}

export function createImpactState(): CombatImpactState {
  return {
    freezeUntilWallTime: 0,
    lastFreezeWallTime: 0,
    accumulatedFreezeThisTurn: 0,
    fullStopsThisTurn: 0,
    zoom: null,
    environment: null,
    actorFlashes: new Map(),
  };
}

/** Reset all impact state — called at skip / turn boundary. */
export function resetImpactState(impact: CombatImpactState): void {
  impact.freezeUntilWallTime = 0;
  impact.lastFreezeWallTime = 0;
  impact.accumulatedFreezeThisTurn = 0;
  impact.fullStopsThisTurn = 0;
  impact.zoom = null;
  impact.environment = null;
  impact.actorFlashes.clear();
}

// ---------------------------------------------------------------------------
// Illumination declaration (extends EffectStyle)
// ---------------------------------------------------------------------------

export interface IlluminationProfile {
  kind: EnvironmentLightKind;
  color: string;
  preludeMs?: number;
  durationMs: number;
  backdropDim?: number;
  floorStrength?: number;
  rimStrength?: number;
  screenFlashStrength?: number;
}

// ---------------------------------------------------------------------------
// Impact strength classification
// ---------------------------------------------------------------------------

export type ImpactStrength = "light" | "strong" | "heavy" | "massive";

export interface ImpactClassificationInput {
  /** Damage dealt (0 for heals / misses). */
  damage: number;
  /** Target's maximum HP (for ratio). */
  targetMaxHp: number;
  /** Was it a critical hit? */
  crit?: boolean;
  /** Spell tier (1–7), or undefined for physical / unknown. */
  spellTier?: number;
  /** Is this a major boss signature ability? */
  isBossSignature?: boolean;
}

export function classifyImpact(input: ImpactClassificationInput): ImpactStrength {
  const ratio = input.targetMaxHp > 0 ? input.damage / input.targetMaxHp : 1;

  // Tier / boss promotion first (massive floor).
  if (input.spellTier !== undefined && input.spellTier >= 6) {
    return "massive";
  }
  if (input.isBossSignature) {
    return "massive";
  }

  let strength: ImpactStrength;
  if (ratio < 0.12) strength = "light";
  else if (ratio < 0.25) strength = "strong";
  else if (ratio < 0.4) strength = "heavy";
  else strength = "massive";

  // Critical promotes at least one category.
  if (input.crit && strength === "light") strength = "strong";
  else if (input.crit && strength === "strong") strength = "heavy";
  else if (input.crit && strength === "heavy") strength = "massive";

  return strength;
}

// ---------------------------------------------------------------------------
// Hit-stop duration
// ---------------------------------------------------------------------------

/** Maximum cumulative hit-stop during one resolved turn (ms). */
export const MAX_CUMULATIVE_HIT_STOP = 110;

/** Base hit-stop per strength category (ms, before FAST / reduced-motion). */
const BASE_HIT_STOP: Record<ImpactStrength, number> = {
  light: 0,
  strong: 40,
  heavy: 60,
  massive: 78,
};

export function baseHitStopMs(strength: ImpactStrength): number {
  return BASE_HIT_STOP[strength];
}

/**
 * Effective hit-stop after FAST scaling and reduced-motion adjustment.
 * Returns 0 for light impacts or when disabled.
 */
export function effectiveHitStopMs(
  strength: ImpactStrength,
  playbackRate: number,
  reducedMotion: boolean
): number {
  if (!COMBAT_HIT_STOP_ENABLED) return 0;
  const base = baseHitStopMs(strength);
  if (base <= 0) return 0;
  if (reducedMotion || reducedMotionActive) return 0;
  const rate = Math.max(1, playbackRate || 1);
  return Math.max(20, Math.round(base / rate));
}

/**
 * Returns the actual freeze duration to apply, respecting the cumulative cap.
 * If the cap is already reached, returns 0.
 */
export function cappedHitStopMs(
  desired: number,
  accumulatedSoFar: number
): number {
  if (desired <= 0) return 0;
  const remaining = MAX_CUMULATIVE_HIT_STOP - accumulatedSoFar;
  if (remaining <= 0) return 0;
  return Math.min(desired, remaining);
}

// ---------------------------------------------------------------------------
// Zoom magnitude and decay
// ---------------------------------------------------------------------------

export const MAX_ZOOM_SCALE = 1.06;

const BASE_ZOOM: Record<ImpactStrength, number> = {
  light: 1.0,
  strong: 1.03,
  heavy: 1.045,
  massive: 1.06,
};

export function peakZoomScale(strength: ImpactStrength): number {
  if (!COMBAT_IMPACT_ZOOM_ENABLED) return 1.0;
  return BASE_ZOOM[strength];
}

/** Zoom duration: how long the camera holds near peak before returning to 1.0. */
const ZOOM_DURATION: Record<ImpactStrength, number> = {
  light: 0,
  strong: 220,
  heavy: 280,
  massive: 340,
};

export function zoomDurationMs(strength: ImpactStrength): number {
  return ZOOM_DURATION[strength];
}

/**
 * Sample the zoom scale at time `now`.
 *
 * Envelope: quick ramp to peak (first 18%), hold, then ease-out back to 1.0.
 * Returns exactly 1.0 after the impulse expires.
 */
export function sampleZoom(
  impulse: CameraZoomImpulse | null,
  now: number
): { scale: number; focusX: number; focusY: number } {
  if (!impulse || !COMBAT_IMPACT_ZOOM_ENABLED) {
    return { scale: 1, focusX: 0, focusY: 0 };
  }
  const elapsed = now - impulse.start;
  if (elapsed < 0) return { scale: 1, focusX: impulse.focusX, focusY: impulse.focusY };
  if (elapsed >= impulse.duration) {
    return { scale: 1, focusX: impulse.focusX, focusY: impulse.focusY };
  }
  const t = elapsed / impulse.duration;
  const peak = impulse.peakScale;
  // Ramp up (first 18%), hold (18–45%), ease out (45–100%).
  let scale: number;
  if (t < 0.18) {
    const u = t / 0.18;
    scale = 1 + (peak - 1) * (1 - Math.pow(1 - u, 2.5));
  } else if (t < 0.45) {
    scale = peak;
  } else {
    const u = (t - 0.45) / 0.55;
    scale = peak - (peak - 1) * (1 - Math.pow(1 - u, 3));
  }
  // Clamp to [1, MAX_ZOOM_SCALE].
  scale = Math.min(MAX_ZOOM_SCALE, Math.max(1, scale));
  return { scale, focusX: impulse.focusX, focusY: impulse.focusY };
}

// ---------------------------------------------------------------------------
// Environment light envelope
// ---------------------------------------------------------------------------

/**
 * Sample the environment light strength at time `now`.
 *
 * Phases:
 *  - Prelude (start → impactAt): backdrop dim ramps in, no screen flash yet.
 *  - Impact (impactAt): peak flash + floor / rim.
 *  - Decay (impactAt → end): all channels ease out.
 *
 * Returns null when the impulse is fully expired.
 */
export function sampleEnvironmentLight(
  impulse: EnvironmentLightImpulse | null,
  now: number
): {
  active: boolean;
  backdropDim: number;
  floorStrength: number;
  rimStrength: number;
  screenFlashStrength: number;
} {
  if (!impulse || !COMBAT_ENV_LIGHTING_ENABLED) {
    return { active: false, backdropDim: 0, floorStrength: 0, rimStrength: 0, screenFlashStrength: 0 };
  }
  const elapsed = now - impulse.start;
  if (elapsed < 0) {
    return { active: false, backdropDim: 0, floorStrength: 0, rimStrength: 0, screenFlashStrength: 0 };
  }
  const end = impulse.impactAt + impulse.duration;
  if (now >= end) {
    return { active: false, backdropDim: 0, floorStrength: 0, rimStrength: 0, screenFlashStrength: 0 };
  }

  const prelude = impulse.impactAt - impulse.start;
  const impactElapsed = now - impulse.impactAt;

  if (impactElapsed < 0) {
    // Prelude phase: ramp backdrop dim up, no flash / floor yet.
    const u = prelude > 0 ? elapsed / prelude : 1;
    const ease = 1 - Math.pow(1 - Math.min(1, u), 2);
    return {
      active: true,
      backdropDim: impulse.backdropDim * ease,
      floorStrength: 0,
      rimStrength: 0,
      screenFlashStrength: 0,
    };
  }

  // Impact + decay phase.
  const decayT = Math.min(1, impactElapsed / impulse.duration);
  // Flash is very brief (first 22% of decay), then gone.
  const flashT = Math.min(1, decayT / 0.22);
  const flashStrength = impulse.screenFlashStrength * (1 - Math.pow(flashT, 2));

  // Floor and rim ease out over the full decay.
  const decayEase = Math.pow(1 - decayT, 2);

  return {
    active: true,
    backdropDim: impulse.backdropDim * decayEase,
    floorStrength: impulse.floorStrength * decayEase,
    rimStrength: impulse.rimStrength * decayEase,
    screenFlashStrength: Math.max(0, flashStrength),
  };
}

// ---------------------------------------------------------------------------
// Actor flash envelope
// ---------------------------------------------------------------------------

/**
 * Sample actor flash strength at time `now`.
 * Returns 0 when expired or disabled.
 */
export function sampleActorFlash(
  impulse: ActorFlashImpulse | null,
  now: number
): { strength: number; color: string; mode: "white" | "elemental" } {
  if (!impulse || !COMBAT_ACTOR_FLASH_ENABLED) {
    return { strength: 0, color: "#ffffff", mode: "white" };
  }
  const elapsed = now - impulse.start;
  if (elapsed < 0 || elapsed >= impulse.duration) {
    return { strength: 0, color: impulse.color, mode: impulse.mode };
  }
  const t = elapsed / impulse.duration;
  // Quick ramp to peak (first 15%), hold briefly, ease out.
  let strength: number;
  if (t < 0.15) {
    const u = t / 0.15;
    strength = impulse.strength * (1 - Math.pow(1 - u, 2));
  } else if (t < 0.35) {
    strength = impulse.strength;
  } else {
    const u = (t - 0.35) / 0.65;
    strength = impulse.strength * Math.pow(1 - u, 2.5);
  }
  return { strength: Math.max(0, Math.min(1, strength)), color: impulse.color, mode: impulse.mode };
}

// ---------------------------------------------------------------------------
// Stronger-impulse replacement rules
// ---------------------------------------------------------------------------

/**
 * Returns true if `candidate` should replace `existing`.
 *
 * A stronger impulse (higher peakScale / longer duration / higher strength)
 * may replace a weaker one.  A weaker impulse must never restart a stronger
 * one.
 */
export function shouldReplaceZoom(
  existing: CameraZoomImpulse | null,
  candidate: CameraZoomImpulse,
  now: number
): boolean {
  if (!existing) return true;
  // If the existing impulse is already expired, allow replacement.
  if (now >= existing.start + existing.duration) return true;
  // Stronger peak wins.
  if (candidate.peakScale > existing.peakScale) return true;
  // Same peak but longer duration wins.
  if (candidate.peakScale === existing.peakScale && candidate.duration > existing.duration) return true;
  return false;
}

/**
 * Returns true if `candidate` should replace `existing` environment light.
 * Stronger = longer remaining duration + higher floor strength.
 */
export function shouldReplaceEnvironmentLight(
  existing: EnvironmentLightImpulse | null,
  candidate: EnvironmentLightImpulse,
  now: number
): boolean {
  if (!existing) return true;
  const existingEnd = existing.impactAt + existing.duration;
  if (now >= existingEnd) return true;
  // Higher floor strength wins.
  if (candidate.floorStrength > existing.floorStrength) return true;
  // Same strength but longer duration wins.
  if (candidate.floorStrength === existing.floorStrength && candidate.duration > existing.duration) return true;
  return false;
}

// ---------------------------------------------------------------------------
// AOE / multi-hit throttling
// ---------------------------------------------------------------------------

/**
 * Determine whether a hit should be granted a full stop.
 *
 * Rules:
 *  - One full stop per spell cast (AOE).
 *  - Multi-hit physical: stop on first hit (brief) and final hit (stronger).
 *  - Intermediate hits do not stop.
 *
 * `fullStopsThisTurn` is the running count for the current turn.
 */
export function shouldGrantFullStop(
  isArea: boolean,
  isFinalHit: boolean,
  isFirstHit: boolean,
  fullStopsThisTurn: number
): boolean {
  if (isArea) {
    // One stop per AOE cast — only on the first impact.
    return isFirstHit && fullStopsThisTurn === 0;
  }
  // Single-target multi-hit: stop on first and final.
  if (isFirstHit && fullStopsThisTurn === 0) return true;
  if (isFinalHit) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Reduced motion
// ---------------------------------------------------------------------------

let reducedMotionActive = false;

export function setReducedMotion(on: boolean): void {
  reducedMotionActive = on;
}

export function getReducedMotion(): boolean {
  return reducedMotionActive;
}

/**
 * Read the browser's `prefers-reduced-motion` media query and update the
 * internal flag.  Call this once when combat starts (or on media change).
 * Safe in non-browser environments (no-op when `matchMedia` is unavailable).
 */
export function syncReducedMotionFromMediaQuery(): void {
  if (typeof globalThis.matchMedia !== "function") return;
  try {
    const mq = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionActive = mq.matches;
  } catch {
    // matchMedia may throw in some embedded contexts; ignore.
  }
}

// ---------------------------------------------------------------------------
// Presentation-clock pausing (the freeze helper)
// ---------------------------------------------------------------------------

/**
 * Shift all active presentation timestamps forward by `deltaMs`.
 *
 * Called during hit-stop to keep every visual clock frozen while wall time
 * advances.  `freezeUntilWallTime` is NOT shifted (it uses real time).
 *
 * This is a pure function on the scene object — it mutates timestamps in place
 * but does not read or write any DOM / Phaser state.
 *
 * The `scene` parameter is typed loosely (structurally) so this module stays
 * DOM-free and Phaser-free.  The caller passes the real CombatScene.
 */
export function shiftPresentationClocks(
  scene: {
    choreo: { start: number; duration: number; steps: { at: number; fired: boolean }[] } | null;
    partyAnims: Map<string, { stateStart: number; moveStart: number; fadeOutStart: number | null }>;
    enemyAnims: Map<string, { stateStart: number; moveStart: number; fadeOutStart: number | null }>;
    allyAnims: Map<string, { stateStart: number; moveStart: number; fadeOutStart: number | null }>;
    popups: { start: number }[];
    barks: { start: number }[];
    barkWindow: { at: number }[];
    effects: { start: number }[];
    lightGlows: { start: number }[];
    screenShake: { until: number };
    banner: string | null;
    bannerStart: number;
    bannerUntil: number;
    introNameplate: string | null;
    introNameplateStart: number;
    introNameplateUntil: number;
    impact: CombatImpactState | null;
    lastUpdate?: number;
  },
  deltaMs: number
): void {
  if (deltaMs <= 0) return;

  // Choreography clock.
  if (scene.choreo) {
    scene.choreo.start += deltaMs;
  }

  // Actor animation clocks.
  for (const map of [scene.partyAnims, scene.enemyAnims, scene.allyAnims]) {
    for (const anim of map.values()) {
      anim.stateStart += deltaMs;
      anim.moveStart += deltaMs;
      if (anim.fadeOutStart !== null) {
        anim.fadeOutStart += deltaMs;
      }
    }
  }

  // Popups.
  for (const p of scene.popups) {
    p.start += deltaMs;
  }

  // Barks.
  for (const b of scene.barks) {
    b.start += deltaMs;
  }
  for (const w of scene.barkWindow) {
    w.at += deltaMs;
  }

  // Effects.
  for (const e of scene.effects) {
    e.start += deltaMs;
  }

  // Light glows.
  for (const g of scene.lightGlows) {
    g.start += deltaMs;
  }

  // Screen shake expiry.
  scene.screenShake.until += deltaMs;

  // Banner.
  if (scene.banner) {
    scene.bannerStart += deltaMs;
    scene.bannerUntil += deltaMs;
  }

  // Boss intro nameplate.
  if (scene.introNameplate) {
    scene.introNameplateStart += deltaMs;
    scene.introNameplateUntil += deltaMs;
  }

  // Impact impulses (zoom, environment, actor flashes) — but NOT freezeUntilWallTime.
  if (scene.impact) {
    const imp = scene.impact;
    if (imp.zoom) {
      imp.zoom.start += deltaMs;
    }
    if (imp.environment) {
      imp.environment.start += deltaMs;
      imp.environment.impactAt += deltaMs;
    }
    for (const flash of imp.actorFlashes.values()) {
      flash.start += deltaMs;
    }
  }

  // Prevent a large particle jump after unfreezing.
  scene.lastUpdate = undefined;
}

// ---------------------------------------------------------------------------
// Trigger impact presentation (the choke-point helper)
// ---------------------------------------------------------------------------

export interface ImpactPresentationInput {
  actorId: string;
  targetId: string;
  damage: number;
  crit?: boolean;
  spellId?: string;
  techniqueId?: string;
  isArea?: boolean;
  isFinalHit?: boolean;
  isFirstHit?: boolean;
  allowHitStop?: boolean;
  x: number;
  y: number;
  /** Target's max HP for ratio classification. */
  targetMaxHp: number;
  /** Spell tier (if known). */
  spellTier?: number;
  /** Is this a major boss signature? */
  isBossSignature?: boolean;
  /** Illumination profile from the EffectStyle, if any. */
  illumination?: IlluminationProfile;
  /** EffectStyle color (for elemental actor flash). */
  effectColor?: string;
}

/**
 * The single choke-point that all impact paths call.
 *
 * Populates `impact` state on the scene: hit-stop freeze, zoom impulse,
 * environment light, and actor flash.  Respects AOE throttling, the
 * cumulative hit-stop cap, stronger-impulse replacement rules, and FAST /
 * reduced-motion scaling.
 *
 * `now` is the wall-clock time at which the impact step fires.
 * `playbackRate` is the scene's current playback rate.
 */
export function triggerImpactPresentation(
  impact: CombatImpactState,
  input: ImpactPresentationInput,
  now: number,
  playbackRate: number
): void {
  const reduced = getReducedMotion();
  const strength = classifyImpact({
    damage: input.damage,
    targetMaxHp: input.targetMaxHp,
    crit: input.crit,
    spellTier: input.spellTier,
    isBossSignature: input.isBossSignature,
  });

  // --- Actor flash (always, even on AOE non-stop targets) ---
  if (COMBAT_ACTOR_FLASH_ENABLED && !reduced) {
    const flashDuration = strength === "light" ? 0
      : strength === "strong" ? 24
      : strength === "heavy" ? 32
      : 40;
    if (flashDuration > 0) {
      const flashColor = input.effectColor ?? "#ffffff";
      const flashStrength = strength === "strong" ? 0.5
        : strength === "heavy" ? 0.7
        : 0.85;
      // White silhouette for physical / unknown; elemental for spells with color.
      const mode: "white" | "elemental" = input.spellId ? "elemental" : "white";
      const flash: ActorFlashImpulse = {
        start: now,
        duration: flashDuration,
        color: mode === "white" ? "#ffffff" : flashColor,
        strength: flashStrength,
        mode,
      };
      impact.actorFlashes.set(input.targetId, flash);
    }
  }

  // --- Determine if this hit gets a full stop ---
  const allowStop = input.allowHitStop !== false;
  const grantStop = allowStop && shouldGrantFullStop(
    input.isArea ?? false,
    input.isFinalHit ?? false,
    input.isFirstHit ?? false,
    impact.fullStopsThisTurn
  );

  // --- Hit-stop ---
  if (grantStop && COMBAT_HIT_STOP_ENABLED) {
    const desired = effectiveHitStopMs(strength, playbackRate, reduced);
    if (desired > 0) {
      const actual = cappedHitStopMs(desired, impact.accumulatedFreezeThisTurn);
      if (actual > 0) {
        impact.freezeUntilWallTime = now + actual;
        impact.lastFreezeWallTime = now;
        impact.accumulatedFreezeThisTurn += actual;
        impact.fullStopsThisTurn++;
      }
    }
  }

  // --- Zoom ---
  if (COMBAT_IMPACT_ZOOM_ENABLED && !reduced) {
    const peak = peakZoomScale(strength);
    const dur = zoomDurationMs(strength);
    if (peak > 1 && dur > 0) {
      const candidate: CameraZoomImpulse = {
        start: now,
        duration: dur,
        peakScale: peak,
        focusX: input.x,
        focusY: input.y,
      };
      if (shouldReplaceZoom(impact.zoom, candidate, now)) {
        impact.zoom = candidate;
      }
    }
  }

  // --- Environment light ---
  if (COMBAT_ENV_LIGHTING_ENABLED && !reduced && input.illumination) {
    const illum = input.illumination;
    const prelude = illum.preludeMs ?? 0;
    const candidate: EnvironmentLightImpulse = {
      kind: illum.kind,
      start: now - prelude,
      impactAt: now,
      duration: illum.durationMs,
      color: illum.color,
      backdropDim: illum.backdropDim ?? 0.3,
      floorStrength: illum.floorStrength ?? 0.5,
      rimStrength: illum.rimStrength ?? 0.3,
      screenFlashStrength: illum.screenFlashStrength ?? 0.2,
      sourceX: input.x,
      sourceY: input.y,
    };
    if (shouldReplaceEnvironmentLight(impact.environment, candidate, now)) {
      impact.environment = candidate;
    }
  }
}

// ---------------------------------------------------------------------------
// Illumination defaults per element
// ---------------------------------------------------------------------------

/**
 * Default illumination profiles for each element.
 * Used when an EffectStyle doesn't declare its own `illumination`.
 */
export const ELEMENT_ILLUMINATION_DEFAULTS: Partial<Record<string, IlluminationProfile>> = {
  fire: {
    kind: "fire",
    color: "#ff8c42",
    preludeMs: 120,
    durationMs: 350,
    backdropDim: 0.35,
    floorStrength: 0.6,
    rimStrength: 0.35,
    screenFlashStrength: 0.2,
  },
  cold: {
    kind: "cold",
    color: "#d6f7ff",
    durationMs: 400,
    backdropDim: 0.2,
    floorStrength: 0.45,
    rimStrength: 0.3,
    screenFlashStrength: 0.15,
  },
  divine: {
    kind: "holy",
    color: "#ffe8a0",
    preludeMs: 60,
    durationMs: 420,
    backdropDim: 0.12,
    floorStrength: 0.5,
    rimStrength: 0.4,
    screenFlashStrength: 0.25,
  },
  lightning: {
    kind: "lightning",
    color: "#ffd769",
    preludeMs: 0,
    durationMs: 220,
    backdropDim: 0.25,
    floorStrength: 0.55,
    rimStrength: 0.3,
    screenFlashStrength: 0.3,
  },
  physical: {
    kind: "physical",
    color: "#f5f0e6",
    preludeMs: 0,
    durationMs: 200,
    backdropDim: 0.15,
    floorStrength: 0.3,
    rimStrength: 0.2,
    screenFlashStrength: 0.1,
  },
  // Conservative defaults for remaining elements.
  water: {
    kind: "water",
    color: "#a0f0ff",
    durationMs: 300,
    backdropDim: 0.2,
    floorStrength: 0.4,
    rimStrength: 0.25,
    screenFlashStrength: 0.12,
  },
  earth: {
    kind: "earth",
    color: "#b8a080",
    durationMs: 300,
    backdropDim: 0.2,
    floorStrength: 0.4,
    rimStrength: 0.25,
    screenFlashStrength: 0.1,
  },
  wind: {
    kind: "wind",
    color: "#d0ffe0",
    durationMs: 250,
    backdropDim: 0.15,
    floorStrength: 0.3,
    rimStrength: 0.2,
    screenFlashStrength: 0.08,
  },
  poison: {
    kind: "poison",
    color: "#c080ff",
    durationMs: 280,
    backdropDim: 0.2,
    floorStrength: 0.35,
    rimStrength: 0.25,
    screenFlashStrength: 0.1,
  },
  undead: {
    kind: "dark",
    color: "#c080ff",
    durationMs: 300,
    backdropDim: 0.3,
    floorStrength: 0.4,
    rimStrength: 0.3,
    screenFlashStrength: 0.12,
  },
};

/**
 * Resolve the illumination profile for a spell/effect style.
 * Falls back to element defaults, then null.
 */
export function resolveIllumination(
  element?: string,
  custom?: IlluminationProfile
): IlluminationProfile | undefined {
  if (custom) return custom;
  if (element && ELEMENT_ILLUMINATION_DEFAULTS[element]) {
    return ELEMENT_ILLUMINATION_DEFAULTS[element];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Pre-scan helpers for multi-hit / AOE sequencing
// ---------------------------------------------------------------------------

export interface DamageEventInfo {
  index: number;
  type: "attack" | "ambush" | "techniqueHit" | "cast" | "spellEffect";
  actorId: string;
  targetId: string;
  damage: number;
  spellId?: string;
  isArea: boolean;
}

/**
 * Pre-scan a turn's events to classify damaging events.
 * Returns info needed to determine first/final hits and AOE grouping.
 */
export function preScanDamageEvents(
  events: ReadonlyArray<{
    type: string;
    actorId?: string;
    targetId?: string | null;
    damage?: number;
    spellId?: string;
  } | null>
): DamageEventInfo[] {
  const result: DamageEventInfo[] = [];
  for (let i = 0; i < events.length; i++) {
    const evt = events[i];
    if (!evt) continue;
    if (
      evt.type === "attack" ||
      evt.type === "ambush" ||
      evt.type === "techniqueHit" ||
      evt.type === "cast" ||
      evt.type === "spellEffect"
    ) {
      const damage = (evt as { damage?: number }).damage;
      if (damage === undefined || damage <= 0) continue;
      const targetId = (evt as { targetId?: string | null }).targetId;
      if (!targetId) continue;
      const spellId = (evt as { spellId?: string }).spellId;
      // Determine if this is an area spell.
      let isArea = false;
      if (spellId) {
        // We can't import spellById here without creating a cycle in some
        // downstream tests; the caller passes isArea via the trigger input.
        // For pre-scan we mark cast events with no targetId as potential AOE.
        isArea = false;
      }
      result.push({
        index: i,
        type: evt.type as DamageEventInfo["type"],
        actorId: (evt as { actorId?: string }).actorId ?? "",
        targetId,
        damage,
        spellId,
        isArea,
      });
    }
  }
  return result;
}

/**
 * Given a list of damage event infos, determine for each whether it's
 * the first or final hit in its actor's sequence.
 */
export function classifyHitSequence(
  infos: DamageEventInfo[]
): Map<number, { isFirst: boolean; isFinal: boolean }> {
  const result = new Map<number, { isFirst: boolean; isFinal: boolean }>();
  // Group by actorId.
  const byActor = new Map<string, number[]>();
  for (const info of infos) {
    const arr = byActor.get(info.actorId) ?? [];
    arr.push(info.index);
    byActor.set(info.actorId, arr);
  }
  for (const indices of byActor.values()) {
    for (let i = 0; i < indices.length; i++) {
      result.set(indices[i], {
        isFirst: i === 0,
        isFinal: i === indices.length - 1,
      });
    }
  }
  return result;
}
