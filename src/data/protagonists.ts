/**
 * The two fixed campaign protagonists: the Old Man and the Rat King.
 *
 * The campaign party is always exactly these two characters, in this order.
 * Their `class` doubles as their player-facing identity label ("Old Man" /
 * "Rat King" in the CharacterClass union); `id` is the stable kebab-case id
 * shared with dialogue speakers, portraits (`public/assets/portraits/<id>/`),
 * bark profiles, and combat sprite directories (`public/assets/party/<id>/`).
 *
 * Voice/worldbuilding canon: docs/design/death-and-birth-worldbuilding.md.
 * Their spell kits live in src/data/spells.ts (OLD_MAN_SPELLS /
 * RAT_KING_SPELLS); their perks in src/data/perks.ts.
 */

import type { CharacterClass, ProtagonistId, Stats } from "../game/party";

export interface ProtagonistDef {
  id: ProtagonistId;
  /** Display name shown in party strips, combat windows, and dialogue. */
  name: string;
  /** Flavor title (matches the dialogue speaker cards). */
  title: string;
  /** Internal class — doubles as the identity label and keys SP math. */
  class: CharacterClass;
  /** Fixed base stats — protagonists are authored, never rolled. */
  stats: Stats;
  /** Formation slot (0-1 are the duo's front line). */
  formationSlot: number;
  /** Portrait id under public/assets/portraits/<id>/portrait.png. */
  portraitId: string;
  /** Sprite dir under public/assets/party/<dir>/ (see party-sprite-cache). */
  spriteDir: string;
  /** Starting weapon item id (see combat-equipment defaultLoadoutForCharacter). */
  startingWeaponId: string;
  /** Innate identity perks granted at creation (never offered as choices). */
  innatePerkIds: string[];
}

export const PROTAGONISTS: readonly ProtagonistDef[] = [
  {
    id: "old-man",
    name: "The Old Man",
    title: "DEATH'S PILGRIM",
    class: "Old Man",
    // Ancient, certain, slow. High INT (his craft), sturdy VIT (he has
    // endured everything), poor AGI (he does not hurry).
    stats: { str: 8, int: 16, pie: 12, vit: 12, agi: 7, luk: 9 },
    formationSlot: 0,
    portraitId: "old-man",
    spriteDir: "old-man",
    startingWeaponId: "staff",
    innatePerkIds: ["old-man-not-yet"],
  },
  {
    id: "rat-king",
    name: "The Rat King",
    title: "SOVEREIGN OF VERMIN",
    class: "Rat King",
    // Quick, lucky, well-fed. High PIE (royal vitality feeding his court),
    // good AGI/LUK (a rat survives), modest INT (cunning, not scholarship).
    stats: { str: 10, int: 11, pie: 15, vit: 13, agi: 14, luk: 14 },
    formationSlot: 1,
    portraitId: "rat-king",
    spriteDir: "rat-king",
    startingWeaponId: "dagger",
    innatePerkIds: ["rat-king-court-provides"],
  },
];

export const PROTAGONISTS_BY_ID: Record<ProtagonistId, ProtagonistDef> = {
  "old-man": PROTAGONISTS[0]!,
  "rat-king": PROTAGONISTS[1]!,
};

export function protagonistById(id: ProtagonistId): ProtagonistDef {
  return PROTAGONISTS_BY_ID[id];
}
