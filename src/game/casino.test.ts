import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createCasinoState,
  normalizeCasinoState,
  commitMonte,
  settleMonte,
  commitKnucklebones,
  knucklebonesSettle,
  knucklebonesPayout,
  knucklebonesChits,
  commitBlackDraw,
  blackDrawPayoutForTotal,
  blackDrawHit,
  settleBlackDraw,
  createBlackDrawState,
  beginCasinoRound,
  settleCasinoRound,
  resumeCasinoRound,
  BLACK_VALUES,
  type CardId,
  MONTE_TIERS,
  monteTierForBet,
  availableMonteTiers,
} from "./casino";
import { setGameplayRng, resetGameplayRng, createSeededRng } from "./rng";

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

  it("drops malformed pending rounds", () => {
    const c = normalizeCasinoState({
      pendingRound: { gameId: "black-draw", wager: 10, committedOutcome: { kind: "black-draw" } },
    } as unknown as Record<string, unknown>);
    expect(c.pendingRound).toBeUndefined();
  });

  it("keeps valid monte pending rounds", () => {
    const c = normalizeCasinoState({
      pendingRound: {
        gameId: "three-card-monte",
        wager: 5,
        committedOutcome: { kind: "monte", swaps: [[0, 1]], winningIndex: 1 },
        phase: "committed",
      },
    } as unknown as Record<string, unknown>);
    expect(c.pendingRound?.gameId).toBe("three-card-monte");
    const out = c.pendingRound?.committedOutcome as { winningIndex: number };
    expect(out.winningIndex).toBe(1);
  });
});

describe("three-card monte", () => {
  beforeEach(() => setGameplayRng(createSeededRng(12345)));
  afterEach(() => resetGameplayRng());

  it("same seed produces the same swap sequence", () => {
    setGameplayRng(createSeededRng(42));
    const a = commitMonte(MONTE_TIERS[0], createSeededRng(0.5));
    setGameplayRng(createSeededRng(42));
    const b = commitMonte(MONTE_TIERS[0], createSeededRng(0.5));
    expect(a.swaps).toEqual(b.swaps);
    expect(a.winningIndex).toBe(b.winningIndex);
  });

  it("correct final position wins and wrong position loses", () => {
    setGameplayRng(createSeededRng(1));
    const out = commitMonte(MONTE_TIERS[0], () => 0.5);
    expect(settleMonte(out, out.winningIndex).win).toBe(true);
    expect(settleMonte(out, (out.winningIndex + 1) % 3).win).toBe(false);
  });

  it("payout multiplier is 2x on a win", () => {
    const out = commitMonte(MONTE_TIERS[0], () => 0.5);
    expect(settleMonte(out, out.winningIndex).multiplier).toBe(2);
  });

  it("tier selection picks the highest unlocked tier that the wager qualifies for", () => {
    const s = mockState(1000);
    s.casino.unlockedGameTiers = ["street", "sharps"];
    expect(monteTierForBet(5, s.casino.unlockedGameTiers).id).toBe("street");
    expect(monteTierForBet(25, s.casino.unlockedGameTiers).id).toBe("sharps");
  });

  it("each tier has the advertised number of swaps", () => {
    const rng = () => 0.5;
    expect(commitMonte(MONTE_TIERS[0], rng).swaps.length).toBe(2);
    expect(commitMonte(MONTE_TIERS[1], rng).swaps.length).toBe(4);
    expect(commitMonte(MONTE_TIERS[2], rng).swaps.length).toBe(6);
    expect(commitMonte(MONTE_TIERS[3], rng).swaps.length).toBe(8);
  });
});

describe("knucklebones", () => {
  it("payouts for fixed bets match declared rules", () => {
    expect(knucklebonesPayout({ kind: "knucklebones", bone1: 1, bone2: 2 }, { kind: "low" })).toBe(2);
    expect(knucklebonesPayout({ kind: "knucklebones", bone1: 6, bone2: 6 }, { kind: "doubles" })).toBe(4);
    expect(knucklebonesPayout({ kind: "knucklebones", bone1: 3, bone2: 4 }, { kind: "seven" })).toBe(5);
    expect(knucklebonesPayout({ kind: "knucklebones", bone1: 5, bone2: 6 }, { kind: "high" })).toBe(2);
    expect(knucklebonesPayout({ kind: "knucklebones", bone1: 6, bone2: 6 }, { kind: "exact", total: 12 })).toBe(30);
  });

  it("exact total only pays when the called number matches the roll", () => {
    expect(knucklebonesPayout({ kind: "knucklebones", bone1: 6, bone2: 6 }, { kind: "exact", total: 7 })).toBe(0);
  });

  it("chits are only awarded on a winning Doubles bet", () => {
    expect(knucklebonesChits({ kind: "knucklebones", bone1: 6, bone2: 6 }, { kind: "doubles" })).toBe(2);
    expect(knucklebonesChits({ kind: "knucklebones", bone1: 3, bone2: 3 }, { kind: "doubles" })).toBe(1);
    expect(knucklebonesChits({ kind: "knucklebones", bone1: 6, bone2: 6 }, { kind: "high" })).toBe(0);
    expect(knucklebonesChits({ kind: "knucklebones", bone1: 2, bone2: 4 }, { kind: "doubles" })).toBe(0);
  });

  it("settlement combines multiplier and chits for a Doubles win", () => {
    const r = knucklebonesSettle({ kind: "knucklebones", bone1: 6, bone2: 6 }, { kind: "doubles" });
    expect(r.multiplier).toBe(4);
    expect(r.chits).toBe(2);
    expect(r.win).toBe(true);
  });
});

describe("black draw", () => {
  beforeEach(() => setGameplayRng(createSeededRng(99)));
  afterEach(() => resetGameplayRng());

  it("does not reuse dealer cards for player draws", () => {
    setGameplayRng(createSeededRng(7));
    const out = commitBlackDraw(createSeededRng(7));
    expect(out.playerInitialCards.length).toBe(2);
    expect(out.remainingPlayerDraws.length).toBe(out.deck.length - 2 - out.dealerCards.length);
    const state = createBlackDrawState(out);
    for (const c of out.playerInitialCards) expect(state.deck).not.toContain(c);
    for (const c of out.dealerCards) expect(state.deck).not.toContain(c);
    blackDrawHit(state);
    expect(state.nextIndex).toBe(1);
  });

  it("payout ladder is correct for totals 2-13", () => {
    expect(blackDrawPayoutForTotal(2)).toBe(0);
    expect(blackDrawPayoutForTotal(7)).toBe(0.7);
    expect(blackDrawPayoutForTotal(13)).toBe(3.7);
    expect(blackDrawPayoutForTotal(14)).toBe(0);
  });

  it("always-stand expected return is within 90-96%", () => {
    const ids = Object.keys(BLACK_VALUES) as CardId[];
    function* perms<T>(arr: T[]): Generator<T[]> {
      if (arr.length <= 1) {
        yield arr;
        return;
      }
      for (let i = 0; i < arr.length; i++) {
        const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
        for (const p of perms(rest)) {
          yield [arr[i], ...p];
        }
      }
    }
    let sum = 0;
    let n = 0;
    const target = 13;
    const dealerStop = target - 3;
    for (const deck of perms(ids)) {
      const playerTotal = BLACK_VALUES[deck[0]] + BLACK_VALUES[deck[1]];
      let dealerTotal = 0;
      let i = 2;
      while (dealerTotal < dealerStop && i < 8) {
        dealerTotal += BLACK_VALUES[deck[i]];
        i++;
      }
      n++;
      if (playerTotal > target) continue;
      const win = playerTotal > dealerTotal || dealerTotal > target;
      if (win) sum += blackDrawPayoutForTotal(playerTotal);
    }
    const ev = sum / n;
    if (ev < 0.9 || ev > 0.96) {
      console.log(`Black Draw always-stand EV: ${ev.toFixed(4)}`);
    }
    expect(ev).toBeGreaterThanOrEqual(0.9);
    expect(ev).toBeLessThanOrEqual(0.96);
  });

  it("total over 13 loses", () => {
    const out = commitBlackDraw(createSeededRng(99));
    const state = createBlackDrawState(out);
    state.playerTotal = 14;
    expect(settleBlackDraw(state).win).toBe(false);
  });

  it("beating the dealer uses the payout ladder", () => {
    const out = commitBlackDraw(createSeededRng(99));
    const state = createBlackDrawState(out);
    state.playerTotal = 13;
    state.dealerTotal = 5;
    const r = settleBlackDraw(state);
    expect(r.win).toBe(true);
    expect(r.multiplier).toBe(3.7);
  });
});

describe("casino transactions", () => {
  beforeEach(() => setGameplayRng(createSeededRng(7)));
  afterEach(() => resetGameplayRng());

  it("wager requires sufficient gold", () => {
    const s = mockState(3);
    const r = beginCasinoRound(s, "knucklebones", 5, { knuckleSelection: { kind: "high" } });
    expect(r.ok).toBe(false);
    expect(s.partyGold).toBe(3);
  });

  it("wager deducts once and settles idempotently", () => {
    const s = mockState(100);
    const r = beginCasinoRound(s, "knucklebones", 10, { knuckleSelection: { kind: "high" } });
    expect(r.ok).toBe(true);
    expect(s.partyGold).toBe(90);
    const res1 = settleCasinoRound(s);
    const res2 = settleCasinoRound(s);
    expect(res1.message).not.toBe("No wager is pending.");
    expect(res2.message).toBe("No wager is pending.");
  });

  it("pending round blocks starting a second wager", () => {
    const s = mockState(100);
    beginCasinoRound(s, "knucklebones", 10, { knuckleSelection: { kind: "high" } });
    const r = beginCasinoRound(s, "knucklebones", 10, { knuckleSelection: { kind: "low" } });
    expect(r.ok).toBe(false);
  });

  it("resumeCasinoRound leaves an unresolved round intact", () => {
    const s = mockState(100);
    beginCasinoRound(s, "three-card-monte", 5, { tier: MONTE_TIERS[0] });
    const before = s.casino.pendingRound?.committedOutcome;
    resumeCasinoRound(s);
    expect(s.casino.pendingRound?.committedOutcome).toBe(before);
  });

  it("settled rounds are cleared", () => {
    const s = mockState(100);
    beginCasinoRound(s, "knucklebones", 10, { knuckleSelection: { kind: "high" } });
    settleCasinoRound(s);
    expect(s.casino.pendingRound).toBeUndefined();
  });
});
