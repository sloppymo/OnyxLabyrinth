/**
 * Blocking dungeon dialog controller.
 *
 * Provides a unified controller for modal dungeon dialogs: raft warnings,
 * raft boarding messages, barred-gate prompts, chute point-of-no-return
 * warnings, keyReward event notifications, and Hot Boi placeholder
 * conversation. Existing NPC and trap controllers are NOT replaced.
 *
 * Input ownership lives on `UiStack` (`id: "dialog"`). This class does not
 * mutate `GameState.mode` — raft animation is the only remaining `"dialog"`
 * mode, used to lock traversal while the boat moves.
 *
 * Closing still asks the caller to swallow movement until keyup
 * (`suppressDungeonMovementUntilKeyup` in main.ts).
 *
 * Rendering: this class owns both state and presentation (same pattern as
 * NPCController/TavernController) via the FF6Window library, painted into
 * the caller-supplied `panel` element. main.ts is responsible for
 * `showMode("dialog", ...)` on open and `showMode("dungeon", ...)` in its
 * onClose — this class only touches its own panel's contents, not
 * mode-level DOM visibility.
 */

import { FF6Window } from "./ff6-window-library";

export interface DialogChoice {
  label: string;
  value: string;
}

export interface DungeonDialogOptions {
  /** Kept for call-site compatibility; dialogs no longer mutate GameMode. */
  state: { mode: string };
  /** DOM element to render into (typically #combat-panel). */
  panel: HTMLElement;
  /** Paginated dialog text (each entry is one page). */
  lines: string[];
  /** Optional choices (if present, the dialog is a menu, not just text). */
  choices?: DialogChoice[];
  /** Title shown above the dialog (e.g. NPC name, "Warning"). */
  title?: string;
  /** Callback when a choice is selected or the text dialog is dismissed. */
  onSelect?: (value: string) => void;
  /** Callback when the dialog is closed (after onSelect, if any). */
  onClose?: () => void;
  /** If true, Esc closes the dialog with value "cancel". Default true. */
  cancelable?: boolean;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export class DungeonDialogController {
  private panel: HTMLElement;
  private lines: string[];
  private choices: DialogChoice[] | undefined;
  private title: string | undefined;
  private onSelect: ((value: string) => void) | undefined;
  private onClose: (() => void) | undefined;
  private cancelable: boolean;
  private page = 0;
  private index = 0;
  private active = false;

  constructor(opts: DungeonDialogOptions) {
    this.panel = opts.panel;
    this.lines = opts.lines;
    this.choices = opts.choices;
    this.title = opts.title;
    this.onSelect = opts.onSelect;
    this.onClose = opts.onClose;
    this.cancelable = opts.cancelable ?? true;
  }

  /** Open the dialog and paint the first page. Mode stays with the caller. */
  open(): void {
    this.active = true;
    this.page = 0;
    this.index = 0;
    this.render();
  }

  /** True while on the last page with choices present (matches handleKey's
   *  own phase check — kept in sync deliberately rather than tracked as a
   *  separate flag). */
  private inChoicePhase(): boolean {
    return !!this.choices && this.page >= this.lines.length - 1;
  }

  private render(): void {
    this.panel.innerHTML = "";
    const text = this.lines[this.page] ?? "";
    const contentHtml = `<div class="dungeon-dialog-text">${escapeHtml(text)}</div>`;

    if (this.inChoicePhase() && this.choices) {
      const win = new FF6Window({
        title: this.title,
        contentHtml,
        items: this.choices.map((c) => ({ label: c.label })),
        selectedIndex: this.index,
        mode: "menu",
        footer: this.cancelable ? "[↑/↓] select · [Enter] confirm · [Esc] cancel" : "[↑/↓] select · [Enter] confirm",
        onHover: (i) => {
          this.index = i;
        },
        onConfirm: (i) => {
          this.index = i;
          const choice = this.choices?.[i];
          if (choice) {
            this.onSelect?.(choice.value);
            this.close();
          }
        },
      });
      this.panel.appendChild(win.render());
      return;
    }

    const morePages = this.page < this.lines.length - 1;
    this.panel.appendChild(
      FF6Window.frame({
        title: this.title,
        contentHtml,
        footer: morePages ? "[Enter] continue" : "[Enter] close",
        mode: "description",
      })
    );
  }

  /** True if the dialog is currently active. */
  isActive(): boolean {
    return this.active;
  }

  /** Current page index (0-based). */
  get currentPage(): number {
    return this.page;
  }

  /** Total number of pages. */
  get pageCount(): number {
    return this.lines.length;
  }

  /** Current menu selection index (for choice dialogs). */
  get selectedIndex(): number {
    return this.index;
  }

  /** Handle a keypress while the dialog is open. Returns true if consumed. */
  handleKey(key: string): boolean {
    if (!this.active) return false;
    const lower = key.toLowerCase();

    if (this.choices && this.page >= this.lines.length - 1) {
      // Choice menu phase.
      const len = this.choices.length;
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
        const choice = this.choices[this.index];
        if (choice) {
          this.onSelect?.(choice.value);
          this.close();
        }
        return true;
      }
      if (lower === "escape" && this.cancelable) {
        this.onSelect?.("cancel");
        this.close();
        return true;
      }
      return true; // swallow all other keys
    }

    // Text page phase.
    if (key === "Enter" || key === " " || lower === "escape") {
      if (this.page < this.lines.length - 1) {
        this.page++;
        this.render();
      } else {
        // Last page — dismiss or enter choice phase.
        if (this.choices) {
          // Switch to choice menu phase (stay on last page).
          this.index = 0;
          this.render();
        } else {
          this.onSelect?.("ok");
          this.close();
        }
      }
      return true;
    }
    return true; // swallow all other keys while dialog is open
  }

  /** Close the dialog and clear the panel. */
  close(): void {
    if (!this.active) return;
    this.active = false;
    this.panel.innerHTML = "";
    this.onClose?.();
  }
}
