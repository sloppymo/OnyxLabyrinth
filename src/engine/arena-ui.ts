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
import { FF6Window } from "./ff6-window-library";
import { audio } from "./audio";

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
  /** Arena roster experiment label shown in the hub footer. */
  rosterLabel?: string;
  onNext: () => void;
  onExit: () => void;
}

export class ArenaController {
  private panel: HTMLElement;
  private state: GameState;
  private wave: number;
  private floor: number;
  private rosterLabel: string;
  private onNext: () => void;
  private onExit: () => void;
  private options: ArenaOption[];
  private selectedIndex = 0;
  /** Open animation only on first paint — re-renders must not replay it. */
  private hasRendered = false;

  constructor(opts: ArenaControllerOptions) {
    this.panel = opts.panel;
    this.state = opts.state;
    this.wave = opts.wave;
    this.floor = opts.floor;
    this.rosterLabel = opts.rosterLabel ?? "Full Six";
    this.onNext = opts.onNext;
    this.onExit = opts.onExit;

    this.options = [
      { key: "next", label: "Next Fight", icon: "[N]" },
      { key: "exit", label: "Exit to Title", icon: "[Esc]" },
    ];

    this.panel.style.display = "flex";
    this.render();
  }

  handleKey(key: string): void {
    audio.uiForMenuKey(key);
    const lower = key.toLowerCase();

    if (lower === "n") {
      this.selectedIndex = this.options.findIndex((o) => o.key === "next");
      audio.uiConfirm();
      this.select();
      return;
    }
    if (lower === "e" || key === "Escape") {
      this.selectedIndex = this.options.findIndex((o) => o.key === "exit");
      // Escape already played cancel via uiForMenuKey; E needs explicit cancel.
      if (lower === "e") audio.uiCancel();
      this.select();
      return;
    }

    switch (lower) {
      case "arrowup":
      case "w":
        this.selectedIndex = (this.selectedIndex - 1 + this.options.length) % this.options.length;
        if (lower === "w") audio.uiCursor();
        this.render();
        break;
      case "arrowdown":
      case "s":
        this.selectedIndex = (this.selectedIndex + 1) % this.options.length;
        if (lower === "s") audio.uiCursor();
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
    const animated = !this.hasRendered;
    this.hasRendered = true;

    const alive = this.state.party.filter((c) => c.hp > 0).length;
    const avgLevel = Math.round(
      this.state.party.reduce((sum, c) => sum + c.level, 0) / this.state.party.length
    );

    const win = new FF6Window({
      title: "Arena Mode",
      contentHtml: `<div class="ff6-arena-meta">Wave ${this.wave} · Floor ${this.floor}</div>`,
      items: this.options.map((option) => ({
        label: option.label,
        metadata: option.key,
      })),
      selectedIndex: this.selectedIndex,
      mode: "menu",
      footer: "D-pad navigate · A select · B exit",
      footer2: `${this.rosterLabel} · ${alive}/${this.state.party.length} alive · Avg Lv${avgLevel} · ${this.state.partyGold}g`,
      animated,
      onHover: (i) => {
        this.selectedIndex = i;
      },
      onConfirm: (i) => {
        this.selectedIndex = i;
        this.select();
      },
      onBack: () => {
        this.selectedIndex = this.options.findIndex((o) => o.key === "exit");
        this.select();
      },
    });
    this.panel.innerHTML = "";
    this.panel.appendChild(win.render());
  }
}
