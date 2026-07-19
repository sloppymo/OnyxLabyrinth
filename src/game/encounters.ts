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
import type { EncounterZoneDef, FloorDef } from "../data/floors";

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
 * Maps each of the discrete Arena chooser levels (1/3/6/9/12) onto its own
 * floor across the full 5-floor campaign, so higher-level parties reach the
 * denser floor 4/5 encounter tables instead of looping on floor 3 forever.
 */
export function arenaStartFloorForLevel(level: number): number {
  const lv = Math.max(1, Math.floor(level));
  if (lv <= 2) return 1;
  if (lv <= 4) return 2;
  if (lv <= 7) return 3;
  if (lv <= 10) return 4;
  return 5;
}

/**
 * Floor used for Arena wave `wave` (1-based), cycling from `startFloor`
 * through floor 5 (inclusive).
 *
 * Examples (start=1): wave 1→1, 2→2, 3→3, 4→4, 5→5, 6→1…
 * start=5: every wave stays on floor 5.
 */
export function arenaFloorForWave(startFloor: number, wave: number): number {
  const start = Math.min(5, Math.max(1, Math.floor(startFloor)));
  const w = Math.max(1, Math.floor(wave));
  const span = 6 - start; // 5,4,3,2, or 1
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

/** Find the first encounter zone covering (x,y), if any. */
export function encounterZoneAt(
  floor: Pick<FloorDef, "encounterZones">,
  x: number,
  y: number
): EncounterZoneDef | undefined {
  const zones = floor.encounterZones;
  if (!zones?.length) return undefined;
  for (const z of zones) {
    const loX = Math.min(z.x1, z.x2);
    const hiX = Math.max(z.x1, z.x2);
    const loY = Math.min(z.y1, z.y2);
    const hiY = Math.max(z.y1, z.y2);
    if (x >= loX && x <= hiX && y >= loY && y <= hiY) return z;
  }
  return undefined;
}

/**
 * Effective encounter base rate for a step at (x,y).
 * Safe zones (rateMul 0) still respect cooldown/pity math via chance 0 when
 * the caller multiplies — we return 0 so rolls never fire in the zone.
 */
export function encounterRateAt(
  floor: Pick<FloorDef, "encounterRate" | "encounterZones">,
  x: number,
  y: number
): number {
  const zone = encounterZoneAt(floor, x, y);
  if (!zone) return floor.encounterRate;
  return Math.max(0, floor.encounterRate * zone.rateMul);
}

/** Encounter table floor id for the current cell. */
export function encounterTableFloorId(
  floor: Pick<FloorDef, "id" | "encounterZones">,
  x: number,
  y: number
): number {
  const zone = encounterZoneAt(floor, x, y);
  return zone?.tableFloorId ?? floor.id;
}
