import { describe, it, expect, beforeEach } from "vitest";
import {
  createCasinoState,
  normalizeCasinoState,
  commitMonte,
  settleMonte,
  commitKnucklebones,
  knucklebonesPayout,
  knucklebonesChits,
  commitBlackDraw,
  blackDrawStand,
  blackDrawPayoutForTotal,
  beginCasinoRound,
  settleCasinoRound,
  MONTE_TIERS,
} from "./casino";
import { setGameplayRng, createSeededRng } from "./rng";

function mockState(gold = 500) {
  return { partyGold: gold, casino: createCasinoState(), inventory: [] };
}

describe("casino state", () => {
  it("initializes safely", () => {
    const c = createCasinoState();
    expect(c.prizeChits).toBe(0);
    expect(c.stats.gamesPlayed).toBe(0);
  });

  it("normalizes missing or malformed fields", () => {
    const c = normalizeCasinoState({ prizeChits: -10, stats: { gamesPlayed: "bad" } } as unknown as Record<string, unknown>);
    expect(c.prizeChits).toBe(0);
    expect(c.stats.gamesPlayed).toBe(0);
  });
});

describe("three-card monte", () => {
  beforeEach(() => setGameplayRng(createSeededRng(12345)));

  it("same seed produces the same swap sequence", () => {
    setGameplayRng(createSeededRng(42));
    const a = commitMonte(MONTE_TIERS[0], () => 0.5);
    setGameplayRng(createSeededRng(42));
    const b = commitMonte(MONTE_TIERS[0], () => 0.5);
    expect(a.swaps).toEqual(b.swaps);
    expect(a.winningIndex).toBe(b.winningIndex);
  });

  it("correct final position wins and wrong position loses", () => {
    setGameplayRng(createSeededRng(1));
    const out = commitMonte(MONTE_TIERS[0], () => 0.5);
    expect(settleMonte(out, out.winningIndex).win).toBe(true);
    expect(settleMonte(out, (out.winningIndex + 1) % 3).win).toBe(false);
  });
});

describe("knucklebones", () => {
  it("payouts match declared rules", () => {
    expect(knucklebonesPayout({ kind: "knucklebones", bone1: 1, bone2: 2 }, "low")).toBe(2);
    expect(knucklebonesPayout({ kind: "knucklebones", bone1: 6, bone2: 6 }, "doubles")).toBe(4);
    expect(knucklebonesPayout({ kind: "knucklebones", bone1: 3, bone2: 4 }, "seven")).toBe(5);
    expect(knucklebonesPayout({ kind: "knucklebones", bone1: 5, bone2: 6 }, "high")).toBe(2);
    expect(knucklebonesPayout({ kind: "knucklebones", bone1: 6, bone2: 6 }, "exact")).toBe(30);
  });

  it("doubles award chits", () => {
    expect(knucklebonesChits({ kind: "knucklebones", bone1: 6, bone2: 6 })).toBe(2);
    expect(knucklebonesChits({ kind: "knucklebones", bone1: 3, bone2: 3 })).toBe(1);
    expect(knucklebonesChits({ kind: "knucklebones", bone1: 2, bone2: 4 })).toBe(0);
  });
});

describe("black draw", () => {
  beforeEach(() => setGameplayRng(createSeededRng(99)));

  it("total over 13 loses", () => {
    const out = commitBlackDraw(createSeededRng(99));
    expect(blackDrawStand(out, 14).win).toBe(false);
  });

  it("payout ladder is correct for totals 2-13", () => {
    expect(blackDrawPayoutForTotal(2)).toBe(0);
    expect(blackDrawPayoutForTotal(7)).toBe(2);
    expect(blackDrawPayoutForTotal(13)).toBe(10);
    expect(blackDrawPayoutForTotal(14)).toBe(0);
  });
});

describe("casino transactions", () => {
  beforeEach(() => setGameplayRng(createSeededRng(7)));

  it("wager requires sufficient gold", () => {
    const s = mockState(3);
    const r = beginCasinoRound(s, "knucklebones", 5, { id: "street", name: "", minBet: 5, maxBet: 25, description: "" });
    expect(r.ok).toBe(false);
    expect(s.partyGold).toBe(3);
  });

  it("wager deducts once and settles idempotently", () => {
    const s = mockState(100);
    const r = beginCasinoRound(s, "knucklebones", 10, { id: "street", name: "", minBet: 5, maxBet: 25, description: "" });
    expect(r.ok).toBe(true);
    expect(s.partyGold).toBe(90);
    const res1 = settleCasinoRound(s, "high");
    const res2 = settleCasinoRound(s, "high");
    expect(res1.message).not.toBe("No wager is pending.");
    expect(res2.message).toBe("No wager is pending.");
  });
});
