/**
 * Leveling math and character level-up logic.
 *
 * Extracted from src/engine/town-ui.ts so post-combat level-ups in main.ts can
 * share the same rules as the (now read-only) Training Grounds screen.
 */

import type { Character } from "./party";
import { CLASSES } from "./party";
import type { Loadout } from "./combat-types";
import { maxContentSpellTier, spellsForClass } from "../data/spells";
import { effectiveStats } from "./effective-stats";
import {
  perksForCharacter,
  perkModifiers,
  isPerkTierLevel,
  tierForLevel,
  type PendingPerkChoice,
} from "./perks";

/**
 * XP required to advance past `level` (i.e. the cost of leaving `level`).
 * `xp` is spent on level-up (see `applyLevelUps`), so the *cumulative* cost
 * to reach a given level is triangular — see `cumulativeXpToReachLevel`.
 */
export function xpForNextLevel(level: number): number {
  return level * 120;
}

/** Total XP a character needs to have earned (and spent) to reach `level`
 *  from level 1, under the current curve. Used for save migration and for
 *  reasoning about pacing — not read on the level-up hot path itself. */
export function cumulativeXpToReachLevel(level: number): number {
  let total = 0;
  for (let lv = 1; lv < level; lv++) total += xpForNextLevel(lv);
  return total;
}

/**
 * Level up a character: increase level, recompute max HP/SP using effective
 * stats, apply HP/SP growth bonuses from chosen perks, fully restore HP/SP,
 * clear status, and grant new spells by tier.
 *
 * HP growth = floor((effectiveVIT * 2 + classHpBonus) * 0.5 * (1 + hpGrowthBonusPercent))
 * SP growth = floor(effectiveCastingStat * 0.5 * (1 + spGrowthBonusPercent)) for casters
 */
export function levelUpChar(c: Character, loadout?: Loadout): Character {
  const newLevel = c.level + 1;

  const effStats = effectiveStats(c, loadout, perksForCharacter(c));
  const mods = perkModifiers(perksForCharacter(c), effStats);
  const classDef = CLASSES[c.class];

  const hpGrowth = Math.floor(
    (effStats.vit * 2 + classDef.hpBonus) * 0.5 * (1 + (mods.hpGrowthBonusPercent ?? 0))
  );

  const spellClass = classDef.spellClass;
  let spGrowth = 0;
  if (spellClass === "Mage") {
    spGrowth = Math.floor(effStats.int * 0.5 * (1 + (mods.spGrowthBonusPercent ?? 0)));
  } else if (spellClass === "Priest") {
    spGrowth = Math.floor(effStats.pie * 0.5 * (1 + (mods.spGrowthBonusPercent ?? 0)));
  }

  const newMaxHp = c.maxHp + hpGrowth;
  const newMaxSp = c.maxSp + spGrowth;

  // Unlock formula opens a tier every 2 levels (ceil(level/2)), capped at the
  // highest tier that has real spell defs for this class (so empty T6/T7 never
  // silently inflate knownSpellIds again if content lags).
  const contentCap =
    spellClass === "Mage" || spellClass === "Priest"
      ? maxContentSpellTier(spellClass)
      : 0;
  const formulaTier = Math.min(7, Math.ceil(newLevel / 2));
  const newTier = Math.min(contentCap || formulaTier, formulaTier) as
    | 1
    | 2
    | 3
    | 4
    | 5
    | 6
    | 7;
  const knownSet = new Set(c.knownSpellIds);
  for (const s of spellsForClass(c.class, newTier)) knownSet.add(s.id);

  return {
    ...c,
    level: newLevel,
    maxHp: newMaxHp,
    maxSp: newMaxSp,
    hp: newMaxHp,
    sp: newMaxSp,
    status: [],
    knownSpellIds: [...knownSet],
  };
}

export interface LevelUpsResult {
  character: Character;
  /** Perk-tier choices crossed, in level order, ready to append to a queue. */
  tiersCrossed: PendingPerkChoice[];
}

/**
 * Apply every level-up a character's currently-banked `xp` covers, spending
 * each level's cost as it's crossed (so `xp` always reflects progress toward
 * the *next* level only, never a lifetime total) and collecting any perk-tier
 * choices crossed along the way. Pure — call sites own persisting the result.
 */
export function applyLevelUps(c: Character, loadout?: Loadout): LevelUpsResult {
  let char = c;
  const tiersCrossed: PendingPerkChoice[] = [];
  while (char.xp >= xpForNextLevel(char.level)) {
    const cost = xpForNextLevel(char.level);
    char = levelUpChar(char, loadout);
    char = { ...char, xp: Math.max(0, char.xp - cost) };
    if (isPerkTierLevel(char.level)) {
      tiersCrossed.push({ charId: char.id, tier: tierForLevel(char.level)! });
    }
  }
  return { character: char, tiersCrossed };
}
