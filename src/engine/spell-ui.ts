/**
 * Dungeon spell menu controller — opened with G in dungeon mode.
 *
 * Lists every (caster, utility spell) pair the party can attempt (Lucenis,
 * Pathrend, Aerivex, …) with SP costs, greying out unaffordable rows. Enter
 * casts via game/persistent-spells.ts and closes; Esc/G closes without
 * casting. main.ts borrows "title" mode while the menu is open (same trick
 * as the save menu) so dungeon input pauses.
 */

import type { GameState } from "../types";
import {
  utilityCastOptions,
  castUtilitySpell,
  type UtilityCastOption,
} from "../game/persistent-spells";

export interface SpellMenuControllerOptions {
  panel: HTMLElement;
  state: GameState;
  /** Called with the cast's result message ("" if closed without casting). */
  onClose: (message: string) => void;
}

export class SpellMenuController {
  private panel: HTMLElement;
  private state: GameState;
  private onClose: (message: string) => void;
  private options: UtilityCastOption[];
  private index = 0;

  constructor(opts: SpellMenuControllerOptions) {
    this.panel = opts.panel;
    this.state = opts.state;
    this.onClose = opts.onClose;
    this.options = utilityCastOptions(this.state);
    this.panel.style.display = "block";
    this.render();
  }

  handleKey(key: string): void {
    const lower = key.toLowerCase();
    if (lower === "escape" || lower === "g") {
      this.close("");
      return;
    }
    if (this.options.length === 0) return;
    if (lower === "arrowup" || lower === "w") {
      this.index = (this.index - 1 + this.options.length) % this.options.length;
      this.render();
      return;
    }
    if (lower === "arrowdown" || lower === "s") {
      this.index = (this.index + 1) % this.options.length;
      this.render();
      return;
    }
    if (key === "Enter" || key === " ") {
      const opt = this.options[this.index];
      if (!opt.affordable) {
        this.render("Not enough SP.");
        return;
      }
      const msg = castUtilitySpell(this.state, opt.casterId, opt.spell.id);
      this.close(msg);
    }
  }

  private close(message: string): void {
    this.panel.style.display = "none";
    this.panel.innerHTML = "";
    this.onClose(message);
  }

  private render(flash?: string): void {
    const lines: string[] = [];
    lines.push(`<div class="camp-header">[G] GRIMOIRE — utility spells</div>`);
    if (this.options.length === 0) {
      lines.push(`<div class="camp-party"><div class="camp-char"><span class="cc-name">No one knows a utility spell.</span></div></div>`);
    } else {
      lines.push(`<div class="camp-party">`);
      for (let i = 0; i < this.options.length; i++) {
        const o = this.options[i];
        const marker = i === this.index ? "▶" : " ";
        const dim = o.affordable ? "" : " style='opacity:0.45'";
        lines.push(
          `<div class="camp-char"${dim}>` +
            `<span class="cc-name">${marker} ${o.spell.name} — ${o.casterName} (${o.spell.spCost} SP)</span>` +
            `<span class="cc-num">${o.spell.description}</span>` +
            `</div>`
        );
      }
      lines.push(`</div>`);
    }
    if (flash) lines.push(`<div class="camp-resting">${flash}</div>`);
    lines.push(`<div class="camp-done">[↑/↓] select · [Enter] cast · [Esc] close</div>`);
    this.panel.innerHTML = lines.join("");
  }
}
