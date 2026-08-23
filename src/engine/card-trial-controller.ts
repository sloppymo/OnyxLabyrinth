/**
 * Card Trial combat controller — energy turns on the existing combat stage.
 */

import type { CardId, CardTrialState } from "../game/card-trial/types";
import {
  actingHero,
  canPaidMove,
  endHeroTurn,
  paidMove,
  playCard,
  playerView,
} from "../game/card-trial/engine";
import type { CombatStage } from "./combat-stage";
import { combatCardTrialOverlay, combatWindows, setCardTrialSparseChrome } from "./shell";
import { isSparseCardTrialUi } from "./card-trial-hand";
import { CardTrialSparseUi } from "./card-trial-sparse";
import type { CombatDebugView } from "../debug/snapshot";
import type { ControllerInputEvent } from "./controller-input";
import { controllerEventToMenuKey } from "./menu-controller-adapter";
import { audio } from "./audio";
import {
  renderCardTrialWindows,
  type CardTrialUiPhase,
  type CardTrialViewHandlers,
} from "./card-trial-view";
import {
  spellNameFor,
  techniqueNameFor,
  toCombatEvents,
  toCombatState,
  type CardTrialPresentationContext,
} from "./card-trial-presentation";
import { playCombatEventSounds } from "./combat-audio";
import { CARD_DEFS } from "../game/card-trial/cards";

export interface CardTrialControllerOptions {
  stage: CombatStage;
  onEnd: (state: CardTrialState) => void;
}

export class CardTrialController {
  private trial: CardTrialState;
  private stage: CombatStage;
  private onEnd: (state: CardTrialState) => void;
  private phase: CardTrialUiPhase = "hand";
  private cursor = 0;
  private targetIds: string[] = [];
  private targetCursor = 0;
  private pendingUid: string | null = null;
  private pendingTarget: string | null = null;
  private pendingEnd = false;
  private flash: string | null = null;
  private rafId: number | null = null;
  private windowsDirty = true;
  private stopped = false;
  private detailsHeld = false;
  private playbackLabel: string | null = null;
  private decisionStartedAt = performance.now();
  private sparse: CardTrialSparseUi | null = null;

  constructor(trial: CardTrialState, opts: CardTrialControllerOptions) {
    this.trial = trial;
    this.stage = opts.stage;
    this.onEnd = opts.onEnd;
    if (isSparseCardTrialUi()) {
      setCardTrialSparseChrome(true);
      this.sparse = new CardTrialSparseUi(combatCardTrialOverlay);
    }
    this.syncStage();
    this.startRenderLoop();
  }

  get state(): CardTrialState {
    return this.trial;
  }

  getPhase(): CardTrialUiPhase {
    return this.phase;
  }

  isChoreographyDone(): boolean {
    return this.phase !== "playback" || this.stage.isPlaybackDone(performance.now());
  }

  snapshotCanvas(): HTMLCanvasElement | null {
    return this.stage.snapshotCanvas();
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    combatWindows.innerHTML = "";
    this.sparse?.destroy();
    this.sparse = null;
    setCardTrialSparseChrome(false);
  }

  destroy(): void {
    this.stop();
    this.stage.destroy();
  }

  debugView(): CombatDebugView {
    const v = playerView(this.trial);
    return {
      phase: this.phase,
      actingCharId: v.actingHero,
      roundEnding: false,
      playbackDone: this.isChoreographyDone(),
      selection:
        this.phase === "hand"
          ? {
              title: "Hand",
              entries: v.hand.map((c) => c.name),
              index: this.cursor,
            }
          : this.phase === "target" || this.phase === "target2"
            ? {
                title: this.phase === "target2" ? "Second enemy" : "Target",
                entries: this.targetIds,
                index: this.targetCursor,
              }
            : null,
      round: this.trial.round,
      enemies: v.enemies.map((e) => ({
        id: e.id,
        name: e.name,
        hp: e.hp,
        maxHp: e.maxHp,
        row: "front",
        status: e.opened ? ["opened"] : [],
      })),
      party: v.heroes.map((h) => ({
        id: h.id,
        name: h.name,
        class: h.id === "rat-king" ? "Thief" : "Priest",
        hp: h.hp,
        maxHp: h.maxHp,
        sp: 0,
        maxSp: 0,
        status: [],
        knownSpellIds: [],
      })),
      recentLog: [],
      result: this.trial.result,
    };
  }

  handleInput(event: ControllerInputEvent): void {
    const key = controllerEventToMenuKey(event);
    if (key) this.handleKey(key);
  }

  handleKey(key: string): void {
    if (this.phase === "playback") {
      if (key === "Shift") {
        this.stage.setPlaybackRate(2);
        this.stage.setCues({ fast: true, auto: false });
        return;
      }
      if (key === "Escape") this.stage.skipPlaybackToEnd(performance.now());
      return;
    }
    if (this.phase === "result") {
      if (key === "Enter" || key === " ") {
        this.finish();
      }
      return;
    }
    const lower = key.toLowerCase();
    if (lower === "i") {
      if (!this.detailsHeld) {
        this.detailsHeld = true;
        this.trial.telemetry.presentation.detailHolds += 1;
        this.windowsDirty = true;
      }
      return;
    }
    if (this.phase === "hand") {
      const utilCount = 2;
      const n = playerView(this.trial).hand.length + utilCount;
      if (lower === "arrowleft" || lower === "arrowup" || lower === "w") {
        this.cursor = (this.cursor - 1 + n) % n;
        audio.uiCursor();
        this.windowsDirty = true;
        return;
      }
      if (lower === "arrowright" || lower === "arrowdown" || lower === "s") {
        this.cursor = (this.cursor + 1) % n;
        audio.uiCursor();
        this.windowsDirty = true;
        return;
      }
      if (lower === "m") {
        this.tryMove();
        return;
      }
      if (key === "Escape" || lower === "b") {
        this.tryPass();
        return;
      }
      if (key === "Enter" || key === " ") {
        this.confirmHand();
        return;
      }
      const digit = Number(key);
      if (digit >= 1 && digit <= 5) {
        this.cursor = digit - 1;
        this.confirmHand();
      }
      return;
    }
    if (this.phase === "target" || this.phase === "target2") {
      const n = this.targetIds.length;
      if (n === 0) return;
      if (lower === "arrowleft" || lower === "arrowup" || lower === "w") {
        this.targetCursor = (this.targetCursor - 1 + n) % n;
        this.trial.telemetry.presentation.targetChanges += 1;
        this.windowsDirty = true;
        return;
      }
      if (lower === "arrowright" || lower === "arrowdown" || lower === "s") {
        this.targetCursor = (this.targetCursor + 1) % n;
        this.trial.telemetry.presentation.targetChanges += 1;
        this.windowsDirty = true;
        return;
      }
      if (key === "Escape") {
        this.trial.telemetry.presentation.targetCancels += 1;
        this.phase = "hand";
        this.pendingUid = null;
        this.pendingTarget = null;
        this.windowsDirty = true;
        return;
      }
      if (key === "Enter" || key === " ") {
        this.confirmTarget();
      }
    }
  }

  handleKeyUp(key: string): void {
    if (key === "Shift") {
      this.stage.setPlaybackRate(1);
      this.stage.setCues({ fast: false, auto: false });
    }
    if (key.toLowerCase() === "i" && this.detailsHeld) {
      this.detailsHeld = false;
      this.windowsDirty = true;
    }
  }

  private handlers(): CardTrialViewHandlers {
    return {
      onHoverCard: (i) => {
        this.cursor = i;
        this.windowsDirty = true;
      },
      onConfirmCard: (i) => {
        this.cursor = i;
        this.confirmHand();
      },
      onMove: () => this.tryMove(),
      onPass: () => this.tryPass(),
      onHoverTarget: (i) => {
        this.targetCursor = i;
        this.windowsDirty = true;
      },
      onConfirmTarget: (i) => {
        this.targetCursor = i;
        this.confirmTarget();
      },
      onCancel: () => {
        this.phase = "hand";
        this.windowsDirty = true;
      },
    };
  }

  private confirmHand(): void {
    const view = playerView(this.trial);
    if (this.cursor === view.hand.length) {
      this.tryMove();
      return;
    }
    if (this.cursor === view.hand.length + 1) {
      this.tryPass();
      return;
    }
    const card = view.hand[this.cursor];
    if (!card) return;
    if (card.disabled) {
      this.trial.telemetry.presentation.disabledAttempts += 1;
      this.flash = card.disabledReason;
      audio.uiCancel();
      this.windowsDirty = true;
      return;
    }
    const def = CARD_DEFS[card.defId as CardId];
    if (def.target === "none") {
      this.resolvePlay(card.uid, {});
      return;
    }
    if (def.target === "all-enemies") {
      this.resolvePlay(card.uid, {});
      return;
    }
    this.pendingUid = card.uid;
    this.targetIds = view.enemies.filter((e) => !e.dead).map((e) => e.id);
    this.targetCursor = Math.max(0, this.targetIds.findIndex((id) => id === view.openedEnemyId));
    this.phase = "target";
    this.windowsDirty = true;
  }

  private confirmTarget(): void {
    const id = this.targetIds[this.targetCursor];
    if (!id || !this.pendingUid) return;
    if (this.phase === "target2") {
      this.resolvePlay(this.pendingUid, { targetId: this.pendingTarget ?? undefined, secondTargetId: id });
      return;
    }
    const openedBefore = this.trial.opened?.enemyId ?? null;
    const result = playCard(this.trial, this.pendingUid, { targetId: id });
    if (result.needsSecondTarget) {
      this.pendingTarget = id;
      this.targetIds = playerView(this.trial)
        .enemies.filter((e) => !e.dead && e.id !== id)
        .map((e) => e.id);
      this.targetCursor = 0;
      this.phase = "target2";
      this.windowsDirty = true;
      return;
    }
    this.afterPlay(result.ok, result.reason, result.events, openedBefore);
  }

  private resolvePlay(uid: string, targets: { targetId?: string; secondTargetId?: string }): void {
    const openedBefore = this.trial.opened?.enemyId ?? null;
    const result = playCard(this.trial, uid, targets);
    this.afterPlay(result.ok, result.reason, result.events, openedBefore);
  }

  private afterPlay(
    ok: boolean,
    reason: string | undefined,
    events: Parameters<typeof toCombatEvents>[0],
    openedBefore: string | null = null
  ): void {
    this.pendingUid = null;
    this.pendingTarget = null;
    if (!ok) {
      this.flash = reason ?? "Can't play";
      audio.uiCancel();
      this.phase = "hand";
      this.windowsDirty = true;
      return;
    }
    this.recordDecision();
    audio.uiConfirm();
    this.queueAutoEnd();
    const card = events.find((event) => event.type === "banner");
    this.playbackLabel = card?.type === "banner" ? card.text : null;
    this.playEvents(events, { openedBefore });
  }

  private tryMove(): void {
    const gate = canPaidMove(this.trial);
    if (!gate.ok) {
      this.flash = gate.reason;
      audio.uiCancel();
      this.windowsDirty = true;
      return;
    }
    this.recordDecision();
    const result = paidMove(this.trial);
    audio.uiConfirm();
    this.queueAutoEnd();
    this.playbackLabel = "MOVE";
    this.playEvents(result.events);
  }

  private tryPass(): void {
    this.recordDecision();
    audio.uiConfirm();
    const events = endHeroTurn(this.trial);
    this.playbackLabel = "PASS";
    this.playEvents(events);
  }

  private queueAutoEnd(): void {
    if (this.trial.result) return;
    const hero = actingHero(this.trial);
    if (!hero) return;
    const view = playerView(this.trial);
    const canCard = view.hand.some((c) => !c.disabled);
    const canMove = view.moveAvailable;
    if (hero.energy <= 0 || (!canCard && !canMove)) this.pendingEnd = true;
  }

  private playEvents(
    events: Parameters<typeof toCombatEvents>[0],
    context: CardTrialPresentationContext = {}
  ): void {
    this.syncStage();
    const combatEvents = toCombatEvents(events, this.trial, context);
    if (combatEvents.length === 0) {
      this.afterPlayback();
      return;
    }
    if (events.some((event) => event.type === "intent-hit" || event.type === "intent-miss")) {
      this.playbackLabel = "ENEMY TURN";
    }
    playCombatEventSounds(combatEvents, toCombatState(this.trial));
    this.phase = "playback";
    this.windowsDirty = true;
    this.stage.playTurn(combatEvents, spellNameFor, techniqueNameFor, performance.now());
  }

  private afterPlayback(): void {
    this.syncStage();
    this.stage.clearBanner();
    this.stage.setCues({ fast: false, auto: false });
    this.stage.setPlaybackRate(1);
    this.playbackLabel = null;
    if (this.trial.result) {
      this.phase = "result";
      this.windowsDirty = true;
      return;
    }
    if (this.pendingEnd) {
      this.pendingEnd = false;
      const events = endHeroTurn(this.trial);
      this.playEvents(events);
      return;
    }
    this.phase = "hand";
    this.cursor = 0;
    this.decisionStartedAt = performance.now();
    this.windowsDirty = true;
  }

  private recordDecision(): void {
    this.trial.telemetry.presentation.decisionMs.push(
      Math.max(0, performance.now() - this.decisionStartedAt)
    );
  }

  private finish(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.stop();
    this.onEnd(this.trial);
  }

  private syncStage(): void {
    const combat = toCombatState(this.trial);
    this.stage.setState(combat);
    this.stage.setActiveActor(actingHero(this.trial)?.id ?? null);
    this.syncCursor();
  }

  private syncCursor(): void {
    const targeting = this.phase === "target" || this.phase === "target2";
    const id = targeting ? this.targetIds[this.targetCursor] : null;
    this.stage.setCursor(id ? { kind: "enemy", id, kill: false } : null);
  }

  private startRenderLoop(): void {
    const loop = () => {
      this.tick();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private tick(): void {
    const now = performance.now();
    this.stage.update(now);
    if (this.phase === "playback" && this.stage.isPlaybackDone(now)) {
      this.afterPlayback();
    }
    this.sparse?.update(now);
    if (this.windowsDirty) {
      this.syncCursor();
      this.renderWindows();
      this.windowsDirty = false;
    }
    this.stage.paint(now);
  }

  private renderWindows(): void {
    const view = playerView(this.trial);
    const result =
      this.phase === "result" && this.trial.result
        ? {
            title: this.trial.result === "victory" ? "Victory" : "Defeat",
            lines: [
              `Rat King ${this.trial.heroes["rat-king"].hp}/40`,
              `Old Man ${this.trial.heroes["old-man"].hp}/40`,
            ],
          }
        : null;
    const input = {
      view,
      phase: this.phase,
      cursor: this.cursor,
      targetIds: this.targetIds,
      targetCursor: this.targetCursor,
      flash: this.flash,
      result,
      detailsHeld: this.detailsHeld,
      playbackLabel: this.playbackLabel,
      hideLegacyPanes: !!this.sparse,
    };
    if (this.sparse) {
      combatWindows.innerHTML = "";
      this.sparse.sync(input, this.handlers());
      return;
    }
    renderCardTrialWindows(combatWindows, input, this.handlers());
  }
}
