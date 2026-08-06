/**
 * Dungeon NPC interaction overlay — opened by stepping onto an "npc" tile.
 *
 * Cinematic portrait-and-dialogue presentation (see npc-dialogue-view.ts):
 * portrait, name/title/mood, and the spoken line come first; the root
 * action bar (Talk / Barter / Give / Steal / Attack / Leave) only appears
 * once the greeting is acknowledged (Enter/Space/an arrow key), or
 * immediately if the player types a root hotkey directly. Talk keeps the
 * portrait and header visible and shows topics in a compact secondary
 * list. Barter/Give mount a full FF6Window list (they genuinely need one)
 * into the same panel, below the still-visible portrait and header.
 *
 * main.ts borrows "title" mode while the panel is open (same pattern as the
 * save and grimoire menus) so dungeon input pauses, but keeps the dungeon
 * corridor visible behind this panel (see shell.ts's
 * showNpcDialogueOverlay/hideNpcDialogueOverlay) rather than replacing the
 * whole screen the way the other borrowed-title overlays do.
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
  type NPCMessageKind,
} from "../game/npc";
import { FF6Window } from "./ff6-window-library";
import {
  renderNPCDialogue,
  paginateText,
  revealDurationMs,
  type DialogueSecondary,
} from "./npc-dialogue-view";
import { audio } from "./audio";

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
  /** Paginated current dialogue; render() shows pages[pageIndex]. */
  private pages: string[] = [];
  private pageIndex = 0;
  private dialogueKind: NPCMessageKind = "speech";
  /** Root action bar stays hidden until the greeting is acknowledged
   *  (Enter/Space/an arrow key), or a root hotkey is typed directly. */
  private acknowledged = false;
  /** Whether the current page's reveal-mask animation has finished (or was
   *  skipped for reduced motion). Gates Enter's meaning in root phase only —
   *  see handleKey. */
  private textRevealed = true;
  private revealTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly reducedMotion: boolean;
  /** Typed keyword buffer for the ask phase. */
  private typed = "";

  constructor(opts: NPCControllerOptions) {
    this.panel = opts.panel;
    this.state = opts.state;
    this.npc = opts.npc;
    this.onClose = opts.onClose;
    this.onFight = opts.onFight;
    this.reducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.setDialogue(greet(this.state, this.npc));
    this.panel.style.display = "flex";
    this.render();
  }

  handleKey(key: string): boolean {
    if (this.phase === "ask") {
      return this.handleAskKey(key);
    }

    const isConfirm = key === "Enter" || key === " ";
    // The typewriter/pagination/acknowledge gate only applies to the root
    // greeting screen — barter/give/talk are already list- or
    // keyword-driven, so their Enter keeps its immediate meaning (and the
    // existing tests for those phases rely on that).
    if (this.phase === "root" && isConfirm) {
      if (!this.textRevealed) {
        this.completeReveal();
        return true;
      }
      if (this.pageIndex < this.pages.length - 1) {
        this.pageIndex++;
        this.startReveal();
        this.render();
        return true;
      }
      if (!this.acknowledged) {
        this.acknowledged = true;
        this.render();
        return true;
      }
    }

    audio.uiForMenuKey(key);
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
      if (this.phase === "root") this.acknowledged = true;
      this.render();
      return true;
    }
    if (lower === "arrowdown") {
      if (len > 0) this.index = (this.index + 1) % len;
      if (this.phase === "root") this.acknowledged = true;
      this.render();
      return true;
    }
    if (key === "Enter" || key === " ") {
      this.confirm();
      return true;
    }
    // Root hotkeys — work immediately even before the action bar is shown.
    if (this.phase === "root") {
      const idx = ROOT_ITEMS.findIndex((it) => it.key.startsWith(lower));
      if (idx >= 0) {
        this.index = idx;
        this.acknowledged = true;
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
          this.setDialogue(
            availableTrades(this.state, this.npc).length > 0
              ? `${this.npc.name} lays out an offer.`
              : `${this.npc.name} has nothing to trade.`,
            "narration"
          );
          this.render();
          return;
        case "give":
          this.phase = "give";
          this.index = 0;
          this.setDialogue(
            this.state.inventory.length > 0 ? "Offer what?" : "Your pack is empty.",
            "narration"
          );
          this.render();
          return;
        case "steal":
          {
            const goldBefore = this.state.partyGold;
            const result = stealFrom(this.state, this.npc);
            if (this.state.partyGold > goldBefore) {
              audio.playDungeonSfx("npcSteal");
            }
            this.applyResult(result);
          }
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
        this.setDialogue(askTopic(this.state, this.npc, topics[this.index]));
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
      if (trade) {
        const receiveBefore = this.state.inventory.filter(
          (entry) => entry.itemId === trade.receiveItemId
        ).length;
        const result = doTrade(this.state, this.npc, trade);
        const receiveAfter = this.state.inventory.filter(
          (entry) => entry.itemId === trade.receiveItemId
        ).length;
        if (receiveAfter > receiveBefore) audio.uiBuySell();
        this.applyResult(result);
      }
      return;
    }

    if (this.phase === "give") {
      if (this.state.inventory.length === 0) return;
      const offeredItemId = this.state.inventory[this.index]?.itemId;
      const offeredBefore = offeredItemId
        ? this.state.inventory.filter((entry) => entry.itemId === offeredItemId).length
        : 0;
      const result = giveItem(this.state, this.npc, this.index);
      const offeredAfter = offeredItemId
        ? this.state.inventory.filter((entry) => entry.itemId === offeredItemId).length
        : 0;
      if (offeredAfter < offeredBefore) audio.uiBuySell();
      this.applyResult(result);
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
      this.setDialogue(askTopic(this.state, this.npc, this.typed));
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
    if (result.message) this.setDialogue(result.message, result.kind ?? "speech");
    this.render();
  }

  /** Tear down the panel (useful for tests). */
  destroy(): void {
    this.clearRevealTimer();
    this.panel.style.display = "none";
    this.panel.innerHTML = "";
    this.panel.classList.remove("npc-dialogue-active");
  }

  private close(message: string): void {
    this.destroy();
    this.onClose(message);
  }

  // --- Typewriter / pagination ----------------------------------------------

  private setDialogue(text: string, kind: NPCMessageKind = "speech"): void {
    this.pages = paginateText(text);
    this.pageIndex = 0;
    this.dialogueKind = kind;
    this.startReveal();
  }

  private startReveal(): void {
    this.clearRevealTimer();
    if (this.reducedMotion) {
      this.textRevealed = true;
      return;
    }
    this.textRevealed = false;
    const duration = revealDurationMs(this.pages[this.pageIndex] ?? "");
    this.revealTimer = setTimeout(() => {
      this.textRevealed = true;
      this.revealTimer = null;
      this.render();
    }, duration);
  }

  private completeReveal(): void {
    this.clearRevealTimer();
    this.textRevealed = true;
    this.render();
  }

  private clearRevealTimer(): void {
    if (this.revealTimer) {
      clearTimeout(this.revealTimer);
      this.revealTimer = null;
    }
  }

  // --- Rendering ------------------------------------------------------------

  private render(): void {
    const npc = this.npc;
    const pageText = this.pages[this.pageIndex] ?? "";
    const hasMorePages = this.pageIndex < this.pages.length - 1;

    let secondary: DialogueSecondary = null;
    let footer: string | undefined;
    let emptyLine: string | undefined;

    if (this.phase === "root") {
      secondary = {
        kind: "actions",
        items: ROOT_ITEMS.map((it) => ({ key: it.key, label: `[${it.label[0]}] ${it.label}` })),
        selectedIndex: this.index,
      };
    } else if (this.phase === "talk") {
      secondary = {
        kind: "topics",
        items: [
          ...visibleTopics(npc).map((t) => ({ label: t })),
          { label: "Ask about… (type a word)" },
        ],
        selectedIndex: this.index,
      };
      footer = "\u2191/\u2193 topic \u00b7 Enter ask \u00b7 Esc back";
    } else if (this.phase === "ask") {
      secondary = { kind: "ask", typed: this.typed };
      footer = "Enter ask \u00b7 Esc back";
    } else if (this.phase === "barter") {
      secondary = { kind: "mount" };
      if (availableTrades(this.state, npc).length === 0) emptyLine = "Nothing on offer.";
      footer = "Enter trade \u00b7 Esc back";
    } else if (this.phase === "give") {
      secondary = { kind: "mount" };
      if (this.state.inventory.length === 0) emptyLine = "Your pack is empty.";
      footer = "Enter give \u00b7 Esc back";
    }

    this.panel.innerHTML = "";
    this.panel.classList.add("npc-dialogue-active");

    const { root, mountSlot } = renderNPCDialogue({
      npcName: npc.name,
      npcTitle: npc.title,
      mood: moodOf(this.state, npc),
      portraitId: npc.portraitId,
      portraitSide: npc.portraitSide,
      dialogueAccent: npc.dialogueAccent,
      text: pageText,
      hasMorePages,
      messageKind: this.dialogueKind,
      acknowledged: this.acknowledged,
      textRevealed: this.textRevealed,
      reducedMotion: this.reducedMotion,
      secondary,
      footer,
      emptyLine,
    });
    this.panel.appendChild(root);

    // Two-frame trick so the reveal mask's CSS transition actually plays:
    // the mask is inserted already covering the text (see
    // npc-dialogue-view.ts), then flipped to width 0 on the *next* frame —
    // changing it in the same synchronous pass as insertion would just
    // paint the end state with no transition, since the element wouldn't
    // have had a prior committed frame to transition from.
    if (!this.reducedMotion && !this.textRevealed) {
      const mask = root.querySelector<HTMLElement>(".npc-dlg-reveal-mask");
      if (mask) {
        requestAnimationFrame(() => {
          mask.style.width = "0%";
        });
      }
    }

    if (mountSlot && this.phase === "barter") {
      const trades = availableTrades(this.state, npc);
      const win = new FF6Window({
        items: trades.map((t) => ({ label: this.tradeLabel(t) })),
        selectedIndex: this.index,
        mode: "menu",
        width: "full",
        animated: false,
        onHover: (i) => {
          this.index = i;
        },
        onConfirm: (i) => {
          this.index = i;
          this.confirm();
        },
      });
      mountSlot.appendChild(win.render());
    } else if (mountSlot && this.phase === "give") {
      const inv = this.state.inventory;
      const win = new FF6Window({
        items: inv.map((entry) => {
          const item = ITEMS_BY_ID[entry.itemId];
          return { label: item ? displayNameFor(item, entry.identified) : entry.itemId };
        }),
        selectedIndex: this.index,
        mode: "menu",
        width: "full",
        animated: false,
        onHover: (i) => {
          this.index = i;
        },
        onConfirm: (i) => {
          this.index = i;
          this.confirm();
        },
      });
      mountSlot.appendChild(win.render());
    }
  }

  private tradeLabel(trade: NPCTradeDef): string {
    const give = ITEMS_BY_ID[trade.giveItemId]?.name ?? trade.giveItemId;
    const receive = ITEMS_BY_ID[trade.receiveItemId]?.name ?? trade.receiveItemId;
    return `Your ${give} for ${receive}${trade.once ? " (one-time)" : ""}`;
  }
}
