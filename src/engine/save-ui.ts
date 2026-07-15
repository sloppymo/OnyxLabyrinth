/**
 * Save/Load menu UI controller — design doc Section 13.
 *
 * Opens on Esc from dungeon mode. Shows 10 save slots with metadata
 * (floor, day, party status, timestamp). The player can:
 *   - Save to a slot (overwrites)
 *   - Load from a slot (replaces current game state)
 *   - Delete a slot
 *   - Return to the game (Esc or Q)
 *
 * Keyboard controls:
 *   Up/Down or W/S — navigate slots (browsing) or actions (action pick)
 *   Enter / Space — open action pick (browsing) or confirm action / Y on prompts
 *   S — save to selected slot
 *   L — load from selected slot
 *   D — delete selected slot
 *   Esc / Q — close menu (browsing) or cancel back (action pick / confirms)
 *
 * The controller renders to a DOM element and calls onLoaded(state) when
 * the player loads a save, or onClose() when they dismiss the menu.
 */

import type { GameMode, GameState } from "../types";
import {
  getAllSlotMetas,
  saveToSlot,
  loadFromSlot,
  deleteSlot,
  SLOT_COUNT,
  type SaveSlotMeta,
} from "../game/save";
import { FF6Window } from "./ff6-window-library";

type MenuPhase = "browsing" | "actionPick" | "confirmOverwrite" | "confirmLoad" | "confirmDelete";

const ACTIONS = ["Save", "Load", "Delete", "Cancel"] as const;

export interface SaveControllerOptions {
  panel: HTMLElement;
  state: GameState;
  onLoaded: (state: GameState) => void;
  onClose: () => void;
  /** Mode to write into a save when the controller is running in an overlay
   *  (title / party_creation). Saves from the save menu should resume the
   *  mode that was active before the menu opened, not the overlay mode. */
  modeBeforeSave?: GameMode;
}

export class SaveController {
  private panel: HTMLElement;
  private state: GameState;
  private onLoaded: (state: GameState) => void;
  private onClose: () => void;
  private modeBeforeSave: GameMode;
  private selectedIndex = 0;
  private actionIndex = 0;
  private phase: MenuPhase = "browsing";
  private metas: SaveSlotMeta[];
  private flash = "";
  /** The FF6 open animation plays only on the first render — the menu
   *  re-renders on every keystroke and must not replay it. */
  private hasRendered = false;

  constructor(opts: SaveControllerOptions) {
    this.panel = opts.panel;
    this.state = opts.state;
    this.onLoaded = opts.onLoaded;
    this.onClose = opts.onClose;
    this.modeBeforeSave = opts.modeBeforeSave ?? "dungeon";
    this.metas = getAllSlotMetas();
    this.panel.style.display = "block";
    this.render();
  }

  handleKey(key: string): void {
    const lower = key.toLowerCase();

    if (this.phase === "confirmOverwrite") {
      if (lower === "y" || key === "Enter" || key === " ") {
        this.doSave();
      } else if (lower === "n" || key === "Escape") {
        this.phase = "browsing";
        this.flash = "";
        this.render();
      }
      return;
    }

    if (this.phase === "confirmLoad") {
      if (lower === "y" || key === "Enter" || key === " ") {
        this.doLoad();
      } else if (lower === "n" || key === "Escape") {
        this.phase = "browsing";
        this.flash = "";
        this.render();
      }
      return;
    }

    if (this.phase === "confirmDelete") {
      if (lower === "y" || key === "Enter" || key === " ") {
        this.doDelete();
      } else if (lower === "n" || key === "Escape") {
        this.phase = "browsing";
        this.flash = "";
        this.render();
      }
      return;
    }

    if (this.phase === "actionPick") {
      switch (lower) {
        case "arrowup":
        case "w":
          this.actionIndex = (this.actionIndex - 1 + ACTIONS.length) % ACTIONS.length;
          this.render();
          break;
        case "arrowdown":
          this.actionIndex = (this.actionIndex + 1) % ACTIONS.length;
          this.render();
          break;
        case "enter":
        case " ":
          this.executeAction();
          break;
        case "escape":
          this.phase = "browsing";
          this.flash = "";
          this.render();
          break;
      }
      return;
    }

    // Browsing phase
    switch (lower) {
      case "arrowup":
      case "w":
        this.selectedIndex = (this.selectedIndex - 1 + SLOT_COUNT) % SLOT_COUNT;
        this.flash = "";
        this.render();
        break;
      case "arrowdown":
        this.selectedIndex = (this.selectedIndex + 1) % SLOT_COUNT;
        this.flash = "";
        this.render();
        break;
      case "enter":
      case " ":
        this.phase = "actionPick";
        this.actionIndex = 0;
        this.flash = "";
        this.render();
        break;
      case "s":
        this.trySave();
        break;
      case "l":
        this.tryLoad();
        break;
      case "d":
        this.tryDelete();
        break;
      case "escape":
      case "q":
        this.dispose();
        this.onClose();
        break;
    }
  }

  private executeAction(): void {
    const action = ACTIONS[this.actionIndex];
    switch (action) {
      case "Save":
        this.trySave();
        break;
      case "Load":
        this.tryLoad();
        break;
      case "Delete":
        this.tryDelete();
        break;
      case "Cancel":
        this.phase = "browsing";
        this.flash = "";
        this.render();
        break;
    }
  }

  private trySave(): void {
    const meta = this.metas[this.selectedIndex];
    if (!meta.empty) {
      this.phase = "confirmOverwrite";
      this.flash = `Slot ${this.selectedIndex + 1} already has a save. Overwrite? (Y/N)`;
      this.render();
    } else {
      this.doSave();
    }
  }

  private doSave(): void {
    // When saving from an overlay mode, write the actual underlying mode so
    // the save can be resumed later.
    const saveMode =
      this.state.mode === "title" || this.state.mode === "party_creation"
        ? this.modeBeforeSave
        : this.state.mode;
    const saveState = { ...this.state, mode: saveMode };
    const ok = saveToSlot(saveState, this.selectedIndex);
    if (ok) {
      this.metas = getAllSlotMetas();
      this.phase = "browsing";
      this.flash = `Saved to slot ${this.selectedIndex + 1}.`;
    } else {
      this.phase = "browsing";
      this.flash = `Save failed (storage error?).`;
    }
    this.render();
  }

  private tryLoad(): void {
    const meta = this.metas[this.selectedIndex];
    if (meta.empty) {
      this.flash = `Slot ${this.selectedIndex + 1} is empty.`;
      this.render();
      return;
    }
    this.phase = "confirmLoad";
    this.flash = `Load slot ${this.selectedIndex + 1}? Current progress will be lost. (Y/N)`;
    this.render();
  }

  private doLoad(): void {
    const loaded = loadFromSlot(this.selectedIndex);
    if (loaded) {
      this.dispose();
      this.onLoaded(loaded);
    } else {
      this.phase = "browsing";
      this.flash = `Load failed (corrupt save data?).`;
      this.render();
    }
  }

  private tryDelete(): void {
    const meta = this.metas[this.selectedIndex];
    if (meta.empty) {
      this.flash = `Slot ${this.selectedIndex + 1} is already empty.`;
      this.render();
      return;
    }
    this.phase = "confirmDelete";
    this.flash = `Delete slot ${this.selectedIndex + 1}? (Y/N)`;
    this.render();
  }

  private doDelete(): void {
    deleteSlot(this.selectedIndex);
    this.metas = getAllSlotMetas();
    this.phase = "browsing";
    this.flash = `Slot ${this.selectedIndex + 1} deleted.`;
    this.render();
  }

  private dispose(): void {
    this.panel.style.display = "none";
    this.panel.innerHTML = "";
  }

  // --- Rendering ----------------------------------------------------------

  private render(): void {
    const animated = !this.hasRendered;
    this.hasRendered = true;

    const lines: string[] = [];
    const slotHighlighted = this.phase === "browsing" || this.phase === "actionPick";

    lines.push(`<div class="save-slots">`);
    for (let i = 0; i < SLOT_COUNT; i++) {
      const meta = this.metas[i];
      const isSelected = i === this.selectedIndex && slotHighlighted;
      const marker = isSelected ? "▶" : " ";
      if (meta.empty) {
        lines.push(
          `<div class="save-slot ${isSelected ? "selected" : ""}">` +
            `<span class="ss-marker">${marker}</span>` +
            `<span class="ss-num">Slot ${i + 1}</span>` +
            `<span class="ss-info">— empty —</span>` +
            `</div>`
        );
      } else {
        const date = new Date(meta.savedAt);
        const dateStr = date.toLocaleDateString() + " " + date.toLocaleTimeString().slice(0, 5);
        lines.push(
          `<div class="save-slot ${isSelected ? "selected" : ""}">` +
            `<span class="ss-marker">${marker}</span>` +
            `<span class="ss-num">Slot ${i + 1}</span>` +
            `<span class="ss-info">F${meta.floorId} ${meta.floorName} · Day ${meta.dayCount} · ${meta.partySummary} · ${meta.gold}g · ${dateStr}</span>` +
            `</div>`
        );
      }
    }
    lines.push(`</div>`);

    if (this.phase === "actionPick") {
      const slotEmpty = this.metas[this.selectedIndex].empty;
      lines.push(`<div class="save-actions">`);
      for (let i = 0; i < ACTIONS.length; i++) {
        const label = ACTIONS[i];
        const isActionSelected = i === this.actionIndex;
        const disabled = (label === "Load" || label === "Delete") && slotEmpty;
        const marker = isActionSelected ? "▶" : " ";
        lines.push(
          `<div class="save-action ${isActionSelected ? "selected" : ""} ${disabled ? "disabled" : ""}">` +
            `<span class="sa-marker">${marker}</span>` +
            `<span class="sa-label">${label}</span>` +
            (disabled ? `<span class="sa-hint">(empty slot)</span>` : "") +
            `</div>`
        );
      }
      lines.push(`</div>`);
    }

    // Current game state summary (for context when saving)
    const aliveCount = this.state.party.filter((c) => c.hp > 0).length;
    const classSummary = this.state.party.map((c) => c.class[0]).join("");
    lines.push(
      `<div class="save-current" style="color:var(--text-dim);font-size:12px">` +
      `Current: F${this.state.floor.id} ${this.state.floor.name} · ${aliveCount}/${this.state.party.length} alive [${classSummary}] · ${this.state.partyGold}g` +
      `</div>`
    );

    let footer: string | undefined;
    if (this.phase === "browsing") {
      footer = "[↑/↓] slot · [A/Enter] actions · [S/L/D] · [B/Esc] close";
    } else if (this.phase === "actionPick") {
      footer = "[↑/↓] action · [A/Enter] confirm · [B/Esc] back";
    }

    this.panel.innerHTML = "";
    this.panel.appendChild(
      FF6Window.frame({
        title: "Save / Load",
        contentHtml: lines.join(""),
        flash: this.flash || undefined,
        footer,
        mode: "selection",
        animated,
      })
    );
  }
}
