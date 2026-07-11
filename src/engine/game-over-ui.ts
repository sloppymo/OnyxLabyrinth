import type { Character } from "../game/party";

export interface GameOverControllerOptions {
  panel: HTMLElement;
  party: Character[];
  floorName: string;
  onContinue: () => void;
}

export class GameOverController {
  private panel: HTMLElement;
  private onContinue: () => void;

  constructor(opts: GameOverControllerOptions) {
    this.panel = opts.panel;
    this.onContinue = opts.onContinue;
    this.panel.style.display = "block";
    this.render(opts.party, opts.floorName);
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

  private render(party: Character[], floorName: string): void {
    const standing = party.filter((c) => c.hp > 0).length;
    const lines: string[] = [];
    lines.push(`<div class="town-header" style="color:var(--danger-red)">GAME OVER</div>`);
    lines.push(`<div class="town-gold">The party has fallen on ${floorName}.</div>`);
    lines.push(`<div class="town-gold">${standing}/${party.length} standing</div>`);
    lines.push(`<div class="town-help">The labyrinth does not keep the dead. Press [Enter] to wake at the entrance.</div>`);
    this.panel.innerHTML = lines.join("");
  }
}
