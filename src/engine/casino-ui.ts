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
import { autoSave } from "../game/save";
import {
  beginCasinoRound,
  settleCasinoRound,
  resumeCasinoRound,
  type CasinoGameId,
  type CasinoTier,
  type KnucklebonesBet,
  type KnucklebonesSelection,
  type MonteOutcome,
  MONTE_TIERS,
  monteTierForBet,
  KNUCKLEBONES_BETS,
  type BlackDrawState,
  blackDrawHit,
  blackDrawCardName,
  type BlackDrawOutcome,
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

const EXACT_TOTALS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const EXACT_PAYOUTS: Record<number, number> = {
  2: 30, 3: 15, 4: 10, 5: 8, 6: 6, 7: 0, 8: 6, 9: 8, 10: 10, 11: 15, 12: 30,
};

type Phase =
  | "root"
  | "play"
  | "game-select"
  | "monte-bet"
  | "monte-reveal"
  | "monte-shuffle"
  | "monte-reveal-result"
  | "monte-settled"
  | "knuckle-bet"
  | "knuckle-exact"
  | "knuckle-wager"
  | "knuckle-roll"
  | "black-bet"
  | "black-play"
  | "black-settled"
  | "prize"
  | "prize-confirm"
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
  private exactTotal = 7;
  private selectedPrizeId = "";
  private monteStep = 0;
  private montePositions = [0, 1, 2];
  private monteSpeed = 350;
  private blackDrawState: BlackDrawState | null = null;
  private pendingAction = false;
  private activeTimeouts: number[] = [];
  private closing = false;

  constructor(opts: CasinoControllerOptions) {
    this.panel = opts.panel;
    this.state = opts.state;
    this.onClose = opts.onClose;
    this.panel.style.display = "flex";
    resumeCasinoRound(this.state);
    this.dialogue = this.greeting();
    this.setMenuList(ROOT_ITEMS);
    this.render();
    this.resumePending();
  }

  private clearTimeouts(): void {
    for (const id of this.activeTimeouts) {
      window.clearTimeout(id);
    }
    this.activeTimeouts = [];
  }

  private queueTimeout(fn: () => void, ms: number): number {
    const id = window.setTimeout(() => {
      this.activeTimeouts = this.activeTimeouts.filter((x) => x !== id);
      fn();
    }, ms);
    this.activeTimeouts.push(id);
    return id;
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
    this.queueTimeout(() => (this.pendingAction = false), 200);

    if (this.phase === "root") {
      switch (item.key) {
        case "play":
          this.phase = "play";
          this.setMenuList(GAME_ITEMS);
          break;
        case "prize":
          this.openPrize();
          return;
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
      if (gameId === "three-card-monte") {
        this.phase = "monte-bet";
        this.setMenuList(BET_PRESETS.map((b) => ({ key: String(b), label: this.monteBetLabel(b) })));
      } else if (gameId === "knucklebones") {
        this.phase = "knuckle-bet";
        this.setMenuList(KNUCKLEBONES_BETS.map((b) => ({ key: b, label: KNUCKLE_LABELS[b] })));
      } else {
        this.phase = "black-bet";
        this.setMenuList(BET_PRESETS.map((b) => ({ key: String(b), label: `${b} gold` })));
      }
      this.render();
      return;
    }

    if (this.phase === "monte-bet") {
      const bet = BET_PRESETS[this.index];
      if (bet > this.state.partyGold) {
        this.flash = "Not enough gold.";
        this.render();
        return;
      }
      const tier = monteTierForBet(bet, this.state.casino.unlockedGameTiers);
      this.startMonte(bet, tier);
      return;
    }

    if (this.phase === "monte-reveal-result") {
      this.finishMonte(this.index);
      return;
    }

    if (this.phase === "monte-settled") {
      this.phase = "monte-bet";
      this.setMenuList(BET_PRESETS.map((b) => ({ key: String(b), label: this.monteBetLabel(b) })));
      this.index = 0;
      this.render();
      return;
    }

    if (this.phase === "knuckle-bet") {
      this.selectedKnuckle = item.key as KnucklebonesBet;
      if (this.selectedKnuckle === "exact") {
        this.phase = "knuckle-exact";
        this.setMenuList(EXACT_TOTALS.map((t) => ({ key: String(t), label: `Call ${t} · ${EXACT_PAYOUTS[t]}x` })));
        this.index = 6; // default 7
      } else {
        this.phase = "knuckle-wager";
        this.setMenuList(BET_PRESETS.map((b) => ({ key: String(b), label: `${b} gold` })));
      }
      this.render();
      return;
    }

    if (this.phase === "knuckle-exact") {
      this.exactTotal = parseInt(item.key, 10);
      this.phase = "knuckle-wager";
      this.setMenuList(BET_PRESETS.map((b) => ({ key: String(b), label: `${b} gold` })));
      this.render();
      return;
    }

    if (this.phase === "knuckle-wager") {
      const bet = parseInt(item.key, 10);
      if (bet > this.state.partyGold) {
        this.flash = "Not enough gold.";
        this.render();
        return;
      }
      this.playKnuckle(bet);
      return;
    }

    if (this.phase === "knuckle-roll") {
      this.phase = "knuckle-bet";
      this.setMenuList(KNUCKLEBONES_BETS.map((b) => ({ key: b, label: KNUCKLE_LABELS[b] })));
      this.index = 0;
      this.render();
      this.maybeUnlockTiers();
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
      return;
    }

    if (this.phase === "black-settled") {
      this.phase = "black-bet";
      this.setMenuList(BET_PRESETS.map((b) => ({ key: String(b), label: `${b} gold` })));
      this.index = 0;
      this.render();
      this.maybeUnlockTiers();
      return;
    }

    if (this.phase === "prize") {
      this.selectedPrizeId = item.key;
      this.phase = "prize-confirm";
      const p = this.availablePrizes().find((x) => x.itemId === item.key)!;
      this.setMenuList([
        { key: "buy", label: `Buy ${p.name} for ${p.chitCost} chits` },
        { key: "cancel", label: "Cancel" },
      ]);
      this.render();
      return;
    }

    if (this.phase === "prize-confirm") {
      if (item.key === "buy") this.buyPrize(this.selectedPrizeId);
      else this.openPrize();
      return;
    }
  }

  private monteBetLabel(bet: number): string {
    const tier = monteTierForBet(bet, this.state.casino.unlockedGameTiers);
    return `${bet} gold · ${tier.name}`;
  }

  private back(): void {
    this.flash = "";
    this.clearTimeouts();
    switch (this.phase) {
      case "root":
        this.close("You step away from the table.");
        break;
      case "play":
      case "rules":
      case "record":
      case "talk":
      case "prize-confirm":
        this.phase = "root";
        this.setMenuList(ROOT_ITEMS);
        break;
      case "monte-bet":
      case "monte-settled":
      case "knuckle-bet":
      case "knuckle-wager":
      case "knuckle-roll":
      case "black-bet":
      case "black-settled":
      case "prize":
        this.phase = "root";
        this.setMenuList(ROOT_ITEMS);
        break;
      case "game-select":
        this.phase = "play";
        this.setMenuList(GAME_ITEMS);
        break;
      case "monte-reveal":
      case "monte-shuffle":
      case "monte-reveal-result":
      case "black-play":
        // Cannot cancel a committed wager mid-game; Esc still animates to reveal.
        return;
      case "knuckle-exact":
        this.phase = "knuckle-bet";
        this.setMenuList(KNUCKLEBONES_BETS.map((b) => ({ key: b, label: KNUCKLE_LABELS[b] })));
        break;
      default:
        this.phase = "root";
        this.setMenuList(ROOT_ITEMS);
    }
    this.render();
  }

  private startMonte(bet: number, tier: CasinoTier): void {
    const result = beginCasinoRound(this.state, "three-card-monte", bet, { tier });
    if (!result.ok) {
      this.flash = result.reason;
      this.render();
      return;
    }
    autoSave(this.state);
    this.monteStep = 0;
    this.montePositions = [0, 1, 2];
    this.monteSpeed = Math.max(120, 400 - (MONTE_TIERS.findIndex((t) => t.id === tier.id) * 70));
    this.phase = "monte-reveal";
    this.dialogue = `"Watch the Crown," the dealer says, showing the winning card.`;
    this.setMenuList([]);
    this.render();
    this.queueTimeout(() => this.runMonteShuffle(), 600);
  }

  private runMonteShuffle(): void {
    const pending = this.state.casino.pendingRound;
    if (!pending || pending.gameId !== "three-card-monte") return;
    const out = pending.committedOutcome as MonteOutcome;

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
      const pa = this.montePositions[a];
      const pb = this.montePositions[b];
      this.montePositions[a] = pb;
      this.montePositions[b] = pa;
      this.monteStep++;
      this.positionMonteCards();
      this.updateMonteMessage();
      this.queueTimeout(step, this.monteSpeed);
    };
    this.queueTimeout(step, this.monteSpeed);
  }

  private finishMonte(selected: number): void {
    const result = settleCasinoRound(this.state, selected);
    autoSave(this.state);
    this.flash = result.message;
    this.dialogue = `Payout: ${result.payout} gold. Chits: +${result.chits}.`;
    this.phase = "monte-settled";
    this.setMenuList([{ key: "again", label: "Play again" }]);
    this.index = 0;
    this.render();
    this.maybeUnlockTiers();
  }

  private playKnuckle(bet: number): void {
    const sel: KnucklebonesSelection =
      this.selectedKnuckle === "exact"
        ? { kind: "exact", total: this.exactTotal }
        : { kind: this.selectedKnuckle };
    const tier = { id: "street", name: "Street", minBet: 0, maxBet: 9999, description: "" };
    const result = beginCasinoRound(this.state, "knucklebones", bet, { tier, knuckleSelection: sel });
    if (!result.ok) {
      this.flash = result.reason;
      this.render();
      return;
    }
    autoSave(this.state);
    this.phase = "knuckle-roll";
    this.setMenuList([{ key: "ok", label: "Accept" }]);
    this.index = 0;
    this.dialogue = "The bones are cast.";
    this.render();
  }

  private playBlackDraw(bet: number): void {
    const tier = { id: "street", name: "Street", minBet: 0, maxBet: 9999, description: "" };
    const result = beginCasinoRound(this.state, "black-draw", bet, { tier });
    if (!result.ok) {
      this.flash = result.reason;
      this.render();
      return;
    }
    autoSave(this.state);
    const pending = this.state.casino.pendingRound;
    if (!pending || pending.gameId !== "black-draw") return;
    this.blackDrawState = pending.blackDrawState ?? null;
    this.phase = "black-play";
    this.index = 0;
    this.setBlackDrawMenu();
    this.dialogue = "The Black Draw. Face a total, or press your luck.";
    this.render();
  }

  private setBlackDrawMenu(): void {
    if (!this.blackDrawState) return;
    this.setMenuList([
      { key: "draw", label: "Draw another card" },
      { key: "stand", label: `Stand at ${this.blackDrawState.payoutSoFar}x` },
    ]);
  }

  private blackDrawHit(): void {
    if (!this.blackDrawState) return;
    const res = blackDrawHit(this.blackDrawState);
    const pending = this.state.casino.pendingRound;
    if (pending) {
      pending.blackDrawState = this.blackDrawState;
      autoSave(this.state);
    }
    if (res.bust) {
      const result = settleCasinoRound(this.state);
      autoSave(this.state);
      this.flash = `You drew ${res.cardValue}. Total ${this.blackDrawState.playerTotal} — over the mark.`;
      this.dialogue = result.message;
      this.blackDrawState.hasStood = true;
      this.phase = "black-settled";
      this.setMenuList([{ key: "again", label: "Play again" }]);
      this.index = 0;
      this.render();
      this.maybeUnlockTiers();
    } else if (res.done) {
      this.blackDrawStand();
    } else {
      this.dialogue = `You drew a ${res.cardValue}. Your total is ${this.blackDrawState.playerTotal}.`;
      this.setBlackDrawMenu();
      this.render();
    }
  }

  private blackDrawStand(): void {
    if (!this.blackDrawState || this.blackDrawState.hasStood) return;
    this.blackDrawState.hasStood = true;
    const pending = this.state.casino.pendingRound;
    if (pending) {
      pending.blackDrawState = this.blackDrawState;
      autoSave(this.state);
    }
    const result = settleCasinoRound(this.state);
    autoSave(this.state);
    this.flash = result.message;
    this.dialogue = `Payout: ${result.payout} gold.`;
    this.phase = "black-settled";
    this.setMenuList([{ key: "again", label: "Play again" }]);
    this.index = 0;
    this.render();
    this.maybeUnlockTiers();
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
    autoSave(this.state);
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
    if (c.stats.gamesPlayed >= 5 && !c.unlockedGameTiers.includes("crooked")) {
      c.unlockedGameTiers.push("crooked");
    }
    if (c.stats.gamesPlayed >= 10 && !c.unlockedGameTiers.includes("challenge")) {
      c.unlockedGameTiers.push("challenge");
    }
  }

  private resumePending(): void {
    const pending = this.state.casino.pendingRound;
    if (!pending) return;
    this.flash = "The unfinished wager is still on the table.";
    if (pending.gameId === "three-card-monte") {
      this.monteStep = 0;
      this.montePositions = [0, 1, 2];
      this.phase = "monte-reveal";
      this.dialogue = `"Watch the Crown," the dealer says, showing the winning card.`;
      this.setMenuList([]);
      this.render();
      this.queueTimeout(() => this.runMonteShuffle(), 600);
    } else if (pending.gameId === "knucklebones") {
      this.phase = "knuckle-roll";
      this.setMenuList([{ key: "ok", label: "Accept" }]);
      this.index = 0;
      this.dialogue = "The bones were cast before you left.";
      this.render();
    } else if (pending.gameId === "black-draw") {
      this.blackDrawState = pending.blackDrawState ?? null;
      this.phase = "black-play";
      this.index = 0;
      this.setBlackDrawMenu();
      this.dialogue = "The Black Draw is still in your hand.";
      this.render();
    }
  }

  private close(message: string): void {
    this.closing = true;
    this.clearTimeouts();
    this.panel.style.display = "none";
    this.panel.innerHTML = "";
    this.onClose(message);
  }

  private render(): void {
    if (this.closing) return;
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
      case "monte-settled":
      case "knuckle-bet":
      case "knuckle-exact":
      case "knuckle-wager":
      case "knuckle-roll":
      case "black-bet":
      case "black-settled":
      case "prize":
      case "prize-confirm":
        this.renderMenu(lines);
        break;
      case "monte-reveal":
      case "monte-shuffle":
      case "monte-reveal-result":
        this.renderMonte(lines);
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

    if (this.phase === "monte-reveal" || this.phase === "monte-shuffle" || this.phase === "monte-reveal-result") {
      this.positionMonteCards();
    }

    // Wire click handlers for Monte result selection
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

  private renderMonte(lines: string[]): void {
    const showWinning = this.phase === "monte-reveal";
    lines.push(`<div class="camp-party monte-table" style="display:flex;gap:1rem;justify-content:center;position:relative;height:3rem;margin:0.5rem 0;">`);
    for (let i = 0; i < 3; i++) {
      const symbolIdx = this.montePositions[i];
      const label = showWinning && symbolIdx === MONTE_WINNING ? MONTE_SYMBOLS[symbolIdx] : FACE_DOWN;
      const selected = this.phase === "monte-reveal-result" && i === this.index ? "selected-card" : "";
      lines.push(
        `<div class="camp-char monte-slot ${selected}" data-idx="${i}" data-card-id="${symbolIdx}" style="min-width:5rem;text-align:center;position:absolute;left:${i * 33}%;transition:left ${this.monteSpeed}ms;">${label}</div>`
      );
    }
    lines.push(`</div>`);
    lines.push(`<div class="monte-message camp-resting">${this.phase === "monte-shuffle" ? `Swap ${this.monteStep}` : ""}</div>`);
  }

  private positionMonteCards(): void {
    const cards = this.panel.querySelectorAll<HTMLDivElement>(".monte-slot");
    for (const card of cards) {
      const cardId = Number(card.getAttribute("data-card-id"));
      const slot = this.montePositions.indexOf(cardId);
      if (slot >= 0) {
        card.style.left = `${slot * 33}%`;
      }
    }
  }

  private updateMonteMessage(): void {
    const el = this.panel.querySelector<HTMLDivElement>(".monte-message");
    if (el) el.textContent = `Swap ${this.monteStep}`;
  }

  private renderBlackDraw(lines: string[]): void {
    if (!this.blackDrawState) return;
    const total = this.blackDrawState.playerTotal;
    const out = this.state.casino.pendingRound?.committedOutcome as BlackDrawOutcome | undefined;
    const initial = (out?.playerInitialCards ?? []).map((c) => blackDrawCardName(c));
    const drawn = this.blackDrawState.playerHand
      .slice(2)
      .map((_, i) => blackDrawCardName(this.blackDrawState!.deck[i]));
    lines.push(`<div class="camp-party"><div class="camp-char"><span class="cc-name">Your total: ${total}</span><span class="cc-num">Cards: ${[...initial, ...drawn].join(" ")} · Stand at ${this.blackDrawState.payoutSoFar}x</span></div></div>`);
  }

  private renderRules(lines: string[]): void {
    const rules = [
      "Three-Card Monte: watch the Crown, follow the swaps, pick the final slot. Correct = 2x.",
      "Knucklebones: two six-sided bones. Low (2-6) or High (8-12) pays 2x; Seven pays 5x; Doubles 4x; called Exact total pays up to 30x.",
      "The Black Draw: draw to 13 or less. Stand at any point; the displayed multiplier is awarded if you beat the dealer. Over 13 is a bust.",
      "Prize Cage: chits from a winning Doubles bet can buy side-grade gear. Unique prizes are one per customer.",
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
