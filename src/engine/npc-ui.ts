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
import { FF6Window } from "./ff6-window-library";

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
  /** Last rendered phase — the FF6 open animation plays only on phase
   *  changes, never on cursor/typing re-renders. */
  private lastPhaseKey = "";

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
    if (lower === "arrowup") {
      if (len > 0) this.index = (this.index - 1 + len) % len;
      this.render();
      return true;
    }
    if (lower === "arrowdown") {
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
    const animated = this.lastPhaseKey !== this.phase;
    this.lastPhaseKey = this.phase;
    const title = `${npc.name} — ${npc.title} (${moodOf(this.state, npc)})`;
    const dialogueHtml = `<div class="npc-dialogue">“${this.dialogue}”</div>`;
    this.panel.innerHTML = "";

    if (this.phase === "ask") {
      this.panel.appendChild(
        FF6Window.frame({
          title,
          contentHtml:
            dialogueHtml +
            `<div class="npc-ask-line">Ask about: ${escapeText(this.typed)}` +
            `<span class="npc-caret">_</span></div>`,
          footer: "[Enter] ask · [Esc] back",
          mode: "description",
          animated,
        })
      );
      return;
    }

    let items: { label: string }[] = [];
    let footer = "";
    let emptyLine = "";
    if (this.phase === "root") {
      items = ROOT_ITEMS.map((it) => ({ label: `[${it.label[0]}] ${it.label}` }));
      footer = "[↑/↓] select · [Enter] confirm · [Esc] leave";
    } else if (this.phase === "talk") {
      items = [
        ...visibleTopics(npc).map((t) => ({ label: t })),
        { label: "Ask about… (type a word)" },
      ];
      footer = "[↑/↓] topic · [Enter] ask · [Esc] back";
    } else if (this.phase === "barter") {
      const trades = availableTrades(this.state, npc);
      items = trades.map((t) => ({ label: this.tradeLabel(t) }));
      if (trades.length === 0) emptyLine = "Nothing on offer.";
      footer = "[Enter] trade · [Esc] back";
    } else if (this.phase === "give") {
      const inv = this.state.inventory;
      items = inv.map((entry) => {
        const item = ITEMS_BY_ID[entry.itemId];
        return { label: item ? displayNameFor(item, entry.identified) : entry.itemId };
      });
      if (inv.length === 0) emptyLine = "Your pack is empty.";
      footer = "[Enter] give · [Esc] back";
    }

    const win = new FF6Window({
      title,
      contentHtml:
        dialogueHtml +
        (emptyLine ? `<div class="npc-empty-line">${emptyLine}</div>` : ""),
      items,
      selectedIndex: this.index,
      mode: "menu",
      footer,
      animated,
      onHover: (i) => {
        this.index = i;
      },
      onConfirm: (i) => {
        this.index = i;
        this.confirm();
      },
    });
    this.panel.appendChild(win.render());
  }

  private tradeLabel(trade: NPCTradeDef): string {
    const give = ITEMS_BY_ID[trade.giveItemId]?.name ?? trade.giveItemId;
    const receive = ITEMS_BY_ID[trade.receiveItemId]?.name ?? trade.receiveItemId;
    return `Your ${give} for ${receive}${trade.once ? " (one-time)" : ""}`;
  }
}

/** Escape free-typed player text before it goes into contentHtml. */
function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
