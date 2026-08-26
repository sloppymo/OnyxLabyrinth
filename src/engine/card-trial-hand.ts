/**
 * Card Trial physical hand — UID-reconciled DOM cards over the battlefield.
 *
 * Rules state (`CardTrialPlayerView`) owns card existence/content/legality;
 * this module owns transient pose. `focusedIndex` is cursor inspection;
 * `armedIndex` is a committed targeting/play pose. They must not be collapsed.
 */

import { CARD_DEFS } from "../game/card-trial/cards";
import { cardArtUrl } from "../game/card-trial/card-art";
import type { HandCardView } from "../game/card-trial/types";
import type { CardTrialViewHandlers, CardTrialWindowsInput } from "./card-trial-view";
import {
  DESIGN_H,
  DESIGN_W,
  cardTextLayoutTier,
  neighborShiftPx,
} from "./card-trial-layout";
import {
  type Pose,
  type PoseSpringState,
  type PoseSpringTuning,
  initPoseSpring,
  poseFrom,
  updatePoseSpring,
} from "./card-trial-motion";
import { getReducedMotion } from "./combat-impact-fx";
import { cardTrialUiAssetUrl, conciseUnavailableReason } from "./card-trial-ui-model";

export interface CardHandTuning extends PoseSpringTuning {
  cardWidth: number;
  cardHeight: number;
  fanSpacing: number;
  fanOuterAngleDeg: number;
  fanOuterDrop: number;
  restingCenterX: number;
  restingCenterY: number;
  focusLift: number;
  focusScale: number;
  /** Remaining fan rotation while focused (1 = none, 0 = fully straight). */
  focusRotationKeep: number;
  armedLift: number;
  armedScale: number;
  neighborSeparation: number;
  neighborFalloff: number;
  dealStaggerMs: number;
  discardDurationMs: number;
}

export const DEFAULT_HAND_TUNING: CardHandTuning = {
  cardWidth: 136,
  cardHeight: 190,
  fanSpacing: 115,
  fanOuterAngleDeg: 6.5,
  fanOuterDrop: 11,
  restingCenterX: DESIGN_W / 2,
  restingCenterY: 534,
  focusLift: 0,
  focusScale: 1,
  focusRotationKeep: 1,
  armedLift: 32,
  armedScale: 1.08,
  neighborSeparation: 22,
  neighborFalloff: 0.35,
  positionFrequency: 14,
  positionDamping: 0.62,
  rotationFrequency: 16,
  rotationDamping: 0.7,
  scaleSharpness: 18,
  dealStaggerMs: 55,
  discardDurationMs: 220,
};

const PLAYING_HOLD_MS = 90;
const DEAL_SETTLE_MS = 260;
const DISABLED_DROP = 10;
const DISABLED_SCALE = 0.96;

/** Sparse Card Trial UI is the default. `?cardHand=0` or `?legacyCt=1` rolls back. */
export function isSparseCardTrialUi(
  search = typeof location !== "undefined" ? location.search : ""
): boolean {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (q.get("legacyCt") === "1" || q.get("legacyCt") === "true") return false;
  if (q.get("cardHand") === "0" || q.get("cardHand") === "false") return false;
  return true;
}

/** @deprecated Use isSparseCardTrialUi. Kept as a named alias for Gate A tests. */
export const isCardHandFlag = isSparseCardTrialUi;

export function fanSlotPose(index: number, count: number, tuning: CardHandTuning): Pose {
  const mid = (count - 1) / 2;
  const t = count <= 1 || mid === 0 ? 0 : (index - mid) / mid;
  const x = tuning.restingCenterX + (index - mid) * tuning.fanSpacing;
  const y = tuning.restingCenterY + Math.abs(t) * tuning.fanOuterDrop;
  const rotation = t * tuning.fanOuterAngleDeg;
  return { x, y, rotation, scale: 1 };
}

export function computeCardTarget(
  index: number,
  count: number,
  focusedIndex: number | null,
  armedIndex: number | null,
  disabled: boolean,
  tuning: CardHandTuning
): Pose {
  const base = fanSlotPose(index, count, tuning);
  const pivot = armedIndex ?? focusedIndex;
  let x = base.x;
  if (pivot !== null && index !== pivot) {
    const dist = Math.abs(index - pivot);
    x += Math.sign(index - pivot) * neighborShiftPx(dist, tuning.neighborSeparation, tuning.neighborFalloff);
  }

  if (armedIndex !== null && index === armedIndex) {
    return {
      x: base.x,
      y: tuning.restingCenterY - tuning.armedLift,
      rotation: 0,
      scale: tuning.armedScale,
    };
  }
  if (focusedIndex !== null && index === focusedIndex) {
    return {
      x: base.x,
      y: tuning.restingCenterY - tuning.focusLift,
      rotation: base.rotation * tuning.focusRotationKeep,
      scale: tuning.focusScale,
    };
  }
  if (disabled) {
    return { x, y: base.y + DISABLED_DROP, rotation: base.rotation, scale: DISABLED_SCALE };
  }
  return { x, y: base.y, rotation: base.rotation, scale: 1 };
}

function deckPilePose(tuning: CardHandTuning): Pose {
  return { x: tuning.restingCenterX, y: DESIGN_H + 40, rotation: 0, scale: 0.85 };
}

export function focusedAndArmedIndices(
  phase: CardTrialWindowsInput["phase"],
  cursor: number,
  handLength: number
): { focusedIndex: number | null; armedIndex: number | null } {
  if (phase === "target" || phase === "target2") {
    return {
      focusedIndex: null,
      armedIndex: cursor < handLength ? cursor : null,
    };
  }
  if (phase === "hand") {
    return {
      focusedIndex: cursor < handLength ? cursor : null,
      armedIndex: null,
    };
  }
  return { focusedIndex: null, armedIndex: null };
}

type CardState = "dealing" | "resting" | "playing" | "discarding";

const Z_BASE: Record<CardState, number> = {
  dealing: 200,
  resting: 100,
  discarding: 300,
  playing: 400,
};
const Z_ARMED = 420;
const Z_FOCUSED = 360;

interface CardBody {
  uid: string;
  el: HTMLButtonElement;
  costEl: HTMLDivElement;
  nameEl: HTMLDivElement;
  openMarkEl: HTMLSpanElement;
  nameTextEl: HTMLSpanElement;
  artEl: HTMLDivElement;
  textEl: HTMLDivElement;
  consumeEl: HTMLDivElement;
  whyEl: HTMLDivElement;
  focusEl: HTMLImageElement;
  model: HandCardView;
  spring: PoseSpringState;
  target: Pose;
  exitPose: Pose | null;
  state: CardState;
  focused: boolean;
  armed: boolean;
  stateEnteredAt: number;
  enterDelayMs: number;
  slotIndex: number;
}

export class CardTrialHandPresentation {
  private tuning: CardHandTuning;
  private stage: HTMLElement;
  private bodies = new Map<string, CardBody>();
  private lastTick: number | null = null;
  private dealSequence = 0;
  private handlers: CardTrialViewHandlers | null = null;

  constructor(stage: HTMLElement, tuningOverrides?: Partial<CardHandTuning>) {
    this.tuning = { ...DEFAULT_HAND_TUNING, ...tuningOverrides };
    this.stage = stage;
  }

  setTuning(next: Partial<CardHandTuning>): void {
    this.tuning = { ...this.tuning, ...next };
    if (next.cardWidth !== undefined || next.cardHeight !== undefined) {
      for (const body of this.bodies.values()) this.applyCardDimensions(body.el);
    }
  }

  private applyCardDimensions(el: HTMLElement): void {
    el.style.width = `${this.tuning.cardWidth}px`;
    el.style.height = `${this.tuning.cardHeight}px`;
  }

  getTuning(): CardHandTuning {
    return this.tuning;
  }

  destroy(): void {
    for (const body of this.bodies.values()) body.el.remove();
    this.bodies.clear();
  }

  private createBody(card: HandCardView, sequence: number, now: number): CardBody {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "ct2-card";
    el.dataset.state = "dealing";
    el.dataset.uid = card.uid;
    const costEl = document.createElement("div");
    costEl.className = "ct2-card-cost";
    const nameEl = document.createElement("div");
    nameEl.className = "ct2-card-name";
    const openMarkEl = document.createElement("span");
    openMarkEl.className = "ct2-opened-mark";
    openMarkEl.title = "Opens";
    openMarkEl.textContent = "◉";
    openMarkEl.hidden = true;
    const nameTextEl = document.createElement("span");
    nameEl.append(openMarkEl, nameTextEl);
    const artEl = document.createElement("div");
    artEl.className = "ct2-card-art";
    const textEl = document.createElement("div");
    textEl.className = "ct2-card-text";
    const consumeEl = document.createElement("div");
    consumeEl.className = "ct2-card-consume";
    const whyEl = document.createElement("div");
    whyEl.className = "ct2-card-why";
    const focusEl = document.createElement("img");
    focusEl.className = "ct2-focus-brackets";
    focusEl.alt = "";
    focusEl.draggable = false;
    focusEl.src = cardTrialUiAssetUrl("brackets-focus");
    el.append(costEl, nameEl, artEl, textEl, consumeEl, whyEl, focusEl);
    this.applyCardDimensions(el);
    this.stage.appendChild(el);

    el.addEventListener("pointerenter", () => {
      const idx = this.bodies.get(card.uid)?.slotIndex;
      if (this.handlers?.onHoverCardUid) this.handlers.onHoverCardUid(card.uid);
      else if (idx !== undefined) this.handlers?.onHoverCard(idx);
    });
    el.addEventListener("click", () => {
      const idx = this.bodies.get(card.uid)?.slotIndex;
      if (this.handlers?.onConfirmCardUid) this.handlers.onConfirmCardUid(card.uid);
      else if (idx !== undefined) this.handlers?.onConfirmCard(idx);
    });

    const spawn = deckPilePose(this.tuning);
    return {
      uid: card.uid,
      el,
      costEl,
      nameEl,
      openMarkEl,
      nameTextEl,
      artEl,
      textEl,
      consumeEl,
      whyEl,
      focusEl,
      model: card,
      spring: initPoseSpring(spawn),
      target: spawn,
      exitPose: null,
      state: "dealing",
      focused: false,
      armed: false,
      stateEnteredAt: now,
      enterDelayMs: sequence * this.tuning.dealStaggerMs,
      slotIndex: 0,
    };
  }

  private applyArt(body: CardBody): void {
    const c = body.model;
    const url = cardArtUrl(c.defId);
    const img = body.artEl.querySelector("img");
    if (url) {
      body.artEl.classList.remove("fallback");
      if (img) {
        if (img.getAttribute("src") !== url) img.src = url;
      } else {
        body.artEl.textContent = "";
        const image = document.createElement("img");
        image.alt = "";
        image.draggable = false;
        image.decoding = "async";
        image.src = url;
        body.artEl.appendChild(image);
      }
      return;
    }
    if (img) img.remove();
    body.artEl.classList.add("fallback");
    const hero = CARD_DEFS[c.defId]?.hero;
    body.artEl.textContent = hero === "old-man" ? "OM" : "RK";
  }

  private applyModel(body: CardBody): void {
    const c = body.model;
    const tier = cardTextLayoutTier(c.text);
    body.el.dataset.tier = tier;
    body.costEl.textContent = String(c.cost);
    body.openMarkEl.hidden = !c.opens;
    body.nameTextEl.textContent = c.name;
    body.textEl.innerHTML = cardRulesHtml(c.text);
    this.applyArt(body);
    if (c.consume === "none") {
      body.consumeEl.textContent = "";
      body.consumeEl.className = "ct2-card-consume";
    } else {
      body.consumeEl.textContent = "◉ Consume";
      body.consumeEl.className = [
        "ct2-card-consume",
        c.consumeArmed ? "armed" : "",
        c.consumeDimmed ? "dim" : "",
      ]
        .filter(Boolean)
        .join(" ");
    }
    body.whyEl.textContent = c.disabled
      ? conciseUnavailableReason(c.disabledReason, c.cost) ?? "Unavailable"
      : "";
    body.el.classList.toggle("disabled", c.disabled);
  }

  private enterDiscarding(body: CardBody, now: number, delayMs: number): void {
    const cur = poseFrom(body.spring);
    body.state = "discarding";
    body.el.dataset.state = body.state;
    body.stateEnteredAt = now;
    body.enterDelayMs = delayMs;
    body.exitPose = {
      x: cur.x,
      y: DESIGN_H + 60,
      rotation: cur.rotation + (body.slotIndex % 2 === 0 ? -22 : 22),
      scale: 0.7,
    };
    body.el.style.pointerEvents = "none";
    body.el.style.zIndex = String(Z_BASE.discarding);
    body.focused = false;
    body.armed = false;
    body.el.classList.remove("focused", "armed", "selected");
    body.el.classList.remove("playing");
  }

  sync(input: CardTrialWindowsInput, handlers: CardTrialViewHandlers): void {
    this.handlers = handlers;
    const now = performance.now();
    const { view, phase, cursor } = input;
    const hand = view.hand;
    const seenUids = new Set(hand.map((c) => c.uid));
    const showHand = phase === "hand";
    const { focusedIndex, armedIndex } = focusedAndArmedIndices(phase, cursor, hand.length);

    const removedUids: string[] = [];
    for (const [uid, body] of this.bodies) {
      if (!seenUids.has(uid) && body.state !== "discarding") removedUids.push(uid);
    }
    if (removedUids.length === 1) {
      const body = this.bodies.get(removedUids[0])!;
      body.state = "playing";
      body.el.dataset.state = body.state;
      body.stateEnteredAt = now;
      body.el.style.pointerEvents = "none";
      body.el.style.zIndex = String(Z_BASE.playing);
      body.focused = false;
      body.armed = false;
      body.el.classList.remove("focused", "armed", "selected");
    } else {
      removedUids.forEach((uid, i) => {
        this.enterDiscarding(this.bodies.get(uid)!, now, i * 40);
      });
    }

    for (const card of hand) {
      if (!this.bodies.has(card.uid)) {
        const body = this.createBody(card, this.dealSequence, now);
        this.dealSequence += 1;
        this.bodies.set(card.uid, body);
      }
    }
    if (hand.length === 0) this.dealSequence = 0;

    hand.forEach((card, index) => {
      const body = this.bodies.get(card.uid)!;
      body.model = card;
      this.applyModel(body);
      body.slotIndex = index;
      // A card can be reshuffled back into the next hand before its previous
      // discard animation has finished. The rules engine owns the UID's
      // existence; if it is present again, it must re-enter the hand rather
      // than remain hidden in the old discard pose.
      if (body.state === "playing" || body.state === "discarding") {
        body.state = "dealing";
        body.el.dataset.state = body.state;
        body.stateEnteredAt = now;
        body.enterDelayMs = 0;
        body.exitPose = null;
        body.spring = initPoseSpring(deckPilePose(this.tuning));
        body.el.classList.remove("playing", "focused", "armed", "selected");
      }
      body.target = computeCardTarget(index, hand.length, focusedIndex, armedIndex, card.disabled, this.tuning);
      body.focused = index === focusedIndex;
      body.armed = index === armedIndex;
      if (body.state !== "dealing") {
        body.state = "resting";
      }
      body.el.dataset.state = body.state;
      const z = body.armed
        ? Z_ARMED
        : body.focused
          ? Z_FOCUSED
          : body.state === "resting"
            ? Z_BASE.resting + index
            : Z_BASE[body.state];
      body.el.style.zIndex = String(z);
      body.el.style.pointerEvents = showHand ? "auto" : "none";
      body.el.classList.toggle("focused", body.focused);
      body.el.classList.toggle("armed", body.armed);
      body.el.classList.toggle(
        "deemphasized",
        (focusedIndex !== null || armedIndex !== null) && !body.focused && !body.armed
      );
      body.el.classList.remove("playing");
    });
  }

  update(now: number): void {
    const dtSeconds = this.lastTick === null ? 0 : Math.max(0, (now - this.lastTick) / 1000);
    this.lastTick = now;
    const reduced = getReducedMotion();
    const toRemove: string[] = [];

    for (const [uid, body] of this.bodies) {
      if (body.state === "dealing") {
        const elapsed = now - body.stateEnteredAt;
        if (reduced || elapsed >= body.enterDelayMs + DEAL_SETTLE_MS) body.state = "resting";
      } else if (body.state === "playing") {
        const elapsed = now - body.stateEnteredAt;
        if (reduced || elapsed >= PLAYING_HOLD_MS) this.enterDiscarding(body, now, 0);
      } else if (body.state === "discarding") {
        const elapsed = now - body.stateEnteredAt;
        if (reduced || elapsed >= body.enterDelayMs + this.tuning.discardDurationMs) {
          toRemove.push(uid);
          continue;
        }
      }

      body.el.dataset.state = body.state;

      let target: Pose;
      if (body.state === "dealing" && now - body.stateEnteredAt < body.enterDelayMs) {
        target = deckPilePose(this.tuning);
      } else if (body.state === "discarding") {
        target =
          now - body.stateEnteredAt < body.enterDelayMs ? poseFrom(body.spring) : body.exitPose ?? body.target;
      } else if (body.state === "playing") {
        target = { ...body.target, y: this.tuning.restingCenterY - 48, scale: this.tuning.armedScale * 1.06 };
      } else {
        target = body.target;
      }

      body.spring = updatePoseSpring(body.spring, target, this.tuning, dtSeconds);
      const pose = poseFrom(body.spring);
      body.el.classList.toggle("playing", body.state === "playing");
      body.el.style.transform = `translate(${pose.x}px, ${pose.y}px) translate(-50%, -50%) rotate(${pose.rotation}deg) scale(${pose.scale})`;
    }

    for (const uid of toRemove) {
      const body = this.bodies.get(uid);
      if (!body) continue;
      body.el.remove();
      this.bodies.delete(uid);
    }
  }
}

function cardRulesHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
  return escaped.replace(
    /\b(?:Deal|Gain|Move|Front|Back|Open|Opened|Consume|Rat)\b(?:\s+\d+)?(?:\s+Guard)?|[+]\d+/g,
    (match) => `<span class="ct2-emphasis">${match}</span>`
  );
}
