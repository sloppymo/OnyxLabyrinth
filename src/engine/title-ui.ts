/**
 * Title screen controller.
 *
 * Shown on boot. Presents:
 *   - New Game (always)
 *   - Continue (only when an auto-save exists)
 *   - Arena
 *
 * Keyboard controls:
 *   Up/Down — navigate menu items
 *   Enter/Space — select
 */

import type { GameState } from "../types";
import { loadAutoSave } from "../game/save";
import { audio } from "./audio";
import { FF6Window } from "./ff6-window-library";

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
  /** Open animation only on first paint — re-renders must not replay it. */
  private hasRendered = false;

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

    this.panel.style.display = "flex";
    this.render();
  }

  handleKey(key: string): boolean {
    const lower = key.toLowerCase();

    if (lower === "n") {
      this.selectedIndex = this.items.findIndex((i) => i.key === "new");
      audio.uiConfirm();
      this.select();
      return true;
    }
    if (lower === "c" && this.loaded) {
      this.selectedIndex = this.items.findIndex((i) => i.key === "continue");
      audio.uiConfirm();
      this.select();
      return true;
    }
    if (lower === "a") {
      this.selectedIndex = this.items.findIndex((i) => i.key === "arena");
      audio.uiConfirm();
      this.select();
      return true;
    }

    switch (lower) {
      case "arrowup":
      case "w":
        this.selectedIndex = (this.selectedIndex - 1 + this.items.length) % this.items.length;
        audio.uiCursor();
        this.render();
        return true;
      case "arrowdown":
      case "s":
        this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
        audio.uiCursor();
        this.render();
        return true;
      case "enter":
      case " ":
        audio.uiConfirm();
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
    const animated = !this.hasRendered;
    this.hasRendered = true;

    const footer = "D-pad navigate · A select";

    const win = new FF6Window({
      title: "ONYX LABYRINTH",
      items: this.items.map((item) => ({
        label: item.label,
        metadata: item.key,
      })),
      selectedIndex: this.selectedIndex,
      mode: "menu",
      footer,
      animated,
      onHover: (i) => {
        this.selectedIndex = i;
      },
      onConfirm: (i) => {
        this.selectedIndex = i;
        this.select();
      },
    });
    this.panel.innerHTML = "";
    this.panel.appendChild(win.render());
  }
}
