/**
 * The two protagonists used by the current game.
 *
 * This is deliberately a fixed roster.  The campaign still uses the
 * historical Character shape internally because combat, equipment, and save
 * migration share that data model, but there is no player-facing party
 * builder, preset selector, or roster replacement path.
 */

import { spellsForClass } from "../data/spells";
import {
  computeMaxHp,
  computeMaxSp,
  createCharacterRecord,
  type Character,
} from "./party";

export const PLAYABLE_DUO_IDS = ["old-man", "rat-king"] as const;
export type PlayableDuoId = (typeof PLAYABLE_DUO_IDS)[number];

/** Build the fixed Old Man + Rat King starting roster for a new campaign. */
export function createPlayableDuo(): Character[] {
  const oldMan = createCharacterRecord("old-man", "Old Man", "Human", "Neutral", "Mage", 1);
  // The Old Man carries the campaign's utility rites as well as his arcane
  // book. They are foundational exploration verbs, not a character-choice
  // branch (Light and Unseal are historically Priest spells).
  oldMan.knownSpellIds = [
    ...spellsForClass("Mage", 1).map((spell) => spell.id),
    "priest-light",
    "priest-unseal",
  ];

  const ratKing = createCharacterRecord("rat-king", "Rat King", "Hobbit", "Evil", "Thief", 0);

  return [oldMan, ratKing];
}

/** True when a roster is already the current fixed protagonist pair. */
export function isPlayableDuo(party: readonly Character[]): boolean {
  return (
    party.length === PLAYABLE_DUO_IDS.length &&
    PLAYABLE_DUO_IDS.every((id) => party.some((character) => character.id === id))
  );
}

export interface LoadedDuo {
  party: Character[];
  /** Original ids used to re-key per-character save data such as equipment. */
  sourceIdByDuoId: Record<PlayableDuoId, string | undefined>;
}

function legacyCharacterFor(
  party: readonly Character[],
  predicate: (character: Character) => boolean,
  excluded?: Character
): Character | undefined {
  return party.find((character) => character !== excluded && predicate(character));
}

function remapCharacter(
  source: Character,
  id: PlayableDuoId,
  name: string,
  race: Character["race"],
  alignment: Character["alignment"],
  cls: Character["class"],
  formationSlot: number
): Character {
  const stats = { ...source.stats };
  const maxHp = computeMaxHp(stats, cls);
  const maxSp = computeMaxSp(stats, cls);
  const level = Math.max(1, source.level);
  const maxTier = Math.max(1, Math.min(7, level)) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
  const knownSpellIds =
    id === "old-man"
      ? Array.from(
          new Set([
            ...(source.class === "Mage"
              ? source.knownSpellIds
              : spellsForClass("Mage", maxTier).map((spell) => spell.id)),
            "priest-light",
            "priest-unseal",
          ])
        )
      : [];

  return {
    ...source,
    id,
    name,
    race,
    alignment,
    class: cls,
    level,
    xp: Math.max(0, source.xp),
    stats,
    hp: Math.min(maxHp, Math.max(0, source.hp)),
    sp: Math.min(maxSp, Math.max(0, source.sp)),
    maxHp,
    maxSp,
    formationSlot,
    status: [...source.status],
    knownSpellIds,
    // Perks are class-specific. Preserve them only when the old character
    // already occupied the same class in the fixed duo.
    perkIds: source.class === cls ? [...source.perkIds] : [],
  };
}

/**
 * Convert a pre-duo save into the current fixed protagonists.
 *
 * Existing Mage/Thief progress is preserved where possible. If a legacy
 * roster did not contain one of those classes, the missing protagonist uses
 * the fresh fixed-duo starter. The returned source-id map lets save loading
 * carry equipment and other per-character progress across the identity swap.
 */
export function normalizeLoadedDuo(party: readonly Character[]): LoadedDuo | null {
  if (isPlayableDuo(party)) {
    const current = [...party];
    return {
      party: current,
      sourceIdByDuoId: {
        "old-man": current.find((character) => character.id === "old-man")?.id,
        "rat-king": current.find((character) => character.id === "rat-king")?.id,
      },
    };
  }

  const fallback = createPlayableDuo();
  const oldManSource =
    legacyCharacterFor(party, (character) => character.class === "Mage") ??
    legacyCharacterFor(party, (character) => character.class === "Priest") ??
    party[0];
  const ratKingSource =
    legacyCharacterFor(party, (character) => character.class === "Thief", oldManSource) ??
    legacyCharacterFor(
      party,
      (character) => character.class !== "Mage" && character.class !== "Priest",
      oldManSource
    ) ??
    party.find((character) => character !== oldManSource);

  const oldMan = oldManSource
    ? remapCharacter(oldManSource, "old-man", "Old Man", "Human", "Neutral", "Mage", 1)
    : fallback[0]!;
  const ratKing = ratKingSource
    ? remapCharacter(ratKingSource, "rat-king", "Rat King", "Hobbit", "Evil", "Thief", 0)
    : fallback[1]!;

  return {
    party: [oldMan, ratKing],
    sourceIdByDuoId: {
      "old-man": oldManSource?.id,
      "rat-king": ratKingSource?.id,
    },
  };
}
