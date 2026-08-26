/**
 * Shared, deliberately quiet floor bounce light for combatants.
 *
 * Canvas uses the returned values for a radial gradient and Phaser uses the
 * same values for a few concentric bands. The math is static and positional,
 * so both backends preserve the same intent without introducing another
 * animated ambience system.
 */

export interface CombatFloorBounceLightInput {
  x: number;
  footY: number;
  drawSize: number;
  /** The actor's already-resolved visual opacity (hidden/death included). */
  opacity: number;
}
export interface CombatFloorBounceLight {
  x: number;
  y: number;
  radius: number;
  color: "#739886";
  alpha: number;
}

const FLOOR_BOUNCE_COLOR = "#739886" as const;
const FLOOR_BOUNCE_ALPHA = 0.055;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Return one soft green-gray pool under an actor's feet. The scale is tied to
 * the actor's resolved draw size, not to a slot or backend-specific constant,
 * which keeps moving sprites and both renderers in sync.
 */
export function floorBounceLightForActor(
  input: CombatFloorBounceLightInput
): CombatFloorBounceLight {
  const size = Math.max(16, input.drawSize);
  return {
    x: input.x,
    y: input.footY - size * 0.045,
    radius: Math.max(10, size * 0.38),
    color: FLOOR_BOUNCE_COLOR,
    alpha: FLOOR_BOUNCE_ALPHA * clamp01(input.opacity),
  };
}

/** Convert the shared hex colour to a Canvas-friendly CSS colour. */
export function floorBounceRgba(light: CombatFloorBounceLight, alpha = light.alpha): string {
  const value = Number.parseInt(light.color.slice(1), 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`;
}
