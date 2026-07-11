/**
 * Arena mode UI controller.
 *
 * Shown between arena battles. Presents the next wave and lets the player
 * either start the next fight or return to the title screen.
 *
 * Keyboard controls:
 *   Up/Down — navigate menu items
 *   Enter/Space — select
 *   N — start next fight
 *   Escape / E — exit to title
 */

import type { GameState } from "../types";

interface ArenaOption {
  key: "next" | "exit";
  label: string;
  icon: string;
}

export interface ArenaControllerOptions {
  panel: HTMLElement;
  state: GameState;
  wave: number;
  floor: number;
  onNext: () => void;
  onExit: () => void;
}

export class ArenaController {
  private panel: HTMLElement;
  private state: GameState;
  private wave: number;
  private floor: number;
  private onNext: () => void;
  private onExit: () => void;
  private options: ArenaOption[];
  private selectedIndex = 0;

  constructor(opts: ArenaControllerOptions) {
    this.panel = opts.panel;
    this.state = opts.state;
    this.wave = opts.wave;
    this.floor = opts.floor;
    this.onNext = opts.onNext;
    this.onExit = opts.onExit;

    this.options = [
      { key: "next", label: "Next Fight", icon: "[N]" },
      { key: "exit", label: "Exit to Title", icon: "[Esc]" },
    ];

    this.panel.style.display = "block";
    this.render();
  }

  handleKey(key: string): void {
    const lower = key.toLowerCase();

    if (lower === "n") {
      this.selectedIndex = this.options.findIndex((o) => o.key === "next");
      this.select();
      return;
    }
    if (lower === "e" || key === "Escape") {
      this.selectedIndex = this.options.findIndex((o) => o.key === "exit");
      this.select();
      return;
    }

    switch (lower) {
      case "arrowup":
      case "w":
        this.selectedIndex = (this.selectedIndex - 1 + this.options.length) % this.options.length;
        this.render();
        break;
      case "arrowdown":
      case "s":
        this.selectedIndex = (this.selectedIndex + 1) % this.options.length;
        this.render();
        break;
      case "enter":
      case " ":
        this.select();
        break;
    }
  }

  private select(): void {
    const option = this.options[this.selectedIndex];
    this.panel.style.display = "none";
    this.panel.innerHTML = "";
    if (option.key === "next") {
      this.onNext();
    } else {
      this.onExit();
    }
  }

  private render(): void {
    const alive = this.state.party.filter((c) => c.hp > 0).length;
    const avgLevel = Math.round(
      this.state.party.reduce((sum, c) => sum + c.level, 0) / this.state.party.length
    );

    const lines: string[] = [];
    lines.push(`<div class="title-header">Arena Mode</div>`);
    lines.push(`<div class="title-subtitle">Wave ${this.wave} · Floor ${this.floor}</div>`);
    lines.push(
      `<div class="arena-summary">` +
        `Party: ${alive}/${this.state.party.length} alive · Avg Lv${avgLevel} · ${this.state.partyGold}g` +
        `</div>`
    );

    lines.push(`<div class="title-menu">`);
    for (let i = 0; i < this.options.length; i++) {
      const option = this.options[i];
      const selected = i === this.selectedIndex;
      const marker = selected ? "▶" : " ";
      lines.push(
        `<div class="title-menu-item ${selected ? "selected" : ""}">` +
          `<span class="title-marker">${marker}</span>` +
          `<span class="title-icon">${option.icon}</span>` +
          `<span>${option.label}</span>` +
          `</div>`
      );
    }
    lines.push(`</div>`);
    lines.push(`<div class="title-help">[↑/↓] navigate · [Enter] select · [N] next · [Esc] exit</div>`);

    this.panel.innerHTML = lines.join("");
  }
}
