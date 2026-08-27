/**
 * Tests for equipment helpers, focused on the range-aware auto-equip vetoes
 * (Workstream B, campaign progression sprint, plus the 2026-07-24 floors 4-5
 * playtest follow-up): a weapon a holder couldn't actually attack with from
 * their formation row must never be treated as "better," no matter how high
 * its raw attack bonus — and neither must a weapon that's still usable but
 * would cost the holder their current ability to hit the back row (e.g.
 * trading a short-range Dagger for a higher-attack but close-range
 * Voidblade). Raw attack/defense numbers can't see either tradeoff.
 */
import { describe, it, expect } from "vitest";
import {
  isBetterEquip,
  equipItem,
  findBestEquipTarget,
  losesBackRowReach,
  weaponIsReachable,
} from "./combat-equipment";
import { createCharacterRecord } from "./party";
import type { Loadout } from "./combat-types";
import { ITEMS_BY_ID } from "../data/items";

const MACE = ITEMS_BY_ID["mace"]!; // close range, attackBonus 4
const STAFF = ITEMS_BY_ID["staff"]!; // medium range, attackBonus 2
const SHORT_SWORD = ITEMS_BY_ID["short-sword"]!; // short range, attackBonus 3
const LONG_SWORD = ITEMS_BY_ID["long-sword"]!; // medium range, attackBonus 5
const VOIDBLADE = ITEMS_BY_ID["voidblade"]!; // close range, attackBonus 11
const BOW = ITEMS_BY_ID["bow"]!; // long range, attackBonus 3

function backRowMage(): ReturnType<typeof createCharacterRecord> {
  return createCharacterRecord("c1", "Dell", "Elf", "Neutral", "Mage", 2);
}

function frontRowFighter(slot = 0): ReturnType<typeof createCharacterRecord> {
  return createCharacterRecord("c2", "Bram", "Human", "Good", "Fighter", slot);
}

describe("weaponIsReachable (row restrictions removed)", () => {
  it("close-range weapons are reachable from the back row", () => {
    expect(weaponIsReachable(backRowMage(), MACE)).toBe(true);
  });

  it("close-range weapons are reachable from the front row", () => {
    expect(weaponIsReachable(frontRowFighter(), MACE)).toBe(true);
  });

  it("medium and long range weapons are reachable from any row", () => {
    expect(weaponIsReachable(backRowMage(), STAFF)).toBe(true);
    expect(weaponIsReachable(backRowMage(), BOW)).toBe(true);
  });

  it("short-range weapons are reachable from the back row", () => {
    expect(weaponIsReachable(backRowMage(), SHORT_SWORD)).toBe(true);
  });

  it("non-weapon items and weapons with no declared range are always reachable", () => {
    const robe = ITEMS_BY_ID["robe"]!;
    expect(weaponIsReachable(backRowMage(), robe)).toBe(true);
  });
});

describe("isBetterEquip with a holder (row restrictions removed)", () => {
  it("treats a higher-attack weapon as better regardless of row (restrictions removed)", () => {
    const mage = backRowMage();
    // Mace(4) > Staff(2) on raw attack. Row restrictions removed, so
    // the Mace is reachable and is a strict upgrade.
    expect(isBetterEquip(STAFF, MACE, mage)).toBe(true);
  });

  it("still treats a reachable higher-attack weapon as better", () => {
    const fighter = frontRowFighter();
    expect(isBetterEquip(SHORT_SWORD, LONG_SWORD, fighter)).toBe(true);
  });

  it("without a holder argument, falls back to the old ATK/DEF-only comparison (back-compat)", () => {
    expect(isBetterEquip(STAFF, MACE)).toBe(true);
  });
});

describe("losesBackRowReach (row restrictions removed)", () => {
  it("never flags a reach loss (all weapons reach all rows)", () => {
    const fighter = frontRowFighter();
    // Row restrictions removed: no weapon swap can lose back-row reach
    // because all weapons reach all rows from all positions.
    expect(losesBackRowReach(SHORT_SWORD, VOIDBLADE, fighter)).toBe(false);
  });

  it("does not flag a swap between two weapons that both reach the back row", () => {
    const fighter = frontRowFighter();
    expect(losesBackRowReach(SHORT_SWORD, LONG_SWORD, fighter)).toBe(false);
  });

  it("does not flag equipping into an empty slot (nothing to lose)", () => {
    const fighter = frontRowFighter();
    expect(losesBackRowReach(undefined, VOIDBLADE, fighter)).toBe(false);
  });

  it("does not flag a swap when the current weapon already couldn't reach the back row", () => {
    const fighter = frontRowFighter();
    expect(losesBackRowReach(MACE, VOIDBLADE, fighter)).toBe(false);
  });

  it("isBetterEquip accepts a strictly-higher-attack weapon (row restrictions removed)", () => {
    const fighter = frontRowFighter();
    // Row restrictions removed: Voidblade (close, +11) is a strict upgrade
    // over Short Sword (short, +3) — no reach is lost.
    expect(isBetterEquip(SHORT_SWORD, VOIDBLADE, fighter)).toBe(true);
  });

  it("equipItem accepts the higher-attack swap (row restrictions removed)", () => {
    const fighter = frontRowFighter();
    const loadout: Loadout = { weapon: SHORT_SWORD, armor: [] };
    const next = equipItem(loadout, VOIDBLADE, fighter);
    expect(next.weapon).toBe(VOIDBLADE);
  });
});

describe("equipItem with a holder (row restrictions removed)", () => {
  it("equips a close-range weapon onto a back-row character", () => {
    const mage = backRowMage();
    const loadout: Loadout = { weapon: STAFF, armor: [] };
    const next = equipItem(loadout, MACE, mage);
    expect(next.weapon).toBe(MACE);
  });

  it("still equips a reachable upgrade onto a front-row character", () => {
    const fighter = frontRowFighter();
    const loadout: Loadout = { weapon: SHORT_SWORD, armor: [] };
    const next = equipItem(loadout, LONG_SWORD, fighter);
    expect(next.weapon).toBe(LONG_SWORD);
  });
});

describe("findBestEquipTarget (row restrictions removed)", () => {
  it("picks the weakest candidate by attack bonus (all rows reachable)", () => {
    const mage = backRowMage(); // Staff, attackBonus 2 — the "weakest" by raw score
    const fighter = frontRowFighter(); // Short Sword, attackBonus 3
    const party = [mage, fighter];
    const equipment: Record<string, Loadout> = {
      [mage.id]: { weapon: STAFF, armor: [] },
      [fighter.id]: { weapon: SHORT_SWORD, armor: [] },
    };
    // Row restrictions removed: the Mage (attackBonus 2) is the weakest
    // and all weapons are reachable from all rows.
    expect(findBestEquipTarget(party, equipment, MACE)).toBe(mage.id);
  });

  it("still picks the weakest reachable candidate when reach isn't a constraint", () => {
    const mage = backRowMage();
    const fighter = frontRowFighter();
    const party = [mage, fighter];
    const equipment: Record<string, Loadout> = {
      [mage.id]: { weapon: STAFF, armor: [] },
      [fighter.id]: { weapon: SHORT_SWORD, armor: [] },
    };
    expect(findBestEquipTarget(party, equipment, BOW)).toBe(mage.id);
  });
});
