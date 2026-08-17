/**
 * Perk selection overlay — opened after combat when one or more characters
 * reach a perk tier (levels 3/6/9/12).
 *
 * Shows one character at a time with their two mutually exclusive perk choices.
 * Arrow keys select a card, Enter confirms. The overlay consumes the queue and
 * then returns to the dungeon.
 *
 * Overlay input lives on `UiStack` in main.ts (id `"perk"`). GameState.mode
 * stays dungeon or arena underneath.
 */

import type { GameState } from "../types";
import type { Character } from "../game/party";
import {
  applyPerkSelection,
  perkChoicesFor,
  type PendingPerkChoice,
  type PerkDef,
} from "../game/perks";
import { FF6Window } from "./ff6-window-library";
import { audio } from "./audio";

export interface PerkSelectControllerOptions {
  panel: HTMLElement;
  state: GameState;
  queue: PendingPerkChoice[];
  onDone: () => void;
}

const TAG_COLORS: Record<string, string> = {
  offense: "#e80",
  defense: "#4af",
  support: "#8d6",
  reactive: "#d8d",
  utility: "#bb8",
  melee: "#fa6",
  aoe: "#f88",
  passive: "#aaa",
};

export class PerkSelectController {
  private panel: HTMLElement;
  private state: GameState;
  private queue: PendingPerkChoice[];
  private onDone: () => void;

  private currentIndex = 0;
  private selectedCard = 0;
  /** True once the player has moved the card cursor for the CURRENT choice.
   *  Enter is inert until then, so leftover Enter from combat (if it ever
   *  reached this overlay) cannot silently burn a perk pick. Snapshot-once
   *  routing already keeps the combat-confirm key off this layer. */
  private hasInteracted = false;
  /** Hint shown when Enter is pressed before choosing a card. */
  private confirmBlockedHint = false;
  /** Queue index of the last rendered choice — the FF6 window open animation
   *  plays only when the overlay first opens or advances to the next
   *  character, never on ←/→ cursor re-renders. */
  private lastRenderedChoice = -1;

  constructor(opts: PerkSelectControllerOptions) {
    this.panel = opts.panel;
    this.state = opts.state;
    this.queue = opts.queue;
    this.onDone = opts.onDone;
    this.panel.style.display = "flex";
    this.render();
  }

  handleKey(key: string): void {
    const choice = this.currentChoice();
    if (!choice) return;

    const lower = key.toLowerCase();
    if (lower === "arrowleft" || lower === "a") {
      this.selectedCard = 0;
      this.hasInteracted = true;
      this.confirmBlockedHint = false;
      audio.uiCursor();
      this.render();
      return;
    }
    if (lower === "arrowright" || lower === "d") {
      this.selectedCard = 1;
      this.hasInteracted = true;
      this.confirmBlockedHint = false;
      audio.uiCursor();
      this.render();
      return;
    }
    if (key === "Enter" || key === " ") {
      // Explicit confirmation: a card must have been selected with ←/→
      // first. This is the guard that makes Enter-spam harmless.
      if (!this.hasInteracted) {
        this.confirmBlockedHint = true;
        this.render();
        return;
      }
      audio.uiConfirm();
      this.confirm();
      return;
    }
  }

  private currentChoice(): { character: Character; tier: 1 | 2 | 3 | 4 } | null {
    const pending = this.queue[this.currentIndex];
    if (!pending) return null;
    const character = this.state.party.find((c) => c.id === pending.charId);
    if (!character) return null;
    return { character, tier: pending.tier };
  }

  private confirm(): void {
    const pending = this.queue[this.currentIndex];
    if (!pending) return;
    const character = this.state.party.find((c) => c.id === pending.charId);
    if (!character) {
      this.advance();
      return;
    }

    const choices = perkChoicesFor(character.class, pending.tier);
    const chosen = choices[this.selectedCard];
    if (!chosen) {
      this.advance();
      return;
    }

    this.state.party = this.state.party.map((c) =>
      c.id === character.id ? applyPerkSelection(c, chosen.id) : c
    );

    this.advance();
  }

  private advance(): void {
    this.currentIndex++;
    this.selectedCard = 0;
    // Each queued character needs their own deliberate ←/→ + Enter.
    this.hasInteracted = false;
    this.confirmBlockedHint = false;
    if (this.currentIndex >= this.queue.length) {
      this.dispose();
      this.onDone();
    } else {
      this.render();
    }
  }

  private dispose(): void {
    this.panel.style.display = "none";
    this.panel.innerHTML = "";
  }

  // --- Rendering -----------------------------------------------------------

  private render(): void {
    const current = this.currentChoice();
    if (!current) {
      this.dispose();
      this.onDone();
      return;
    }

    const { character, tier } = current;
    const choices = perkChoicesFor(character.class, tier);
    const animated = this.lastRenderedChoice !== this.currentIndex;
    this.lastRenderedChoice = this.currentIndex;

    const cards: string[] = [];
    cards.push(`<div class="perk-select-cards">`);
    for (let i = 0; i < choices.length; i++) {
      cards.push(this.renderCard(choices[i], i === this.selectedCard));
    }
    cards.push(`</div>`);

    this.panel.innerHTML = "";
    this.panel.appendChild(
      FF6Window.frame({
        title:
          `${character.name} — Level ${character.level} ${character.class}` +
          ` — Choose a Tier ${tier} Perk`,
        contentHtml: cards.join(""),
        flash: this.confirmBlockedHint
          ? "Pick a card with ←/→ first, then Enter to confirm."
          : undefined,
        footer: "[←/→] select · [Enter] confirm",
        mode: "description",
        animated,
      })
    );
  }

  private renderCard(perk: PerkDef, selected: boolean): string {
    const tags = perk.tags
      .map((t) => {
        const color = TAG_COLORS[t] ?? "#aaa";
        return `<span class="perk-select-tag" style="border-color:${color};color:${color}">${t}</span>`;
      })
      .join("");

    return (
      `<div class="perk-select-card ${selected ? "selected" : ""}">` +
      `<div class="perk-select-name">${perk.name}</div>` +
      `<div class="perk-select-desc">${perk.description}</div>` +
      `<div class="perk-select-tags">${tags}</div>` +
      `</div>`
    );
  }
}
