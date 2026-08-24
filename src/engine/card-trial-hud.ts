/**
 * Sparse Card Trial HUD: actor-local meters, tiny instrumentation, utilities.
 * Lives in the 768×672 design stage beside the physical hand.
 */

import { ENERGY_PER_TURN, MOVE_COST } from "../game/card-trial/types";
import type { CardTrialViewHandlers, CardTrialWindowsInput } from "./card-trial-view";
import {
  compactIntentTarget,
  compactIntentValue,
  intentDetailLines,
  INTENT_ATK_LABEL,
} from "./card-trial-intent-copy";
import { enemyHudAnchor, heroHudAnchor, queueInitials } from "./card-trial-layout";

export class CardTrialHudPresentation {
  private fade: HTMLDivElement;
  private meters: HTMLDivElement;
  private initiative: HTMLDivElement;
  private hint: HTMLDivElement;
  private actors: HTMLDivElement;
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
  private actorEls = new Map<string, HTMLButtonElement>();

  constructor(stage: HTMLElement) {
    this.fade = el("div", "ct-sparse-fade");
    this.meters = el("div", "ct-sparse-meters");
    this.initiative = el("div", "ct-sparse-init");
    this.hint = el("div", "ct-sparse-hold");
    this.hint.textContent = "Hold I for details";
    this.actors = el("div", "ct-sparse-actors");
    this.utils = el("div", "ct-sparse-utils");
    this.moveBtn = document.createElement("button");
    this.moveBtn.type = "button";
    this.moveBtn.className = "ct-sparse-move";
    this.moveBtn.dataset.act = "move";
    this.passBtn = document.createElement("button");
    this.passBtn.type = "button";
    this.passBtn.className = "ct-sparse-pass";
    this.passBtn.dataset.act = "pass";
    this.discardEl = el("div", "ct-sparse-discard");
    this.ratEl = el("div", "ct-sparse-rat");
    this.utils.append(this.moveBtn, this.passBtn, this.discardEl, this.ratEl);
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
      this.hint,
      this.actors,
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
    this.hint.remove();
    this.actors.remove();
    this.utils.remove();
    this.details.remove();
    this.banner.remove();
    this.resultEl.remove();
    this.flashEl.remove();
    this.targetHint.remove();
    this.playbackEl.remove();
    this.actorEls.clear();
  }

  sync(input: CardTrialWindowsInput, handlers: CardTrialViewHandlers): void {
    this.handlers = handlers;
    const { view, phase, cursor, flash, result, detailsHeld } = input;
    const handLen = view.hand.length;
    const showUtils = phase === "hand";
    const targeting = phase === "target" || phase === "target2";

    this.meters.innerHTML = `<span class="ct-draw">Draw ${view.drawCount}</span><span class="ct-energy">◆ ${view.energy}/${ENERGY_PER_TURN}</span>`;
    this.syncInitiative(view);
    this.syncActors(input);
    this.hint.hidden = !showUtils && !targeting;

    this.utils.style.visibility = showUtils ? "visible" : "hidden";
    this.moveBtn.disabled = !view.moveAvailable;
    this.moveBtn.classList.toggle("selected", showUtils && cursor === handLen);
    this.moveBtn.classList.toggle("unaffordable", !view.moveAvailable);
    this.moveBtn.innerHTML = `<span class="ct-move-cost">${MOVE_COST}◆</span><span class="ct-move-name">MOVE</span><span class="ct-move-sub">${
      view.moveDisabledReason ?? "Move to Front or Back"
    }</span>`;
    this.passBtn.classList.toggle("selected", showUtils && cursor === handLen + 1);
    this.passBtn.innerHTML = `<span class="ct-pass-name">${view.passLabel}</span><span class="ct-pass-sub">${view.passHint}</span>`;
    this.discardEl.innerHTML = `<span class="ct-discard-count">${view.discardCount}</span><span class="ct-discard-label">DISCARD</span>`;
    if (view.ratRow) {
      this.ratEl.classList.remove("dim");
      this.ratEl.textContent = `RAT ${view.ratRow === "front" ? "Front" : "Back"}`;
    } else {
      this.ratEl.classList.add("dim");
      this.ratEl.textContent = "No Rat";
    }

    this.flashEl.textContent = flash ?? "";
    this.flashEl.hidden = !flash;

    this.targetHint.hidden = !targeting;
    this.targetHint.textContent = phase === "target2" ? "Select a second enemy" : "Select a target";

    this.playbackEl.hidden = phase !== "playback";
    this.playbackEl.textContent = input.playbackLabel
      ? `${input.playbackLabel} · Shift fast · Esc skip`
      : "Shift fast · Esc skip";

    this.syncDetails(input, !!detailsHeld && (showUtils || targeting));
    this.syncBanner(view.fightId, view.fightName);
    this.syncResult(result);
  }

  private syncInitiative(view: CardTrialWindowsInput["view"]): void {
    this.initiative.replaceChildren();
    for (const actor of view.queue) {
      const node = el("div", "ct-init-pip");
      node.dataset.id = actor.id;
      node.classList.toggle("acting", actor.acting);
      node.classList.toggle("done", actor.done);
      node.classList.toggle("dead", actor.dead);
      node.classList.toggle("hero", actor.kind === "hero");
      node.textContent = queueInitials(actor.name, actor.id);
      node.title = actor.name;
      this.initiative.appendChild(node);
    }
  }

  private syncActors(input: CardTrialWindowsInput): void {
    const { view, phase, targetIds, targetCursor } = input;
    const targeting = phase === "target" || phase === "target2";
    const livingTargetId = targeting ? targetIds[targetCursor] ?? null : null;
    const seen = new Set<string>();

    const livingByRow: Record<"front" | "back", string[]> = { front: [], back: [] };
    for (const enemy of view.enemies) {
      if (!enemy.dead) livingByRow[enemy.visualRow].push(enemy.id);
    }

    for (const hero of view.heroes) {
      const id = `hero:${hero.id}`;
      seen.add(id);
      const chip = this.ensureChip(id, "hero");
      chip.classList.toggle("acting", view.actingHero === hero.id);
      chip.classList.toggle("dead", hero.dead);
      chip.classList.remove("targeted", "targetable");
      const canSwitch =
        view.canSwitchHero && !hero.dead && hero.id !== view.actingHero && input.phase === "hand";
      chip.classList.toggle("targetable", canSwitch);
      chip.style.pointerEvents = canSwitch ? "auto" : "none";
      chip.onclick = canSwitch ? () => this.handlers?.onSwitchHero?.() : null;
      const anchor = heroHudAnchor(hero.id, hero.row);
      place(chip, anchor.x, anchor.y);
      const guard = hero.guard > 0 ? `<div class="ct-chip-guard">G ${hero.guard}</div>` : "";
      chip.innerHTML = `<div class="ct-chip-hp"><span class="ct-chip-bar" style="width:${pct(hero.hp, hero.maxHp)}%"></span></div><div class="ct-chip-nums">${hero.hp}/${hero.maxHp}</div>${guard}`;
    }

    for (const enemy of view.enemies) {
      if (enemy.dead) continue;
      const id = `enemy:${enemy.id}`;
      seen.add(id);
      const chip = this.ensureChip(id, "enemy");
      const rowIndex = livingByRow[enemy.visualRow].indexOf(enemy.id);
      const anchor = enemyHudAnchor(enemy.visualRow, Math.max(0, rowIndex));
      place(chip, anchor.x, anchor.y);
      const intent = view.intents.find((i) => i.enemyId === enemy.id);
      const atk = intent
        ? `<div class="ct-chip-atk${intent.wouldMiss ? " miss" : ""}"><span class="ct-atk-label">${INTENT_ATK_LABEL}</span> ${compactIntentValue(intent)}<span class="ct-atk-target">→ ${compactIntentTarget(intent)}</span></div>`
        : "";
      const opened = enemy.opened ? `<span class="ct-opened-mark" title="Opened">◉</span>` : "";
      chip.innerHTML = `${atk}<div class="ct-chip-nums">${opened}${enemy.hp}/${enemy.maxHp}</div>`;
      const ti = targetIds.indexOf(enemy.id);
      const targetable = targeting && ti >= 0;
      chip.classList.toggle("targetable", targetable);
      chip.classList.toggle("targeted", livingTargetId === enemy.id);
      chip.style.pointerEvents = targetable ? "auto" : "none";
      chip.onclick = targetable
        ? () => {
            this.handlers?.onConfirmTarget(ti);
          }
        : null;
      chip.onpointerenter = targetable
        ? () => {
            this.handlers?.onHoverTarget(ti);
          }
        : null;
    }

    for (const [id, node] of this.actorEls) {
      if (!seen.has(id)) {
        node.remove();
        this.actorEls.delete(id);
      }
    }
  }

  private ensureChip(id: string, kind: "hero" | "enemy"): HTMLButtonElement {
    let chip = this.actorEls.get(id);
    if (chip) return chip;
    chip = document.createElement("button");
    chip.type = "button";
    chip.className = `ct-actor-chip ${kind}`;
    chip.dataset.actor = id;
    this.actors.appendChild(chip);
    this.actorEls.set(id, chip);
    return chip;
  }

  private syncDetails(input: CardTrialWindowsInput, show: boolean): void {
    if (!show) {
      this.details.hidden = true;
      this.details.replaceChildren();
      return;
    }
    this.details.hidden = false;
    this.details.replaceChildren();
    for (const intent of input.view.intents) {
      const block = el("div", "ct-detail-intent");
      const title = el("div", "ct-detail-title");
      title.textContent = `${intent.enemyName.toUpperCase()}   ${INTENT_ATK_LABEL} ${compactIntentValue(intent)} → ${compactIntentTarget(intent)}`;
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
    a.textContent = `FIGHT ${fightId}`;
    const b = el("div", "ct-banner-name");
    b.textContent = fightName.toUpperCase();
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
      .map((l) => `<div class="ct-result-line">${escapeText(l)}</div>`)
      .join("")}<div class="ct-result-hint">A / Enter continue</div>`;
  }
}

function el(tag: string, className: string): HTMLDivElement {
  const node = document.createElement(tag) as HTMLDivElement;
  node.className = className;
  return node;
}

function place(node: HTMLElement, x: number, y: number): void {
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
}

function pct(n: number, d: number): number {
  if (d <= 0) return 0;
  return Math.max(0, Math.min(100, (n / d) * 100));
}

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
