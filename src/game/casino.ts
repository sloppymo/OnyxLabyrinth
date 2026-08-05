/**
 * Casino engine — pure, deterministic gambling logic for The Crooked Crown.
 *
 * All gameplay outcomes use the global gameplay RNG (getGameplayRng).
 * Cosmetic shuffle variants use a separate cosmetic RNG so that changing
 * animation speed/seed never changes who wins.
 *
 * Save/load: GameState.casino is a stable CasinoState. Pending rounds are
 * committed as plain objects; on load the exact same result resolves without
 * reroll.
 */

import { getGameplayRng, type Rng } from "./rng";

export type CasinoGameId = "three-card-monte" | "knucklebones" | "black-draw";

export type CasinoRoundPhase =
  | "wagered"
  | "committed"
  | "revealing"
  | "settled";

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

export interface BlackDrawOutcome {
  kind: "black-draw";
  deck: string[];
  playerHand: number[];
  dealerHand: number[];
  bustIndex: number;
}

export type CasinoCommittedOutcome =
  | MonteOutcome
  | KnucklebonesOutcome
  | BlackDrawOutcome;

export interface PendingCasinoRound {
  roundId: string;
  gameId: CasinoGameId;
  wager: number;
  committedOutcome: CasinoCommittedOutcome;
  phase: CasinoRoundPhase;
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

/** Normalize a partial or older casino payload. */
export function normalizeCasinoState(raw?: unknown): CasinoState {
  const base = createCasinoState();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;

  const clamp = (n: unknown, def: number) =>
    typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : def;

  base.prizeChits = clamp(r.prizeChits, 0);
  base.reputation = clamp(r.reputation, 0);
  base.unlockedGameTiers = Array.isArray(r.unlockedGameTiers)
    ? r.unlockedGameTiers.filter((x): x is string => typeof x === "string")
    : base.unlockedGameTiers;
  base.uniquePrizesClaimed = Array.isArray(r.uniquePrizesClaimed)
    ? r.uniquePrizesClaimed.filter((x): x is string => typeof x === "string")
    : base.uniquePrizesClaimed;
  base.seenDialogueFlags = Array.isArray(r.seenDialogueFlags)
    ? r.seenDialogueFlags.filter((x): x is string => typeof x === "string")
    : base.seenDialogueFlags;

  const rawStats = r.stats as Record<string, unknown> | undefined;
  if (rawStats) {
    const s = base.stats;
    s.gamesPlayed = clamp(rawStats.gamesPlayed, 0);
    s.gamesWon = clamp(rawStats.gamesWon, 0);
    s.goldWagered = clamp(rawStats.goldWagered, 0);
    s.goldPaidOut = clamp(rawStats.goldPaidOut, 0);
    s.largestWin = clamp(rawStats.largestWin, 0);
    s.largestLoss = clamp(rawStats.largestLoss, 0);
    s.currentWinStreak = clamp(rawStats.currentWinStreak, 0);
    s.bestWinStreak = clamp(rawStats.bestWinStreak, 0);
    s.monteWins = clamp(rawStats.monteWins, 0);
    s.knucklebonesWins = clamp(rawStats.knucklebonesWins, 0);
    s.blackDrawWins = clamp(rawStats.blackDrawWins, 0);
  }

  const rawPending = r.pendingRound as Record<string, unknown> | undefined;
  if (rawPending && typeof rawPending.gameId === "string" && typeof rawPending.wager === "number") {
    base.pendingRound = {
      roundId: String(rawPending.roundId ?? ""),
      gameId: rawPending.gameId as CasinoGameId,
      wager: clamp(rawPending.wager, 0),
      committedOutcome: rawPending.committedOutcome as CasinoCommittedOutcome,
      phase: (String(rawPending.phase ?? "committed") as CasinoRoundPhase),
    };
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
export function settleMonte(outcome: MonteOutcome, selectedIndex: number): { win: boolean; multiplier: number } {
  const win = selectedIndex === outcome.winningIndex;
  return { win, multiplier: win ? 3 : 0 };
}

/** Apply one swap step for animation replay. */
export function applySwapStep(position: number, [a, b]: [number, number]): number {
  if (position === a) return b;
  if (position === b) return a;
  return position;
}

export const KNUCKLEBONES_BETS = ["low", "high", "seven", "doubles", "exact"] as const;
export type KnucklebonesBet = (typeof KNUCKLEBONES_BETS)[number];

export function commitKnucklebones(rng: Rng): KnucklebonesOutcome {
  return { kind: "knucklebones", bone1: 1 + Math.floor(rng() * 6), bone2: 1 + Math.floor(rng() * 6) };
}

export function knucklebonesTotal(o: KnucklebonesOutcome): number {
  return o.bone1 + o.bone2;
}

export function isDouble(o: KnucklebonesOutcome): boolean {
  return o.bone1 === o.bone2;
}

export function knucklebonesPayout(o: KnucklebonesOutcome, bet: KnucklebonesBet): number {
  const total = knucklebonesTotal(o);
  switch (bet) {
    case "low":
      return total >= 2 && total <= 6 ? 2 : 0;
    case "high":
      return total >= 8 && total <= 12 ? 2 : 0;
    case "seven":
      return total === 7 ? 5 : 0;
    case "doubles":
      return isDouble(o) ? 4 : 0;
    case "exact": {
      // exact total: rare totals pay more
      const exactPayouts: Record<number, number> = { 2: 30, 3: 15, 4: 10, 5: 8, 6: 6, 7: 0, 8: 6, 9: 8, 10: 10, 11: 15, 12: 30 };
      return exactPayouts[total] ?? 0;
    }
    default:
      return 0;
  }
}

export function knucklebonesChits(o: KnucklebonesOutcome): number {
  if (isDouble(o) && o.bone1 >= 5) return 2;
  if (o.bone1 === 1 && o.bone2 === 1) return 3;
  if (isDouble(o)) return 1;
  return 0;
}

const BLACK_DECK = ["rat", "torch", "sword", "crown", "wound", "void", "fool", "dragon"] as const;
const BLACK_VALUES: Record<string, number> = { rat: 2, torch: 3, sword: 4, crown: 5, wound: 6, void: 7, fool: 8, dragon: 9 };

/** Fisher-Yates shuffle using the supplied RNG. */
function shuffleDeck(rng: Rng): string[] {
  const deck = [...BLACK_DECK];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export interface BlackDrawState {
  deck: string[];
  playerHand: number[];
  playerTotal: number;
  dealerTotal: number;
  nextIndex: number;
  payoutSoFar: number;
}

/** Commit a Black Draw round: a full deck and the hidden dealer's target hand. */
export function commitBlackDraw(rng: Rng, target = 13): BlackDrawOutcome {
  const deck = shuffleDeck(rng);
  const playerHand: number[] = [];
  const dealerHand: number[] = [];
  let nextIndex = 0;
  let playerTotal = 0;
  let dealerTotal = 0;

  // Deal two face-up to player, one to dealer
  playerHand.push(BLACK_VALUES[deck[nextIndex++]]);
  playerHand.push(BLACK_VALUES[deck[nextIndex++]]);
  playerTotal = playerHand.reduce((a, b) => a + b, 0);

  // Dealer draws until at or above target-3, but may overshoot
  while (dealerTotal < target - 3 && nextIndex < deck.length) {
    dealerHand.push(BLACK_VALUES[deck[nextIndex++]]);
    dealerTotal = dealerHand.reduce((a, b) => a + b, 0);
  }

  // Where the player busts if they keep drawing
  let bustIndex = nextIndex;
  let bustTotal = playerTotal;
  while (bustTotal <= target && bustIndex < deck.length) {
    bustTotal += BLACK_VALUES[deck[bustIndex++]];
  }

  return { kind: "black-draw", deck, playerHand, dealerHand, bustIndex };
}

export function blackDrawCardName(cardId: string): string {
  return cardId[0].toUpperCase() + cardId.slice(1);
}

/** Draw one more card; returns {state, card, bust} or {state, done, win} if stand. */
export function blackDrawHit(state: BlackDrawState): { state: BlackDrawState; cardValue: number; bust: boolean; done: boolean } {
  if (state.nextIndex >= state.deck.length) {
    return { state, cardValue: 0, bust: false, done: true };
  }
  const cardId = state.deck[state.nextIndex];
  const cardValue = BLACK_VALUES[cardId];
  state.playerHand.push(cardValue);
  state.playerTotal += cardValue;
  state.nextIndex++;
  state.payoutSoFar = blackDrawPayoutForTotal(state.playerTotal);
  if (state.playerTotal > 13) {
    return { state, cardValue, bust: true, done: true };
  }
  return { state, cardValue, bust: false, done: false };
}

export function blackDrawPayoutForTotal(total: number): number {
  if (total > 13) return 0;
  const ladder: Record<number, number> = { 13: 10, 12: 8, 11: 6, 10: 5, 9: 4, 8: 3, 7: 2, 6: 2, 5: 1, 4: 1, 3: 0, 2: 0 };
  return ladder[total] ?? 0;
}

/** Stand: player total vs dealer total on target 13. Player wins or loses wager. */
export function blackDrawStand(outcome: BlackDrawOutcome, playerTotal: number): { win: boolean; multiplier: number } {
  const dealerTotal = outcome.dealerHand.reduce((a, b) => a + b, 0);
  if (playerTotal > 13) return { win: false, multiplier: 0 };
  if (playerTotal > dealerTotal || dealerTotal > 13) return { win: true, multiplier: blackDrawPayoutForTotal(playerTotal) };
  if (playerTotal === dealerTotal) return { win: false, multiplier: 0 }; // push counts as house win for simplicity
  return { win: false, multiplier: 0 };
}

/** Bet validation; returns a normalized bet or a refusal message. */
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
  if (requested > gold) {
    return { ok: false, reason: "You cannot wager gold you do not carry." };
  }
  return { ok: true, bet: Math.floor(requested) };
}

export function roundId(gameId: CasinoGameId, now: number = Date.now()): string {
  return `${gameId}:${now}:${Math.floor(getGameplayRng()() * 1_000_000)}`;
}

/** Begin a round: deduct wager, commit deterministic outcome. */
export function beginCasinoRound(
  state: { partyGold: number; casino: CasinoState },
  gameId: CasinoGameId,
  wager: number,
  tier: CasinoTier
): { ok: true; round: PendingCasinoRound } | { ok: false; reason: string } {
  if (state.casino.pendingRound) {
    return { ok: false, reason: "Finish the current wager before starting another." };
  }
  const validation = validateBet(state.partyGold, wager, tier);
  if (!validation.ok) return { ok: false, reason: validation.reason };
  state.partyGold -= validation.bet;

  const rng = getGameplayRng();
  let outcome: CasinoCommittedOutcome;
  if (gameId === "three-card-monte") {
    outcome = commitMonte(tier, rng);
  } else if (gameId === "knucklebones") {
    outcome = commitKnucklebones(rng);
  } else {
    outcome = commitBlackDraw(rng);
  }

  const pending: PendingCasinoRound = {
    roundId: roundId(gameId),
    gameId,
    wager: validation.bet,
    committedOutcome: outcome,
    phase: "committed",
  };
  state.casino.pendingRound = pending;
  return { ok: true, round: pending };
}

/** Resolve a completed round. Returns payout gold and chits. */
export function settleCasinoRound(
  state: { partyGold: number; casino: CasinoState; inventory: { itemId: string; identified: boolean }[] },
  choice?: number | string
): { payout: number; chits: number; message: string } {
  const pending = state.casino.pendingRound;
  if (!pending) return { payout: 0, chits: 0, message: "No wager is pending." };
  if (pending.phase === "settled") {
    // Idempotent; already paid
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
    message = win
      ? `The winning card is at position ${out.winningIndex + 1}. You follow it.`
      : `The winning card is at position ${out.winningIndex + 1}. You lose the track.`;
    if (win) s.monteWins++;
  } else if (pending.gameId === "knucklebones") {
    const out = pending.committedOutcome as KnucklebonesOutcome;
    const bet = (typeof choice === "string" ? choice : "low") as KnucklebonesBet;
    multiplier = knucklebonesPayout(out, bet);
    chits = knucklebonesChits(out);
    win = multiplier > 0;
    message = `The bones show ${out.bone1} and ${out.bone2} (total ${knucklebonesTotal(out)}).`;
    if (win) s.knucklebonesWins++;
  } else {
    const out = pending.committedOutcome as BlackDrawOutcome;
    const total = typeof choice === "number" ? choice : out.playerHand.reduce((a, b) => a + b, 0);
    const r = blackDrawStand(out, total);
    win = r.win;
    multiplier = r.multiplier;
    message = total > 13
      ? `Your total is ${total}. You overdraw and lose.`
      : `Your total is ${total}. ${win ? "You beat the house." : "The house stands."}`;
    if (win) s.blackDrawWins++;
  }

  const payout = win ? Math.floor(pending.wager * multiplier) : 0;
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
  state.casino.pendingRound = undefined;
  pending.phase = "settled";

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
  // A committed or revealing round is still mid-game. Put it back to committed
  // so the player can re-run the reveal animation and settle manually.
  pending.phase = "committed";
  return { resumed: true, message: "The unfinished wager is still on the table." };
}
