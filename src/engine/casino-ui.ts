/**
 * Casino UI controller — The Crooked Crown.
 *
 * Uses the existing DOM panel (`#combat-panel`) and "casino" GameMode.
 * Keyboard: Arrow keys / WASD to move, Enter/Space to confirm, Esc to cancel.
 *
 * Three-card monte is the signature game: the winning card is shown at the
 * starting slot, the cards flip face-down, the dealer executes discrete swaps,
 * and the player must track the winning card to its final slot.
 */

import type { GameState } from "../types";
import {
  beginCasinoRound,
  settleCasinoRound,
  resumeCasinoRound,
  type CasinoGameId,
  type KnucklebonesBet,
  MONTE_TIERS,
  availableMonteTiers,
  KNUCKLEBONES_BETS,
  type BlackDrawState,
  blackDrawHit,
  blackDrawPayoutForTotal,
  blackDrawCardName,
} from "../game/casino";

export interface CasinoControllerOptions {
  panel: HTMLElement;
  state: GameState;
  onClose: (message: string) => void;
}

const ROOT_ITEMS = [
  { key: "play", label: "Play" },
  { key: "prize", label: "Prize Cage" },
  { key: "rules", label: "House Rules" },
  { key: "record", label: "Your Record" },
  { key: "talk", label: "Talk" },
  { key: "leave", label: "Leave" },
] as const;

const GAME_ITEMS = [
  { key: "three-card-monte", label: "Three-Card Monte" },
  { key: "knucklebones", label: "Knucklebones" },
  { key: "black-draw", label: "The Black Draw" },
] as const;

const BET_PRESETS = [5, 10, 25, 50, 100];

const MONTE_SYMBOLS = ["Crown", "Skull", "Knife"];
const MONTE_WINNING = 0; // Crown is always the winning card
const FACE_DOWN = "?";

const KNUCKLE_LABELS: Record<KnucklebonesBet, string> = {
  low: "Low (2-6) · 2x",
  high: "High (8-12) · 2x",
  seven: "Seven · 5x",
  doubles: "Doubles · 4x",
  exact: "Exact total · up to 30x",
};

type Phase =
  | "root"
  | "play"
  | "game-select"
  | "monte-bet"
  | "monte-reveal"
  | "monte-shuffle"
  | "monte-reveal-result"
  | "knuckle-bet"
  | "knuckle-roll"
  | "black-bet"
  | "black-play"
  | "prize"
  | "rules"
  | "record"
  | "talk";

export class CasinoController {
  private panel: HTMLElement;
  private state: GameState;
  private onClose: (message: string) => void;

  private phase: Phase = "root";
  private index = 0;
  private menuList: ReadonlyArray<{ key: string; label: string }> = [];
  private dialogue = "";
  private flash = "";

  // Minigame transient state
  private selectedKnuckle: KnucklebonesBet = "low";
  private monteStep = 0;
  private montePositions = [0, 1, 2];
  private blackDrawState: BlackDrawState | null = null;
  private pendingAction = false; // guard against held Enter

  constructor(opts: CasinoControllerOptions) {
    this.panel = opts.panel;
    this.state = opts.state;
    this.onClose = opts.onClose;
    this.panel.style.display = "flex";
    resumeCasinoRound(this.state);
    this.dialogue = this.greeting();
    this.setMenuList(ROOT_ITEMS);
    this.render();
  }

  handleKey(key: string): boolean {
    if (this.pendingAction && (key === "Enter" || key === " ")) return true;
    const lower = key.toLowerCase();
    if (lower === "escape") {
      this.back();
      return true;
    }
    const len = this.menuList.length;
    if (lower === "arrowup" || lower === "w") {
      if (len > 0) this.index = (this.index - 1 + len) % len;
      this.render();
      return true;
    }
    if (lower === "arrowdown" || lower === "s") {
      if (len > 0) this.index = (this.index + 1) % len;
      this.render();
      return true;
    }
    if (key === "Enter" || key === " ") {
      this.confirm();
      return true;
    }
    // Root hotkeys (first letter of menu item).
    if (this.phase === "root") {
      const idx = ROOT_ITEMS.findIndex((it) => it.key.startsWith(lower));
      if (idx >= 0) {
        this.index = idx;
        this.confirm();
        return true;
      }
    }
    return false;
  }

  private greeting(): string {
    const c = this.state.casino;
    const flags = c.seenDialogueFlags;
    if (!flags.includes("greet")) {
      flags.push("greet");
      return '"Welcome to the Crooked Crown. We do not cheat," says the dealer. "The dungeon already cheats enough."';
    }
    if (c.stats.gamesWon > c.stats.gamesPlayed / 2 && !flags.includes("sharp")) {
      flags.push("sharp");
      return '"A sharp eye. The Crown remembers winners."';
    }
    return '"Place your wagers. The house is open."';
  }

  private setMenuList(list: ReadonlyArray<{ key: string; label: string }>): void {
    this.menuList = list;
    this.index = Math.min(this.index, Math.max(0, list.length - 1));
  }

  private confirm(): void {
    if (this.menuList.length === 0) return;
    const item = this.menuList[this.index];
    this.pendingAction = true;
    window.setTimeout(() => (this.pendingAction = false), 200);

    if (this.phase === "root") {
      switch (item.key) {
        case "play":
          this.phase = "play";
          this.setMenuList(GAME_ITEMS);
          break;
        case "prize":
          this.openPrize();
          break;
        case "rules":
          this.phase = "rules";
          this.setMenuList([]);
          break;
        case "record":
          this.phase = "record";
          this.setMenuList([]);
          break;
        case "talk":
          this.phase = "talk";
          this.dialogue = this.greeting();
          this.setMenuList([]);
          break;
        case "leave":
          this.close(this.greeting().replace(/"/g, "") + " The dealer nods as you leave.");
          return;
      }
      this.render();
      return;
    }

    if (this.phase === "play") {
      const gameId = item.key as CasinoGameId;
      this.index = 0;
      if (gameId === "three-card-monte") this.phase = "monte-bet";
      else if (gameId === "knucklebones") this.phase = "knuckle-bet";
      else this.phase = "black-bet";
      this.render();
      return;
    }

    if (this.phase === "monte-bet") {
      const bet = BET_PRESETS[this.index];
      const tier = availableMonteTiers(this.state.casino.unlockedGameTiers)[0];
      const tierByBet = this.state.casino.unlockedGameTiers.includes("sharps") && bet >= 25
        ? availableMonteTiers(this.state.casino.unlockedGameTiers).find((t) => bet >= t.minBet) ?? tier
        : tier;
      if (bet > this.state.partyGold) {
        this.flash = "Not enough gold.";
        this.render();
        return;
      }
      this.startMonte(bet, tierByBet);
      return;
    }

    if (this.phase === "knuckle-bet") {
      if (this.index < KNUCKLEBONES_BETS.length) {
        this.selectedKnuckle = KNUCKLEBONES_BETS[this.index];
        this.phase = "knuckle-roll";
        this.setMenuList(BET_PRESETS.map((b) => ({ key: String(b), label: `${b} gold` })));
      }
      this.render();
      return;
    }

    if (this.phase === "knuckle-roll") {
      const bet = parseInt(item.key, 10);
      if (bet > this.state.partyGold) {
        this.flash = "Not enough gold.";
        this.render();
        return;
      }
      this.playKnuckle(bet);
      return;
    }

    if (this.phase === "black-bet") {
      const bet = BET_PRESETS[this.index];
      if (bet > this.state.partyGold) {
        this.flash = "Not enough gold.";
        this.render();
        return;
      }
      this.playBlackDraw(bet);
      return;
    }

    if (this.phase === "black-play") {
      if (item.key === "draw") this.blackDrawHit();
      else if (item.key === "stand") this.blackDrawStand();
      this.render();
      return;
    }

    if (this.phase === "prize") {
      this.buyPrize(item.key);
      return;
    }
  }

  private back(): void {
    this.flash = "";
    switch (this.phase) {
      case "root":
        this.close("You step away from the table.");
        break;
      case "play":
      case "rules":
      case "record":
      case "talk":
      case "prize":
      case "monte-bet":
      case "knuckle-bet":
      case "black-bet":
        this.phase = "root";
        this.setMenuList(ROOT_ITEMS);
        break;
      case "game-select":
        this.phase = "play";
        this.setMenuList(GAME_ITEMS);
        break;
      case "knuckle-roll":
        this.phase = "knuckle-bet";
        this.setMenuList(KNUCKLEBONES_BETS.map((b) => ({ key: b, label: KNUCKLE_LABELS[b] })));
        break;
      case "black-play":
        // Cannot cancel after wager is committed
        return;
      default:
        this.phase = "root";
        this.setMenuList(ROOT_ITEMS);
    }
    this.render();
  }

  private startMonte(bet: number, tier: typeof MONTE_TIERS[0]): void {
    const result = beginCasinoRound(this.state, "three-card-monte", bet, tier);
    if (!result.ok) {
      this.flash = result.reason;
      this.render();
      return;
    }
    this.monteStep = 0;
    this.montePositions = [0, 1, 2];
    this.phase = "monte-reveal";
    this.dialogue = `"Watch the Crown," the dealer says, showing the winning card.`;
    this.setMenuList([]);
    this.render();
    window.setTimeout(() => this.runMonteShuffle(), 600);
  }

  private runMonteShuffle(): void {
    const pending = this.state.casino.pendingRound;
    if (!pending || pending.gameId !== "three-card-monte") return;
    const out = pending.committedOutcome;
    if (out.kind !== "monte") return;

    this.phase = "monte-shuffle";
    this.dialogue = "The dealer shuffles the cards.";
    this.render();

    const step = () => {
      if (this.monteStep >= out.swaps.length) {
        this.phase = "monte-reveal-result";
        this.index = 0;
        this.setMenuList([
          { key: "0", label: "Left" },
          { key: "1", label: "Middle" },
          { key: "2", label: "Right" },
        ]);
        this.dialogue = "Where is the Crown?";
        this.render();
        return;
      }
      const [a, b] = out.swaps[this.monteStep];
      // Apply the swap to the positions array.
      const pa = this.montePositions[a];
      const pb = this.montePositions[b];
      this.montePositions[a] = pb;
      this.montePositions[b] = pa;
      this.monteStep++;
      this.render();
      window.setTimeout(step, 350);
    };
    window.setTimeout(step, 350);
  }

  private finishMonte(selected: number): void {
    const result = settleCasinoRound(this.state, selected);
    this.flash = result.message;
    this.dialogue = `Payout: ${result.payout} gold. Chits: +${result.chits}.`;
    this.phase = "monte-bet";
    this.setMenuList(BET_PRESETS.map((b) => ({ key: String(b), label: `${b} gold` })));
    this.index = 0;
    this.render();
    this.maybeUnlockTiers();
  }

  private playKnuckle(bet: number): void {
    const tier = { id: "street", name: "Street", minBet: 0, maxBet: 9999, description: "" };
    const result = beginCasinoRound(this.state, "knucklebones", bet, tier);
    if (!result.ok) {
      this.flash = result.reason;
      this.render();
      return;
    }
    const settled = settleCasinoRound(this.state, this.selectedKnuckle);
    this.flash = settled.message;
    this.dialogue = `Payout: ${settled.payout} gold. Chits: +${settled.chits}.`;
    this.phase = "knuckle-bet";
    this.setMenuList(KNUCKLEBONES_BETS.map((b) => ({ key: b, label: KNUCKLE_LABELS[b] })));
    this.index = 0;
    this.render();
    this.maybeUnlockTiers();
  }

  private playBlackDraw(bet: number): void {
    const tier = { id: "street", name: "Street", minBet: 0, maxBet: 9999, description: "" };
    const result = beginCasinoRound(this.state, "black-draw", bet, tier);
    if (!result.ok) {
      this.flash = result.reason;
      this.render();
      return;
    }
    const pending = this.state.casino.pendingRound;
    if (!pending) return;
    const out = pending.committedOutcome;
    if (out.kind !== "black-draw") return;
    const playerTotal = out.playerHand.reduce((a, b) => a + b, 0);
    const bds = {
      deck: out.deck,
      playerHand: [...out.playerHand],
      playerTotal,
      dealerTotal: out.dealerHand.reduce((a, b) => a + b, 0),
      nextIndex: out.playerHand.length,
      payoutSoFar: blackDrawPayoutForTotal(playerTotal),
    };
    this.blackDrawState = bds;
    this.phase = "black-play";
    this.index = 0;
    this.setMenuList([
      { key: "draw", label: "Draw another card" },
      { key: "stand", label: `Stand (cash out ${bds.payoutSoFar}x)` },
    ]);
    this.dialogue = "The Black Draw. Face a total, or press your luck.";
    this.render();
  }

  private blackDrawHit(): void {
    if (!this.blackDrawState) return;
    const res = blackDrawHit(this.blackDrawState);
    if (res.bust) {
      const total = this.blackDrawState.playerTotal;
      settleCasinoRound(this.state, total);
      this.flash = `You drew ${res.cardValue}. Total ${total} — over the mark.`;
      this.resetAfterBlackDraw();
    } else if (res.done) {
      this.blackDrawStand();
    } else {
      this.dialogue = `You drew a ${res.cardValue}. Your total is ${this.blackDrawState.playerTotal}.`;
      this.setMenuList([
        { key: "draw", label: "Draw another card" },
        { key: "stand", label: `Stand (cash out ${this.blackDrawState.payoutSoFar}x)` },
      ]);
      this.render();
    }
  }

  private blackDrawStand(): void {
    if (!this.blackDrawState) return;
    const total = this.blackDrawState.playerTotal;
    const result = settleCasinoRound(this.state, total);
    this.flash = result.message;
    this.resetAfterBlackDraw();
    this.maybeUnlockTiers();
  }

  private resetAfterBlackDraw(): void {
    this.blackDrawState = null;
    this.phase = "black-bet";
    this.setMenuList(BET_PRESETS.map((b) => ({ key: String(b), label: `${b} gold` })));
    this.index = 0;
    this.render();
  }

  private openPrize(): void {
    this.phase = "prize";
    const chits = this.state.casino.prizeChits;
    const prizes = this.availablePrizes();
    this.setMenuList(
      prizes.map((p) => ({
        key: p.itemId,
        label: `${p.name} — ${p.chitCost} chits${chits >= p.chitCost ? "" : " (short)"}`,
      }))
    );
    this.dialogue = `"Prize Cage. ${chits} chit${chits === 1 ? "" : "s"} in your hand."`;
    this.render();
  }

  private buyPrize(itemId: string): void {
    const p = this.availablePrizes().find((x) => x.itemId === itemId);
    if (!p) return;
    if (this.state.casino.prizeChits < p.chitCost) {
      this.flash = "Come back with more chits.";
      this.render();
      return;
    }
    if (p.unique && this.state.casino.uniquePrizesClaimed.includes(itemId)) {
      this.flash = "That prize has already left the cage.";
      this.render();
      return;
    }
    this.state.casino.prizeChits -= p.chitCost;
    if (p.unique) this.state.casino.uniquePrizesClaimed.push(itemId);
    this.state.inventory.push({ itemId, identified: true });
    this.flash = `You claim ${p.name}.`;
    this.openPrize();
    this.render();
  }

  private availablePrizes() {
    return [
      { itemId: "last-coin", name: "Last Coin", chitCost: 5, unique: false },
      { itemId: "card-sharp-gloves", name: "Cardsharp's Gloves", chitCost: 25, unique: false },
      { itemId: "loaded-buckler", name: "Loaded Buckler", chitCost: 30, unique: false },
      { itemId: "house-edge", name: "House Edge", chitCost: 40, unique: false },
      { itemId: "crooked-crown", name: "Crooked Crown", chitCost: 75, unique: true },
    ].filter((p) => !p.unique || !this.state.casino.uniquePrizesClaimed.includes(p.itemId));
  }

  private maybeUnlockTiers(): void {
    const c = this.state.casino;
    if (c.stats.gamesPlayed >= 3 && !c.unlockedGameTiers.includes("sharps")) {
      c.unlockedGameTiers.push("sharps");
      this.flash = "The dealer nods. 'Sharp's Table is open to you.'";
    }
    if (c.stats.gamesPlayed >= 10 && !c.unlockedGameTiers.includes("crooked")) {
      c.unlockedGameTiers.push("crooked");
    }
  }

  private close(message: string): void {
    this.panel.style.display = "none";
    this.panel.innerHTML = "";
    this.onClose(message);
  }

  private render(): void {
    const lines: string[] = [];
    lines.push(`<div class="camp-header">[The Crooked Crown] ${this.state.partyGold}g · ${this.state.casino.prizeChits} chits</div>`);

    if (this.dialogue) {
      lines.push(`<div class="camp-party"><div class="camp-char"><span class="cc-name">${this.escape(this.dialogue)}</span></div></div>`);
    }
    if (this.flash) {
      lines.push(`<div class="camp-resting">${this.escape(this.flash)}</div>`);
      this.flash = "";
    }

    switch (this.phase) {
      case "root":
      case "play":
      case "monte-bet":
      case "knuckle-bet":
      case "knuckle-roll":
      case "black-bet":
      case "prize":
        this.renderMenu(lines);
        break;
      case "monte-reveal":
        this.renderMonteReveal(lines, true);
        break;
      case "monte-shuffle":
        this.renderMonteReveal(lines, false);
        break;
      case "monte-reveal-result":
        this.renderMonteReveal(lines, false);
        break;
      case "knuckle-roll":
        this.renderKnuckleRoll(lines);
        break;
      case "black-play":
        this.renderBlackDraw(lines);
        break;
      case "rules":
        this.renderRules(lines);
        break;
      case "record":
        this.renderRecord(lines);
        break;
      case "talk":
        break;
    }

    lines.push(`<div class="camp-done">[↑/↓] select · [Enter] confirm · [Esc] back</div>`);
    this.panel.innerHTML = lines.join("");

    // Wire monte selection if in reveal-result phase
    if (this.phase === "monte-reveal-result") {
      const buttons = this.panel.querySelectorAll<HTMLDivElement>(".monte-slot");
      buttons.forEach((btn, i) => {
        btn.style.cursor = "pointer";
        btn.onclick = () => {
          this.index = i;
          this.finishMonte(i);
        };
        if (i === this.index) btn.classList.add("selected-card");
      });
    }
  }

  private renderMenu(lines: string[]): void {
    if (this.menuList.length === 0) return;
    lines.push(`<div class="camp-party">`);
    for (let i = 0; i < this.menuList.length; i++) {
      const it = this.menuList[i];
      const marker = i === this.index ? "▶" : " ";
      lines.push(
        `<div class="camp-char" data-idx="${i}">${marker} <span class="cc-name">${this.escape(it.label)}</span></div>`
      );
    }
    lines.push(`</div>`);
  }

  private renderMonteReveal(lines: string[], showWinning: boolean): void {
    const cards = this.montePositions.map((symbolIdx) => {
      if (showWinning && symbolIdx === MONTE_WINNING) return MONTE_SYMBOLS[symbolIdx];
      return FACE_DOWN;
    });
    lines.push(`<div class="camp-party monte-table" style="display:flex;gap:1rem;justify-content:center;">`);
    for (let i = 0; i < 3; i++) {
      const selected = this.phase === "monte-reveal-result" && i === this.index ? "selected-card" : "";
      lines.push(`<div class="camp-char monte-slot ${selected}" data-idx="${i}" style="min-width:5rem;text-align:center;">${cards[i]}</div>`);
    }
    lines.push(`</div>`);
    if (this.phase === "monte-shuffle") {
      lines.push(`<div class="camp-resting">Swap ${this.monteStep}</div>`);
    }
  }

  private renderKnuckleRoll(lines: string[]): void {
    const pending = this.state.casino.pendingRound;
    if (!pending || pending.gameId !== "knucklebones") return;
    const out = pending.committedOutcome;
    if (out.kind !== "knucklebones") return;
    lines.push(`<div class="camp-party"><div class="camp-char"><span class="cc-name">${out.bone1} · ${out.bone2} (total ${out.bone1 + out.bone2})</span></div></div>`);
  }

  private renderBlackDraw(lines: string[]): void {
    if (!this.blackDrawState) return;
    const total = this.blackDrawState.playerTotal;
    const played = this.blackDrawState.deck.slice(0, this.blackDrawState.nextIndex).map((id) => blackDrawCardName(id)).join(" ");
    lines.push(`<div class="camp-party"><div class="camp-char"><span class="cc-name">Your total: ${total}</span><span class="cc-num">Cards: ${played}</span></div></div>`);
  }

  private renderRules(lines: string[]): void {
    const rules = [
      "Three-Card Monte: watch the Crown, follow the swaps, pick the final slot. Correct = 3x.",
      "Knucklebones: two six-sided bones. Low (2-6) or High (8-12) pays 2x; Seven pays 5x; Doubles 4x; Exact up to 30x.",
      "The Black Draw: draw to 13 or less. Cash out at any point; payout climbs with total. Over 13 is a bust.",
      "Prize Cage: chits from wins can buy side-grade gear. Unique prizes are one per customer.",
      "No debt, no negative wagers, no wagering quest items or equipped gear.",
    ];
    lines.push(`<div class="camp-party">`);
    for (const r of rules) {
      lines.push(`<div class="camp-char"><span class="cc-num">- ${this.escape(r)}</span></div>`);
    }
    lines.push(`</div>`);
  }

  private renderRecord(lines: string[]): void {
    const s = this.state.casino.stats;
    lines.push(`<div class="camp-party">`);
    lines.push(`<div class="camp-char"><span class="cc-name">Played: ${s.gamesPlayed} · Won: ${s.gamesWon}</span></div>`);
    lines.push(`<div class="camp-char"><span class="cc-name">Wagered: ${s.goldWagered} · Paid: ${s.goldPaidOut}</span></div>`);
    lines.push(`<div class="camp-char"><span class="cc-name">Largest win: ${s.largestWin} · Largest loss: ${s.largestLoss}</span></div>`);
    lines.push(`<div class="camp-char"><span class="cc-name">Streak: ${s.currentWinStreak} (best ${s.bestWinStreak})</span></div>`);
    lines.push(`<div class="camp-char"><span class="cc-name">Chits: ${this.state.casino.prizeChits}</span></div>`);
    lines.push(`</div>`);
  }

  private escape(text: string): string {
    return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
  }
}
