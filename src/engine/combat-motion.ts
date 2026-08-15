/**
 * Presentation-only motion vocabulary for combat actors.
 *
 * This module deliberately knows nothing about combat rules, enemy tags, or
 * targeting. Callers provide a small visual descriptor and screen geometry;
 * the result is a bounded timeline/offset profile shared by Canvas and Phaser.
 */

export type CombatMotionStyle =
  | "humanoid-light"
  | "humanoid"
  | "humanoid-heavy"
  | "beast"
  | "flying"
  | "ooze"
  | "construct"
  | "caster"
  | "ghost"
  | "stationary";

export type AttackWeight = "light" | "normal" | "heavy";

export interface MotionActorDescriptor {
  kind: "party" | "enemy" | "ally";
  /** Playable class, when the actor is a party member. */
  className?: string;
  /** EnemyDef id, when the actor is an enemy or summon. */
  enemyId?: string;
}

export interface MeleeMotionProfile {
  style: CombatMotionStyle;
  weight: AttackWeight;
  anticipationMs: number;
  approachMs: number;
  strikeMs: number;
  returnMs: number;
  /** Fraction of strikeMs at which contact/damage is shown. */
  contactFraction: number;
  /** Fraction of the actor→target horizontal gap to travel. */
  travelFraction: number;
  /** Extra negative Y offset at the attack pose. */
  liftPx: number;
  /** Whether the attack uses the ranged release path. */
  ranged: boolean;
  /** Short hold used by the target reaction, not a gameplay delay. */
  impactHoldMs: number;
}

export interface ApproachGeometry {
  actorX: number;
  actorY: number;
  targetX: number;
  targetY: number;
  actorScale: number;
  canvasWidth: number;
  canvasHeight: number;
}

export interface ApproachOffset {
  x: number;
  y: number;
}

const STYLE_OVERRIDES: Readonly<Record<string, CombatMotionStyle>> = {
  // Oozes compress and hop instead of walking.
  slime: "ooze",
  "acid-puddle": "ooze",
  "lava-slime": "ooze",
  "summon-slime": "ooze",
  // Airborne bodies dive/swoop; they are never given a grounded walk read.
  hellbat: "flying",
  "eyeball-monster": "flying",
  // Explicit ghost/flame bodies float through their approach.
  ghostfire: "ghost",
  "blood-wraith": "ghost",
  "cistern-wraith": "ghost",
  "weeping-revenant": "ghost",
  // Small beasts pounce; hounds and wolves are intentionally explicit.
  hellhound: "beast",
  werewolf: "beast",
  "displacer-beast": "beast",
  "blood-monster": "beast",
  viper: "beast",
  "viper-man": "beast",
  // Heavy bodies lean and surge rather than skating.
  minotaur: "humanoid-heavy",
  ogre: "humanoid-heavy",
  "big-titty-ogre": "humanoid-heavy",
  "flame-golem": "construct",
  "ice-golem": "construct",
  "stone-guardian": "construct",
  "lesser-construct": "construct",
  "animated-armor": "construct",
  "ironclad-knight": "construct",
  "rune-knight": "construct",
  "black-knight": "construct",
  "summon-holy-guardian": "construct",
  "summon-celestial-guardian": "construct",
  "summon-eldritch-guardian": "construct",
  "training-dummy": "construct",
  // Enemy casters keep their feet planted and sell the release with a lift.
  warlock: "caster",
  "demon-mage": "caster",
  succubus: "caster",
  "choir-magus": "caster",
  "null-acolyte": "caster",
  "undertow-caller": "caster",
};

/** Resolve an explicit presentation style. This is not combat taxonomy. */
export function motionStyleForActor(descriptor: MotionActorDescriptor): CombatMotionStyle {
  if (descriptor.kind === "party") {
    switch (descriptor.className) {
      case "Thief":
        return "humanoid-light";
      case "Halberdier":
      case "Crusader":
        return "humanoid-heavy";
      case "Mage":
      case "Priest":
        return "caster";
      default:
        return "humanoid";
    }
  }
  if (descriptor.enemyId && STYLE_OVERRIDES[descriptor.enemyId]) {
    return STYLE_OVERRIDES[descriptor.enemyId]!;
  }
  if (descriptor.enemyId && /skeleton|red-skeleton|armored-skeleton/.test(descriptor.enemyId)) {
    return "humanoid";
  }
  if (descriptor.enemyId && /demon|orc|demoness|demon-brawler|demon-champion/.test(descriptor.enemyId)) {
    return "humanoid-heavy";
  }
  if (descriptor.enemyId && /warlock|mage|wizard|caster|cantor|caller|magus/.test(descriptor.enemyId)) {
    return "caster";
  }
  return descriptor.kind === "enemy" ? "humanoid" : "stationary";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function weightForStyle(style: CombatMotionStyle): AttackWeight {
  switch (style) {
    case "humanoid-light":
    case "ooze":
    case "flying":
    case "ghost":
    case "caster":
      return "light";
    case "humanoid-heavy":
    case "construct":
      return "heavy";
    default:
      return "normal";
  }
}

export function meleeMotionProfile(
  style: CombatMotionStyle,
  opts: { critical?: boolean; ranged?: boolean; weight?: AttackWeight } = {}
): MeleeMotionProfile {
  const ranged = opts.ranged === true;
  const weight = opts.weight ?? (ranged ? "light" : weightForStyle(style));

  if (ranged) {
    return {
      style,
      weight,
      anticipationMs: 95,
      approachMs: 0,
      strikeMs: 300,
      returnMs: 105,
      contactFraction: 0.7,
      travelFraction: 0,
      liftPx: style === "flying" ? -10 : 0,
      ranged: true,
      impactHoldMs: opts.critical ? 70 : 25,
    };
  }

  const base =
    weight === "light"
      ? { approachMs: 135, strikeMs: 300, returnMs: 135, impactHoldMs: 25 }
      : weight === "heavy"
        ? { approachMs: 190, strikeMs: 400, returnMs: 175, impactHoldMs: 55 }
        : { approachMs: 165, strikeMs: 350, returnMs: 155, impactHoldMs: 35 };

  const criticalBoost = opts.critical ? 35 : 0;
  const liftPx =
    style === "ooze"
      ? -18
      : style === "flying" || style === "ghost"
        ? -28
        : style === "beast"
          ? -16
          : style === "humanoid-heavy" || style === "construct"
            ? -5
            : -3;

  return {
    style,
    weight,
    anticipationMs: weight === "heavy" ? 85 : 55,
    approachMs: base.approachMs + (opts.critical ? 10 : 0),
    strikeMs: base.strikeMs + criticalBoost,
    returnMs: base.returnMs + (opts.critical ? 12 : 0),
    contactFraction: weight === "heavy" ? 0.62 : 0.58,
    travelFraction:
      style === "ooze"
        ? 0.27
        : style === "beast"
          ? 0.38
          : weight === "light"
            ? 0.26
            : weight === "heavy"
              ? 0.38
              : 0.32,
    liftPx,
    ranged: false,
    impactHoldMs: base.impactHoldMs + (opts.critical ? 35 : 0),
  };
}

/**
 * Calculate a bounded attack displacement. The attacker advances toward the
 * target but stops well before the target's visual centre, preserving readable
 * silhouettes and the existing stage/paint-order contract.
 */
export function approachOffset(
  geometry: ApproachGeometry,
  profile: MeleeMotionProfile
): ApproachOffset {
  if (profile.ranged) return { x: 0, y: profile.liftPx };
  const dx = geometry.targetX - geometry.actorX;
  const dy = geometry.targetY - geometry.actorY;
  const direction = dx === 0 ? (geometry.actorX < geometry.canvasWidth / 2 ? 1 : -1) : Math.sign(dx);
  const gap = Math.abs(dx);
  const maxTravel = Math.max(0, Math.min(gap * 0.58, 155 * geometry.actorScale));
  const minTravel = Math.min(30 * geometry.actorScale, maxTravel);
  const travel = clamp(gap * profile.travelFraction, minTravel, maxTravel);
  const verticalFollow = clamp(dy * 0.12, -22, 22);
  return {
    x: travel === 0 ? 0 : direction * travel,
    y: clamp(profile.liftPx + verticalFollow, -58, 24),
  };
}

export function contactTime(profile: MeleeMotionProfile): number {
  return profile.approachMs + profile.strikeMs * profile.contactFraction;
}

export function totalMeleeTime(profile: MeleeMotionProfile): number {
  return profile.approachMs + profile.strikeMs + profile.returnMs;
}

/**
 * Deterministic camera nudge shared by Canvas and Phaser. Combat resolution
 * remains seeded elsewhere; presentation must not call Math.random() per
 * render frame or the two backends will visibly diverge.
 */
export function screenShakeOffset(
  amount: number,
  now: number
): { x: number; y: number } {
  if (amount <= 0) return { x: 0, y: 0 };
  const phase = now * 0.045;
  return {
    x: Math.sin(phase * 1.07 + 0.8) * amount * 0.5,
    y: Math.cos(phase * 1.31 + 1.7) * amount * 0.5,
  };
}

/** Stable 0..1 noise for cosmetic particles and scale variation. */
export function deterministicNoise(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}
