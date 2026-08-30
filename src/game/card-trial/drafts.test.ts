import { describe, expect, it } from "vitest";
import {
  DRAFT_CHOICES,
  DRAFT_POOL_SLOTS,
  drawDraftChoices,
  type DraftSlot,
} from "./drafts";
import { createShuffleStream } from "./rng";

function categories(pool: "dirty-tricks" | "arcane-responses"): Record<DraftSlot, string[]> {
  const slots = DRAFT_POOL_SLOTS[pool];
  return {
    safe: [...slots.safe],
    greedy: [...slots.greedy],
    context: [slots.context],
  };
}

describe("draft offer construction", () => {
  it("prints greedy Dirty Trick and Arcane Response costs as 1", () => {
    expect(DRAFT_CHOICES["low-blow"].cost).toBe(1);
    expect(DRAFT_CHOICES["feast-on-the-fallen"].cost).toBe(1);
    expect(DRAFT_CHOICES["late-verdict"].cost).toBe(1);
    expect(DRAFT_CHOICES["unmake-the-threat"].cost).toBe(1);
    for (const id of DRAFT_POOL_SLOTS["dirty-tricks"].safe) {
      expect(DRAFT_CHOICES[id].cost).toBe(0);
    }
    expect(DRAFT_CHOICES["royal-ambush"].cost).toBe(0);
  });

  it("always offers one Safe, one Greedy, and one Context option", () => {
    for (const pool of ["dirty-tricks", "arcane-responses"] as const) {
      const slots = categories(pool);
      for (let seed = 1; seed <= 80; seed += 1) {
        const offer = drawDraftChoices(pool, createShuffleStream(seed));
        expect(offer).toHaveLength(3);
        expect(new Set(offer.map((c) => c.id)).size).toBe(3);
        expect(offer.filter((c) => slots.safe.includes(c.id))).toHaveLength(1);
        expect(offer.filter((c) => slots.greedy.includes(c.id))).toHaveLength(1);
        expect(offer.filter((c) => c.id === slots.context[0])).toHaveLength(1);
        expect(offer.some((c) => c.cost === 0 && slots.safe.includes(c.id))).toBe(true);
      }
    }
  });

  it("randomizes display order separately from category assignment", () => {
    const orders = new Set<string>();
    for (let seed = 1; seed <= 40; seed += 1) {
      const offer = drawDraftChoices("dirty-tricks", createShuffleStream(seed));
      orders.add(offer.map((c) => c.id).join(","));
    }
    expect(orders.size).toBeGreaterThan(3);
  });

  it("is deterministic for the same draft stream seed", () => {
    const a = drawDraftChoices("arcane-responses", createShuffleStream(99));
    const b = drawDraftChoices("arcane-responses", createShuffleStream(99));
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });
});
