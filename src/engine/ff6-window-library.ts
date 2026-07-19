/**
 * FF6Window — unified reusable menu component (Phase 1 of the unified-menu
 * initiative).
 *
 * Every out-of-combat menu (town, camp, save, perk, trap, NPC) should render
 * through this component so the whole game shares the combat scene's blue
 * FF6 window aesthetic (`.ff6-window` in styles.css).
 *
 * Supports:
 *  - Menu selection (main menus, sub-menus, item lists)
 *  - Status display (character roster, shop inventory) via `contentHtml`
 *  - Description panels (detail views) via `contentHtml`
 *  - Confirmation lists (buy item, disarm trap)
 *
 * Styling:   inherits `.ff6-window` CSS (blue gradient, borders, shadows) and
 *            adds `standalone` + `mode-*` + `width-*` variant classes so the
 *            combat windows themselves are never affected.
 * Input:     keyboard (Up/Down/Enter/Esc/W) via `handleKey()`, gamepad via
 *            `handleInput()` (normalized `ControllerInputEvent`s routed
 *            through the same menu-key mapping the rest of the game uses).
 * Rendering: the owning controller calls `render()` once and then the cheap
 *            targeted updaters (`updateSelectedIndex` / `setFlash` /
 *            `updateItems`) as state changes.
 *
 * This component owns presentation + list navigation ONLY. All business
 * logic (what confirming an item does) stays in the owning controller via
 * the `onConfirm` / `onBack` / `onHover` callbacks — zero game-logic changes.
 */

import type { ControllerInputEvent } from "./controller-input";
import { controllerEventToMenuKey } from "./menu-controller-adapter";
import { audio } from "./audio";

export type FF6WindowMode = "menu" | "selection" | "status" | "description";
export type FF6WindowWidth = "narrow" | "medium" | "wide" | "full";

export interface FF6WindowItem {
  label: string;
  /** Right-aligned detail column (SP cost, price, item count, …). */
  detail?: string;
  disabled?: boolean;
  /** Extra CSS class(es) on the row (e.g. "unaffordable"). */
  className?: string;
  /** Arbitrary data (item id, character id, action key, …). */
  metadata?: unknown;
}

export interface FF6WindowOptions {
  title?: string;
  items: FF6WindowItem[];
  selectedIndex: number;
  mode: FF6WindowMode;
  width?: FF6WindowWidth;
  /** Transient error/status message (red flash row). */
  flash?: string | null;
  footer?: string | null;
  /** Second footer line (resource info: gold, day count, …). */
  footer2?: string | null;
  allowMultilineLabels?: boolean;
  /** Pixel cap for the window; content scrolls internally beyond it. */
  maxHeight?: number;
  /**
   * Trusted HTML block rendered between the title and the item list. Used by
   * status/description modes for grid content (rosters, compare panels).
   * Contract: callers pass developer-authored markup only, never raw user
   * input (matches the pre-existing innerHTML rendering it replaces).
   */
  contentHtml?: string;
  /** When true, opening plays the slide-in animation (default true). */
  animated?: boolean;
  onHover?: (index: number) => void;
  onConfirm?: (index: number) => void;
  onBack?: () => void;
}

const CONFIRM_ANIM_MS = 80;
const CLOSE_ANIM_MS = 100;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export class FF6Window {
  private opts: FF6WindowOptions;
  private element: HTMLElement | null = null;

  constructor(opts: FF6WindowOptions) {
    this.opts = {
      ...opts,
      selectedIndex: clampIndex(opts.selectedIndex, opts.items.length),
    };
  }

  /**
   * Render (or re-render) the window. Returns a DOM element ready to mount.
   * Calling again produces a fresh element; the previous one is detached.
   */
  render(): HTMLElement {
    this.element?.remove();

    const el = document.createElement("div");
    const classes = ["ff6-window", "standalone", `mode-${this.opts.mode}`];
    classes.push(`width-${this.opts.width ?? "full"}`);
    // No items means no sibling .ff6-selection-list, so .ff6-content is the
    // window's only content — see the `content-only` CSS rule for why that
    // needs different flex/scroll behavior than when a list is present.
    if (this.opts.items.length === 0) classes.push("content-only");
    if (this.opts.animated !== false) classes.push("animated");
    el.className = classes.join(" ");
    if (this.opts.maxHeight !== undefined) {
      el.style.maxHeight = `${this.opts.maxHeight}px`;
    }

    const parts: string[] = [];
    if (this.opts.title) {
      parts.push(`<div class="ff6-menu-title">${escapeHtml(this.opts.title)}</div>`);
    }
    if (this.opts.contentHtml) {
      parts.push(`<div class="ff6-content">${this.opts.contentHtml}</div>`);
    }
    if (this.opts.items.length > 0) {
      parts.push(`<div class="ff6-selection-list">${this.renderItemsHtml()}</div>`);
    }
    parts.push(
      `<div class="ff6-flash"${this.opts.flash ? "" : ' style="display:none"'}>` +
        `${escapeHtml(this.opts.flash ?? "")}</div>`
    );
    if (this.opts.footer) {
      parts.push(`<div class="ff6-footer">${escapeHtml(this.opts.footer)}</div>`);
    }
    if (this.opts.footer2) {
      parts.push(`<div class="ff6-footer ff6-footer2">${escapeHtml(this.opts.footer2)}</div>`);
    }

    el.innerHTML = parts.join("");
    this.element = el;
    this.attachPointerHandlers();
    this.scrollSelectionIntoView();
    return el;
  }

  /**
   * Route a keyboard key. Returns true if consumed, false if it should
   * bubble to the owning controller (letter hotkeys, tab switching, …).
   */
  handleKey(key: string): boolean {
    const lower = key.toLowerCase();
    const count = this.opts.items.length;

    if (lower === "arrowup" || lower === "w") {
      if (count > 0) {
        this.updateSelectedIndex((this.opts.selectedIndex - 1 + count) % count);
        audio.uiCursor();
        this.opts.onHover?.(this.opts.selectedIndex);
      }
      return true;
    }
    if (lower === "arrowdown") {
      if (count > 0) {
        this.updateSelectedIndex((this.opts.selectedIndex + 1) % count);
        audio.uiCursor();
        this.opts.onHover?.(this.opts.selectedIndex);
      }
      return true;
    }
    if (key === "Enter" || key === " ") {
      const item = this.opts.items[this.opts.selectedIndex];
      if (item && !item.disabled) {
        audio.uiConfirm();
        this.opts.onConfirm?.(this.opts.selectedIndex);
      }
      return true;
    }
    if (lower === "escape") {
      audio.uiCancel();
      this.opts.onBack?.();
      return true;
    }
    return false;
  }

  /**
   * Route a normalized controller event (dpad = navigate, A = confirm,
   * B/Select = back). Shoulders and triggers pass through untouched.
   */
  handleInput(event: ControllerInputEvent): boolean {
    const key = controllerEventToMenuKey(event);
    if (key === null) return false;
    if (key === "ArrowLeft" || key === "ArrowRight") return false;
    return this.handleKey(key);
  }

  /** Move the highlight without rebuilding the DOM. */
  updateSelectedIndex(index: number): void {
    this.opts.selectedIndex = clampIndex(index, this.opts.items.length);
    this.updateMenuHighlight();
  }

  /** Replace the item list (inventory changed, …). Rebuilds the list only. */
  updateItems(items: FF6WindowItem[]): void {
    this.opts.items = items;
    this.opts.selectedIndex = clampIndex(this.opts.selectedIndex, items.length);
    const listEl = this.element?.querySelector<HTMLElement>(".ff6-selection-list");
    if (listEl) {
      listEl.innerHTML = this.renderItemsHtml();
      this.attachPointerHandlers();
      this.scrollSelectionIntoView();
    } else if (this.element?.parentElement) {
      const parent = this.element.parentElement;
      this.element.remove();
      parent.appendChild(this.render());
    }
  }

  /** Show/clear the transient red flash row. */
  setFlash(message: string | null): void {
    this.opts.flash = message;
    const flashEl = this.element?.querySelector<HTMLElement>(".ff6-flash");
    if (flashEl) {
      flashEl.textContent = message ?? "";
      flashEl.style.display = message ? "" : "none";
    }
  }

  /** Brief scale-pulse on the selected row (call before acting on confirm). */
  async playConfirmAnimation(): Promise<void> {
    const item = this.element?.querySelector(".ff6-menu-item.selected");
    if (!item) return;
    item.classList.add("confirming");
    await delay(CONFIRM_ANIM_MS);
    item.classList.remove("confirming");
  }

  /** Slide-out animation, then destroy. */
  async closeWindow(): Promise<void> {
    if (!this.element) return;
    this.element.classList.add("closing");
    await delay(CLOSE_ANIM_MS);
    this.destroy();
  }

  /** Remove from the DOM. Call when the menu closes. */
  destroy(): void {
    this.element?.remove();
    this.element = null;
  }

  getSelectedIndex(): number {
    return this.opts.selectedIndex;
  }

  getSelectedItem(): FF6WindowItem | undefined {
    return this.opts.items[this.opts.selectedIndex];
  }

  getSelectedMetadata<T>(): T | undefined {
    return this.opts.items[this.opts.selectedIndex]?.metadata as T | undefined;
  }

  getElement(): HTMLElement | null {
    return this.element;
  }

  /**
   * Static chrome helper: wrap arbitrary trusted HTML in FF6 window styling
   * (title / content / optional footer). For content-heavy screens (roster
   * grids, buy-confirm compare panels) that aren't simple selection lists.
   */
  static frame(opts: {
    title?: string;
    contentHtml: string;
    footer?: string;
    flash?: string | null;
    width?: FF6WindowWidth;
    mode?: FF6WindowMode;
    animated?: boolean;
  }): HTMLElement {
    const el = document.createElement("div");
    const classes = [
      "ff6-window",
      "standalone",
      // `.frame()` never renders a sibling `.ff6-selection-list`, so unlike
      // the instance render() path, its `.ff6-content` is always the only
      // scrollable content in the window — see the `content-only` CSS rule.
      "content-only",
      `mode-${opts.mode ?? "status"}`,
      `width-${opts.width ?? "full"}`,
    ];
    if (opts.animated !== false) classes.push("animated");
    el.className = classes.join(" ");
    const parts: string[] = [];
    if (opts.title) {
      parts.push(`<div class="ff6-menu-title">${escapeHtml(opts.title)}</div>`);
    }
    parts.push(`<div class="ff6-content">${opts.contentHtml}</div>`);
    if (opts.flash) {
      parts.push(`<div class="ff6-flash">${escapeHtml(opts.flash)}</div>`);
    }
    if (opts.footer) {
      parts.push(`<div class="ff6-footer">${escapeHtml(opts.footer)}</div>`);
    }
    el.innerHTML = parts.join("");
    return el;
  }

  // --- internals ----------------------------------------------------------

  private renderItemsHtml(): string {
    const rows: string[] = [];
    for (let i = 0; i < this.opts.items.length; i++) {
      const item = this.opts.items[i];
      const classes = ["ff6-menu-item"];
      if (i === this.opts.selectedIndex) classes.push("selected");
      if (item.disabled) classes.push("disabled");
      if (item.className) classes.push(item.className);
      if (this.opts.allowMultilineLabels) classes.push("multiline");
      const detail =
        item.detail !== undefined
          ? `<span class="ff6-sel-detail">${escapeHtml(item.detail)}</span>`
          : "";
      rows.push(
        `<div class="${classes.join(" ")}" data-index="${i}">` +
          `<span class="ff6-sel-label">${escapeHtml(item.label)}</span>` +
          detail +
          `</div>`
      );
    }
    return rows.join("");
  }

  private attachPointerHandlers(): void {
    if (!this.element) return;
    const rows = this.element.querySelectorAll<HTMLElement>(".ff6-menu-item");
    rows.forEach((row) => {
      const index = Number(row.dataset.index);
      if (Number.isNaN(index)) return;
      row.onmouseenter = () => {
        if (index !== this.opts.selectedIndex) {
          this.updateSelectedIndex(index);
          audio.uiCursor();
          this.opts.onHover?.(index);
        }
      };
      row.onclick = () => {
        this.updateSelectedIndex(index);
        const item = this.opts.items[index];
        if (item && !item.disabled) {
          audio.uiConfirm();
          this.opts.onConfirm?.(index);
        }
      };
    });
  }

  private updateMenuHighlight(): void {
    if (!this.element) return;
    const rows = this.element.querySelectorAll<HTMLElement>(".ff6-menu-item");
    rows.forEach((row) => {
      const index = Number(row.dataset.index);
      row.classList.toggle("selected", index === this.opts.selectedIndex);
    });
    this.scrollSelectionIntoView();
  }

  private scrollSelectionIntoView(): void {
    const list = this.element?.querySelector<HTMLElement>(".ff6-selection-list");
    const selected = list?.querySelector<HTMLElement>(".ff6-menu-item.selected");
    if (!list || !selected) return;
    // Adjust the internal list's scrollTop directly rather than
    // Element.scrollIntoView(), which walks *every* scrollable ancestor —
    // including the document — and was scrolling the whole page down,
    // clipping the Buy/Sell/Appraise tab row off the top of the shop window.
    const above = selected.offsetTop;
    const below = selected.offsetTop + selected.offsetHeight;
    if (above < list.scrollTop) {
      list.scrollTop = above;
    } else if (below > list.scrollTop + list.clientHeight) {
      list.scrollTop = below - list.clientHeight;
    }
  }
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
