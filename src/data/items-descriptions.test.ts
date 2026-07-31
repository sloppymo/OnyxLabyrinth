import { describe, it, expect } from "vitest";
import { ITEMS_BY_ID, dropsForFloor } from "./items";
import { equipItemFlavor } from "../engine/equip-sheet";

/** Batch 1: floor-1 gear lines + starter belt consumables. */
const BATCH1_IDS = [
  "dagger",
  "short-sword",
  "rapier",
  "staff",
  "bow",
  "halberd",
  "robe",
  "leather",
  "shield",
  "healing-potion",
  "antidote",
  "eye-drops",
  "smelling-salts",
] as const;

/** Batch 2: floor 2-5 gear lines, named uniques, and cursed gear. */
const BATCH2_IDS = [
  "mace",
  "long-sword",
  "great-sword",
  "runeblade",
  "voidblade",
  "chain-mail",
  "plate-mail",
  "helm",
  "mythril-plate",
  "dragonscale-mail",
  "sages-circlet",
  "focus-ward",
  "cursed-blade",
  "cursed-helm",
] as const;

describe("item descriptions batch 1", () => {
  it("authors descriptions on floor-1 starters", () => {
    for (const id of BATCH1_IDS) {
      const item = ITEMS_BY_ID[id];
      expect(item, id).toBeDefined();
      expect(item!.description?.length ?? 0, id).toBeGreaterThan(20);
    }
  });

  it("equip panel prefers authored copy over procedural fallback", () => {
    const sword = ITEMS_BY_ID["short-sword"]!;
    expect(equipItemFlavor(sword)).toBe(sword.description);
    expect(equipItemFlavor(sword)).toMatch(/gladius|arming sword/i);
  });

  it("+1/+2 variants share the base line's description", () => {
    expect(ITEMS_BY_ID["short-sword+1"]!.description).toBe(
      ITEMS_BY_ID["short-sword"]!.description
    );
  });

  it("floor-1 drops all carry descriptions", () => {
    for (const item of dropsForFloor(1)) {
      expect(item.description, item.id).toBeTruthy();
    }
  });
});

describe("item descriptions batch 2", () => {
  it("authors descriptions on floor 2-5 lines, uniques, and cursed gear", () => {
    for (const id of BATCH2_IDS) {
      const item = ITEMS_BY_ID[id];
      expect(item, id).toBeDefined();
      expect(item!.description?.length ?? 0, id).toBeGreaterThan(20);
    }
  });

  it("floors 2-5 drops all carry descriptions", () => {
    for (const floor of [2, 3, 4, 5]) {
      for (const item of dropsForFloor(floor)) {
        expect(item.description, item.id).toBeTruthy();
      }
    }
  });
});
