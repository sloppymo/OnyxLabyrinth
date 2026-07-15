/**
 * Trapped chest prompt — four-row Inspect / Disarm / Open / Leave list.
 * Pure navigation + action ids; main.ts applies features.ts chest APIs and
 * refreshes `#message` via `renderMessage`.
 */

export type TrapActionId = "inspect" | "disarm" | "open" | "leave";

const ACTIONS: ReadonlyArray<{ id: TrapActionId; label: string; key: string }> = [
  { id: "inspect", label: "[I]nspect", key: "i" },
  { id: "disarm", label: "[D]isarm", key: "d" },
  { id: "open", label: "[O]pen", key: "o" },
  { id: "leave", label: "[L]eave", key: "l" },
];

export class TrapPromptController {
  private index = 0;

  /** Current highlight index (0 = Inspect … 3 = Leave). */
  get selectedIndex(): number {
    return this.index;
  }

  /**
   * Handle a menu key. Returns an action id when the player confirms or uses
   * a letter shortcut; `null` for pure navigation (arrows) or unknown keys.
   */
  handleKey(key: string): TrapActionId | null {
    const lower = key.toLowerCase();

    if (lower === "escape") return "leave";

    for (const action of ACTIONS) {
      if (lower === action.key) return action.id;
    }

    if (lower === "arrowdown" || lower === "s") {
      this.index = (this.index + 1) % ACTIONS.length;
      return null;
    }
    if (lower === "arrowup" || lower === "w") {
      this.index = (this.index - 1 + ACTIONS.length) % ACTIONS.length;
      return null;
    }

    if (key === "Enter" || key === " ") {
      return ACTIONS[this.index]!.id;
    }

    return null;
  }

  /** Compact two-line menu for `#message` (~2×30 chars). */
  renderMessage(inspected: boolean): string {
    const prefix = inspected ? "" : "Trapped chest! ";
    const row = (a: number, b: number) =>
      `${this.formatOption(a)} · ${this.formatOption(b)}`;
    return `${prefix}${row(0, 1)}\n${row(2, 3)}`;
  }

  private formatOption(i: number): string {
    const marker = i === this.index ? "▶" : " ";
    return `${marker}${ACTIONS[i]!.label}`;
  }
}
