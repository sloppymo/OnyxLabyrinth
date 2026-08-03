/**
 * Dungeon actions palette — compact controller-first field-command menu.
 *
 * The menu is opened with Start and navigated as a two-column D-pad grid.
 * It uses the shared FF6Window chrome instead of reusing camp roster markup,
 * which previously left a thin list floating inside an oversized empty field.
 */

import type { ControllerInputEvent } from "./controller-input";
import { controllerEventToMenuKey } from "./menu-controller-adapter";
import { FF6Window } from "./ff6-window-library";
import { audio } from "./audio";
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
    role: "REST",
    description: "Rest until dawn. Restore HP and SP and clear ailments.",
  },
  {
    id: "map",
    label: "Map",
    role: "EXPLORE",
    description: "Show or hide the explored-floor map.",
  },
  {
    id: "grimoire",
    label: "Grimoire",
    role: "MAGIC",
    description: "Cast persistent and utility magic in the field.",
  },
  {
    id: "unlock",
    label: "Unlock",
    role: "DOOR",
    description: "Attempt to open the locked door directly ahead.",
  },
  {
    id: "town",
    label: "Return to Town",
    role: "LEAVE",
    description: "End this expedition and return the party to town.",
  },
] as const;

type EntryId = (typeof ENTRIES)[number]["id"];
type GridDirection = "up" | "down" | "left" | "right";

/**
 * Two-column navigation graph:
 *
 *   Camp        Map
 *   Grimoire    Unlock
 *       Return to Town
 *
 * The final command spans both columns, so vertical movement from either
 * lower tile lands on it predictably.
 */
const GRID_NEIGHBORS: ReadonlyArray<Record<GridDirection, number>> = [
  { up: 4, down: 2, left: 1, right: 1 },
  { up: 4, down: 3, left: 0, right: 0 },
  { up: 0, down: 4, left: 3, right: 3 },
  { up: 1, down: 4, left: 2, right: 2 },
  { up: 2, down: 0, left: 4, right: 4 },
];

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

  /** Direct controller entry point for tests and controller-owned routes. */
  handleInput(event: ControllerInputEvent): void {
    const key = controllerEventToMenuKey(event);
    if (key) this.handleKey(key);
  }

  /** Receives normalized A/B/D-pad commands from the shared input router. */
  handleKey(key: string): void {
    const direction = this.directionForKey(key);
    if (direction) {
      this.moveSelection(direction);
      return;
    }

    // FF6Window owns A/B audio, confirmation, cancellation, and pointer input.
    if (key === "Enter" || key === " " || key === "Escape") {
      this.menu?.handleKey(key);
    }
  }

  destroy(): void {
    this.dispose();
  }

  private directionForKey(key: string): GridDirection | null {
    switch (key) {
      case "ArrowUp":
        return "up";
      case "ArrowDown":
        return "down";
      case "ArrowLeft":
        return "left";
      case "ArrowRight":
        return "right";
      default:
        return null;
    }
  }

  private moveSelection(direction: GridDirection): void {
    const next = GRID_NEIGHBORS[this.index]?.[direction] ?? this.index;
    if (next === this.index) return;
    this.index = next;
    audio.uiCursor();
    this.menu?.updateSelectedIndex(this.index);
    this.updateDescription();
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
        detail: entry.role,
        metadata: entry.id,
        className: `dungeon-action dungeon-action-${entry.id}`,
      })),
      selectedIndex: this.index,
      mode: "menu",
      width: "wide",
      contentHtml:
        `<div class="dungeon-actions-intro">` +
        `<span class="dungeon-actions-eyebrow">FIELD COMMANDS</span>` +
        `<span class="dungeon-actions-prompt">Select an action</span>` +
        `</div>`,
      footer: "D-PAD MOVE  ·  A SELECT  ·  B BACK",
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
