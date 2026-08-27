import type { Character } from "../game/party";
import "./game-over-scene.css";

export interface GameOverControllerOptions {
  panel: HTMLElement;
  party: Character[];
  floorName: string;
  /** The *already-advanced* century-cycle year (docs/superpowers/specs/
   *  2026-07-25-labyrinth-narrative-design.md §7.1) — the caller increments
   *  worldYear before constructing this controller so the screen shows the
   *  new year, not the one the protagonists fell in. Unused for Arena wipes. */
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
    this.panel.classList.add("game-over-host");
    this.panel.dataset.gameOverContext = opts.inArena ? "arena" : "campaign";
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
    this.panel.classList.remove("game-over-host");
    delete this.panel.dataset.gameOverContext;
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
    lines.push(`<div class="game-over-title town-header">GAME OVER</div>`);
    lines.push(`<div class="game-over-fall town-gold">Old Man and Rat King have fallen on ${floorName}.</div>`);
    lines.push(`<div class="game-over-standing town-gold">${standing}/${party.length} standing</div>`);
    lines.push(`<div class="game-over-law town-gold">The labyrinth does not keep the dead.</div>`);
    if (inArena) {
      // Arena is a combat-iteration tool — no century passes, no town redirect.
      lines.push(`<div class="game-over-prompt town-help">Press [Enter] to continue.</div>`);
    } else {
      lines.push(
        `<div class="game-over-century town-help">Year ${worldYear}. A hundred years in the dark. Edgehollow is still waiting.</div>`
      );
      lines.push(`<div class="game-over-prompt town-help">Press [Enter] to wake in town.</div>`);
    }
    this.panel.innerHTML = `<div class="game-over-rite">${lines.join("")}</div>`;
  }
}
