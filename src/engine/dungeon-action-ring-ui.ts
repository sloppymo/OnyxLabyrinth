/**
 * Dungeon actions palette — compact field-command menu opened from the
 * gamepad Start button or the dungeon action shortcut.
 *
 * This intentionally uses the shared FF6Window chrome instead of drawing
 * directly into the full menu host. The old implementation reused camp
 * roster classes, which produced an oversized empty field with a thin list
 * floating in the middle of it.
 */

import { FF6Window } from "./ff6-window-library";
import "./dungeon-action-ring-ui.css";

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
  {
    id: "camp",
    label: "Camp",
    shortcut: "c",
    description: "Rest until dawn. Restore HP and SP and clear ailments.",
  },
  {
    id: "map",
    label: "Toggle Map",
    shortcut: "m",
    description: "Show or hide the explored-floor map.",
  },
  {
    id: "grimoire",
    label: "Grimoire",
    shortcut: "g",
    description: "Cast persistent and utility magic in the field.",
  },
  {
    id: "unlock",
    label: "Unlock",
    shortcut: "u",
    description: "Attempt to open the locked door directly ahead.",
  },
  {
    id: "town",
    label: "Return to Town",
    shortcut: "t",
    description: "End this expedition and return the party to town.",
  },
] as const;

type EntryId = (typeof ENTRIES)[number]["id"];

export class DungeonActionRingController {
  private panel: HTMLElement;
  private callbacks: Omit<DungeonActionRingOptions, "panel">;
  private index = 0;
  private menu: FF6Window | null = null;

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
    this.panel.style.display = "flex";
    this.panel.classList.add("bg-overlay-dim", "dungeon-actions-host");
    this.render();
  }

  handleKey(key: string): void {
    const lower = key.toLowerCase();

    const shortcutIndex = ENTRIES.findIndex((entry) => entry.shortcut === lower);
    if (shortcutIndex >= 0) {
      this.index = shortcutIndex;
      this.menu?.updateSelectedIndex(this.index);
      this.updateDescription();
      this.confirm();
      return;
    }

    // FF6Window already owns cursor audio, confirm/cancel audio, pointer
    // activation, and highlight movement. Normalize S so keyboard players
    // retain the previous W/S navigation contract.
    const normalizedKey = lower === "s" ? "ArrowDown" : key;
    const activeMenu = this.menu;
    if (!activeMenu) return;
    const handled = activeMenu.handleKey(normalizedKey);
    if (handled && this.menu === activeMenu) {
      this.index = activeMenu.getSelectedIndex();
      this.updateDescription();
    }
  }

  destroy(): void {
    this.dispose();
  }

  private confirm(): void {
    const entry = ENTRIES[this.index];
    this.dispose();
    this.invokeAction(entry.id);
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
    this.menu?.destroy();
    this.menu = null;
    this.panel.style.display = "none";
    this.panel.classList.remove("bg-overlay-dim", "dungeon-actions-host");
    this.panel.innerHTML = "";
  }

  private render(): void {
    const selected = ENTRIES[this.index];
    const menu = new FF6Window({
      title: "Dungeon Actions",
      items: ENTRIES.map((entry) => ({
        label: entry.label,
        detail: entry.shortcut.toUpperCase(),
        metadata: entry.id,
        className: `dungeon-action dungeon-action-${entry.id}`,
      })),
      selectedIndex: this.index,
      mode: "menu",
      width: "wide",
      contentHtml:
        `<div class="dungeon-actions-intro">` +
        `<span class="dungeon-actions-eyebrow">FIELD COMMANDS</span>` +
        `<span class="dungeon-actions-prompt">Choose your next move</span>` +
        `</div>`,
      footer: "D-pad navigate · A confirm · B close",
      footer2: selected.description,
      animated: true,
      onHover: (index) => {
        this.index = index;
        this.updateDescription();
      },
      onConfirm: (index) => {
        this.index = index;
        this.confirm();
      },
      onBack: () => this.close(),
    });

    const element = menu.render();
    element.classList.add("dungeon-actions-window");
    element.setAttribute("aria-label", "Dungeon actions");

    this.menu = menu;
    this.panel.innerHTML = "";
    this.panel.appendChild(element);
  }

  private updateDescription(): void {
    const description = this.menu
      ?.getElement()
      ?.querySelector<HTMLElement>(".ff6-footer2");
    if (description) description.textContent = ENTRIES[this.index].description;
  }
}
