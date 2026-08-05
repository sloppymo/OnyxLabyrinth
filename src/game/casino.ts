/**
 * Casino engine — pure, deterministic gambling logic for The Crooked Crown.
 *
 * All gameplay outcomes use the global gameplay RNG (getGameplayRng).
 *
 * Save-safe by design:
 *  - A round is committed as a plain object before any reveal.
 *  - The committed outcome is never rerolled.
 *  - Live mutable state (Black Draw hand, Knucklebones selection) is stored on
 *    the pending round and serialized/deserialized as-is.
 */

import { getGameplayRng, type Rng } from "./rng";

export type CasinoGameId = "three-card-monte" | "knucklebones" | "black-draw";

export type CasinoRoundPhase = "wagered" | "committed" | "revealing" | "settled";

export interface MonteOutcome {
  kind: "monte";
  swaps: [number, number][];
  winningIndex: number;
}

export interface KnucklebonesOutcome {
  kind: "knucklebones";
  bone1: number;
  bone2: number;
}

export type CardId =
  | "rat"
  | "torch"
  | "sword"
  | "crown"
  | "wound"
  | "void"
  | "fool"
  | "dragon";

export const BLACK_VALUES: Record<CardId, number> = {
  rat: 2,
  torch: 3,
  sword: 4,
  crown: 5,
  wound: 6,
  void: 7,
  fool: 8,
  dragon: 9,
};

export interface BlackDrawOutcome {
  kind: "black-draw";
  deck: CardId[]; // full shuffled deck
  playerInitialCards: CardId[];
  dealerCards: CardId[];
  remainingPlayerDraws: CardId[];
  target: number;
}

export type CasinoCommittedOutcome =
  | MonteOutcome
  | KnucklebonesOutcome
  | BlackDrawOutcome;

export type KnucklebonesSelection =
  | { kind: "low" }
  | { kind: "high" }
  | { kind: "seven" }
  | { kind: "doubles" }
  | { kind: "exact"; total: number };

export interface BlackDrawState {
  deck: CardId[]; // remaining draws for the player
  playerHand: number[];
  playerTotal: number;
  dealerHand: number[];
  dealerTotal: number;
  nextIndex: number;
  payoutSoFar: number;
  hasStood: boolean;
  target: number;
}

export interface PendingCasinoRound {
  roundId: string;
  gameId: CasinoGameId;
  wager: number;
  committedOutcome: CasinoCommittedOutcome;
  phase: CasinoRoundPhase;
  knuckleSelection?: KnucklebonesSelection;
  blackDrawState?: BlackDrawState;
}

export interface CasinoStats {
  gamesPlayed: number;
  gamesWon: number;
  goldWagered: number;
  goldPaidOut: number;
  largestWin: number;
  largestLoss: number;
  currentWinStreak: number;
  bestWinStreak: number;
  monteWins: number;
  knucklebonesWins: number;
  blackDrawWins: number;
}

export interface CasinoState {
  version: number;
  prizeChits: number;
  reputation: number;
  unlockedGameTiers: string[];
  uniquePrizesClaimed: string[];
  seenDialogueFlags: string[];
  monteProfitDay: number;
  montePaidWinsToday: number;
  stats: CasinoStats;
  pendingRound?: PendingCasinoRound;
}

export function createCasinoState(): CasinoState {
  return {
    version: 1,
    prizeChits: 0,
    reputation: 0,
    unlockedGameTiers: ["street"],
    uniquePrizesClaimed: [],
    seenDialogueFlags: [],
    monteProfitDay: 0,
    montePaidWinsToday: 0,
    stats: {
      gamesPlayed: 0,
      gamesWon: 0,
      goldWagered: 0,
      goldPaidOut: 0,
      largestWin: 0,
      largestLoss: 0,
      currentWinStreak: 0,
      bestWinStreak: 0,
      monteWins: 0,
      knucklebonesWins: 0,
      blackDrawWins: 0,
    },
  };
}

function clampNonNeg(n: unknown, def: number): number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : def;
}

/** Normalize a partial or older casino payload. */
export function normalizeCasinoState(raw?: unknown): CasinoState {
  const base = createCasinoState();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;

  base.prizeChits = clampNonNeg(r.prizeChits, 0);
  base.reputation = clampNonNeg(r.reputation, 0);
  base.unlockedGameTiers = Array.isArray(r.unlockedGameTiers)
    ? r.unlockedGameTiers.filter((x): x is string => typeof x === "string")
    : base.unlockedGameTiers;
  base.uniquePrizesClaimed = Array.isArray(r.uniquePrizesClaimed)
    ? r.uniquePrizesClaimed.filter((x): x is string => typeof x === "string")
    : base.uniquePrizesClaimed;
  base.seenDialogueFlags = Array.isArray(r.seenDialogueFlags)
    ? r.seenDialogueFlags.filter((x): x is string => typeof x === "string")
    : base.seenDialogueFlags;
  base.monteProfitDay = clampNonNeg(r.monteProfitDay, 0);
  base.montePaidWinsToday = clampNonNeg(r.montePaidWinsToday, 0);

  const rawStats = r.stats as Record<string, unknown> | undefined;
  if (rawStats) {
    const s = base.stats;
    s.gamesPlayed = clampNonNeg(rawStats.gamesPlayed, 0);
    s.gamesWon = clampNonNeg(rawStats.gamesWon, 0);
    s.goldWagered = clampNonNeg(rawStats.goldWagered, 0);
    s.goldPaidOut = clampNonNeg(rawStats.goldPaidOut, 0);
    s.largestWin = clampNonNeg(rawStats.largestWin, 0);
    s.largestLoss = clampNonNeg(rawStats.largestLoss, 0);
    s.currentWinStreak = clampNonNeg(rawStats.currentWinStreak, 0);
    s.bestWinStreak = clampNonNeg(rawStats.bestWinStreak, 0);
    s.monteWins = clampNonNeg(rawStats.monteWins, 0);
    s.knucklebonesWins = clampNonNeg(rawStats.knucklebonesWins, 0);
    s.blackDrawWins = clampNonNeg(rawStats.blackDrawWins, 0);
  }

  const rawPending = r.pendingRound as Record<string, unknown> | undefined;
  if (rawPending && typeof rawPending.gameId === "string" && typeof rawPending.wager === "number") {
    const gameId = rawPending.gameId as CasinoGameId;
    const pending: PendingCasinoRound = {
      roundId: String(rawPending.roundId ?? ""),
      gameId,
      wager: clampNonNeg(rawPending.wager, 0),
      committedOutcome: rawPending.committedOutcome as CasinoCommittedOutcome,
      phase: (String(rawPending.phase ?? "committed") as CasinoRoundPhase),
    };

    // Reject silently malformed pending rounds that cannot be safely resumed.
    let valid = true;
    if (gameId === "three-card-monte") {
      const out = pending.committedOutcome as Partial<MonteOutcome>;
      if (out.kind !== "monte" || !Array.isArray(out.swaps) || typeof out.winningIndex !== "number") {
        valid = false;
      }
    } else if (gameId === "knucklebones") {
      const sel = rawPending.knuckleSelection as Record<string, unknown> | undefined;
      if (!sel || typeof sel.kind !== "string" || !["low", "high", "seven", "doubles", "exact"].includes(sel.kind)) {
        valid = false;
      } else if (sel.kind === "exact" && typeof sel.total !== "number") {
        valid = false;
      } else {
        pending.knuckleSelection = sel as KnucklebonesSelection;
      }
    } else if (gameId === "black-draw") {
      const out = pending.committedOutcome as Partial<BlackDrawOutcome>;
      const bds = rawPending.blackDrawState as Record<string, unknown> | undefined;
      if (
        out.kind !== "black-draw" ||
        !Array.isArray(out.playerInitialCards) ||
        !Array.isArray(out.dealerCards) ||
        !Array.isArray(out.remainingPlayerDraws) ||
        typeof out.target !== "number" ||
        !bds ||
        !Array.isArray(bds.playerHand) ||
        !Array.isArray(bds.deck)
      ) {
        valid = false;
      } else {
        pending.blackDrawState = bds as unknown as BlackDrawState;
      }
    } else {
      valid = false;
    }

    if (valid) {
      base.pendingRound = pending;
    }
  }

  return base;
}

export interface CasinoTier {
  id: string;
  name: string;
  minBet: number;
  maxBet: number;
  description: string;
}

export const MONTE_TIERS: CasinoTier[] = [
  { id: "street", name: "Street Game", minBet: 5, maxBet: 25, description: "2 slow swaps. Even a distracted eye can follow." },
  { id: "sharps", name: "Sharp's Table", minBet: 10, maxBet: 75, description: "4 faster swaps. The dealer's hands begin to blur." },
  { id: "crooked", name: "The Crooked Hand", minBet: 25, maxBet: 200, description: "6 swaps with false pauses. Watch the real moves." },
  { id: "challenge", name: "Dealer's Challenge", minBet: 100, maxBet: 500, description: "8 swaps, house rules. The crown is on the line." },
];

/** Return the highest unlocked tier whose minBet the wager meets. */
export function monteTierForBet(bet: number, tiers: string[]): CasinoTier {
  for (let i = MONTE_TIERS.length - 1; i >= 0; i--) {
    const t = MONTE_TIERS[i];
    if (tiers.includes(t.id) && bet >= t.minBet) return t;
  }
  return MONTE_TIERS[0];
}

export function availableMonteTiers(tiers: string[]): CasinoTier[] {
  return MONTE_TIERS.filter((t) => tiers.includes(t.id));
}

/** Generate a deterministic three-card monte swap sequence. */
export function commitMonte(tier: CasinoTier, rng: Rng): MonteOutcome {
  let winningIndex = 0;
  const swapCounts: Record<string, number> = {
    street: 2,
    sharps: 4,
    crooked: 6,
    challenge: 8,
  };
  const count = swapCounts[tier.id] ?? 2;
  const swaps: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const a = Math.floor(rng() * 3);
    let b = Math.floor(rng() * 2);
    if (b >= a) b++;
    swaps.push([a, b]);
    if (winningIndex === a) winningIndex = b;
    else if (winningIndex === b) winningIndex = a;
  }
  return { kind: "monte", swaps, winningIndex };
}

/** Win iff the selected index equals the final winning index. */
export function settleMonte(
  outcome: MonteOutcome,
  selectedIndex: number
): { win: boolean; multiplier: number } {
  const win = selectedIndex === outcome.winningIndex;
  return { win, multiplier: win ? 2 : 0 };
}

/** Apply one swap step for animation replay. */
export function applySwapStep(position: number, [a, b]: [number, number]): number {
  if (position === a) return b;
  if (position === b) return a;
  return position;
}

export const KNUCKLEBONES_BETS = ["low", "high", "seven", "doubles", "exact"] as const;
export type KnucklebonesBet = (typeof KNUCKLEBONES_BETS)[number];

export const EXACT_PAYOUTS: Record<number, number> = {
  2: 30,
  3: 15,
  4: 10,
  5: 8,
  6: 6,
  7: 0,
  8: 6,
  9: 8,
  10: 10,
  11: 15,
  12: 30,
};

export function commitKnucklebones(rng: Rng): KnucklebonesOutcome {
  return { kind: "knucklebones", bone1: 1 + Math.floor(rng() * 6), bone2: 1 + Math.floor(rng() * 6) };
}

export function knucklebonesTotal(o: KnucklebonesOutcome): number {
  return o.bone1 + o.bone2;
}

export function isDouble(o: KnucklebonesOutcome): boolean {
  return o.bone1 === o.bone2;
}

export function knucklebonesPayout(o: KnucklebonesOutcome, selection: KnucklebonesSelection): number {
  const total = knucklebonesTotal(o);
  switch (selection.kind) {
    case "low":
      return total >= 2 && total <= 6 ? 2 : 0;
    case "high":
      return total >= 8 && total <= 12 ? 2 : 0;
    case "seven":
      return total === 7 ? 5 : 0;
    case "doubles":
      return isDouble(o) ? 4 : 0;
    case "exact":
      return total === selection.total ? (EXACT_PAYOUTS[total] ?? 0) : 0;
    default:
      return 0;
  }
}

/** Chits are awarded only on a Doubles bet that wins. Double fives or sixes pay 2, any other double pays 1. */
export function knucklebonesChits(o: KnucklebonesOutcome, selection: KnucklebonesSelection): number {
  if (selection.kind !== "doubles" || !isDouble(o)) return 0;
  return o.bone1 >= 5 ? 2 : 1;
}

export function knucklebonesSettle(
  o: KnucklebonesOutcome,
  selection: KnucklebonesSelection
): { multiplier: number; chits: number; win: boolean } {
  const multiplier = knucklebonesPayout(o, selection);
  const chits = knucklebonesChits(o, selection);
  return { multiplier, chits, win: multiplier > 0 };
}

const BLACK_DECK: CardId[] = ["rat", "torch", "sword", "crown", "wound", "void", "fool", "dragon"];

/** Fisher-Yates shuffle using the supplied RNG. */
function shuffleDeck(rng: Rng): CardId[] {
  const deck = [...BLACK_DECK];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** Commit a Black Draw round. Player gets two cards; dealer draws to target-3. */
export function commitBlackDraw(rng: Rng, target = 13): BlackDrawOutcome {
  const deck = shuffleDeck(rng);
  const playerInitialCards: CardId[] = [deck[0], deck[1]];
  const dealerCards: CardId[] = [];
  let nextIndex = 2;
  let dealerTotal = 0;

  while (dealerTotal < target - 3 && nextIndex < deck.length) {
    const card = deck[nextIndex++];
    dealerCards.push(card);
    dealerTotal += BLACK_VALUES[card];
  }

  const remainingPlayerDraws = deck.slice(nextIndex);

  return {
    kind: "black-draw",
    deck,
    playerInitialCards,
    dealerCards,
    remainingPlayerDraws,
    target,
  };
}

export function createBlackDrawState(outcome: BlackDrawOutcome): BlackDrawState {
  const playerHand = outcome.playerInitialCards.map((c) => BLACK_VALUES[c]);
  const playerTotal = playerHand.reduce((a, b) => a + b, 0);
  const dealerHand = outcome.dealerCards.map((c) => BLACK_VALUES[c]);
  const dealerTotal = dealerHand.reduce((a, b) => a + b, 0);
  return {
    deck: [...outcome.remainingPlayerDraws],
    playerHand,
    playerTotal,
    dealerHand,
    dealerTotal,
    nextIndex: 0,
    payoutSoFar: blackDrawPayoutForTotal(playerTotal),
    hasStood: false,
    target: outcome.target,
  };
}

export function blackDrawCardName(cardId: CardId): string {
  return cardId[0].toUpperCase() + cardId.slice(1);
}

export function blackDrawPayoutForTotal(total: number): number {
  if (total > 13) return 0;
  // Tuned by exhaustive deck enumeration. Always-standing gross return ~0.90;
  // the best simple threshold (draw until 9) is just under 1.0.
  const ladder: Record<number, number> = {
    13: 3.4,
    12: 2.75,
    11: 2.0,
    10: 1.7,
    9: 1.35,
    8: 1.35,
    7: 1.05,
    6: 1.05,
    5: 0.8,
    4: 0.8,
    3: 0,
    2: 0,
  };
  return ladder[total] ?? 0;
}

/** Draw one more card. Returns {cardValue, bust, done}. */
export function blackDrawHit(state: BlackDrawState): { cardValue: number; bust: boolean; done: boolean } {
  if (state.nextIndex >= state.deck.length) {
    return { cardValue: 0, bust: false, done: true };
  }
  const cardId = state.deck[state.nextIndex];
  const cardValue = BLACK_VALUES[cardId];
  state.playerHand.push(cardValue);
  state.playerTotal += cardValue;
  state.nextIndex++;
  state.payoutSoFar = blackDrawPayoutForTotal(state.playerTotal);
  if (state.playerTotal > state.target) {
    return { cardValue, bust: true, done: true };
  }
  if (state.nextIndex >= state.deck.length) {
    return { cardValue, bust: false, done: true };
  }
  return { cardValue, bust: false, done: false };
}

/** Resolve a Black Draw hand against the dealer total. */
export function settleBlackDraw(state: BlackDrawState): { win: boolean; multiplier: number } {
  const playerTotal = state.playerTotal;
  if (playerTotal > state.target) return { win: false, multiplier: 0 };
  const multiplier = blackDrawPayoutForTotal(playerTotal);
  if (playerTotal > state.dealerTotal || state.dealerTotal > state.target) {
    // Beating the dealer is only a "win" if the payout exceeds the wager.
    return { win: multiplier > 1, multiplier };
  }
  if (playerTotal === state.dealerTotal) return { win: false, multiplier: 0 };
  return { win: false, multiplier: 0 };
}

export interface CasinoRoundConfig {
  tier?: CasinoTier;
  knuckleSelection?: KnucklebonesSelection;
}

export function roundId(gameId: CasinoGameId, now: number = Date.now()): string {
  return `${gameId}:${now}:${Math.floor(getGameplayRng()() * 1_000_000)}`;
}

/** Begin a round: deduct wager, commit deterministic outcome. */
export function beginCasinoRound(
  state: { partyGold: number; casino: CasinoState },
  gameId: CasinoGameId,
  wager: number,
  config: CasinoRoundConfig = {}
): { ok: true; round: PendingCasinoRound } | { ok: false; reason: string } {
  if (state.casino.pendingRound) {
    return { ok: false, reason: "Finish the current wager before starting another." };
  }
  const tier = config.tier ?? MONTE_TIERS[0];
  const validation = validateBet(state.partyGold, wager, tier);
  if (!validation.ok) return { ok: false, reason: validation.reason };
  state.partyGold -= validation.bet;

  const rng = getGameplayRng();
  let outcome: CasinoCommittedOutcome;
  const pending: PendingCasinoRound = {
    roundId: roundId(gameId),
    gameId,
    wager: validation.bet,
    committedOutcome: outcome!,
    phase: "committed",
  };

  if (gameId === "three-card-monte") {
    outcome = commitMonte(config.tier ?? MONTE_TIERS[0], rng);
    pending.committedOutcome = outcome;
  } else if (gameId === "knucklebones") {
    if (!config.knuckleSelection) {
      state.partyGold += validation.bet;
      return { ok: false, reason: "Call your bet before the bones are cast." };
    }
    outcome = commitKnucklebones(rng);
    pending.committedOutcome = outcome;
    pending.knuckleSelection = config.knuckleSelection;
  } else {
    outcome = commitBlackDraw(rng);
    pending.committedOutcome = outcome;
    pending.blackDrawState = createBlackDrawState(outcome as BlackDrawOutcome);
  }

  state.casino.pendingRound = pending;
  return { ok: true, round: pending };
}

/** Resolve a completed round. Returns payout gold and chits. */
export function settleCasinoRound(
  state: { partyGold: number; casino: CasinoState; inventory: { itemId: string; identified: boolean }[]; dayCount: number },
  choice?: number
): { payout: number; chits: number; message: string } {
  const pending = state.casino.pendingRound;
  if (!pending) return { payout: 0, chits: 0, message: "No wager is pending." };
  if (pending.phase === "settled") {
    return { payout: 0, chits: 0, message: "That wager has already been settled." };
  }

  const s = state.casino.stats;
  s.gamesPlayed++;
  s.goldWagered += pending.wager;

  let win = false;
  let multiplier = 0;
  let chits = 0;
  let message = "";

  if (pending.gameId === "three-card-monte") {
    const out = pending.committedOutcome as MonteOutcome;
    const selected = typeof choice === "number" ? choice : 0;
    const r = settleMonte(out, selected);
    win = r.win;
    multiplier = r.multiplier;
    if (win) {
      if (state.casino.monteProfitDay !== state.dayCount) {
        state.casino.monteProfitDay = state.dayCount;
        state.casino.montePaidWinsToday = 0;
      }
      if (state.casino.montePaidWinsToday >= 3) {
        // After three profitable wins this expedition, correct tracking pays chits only.
        multiplier = 0;
        chits = 2;
        message = `The winning card is at position ${out.winningIndex + 1}. The house trades gold for chits.`;
      } else {
        state.casino.montePaidWinsToday++;
        message = `The winning card is at position ${out.winningIndex + 1}. You follow it.`;
      }
      s.monteWins++;
    } else {
      message = `The winning card is at position ${out.winningIndex + 1}. You lose the track.`;
    }
  } else if (pending.gameId === "knucklebones") {
    const out = pending.committedOutcome as KnucklebonesOutcome;
    const sel = pending.knuckleSelection ?? { kind: "low" };
    const r = knucklebonesSettle(out, sel);
    multiplier = r.multiplier;
    chits = r.chits;
    win = r.win;
    message = `The bones show ${out.bone1} and ${out.bone2} (total ${knucklebonesTotal(out)}).`;
    if (win) s.knucklebonesWins++;
  } else {
    const bds = pending.blackDrawState;
    if (!bds) {
      return { payout: 0, chits: 0, message: "The Black Draw hand is missing." };
    }
    const r = settleBlackDraw(bds);
    win = r.win;
    multiplier = r.multiplier;
    const partial = bds.playerTotal <= bds.target && !win && multiplier > 0;
    message = bds.playerTotal > bds.target
      ? `Your total is ${bds.playerTotal}. You overdraw and lose.`
      : partial
        ? `Your total is ${bds.playerTotal}. You edge the dealer and recover part of the stake.`
        : `Your total is ${bds.playerTotal}. ${win ? "You beat the house." : "The house stands."}`;
    if (win) s.blackDrawWins++;
  }

  const payout = Math.floor(pending.wager * multiplier);
  state.partyGold += payout;
  state.casino.prizeChits += chits;

  s.goldPaidOut += payout;
  s.gamesWon += win ? 1 : 0;
  if (win) {
    s.currentWinStreak++;
    s.bestWinStreak = Math.max(s.bestWinStreak, s.currentWinStreak);
    const net = payout - pending.wager;
    s.largestWin = Math.max(s.largestWin, net);
  } else {
    s.currentWinStreak = 0;
    s.largestLoss = Math.max(s.largestLoss, pending.wager);
  }

  state.casino.reputation += win ? 1 : 0;
  pending.phase = "settled";
  state.casino.pendingRound = undefined;

  return { payout, chits, message: `${message} ${win ? `+${payout} gold` : ""}${chits ? ` and ${chits} chits` : ""}`.trim() };
}

/** Resume an unresolved committed round on load. Does not re-roll. */
export function resumeCasinoRound(state: { casino: CasinoState }): { resumed: boolean; message: string } {
  const pending = state.casino.pendingRound;
  if (!pending) return { resumed: false, message: "" };
  if (pending.phase === "settled") {
    state.casino.pendingRound = undefined;
    return { resumed: false, message: "" };
  }
  pending.phase = "committed";
  return { resumed: true, message: "The unfinished wager is still on the table." };
}

/** Validate a bet. */
export function validateBet(gold: number, requested: number, tier: CasinoTier): { ok: true; bet: number } | { ok: false; reason: string } {
  if (!Number.isFinite(requested) || requested <= 0) {
    return { ok: false, reason: "The house does not accept empty wagers." };
  }
  if (requested > gold) {
    return { ok: false, reason: "You do not have enough gold for that wager." };
  }
  if (requested < tier.minBet) {
    return { ok: false, reason: `The minimum wager at this table is ${tier.minBet} gold.` };
  }
  if (requested > tier.maxBet) {
    return { ok: false, reason: `The maximum wager at this table is ${tier.maxBet} gold.` };
  }
  return { ok: true, bet: Math.floor(requested) };
}
