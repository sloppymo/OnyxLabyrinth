/**
 * Card Trial sparse presentation: one 768×672 design stage holding HUD + hand.
 */

import { DESIGN_H, DESIGN_W } from "./card-trial-layout";
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

  /**
   * Fit the 768×672 design stage into whatever box the host currently has,
   * uniformly on both axes, and letterbox (center) rather than crop —
   * `.ct-design-stage` is `position:absolute; left:0; top:0` with
   * `transform-origin: top left`, so `left`/`top` place the scale anchor and
   * `scale()` grows/shrinks the stage from that anchor.
   *
   * Uses `clientWidth`/`clientHeight` (local layout size), not
   * `getBoundingClientRect()` (final, post-transform screen size). `host`
   * can itself sit inside an ancestor that's already CSS-`transform:scale`d
   * (the app's own UI-scale-to-fit wrapper) — `getBoundingClientRect()`
   * would report that ancestor scale baked in, and applying it again via
   * this element's own `transform: scale()` double-counts it.
   */
  private applyStageScale(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    const scale = w > 0 && h > 0 ? Math.min(w / DESIGN_W, h / DESIGN_H) : 1;
    const offsetX = Math.max(0, (w - DESIGN_W * scale) / 2);
    const offsetY = Math.max(0, (h - DESIGN_H * scale) / 2);
    this.stage.style.left = `${offsetX}px`;
    this.stage.style.top = `${offsetY}px`;
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
