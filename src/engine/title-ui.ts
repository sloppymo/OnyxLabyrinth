/**
 * Title screen controller.
 *
 * Shown on boot. Presents:
 *   - New Game (always)
 *   - Continue (only when an auto-save exists)
 *
 * Keyboard controls:
 *   Up/Down — navigate menu items
 *   Enter/Space — select
 */

import type { GameState } from "../types";
import { loadAutoSave } from "../game/save";

interface MenuItem {
  key: "new" | "continue" | "arena";
  label: string;
  icon: string;
}

export interface TitleControllerOptions {
  panel: HTMLElement;
  onNewGame: () => void;
  onContinue: (loaded: GameState) => void;
  onArena: () => void;
}

export class TitleController {
  private panel: HTMLElement;
  private onNewGame: () => void;
  private onContinue: (loaded: GameState) => void;
  private onArena: () => void;
  private items: MenuItem[];
  private selectedIndex = 0;
  private loaded: GameState | null = null;

  constructor(opts: TitleControllerOptions) {
    this.panel = opts.panel;
    this.onNewGame = opts.onNewGame;
    this.onContinue = opts.onContinue;
    this.onArena = opts.onArena;

    this.loaded = loadAutoSave();
    this.items = [{ key: "new", label: "New Game", icon: "[N]" }];
    if (this.loaded) {
      this.items.push({ key: "continue", label: "Continue", icon: "[C]" });
    }
    this.items.push({ key: "arena", label: "Arena", icon: "[A]" });

    this.panel.style.display = "block";
    this.render();
  }

  handleKey(key: string): boolean {
    const lower = key.toLowerCase();

    if (lower === "n") {
      this.selectedIndex = this.items.findIndex((i) => i.key === "new");
      this.select();
      return true;
    }
    if (lower === "c" && this.loaded) {
      this.selectedIndex = this.items.findIndex((i) => i.key === "continue");
      this.select();
      return true;
    }
    if (lower === "a") {
      this.selectedIndex = this.items.findIndex((i) => i.key === "arena");
      this.select();
      return true;
    }

    switch (lower) {
      case "arrowup":
      case "w":
        this.selectedIndex = (this.selectedIndex - 1 + this.items.length) % this.items.length;
        this.render();
        return true;
      case "arrowdown":
      case "s":
        this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
        this.render();
        return true;
      case "enter":
      case " ":
        this.select();
        return true;
    }
    return false;
  }

  private select(): void {
    const item = this.items[this.selectedIndex];
    this.panel.style.display = "none";
    this.panel.innerHTML = "";
    if (item.key === "continue" && this.loaded) {
      this.onContinue(this.loaded);
    } else if (item.key === "arena") {
      this.onArena();
    } else {
      this.onNewGame();
    }
  }

  private render(): void {
    const lines: string[] = [];
    lines.push(`<div class="title-header">Heart of the Maelstrom</div>`);
    lines.push(`<div class="title-subtitle">— Vertical Slice —</div>`);
    lines.push(`<div class="title-menu">`);
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      const selected = i === this.selectedIndex;
      const marker = selected ? "▶" : " ";
      lines.push(
        `<div class="title-menu-item ${selected ? "selected" : ""}">` +
          `<span class="title-marker">${marker}</span>` +
          `<span class="title-icon">${item.icon}</span>` +
          `<span>${item.label}</span>` +
          `</div>`
      );
    }
    lines.push(`</div>`);
    lines.push(`<div class="title-help">[↑/↓] navigate · [Enter] select · [N] new game</div>`);
    if (this.loaded) {
      lines.push(`<div class="title-help">[C] continue</div>`);
    }
    lines.push(`<div class="title-help">[A] arena</div>`);

    this.panel.innerHTML = lines.join("");
  }
}
