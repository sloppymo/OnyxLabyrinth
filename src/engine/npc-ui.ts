/**
 * Dungeon NPC interaction overlay — opened by stepping onto an "npc" tile.
 *
 * Root menu: Talk / Barter / Give / Steal / Attack / Leave. Talk offers the
 * NPC's visible topics plus free-typed keywords (hidden topics reward
 * attentive players). Attack — and a botched Steal — hand off to main.ts to
 * start a fight against the NPC's formation.
 *
 * main.ts borrows "title" mode while the panel is open (same pattern as the
 * save and grimoire menus) so dungeon input pauses.
 */

import type { GameState } from "../types";
import type { NPCDef, NPCTradeDef } from "../data/floors";
import { ITEMS_BY_ID, displayNameFor } from "../data/items";
import {
  greet,
  moodOf,
  visibleTopics,
  askTopic,
  availableTrades,
  doTrade,
  giveItem,
  stealFrom,
  type NPCActionResult,
} from "../game/npc";

type Phase = "root" | "talk" | "ask" | "barter" | "give";

const ROOT_ITEMS = [
  { key: "talk", label: "Talk" },
  { key: "barter", label: "Barter" },
  { key: "give", label: "Give" },
  { key: "steal", label: "Steal" },
  { key: "attack", label: "Attack" },
  { key: "leave", label: "Leave" },
] as const;

export interface NPCControllerOptions {
  panel: HTMLElement;
  state: GameState;
  npc: NPCDef;
  /** Close the panel; `message` goes to the dungeon message bar. */
  onClose: (message: string) => void;
  /** Start a fight against the NPC (attack / botched steal). */
  onFight: (npc: NPCDef) => void;
}

export class NPCController {
  private panel: HTMLElement;
  private state: GameState;
  private npc: NPCDef;
  private onClose: (message: string) => void;
  private onFight: (npc: NPCDef) => void;

  private phase: Phase = "root";
  private index = 0;
  /** The NPC's current line (greeting, topic answer, action outcome). */
  private dialogue: string;
  /** Typed keyword buffer for the ask phase. */
  private typed = "";

  constructor(opts: NPCControllerOptions) {
    this.panel = opts.panel;
    this.state = opts.state;
    this.npc = opts.npc;
    this.onClose = opts.onClose;
    this.onFight = opts.onFight;
    this.dialogue = greet(this.state, this.npc);
    this.panel.style.display = "block";
    this.render();
  }

  handleKey(key: string): boolean {
    if (this.phase === "ask") {
      return this.handleAskKey(key);
    }
    const lower = key.toLowerCase();
    if (lower === "escape") {
      if (this.phase === "root") {
        this.close("You step away.");
      } else {
        this.phase = "root";
        this.index = 0;
        this.render();
      }
      return true;
    }
    const len = this.listLength();
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
    // Root hotkeys.
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

  private listLength(): number {
    switch (this.phase) {
      case "root":
        return ROOT_ITEMS.length;
      case "talk":
        return visibleTopics(this.npc).length + 1; // + "Ask about…"
      case "barter":
        return availableTrades(this.state, this.npc).length;
      case "give":
        return this.state.inventory.length;
      default:
        return 0;
    }
  }

  private confirm(): void {
    if (this.phase === "root") {
      const item = ROOT_ITEMS[this.index];
      switch (item.key) {
        case "talk":
          this.phase = "talk";
          this.index = 0;
          this.render();
          return;
        case "barter":
          this.phase = "barter";
          this.index = 0;
          this.dialogue =
            availableTrades(this.state, this.npc).length > 0
              ? `${this.npc.name} lays out an offer.`
              : `${this.npc.name} has nothing to trade.`;
          this.render();
          return;
        case "give":
          this.phase = "give";
          this.index = 0;
          this.dialogue =
            this.state.inventory.length > 0
              ? "Offer what?"
              : "Your pack is empty.";
          this.render();
          return;
        case "steal":
          this.applyResult(stealFrom(this.state, this.npc));
          return;
        case "attack":
          this.close("");
          this.onFight(this.npc);
          return;
        case "leave":
          this.close("You step away.");
          return;
      }
    }

    if (this.phase === "talk") {
      const topics = visibleTopics(this.npc);
      if (this.index < topics.length) {
        this.dialogue = askTopic(this.npc, topics[this.index]);
        this.render();
      } else {
        this.phase = "ask";
        this.typed = "";
        this.render();
      }
      return;
    }

    if (this.phase === "barter") {
      const trades = availableTrades(this.state, this.npc);
      const trade = trades[this.index];
      if (trade) this.applyResult(doTrade(this.state, this.npc, trade));
      return;
    }

    if (this.phase === "give") {
      if (this.state.inventory.length === 0) return;
      this.applyResult(giveItem(this.state, this.npc, this.index));
      // The list may have shrunk.
      this.index = Math.min(this.index, Math.max(0, this.state.inventory.length - 1));
    }
  }

  private handleAskKey(key: string): boolean {
    if (key === "Escape") {
      this.phase = "talk";
      this.index = 0;
      this.render();
      return true;
    }
    if (key === "Enter") {
      this.dialogue = askTopic(this.npc, this.typed);
      this.phase = "talk";
      this.index = 0;
      this.render();
      return true;
    }
    if (key === "Backspace") {
      this.typed = this.typed.slice(0, -1);
      this.render();
      return true;
    }
    if (key.length === 1 && this.typed.length < 24) {
      this.typed += key;
      this.render();
      return true;
    }
    return false;
  }

  private applyResult(result: NPCActionResult): void {
    if (result.startFight) {
      this.close(result.message);
      this.onFight(this.npc);
      return;
    }
    if (result.message) this.dialogue = result.message;
    this.render();
  }

  /** Tear down the panel (useful for tests). */
  destroy(): void {
    this.panel.style.display = "none";
    this.panel.innerHTML = "";
  }

  private close(message: string): void {
    this.destroy();
    this.onClose(message);
  }

  // --- Rendering ------------------------------------------------------------

  private render(): void {
    const npc = this.npc;
    const lines: string[] = [];
    lines.push(
      `<div class="camp-header">${npc.name} — ${npc.title} (${moodOf(this.state, npc)})</div>`
    );
    lines.push(`<div class="npc-dialogue">“${this.dialogue}”</div>`);

    if (this.phase === "root") {
      lines.push(`<div class="camp-party">`);
      for (let i = 0; i < ROOT_ITEMS.length; i++) {
        const marker = i === this.index ? "▶" : " ";
        lines.push(
          `<div class="camp-char"><span class="cc-name">${marker} [${ROOT_ITEMS[i].label[0]}] ${ROOT_ITEMS[i].label}</span></div>`
        );
      }
      lines.push(`</div>`);
      lines.push(`<div class="camp-done">[↑/↓] select · [Enter] confirm · [Esc] leave</div>`);
    } else if (this.phase === "talk") {
      const topics = visibleTopics(npc);
      lines.push(`<div class="camp-party">`);
      for (let i = 0; i < topics.length; i++) {
        const marker = i === this.index ? "▶" : " ";
        lines.push(
          `<div class="camp-char"><span class="cc-name">${marker} ${topics[i]}</span></div>`
        );
      }
      const askMarker = this.index === topics.length ? "▶" : " ";
      lines.push(
        `<div class="camp-char"><span class="cc-name">${askMarker} Ask about… (type a word)</span></div>`
      );
      lines.push(`</div>`);
      lines.push(`<div class="camp-done">[↑/↓] topic · [Enter] ask · [Esc] back</div>`);
    } else if (this.phase === "ask") {
      lines.push(
        `<div class="camp-party"><div class="camp-char"><span class="cc-name">Ask about: ${this.typed}<span class="npc-caret">_</span></span></div></div>`
      );
      lines.push(`<div class="camp-done">[Enter] ask · [Esc] back</div>`);
    } else if (this.phase === "barter") {
      const trades = availableTrades(this.state, npc);
      lines.push(`<div class="camp-party">`);
      if (trades.length === 0) {
        lines.push(`<div class="camp-char"><span class="cc-name">Nothing on offer.</span></div>`);
      }
      for (let i = 0; i < trades.length; i++) {
        const marker = i === this.index ? "▶" : " ";
        lines.push(
          `<div class="camp-char"><span class="cc-name">${marker} ${this.tradeLabel(trades[i])}</span></div>`
        );
      }
      lines.push(`</div>`);
      lines.push(`<div class="camp-done">[Enter] trade · [Esc] back</div>`);
    } else if (this.phase === "give") {
      const inv = this.state.inventory;
      lines.push(`<div class="camp-party">`);
      if (inv.length === 0) {
        lines.push(`<div class="camp-char"><span class="cc-name">Your pack is empty.</span></div>`);
      }
      for (let i = 0; i < inv.length; i++) {
        const item = ITEMS_BY_ID[inv[i].itemId];
        const name = item ? displayNameFor(item, inv[i].identified) : inv[i].itemId;
        const marker = i === this.index ? "▶" : " ";
        lines.push(
          `<div class="camp-char"><span class="cc-name">${marker} ${name}</span></div>`
        );
      }
      lines.push(`</div>`);
      lines.push(`<div class="camp-done">[Enter] give · [Esc] back</div>`);
    }

    this.panel.innerHTML = lines.join("");
  }

  private tradeLabel(trade: NPCTradeDef): string {
    const give = ITEMS_BY_ID[trade.giveItemId]?.name ?? trade.giveItemId;
    const receive = ITEMS_BY_ID[trade.receiveItemId]?.name ?? trade.receiveItemId;
    return `Your ${give} for ${receive}${trade.once ? " (one-time)" : ""}`;
  }
}
