/**
 * Pure selection utility for the combat bark CONTENT LIBRARY
 * (`src/data/combat-bark-library/`).
 *
 * Deliberately separate from the repo's existing, already-shipped bark MVP
 * at `src/game/combat-barks.ts` (`pickBark`/`maybeEmitBark`, wired into
 * combat-actions.ts/combat-enemy.ts/combat-eor.ts/combat.ts). The pure
 * selector remains independent of combat resolution; the presentation bridge
 * in `combat-bark-runtime.ts` supplies eligibility and frequency policy at the
 * event boundary. No selector call advances gameplay RNG.
 */

import type {
  ChemistryId,
  CombatBarkLine,
  CombatBarkProfile,
  CombatBarkTrigger,
} from "../data/combat-bark-library/types";
import { BARK_PROFILES_BY_ID } from "../data/combat-bark-library";

export interface SelectBarkInput {
  /** EnemyDef.id, CharacterClass, or CompanionDef.id. */
  speakerId: string;
  trigger: CombatBarkTrigger;
  /** Enemy ability id or PC technique/spell id, if this event was ability-driven. */
  abilityId?: string;
  chemistryId?: ChemistryId;
  status?: string;
  /** The enemy identity that caused this event (e.g. the Minotaur doing the throwing). */
  sourceEnemyId?: string;
  /** The enemy identity this event happened to/with (e.g. the Slime being thrown). */
  targetEnemyId?: string;
  /**
   * Deterministic RNG: a function returning a fresh value in [0, 1) each
   * call. Never `Math.random()` inside this module — callers thread a
   * seeded RNG through so selection is reproducible given the same inputs
   * and call order. (Mirrors the isolation the shipped bark MVP already
   * enforces for its own module-level RNG — see the integration contract.)
   */
  rng: () => number;
  /** Line keys (see `barkLineKey`) already spoken this combat, for `oncePerCombat`
   *  filtering. Pass an empty set/array if nothing has been said yet. */
  alreadyUsed?: ReadonlySet<string> | readonly string[];
  /** Recent line keys are blocked even when a line is not once-per-combat. */
  recentlyUsed?: ReadonlySet<string> | readonly string[];
}

/** Stable identity for a bark line, for `oncePerCombat` bookkeeping by the caller. */
export function barkLineKey(
  speakerId: string,
  trigger: CombatBarkTrigger,
  line: CombatBarkLine
): string {
  return `${speakerId}::${trigger}::${line.text}`;
}

function matchesLine(
  line: CombatBarkLine,
  input: SelectBarkInput,
  used: ReadonlySet<string>,
  recent: ReadonlySet<string>,
  key: string
): boolean {
  if (line.oncePerCombat && used.has(key)) return false;
  if (recent.has(key)) return false;
  if (line.abilityId !== undefined && line.abilityId !== input.abilityId) return false;
  if (line.chemistryId !== undefined && line.chemistryId !== input.chemistryId) return false;
  if (line.status !== undefined && line.status !== input.status) return false;
  if (line.sourceEnemyId !== undefined && line.sourceEnemyId !== input.sourceEnemyId) return false;
  if (line.targetEnemyId !== undefined && line.targetEnemyId !== input.targetEnemyId) return false;
  return true;
}

/**
 * Select one bark line for the given speaker/trigger/context, or `null` if no
 * line qualifies (no profile, no pool for that trigger, everything filtered
 * out, or every eligible line has already been used this combat).
 *
 * Deterministic: given the same `profiles`, the same `input` (including the
 * same `rng` function producing the same sequence), this always returns the
 * same line. Weighted selection (default weight 1 per line) via a single
 * `rng()` call.
 */
export function selectCombatBark(
  input: SelectBarkInput,
  profiles: ReadonlyMap<string, CombatBarkProfile> = BARK_PROFILES_BY_ID
): CombatBarkLine | null {
  const profile = profiles.get(input.speakerId);
  if (!profile) return null;

  const pool = profile.pools[input.trigger];
  if (!pool || pool.length === 0) return null;

  const used =
    input.alreadyUsed instanceof Set ? input.alreadyUsed : new Set(input.alreadyUsed ?? []);
  const recent =
    input.recentlyUsed instanceof Set ? input.recentlyUsed : new Set(input.recentlyUsed ?? []);

  const candidates = pool.filter((line) =>
    matchesLine(line, input, used, recent, barkLineKey(input.speakerId, input.trigger, line))
  );
  if (candidates.length === 0) return null;

  const totalWeight = candidates.reduce((sum, l) => sum + (l.weight ?? 1), 0);
  if (totalWeight <= 0) return null;

  let roll = input.rng() * totalWeight;
  for (const line of candidates) {
    roll -= line.weight ?? 1;
    if (roll <= 0) return line;
  }
  return candidates[candidates.length - 1];
}

/**
 * Return the currently eligible lines without consuming the injected RNG.
 * Runtime governors use this to distinguish "no content qualifies" from
 * "content qualified but the presentation policy chose silence".
 */
export function eligibleCombatBarks(
  input: Omit<SelectBarkInput, "rng">,
  profiles: ReadonlyMap<string, CombatBarkProfile> = BARK_PROFILES_BY_ID
): readonly CombatBarkLine[] {
  const profile = profiles.get(input.speakerId);
  if (!profile) return [];
  const pool = profile.pools[input.trigger];
  if (!pool || pool.length === 0) return [];
  const used =
    input.alreadyUsed instanceof Set ? input.alreadyUsed : new Set(input.alreadyUsed ?? []);
  const recent =
    input.recentlyUsed instanceof Set ? input.recentlyUsed : new Set(input.recentlyUsed ?? []);
  return pool.filter((line) =>
    matchesLine(
      line,
      input as SelectBarkInput,
      used,
      recent,
      barkLineKey(input.speakerId, input.trigger, line)
    )
  );
}
