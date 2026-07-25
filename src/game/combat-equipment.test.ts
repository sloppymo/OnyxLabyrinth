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
import { createCharacter } from "./party";
import type { Loadout } from "./combat-types";
import { ITEMS_BY_ID } from "../data/items";

const MACE = ITEMS_BY_ID["mace"]!; // close range, attackBonus 4
const STAFF = ITEMS_BY_ID["staff"]!; // medium range, attackBonus 2
const SHORT_SWORD = ITEMS_BY_ID["short-sword"]!; // short range, attackBonus 3
const LONG_SWORD = ITEMS_BY_ID["long-sword"]!; // medium range, attackBonus 5
const VOIDBLADE = ITEMS_BY_ID["voidblade"]!; // close range, attackBonus 11
const BOW = ITEMS_BY_ID["bow"]!; // long range, attackBonus 3

function backRowMage(): ReturnType<typeof createCharacter> {
  return createCharacter("c1", "Dell", "Elf", "Neutral", "Mage", 4);
}

function frontRowFighter(slot = 0): ReturnType<typeof createCharacter> {
  return createCharacter("c2", "Bram", "Human", "Good", "Fighter", slot);
}

describe("weaponIsReachable", () => {
  it("close-range weapons are unreachable from the back row", () => {
    expect(weaponIsReachable(backRowMage(), MACE)).toBe(false);
  });

  it("close-range weapons are reachable from the front row", () => {
    expect(weaponIsReachable(frontRowFighter(), MACE)).toBe(true);
  });

  it("medium and long range weapons are reachable from any row", () => {
    expect(weaponIsReachable(backRowMage(), STAFF)).toBe(true);
    expect(weaponIsReachable(backRowMage(), BOW)).toBe(true);
  });

  it("short-range weapons remain reachable from the back row (they reach the front)", () => {
    expect(weaponIsReachable(backRowMage(), SHORT_SWORD)).toBe(true);
  });

  it("non-weapon items and weapons with no declared range are always reachable", () => {
    const robe = ITEMS_BY_ID["robe"]!;
    expect(weaponIsReachable(backRowMage(), robe)).toBe(true);
  });
});

describe("isBetterEquip with a holder (range-aware)", () => {
  it("never treats an unreachable weapon as better, even with a higher attack bonus", () => {
    const mage = backRowMage();
    // Mace(4) > Staff(2) on raw attack, but the Mage is back row and Mace is close-range.
    expect(isBetterEquip(STAFF, MACE, mage)).toBe(false);
  });

  it("still treats a reachable higher-attack weapon as better", () => {
    const fighter = frontRowFighter();
    // Short Sword (short, reaches back row from front) -> Long Sword
    // (medium, always reaches back row): no reach lost, attack goes up.
    expect(isBetterEquip(SHORT_SWORD, LONG_SWORD, fighter)).toBe(true);
  });

  it("without a holder argument, falls back to the old ATK/DEF-only comparison (back-compat)", () => {
    expect(isBetterEquip(STAFF, MACE)).toBe(true);
  });
});

describe("losesBackRowReach", () => {
  it("flags a front-row character trading a back-row-capable weapon for a close-range one", () => {
    const fighter = frontRowFighter();
    // Short Sword (short) currently reaches the back row; Voidblade (close)
    // never does, regardless of formation — a real tactical loss despite
    // Voidblade's much higher attack bonus.
    expect(losesBackRowReach(SHORT_SWORD, VOIDBLADE, fighter)).toBe(true);
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
    // Mace (close) already can't hit the back row, so Voidblade (also
    // close) costs nothing further.
    expect(losesBackRowReach(MACE, VOIDBLADE, fighter)).toBe(false);
  });

  it("isBetterEquip rejects a strictly-higher-attack weapon that would lose back-row reach", () => {
    const fighter = frontRowFighter();
    // Regression (2026-07-24 floors 4-5 playtest, Finding 3): naive
    // attack-bonus comparison would auto-equip Voidblade over Short Sword
    // even though it silently removes the only way this character could
    // ever hit a protected back-row boss.
    expect(isBetterEquip(SHORT_SWORD, VOIDBLADE, fighter)).toBe(false);
  });

  it("equipItem refuses the reach-losing swap even though attack bonus is much higher", () => {
    const fighter = frontRowFighter();
    const loadout: Loadout = { weapon: SHORT_SWORD, armor: [] };
    const next = equipItem(loadout, VOIDBLADE, fighter);
    expect(next).toBe(loadout);
    expect(next.weapon).toBe(SHORT_SWORD);
  });
});

describe("equipItem with a holder (range-aware)", () => {
  it("refuses to equip a close-range weapon onto a back-row character", () => {
    const mage = backRowMage();
    const loadout: Loadout = { weapon: STAFF, armor: [] };
    const next = equipItem(loadout, MACE, mage);
    expect(next).toBe(loadout);
    expect(next.weapon).toBe(STAFF);
  });

  it("still equips a reachable upgrade onto a front-row character", () => {
    const fighter = frontRowFighter();
    const loadout: Loadout = { weapon: SHORT_SWORD, armor: [] };
    const next = equipItem(loadout, LONG_SWORD, fighter);
    expect(next.weapon).toBe(LONG_SWORD);
  });
});

describe("findBestEquipTarget with row-blind candidates (range-aware)", () => {
  it("skips a back-row candidate for a close-range weapon even with the weakest current weapon", () => {
    const mage = backRowMage(); // Staff, attackBonus 2 — the "weakest" by raw score
    const fighter = frontRowFighter(); // Short Sword, attackBonus 3
    const party = [mage, fighter];
    const equipment: Record<string, Loadout> = {
      [mage.id]: { weapon: STAFF, armor: [] },
      [fighter.id]: { weapon: SHORT_SWORD, armor: [] },
    };
    // Naive ATK-only scoring would pick the Mage (2 < 3); reachability must
    // route this to the Fighter instead, since the Mage can't use a Mace at all.
    expect(findBestEquipTarget(party, equipment, MACE)).toBe(fighter.id);
  });

  it("still picks the weakest reachable candidate when reach isn't a constraint", () => {
    const mage = backRowMage();
    const fighter = frontRowFighter();
    const party = [mage, fighter];
    const equipment: Record<string, Loadout> = {
      [mage.id]: { weapon: STAFF, armor: [] },
      [fighter.id]: { weapon: SHORT_SWORD, armor: [] },
    };
    // Bow is long-range — reachable from any row — so plain weakest-weapon
    // scoring applies again and the Mage (attackBonus 2) wins.
    expect(findBestEquipTarget(party, equipment, BOW)).toBe(mage.id);
  });
});
