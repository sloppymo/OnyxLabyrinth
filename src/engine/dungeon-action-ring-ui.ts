/**
 * Dungeon action ring — radial-style menu opened from the gamepad Start button
 * (wired in main.ts Task 6). Lists dungeon shortcuts: camp, map, grimoire,
 * unlock, return to town, cancel. Borrows "title" mode while open.
 */

export type DungeonActionRingOptions = {
  panel: HTMLElement;
  onCamp: () => void;
  onToggleMap: () => void;
  onCastSpell: () => void;
  onUnlock: () => void;
  onTown: () => void;
  onClose: () => void;
};

const ENTRIES = [
  { id: "camp", label: "Camp" },
  { id: "map", label: "Toggle Map" },
  { id: "grimoire", label: "Grimoire" },
  { id: "unlock", label: "Unlock" },
  { id: "town", label: "Return to Town" },
  { id: "cancel", label: "Cancel" },
] as const;

type EntryId = (typeof ENTRIES)[number]["id"];

export class DungeonActionRingController {
  private panel: HTMLElement;
  private callbacks: Omit<DungeonActionRingOptions, "panel">;
  private index = 0;

  constructor(opts: DungeonActionRingOptions) {
    this.panel = opts.panel;
    this.callbacks = {
      onCamp: opts.onCamp,
      onToggleMap: opts.onToggleMap,
      onCastSpell: opts.onCastSpell,
      onUnlock: opts.onUnlock,
      onTown: opts.onTown,
      onClose: opts.onClose,
    };
    this.panel.style.display = "block";
    this.render();
  }

  handleKey(key: string): void {
    const lower = key.toLowerCase();
    if (lower === "escape") {
      this.close();
      return;
    }
    if (lower === "arrowup" || lower === "w") {
      this.index = (this.index - 1 + ENTRIES.length) % ENTRIES.length;
      this.render();
      return;
    }
    if (lower === "arrowdown" || lower === "s") {
      this.index = (this.index + 1) % ENTRIES.length;
      this.render();
      return;
    }
    if (key === "Enter" || key === " ") {
      this.confirm();
    }
  }

  destroy(): void {
    this.dispose();
  }

  private confirm(): void {
    const entry = ENTRIES[this.index];
    this.dispose();
    if (entry.id !== "cancel") {
      this.invokeAction(entry.id);
    }
    this.callbacks.onClose();
  }

  private invokeAction(id: EntryId): void {
    switch (id) {
      case "camp":
        this.callbacks.onCamp();
        break;
      case "map":
        this.callbacks.onToggleMap();
        break;
      case "grimoire":
        this.callbacks.onCastSpell();
        break;
      case "unlock":
        this.callbacks.onUnlock();
        break;
      case "town":
        this.callbacks.onTown();
        break;
    }
  }

  private close(): void {
    this.dispose();
    this.callbacks.onClose();
  }

  private dispose(): void {
    this.panel.style.display = "none";
    this.panel.innerHTML = "";
  }

  private render(): void {
    const lines: string[] = [];
    lines.push(`<div class="camp-header">DUNGEON ACTIONS</div>`);
    lines.push(`<div class="camp-party">`);
    for (let i = 0; i < ENTRIES.length; i++) {
      const e = ENTRIES[i];
      const marker = i === this.index ? "▶" : " ";
      lines.push(
        `<div class="camp-char">` +
          `<span class="cc-name">${marker} ${e.label}</span>` +
          `</div>`
      );
    }
    lines.push(`</div>`);
    lines.push(
      `<div class="camp-done">[↑/↓] · [A] confirm · [B/Esc] cancel · Start</div>`
    );
    this.panel.innerHTML = lines.join("");
  }
}
