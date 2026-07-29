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
  /** One-line pitch under the label. */
  tagline: string;
  /** Short strength callout for the choice blurb. */
  strength: string;
  /** Short weakness callout for the choice blurb. */
  weakness: string;
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
    tagline: "Aria · Coda · Dell · Eve",
    strength: "Flexible — heal, burn, stab, and tank.",
    weakness: "No specialist edge; mediocre at everything.",
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
    tagline: "Bram · Gareth · Helga · Mira",
    strength: "Hard front line and steady divine healing.",
    weakness: "No Mage — thin on elemental pressure (Unseal opens locks).",
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
    tagline: "Sable · Wren · Nyx · Iris",
    strength: "Spellcraft and precision from a soft line.",
    weakness: "Fragile — if the front falls, the party dies.",
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
    tagline: "Rook · Pike · Shade · Voss",
    strength: "Raw steel and techniques — high kill speed.",
    weakness: "No healing magic; potions and camp only.",
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
