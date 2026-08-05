/**
 * Item data: weapons, armor, and consumables.
 *
 * Equipment uses +0 through +4 enhancement tiers. +0/+1/+2 stay linear and
 * affordable (shop-gated only by dropFloorTier, same as before); +3/+4 carry
 * a ruinous shopBuyPrice() markup (5x/15x) on top of the linear price,
 * turning them into an aspirational late-game gold sink rather than a
 * realistic single-playthrough purchase — the campaign's own gold income
 * can't reach them, but Arena mode's repeatable fights can.
 * Combat.ts can read attack/defense bonuses off ItemDef without special-casing.
 */

import type { Stats } from "../game/party";

export type ItemType = "weapon" | "armor" | "consumable" | "trinket";
export type EquipSlot = "hand" | "body" | "shield" | "head";

export type ItemEffect =
  | { kind: "heal"; power: number }
  | { kind: "cure"; status: "poison" | "blind" | "paralysis" | "sleep" }
  | { kind: "revive"; power: number };

export interface ItemDef {
  id: string;
  name: string;
  type: ItemType;
  slot?: EquipSlot;
  /** Bonus added to physical attack damage. */
  attackBonus?: number;
  /** Bonus subtracted from physical damage taken. */
  defenseBonus?: number;
  /** Small attribute modifiers (e.g. +1 AGI boots). */
  statBonuses?: Partial<Stats>;
  /** For consumables. */
  effect?: ItemEffect;
  /** Weapon range for melee targeting (Wizardry V system). */
  range?: "close" | "short" | "medium" | "long";
  /** Purchase price in gold. Sale price is typically half. Linear price for
   *  +0..+4 enhancement lines — see shopBuyPrice() for the +3/+4 markup
   *  actually charged at the shop. */
  price: number;
  /** Enhancement tier (1-4) for a +N weapon/armor line. Undefined for the
   *  base (+0) item and for items with no enhancement line at all (uniques,
   *  cursed gear, consumables, trinkets). */
  plus?: number;
  /** Flavor text for the equip panel. Falls back to a short procedural
   *  description (equipItemFlavor()) when absent. */
  description?: string;
  /** Floor tier that drops this item (or tier-appropriate versions). */
  dropFloorTier?: number;
  /**
   * Cursed gear clamps onto whoever picks it up (ignoring whether it's an
   * upgrade), can't be unequipped or sold, and is lifted only by the
   * Temple's Remove Curse service (which destroys the item).
   */
  cursed?: boolean;
}

/** Generic display name for an unidentified item. */
export function displayNameFor(item: ItemDef, identified: boolean): string {
  if (identified || item.type === "consumable") return item.name;
  if (item.type === "weapon") return "Unknown Weapon";
  if (item.type === "armor") return "Unknown Armor";
  return "Unknown Trinket";
}

function weapon(
  baseId: string,
  baseName: string,
  tier: number,
  attack: number,
  range: "close" | "short" | "medium" | "long",
  description: string
): ItemDef[] {
  const basePrice = tier * 100;
  return [0, 1, 2, 3, 4].map((plus) => ({
    id: `${baseId}${plus === 0 ? "" : `+${plus}`}`,
    name: `${baseName}${plus === 0 ? "" : ` +${plus}`}`,
    type: "weapon",
    slot: "hand",
    attackBonus: attack + plus,
    range,
    price: basePrice * (1 + plus),
    dropFloorTier: tier,
    plus: plus === 0 ? undefined : plus,
    description,
  }));
}

function armor(
  baseId: string,
  baseName: string,
  tier: number,
  slot: EquipSlot,
  defense: number,
  description: string
): ItemDef[] {
  const basePrice = tier * 80;
  return [0, 1, 2, 3, 4].map((plus) => ({
    id: `${baseId}${plus === 0 ? "" : `+${plus}`}`,
    name: `${baseName}${plus === 0 ? "" : ` +${plus}`}`,
    type: "armor",
    slot,
    defenseBonus: defense + plus,
    price: basePrice * (1 + plus),
    dropFloorTier: tier,
    plus: plus === 0 ? undefined : plus,
    description,
  }));
}

/**
 * Shop buy price: linear through +2, then a ruinous markup at +3/+4 (5x,
 * 15x) so the top enhancement tiers read as an aspirational gold sink
 * rather than a normal-playthrough purchase. Sell/trade-in values stay at
 * the plain `price` field — only the shop's buy side applies the markup.
 */
export function shopBuyPrice(item: ItemDef): number {
  if (item.plus === 4) return item.price * 15;
  if (item.plus === 3) return item.price * 5;
  return item.price;
}

// Weapons
export const DAGGERS = weapon("dagger", "Dagger", 1, 2, "short",
  "A slim, quick blade favored by those who'd rather not be seen swinging it.");
export const SHORT_SWORDS = weapon("short-sword", "Short Sword", 1, 3, "short",
  "A gladius-pattern arming sword: short, quick, and merciless in a tight corridor.");
export const RAPIERS = weapon("rapier", "Rapier", 1, 3, "short",
  "A needle-thin thrusting blade that rewards precision over brute force.");
export const MACES = weapon("mace", "Mace", 2, 4, "close",
  "A blunt iron head on a worn haft — armor doesn't care how sharp you aren't.");
export const LONG_SWORDS = weapon("long-sword", "Long Sword", 2, 5, "medium",
  "A double-edged blade of honest length, balanced for cut and thrust alike.");
export const GREAT_SWORDS = weapon("great-sword", "Great Sword", 3, 7, "close",
  "A two-handed slab of steel that ends fights before they properly start.");
export const STAFFS = weapon("staff", "Staff", 1, 2, "medium",
  "A gnarled length of dense wood, channeling focus as readily as it strikes.");
export const BOWS = weapon("bow", "Bow", 1, 3, "long",
  "A recurve hunting bow, restrung and re-fletched for labyrinth work.");
export const HALBERDS = weapon("halberd", "Halberd", 1, 3, "medium",
  "A polearm crowned with axe, spike, and hook — reach with options.");
// Floor 4-5 top-tier weapons — the Great Sword line (tier 3) was previously
// the campaign's ceiling, so floors 4-5 could only re-drop the same +2 gear
// floor 3's boss chest already gives. These give the new floors their own loot.
export const RUNEBLADES = weapon("runeblade", "Runeblade", 4, 9, "close",
  "A sword etched with cooling runes, humming faintly against the dark.");
export const VOIDBLADES = weapon("voidblade", "Voidblade", 5, 11, "close",
  "A blade that seems to drink the light around its edge; it never quite warms.");

// Armor
export const ROBES = armor("robe", "Robe", 1, "body", 1,
  "Layered cloth meant for spellwork, not swordplay — it won't stop much.");
export const LEATHER_ARMORS = armor("leather", "Leather Armor", 1, "body", 2,
  "Boiled leather, stiff enough to turn a glancing blow.");
export const CHAIN_MAILS = armor("chain-mail", "Chain Mail", 2, "body", 4,
  "Interlocking iron rings, heavy on the shoulders and lighter on the conscience.");
export const PLATE_MAILS = armor("plate-mail", "Plate Mail", 3, "body", 6,
  "Full steel plate, hammered to a fighter's frame — slow, but nearly unkillable.");
export const SHIELDS = armor("shield", "Shield", 1, "shield", 2,
  "A round iron-bossed shield, scarred from turning blows meant for someone's skull.");
export const HELMS = armor("helm", "Helm", 2, "head", 1,
  "A close-fitting steel helm, dented in places that used to be someone's forehead.");
// Floor 4-5 top-tier armor (see RUNEBLADES/VOIDBLADES above).
export const MYTHRIL_PLATES = armor("mythril-plate", "Mythril Plate", 4, "body", 8,
  "Featherlight plate of true mythril, cold to the touch and colder to cut through.");
export const DRAGONSCALE_MAILS = armor("dragonscale-mail", "Dragonscale Mail", 5, "body", 10,
  "Armor forged from actual dragon scale — rare, dreadful, and very hard to pierce.");

// Named accessories with real statBonuses — the equipment layer in
// effectiveStats() (base + equipment.statBonuses + perk.statModifiers) had
// no item exercising the statBonuses field until these, so gear choice was
// a single scalar (attack or defense) with no stat-tradeoff decisions.
export const SAGES_CIRCLET: ItemDef = {
  id: "sages-circlet",
  name: "Sage's Circlet",
  type: "armor",
  slot: "head",
  defenseBonus: 2,
  statBonuses: { int: 1, pie: 1 },
  price: 300,
  dropFloorTier: 4,
  description: "A thin silver circlet inscribed with old scholar's wards, sharpening mind and spirit alike.",
};

export const FOCUS_WARD: ItemDef = {
  id: "focus-ward",
  name: "Focus Ward",
  type: "armor",
  slot: "shield",
  defenseBonus: 3,
  statBonuses: { luk: 1, agi: 1 },
  price: 320,
  dropFloorTier: 5,
  description: "A palm-sized warding disc that steadies the hand as much as it deflects the blow.",
};

// Consumables
export const HEALING_POTION: ItemDef = {
  id: "healing-potion",
  name: "Healing Potion",
  type: "consumable",
  effect: { kind: "heal", power: 30 },
  price: 25,
  description: "A bitter red tonic that knits flesh faster than it should be possible to explain.",
};

export const ANTIDOTE: ItemDef = {
  id: "antidote",
  name: "Antidote",
  type: "consumable",
  effect: { kind: "cure", status: "poison" },
  price: 20,
  description: "A sharp herbal draught that burns going down and clears the venom going out.",
};

export const EYE_DROPS: ItemDef = {
  id: "eye-drops",
  name: "Eye Drops",
  type: "consumable",
  effect: { kind: "cure", status: "blind" },
  price: 30,
  description: "Cool saline drops that flush the grit and darkness out of a blinded eye.",
};

export const SMELLING_SALTS: ItemDef = {
  id: "smelling-salts",
  name: "Smelling Salts",
  type: "consumable",
  effect: { kind: "cure", status: "paralysis" },
  price: 40,
  description: "A stinging vial of ammonia salts, sharp enough to shock a paralyzed body back into motion.",
};

export const GREATER_HEALING_POTION: ItemDef = {
  id: "greater-healing-potion",
  name: "Greater Healing Potion",
  type: "consumable",
  effect: { kind: "heal", power: 75 },
  price: 60,
  description: "A denser, costlier cousin of the standard potion — the same bitterness, twice the mending.",
};

export const PHOENIX_FEATHER: ItemDef = {
  id: "phoenix-feather",
  name: "Phoenix Feather",
  type: "consumable",
  effect: { kind: "revive", power: 25 }, // percent of max HP
  price: 150,
  description: "A single warm feather that, burned over the fallen, coaxes breath back into the body.",
};

export const ALL_WEAPONS: ItemDef[] = [
  ...DAGGERS,
  ...SHORT_SWORDS,
  ...RAPIERS,
  ...MACES,
  ...LONG_SWORDS,
  ...GREAT_SWORDS,
  ...STAFFS,
  ...BOWS,
  ...HALBERDS,
  ...RUNEBLADES,
  ...VOIDBLADES,
];

export const ALL_ARMOR: ItemDef[] = [
  ...ROBES,
  ...LEATHER_ARMORS,
  ...CHAIN_MAILS,
  ...PLATE_MAILS,
  ...SHIELDS,
  ...HELMS,
  ...MYTHRIL_PLATES,
  ...DRAGONSCALE_MAILS,
  SAGES_CIRCLET,
  FOCUS_WARD,
];

export const ALL_CONSUMABLES: ItemDef[] = [
  HEALING_POTION,
  ANTIDOTE,
  EYE_DROPS,
  SMELLING_SALTS,
  GREATER_HEALING_POTION,
  PHOENIX_FEATHER,
];

// Casino-exclusive gear from The Crooked Crown (Floor 1). Side-grades, not
// campaign-breaking — deliberately weaker than the shop's +2/+3 lines.
export const CARD_SHARP_GLOVES: ItemDef = {
  id: "card-sharp-gloves",
  name: "Cardsharp's Gloves",
  type: "armor",
  slot: "hand",
  attackBonus: 1,
  statBonuses: { agi: 1, luk: 1 },
  price: 150,
  dropFloorTier: 1,
  description: "Thin calfskin gloves that let a blade or a card slip exactly where it is meant to.",
};

export const HOUSE_EDGE: ItemDef = {
  id: "house-edge",
  name: "House Edge",
  type: "weapon",
  slot: "hand",
  attackBonus: 3,
  statBonuses: { agi: 1, str: -1 },
  range: "close",
  price: 160,
  dropFloorTier: 1,
  description: "A dagger that favors the bold and punishes the hesitant — just like its former owner.",
};

export const LOADED_BUCKLER: ItemDef = {
  id: "loaded-buckler",
  name: "Loaded Buckler",
  type: "armor",
  slot: "shield",
  defenseBonus: 2,
  statBonuses: { luk: 1 },
  price: 140,
  dropFloorTier: 1,
  description: "A small shield with a hidden weight in the rim. It lands heavier than it looks.",
};

export const CROOKED_CROWN: ItemDef = {
  id: "crooked-crown",
  name: "Crooked Crown",
  type: "armor",
  slot: "head",
  defenseBonus: 1,
  statBonuses: { int: 1, pie: 1, vit: -1 },
  price: 300,
  dropFloorTier: 2,
  description: "A bent coronet that sharpens the mind but saps the body. The house never takes it off.",
};

export const LAST_COIN: ItemDef = {
  id: "last-coin",
  name: "Last Coin",
  type: "consumable",
  effect: { kind: "heal", power: 50 },
  price: 80,
  description: "A stamped slug of copper, warm from someone's last pocket. It buys one more step.",
};

// Trinkets: carried (not equipped, not usable in combat) — their presence in
// the inventory grants a passive effect. Checked by game logic directly.
export const RING_OF_WATER_WALKING: ItemDef = {
  id: "ring-of-water-walking",
  name: "Ring of Water Walking",
  type: "trinket",
  price: 500,
  description: "A plain band engraved with rippling waves; wearers cross drowned floors dry-footed.",
};

export const HOLY_SYMBOL: ItemDef = {
  id: "holy-symbol",
  name: "Rusted Holy Symbol",
  type: "trinket",
  price: 0,
  description: "A corroded temple pendant, its saint worn featureless by centuries underground.",
};

export const WARDEN_SPHERE: ItemDef = {
  id: "warden-sphere",
  name: "Warden Sphere",
  type: "trinket",
  price: 0,
  description: "A smooth stone orb, faintly warm, humming with a watchfulness that isn't yours.",
};

export const GATE_TOKEN: ItemDef = {
  id: "gate-token",
  name: "Gate Token",
  type: "trinket",
  price: 0,
  description: "A coin-sized disc stamped with a sigil no living cartographer recognizes.",
};

export const ALL_TRINKETS: ItemDef[] = [
  RING_OF_WATER_WALKING,
  HOLY_SYMBOL,
  WARDEN_SPHERE,
  GATE_TOKEN,
];

// Cursed gear — masquerades as chest loot, clamps on when picked up.
export const CURSED_BLADE: ItemDef = {
  id: "cursed-blade",
  name: "Bloodthirsty Blade",
  type: "weapon",
  slot: "hand",
  attackBonus: -2,
  range: "close",
  price: 5,
  cursed: true,
  description: "A blade that fits the hand too well and refuses, absolutely, to be set back down.",
};

export const CURSED_HELM: ItemDef = {
  id: "cursed-helm",
  name: "Helm of Whispers",
  type: "armor",
  slot: "head",
  defenseBonus: -2,
  price: 5,
  cursed: true,
  description: "A helm that murmurs just below hearing — and clamps tight the moment it's worn.",
};

export const ALL_CURSED: ItemDef[] = [CURSED_BLADE, CURSED_HELM];

export const ALL_ITEMS: ItemDef[] = [
  ...ALL_WEAPONS,
  ...ALL_ARMOR,
  ...ALL_CONSUMABLES,
  ...ALL_TRINKETS,
  ...ALL_CURSED,
  CARD_SHARP_GLOVES,
  HOUSE_EDGE,
  LOADED_BUCKLER,
  CROOKED_CROWN,
  LAST_COIN,
];

const CASINO_ITEMS: Record<string, ItemDef> = {
  "card-sharp-gloves": CARD_SHARP_GLOVES,
  "house-edge": HOUSE_EDGE,
  "loaded-buckler": LOADED_BUCKLER,
  "crooked-crown": CROOKED_CROWN,
  "last-coin": LAST_COIN,
};

export const ITEMS_BY_ID: Record<string, ItemDef> = {
  ...Object.fromEntries(ALL_ITEMS.map((item) => [item.id, item])),
  ...CASINO_ITEMS,
};

/** Items appropriate as random drops on a given floor. */
export function dropsForFloor(floor: number): ItemDef[] {
  return ALL_ITEMS.filter(
    (item) => item.type !== "consumable" && item.dropFloorTier === floor
  );
}

/** Every item def, unfiltered — town-ui.ts's getShopBuyList() applies the
 *  real dropFloorTier/cursed/trinket filtering for actual shop stock. */
export function shopInventory(): ItemDef[] {
  return ALL_ITEMS;
}
