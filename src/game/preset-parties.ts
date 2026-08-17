/**
 * Pre-made starting parties for party creation.
 * Four archetypes with explicit strengths/weaknesses — not reskins of the same roster.
 */

import {
  createCharacter,
  type Alignment,
  type Character,
  type CharacterClass,
  type Race,
} from "./party";

export type PresetPartyId = "balanced" | "iron" | "glass" | "blades";

/** Presentation-only roles for the party-select composition strip. */
export type PartyRole = "tank" | "healer" | "physDps" | "magicDps" | "support" | "hybrid";

/**
 * Class → role for party-select comp-strip pips only.
 * Not used by combat math or balance.
 */
export const CLASS_ROLE: Record<CharacterClass, PartyRole> = {
  Fighter: "tank",
  Mage: "magicDps",
  Priest: "healer",
  Thief: "support",
  Halberdier: "physDps",
  Duelist: "physDps",
  Crusader: "hybrid",
  Ninja: "physDps",
};

/** Hand-authored 1–5 segment counts for the party-select ATK/DEF/SUP bars. */
export type PartyBarScore = 1 | 2 | 3 | 4 | 5;

export interface PresetMember {
  name: string;
  race: Race;
  alignment: Alignment;
  cls: CharacterClass;
  /** Formation slot 0–1 front, 2–3 back. */
  slot: number;
}

export interface PresetPartyDef {
  id: PresetPartyId;
  /** Menu label. */
  label: string;
  /** Short flavor quote under the stat bars (not a name list). */
  tagline: string;
  /** Short strength callout for the detail strip. */
  strength: string;
  /** Short weakness callout for the detail strip. */
  weakness: string;
  /** Hand-authored attack emphasis (1–5). */
  atk: PartyBarScore;
  /** Hand-authored defense emphasis (1–5). */
  def: PartyBarScore;
  /** Hand-authored support emphasis (1–5). */
  sup: PartyBarScore;
  members: readonly PresetMember[];
}

const MAGE_STARTERS = [
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
] as const;

const PRIEST_STARTERS = [
  "priest-guiding-bolt",
  "priest-cure-wounds",
  "priest-sacred-flame",
  "priest-light",
  "priest-unseal",
  "priest-shield-of-faith",
] as const;

function grantStarters(c: Character): void {
  if (c.class === "Mage") c.knownSpellIds = [...MAGE_STARTERS];
  else if (c.class === "Priest") c.knownSpellIds = [...PRIEST_STARTERS];
}

/**
 * 1 All Trades — classic crawler core (heal + mage + fighter + thief).
 * 2 Shield Wall — armored melee + priest; Unseal covers locks, no Mage.
 * 3 Glass Cannons — soft line, heavy spellcraft; dies if the front breaks.
 * 4 All Steel — physical / techniques only; no healing magic (Thief for locks).
 */
export const PRESET_PARTIES: readonly PresetPartyDef[] = [
  {
    id: "balanced",
    label: "All Trades",
    tagline: "Jack of all trades",
    strength: "Flexible — heal, burn, stab, and tank.",
    weakness: "No specialist edge; mediocre at everything.",
    atk: 3,
    def: 3,
    sup: 3,
    members: [
      { name: "Aria", race: "Human", alignment: "Good", cls: "Fighter", slot: 0 },
      { name: "Coda", race: "Hobbit", alignment: "Neutral", cls: "Thief", slot: 1 },
      { name: "Dell", race: "Elf", alignment: "Neutral", cls: "Mage", slot: 2 },
      { name: "Eve", race: "Gnome", alignment: "Good", cls: "Priest", slot: 3 },
    ],
  },
  {
    id: "iron",
    label: "Shield Wall",
    tagline: "Hold the line",
    strength: "Hard front line and steady divine healing.",
    weakness: "No Mage — thin elemental pressure (Unseal opens locks).",
    atk: 2,
    def: 5,
    sup: 3,
    members: [
      { name: "Bram", race: "Dwarf", alignment: "Good", cls: "Fighter", slot: 0 },
      { name: "Gareth", race: "Human", alignment: "Good", cls: "Crusader", slot: 1 },
      { name: "Helga", race: "Dwarf", alignment: "Neutral", cls: "Halberdier", slot: 2 },
      { name: "Mira", race: "Human", alignment: "Good", cls: "Priest", slot: 3 },
    ],
  },
  {
    id: "glass",
    label: "Glass Cannons",
    tagline: "Glass and lightning",
    strength: "Spellcraft and precision from a soft line.",
    weakness: "Fragile — if the front falls, the party dies.",
    atk: 5,
    def: 1,
    sup: 4,
    members: [
      { name: "Sable", race: "Elf", alignment: "Neutral", cls: "Duelist", slot: 0 },
      { name: "Wren", race: "Hobbit", alignment: "Neutral", cls: "Thief", slot: 1 },
      { name: "Nyx", race: "Elf", alignment: "Neutral", cls: "Mage", slot: 2 },
      { name: "Iris", race: "Gnome", alignment: "Good", cls: "Priest", slot: 3 },
    ],
  },
  {
    id: "blades",
    label: "All Steel",
    tagline: "Only steel",
    strength: "Raw steel and techniques — high kill speed.",
    weakness: "No healing magic; potions and camp only.",
    atk: 5,
    def: 3,
    sup: 1,
    members: [
      { name: "Rook", race: "Human", alignment: "Neutral", cls: "Fighter", slot: 0 },
      { name: "Pike", race: "Dwarf", alignment: "Neutral", cls: "Halberdier", slot: 1 },
      { name: "Shade", race: "Hobbit", alignment: "Neutral", cls: "Thief", slot: 2 },
      { name: "Voss", race: "Human", alignment: "Neutral", cls: "Duelist", slot: 3 },
    ],
  },
];

export function presetPartyById(id: PresetPartyId): PresetPartyDef {
  const def = PRESET_PARTIES.find((p) => p.id === id);
  if (!def) throw new Error(`Unknown preset party: ${id}`);
  return def;
}

/** Build a live Character[] from a preset (ids c1…c4, starter spells granted). */
export function createPresetParty(id: PresetPartyId): Character[] {
  const def = presetPartyById(id);
  return def.members.map((m, i) => {
    const c = createCharacter(`c${i + 1}`, m.name, m.race, m.alignment, m.cls, m.slot);
    grantStarters(c);
    return c;
  });
}

/** Balanced default — same as preset `"balanced"`. Kept name for call-site stability. */
export function createDefaultParty(): Character[] {
  return createPresetParty("balanced");
}
