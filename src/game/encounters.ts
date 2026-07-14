/**
 * Encounter pacing helpers — dungeon step rolls and Arena floor/wave selection.
 *
 * Pure: no DOM, no GameState mutation. Combat math / damage formulas are
 * untouched; this only decides *when* a fight starts and *which floor table*
 * Arena pulls from.
 */

import {
  ENCOUNTER_TABLES,
  ENEMIES_BY_ID,
  type EncounterEntry,
} from "../data/enemies";

/** Design doc §6.3: no more than one encounter per this many steps. */
export const ENCOUNTER_COOLDOWN = 8;

/**
 * Soft pity band: after this many steps since the last fight, chance ramps
 * from the floor's base rate toward a forced encounter.
 */
export const ENCOUNTER_PITY_START = 20;

/** Hard cap on dry spells — encounter on this step if still clear. */
export const ENCOUNTER_PITY_FORCE = 28;

/**
 * Chance (0..1) that a step triggers an encounter, given steps since the
 * last fight and the floor's base rate.
 *
 * - Below {@link ENCOUNTER_COOLDOWN}: always 0.
 * - Cooldown..pityStart: base rate only.
 * - pityStart..pityForce: linear ramp from base toward 1.
 * - At/above pityForce: always 1.
 */
export function encounterRollChance(
  baseRate: number,
  stepsSinceEncounter: number,
  opts?: {
    cooldown?: number;
    pityStart?: number;
    pityForce?: number;
  }
): number {
  const cooldown = opts?.cooldown ?? ENCOUNTER_COOLDOWN;
  const pityStart = opts?.pityStart ?? ENCOUNTER_PITY_START;
  const pityForce = opts?.pityForce ?? ENCOUNTER_PITY_FORCE;

  if (stepsSinceEncounter < cooldown) return 0;
  if (stepsSinceEncounter >= pityForce) return 1;

  const rate = Math.max(0, Math.min(1, baseRate));
  if (stepsSinceEncounter < pityStart) return rate;

  const t =
    (stepsSinceEncounter - pityStart) / Math.max(1, pityForce - pityStart);
  return rate + (1 - rate) * t;
}

/**
 * Arena starting floor for a party level.
 * L1–L3 → floor 1, L4–L6 → floor 2, L7+ → floor 3.
 * Matches the discrete Arena chooser (1/3/6/9/12) so L9 never opens on
 * floor-1 skeletons.
 */
export function arenaStartFloorForLevel(level: number): number {
  const lv = Math.max(1, Math.floor(level));
  if (lv <= 3) return 1;
  if (lv <= 6) return 2;
  return 3;
}

/**
 * Floor used for Arena wave `wave` (1-based), cycling from `startFloor`
 * through floor 3 (inclusive).
 *
 * Examples (start=1): wave 1→1, 2→2, 3→3, 4→1…
 * start=3: every wave stays on floor 3.
 */
export function arenaFloorForWave(startFloor: number, wave: number): number {
  const start = Math.min(3, Math.max(1, Math.floor(startFloor)));
  const w = Math.max(1, Math.floor(wave));
  const span = 4 - start; // 3,2, or 1
  return start + ((w - 1) % span);
}

function entryHasBoss(entry: EncounterEntry): boolean {
  return entry.spawns.some((s) => ENEMIES_BY_ID[s.enemyId]?.isBoss === true);
}

/**
 * Weighted Arena encounter pick.
 * - Drops boss formations (Headmaster's Echo etc.) — dungeon-only climax.
 * - Higher waves bias weight toward multi-enemy packs so L9+ Arena stays spicy
 *   even when locked to floor 3.
 */
export function rollArenaEncounter(
  floor: number,
  wave = 1,
  rng: () => number = Math.random
): EncounterEntry | null {
  const table = ENCOUNTER_TABLES[floor];
  if (!table || table.length === 0) return null;

  const pool = table.filter((e) => !entryHasBoss(e));
  const use = pool.length > 0 ? pool : table;

  const waveBias = Math.min(2, Math.max(0, wave - 1) * 0.2);
  let total = 0;
  const weighted = use.map((entry) => {
    const packBonus = 1 + waveBias * Math.max(0, entry.spawns.length - 1);
    const w = entry.weight * packBonus;
    total += w;
    return { entry, w };
  });

  if (total <= 0) return use[use.length - 1] ?? null;

  let roll = rng() * total;
  for (const { entry, w } of weighted) {
    roll -= w;
    if (roll <= 0) return entry;
  }
  return weighted[weighted.length - 1]?.entry ?? null;
}
