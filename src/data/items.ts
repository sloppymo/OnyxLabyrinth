/**
 * Item data: weapons, armor, and consumables.
 *
 * Equipment uses +0/+1/+2 enhancement tiers with linear, affordable prices.
 * Combat.ts can read attack/defense bonuses off ItemDef without special-casing.
 */

import type { Stats } from "../game/party";

export type ItemType = "weapon" | "armor" | "consumable" | "trinket";
export type EquipSlot = "hand" | "body" | "shield" | "head";

export type ItemEffect =
  | { kind: "heal"; power: number }
  | { kind: "cure"; status: "poison" }
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
  /** Purchase price in gold. Sale price is typically half. */
  price: number;
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
  range: "close" | "short" | "medium" | "long"
): ItemDef[] {
  const basePrice = tier * 100;
  return [0, 1, 2].map((plus) => ({
    id: `${baseId}${plus === 0 ? "" : `+${plus}`}`,
    name: `${baseName}${plus === 0 ? "" : ` +${plus}`}`,
    type: "weapon",
    slot: "hand",
    attackBonus: attack + plus,
    range,
    price: basePrice * (1 + plus),
    dropFloorTier: tier,
  }));
}

function armor(
  baseId: string,
  baseName: string,
  tier: number,
  slot: EquipSlot,
  defense: number
): ItemDef[] {
  const basePrice = tier * 80;
  return [0, 1, 2].map((plus) => ({
    id: `${baseId}${plus === 0 ? "" : `+${plus}`}`,
    name: `${baseName}${plus === 0 ? "" : ` +${plus}`}`,
    type: "armor",
    slot,
    defenseBonus: defense + plus,
    price: basePrice * (1 + plus),
    dropFloorTier: tier,
  }));
}

// Weapons
export const DAGGERS = weapon("dagger", "Dagger", 1, 2, "short");
export const SHORT_SWORDS = weapon("short-sword", "Short Sword", 1, 3, "short");
export const RAPIERS = weapon("rapier", "Rapier", 1, 3, "short");
export const MACES = weapon("mace", "Mace", 2, 4, "close");
export const LONG_SWORDS = weapon("long-sword", "Long Sword", 2, 5, "medium");
export const GREAT_SWORDS = weapon("great-sword", "Great Sword", 3, 7, "close");
export const STAFFS = weapon("staff", "Staff", 1, 2, "medium");
export const BOWS = weapon("bow", "Bow", 1, 3, "long");
export const HALBERDS = weapon("halberd", "Halberd", 1, 3, "medium");

// Armor
export const ROBES = armor("robe", "Robe", 1, "body", 1);
export const LEATHER_ARMORS = armor("leather", "Leather Armor", 1, "body", 2);
export const CHAIN_MAILS = armor("chain-mail", "Chain Mail", 2, "body", 4);
export const PLATE_MAILS = armor("plate-mail", "Plate Mail", 3, "body", 6);
export const SHIELDS = armor("shield", "Shield", 1, "shield", 2);
export const HELMS = armor("helm", "Helm", 2, "head", 1);

// Consumables
export const HEALING_POTION: ItemDef = {
  id: "healing-potion",
  name: "Healing Potion",
  type: "consumable",
  effect: { kind: "heal", power: 30 },
  price: 25,
};

export const ANTIDOTE: ItemDef = {
  id: "antidote",
  name: "Antidote",
  type: "consumable",
  effect: { kind: "cure", status: "poison" },
  price: 20,
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
];

export const ALL_ARMOR: ItemDef[] = [
  ...ROBES,
  ...LEATHER_ARMORS,
  ...CHAIN_MAILS,
  ...PLATE_MAILS,
  ...SHIELDS,
  ...HELMS,
];

export const ALL_CONSUMABLES: ItemDef[] = [HEALING_POTION, ANTIDOTE];

// Trinkets: carried (not equipped, not usable in combat) — their presence in
// the inventory grants a passive effect. Checked by game logic directly.
export const RING_OF_WATER_WALKING: ItemDef = {
  id: "ring-of-water-walking",
  name: "Ring of Water Walking",
  type: "trinket",
  price: 500,
};

export const HOLY_SYMBOL: ItemDef = {
  id: "holy-symbol",
  name: "Rusted Holy Symbol",
  type: "trinket",
  price: 0,
};

export const ALL_TRINKETS: ItemDef[] = [RING_OF_WATER_WALKING, HOLY_SYMBOL];

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
};

export const CURSED_HELM: ItemDef = {
  id: "cursed-helm",
  name: "Helm of Whispers",
  type: "armor",
  slot: "head",
  defenseBonus: -2,
  price: 5,
  cursed: true,
};

export const ALL_CURSED: ItemDef[] = [CURSED_BLADE, CURSED_HELM];

export const ALL_ITEMS: ItemDef[] = [
  ...ALL_WEAPONS,
  ...ALL_ARMOR,
  ...ALL_CONSUMABLES,
  ...ALL_TRINKETS,
  ...ALL_CURSED,
];

export const ITEMS_BY_ID: Record<string, ItemDef> = Object.fromEntries(
  ALL_ITEMS.map((item) => [item.id, item])
);

/** Items appropriate as random drops on a given floor. */
export function dropsForFloor(floor: number): ItemDef[] {
  return ALL_ITEMS.filter(
    (item) => item.type !== "consumable" && item.dropFloorTier === floor
  );
}

/** Shop inventory: equipment up to +2, consumables. */
export function shopInventory(): ItemDef[] {
  return ALL_ITEMS;
}
