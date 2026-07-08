/**
 * Combat UI controller — keyboard-driven action selection and round
 * resolution for the JRPG-style canvas combat screen.
 *
 * Flow:
 * 1. Action selection: for each living, non-incapacitated character, the
 *    player picks an action (Attack/Cast/Defend/Item/Flee) and any target.
 * 2. Round resolution: the player presses Space to resolve the round via
 *    resolveCombatRound. New log entries are queued for sequential reveal.
 * 3. Message reveal: log entries are shown one at a time in the message box
 *    (auto-advance after ~1.5s, or on Space/Enter). Sprite animations are
 *    triggered per-message.
 * 4. End handling: when combat ends (victory/wipe/fled), the player presses
 *    Space to return to the dungeon.
 *
 * The controller renders to a canvas (#combat-canvas) via combat-renderer.ts
 * and receives keypresses via handleKey(). main.ts routes keys here when
 * mode==="combat".
 */

import {
  resolveCombatRound,
  type CombatState,
  type PlayerAction,
  type EnemyInstance,
} from "../game/combat";
import type { Character } from "../game/party";
import type { SpellDef } from "../data/spells";
import type { ItemDef } from "../data/items";
import { combatCtx, combatCanvas, combatPanel, showCombatPanel, showCombatCanvas } from "./shell";
import {
  renderCombat,
  updateAnimations,
  triggerAnimationsForMessage,
  setAnim,
  type CombatScene,
} from "./combat-renderer";
import {
  renderSelectActionPhase,
  ACTION_KINDS,
  type SelectActionView,
  type SelectActionHandlers,
  type CombatPanelPhase,
} from "./combat-select-action-view";
import { enemyHealthDescriptor, type SelectionChoice } from "./combat-display";

type Phase =
  | "selectAction"
  | "selectEnemyTarget"
  | "selectAllyTarget"
  | "selectSpell"
  | "selectItem"
  | "ready"
  | "messageReveal"
  | "roundResult"
  | "ended";

const PANEL_PHASES: readonly CombatPanelPhase[] = [
  "selectAction",
  "selectEnemyTarget",
  "selectAllyTarget",
  "selectSpell",
  "selectItem",
  "ready",
];

function toPanelPhase(phase: Phase): CombatPanelPhase | null {
  return (PANEL_PHASES as readonly Phase[]).includes(phase)
    ? (phase as CombatPanelPhase)
    : null;
}

interface PendingAction {
  actorId: string;
  kind?: PlayerAction["kind"];
  spellId?: string;
  itemId?: string;
}

export interface CombatControllerOptions {
  onEnd: (result: CombatState) => void;
}

const MESSAGE_AUTO_ADVANCE_MS = 1600;

export class CombatController {
  private state: CombatState;
  private onEnd: (result: CombatState) => void;
  private phase: Phase = "selectAction";
  private actions: PlayerAction[] = [];
  private currentCharIndex = 0;
  private pending: PendingAction = { actorId: "" };

  // Canvas rendering.
  private scene: CombatScene;
  private rafId: number | null = null;
  private prevLogLength = 0;

  // DOM-based action selection.
  private actionMenuIndex = 0;
  private domViewDirty = true;

  constructor(state: CombatState, opts: CombatControllerOptions) {
    this.state = state;
    this.onEnd = opts.onEnd;

    // Initialize the scene state for the canvas renderer.
    this.scene = {
      state: this.state,
      phase: this.phase,
      currentActorIndex: 0,
      flash: null,
      prompt: "",
      selectionList: null,
      partyAnims: new Map(),
      enemyAnims: new Map(),
      allyAnims: new Map(),
      enemyGraveyard: [],
      allyGraveyard: [],
      effects: [],
      messageQueue: [],
      eventQueue: [],
      currentMessage: null,
      messageStart: 0,
      messageAdvanceDelay: MESSAGE_AUTO_ADVANCE_MS,
    };

    this.startActionSelection();
    this.startRenderLoop();
  }

  /** Destroy the controller — cancel the render loop. */
  destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  // --- Render loop ---------------------------------------------------------

  private startRenderLoop(): void {
    const loop = () => {
      this.tick();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private tick(): void {
    const now = performance.now();

    const isSelectionPhase =
      this.phase === "selectAction" ||
      this.phase === "selectEnemyTarget" ||
      this.phase === "selectAllyTarget" ||
      this.phase === "selectSpell" ||
      this.phase === "selectItem" ||
      this.phase === "ready";

    if (isSelectionPhase) {
      showCombatPanel();
      if (this.domViewDirty) {
        this.renderSelectActionDom();
        this.domViewDirty = false;
      }
      return;
    }

    showCombatCanvas();

    const w = combatCanvas.width;
    const h = combatCanvas.height;

    // Update sprite animations.
    updateAnimations(this.scene, now);

    // Handle message queue auto-advance.
    if (this.phase === "messageReveal" && this.scene.currentMessage !== null) {
      const elapsed = now - this.scene.messageStart;
      if (elapsed >= this.scene.messageAdvanceDelay) {
        this.advanceMessage();
      }
    }

    // Sync scene state with controller state.
    this.scene.state = this.state;
    this.scene.phase = this.phase;
    this.scene.currentActorIndex = this.currentCharIndex;

    // Update prompt text based on phase.
    this.scene.prompt = this.buildPrompt();
    this.scene.selectionList = this.buildSelectionList();

    // Render.
    renderCombat(combatCtx, w, h, this.scene, now);
  }

  // --- Message queue -------------------------------------------------------

  /** Start revealing queued messages one at a time. */
  private startMessageReveal(): void {
    // Extract new log entries (those added since the last round).
    const newEntries = this.state.log.slice(this.prevLogLength);
    // Extract the corresponding events (parallel array).
    const newEvents = this.state.events.slice(this.prevLogLength);
    this.prevLogLength = this.state.log.length;

    this.scene.messageQueue = [...newEntries];
    this.scene.eventQueue = [...newEvents];
    this.phase = "messageReveal";
    this.advanceMessage();
  }

  /** Advance to the next message in the queue, or finish the reveal. */
  private advanceMessage(): void {
    const now = performance.now();
    const w = combatCanvas.width;
    const h = combatCanvas.height;

    if (this.scene.messageQueue.length > 0) {
      const msg = this.scene.messageQueue.shift()!;
      const evt = this.scene.eventQueue.shift() ?? null;
      this.scene.currentMessage = msg;
      this.scene.messageStart = now;

      // Trigger sprite animations for this message (using structured event
      // if available, falling back to regex matching otherwise).
      triggerAnimationsForMessage(this.scene, msg, now, w, h, evt);
    } else {
      // All messages revealed — proceed to next phase.
      this.scene.currentMessage = null;
      if (this.state.ended) {
        this.phase = "ended";
      } else {
        this.phase = "roundResult";
      }
    }
  }

  // --- Consumables ---------------------------------------------------------

  /** Consumables currently held by the party, with stack counts. */
  private availableItems(): { item: ItemDef; count: number }[] {
    return Object.entries(this.state.inventory)
      .filter(([, count]) => count > 0)
      .map(([id, count]) => ({ item: this.state.items[id], count }))
      .filter(
        (entry): entry is { item: ItemDef; count: number } =>
          entry.item !== undefined && entry.item.type === "consumable"
      );
  }

  // --- Public API ---------------------------------------------------------

  /** Route a keypress to the controller. Called by main.ts for combat mode. */
  handleKey(key: string): void {
    // Message reveal: any of Space/Enter advances to the next message.
    if (this.phase === "messageReveal") {
      if (key === " " || key === "Enter") {
        this.advanceMessage();
      }
      return;
    }

    if (this.phase === "roundResult") {
      if (key === " " || key === "Enter") {
        this.startActionSelection();
      }
      return;
    }

    if (this.phase === "ended") {
      if (key === " " || key === "Enter") {
        this.destroy();
        this.onEnd(this.state);
      }
      return;
    }

    if (this.phase === "ready") {
      if (key === " " || key === "Enter") {
        this.resolveRound();
      }
      return;
    }

    if (this.phase === "selectAction") {
      this.handleActionKey(key);
      return;
    }

    if (this.phase === "selectEnemyTarget") {
      this.handleEnemyTargetKey(key);
      return;
    }

    if (this.phase === "selectAllyTarget") {
      this.handleAllyTargetKey(key);
      return;
    }

    if (this.phase === "selectSpell") {
      this.handleSpellKey(key);
      return;
    }

    if (this.phase === "selectItem") {
      this.handleItemKey(key);
      return;
    }
  }

  // --- Action selection ---------------------------------------------------

  private startActionSelection(): void {
    this.actions = [];
    this.currentCharIndex = 0;
    this.phase = "selectAction";
    this.pending = { actorId: "" };
    this.actionMenuIndex = 0;
    this.domViewDirty = true;
    this.scene.flash = null;
    this.scene.currentMessage = null;
    this.advanceToNextActor();
  }

  /** Advance to the next living, non-incapacitated character. */
  private advanceToNextActor(): void {
    this.actionMenuIndex = 0;
    this.domViewDirty = true;
    const party = this.state.party;
    while (this.currentCharIndex < party.length) {
      const c = party[this.currentCharIndex];
      if (c.hp > 0 && !c.status.includes("sleep") && !c.status.includes("paralysis")) {
        this.pending = { actorId: c.id };
        return;
      }
      this.currentCharIndex++;
    }
    // All characters have actions — ready to resolve.
    this.phase = "ready";
  }

  private currentChar(): Character | undefined {
    return this.state.party.find((c) => c.id === this.pending.actorId);
  }

  private handleActionKey(key: string): void {
    const c = this.currentChar();
    if (!c) return;

    switch (key) {
      case "ArrowUp":
        this.actionMenuIndex =
          (this.actionMenuIndex - 1 + ACTION_KINDS.length) % ACTION_KINDS.length;
        this.domViewDirty = true;
        return;
      case "ArrowDown":
        this.actionMenuIndex = (this.actionMenuIndex + 1) % ACTION_KINDS.length;
        this.domViewDirty = true;
        return;
      case " ":
      case "Enter":
        this.chooseAction(ACTION_KINDS[this.actionMenuIndex]);
        return;
    }

    const shortcutMap: Record<string, PlayerAction["kind"]> = {
      a: "attack",
      c: "cast",
      d: "defend",
      i: "item",
      f: "flee",
    };
    const kind = shortcutMap[key.toLowerCase()];
    if (kind) {
      this.chooseAction(kind);
    }
  }

  /** Confirm the chosen action and advance state. Shared by keyboard and DOM input. */
  private chooseAction(kind: PlayerAction["kind"]): void {
    const c = this.currentChar();
    if (!c) return;
    this.domViewDirty = true;

    switch (kind) {
      case "attack": {
        if (this.livingEnemies().length === 0) {
          this.scene.flash = "No enemies to attack.";
          return;
        }
        this.pending.kind = "attack";
        this.phase = "selectEnemyTarget";
        this.scene.flash = null;
        break;
      }
      case "cast": {
        const knownSpells = c.knownSpellIds
          .map((id) => this.state.spells[id])
          .filter((s): s is SpellDef => s !== undefined);
        if (knownSpells.length === 0) {
          this.scene.flash = `${c.name} has no spells to cast.`;
          return;
        }
        if (this.state.silencedThisRound.includes(c.id)) {
          this.scene.flash = `${c.name} is silenced and cannot cast.`;
          return;
        }
        this.pending.kind = "cast";
        this.phase = "selectSpell";
        this.scene.flash = null;
        break;
      }
      case "defend":
        this.actions.push({ kind: "defend", actorId: c.id });
        this.currentCharIndex++;
        this.advanceToNextActor();
        this.scene.flash = null;
        break;
      case "item": {
        const available = this.availableItems();
        if (available.length === 0) {
          this.scene.flash = "No items available.";
          return;
        }
        this.pending.kind = "item";
        this.phase = "selectItem";
        this.scene.flash = null;
        break;
      }
      case "flee":
        this.actions.push({ kind: "flee", actorId: c.id });
        // Flee is a party-level action; skip remaining characters.
        this.phase = "ready";
        this.scene.flash = null;
        break;
    }

    if (this.phase === "selectAction") {
      this.domViewDirty = true;
    }
  }

  /** Render the DOM-based combat panel into #combat-panel. */
  private renderSelectActionDom(): void {
    const panelPhase = toPanelPhase(this.phase);
    if (!panelPhase) return;

    const c =
      this.currentChar() ??
      this.state.party.find((p) => p.hp > 0) ??
      this.state.party[0];
    if (!c) return;

    const view: SelectActionView = {
      state: this.state,
      currentCharacter: c,
      selectedIndex: this.actionMenuIndex,
      phase: panelPhase,
      prompt: this.buildPrompt(),
      selectionList: this.buildSelectionList(),
      flash: this.scene.flash,
      plannedActions: this.actions,
    };
    const handlers: SelectActionHandlers = {
      onSelectIndex: (index) => {
        this.actionMenuIndex = index;
        this.domViewDirty = true;
      },
      onConfirm: (kind) => {
        this.chooseAction(kind);
      },
      onSelectChoice: (index) => {
        this.handleSelectionChoice(index);
      },
    };
    renderSelectActionPhase(combatPanel, view, handlers);
  }

  /** Route a selection-list click (1-based index) to the active phase handler. */
  private handleSelectionChoice(index: number): void {
    switch (this.phase) {
      case "selectEnemyTarget":
        this.handleEnemyTargetKey(String(index));
        break;
      case "selectAllyTarget":
        this.handleAllyTargetKey(String(index));
        break;
      case "selectSpell":
        this.handleSpellKey(String(index));
        break;
      case "selectItem":
        this.handleItemKey(String(index));
        break;
    }
  }

  private handleEnemyTargetKey(key: string): void {
    const c = this.currentChar();
    if (!c) return;
    const enemies = this.livingEnemies();
    const idx = parseInt(key, 10);
    if (isNaN(idx) || idx < 1 || idx > enemies.length) return;
    const target = enemies[idx - 1];

    if (this.pending.kind === "cast") {
      this.actions.push({
        kind: "cast",
        actorId: c.id,
        spellId: this.pending.spellId!,
        targetInstanceId: target.instanceId,
      });
    } else {
      this.actions.push({
        kind: "attack",
        actorId: c.id,
        targetInstanceId: target.instanceId,
      });
    }
    this.currentCharIndex++;
    this.advanceToNextActor();
    this.phase = this.phase === "ready" ? "ready" : "selectAction";
    this.scene.flash = null;
  }

  private handleAllyTargetKey(key: string): void {
    const c = this.currentChar();
    if (!c) return;
    const allies = this.state.party.filter((p) => p.hp > 0 || p.status.includes("knockedOut"));
    const idx = parseInt(key, 10);
    if (isNaN(idx) || idx < 1 || idx > allies.length) return;
    const target = allies[idx - 1];

    if (this.pending.kind === "cast") {
      this.actions.push({
        kind: "cast",
        actorId: c.id,
        spellId: this.pending.spellId!,
        targetAllyId: target.id,
      });
    } else if (this.pending.kind === "item") {
      this.actions.push({
        kind: "item",
        actorId: c.id,
        itemId: this.pending.itemId!,
        targetAllyId: target.id,
      });
    }
    this.currentCharIndex++;
    this.advanceToNextActor();
    this.phase = this.phase === "ready" ? "ready" : "selectAction";
    this.scene.flash = null;
  }

  private handleSpellKey(key: string): void {
    const c = this.currentChar();
    if (!c) return;
    const knownSpells = c.knownSpellIds
      .map((id) => this.state.spells[id])
      .filter((s): s is SpellDef => s !== undefined);
    const idx = parseInt(key, 10);
    if (isNaN(idx) || idx < 1 || idx > knownSpells.length) return;
    const spell = knownSpells[idx - 1];
    this.pending.spellId = spell.id;

    if (spell.target === "singleEnemy") {
      this.phase = "selectEnemyTarget";
    } else if (spell.target === "singleAlly") {
      this.phase = "selectAllyTarget";
    } else {
      this.actions.push({
        kind: "cast",
        actorId: c.id,
        spellId: spell.id,
      });
      this.currentCharIndex++;
      this.advanceToNextActor();
      this.phase = this.phase === "ready" ? "ready" : "selectAction";
    }
    this.scene.flash = null;
  }

  private handleItemKey(key: string): void {
    const c = this.currentChar();
    if (!c) return;
    const items = this.availableItems();
    const idx = parseInt(key, 10);
    if (isNaN(idx) || idx < 1 || idx > items.length) return;
    const item = items[idx - 1].item;
    this.pending.itemId = item.id;
    this.phase = "selectAllyTarget";
    this.scene.flash = null;
  }

  // --- Round resolution ---------------------------------------------------

  private resolveRound(): void {
    this.state = resolveCombatRound(this.state, this.actions);
    this.scene.state = this.state;

    // Move enemies that died this round into the graveyard so the renderer
    // can play the death (rotate + fade) animation. The "defeated" anim is
    // pre-set here so it starts immediately, even though the "X is
    // destroyed." log message will be revealed later in the queue.
    const now = performance.now();
    for (const enemy of this.state.justDied) {
      this.scene.enemyGraveyard.push(enemy);
      setAnim(this.scene.enemyAnims, enemy.instanceId, "defeated", now);
    }
    this.state.justDied = [];

    // Do the same for summoned allies that were banished this round.
    for (const ally of this.state.justDiedAllies) {
      this.scene.allyGraveyard.push(ally);
      setAnim(this.scene.allyAnims, ally.id, "defeated", now);
    }
    this.state.justDiedAllies = [];

    // Start sequential message reveal for the new log entries.
    this.startMessageReveal();
  }

  // --- Helpers ------------------------------------------------------------

  private livingEnemies(): EnemyInstance[] {
    return [
      ...this.state.enemies.front.filter((e) => e.currentHp > 0),
      ...this.state.enemies.back.filter((e) => e.currentHp > 0),
    ];
  }

  private statusLabel(c: Character): string {
    if (c.status.length === 0) return "";
    return ` [${c.status.join(",")}]`;
  }

  // --- Prompt/selection text builders -------------------------------------

  private buildPrompt(): string {
    const enemies = this.livingEnemies();
    switch (this.phase) {
      case "selectAction": {
        const c = this.currentChar();
        if (c) {
          return `${c.name}: [↑↓] select · [Enter] confirm · [A]ttack [C]ast [D]efend [I]tem [F]lee${this.statusLabel(c)}`;
        }
        return "";
      }
      case "selectEnemyTarget":
        return `Select target (1-${enemies.length}):`;
      case "selectAllyTarget": {
        const allies = this.state.party.filter((p) => p.hp > 0 || p.status.includes("knockedOut"));
        return `Select ally (1-${allies.length}):`;
      }
      case "selectSpell":
        return "Select spell:";
      case "selectItem":
        return "Select item:";
      case "ready":
        return "Actions ready. Press [Space] to resolve round.";
      case "messageReveal":
        return "Press [Space] to advance...";
      case "roundResult":
        return `Round ${this.state.round} resolved. Press [Space] for next round.`;
      case "ended": {
        const resultLabel = this.state.result?.toUpperCase() ?? "ENDED";
        return `${resultLabel}! Press [Space] to continue.`;
      }
      default:
        return "";
    }
  }

  private buildSelectionList(): SelectionChoice[] | null {
    const c = this.currentChar();
    if (!c) return null;

    if (this.phase === "selectSpell") {
      const knownSpells = c.knownSpellIds
        .map((id) => this.state.spells[id])
        .filter((sp): sp is SpellDef => sp !== undefined);
      return knownSpells.map((sp, i) => ({
        index: i + 1,
        label: `${i + 1}.${sp.name}(${sp.spCost}SP)`,
      }));
    }

    if (this.phase === "selectItem") {
      const items = this.availableItems();
      return items.map(({ item, count }, i) => ({
        index: i + 1,
        label: `${i + 1}.${item.name} x${count}`,
      }));
    }

    if (this.phase === "selectEnemyTarget") {
      const enemies = this.livingEnemies();
      return enemies.map((e, i) => ({
        index: i + 1,
        label: `${i + 1}.${e.name} ${enemyHealthDescriptor(e.currentHp, e.hp)}`,
      }));
    }

    if (this.phase === "selectAllyTarget") {
      const allies = this.state.party.filter((p) => p.hp > 0 || p.status.includes("knockedOut"));
      return allies.map((a, i) => ({
        index: i + 1,
        label: `${i + 1}.${a.name} HP:${a.hp}/${a.maxHp}`,
      }));
    }

    return null;
  }
}
