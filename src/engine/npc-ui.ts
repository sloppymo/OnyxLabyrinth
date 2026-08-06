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
import { purchaseSpell, spellShopListing } from "../game/spell-shop";

type Phase = "root" | "talk" | "ask" | "barter" | "give" | "shop" | "shopConfirm";

const ROOT_ITEMS = [
  { key: "talk", label: "Talk" },
  { key: "barter", label: "Barter" },
  { key: "give", label: "Give" },
  { key: "steal", label: "Steal" },
  { key: "attack", label: "Attack" },
  { key: "leave", label: "Leave" },
] as const;

/** Filter root menu items by the NPC's capabilities. When `capabilities`
 *  is omitted, all actions are available (backward compatible). "Leave"
 *  is always available. */
function rootItemsFor(npc: NPCDef): readonly { key: string; label: string }[] {
  const base = npc.shop ? [{ key: "shop", label: "Browse Iso-Spells" }, ...ROOT_ITEMS] : [...ROOT_ITEMS];
  if (!npc.capabilities) return base;
  return base.filter((it) => {
    if (it.key === "leave") return true;
    const cap = npc.capabilities as Record<string, boolean | undefined>;
    // If the capability is explicitly set, use it. If not set, default to
    // enabled (only explicitly-false capabilities are disabled).
    const val = cap[it.key];
    return val !== false;
  });
}

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
  /** True once the current dialogue beat has been fully consumed (reveal + all
   *  pages shown). For the root phase this also reveals the action bar; for
   *  other phases it gates `confirm()` so a paginated result must be read
   *  before it can be acted on again. Reset to false by setDialogue(). */
  private acknowledged = false;
  /** Whether the current page's reveal-mask animation has finished (or was
   *  skipped for reduced motion). */
  private textRevealed = true;
  private revealTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly reducedMotion: boolean;
  /** Typed keyword buffer for the ask phase. */
  private typed = "";
  /** If a steal/attack/affront message ended with startFight, the hostile
   *  line is shown and this flag ensures one final confirmation starts the
   *  combat exactly once. */
  private pendingFight = false;

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

    // For every phase except "ask", the same rule applies: the first Enter/Space
    // completes the typewriter reveal; subsequent Enter/Space advances pages; the
    // final Enter/Space acknowledges the beat. Only then can a later confirmation
    // activate the currently selected menu item. This stops Enter from
    // immediately re-trading, re-giving, or re-asking a paginated message.
    if (isConfirm && this.consumeDialogue()) {
      return true;
    }

    // A failed steal (or future affront) displays the hostile line and waits
    // for one final confirmation before handing off to combat. Exactly one.
    if (this.pendingFight && this.acknowledged) {
      this.close("");
      this.onFight(this.npc);
      return true;
    }

    audio.uiForMenuKey(key);
    const lower = key.toLowerCase();
    if (lower === "escape") {
      if (this.phase === "root") {
        this.close("You step away.");
      } else if (this.phase === "shopConfirm") {
        this.phase = "shop";
        this.render();
      } else {
        this.phase = "root";
        this.index = 0;
        this.acknowledged = true;
        this.render();
      }
      return true;
    }
    // Confirmation is modal: the spell named in the confirmation copy must
    // remain the spell that Enter buys. Do not let keyboard navigation change
    // the index underneath it.
    if (this.phase === "shopConfirm" && (lower === "arrowup" || lower === "arrowdown")) {
      return true;
    }
    const len = this.listLength();
    if (lower === "arrowup" || lower === "arrowdown") {
      if (len > 0) this.index = (this.index + (lower === "arrowdown" ? 1 : -1) + len) % len;
      if (this.phase === "root" && !this.acknowledged) this.acknowledged = true;
      this.render();
      return true;
    }
    if (isConfirm) {
      this.confirm();
      return true;
    }
    // Root hotkeys are locked until the current dialogue beat is acknowledged;
    // this prevents a typed character during the reveal from firing an action.
    // Use the canonical capability-filtered list so hub NPC restrictions remain
    // intact while still allowing label-prefix hotkeys.
    if (this.phase === "root" && this.acknowledged) {
      const items = rootItemsFor(this.npc);
      const idx = items.findIndex(
        (it) => it.key.startsWith(lower) || it.label.toLowerCase().startsWith(lower)
      );
      if (idx >= 0) {
        this.index = idx;
        this.confirm();
        return true;
      }
    }
    return false;
  }

  /**
   * Consumes one step of the current dialogue beat on a confirm input.
   * Returns true if the event was consumed (reveal, page turn, or final
   * acknowledgement). When it returns false, the caller may proceed with the
   * phase-specific menu action.
   */
  private consumeDialogue(): boolean {
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
    return false;
  }

  private listLength(): number {
    switch (this.phase) {
      case "root":
        return rootItemsFor(this.npc).length;
      case "talk":
        return visibleTopics(this.npc).length + 1; // + "Ask about…"
      case "barter":
        return availableTrades(this.state, this.npc).length;
      case "give":
        return this.state.inventory.length;
      case "shop":
      case "shopConfirm":
        return this.shopListings().length;
      default:
        return 0;
    }
  }

  private confirm(): void {
    if (this.phase === "root") {
      const item = rootItemsFor(this.npc)[this.index];
      if (!item) return;
      switch (item.key) {
        case "shop":
          this.phase = "shop";
          this.index = 0;
          this.dialogue = "Pick one.";
          this.render();
          return;
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
      return;
    }

    if (this.phase === "shop") {
      const listing = this.shopListings()[this.index];
      if (listing?.spell) {
        this.phase = "shopConfirm";
        this.dialogue = `${listing.spell.name}: ${listing.spell.description} Buy for ${listing.listing.price.toLocaleString()}g?`;
        this.render();
      }
      return;
    }

    if (this.phase === "shopConfirm") {
      const listing = this.shopListings()[this.index];
      if (!listing?.spell || !this.npc.shop) return;
      const result = purchaseSpell(this.state, this.npc.shop, listing.spell.id);
      if (result.ok) audio.uiBuySell();
      this.dialogue = result.message;
      this.phase = "shop";
      this.render();
    }
  }

  private shopListings() {
    return this.npc.shop ? spellShopListing(this.npc.shop) : [];
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
      // Show the hostile line first, then hand off to combat on the next
      // confirm. This renders the hostile tint/shake and prevents the fight
      // from being started twice.
      this.pendingFight = true;
      if (result.message) this.setDialogue(result.message, result.kind ?? "hostile");
      else this.acknowledged = true;
      this.render();
      return;
    }
    this.pendingFight = false;
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
        items: rootItemsFor(npc).map((it) => ({ key: it.key, label: `[${it.label[0]}] ${it.label}` })),
        selectedIndex: this.index,
      };
      footer = "[↑/↓] select · [Enter] confirm · [Esc] leave";
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
    } else if (this.phase === "shop" || this.phase === "shopConfirm") {
      secondary = { kind: "mount" };
      emptyLine = `GOLD: ${this.state.partyGold.toLocaleString()}`;
      footer = this.phase === "shopConfirm"
        ? "Enter buy \u00b7 Esc back"
        : "\u2191/\u2193 select \u00b7 Enter inspect \u00b7 Esc back";
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
    } else if (mountSlot && (this.phase === "shop" || this.phase === "shopConfirm")) {
      const learned = new Set(this.state.purchasedSpellIds ?? []);
      const win = new FF6Window({
        items: this.shopListings().map(({ listing, spell }) => ({
          label: spell ? `${spell.name}  ${spell.class}` : listing.spellId,
          detail: learned.has(listing.spellId)
            ? "LEARNED"
            : `${listing.price.toLocaleString()}g · ${spell?.spCost ?? "?"} SP`,
          disabled: learned.has(listing.spellId),
          className: learned.has(listing.spellId) ? "shop-learned" : undefined,
        })),
        selectedIndex: this.index,
        mode: "menu",
        width: "full",
        animated: false,
        onHover: (i) => {
          if (this.phase !== "shopConfirm") this.index = i;
        },
        onConfirm: (i) => {
          if (this.phase === "shopConfirm" && i !== this.index) return;
          this.index = i;
          this.confirm();
        },
      });
      mountSlot.appendChild(win.render());
    }

    // Pointer discoverability: hover to preview a root/topic item, click to
    // confirm it. Matches the FF6 window hover/click behavior used for
    // barter/give. Keyboard remains the primary input path.
    this.attachPointerHandlers(root);
  }

  private attachPointerHandlers(root: HTMLElement): void {
    if (this.phase === "root" || this.phase === "talk") {
      const selector = this.phase === "root" ? ".npc-dlg-action" : ".npc-dlg-topic";
      const nodes = root.querySelectorAll<HTMLElement>(selector);
      nodes.forEach((node, i) => {
        node.addEventListener("mouseenter", () => {
          this.index = i;
          nodes.forEach((n) => n.classList.remove("selected"));
          node.classList.add("selected");
        });
        node.addEventListener("click", () => {
          this.index = i;
          this.confirm();
        });
      });
    }
  }

  private tradeLabel(trade: NPCTradeDef): string {
    const give = ITEMS_BY_ID[trade.giveItemId]?.name ?? trade.giveItemId;
    const receive = ITEMS_BY_ID[trade.receiveItemId]?.name ?? trade.receiveItemId;
    return `Your ${give} for ${receive}${trade.once ? " (one-time)" : ""}`;
  }
}
