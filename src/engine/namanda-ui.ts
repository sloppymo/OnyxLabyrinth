/**
 * Church of Saint Namanda — the Floor 1 sacred-services hub controller.
 *
 * Mirrors `tavern-ui.ts`'s shape (a narrow FF6Window controller, not the
 * generic dungeon NPCController — see that file's own doc comment for why):
 * manual per-phase keyboard handling, FF6Window used statelessly for
 * rendering. Opened the same way Hot Boi's tavern is — `main.ts`'s
 * `openNPCPanel()` intercepts `npcId === "namanda-altar"` before the
 * generic NPC lookup, so no new interaction plumbing was needed, only this
 * controller and one more dispatch branch.
 */
import type { GameState } from "../types";
import { FF6Window, type FF6WindowItem } from "./ff6-window-library";
import { audio } from "./audio";
import { displayNameFor, ITEMS_BY_ID } from "../data/items";
import {
  REMOVE_CURSE_COST,
  APPRAISE_COST,
  NAMANDA_BLESSING_COST,
} from "../data/service-prices";
import {
  healAtChurch,
  identifyAtChurch,
  uncurseAtChurch,
  blessAtChurch,
  eligibleIdentifyTargets,
  equippedCursedItems,
} from "../game/namanda";

type Phase = "root" | "identify" | "uncurseConfirm" | "blessConfirm";

export interface NamandaControllerOptions {
  panel: HTMLElement;
  state: GameState;
  onClose: () => void;
  /** Called right after a gold/inventory-changing transaction completes,
   *  same atomicity contract as the Tavern's `onSave`. */
  onSave: () => void;
}

const ROOT_ITEMS = [
  { key: "heal", label: "Heal" },
  { key: "bless", label: "Blessing" },
  { key: "uncurse", label: "Uncurse" },
  { key: "identify", label: "Identify" },
  { key: "leave", label: "Leave" },
] as const;

const OPENING_LINE =
  "Candlelight. Old stone. The room does not ask why you've come.";

export class NamandaController {
  private panel: HTMLElement;
  private state: GameState;
  private onClose: () => void;
  private onSave: () => void;

  private phase: Phase = "root";
  private index = 0;
  private dialogue: string = OPENING_LINE;
  private lastPhaseKey = "";

  constructor(opts: NamandaControllerOptions) {
    this.panel = opts.panel;
    this.state = opts.state;
    this.onClose = opts.onClose;
    this.onSave = opts.onSave;
    this.panel.style.display = "flex";
    this.render();
  }

  handleKey(key: string): boolean {
    audio.uiForMenuKey(key);
    const lower = key.toLowerCase();

    if (lower === "escape") {
      this.back();
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
    return true; // swallow everything else while the panel is open
  }

  private listLength(): number {
    switch (this.phase) {
      case "root":
        return ROOT_ITEMS.length;
      case "identify":
        return this.identifyItems().length;
      case "uncurseConfirm":
        return this.uncurseItems().length;
      case "blessConfirm":
        return this.blessItems().length;
    }
  }

  private back(): void {
    if (this.phase === "root") {
      this.close();
      return;
    }
    this.toRoot();
  }

  private close(): void {
    this.panel.style.display = "none";
    this.panel.innerHTML = "";
    this.onClose();
  }

  private toRoot(): void {
    this.phase = "root";
    this.index = 0;
    this.dialogue = OPENING_LINE;
    this.render();
  }

  // --- Confirm dispatch ------------------------------------------------

  private confirm(): void {
    switch (this.phase) {
      case "root":
        return this.confirmRoot();
      case "identify":
        return this.confirmIdentify();
      case "uncurseConfirm":
        return this.confirmUncurse();
      case "blessConfirm":
        return this.confirmBless();
    }
  }

  private confirmRoot(): void {
    const item = ROOT_ITEMS[this.index];
    if (!item) return;
    switch (item.key) {
      case "heal": {
        const result = healAtChurch(this.state);
        this.dialogue = result.message;
        this.onSave();
        this.render();
        return;
      }
      case "bless":
        this.phase = "blessConfirm";
        this.index = 0;
        this.dialogue =
          this.state.partyGold >= NAMANDA_BLESSING_COST
            ? `Bless the party for ${NAMANDA_BLESSING_COST} gold?`
            : `A blessing costs ${NAMANDA_BLESSING_COST}g — you can't afford it.`;
        this.render();
        return;
      case "uncurse": {
        const cursed = equippedCursedItems(this.state);
        this.phase = "uncurseConfirm";
        this.index = 0;
        this.dialogue =
          cursed.length === 0
            ? "No curses afflict the party."
            : this.state.partyGold >= REMOVE_CURSE_COST
              ? `Break the curse on ${cursed.map((c) => `${c.itemName} (${c.charName})`).join(", ")} for ${REMOVE_CURSE_COST} gold?`
              : `Uncursing costs ${REMOVE_CURSE_COST}g — you can't afford it.`;
        this.render();
        return;
      }
      case "identify":
        this.phase = "identify";
        this.index = 0;
        this.dialogue =
          eligibleIdentifyTargets(this.state).length === 0
            ? "Nothing in your packs needs identifying."
            : `Identify one item for ${APPRAISE_COST} gold each.`;
        this.render();
        return;
      case "leave":
        this.close();
        return;
    }
  }

  private identifyItems(): FF6WindowItem[] {
    const targets = eligibleIdentifyTargets(this.state);
    if (targets.length === 0) return [{ label: "Back" }];
    const items: FF6WindowItem[] = targets.map((idx) => {
      const entry = this.state.inventory[idx]!;
      const item = ITEMS_BY_ID[entry.itemId];
      return { label: item ? displayNameFor(item, false) : "Unknown Item" };
    });
    items.push({ label: "Back" });
    return items;
  }

  private confirmIdentify(): void {
    const targets = eligibleIdentifyTargets(this.state);
    if (targets.length === 0 || this.index >= targets.length) {
      this.toRoot();
      return;
    }
    const invIndex = targets[this.index]!;
    const result = identifyAtChurch(this.state, invIndex);
    this.dialogue = result.message;
    if (result.ok) this.onSave();
    const remaining = eligibleIdentifyTargets(this.state).length;
    if (this.index >= remaining) this.index = Math.max(0, remaining - 1);
    this.render();
  }

  private uncurseItems(): FF6WindowItem[] {
    const cursed = equippedCursedItems(this.state);
    if (cursed.length === 0 || this.state.partyGold < REMOVE_CURSE_COST) {
      return [{ label: "Back" }];
    }
    return [{ label: "Break the curse" }, { label: "Never mind" }];
  }

  private confirmUncurse(): void {
    const items = this.uncurseItems();
    const item = items[this.index];
    if (!item || item.label !== "Break the curse") {
      this.toRoot();
      return;
    }
    const result = uncurseAtChurch(this.state);
    this.dialogue = result.message;
    if (result.ok) this.onSave();
    this.phase = "root";
    this.index = 0;
    this.render();
  }

  private blessItems(): FF6WindowItem[] {
    if (this.state.partyGold < NAMANDA_BLESSING_COST) return [{ label: "Back" }];
    return [{ label: "Accept the blessing" }, { label: "Never mind" }];
  }

  private confirmBless(): void {
    const items = this.blessItems();
    const item = items[this.index];
    if (!item || item.label !== "Accept the blessing") {
      this.toRoot();
      return;
    }
    const result = blessAtChurch(this.state);
    this.dialogue = result.message;
    if (result.ok) this.onSave();
    this.phase = "root";
    this.index = 0;
    this.render();
  }

  // --- Rendering ---------------------------------------------------------

  private render(): void {
    const animated = this.lastPhaseKey !== this.phase;
    this.lastPhaseKey = this.phase;
    this.panel.innerHTML = "";

    let items: FF6WindowItem[] = [];
    let footer = "[↑/↓] select · [Enter] confirm · [Esc] back";
    let title = "Church of Saint Namanda";

    switch (this.phase) {
      case "root":
        items = ROOT_ITEMS.map((it) => ({ label: it.label }));
        footer = "[↑/↓] select · [Enter] confirm · [Esc] leave";
        break;
      case "identify":
        title = "Church of Saint Namanda — Identify";
        items = this.identifyItems();
        break;
      case "uncurseConfirm":
        title = "Church of Saint Namanda — Uncurse";
        items = this.uncurseItems();
        break;
      case "blessConfirm":
        title = "Church of Saint Namanda — Blessing";
        items = this.blessItems();
        break;
    }

    const dialogueHtml = `<div class="npc-dialogue">${this.dialogue}</div>`;
    const goldHtml = `<div class="tavern-ambient">Gold: ${this.state.partyGold}</div>`;
    const headerHtml = `<div class="tavern-header"><div class="tavern-dialogue-block">${dialogueHtml}${goldHtml}</div></div>`;

    const win = new FF6Window({
      title,
      contentHtml: headerHtml,
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
      onBack: () => {
        this.back();
      },
    });
    this.panel.appendChild(win.render());
  }

  /** Tear down without closing (used by tests / hard mode transitions). */
  destroy(): void {
    this.panel.style.display = "none";
    this.panel.innerHTML = "";
  }
}
