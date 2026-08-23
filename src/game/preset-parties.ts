/**
 * The fixed campaign party: the Old Man and the Rat King.
 *
 * The old create-your-own-party presets are gone — the campaign always plays
 * these two authored protagonists (see src/data/protagonists.ts). This module
 * keeps its historical name because `createDefaultParty` is re-exported from
 * party.ts and consumed by state.ts, main.ts, and many tests.
 */

import type { Character } from "./party";
import { computeMaxHp, computeMaxSp } from "./party";
import { PROTAGONISTS, type ProtagonistDef } from "../data/protagonists";
import { spellsForClass } from "../data/spells";

/** Build one protagonist as a level-1 Character with authored (fixed) stats. */
export function createProtagonistCharacter(def: ProtagonistDef): Character {
  const stats = { ...def.stats };
  const maxHp = computeMaxHp(stats, def.class);
  const maxSp = computeMaxSp(stats, def.class);
  return {
    id: def.id,
    name: def.name,
    // Race/alignment are legacy fields kept for engine compatibility; they
    // carry no player-facing meaning for the protagonists.
    race: "Human",
    alignment: "Neutral",
    class: def.class,
    level: 1,
    xp: 0,
    stats,
    hp: maxHp,
    sp: maxSp,
    maxHp,
    maxSp,
    formationSlot: def.formationSlot,
    status: [],
    knownSpellIds: spellsForClass(def.class, 1).map((s) => s.id),
    perkIds: [...def.innatePerkIds],
    protagonistId: def.id,
  };
}

/**
 * The fixed two-protagonist party, in deterministic order:
 * the Old Man (slot 0), then the Rat King (slot 1).
 */
export function createDefaultParty(): Character[] {
  return PROTAGONISTS.map((def) => createProtagonistCharacter(def));
}
