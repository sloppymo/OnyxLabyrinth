/**
 * Card Trial lobby — ten reproducible fights under Arena.
 */

import { FF6Window } from "./ff6-window-library";
import { audio } from "./audio";
import { ENCOUNTERS } from "../game/card-trial/encounters";

export interface CardTrialLobbyOptions {
  panel: HTMLElement;
  onFight: (fightId: number, sequential: boolean) => void;
  onTriangle: () => void;
  onExit: () => void;
  debug: boolean;
  summary?: string | null;
}

export class CardTrialLobbyController {
  private selected = 0;
  private hasRendered = false;
  private items: Array<{ label: string; kind: "fight" | "seq" | "triangle" | "exit"; fightId?: number }>; 

  constructor(private opts: CardTrialLobbyOptions) {
    this.items = [
      ...ENCOUNTERS.map((e) => ({
        label: `Fight ${e.id} — ${e.name}`,
        kind: "fight" as const,
        fightId: e.id,
      })),
      { label: "Begin sequential (1→10)", kind: "seq" as const },
    ];
    if (opts.debug) this.items.push({ label: "Triangle test (Cleaver + Ash)", kind: "triangle" });
    this.items.push({ label: "Exit to Title", kind: "exit" });
    this.render();
  }

  handleKey(key: string): void {
    audio.uiForMenuKey(key);
    const lower = key.toLowerCase();
    if (lower === "arrowup" || lower === "w") {
      this.selected = (this.selected - 1 + this.items.length) % this.items.length;
      this.render();
      return;
    }
    if (lower === "arrowdown" || lower === "s") {
      this.selected = (this.selected + 1) % this.items.length;
      this.render();
      return;
    }
    if (key === "Enter" || key === " ") {
      this.select();
      return;
    }
    if (key === "Escape") {
      this.opts.onExit();
    }
  }

  private select(): void {
    const item = this.items[this.selected]!;
    if (item.kind === "fight") this.opts.onFight(item.fightId!, false);
    else if (item.kind === "seq") this.opts.onFight(1, true);
    else if (item.kind === "triangle") this.opts.onTriangle();
    else this.opts.onExit();
  }

  private render(): void {
    const animated = !this.hasRendered;
    this.hasRendered = true;
    const win = new FF6Window({
      title: "Card Trial",
      contentHtml: `<div class="ff6-arena-meta">Arena prototype · 40/40 restore · no rewards</div>${
        this.opts.summary ? `<pre class="ct-summary">${this.opts.summary}</pre>` : ""
      }`,
      items: this.items.map((it) => ({ label: it.label })),
      selectedIndex: this.selected,
      mode: "menu",
      footer: "D-pad navigate · A fight · B title",
      animated,
      onHover: (i) => {
        this.selected = i;
      },
      onConfirm: (i) => {
        this.selected = i;
        this.select();
      },
      onBack: () => this.opts.onExit(),
    });
    this.opts.panel.innerHTML = "";
    this.opts.panel.appendChild(win.render());
  }
}
