import type { Character } from "../game/party";

export interface GameOverControllerOptions {
  panel: HTMLElement;
  party: Character[];
  floorName: string;
  /** The *already-advanced* century-cycle year (docs/superpowers/specs/
   *  2026-07-25-labyrinth-narrative-design.md §7.1) — the caller increments
   *  worldYear before constructing this controller so the screen shows the
   *  new year, not the one the party fell in. Unused for Arena wipes. */
  worldYear: number;
  /** Arena wipes must not show the campaign century / "wake in town" copy. */
  inArena?: boolean;
  onContinue: () => void;
}

export class GameOverController {
  private panel: HTMLElement;
  private onContinue: () => void;
  constructor(opts: GameOverControllerOptions) {
    this.panel = opts.panel;
    this.onContinue = opts.onContinue;
    this.panel.style.display = "flex";
    this.render(opts.party, opts.floorName, opts.worldYear, !!opts.inArena);
  }

  handleKey(key: string): void {
    if (key === "Enter" || key === " ") {
      this.dispose();
      this.onContinue();
    }
  }

  private dispose(): void {
    this.panel.style.display = "none";
    this.panel.innerHTML = "";
  }

  private render(
    party: Character[],
    floorName: string,
    worldYear: number,
    inArena: boolean
  ): void {
    const standing = party.filter((c) => c.hp > 0).length;
    const lines: string[] = [];
    lines.push(`<div class="town-header" style="color:var(--danger-red)">GAME OVER</div>`);
    lines.push(`<div class="town-gold">The party has fallen on ${floorName}.</div>`);
    lines.push(`<div class="town-gold">${standing}/${party.length} standing</div>`);
    lines.push(`<div class="town-gold">The labyrinth does not keep the dead.</div>`);
    if (inArena) {
      // Arena is a combat-iteration tool — no century passes, no town redirect.
      lines.push(`<div class="town-help">Press [Enter] to continue.</div>`);
    } else {
      lines.push(
        `<div class="town-help">Year ${worldYear}. A hundred years in the dark. Edgehollow is still waiting.</div>`
      );
      lines.push(`<div class="town-help">Press [Enter] to wake in town.</div>`);
    }
    this.panel.innerHTML = lines.join("");
  }
}
