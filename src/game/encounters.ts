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
  type Row,
} from "../data/enemies";
import type { EncounterZoneDef, FloorDef } from "../data/floors";
import { nondeterministicRng } from "./rng";

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
 * How dangerous the party's current cell is, relative to its floor's own base
 * rate — i.e. which authored `encounterZone` they are standing in.
 *
 * This is the *where* channel of the dungeon danger readout. It is a pure
 * function of position and says nothing about how long it has been since the
 * last fight.
 */
export type ZoneHeat = "dead" | "quiet" | "normal" | "hot";

/** Tolerance around the floor's base rate that still reads as "normal". */
const HEAT_TOLERANCE = 0.05;

/**
 * Classify the cell's encounter rate against its floor's base rate, recovering
 * the covering zone's `rateMul` without needing to look the zone up again.
 *
 * A `rateMul: 0` pocket reads `dead` — no ordinary roll can fire there. That
 * is deliberately NOT the same as "safe": pity still forces a fight, which is
 * why pressure is a separate channel (see {@link pityPressureFor}).
 */
export function zoneHeatAt(
  floor: Pick<FloorDef, "encounterRate" | "encounterZones">,
  x: number,
  y: number
): ZoneHeat {
  const rate = encounterRateAt(floor, x, y);
  if (rate <= 0) return "dead";
  const base = floor.encounterRate;
  if (base <= 0) return "normal";
  if (rate < base * (1 - HEAT_TOLERANCE)) return "quiet";
  if (rate > base * (1 + HEAT_TOLERANCE)) return "hot";
  return "normal";
}

/**
 * How close the encounter clock is to firing.
 *
 * This is the *when* channel, and it is a pure function of the step counter —
 * deliberately independent of the local rate, because the pity ramp ignores
 * `rateMul` entirely. A dead zone at step 20+ genuinely is about to produce a
 * fight, and the readout must be able to say so.
 */
export type PityPressure = "cooldown" | "live" | "ramping";

export function pityPressureFor(
  stepsSinceEncounter: number,
  opts?: { cooldown?: number; pityStart?: number }
): PityPressure {
  const cooldown = opts?.cooldown ?? ENCOUNTER_COOLDOWN;
  const pityStart = opts?.pityStart ?? ENCOUNTER_PITY_START;
  if (stepsSinceEncounter < cooldown) return "cooldown";
  return stepsSinceEncounter >= pityStart ? "ramping" : "live";
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
 * Distinct, non-boss enemy ids that fill `row` anywhere in floor's own
 * ENCOUNTER_TABLES (this already includes lower-floor enemies remixed into
 * higher-floor packs). This is the pool {@link reshuffleSpawns} draws from —
 * it never reaches outside the floor's curated roster.
 */
function rowPoolForFloor(floor: number, row: Row): string[] {
  const table = ENCOUNTER_TABLES[floor];
  if (!table) return [];
  const ids = new Set<string>();
  for (const entry of table) {
    for (const spawn of entry.spawns) {
      if (spawn.row === row && ENEMIES_BY_ID[spawn.enemyId]?.isBoss !== true) {
        ids.add(spawn.enemyId);
      }
    }
  }
  return [...ids];
}

function shuffled<T>(items: T[], rng: () => number): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Re-fills a chosen encounter's spawn slots from the floor's full per-row
 * roster instead of the fixed pair/trio baked into the table entry — the
 * table still decides pack *shape* (how many enemies, front/back split,
 * rarity of big packs), but not which specific sprites appear. Draws without
 * replacement per row until the pool is exhausted, then reshuffles, so a
 * single fight rarely repeats a sprite unless the row's pool is smaller than
 * its slot count. Keeps Arena from looping the same handful of fixed
 * formations forever — the dungeon's own `rollEncounter` is untouched and
 * still returns the exact curated formation.
 */
function reshuffleSpawns(
  floor: number,
  entry: EncounterEntry,
  rng: () => number
): EncounterEntry {
  const pools: Record<Row, string[]> = {
    front: rowPoolForFloor(floor, "front"),
    back: rowPoolForFloor(floor, "back"),
  };
  const draws: Record<Row, string[]> = { front: [], back: [] };

  const spawns = entry.spawns.map((spawn) => {
    const pool = pools[spawn.row];
    if (pool.length === 0) return spawn;
    if (draws[spawn.row].length === 0) {
      draws[spawn.row] = shuffled(pool, rng);
    }
    const enemyId = draws[spawn.row].pop()!;
    return { ...spawn, enemyId };
  });

  return { ...entry, spawns };
}

/**
 * Weighted Arena encounter pick.
 * - Drops boss formations (The Dead Boy etc.) — dungeon-only climax.
 * - Higher waves bias weight toward multi-enemy packs so L9+ Arena stays spicy
 *   even when locked to floor 3.
 * - Reshuffles the winning entry's spawns across the floor's full roster
 *   (see {@link reshuffleSpawns}) so repeated Arena waves show a wider mix of
 *   sprites than the handful of fixed formations in ENCOUNTER_TABLES alone.
 */
export function rollArenaEncounter(
  floor: number,
  wave = 1,
  rng: () => number = nondeterministicRng
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
    if (roll <= 0) return reshuffleSpawns(floor, entry, rng);
  }
  const fallback = weighted[weighted.length - 1]?.entry;
  return fallback ? reshuffleSpawns(floor, fallback, rng) : null;
}

/**
 * Arena's 4-person party — trim one spawn from packs of 3+ so enemy count
 * stays closer to party size (no save migration; Arena-only).
 */
export function adjustArenaEncounterForSmallParty(entry: EncounterEntry): EncounterEntry {
  if (entry.spawns.length < 3) return entry;
  return { ...entry, spawns: entry.spawns.slice(0, -1) };
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
 * Multiplies floor.encounterRate by the covering zone's rateMul (or returns
 * the floor rate when no zone covers the cell). A rateMul of 0 yields 0 here,
 * so the *flat* roll band after cooldown contributes nothing — but
 * {@link encounterRollChance} still forces a fight at the pity step even when
 * baseRate is 0. Safe pockets therefore delay fights; they do not suppress
 * pity. Campaign zones do not set tableFloorId; pack difficulty is per-floor.
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
