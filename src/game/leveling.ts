/**
 * Leveling math and character level-up logic.
 *
 * Extracted from src/engine/town-ui.ts so post-combat level-ups in main.ts can
 * share the same rules as the (now read-only) Training Grounds screen.
 */

import type { Character } from "./party";
import { CLASSES } from "./party";
import type { Loadout } from "./combat";
import { maxContentSpellTier, spellsForClass } from "../data/spells";
import { effectiveStats } from "./effective-stats";
import { perksForCharacter, perkModifiers } from "./perks";

/**
 * XP required to reach the next level.
 *
 * The base curve (`level * 20`) was tuned assuming XP was split six ways
 * across the party. `main.ts` `endCombat` now gives every living member the
 * full encounter XP ("no 6-way split") without the curve being adjusted to
 * compensate, which let a party blow through all 12 levels in ~7-8 fights.
 * The ×6 multiplier restores the originally-intended pacing (~5-8 Floor 1
 * fights to level 2) under the new full-XP-per-member rule.
 */
export function xpForNextLevel(level: number): number {
  return level * 120;
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
