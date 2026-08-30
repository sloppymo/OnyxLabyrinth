/**
 * Shared Card Trial HUD over both Canvas and Phaser combat painters.
 * Semantic state and geometry come from pure recipes; this class only owns DOM.
 */

import { MOVE_COST } from "../game/card-trial/types";
import type { CombatScene } from "./combat-choreography";
import type { CardTrialViewHandlers, CardTrialWindowsInput } from "./card-trial-view";
import { intentDetailLines } from "./card-trial-intent-copy";
import {
  cardTrialActorAnchors,
  layoutCardTrialActorIndicators,
  type CardTrialActorIndicatorLayout,
  type CardTrialRect,
} from "./card-trial-layout";
import {
  buildCardTrialUiRecipe,
  cardTrialUiAssetUrl,
  type CardTrialActorUiState,
  type CardTrialUiRecipe,
} from "./card-trial-ui-model";

interface ActorHudNodes {
  root: HTMLDivElement;
  plate: HTMLButtonElement;
  ring: HTMLImageElement;
  reticle: HTMLImageElement;
  edgeCue: HTMLDivElement;
  arrow: HTMLImageElement;
  marker: HTMLImageElement;
  targetLabel: HTMLDivElement;
  targetIndex: number;
}

export class CardTrialHudPresentation {
  private fade: HTMLDivElement;
  private meters: HTMLDivElement;
  private deckValue: HTMLSpanElement;
  private energyValue: HTMLSpanElement;
  private initiative: HTMLDivElement;
  private decision: HTMLDivElement;
  private turnLabel: HTMLDivElement;
  private decisionInstruction: HTMLDivElement;
  private hint: HTMLDivElement;
  private actors: HTMLDivElement;
  private instructionStrip: HTMLDivElement;
  private instructionText: HTMLDivElement;
  private utils: HTMLDivElement;
  private moveBtn: HTMLButtonElement;
  private passBtn: HTMLButtonElement;
  private discardEl: HTMLDivElement;
  private ratEl: HTMLDivElement;
  private details: HTMLDivElement;
  private banner: HTMLDivElement;
  private resultEl: HTMLDivElement;
  private flashEl: HTMLDivElement;
  private targetHint: HTMLDivElement;
  private playbackEl: HTMLDivElement;
  private lastFightKey = "";
  private handlers: CardTrialViewHandlers | null = null;
  private actorEls = new Map<string, ActorHudNodes>();
  private actorModels = new Map<string, CardTrialActorUiState>();
  private recipe: CardTrialUiRecipe | null = null;

  constructor(stage: HTMLElement) {
    this.fade = el("div", "ct-sparse-fade");

    this.meters = el("div", "ct-sparse-meters");
    const deck = resourceChip("icon-deck", "Deck", "ct-deck");
    this.deckValue = deck.querySelector(".ct-resource-value") as HTMLSpanElement;
    const energy = resourceChip("icon-energy", "Energy", "ct-energy");
    this.energyValue = energy.querySelector(".ct-resource-value") as HTMLSpanElement;
    this.meters.append(deck, energy);

    this.initiative = el("div", "ct-sparse-init");
    this.decision = el("div", "ct-decision-bar");
    this.turnLabel = el("div", "ct-decision-turn");
    this.decisionInstruction = el("div", "ct-decision-instruction");
    this.decision.append(this.turnLabel, this.decisionInstruction);

    this.hint = el("div", "ct-sparse-hold");
    this.hint.append(
      imageNode("icon-details", "ct-control-icon"),
      keycap("I"),
      textSpan("Details", "ct-control-label")
    );

    this.actors = el("div", "ct-sparse-actors");

    this.instructionStrip = el("div", "ct-instruction-strip");
    const leftOrnament = imageNode("separator-bronze", "ct-instruction-ornament left");
    const rightOrnament = imageNode("separator-bronze", "ct-instruction-ornament right");
    this.instructionText = el("div", "ct-instruction-text");
    this.instructionStrip.append(leftOrnament, this.instructionText, rightOrnament);

    this.utils = el("div", "ct-sparse-utils ct-action-rail");
    this.moveBtn = document.createElement("button");
    this.moveBtn.type = "button";
    this.moveBtn.className = "ct-sparse-move ct-action-button";
    this.moveBtn.dataset.act = "move";
    this.passBtn = document.createElement("button");
    this.passBtn.type = "button";
    this.passBtn.className = "ct-sparse-pass ct-action-button";
    this.passBtn.dataset.act = "pass";
    this.discardEl = el("div", "ct-sparse-discard ct-rail-chip");
    this.ratEl = el("div", "ct-sparse-rat ct-rail-chip");
    const rightRail = el("div", "ct-action-status");
    rightRail.append(this.discardEl, this.ratEl);
    this.utils.append(this.moveBtn, this.passBtn, rightRail);

    this.details = el("div", "ct-sparse-details");
    this.banner = el("div", "ct-sparse-banner");
    this.resultEl = el("div", "ct-sparse-result");
    this.flashEl = el("div", "ct-sparse-flash");
    this.targetHint = el("div", "ct-sparse-target-hint");
    this.playbackEl = el("div", "ct-sparse-playback");

    stage.append(
      this.fade,
      this.meters,
      this.initiative,
      this.decision,
      this.hint,
      this.actors,
      this.instructionStrip,
      this.utils,
      this.details,
      this.banner,
      this.resultEl,
      this.flashEl,
      this.targetHint,
      this.playbackEl
    );

    this.moveBtn.addEventListener("click", () => this.handlers?.onMove());
    this.passBtn.addEventListener("click", () => this.handlers?.onPass());
  }

  destroy(): void {
    this.fade.remove();
    this.meters.remove();
    this.initiative.remove();
    this.decision.remove();
    this.hint.remove();
    this.actors.remove();
    this.instructionStrip.remove();
    this.utils.remove();
    this.details.remove();
    this.banner.remove();
    this.resultEl.remove();
    this.flashEl.remove();
    this.targetHint.remove();
    this.playbackEl.remove();
    this.actorEls.clear();
    this.actorModels.clear();
  }

  sync(input: CardTrialWindowsInput, handlers: CardTrialViewHandlers): void {
    this.handlers = handlers;
    this.recipe = buildCardTrialUiRecipe(input);
    const recipe = this.recipe;
    const { view, phase, flash, result, detailsHeld } = input;
    const showActions = phase === "hand";
    const targeting = phase === "target" || phase === "target2";

    this.deckValue.textContent = String(recipe.deckCount);
    this.energyValue.textContent = `${recipe.energy}/${recipe.maxEnergy}`;
    this.syncInitiative(recipe);
    this.syncActorModels(recipe);

    this.turnLabel.textContent = recipe.turnLabel;
    this.decisionInstruction.textContent = recipe.decisionInstruction;
    this.decision.hidden = phase === "result";
    this.hint.hidden = phase === "result";

    this.instructionStrip.hidden = phase === "playback" || phase === "result" || phase === "draft" || !recipe.handInstruction;
    this.instructionText.textContent = recipe.handInstruction;

    this.utils.style.visibility = showActions ? "visible" : "hidden";
    this.moveBtn.disabled = !view.moveAvailable;
    this.moveBtn.classList.toggle("focused", recipe.focusedControl?.kind === "move");
    this.moveBtn.classList.toggle("selected", recipe.focusedControl?.kind === "move");
    this.moveBtn.classList.toggle("unavailable", !view.moveAvailable);
    this.moveBtn.innerHTML = actionButtonHtml({
      icon: "icon-move",
      key: "M",
      name: "MOVE",
      meta: view.moveDisabledReason ?? `Front / Back · ${MOVE_COST} energy`,
    });
    this.passBtn.classList.toggle("focused", recipe.focusedControl?.kind === "pass");
    this.passBtn.classList.toggle("selected", recipe.focusedControl?.kind === "pass");
    this.passBtn.innerHTML = actionButtonHtml({
      icon: "icon-pass",
      key: "Esc",
      name: "PASS",
      meta: "End this actor's turn",
    });
    this.discardEl.innerHTML = railChipHtml("icon-discard", "Discard", String(recipe.discardCount));
    this.ratEl.innerHTML = railChipHtml(
      view.ratRow === "front" ? "icon-front" : "icon-back",
      "Rat",
      recipe.ratStatus
    );
    this.ratEl.classList.toggle("dim", !view.ratRow);

    this.flashEl.textContent = flash ?? "";
    this.flashEl.hidden = !flash;

    this.targetHint.hidden = !targeting;
    this.targetHint.textContent = phase === "target2" ? "Second target" : "Target";

    this.playbackEl.hidden = phase !== "playback";
    this.playbackEl.textContent = input.playbackLabel
      ? `${input.playbackLabel} · Shift fast · Esc skip`
      : "Shift fast · Esc skip";

    this.syncDetails(input, recipe, !!detailsHeld && (showActions || targeting));
    this.syncBanner(view.fightId, view.fightName);
    this.syncResult(result);
  }

  /** Re-anchor battlefield UI every frame so row and choreography motion agree. */
  update(scene: CombatScene, now: number): void {
    const recipe = this.recipe;
    if (!recipe) return;
    const anchors = cardTrialActorAnchors(scene, now);
    const layouts = new Map(
      layoutCardTrialActorIndicators(anchors, recipe.actors).map((layout) => [layout.id, layout])
    );

    for (const [id, nodes] of this.actorEls) {
      const actor = this.actorModels.get(id);
      const layout = layouts.get(id);
      if (!actor || !layout?.visible) {
        nodes.root.hidden = true;
        continue;
      }
      nodes.root.hidden = false;
      this.placeActor(nodes, actor, layout, recipe.phase);
    }
  }

  private syncInitiative(recipe: CardTrialUiRecipe): void {
    this.initiative.replaceChildren();
    for (const actor of recipe.initiative) {
      const node = el("div", "ct-init-pip");
      node.dataset.id = actor.id;
      node.classList.toggle("acting", actor.acting);
      node.classList.toggle("done", actor.done);
      node.classList.toggle("dead", actor.dead);
      node.classList.toggle("hero", actor.kind === "hero");
      node.classList.toggle("enemy", actor.kind === "enemy");
      node.title = actor.name;
      const portrait = el("div", `ct-init-portrait${actor.portraitIsStrip ? " strip" : ""}`);
      if (actor.portraitUrl) {
        const img = document.createElement("img");
        img.alt = "";
        img.src = actor.portraitUrl;
        img.draggable = false;
        portrait.appendChild(img);
      } else {
        portrait.textContent = actor.name.slice(0, 1).toUpperCase();
      }
      const label = el("div", "ct-init-label");
      label.textContent = actor.name;
      node.append(portrait, label);
      this.initiative.appendChild(node);
    }
  }

  private syncActorModels(recipe: CardTrialUiRecipe): void {
    const seen = new Set<string>();
    this.actorModels.clear();
    for (const actor of recipe.actors) {
      if (actor.dead) continue;
      seen.add(actor.id);
      this.actorModels.set(actor.id, actor);
      const nodes = this.ensureActor(actor);
      nodes.targetIndex = recipe.legalTargetIds.indexOf(actor.id);
      nodes.plate.className = [
        "ct-actor-chip",
        actor.kind,
        actor.active ? "acting" : "",
        actor.legalTarget ? "targetable" : "",
        actor.selectedTarget ? "targeted" : "",
      ].filter(Boolean).join(" ");
      nodes.plate.style.pointerEvents = actor.legalTarget ? "auto" : "none";
      nodes.plate.innerHTML = actorPlateHtml(actor);
      this.setActorIndicatorVisibility(nodes, actor, recipe.phase);
      nodes.root.classList.toggle("acting", actor.active);
      nodes.root.classList.toggle("legal-target", actor.legalTarget);
      nodes.root.classList.toggle("selected-target", actor.selectedTarget);
    }
    for (const [id, nodes] of this.actorEls) {
      if (seen.has(id)) continue;
      nodes.root.remove();
      this.actorEls.delete(id);
    }
  }

  private ensureActor(actor: CardTrialActorUiState): ActorHudNodes {
    const existing = this.actorEls.get(actor.id);
    if (existing) return existing;
    const root = el("div", "ct-actor-indicator");
    root.dataset.actor = actor.id;
    const ring = imageNode("ring-current", "ct-current-ring");
    const reticle = imageNode("reticle-target", "ct-target-reticle");
    const edgeCue = el("div", "ct-target-edge");
    const arrow = imageNode("arrow-target", "ct-target-arrow");
    const marker = imageNode("marker-legal", "ct-legal-marker");
    const targetLabel = el("div", "ct-target-label");
    targetLabel.textContent = "Target";
    const plate = document.createElement("button");
    plate.type = "button";
    plate.className = `ct-actor-chip ${actor.kind}`;
    plate.dataset.actor = actor.id;
    root.append(ring, reticle, edgeCue, arrow, marker, targetLabel, plate);
    this.actors.appendChild(root);
    const nodes: ActorHudNodes = {
      root,
      plate,
      ring,
      reticle,
      edgeCue,
      arrow,
      marker,
      targetLabel,
      targetIndex: -1,
    };
    plate.addEventListener("pointerenter", () => {
      if (nodes.targetIndex >= 0) this.handlers?.onHoverTarget(nodes.targetIndex);
    });
    plate.addEventListener("click", () => {
      if (nodes.targetIndex >= 0) this.handlers?.onConfirmTarget(nodes.targetIndex);
    });
    edgeCue.addEventListener("pointerenter", () => {
      if (nodes.targetIndex >= 0) this.handlers?.onHoverTarget(nodes.targetIndex);
    });
    edgeCue.addEventListener("click", () => {
      if (nodes.targetIndex >= 0) this.handlers?.onConfirmTarget(nodes.targetIndex);
    });
    this.actorEls.set(actor.id, nodes);
    return nodes;
  }

  private placeActor(
    nodes: ActorHudNodes,
    actor: CardTrialActorUiState,
    layout: CardTrialActorIndicatorLayout,
    phase: CardTrialUiRecipe["phase"]
  ): void {
    placeRect(nodes.plate, layout.plate);
    placeRect(nodes.ring, layout.ring);
    placeRect(nodes.reticle, layout.ring);
    placeRect(nodes.edgeCue, layout.edgeCue);
    placeCentered(nodes.marker, layout.marker.x, layout.marker.y);
    placeCentered(nodes.arrow, layout.arrow.x, layout.arrow.y);
    placeCentered(nodes.targetLabel, layout.targetLabel.x, layout.targetLabel.y);

    this.setActorIndicatorVisibility(nodes, actor, phase);
  }

  private setActorIndicatorVisibility(
    nodes: ActorHudNodes,
    actor: CardTrialActorUiState,
    phase: CardTrialUiRecipe["phase"]
  ): void {
    const decisionPhase = phase === "hand" || phase === "target" || phase === "target2";
    nodes.plate.hidden = !actor.plateVisible;
    nodes.ring.hidden = !(actor.active && decisionPhase);
    nodes.reticle.hidden = !actor.selectedTarget;
    nodes.edgeCue.hidden = !(actor.legalTarget || actor.selectedTarget);
    nodes.edgeCue.style.pointerEvents = actor.legalTarget ? "auto" : "none";
    nodes.arrow.hidden = !actor.selectedTarget;
    nodes.targetLabel.hidden = !actor.selectedTarget;
    nodes.marker.hidden = !(actor.legalTarget && !actor.selectedTarget);
  }

  private syncDetails(input: CardTrialWindowsInput, recipe: CardTrialUiRecipe, show: boolean): void {
    if (!show) {
      this.details.hidden = true;
      this.details.replaceChildren();
      return;
    }
    this.details.hidden = false;
    this.details.replaceChildren();
    const fight = el("div", "ct-detail-fight");
    fight.textContent = `FIGHT ${input.view.fightId} · ${input.view.fightName}`;
    this.details.appendChild(fight);
    for (const actor of recipe.actors) {
      if (
        actor.dead ||
        (actor.kind === "hero" && actor.plateVisible && actor.guard <= 0)
      ) continue;
      const block = el("div", "ct-detail-actor");
      const row = actor.row === "front" ? "Front" : "Back";
      const barrier = actor.kind === "hero" && actor.guard > 0 ? ` · Barrier ${actor.guard}` : "";
      const opened = actor.kind === "enemy" && actor.opened ? " · Opened" : "";
      const crowned = actor.kind === "enemy" && actor.crowned ? " · Crowned" : "";
      const hush = actor.kind === "enemy" && actor.hushed ? " · Hush" : "";
      const omen = actor.kind === "enemy" && actor.omened ? " · Omen" : "";
      block.textContent = `${actor.name} · ${row}${barrier}${opened}${crowned}${hush}${omen}`;
      this.details.appendChild(block);
    }
    for (const intent of input.view.intents) {
      const block = el("div", "ct-detail-intent");
      const title = el("div", "ct-detail-title");
      title.textContent = `${intent.enemyName} · ${intent.label}`;
      block.appendChild(title);
      for (const line of intentDetailLines(intent, input.view.heroes)) {
        const p = el("div", "ct-detail-line");
        p.textContent = line;
        block.appendChild(p);
      }
      this.details.appendChild(block);
    }
  }

  private syncBanner(fightId: number, fightName: string): void {
    const key = `${fightId}:${fightName}`;
    if (key === this.lastFightKey) return;
    this.lastFightKey = key;
    this.banner.replaceChildren();
    const a = el("div", "ct-banner-fight");
    a.textContent = `Fight ${fightId}`;
    const b = el("div", "ct-banner-name");
    b.textContent = fightName;
    this.banner.append(a, b);
    this.banner.classList.remove("play");
    void this.banner.offsetWidth;
    this.banner.classList.add("play");
  }

  private syncResult(result: CardTrialWindowsInput["result"]): void {
    if (!result) {
      this.resultEl.hidden = true;
      this.resultEl.replaceChildren();
      return;
    }
    this.resultEl.hidden = false;
    this.resultEl.innerHTML = `<div class="ct-result-title">${escapeText(result.title)}</div>${result.lines
      .map((line) => `<div class="ct-result-line">${escapeText(line)}</div>`)
      .join("")}<div class="ct-result-hint">A / Enter continue</div>`;
  }
}

function actorPlateHtml(actor: CardTrialActorUiState): string {
  const hpPct = pct(actor.hp, actor.maxHp);
  const rowIcon = actor.row === "front" ? "icon-front" : "icon-back";
  const row = `<span class="ct-chip-row"><img src="${cardTrialUiAssetUrl(rowIcon)}" alt="">${actor.row}</span>`;
  const opened = actor.opened ? `<span class="ct-opened-mark" title="Opened">◉</span>` : "";
  const crowned = actor.crowned ? `<span class="ct-crowned-mark" title="Crowned">♛</span>` : "";
  const hush = actor.hushed ? `<span class="ct-hush-mark" title="Hush">∿</span>` : "";
  const omen = actor.omened ? `<span class="ct-omen-mark" title="Omen">✦</span>` : "";
  return `<div class="ct-chip-heading"><span>${opened}${crowned}${hush}${omen}${escapeText(actor.name)}</span>${row}</div>
    <div class="ct-chip-hp"><span class="ct-chip-bar" style="width:${hpPct}%"></span></div>
    <div class="ct-chip-footer"><span>${actor.hp}/${actor.maxHp}</span></div>`;
}

function actionButtonHtml(opts: { icon: string; key: string; name: string; meta: string }): string {
  return `<img class="ct-action-icon" src="${cardTrialUiAssetUrl(opts.icon)}" alt="">
    <span class="ct-action-copy"><span class="ct-action-name"><span class="ct-inline-key">${escapeText(opts.key)}</span>${escapeText(opts.name)}</span>
    <span class="ct-action-meta">${escapeText(opts.meta)}</span></span>`;
}

function railChipHtml(icon: string, label: string, value: string): string {
  return `<img src="${cardTrialUiAssetUrl(icon)}" alt=""><span><span class="ct-rail-label">${escapeText(label)}</span><span class="ct-rail-value">${escapeText(value)}</span></span>`;
}

function resourceChip(icon: string, label: string, className: string): HTMLDivElement {
  const chip = el("div", `ct-resource-chip ${className}`);
  chip.append(
    imageNode(icon, "ct-resource-icon"),
    textSpan(label, "ct-resource-label"),
    textSpan("0", "ct-resource-value")
  );
  return chip;
}

function keycap(label: string): HTMLSpanElement {
  return textSpan(`[${label}]`, "ct-keycap");
}

function imageNode(asset: string, className: string): HTMLImageElement {
  const image = document.createElement("img");
  image.className = className;
  image.alt = "";
  image.draggable = false;
  image.src = cardTrialUiAssetUrl(asset);
  return image;
}

function textSpan(text: string, className: string): HTMLSpanElement {
  const node = document.createElement("span");
  node.className = className;
  node.textContent = text;
  return node;
}

function el(tag: string, className: string): HTMLDivElement {
  const node = document.createElement(tag) as HTMLDivElement;
  node.className = className;
  return node;
}

function placeRect(node: HTMLElement, rect: CardTrialRect): void {
  node.style.left = `${rect.x}px`;
  node.style.top = `${rect.y}px`;
  node.style.width = `${rect.width}px`;
  node.style.height = `${rect.height}px`;
}

function placeCentered(node: HTMLElement, x: number, y: number): void {
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
}

function pct(n: number, d: number): number {
  if (d <= 0) return 0;
  return Math.max(0, Math.min(100, (n / d) * 100));
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
