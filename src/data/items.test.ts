import { describe, it, expect } from "vitest";
import { ITEMS_BY_ID, shopBuyPrice } from "./items";

describe("shopBuyPrice", () => {
  it("charges base price for +0 through +2", () => {
    for (const id of ["dagger", "dagger+1", "dagger+2"]) {
      const item = ITEMS_BY_ID[id]!;
      expect(shopBuyPrice(item)).toBe(item.price);
    }
  });

  it("charges a ruinous markup for +3 and +4", () => {
    const plus3 = ITEMS_BY_ID["dagger+3"]!;
    const plus4 = ITEMS_BY_ID["dagger+4"]!;
    expect(shopBuyPrice(plus3)).toBe(plus3.price * 5);
    expect(shopBuyPrice(plus4)).toBe(plus4.price * 15);
    expect(shopBuyPrice(plus4)).toBeGreaterThan(shopBuyPrice(plus3));
  });

  it("leaves items with no enhancement tier (uniques, cursed gear) unmarked up", () => {
    const circlet = ITEMS_BY_ID["sages-circlet"]!;
    expect(circlet.plus).toBeUndefined();
    expect(shopBuyPrice(circlet)).toBe(circlet.price);
  });
});
