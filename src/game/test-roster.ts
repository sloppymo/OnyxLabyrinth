/**
 * Test-only combat roster.
 *
 * Some resolver tests need four independent formation slots to exercise
 * legacy combat geometry. This fixture is never used by the application or
 * by saves; a new campaign always comes from `createPlayableDuo()`.
 */

import { createCharacterRecord, type Character } from "./party";

const MAGE_TEST_SPELLS = [
  "mage-spark",
  "mage-ember",
  "mage-frostbite",
  "mage-poison-spray",
  "mage-fire-bolt",
  "mage-water-bolt",
  "mage-stone-shard",
  "mage-gust",
  "mage-arcane-ward",
  "mage-wayfinder",
  "mage-knock",
];

const PRIEST_TEST_SPELLS = [
  "priest-guiding-bolt",
  "priest-cure-wounds",
  "priest-sacred-flame",
  "priest-light",
  "priest-unseal",
  "priest-shield-of-faith",
];

/** Build the old four-slot fixture required by broad combat tests. */
export function createCombatTestRoster(): Character[] {
  const fighter = createCharacterRecord("c1", "Aria", "Human", "Good", "Fighter", 0);
  const thief = createCharacterRecord("c2", "Coda", "Hobbit", "Neutral", "Thief", 1);
  const mage = createCharacterRecord("c3", "Dell", "Elf", "Neutral", "Mage", 2);
  const priest = createCharacterRecord("c4", "Eve", "Gnome", "Good", "Priest", 3);
  mage.knownSpellIds = [...MAGE_TEST_SPELLS];
  priest.knownSpellIds = [...PRIEST_TEST_SPELLS];
  return [fighter, thief, mage, priest];
}
