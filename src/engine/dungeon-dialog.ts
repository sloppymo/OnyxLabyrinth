/**
 * Blocking dungeon dialog controller.
 *
 * Provides a unified controller for modal dungeon dialogs: raft warnings,
 * raft boarding messages, barred-gate prompts, chute point-of-no-return
 * warnings, keyReward event notifications, and Hot Boi placeholder
 * conversation. Existing NPC (mode "title") and trap (pendingTrap)
 * controllers are NOT replaced — they continue to work unchanged.
 *
 * Key-swallowing protocol:
 * - open(): sets mode to "dialog", swallows the opening keypress.
 * - close(): restores mode to "dungeon", swallows the closing keypress,
 *   sets suppressDungeonMovementUntilKeyup so movement doesn't fire on
 *   the closing key's keyup.
 *
 * This follows the existing justOpenedTrapPrompt / suppressDungeonEscUntilKeyup
 * patterns in main.ts, generalized into a reusable controller.
 */

export interface DialogChoice {
  label: string;
  value: string;
}

export interface DungeonDialogOptions {
  state: { mode: string };
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

export class DungeonDialogController {
  private state: { mode: string };
  private lines: string[];
  private choices: DialogChoice[] | undefined;
  private onSelect: ((value: string) => void) | undefined;
  private onClose: (() => void) | undefined;
  private cancelable: boolean;
  private page = 0;
  private index = 0;
  private active = false;

  constructor(opts: DungeonDialogOptions) {
    this.state = opts.state;
    this.lines = opts.lines;
    this.choices = opts.choices;
    this.onSelect = opts.onSelect;
    this.onClose = opts.onClose;
    this.cancelable = opts.cancelable ?? true;
  }

  /** Open the dialog. Sets mode to "dialog". */
  open(): void {
    this.active = true;
    this.state.mode = "dialog";
    this.page = 0;
    this.index = 0;
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
        return true;
      }
      if (lower === "arrowdown") {
        if (len > 0) this.index = (this.index + 1) % len;
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
      } else {
        // Last page — dismiss or enter choice phase.
        if (this.choices) {
          // Switch to choice menu phase (stay on last page).
          this.index = 0;
        } else {
          this.onSelect?.("ok");
          this.close();
        }
      }
      return true;
    }
    return true; // swallow all other keys while dialog is open
  }

  /** Close the dialog. Restores mode to "dungeon". */
  close(): void {
    if (!this.active) return;
    this.active = false;
    this.state.mode = "dungeon";
    this.onClose?.();
  }
}
