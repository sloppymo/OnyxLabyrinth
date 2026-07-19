/**
 * Effective stats — the single source of truth for a character's final
 * attributes (class-perks design §4).
 *
 * effectiveStats() applies, in order:
 *   1. Base character.stats (rolled + racial modifiers, clamped at creation).
 *   2. Equipment statBonuses from the weapon and every armor piece.
 *   3. Permanent statModifiers from chosen perks.
 *
 * Bonuses are NOT clamped to the creation-time [3, 18] range — equipment and
 * perks may push a stat past 18. Each stat is floored at 1 so penalties can
 * never zero out a formula input. Nothing here is persisted: callers
 * recompute from base stats + loadout + perks every time.
 */

import type { Character, Stats } from "./party";
import type { Loadout } from "./combat-types";
import type { PerkDef } from "./perks";

const STAT_KEYS: (keyof Stats)[] = ["str", "int", "pie", "vit", "agi", "luk"];

function addPartial(into: Stats, mods: Partial<Stats> | undefined): void {
  if (!mods) return;
  for (const key of STAT_KEYS) {
    into[key] += mods[key] ?? 0;
  }
}

export function effectiveStats(
  character: Character,
  loadout?: Loadout,
  perks: PerkDef[] = []
): Stats {
  const out: Stats = { ...character.stats };

  if (loadout) {
    addPartial(out, loadout.weapon?.statBonuses);
    for (const piece of loadout.armor ?? []) {
      addPartial(out, piece.statBonuses);
    }
  }

  for (const perk of perks) {
    addPartial(out, perk.effect.statModifiers);
  }

  for (const key of STAT_KEYS) {
    out[key] = Math.max(1, out[key]);
  }
  return out;
}
