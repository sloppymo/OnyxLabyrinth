/**
 * Equipment / loadout helpers. Pure functions over Character + Loadout — no
 * CombatState knowledge. Used by the town Equip screen, dungeon auto-equip,
 * party creation, and combat factory. Cursed-gear rules live here: cursed
 * items already in a slot can never be displaced (Remove Curse at the Temple).
 */

import type { Character } from "./party";
import type { Loadout } from "./combat-types";
import type { EquipSlot, ItemDef } from "../data/items";
import { ITEMS_BY_ID } from "../data/items";
import { canReach, effectiveWeaponRange } from "./combat-reach";

/** Build the starter loadout for a newly created character. */
export function defaultLoadoutForCharacter(char: Character): Loadout {
  const loadout: Loadout = { armor: [] };
  if (char.class === "Fighter") {
    loadout.weapon = ITEMS_BY_ID["short-sword"];
  } else if (char.class === "Thief") {
    loadout.weapon = ITEMS_BY_ID["dagger"];
  } else if (char.class === "Mage" || char.class === "Priest") {
    loadout.weapon = ITEMS_BY_ID["staff"];
  } else if (char.class === "Halberdier") {
    loadout.weapon = ITEMS_BY_ID["halberd"];
  } else if (char.class === "Duelist") {
    loadout.weapon = ITEMS_BY_ID["rapier"];
  } else if (char.class === "Crusader") {
    loadout.weapon = ITEMS_BY_ID["long-sword"];
  }
  if (
    char.formationSlot <= 2 ||
    char.class === "Halberdier" ||
    char.class === "Crusader"
  ) {
    const leather = ITEMS_BY_ID["leather"];
    if (leather) loadout.armor = [leather];
  }
  return loadout;
}

/** True if `weapon` can hit at least one enemy row from `holder`'s formation
 *  slot (accounting for reach-modifying perks, e.g. Sweep/Lunge). Non-weapons
 *  and weapons with no declared range are always considered reachable. */
export function weaponIsReachable(holder: Character, weapon: ItemDef): boolean {
  if (weapon.type !== "weapon" || !weapon.range) return true;
  const range = effectiveWeaponRange(holder, weapon.range);
  return canReach(holder.formationSlot, range, "front") || canReach(holder.formationSlot, range, "back");
}

/**
 * True if `candidate` is strictly better than `current` for its slot. A
 * weapon `holder` could never actually attack with (unreachable from their
 * formation row) is never "better," regardless of its raw attack bonus —
 * see the back-row-Mage-offered-a-Mace case this guards against.
 */
export function isBetterEquip(
  current: ItemDef | undefined,
  candidate: ItemDef,
  holder?: Character
): boolean {
  if (candidate.type === "consumable") return false;
  if (candidate.type === "weapon" && holder && !weaponIsReachable(holder, candidate)) return false;
  if (!current) return true;
  if (candidate.type === "weapon") {
    return (candidate.attackBonus ?? 0) > (current.attackBonus ?? 0);
  }
  return (candidate.defenseBonus ?? 0) > (current.defenseBonus ?? 0);
}

/** Return a new loadout with `item` equipped, replacing any same-slot gear only
 *  if the new item is better. Non-equipment items are ignored. Cursed gear
 *  already in the slot can never be replaced (Remove Curse at the Temple).
 *  `holder`, when passed, vetoes weapons the holder couldn't actually attack
 *  with from their formation row (see `isBetterEquip`). */
export function equipItem(loadout: Loadout, item: ItemDef, holder?: Character): Loadout {
  if (item.type === "consumable" || item.type === "trinket") return loadout;
  if (item.type === "weapon") {
    if (loadout.weapon?.cursed) return loadout;
    if (!isBetterEquip(loadout.weapon, item, holder)) return loadout;
    return { ...loadout, weapon: item };
  }
  const armor = loadout.armor ? [...loadout.armor] : [];
  if (item.slot) {
    const idx = armor.findIndex((a) => a.slot === item.slot);
    if (idx >= 0) {
      if (armor[idx].cursed) return loadout;
      if (!isBetterEquip(armor[idx], item, holder)) return loadout;
      armor[idx] = item;
      return { ...loadout, armor };
    }
  }
  armor.push(item);
  return { ...loadout, armor };
}

/**
 * Force `item` into its slot regardless of quality — the cursed-gear clamp.
 * Still refuses to displace other cursed gear (one curse per slot).
 * Returns null if the slot is curse-locked (the item stays in the pack).
 */
export function forceEquip(loadout: Loadout, item: ItemDef): Loadout | null {
  if (item.type === "consumable" || item.type === "trinket") return null;
  if (item.type === "weapon") {
    if (loadout.weapon?.cursed) return null;
    return { ...loadout, weapon: item };
  }
  const armor = loadout.armor ? [...loadout.armor] : [];
  if (item.slot) {
    const idx = armor.findIndex((a) => a.slot === item.slot);
    if (idx >= 0) {
      if (armor[idx].cursed) return null;
      armor[idx] = item;
      return { ...loadout, armor };
    }
  }
  armor.push(item);
  return { ...loadout, armor };
}

/**
 * Player-directed equip for the town Equip screen: swap `item` into its slot
 * unconditionally — downgrades and sidegrades are the player's call, unlike
 * `equipItem`'s strictly-better auto-equip rule. Returns the new loadout and
 * whatever the swap displaced, or null if the item isn't equippable or the
 * slot holds cursed gear (only the Temple's Remove Curse frees it).
 */
export function manualEquip(
  loadout: Loadout,
  item: ItemDef
): { loadout: Loadout; displaced?: ItemDef } | null {
  if (item.type === "consumable" || item.type === "trinket") return null;
  if (item.type === "weapon") {
    if (loadout.weapon?.cursed) return null;
    return { loadout: { ...loadout, weapon: item }, displaced: loadout.weapon };
  }
  if (!item.slot) return null;
  const armor = loadout.armor ? [...loadout.armor] : [];
  const idx = armor.findIndex((a) => a.slot === item.slot);
  if (idx >= 0) {
    if (armor[idx].cursed) return null;
    const displaced = armor[idx];
    armor[idx] = item;
    return { loadout: { ...loadout, armor }, displaced };
  }
  armor.push(item);
  return { loadout: { ...loadout, armor } };
}

/**
 * Player-directed unequip for the town Equip screen: empty a slot, returning
 * the removed item so the caller can put it back in the inventory. Returns
 * null if the slot is already empty or holds cursed gear.
 */
export function manualUnequip(
  loadout: Loadout,
  slot: EquipSlot
): { loadout: Loadout; removed: ItemDef } | null {
  if (slot === "hand") {
    if (!loadout.weapon || loadout.weapon.cursed) return null;
    return { loadout: { ...loadout, weapon: undefined }, removed: loadout.weapon };
  }
  const idx = loadout.armor.findIndex((a) => a.slot === slot);
  if (idx < 0 || loadout.armor[idx].cursed) return null;
  const armor = [...loadout.armor];
  const [removed] = armor.splice(idx, 1);
  return { loadout: { ...loadout, armor }, removed };
}

/** Pick the party member with the weakest item in the slot `item` occupies.
 *  For weapons, candidates who couldn't actually attack with `item` from
 *  their formation row are skipped entirely — a weapon nobody could use is
 *  never the "best" target, no matter how weak their current weapon is. */
export function findBestEquipTarget(
  party: Character[],
  equipment: Record<string, Loadout>,
  item: ItemDef
): string | undefined {
  if (item.type === "consumable") return undefined;
  let bestId: string | undefined;
  let bestScore = Infinity;
  for (const c of party) {
    const loadout = equipment[c.id];
    if (!loadout) continue;
    if (item.type === "weapon" && !weaponIsReachable(c, item)) continue;
    let score = 0;
    if (item.type === "weapon") {
      score = loadout.weapon?.attackBonus ?? 0;
    } else if (item.slot) {
      score = loadout.armor.find((a) => a.slot === item.slot)?.defenseBonus ?? 0;
    }
    if (score < bestScore) {
      bestId = c.id;
      bestScore = score;
    }
  }
  return bestId;
}

/**
 * Return the item that would be replaced when `equipItem(old, item)` changes
 * the loadout. Returns `undefined` if the slot was empty, the item is not
 * equipment, or `equipItem` would return the loadout unchanged.
 */
export function getDisplacedItem(
  old: Loadout,
  next: Loadout,
  item: ItemDef
): ItemDef | undefined {
  if (next === old) return undefined;
  if (item.type === "weapon") {
    return next.weapon !== old.weapon ? old.weapon : undefined;
  }
  if (item.slot) {
    const oldPiece = old.armor.find((a) => a.slot === item.slot);
    const newPiece = next.armor.find((a) => a.slot === item.slot);
    return oldPiece !== newPiece ? oldPiece : undefined;
  }
  return undefined;
}
