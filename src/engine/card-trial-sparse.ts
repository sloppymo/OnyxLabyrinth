/**
 * Card Trial sparse presentation: one 768×672 design stage holding HUD + hand.
 */

import { DESIGN_W } from "./card-trial-layout";
import { CardTrialHandPresentation } from "./card-trial-hand";
import { CardTrialHudPresentation } from "./card-trial-hud";
import type { CardTrialViewHandlers, CardTrialWindowsInput } from "./card-trial-view";

export class CardTrialSparseUi {
  private layer: HTMLDivElement;
  private stage: HTMLDivElement;
  private hud: CardTrialHudPresentation;
  private hand: CardTrialHandPresentation;
  private resizeObserver: ResizeObserver | null = null;

  constructor(private host: HTMLElement) {
    host.replaceChildren();
    this.layer = document.createElement("div");
    this.layer.className = "ct-sparse";
    this.stage = document.createElement("div");
    this.stage.className = "ct-design-stage";
    this.layer.appendChild(this.stage);
    host.appendChild(this.layer);
    this.hud = new CardTrialHudPresentation(this.stage);
    this.hand = new CardTrialHandPresentation(this.stage);
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.applyStageScale());
      this.resizeObserver.observe(host);
    }
    this.applyStageScale();
  }

  private applyStageScale(): void {
    const rect = this.host.getBoundingClientRect();
    const scale = rect.width > 0 ? rect.width / DESIGN_W : 1;
    this.stage.style.transform = `scale(${scale})`;
  }

  sync(input: CardTrialWindowsInput, handlers: CardTrialViewHandlers): void {
    this.hud.sync(input, handlers);
    this.hand.sync(input, handlers);
  }

  update(now: number): void {
    this.hand.update(now);
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.hand.destroy();
    this.hud.destroy();
    this.layer.remove();
  }
}
