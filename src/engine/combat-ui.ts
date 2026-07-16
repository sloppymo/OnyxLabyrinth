/**
 * FF6-style combat controller — per-actor instant resolve.
 *
 * Flow (hybrid rhythm — Wizardry initiative, FF6 experience):
 * 1. beginRound builds an AGI-initiative queue over all living combatants
 *    (party, summoned allies, enemies interleaved).
 * 2. The controller walks the queue. On a party member's turn the FF6 menu
 *    windows activate (Attack / Magic / Item / Defend / Run…); the moment an
 *    action is confirmed it resolves via resolvePlayerTurn and plays out on
 *    the scene canvas (walk → attack anim → damage popup). Enemy and ally
 *    turns auto-resolve and play the same way.
 * 3. When the queue is exhausted, endRound ticks statuses (poison popups)
 *    and a new round begins. No Space-gated message reveal anywhere.
 * 4. Victory / defeat / fled shows a centered result window; Enter exits.
 *
 * The scene canvas (combat-scene.ts) and the DOM windows
 * (combat-select-action-view.ts) are both visible for the whole fight.
 */

import {
  beginRound,
  resolvePlayerTurn,
  resolveEnemyTurn,
  resolveAllyTurn,
  endRound,
  enqueueNewAllies,
  type CombatState,
  type PlayerAction,
  type TurnQueueEntry,
  type EnemyInstance,
  type Row,
  type SummonedAlly,
} from "../game/combat";
import { enemyHealthDescriptor } from "./combat-display";
import type { Character } from "../game/party";
import { isUtilitySpell, type SpellDef } from "../data/spells";
import { enemyAbilityById } from "../data/enemy-abilities";
import { techniquesForClass, techniqueById, classHasTechniques, maxRageForLevel, type TechniqueDef } from "../data/techniques";
import type { ItemDef } from "../data/items";
import { combatCanvas, combatWindows } from "./shell";
import {
  createScene,
  renderScene,
  updateScene,
  playTurn,
  isPlaybackDone,
  absorbDeaths,
  skipPlaybackToEnd,
  type CombatScene,
} from "./combat-scene";
import {
  renderCombatWindows,
  playbackHintText,
  type CombatWindowsView,
  type CombatWindowsHandlers,
  type MenuEntry,
  type SelectionEntry,
  type ResultView,
} from "./combat-select-action-view";
import { buildPalette, type CombatPalette } from "./combat-action-palette";
import type { ControllerInputEvent, ControllerButton } from "./controller-input";
import { mapKeyboardKey } from "./controller-input";
import {
  preferredEnemyIndex,
  preferredAllyIndex,
  canRepeatAttack,
  lastHitEnemyIdFromEvents,
  repeatFailFlash,
  menuResourceLine,
  type StickyAction,
  type LastCommand,
} from "./combat-flow";

type Phase =
  | "palette"
  | "selectTarget"
  | "selectSpell"
  | "selectTechnique"
  | "selectItem"
  | "playback"
  | "result";

interface PendingAction {
  kind: PlayerAction["kind"];
  spellId?: string;
  techniqueId?: string;
  itemId?: string;
}

export interface CombatControllerOptions {
  onEnd: (result: CombatState) => void;
  /** Optional baked corridor backdrop canvas. When null, the static
   *  combat-bg.png image is used instead. */
  backdrop?: HTMLCanvasElement | null;
  /** Last-used device class for input-adaptive HUD hints. */
  getLastInputKind?: () => "keyboard" | "gamepad";
}

export class CombatController {
  private state: CombatState;
  private onEnd: (result: CombatState) => void;

  private phase: Phase = "playback";
  private queue: TurnQueueEntry[] = [];
  private queueIndex = 0;
  /** Set while the endRound playback is running (next step: new round). */
  private roundEnding = false;

  private currentActorId: string | null = null;
  private pending: PendingAction | null = null;
  private palette: CombatPalette | null = null;
  private selectionTitle = "";
  private selectionEntries: SelectionEntry[] = [];
  private selectionIndex = 0;
  /** Ids behind selectionEntries (enemy instance ids / ally ids / spell ids / item ids / rows). */
  private selectionIds: string[] = [];
  private targetKind: "enemy" | "ally" | "row" = "enemy";
  private flash: string | null = null;
  private result: ResultView | null = null;

  /** Party-shared last enemy hit/missed this combat (for target prefocus). */
  private lastHitEnemyId: string | null = null;
  /** Per-character sticky Attack/Ambush for Repeat. */
  private stickyByActor = new Map<string, StickyAction>();
  /** Hold-Shift 2× playback. */
  private shiftHeld = false;
  /** Sticky Auto-Fast for the rest of this combat. */
  private autoFast = false;
  /** Bravely-style party Auto — replay last commands. */
  private partyAuto = false;
  /** Per-character last command for party Auto (never Flee/Item). */
  private lastCommandByActor = new Map<string, LastCommand>();
  /** LT/RT roster inspect — visual only, never changes initiative. */
  private inspectCharacterId: string | null = null;

  private scene: CombatScene;
  private rafId: number | null = null;
  private windowsDirty = true;
  private getLastInputKind: () => "keyboard" | "gamepad";

  constructor(state: CombatState, opts: CombatControllerOptions) {
    this.state = state;
    this.onEnd = opts.onEnd;
    this.getLastInputKind = opts.getLastInputKind ?? (() => "keyboard");
    this.scene = createScene(state);
    this.scene.backdrop = opts.backdrop ?? null;
    this.startRound();
    this.startRenderLoop();
  }

  /** Destroy the controller — cancel the render loop and clear the windows. */
  destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    combatWindows.innerHTML = "";
  }

  // --- Render loop ----------------------------------------------------------

  private startRenderLoop(): void {
    const loop = () => {
      this.tick();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private tick(): void {
    const now = performance.now();
    this.syncPlaybackRate();
    updateScene(this.scene, now);

    if (this.phase === "playback" && isPlaybackDone(this.scene, now)) {
      this.afterPlayback();
    }

    if (this.windowsDirty) {
      this.renderWindows();
      this.windowsDirty = false;
    }

    const ctx = combatCanvas.getContext("2d")!;
    renderScene(ctx, combatCanvas.width, combatCanvas.height, this.scene, now);
  }

  /** Apply hold-Shift / sticky FAST to the scene clock (playback only). */
  private syncPlaybackRate(): void {
    const turbo =
      this.phase === "playback" && (this.shiftHeld || this.autoFast);
    this.scene.playbackRate = turbo ? 2 : 1;
    this.scene.showFastCue = this.phase !== "result" && this.autoFast;
    this.scene.showAutoCue = this.phase !== "result" && this.partyAuto;
  }

  // --- Round / turn machine ---------------------------------------------------

  private startRound(): void {
    const { state, queue } = beginRound(this.state);
    this.state = state;
    this.scene.state = state;
    this.queue = queue;
    this.queueIndex = 0;
    this.roundEnding = false;
    this.nextTurn();
  }

  /** Advance to the next turn in the queue (or end the round). */
  private nextTurn(): void {
    if (this.state.ended) {
      this.showResult();
      return;
    }

    if (this.queueIndex >= this.queue.length) {
      // Round over: run end-of-round ticks and play them out.
      this.roundEnding = true;
      this.resolveAndPlay(() => endRound(this.state));
      return;
    }

    const entry = this.queue[this.queueIndex++];

    if (entry.kind === "player") {
      const c = this.state.party.find((p) => p.id === entry.id);
      if (!c || c.hp <= 0) {
        this.nextTurn();
        return;
      }
      if (c.status.includes("sleep") || c.status.includes("paralysis")) {
        // Incapacitated: auto-resolve (logs the skip) and play it.
        this.resolveAndPlay(() =>
          resolvePlayerTurn(this.state, { kind: "defend", actorId: c.id })
        );
        return;
      }
      this.openPaletteFor(c);
      return;
    }

    if (entry.kind === "enemy") {
      const alive = this.findEnemy(entry.id);
      if (!alive || alive.currentHp <= 0) {
        this.nextTurn();
        return;
      }
      this.resolveAndPlay(() => resolveEnemyTurn(this.state, entry.id));
      return;
    }

    // Summoned ally.
    const ally = this.state.summonedAllies.find((a) => a.id === entry.id);
    if (!ally || ally.hp <= 0) {
      this.nextTurn();
      return;
    }
    this.resolveAndPlay(() => resolveAllyTurn(this.state, entry.id));
  }

  /** Resolve a turn via `fn`, then play its events on the scene. */
  private resolveAndPlay(fn: () => CombatState): void {
    const prevLogLength = this.state.log.length;
    const next = fn();
    const events = next.events.slice(prevLogLength);
    this.state = next;
    absorbDeaths(this.scene, next);

    // Allies summoned by this turn (BAMORDI/SOCORDI) act later this round,
    // matching the round-based resolver's player → ally → enemy phasing.
    this.queue = enqueueNewAllies(this.queue, this.queueIndex, next);

    // Party-shared last-hit memory for target prefocus.
    const partyIds = new Set(this.state.party.map((p) => p.id));
    const hitId = lastHitEnemyIdFromEvents(events, partyIds);
    if (hitId) this.lastHitEnemyId = hitId;

    // Clear a stale spell banner from the previous turn.
    this.scene.banner = null;

    this.currentActorId = null;
    this.scene.activeActorId = null;
    this.scene.cursor = null;
    this.pending = null;
    this.flash = null;
    this.phase = "playback";
    this.syncPlaybackRate();
    this.windowsDirty = true;

    playTurn(
      this.scene,
      events,
      // Banner name lookup: spells, items, then enemy abilities.
      (id) =>
        this.state.spells[id]?.name ??
        this.state.items[id]?.name ??
        enemyAbilityById(id)?.name ??
        id,
      performance.now(),
      combatCanvas.width,
      combatCanvas.height,
      // Technique name lookup for technique banner.
      (id) => techniqueById(id)?.name ?? id
    );
  }

  private rememberStickyAttack(
    kind: "attack" | "ambush",
    actorId: string,
    targetId: string
  ): void {
    this.stickyByActor.set(actorId, { kind, actorId, targetId });
    this.lastCommandByActor.set(actorId, { kind, targetId });
  }

  private rememberLastCommand(actorId: string, cmd: LastCommand): void {
    this.lastCommandByActor.set(actorId, cmd);
  }

  private fireAttackLike(
    kind: "attack" | "ambush",
    actorId: string,
    targetInstanceId: string
  ): void {
    this.rememberStickyAttack(kind, actorId, targetInstanceId);
    this.resolveAndPlay(() =>
      resolvePlayerTurn(this.state, { kind, actorId, targetInstanceId })
    );
  }

  /**
   * Bravely Auto: replay last command for this character. Falls back to
   * Attack (preferred target) or Defend. Never Flee. Returns true if an
   * action was resolved (skip opening the menu).
   */
  private tryPartyAuto(c: Character): boolean {
    if (!this.partyAuto) return false;

    const cmd = this.lastCommandByActor.get(c.id);
    const living = this.livingEnemies();
    const fallbackAttack = (): void => {
      if (living.length === 0) {
        this.rememberLastCommand(c.id, { kind: "defend" });
        this.resolveAndPlay(() =>
          resolvePlayerTurn(this.state, { kind: "defend", actorId: c.id })
        );
        return;
      }
      const idx = preferredEnemyIndex(living, this.lastHitEnemyId);
      this.fireAttackLike("attack", c.id, living[idx].instanceId);
    };

    if (!cmd) {
      fallbackAttack();
      return true;
    }

    switch (cmd.kind) {
      case "attack":
      case "ambush": {
        if (living.some((e) => e.instanceId === cmd.targetId)) {
          this.fireAttackLike(cmd.kind, c.id, cmd.targetId);
        } else {
          fallbackAttack();
        }
        return true;
      }
      case "defend":
        this.resolveAndPlay(() =>
          resolvePlayerTurn(this.state, { kind: "defend", actorId: c.id })
        );
        return true;
      case "hide":
        if (c.class === "Thief" && !c.status.includes("hidden")) {
          this.rememberLastCommand(c.id, { kind: "hide" });
          this.resolveAndPlay(() =>
            resolvePlayerTurn(this.state, { kind: "hide", actorId: c.id })
          );
        } else if (
          c.class === "Thief" &&
          c.status.includes("hidden") &&
          living.length > 0
        ) {
          const idx = preferredEnemyIndex(living, this.lastHitEnemyId);
          this.fireAttackLike("ambush", c.id, living[idx].instanceId);
        } else {
          fallbackAttack();
        }
        return true;
      case "cast": {
        const spell = this.state.spells[cmd.spellId];
        if (
          !spell ||
          c.sp < spell.spCost ||
          this.state.silencedThisRound.includes(c.id) ||
          !c.knownSpellIds.includes(cmd.spellId)
        ) {
          fallbackAttack();
          return true;
        }
        if (
          cmd.targetInstanceId &&
          !living.some((e) => e.instanceId === cmd.targetInstanceId)
        ) {
          fallbackAttack();
          return true;
        }
        if (cmd.targetAllyId) {
          const allyOk = this.state.party.some(
            (p) =>
              p.id === cmd.targetAllyId &&
              (p.hp > 0 || p.status.includes("knockedOut"))
          );
          if (!allyOk) {
            fallbackAttack();
            return true;
          }
        }
        this.rememberLastCommand(c.id, cmd);
        this.resolveAndPlay(() =>
          resolvePlayerTurn(this.state, {
            kind: "cast",
            actorId: c.id,
            spellId: cmd.spellId,
            targetInstanceId: cmd.targetInstanceId,
            targetAllyId: cmd.targetAllyId,
            targetRow: cmd.targetRow,
          })
        );
        return true;
      }
      case "technique": {
        const tech = techniqueById(cmd.techniqueId);
        const rage = this.currentRage(c);
        if (!tech || rage < tech.rageCost) {
          fallbackAttack();
          return true;
        }
        if (
          cmd.targetInstanceId &&
          !living.some((e) => e.instanceId === cmd.targetInstanceId)
        ) {
          fallbackAttack();
          return true;
        }
        this.rememberLastCommand(c.id, cmd);
        this.resolveAndPlay(() =>
          resolvePlayerTurn(this.state, {
            kind: "technique",
            actorId: c.id,
            techniqueId: cmd.techniqueId,
            targetInstanceId: cmd.targetInstanceId,
            targetAllyId: cmd.targetAllyId,
            targetRow: cmd.targetRow,
          })
        );
        return true;
      }
    }
  }

  /** Called when the current playback finishes. */
  private afterPlayback(): void {
    if (this.phase !== "playback") return;
    if (this.state.ended) {
      this.showResult();
      return;
    }
    if (this.roundEnding) {
      this.startRound();
      return;
    }
    this.nextTurn();
  }

  private openPaletteFor(c: Character): void {
    this.syncPlaybackRate();
    if (this.tryPartyAuto(c)) return;

    this.phase = "palette";
    this.currentActorId = c.id;
    this.scene.activeActorId = c.id;
    this.palette = buildPalette(c, this.knownSpells(c), this.availableItems(), {
      silenced: this.state.silencedThisRound.includes(c.id),
      currentSp: c.sp,
      currentRage: classHasTechniques(c.class) ? this.currentRage(c) : undefined,
    });
    this.pending = null;
    this.flash = null;
    this.inspectCharacterId = null;
    this.windowsDirty = true;
  }

  /** Cycle party-strip inspect highlight (LT/RT). Does not change the actor. */
  private cycleInspect(dir: -1 | 1): void {
    if (
      this.phase !== "palette" &&
      this.phase !== "selectTarget" &&
      this.phase !== "selectSpell" &&
      this.phase !== "selectItem" &&
      this.phase !== "selectTechnique"
    ) {
      return;
    }
    const party = this.state.party;
    if (party.length <= 1) return;

    const ids = party.map((p) => p.id);
    const actorIdx = this.currentActorId ? ids.indexOf(this.currentActorId) : 0;
    let idx = actorIdx >= 0 ? actorIdx : 0;
    if (this.inspectCharacterId) {
      const found = ids.indexOf(this.inspectCharacterId);
      if (found >= 0) idx = found;
    }

    const next = (idx + dir + party.length) % party.length;
    if (ids[next] === this.currentActorId) {
      this.inspectCharacterId = null;
    } else {
      this.inspectCharacterId = ids[next];
    }
    this.windowsDirty = true;
  }

  private currentChar(): Character | undefined {
    return this.state.party.find((p) => p.id === this.currentActorId);
  }

  private findEnemy(instanceId: string): EnemyInstance | undefined {
    return (
      this.state.enemies.front.find((e) => e.instanceId === instanceId) ??
      this.state.enemies.back.find((e) => e.instanceId === instanceId)
    );
  }

  private livingEnemies(): EnemyInstance[] {
    return [
      ...this.state.enemies.front.filter((e) => e.currentHp > 0),
      ...this.state.enemies.back.filter((e) => e.currentHp > 0),
    ];
  }

  private targetableAllies(): Character[] {
    return this.state.party.filter(
      (p) => p.hp > 0 || p.status.includes("knockedOut")
    );
  }

  /** Living summons, targetable only by single-target heal spells. */
  private targetableSummons(): SummonedAlly[] {
    if (this.pending?.kind !== "cast" || !this.pending.spellId) return [];
    const spell = this.state.spells[this.pending.spellId];
    if (!spell || spell.target !== "singleAlly" || spell.effect.kind !== "heal") {
      return [];
    }
    return this.state.summonedAllies.filter((a) => a.hp > 0);
  }

  private availableItems(): { item: ItemDef; count: number }[] {
    return Object.entries(this.state.inventory)
      .filter(([, count]) => count > 0)
      .map(([id, count]) => ({ item: this.state.items[id], count }))
      .filter(
        (entry): entry is { item: ItemDef; count: number } =>
          entry.item !== undefined && entry.item.type === "consumable"
      );
  }

  private knownSpells(c: Character): SpellDef[] {
    // Utility spells (light/levitation/detect) are dungeon-only — hidden
    // here so they can't burn a combat turn with no effect.
    return c.knownSpellIds
      .map((id) => this.state.spells[id])
      .filter((s): s is SpellDef => s !== undefined && !isUtilitySpell(s));
  }

  private knownTechniques(c: Character): TechniqueDef[] {
    return techniquesForClass(c.class, c.level);
  }

  /** Current rage for the acting character. */
  private currentRage(c: Character): number {
    return this.state.rage[c.id] ?? 0;
  }

  /** Confirm a top-level menu choice. */
  private chooseAction(kind: MenuEntry["kind"]): void {
    const c = this.currentChar();
    if (!c) return;
    this.flash = null;

    if (kind === "repeat") {
      this.tryRepeat(c);
      return;
    }

    switch (kind) {
      case "attack":
      case "ambush": {
        const enemies = this.livingEnemies();
        if (enemies.length === 0) {
          this.setFlash("No target!");
          return;
        }
        this.pending = { kind };
        // Single living enemy: skip target tourism.
        if (enemies.length === 1) {
          this.fireAttackLike(kind, c.id, enemies[0].instanceId);
          return;
        }
        this.openTargetSelect("enemy");
        return;
      }
      case "cast": {
        const spells = this.knownSpells(c);
        if (spells.length === 0) {
          this.setFlash("No magic!");
          return;
        }
        if (this.state.silencedThisRound.includes(c.id)) {
          this.setFlash("Silenced!");
          return;
        }
        this.pending = { kind };
        this.openSpellSelect(c);
        return;
      }
      case "technique": {
        const techs = this.knownTechniques(c);
        if (techs.length === 0) {
          this.setFlash("No techniques!");
          return;
        }
        this.pending = { kind };
        this.openTechniqueSelect(c);
        return;
      }
      case "item": {
        const items = this.availableItems();
        if (items.length === 0) {
          this.setFlash("No items!");
          return;
        }
        this.pending = { kind };
        this.openItemSelect();
        return;
      }
      case "defend":
        this.rememberLastCommand(c.id, { kind: "defend" });
        this.resolveAndPlay(() =>
          resolvePlayerTurn(this.state, { kind: "defend", actorId: c.id })
        );
        return;
      case "hide":
        this.rememberLastCommand(c.id, { kind: "hide" });
        this.resolveAndPlay(() =>
          resolvePlayerTurn(this.state, { kind: "hide", actorId: c.id })
        );
        return;
      case "flee":
        // Never store Flee for Auto — intentional escape only.
        this.resolveAndPlay(() =>
          resolvePlayerTurn(this.state, { kind: "flee", actorId: c.id })
        );
        return;
    }
  }

  private tryRepeat(c: Character): void {
    const sticky = this.stickyByActor.get(c.id);
    const living = this.livingEnemies();
    const check = canRepeatAttack(
      sticky,
      c.id,
      living.map((e) => e.instanceId)
    );
    if (!check.ok) {
      this.setFlash(repeatFailFlash(check.reason));
      return;
    }
    // sticky is defined when ok
    this.fireAttackLike(sticky!.kind, c.id, sticky!.targetId);
  }

  private setFlash(text: string): void {
    this.flash = text;
    this.windowsDirty = true;
  }

  // --- Selection submenus --------------------------------------------------------

  private openTargetSelect(kind: "enemy" | "ally"): void {
    this.targetKind = kind;
    this.phase = "selectTarget";
    this.selectionTitle = "Target";
    if (kind === "enemy") {
      // Names only, FF6-style — the scene cursor marks the candidate, and
      // the narrow menu window can't fit a health descriptor column.
      const enemies = this.livingEnemies();
      this.selectionIds = enemies.map((e) => e.instanceId);
      this.selectionEntries = enemies.map((e) => ({ label: e.name }));
      this.selectionIndex = preferredEnemyIndex(enemies, this.lastHitEnemyId);
    } else {
      const allies = this.targetableAllies();
      this.selectionIds = allies.map((a) => a.id);
      this.selectionEntries = allies.map((a) => ({
        label: a.name,
        detail: `${Math.max(0, a.hp)}/${a.maxHp}`,
      }));
      // Single-target heals can also mend summoned allies; list them after
      // the party (cure/resurrect/items stay party-only — summons have no
      // statuses to clear).
      for (const a of this.targetableSummons()) {
        this.selectionIds.push(a.id);
        this.selectionEntries.push({
          label: a.name,
          detail: `${Math.max(0, a.hp)}/${a.maxHp}`,
        });
      }
      // Prefocus among party allies only (summons appended after).
      this.selectionIndex = preferredAllyIndex(
        allies.map((a) => ({ id: a.id, hp: a.hp, maxHp: a.maxHp }))
      );
    }
    this.syncTargetCursor();
    this.windowsDirty = true;
  }

  private openSpellSelect(c: Character): void {
    this.phase = "selectSpell";
    this.selectionTitle = "Magic";
    const spells = this.knownSpells(c);
    this.selectionIds = spells.map((s) => s.id);
    this.selectionEntries = spells.map((s) => ({
      label: s.name,
      detail: `${s.spCost} SP`,
      disabled: c.sp < s.spCost,
    }));
    this.selectionIndex = 0;
    this.windowsDirty = true;
  }

  private openTechniqueSelect(c: Character): void {
    this.phase = "selectTechnique";
    this.selectionTitle = "Technique";
    const techs = this.knownTechniques(c);
    const rage = this.currentRage(c);
    this.selectionIds = techs.map((t) => t.id);
    this.selectionEntries = techs.map((t) => ({
      label: t.name,
      detail: `${t.rageCost} RG`,
      disabled: rage < t.rageCost,
    }));
    this.selectionIndex = 0;
    this.windowsDirty = true;
  }

  /** Row selection for row-targeted spells (FRACTURIS fizzle field). */
  private openRowSelect(): void {
    this.targetKind = "row";
    this.phase = "selectTarget";
    this.selectionTitle = "Target row";
    const backAlive = this.state.enemies.back.some((e) => e.currentHp > 0);
    this.selectionIds = backAlive ? ["front", "back"] : ["front"];
    this.selectionEntries = this.selectionIds.map((r) => ({
      label: r === "front" ? "Front row" : "Back row",
    }));
    this.selectionIndex = 0;
    this.scene.cursor = null;
    this.windowsDirty = true;
  }

  private openItemSelect(): void {
    this.phase = "selectItem";
    this.selectionTitle = "Item";
    const items = this.availableItems();
    this.selectionIds = items.map(({ item }) => item.id);
    this.selectionEntries = items.map(({ item, count }) => ({
      label: item.name,
      detail: `×${count}`,
    }));
    this.selectionIndex = 0;
    this.windowsDirty = true;
  }

  /** Keep the scene target cursor in sync with the highlighted candidate. */
  private syncTargetCursor(): void {
    if (this.phase !== "selectTarget" || this.targetKind === "row") {
      this.scene.cursor = null;
      return;
    }
    const id = this.selectionIds[this.selectionIndex];
    if (!id) {
      this.scene.cursor = null;
      return;
    }
    const kind =
      this.targetKind === "enemy"
        ? "enemy"
        : this.state.summonedAllies.some((a) => a.id === id)
          ? "ally"
          : "party";
    this.scene.cursor = { kind, id };
  }

  /** Confirm the highlighted selection entry. */
  private confirmSelection(): void {
    const c = this.currentChar();
    if (!c || !this.pending) return;
    const id = this.selectionIds[this.selectionIndex];
    if (!id) return;

    if (this.phase === "selectSpell") {
      const entry = this.selectionEntries[this.selectionIndex];
      if (entry?.disabled) {
        this.setFlash("Not enough SP!");
        return;
      }
      this.pending.spellId = id;
      const spell = this.state.spells[id];
      if (spell?.target === "singleEnemy") {
        const enemies = this.livingEnemies();
        if (enemies.length === 1) {
          this.rememberLastCommand(c.id, {
            kind: "cast",
            spellId: id,
            targetInstanceId: enemies[0].instanceId,
          });
          this.resolveAndPlay(() =>
            resolvePlayerTurn(this.state, {
              kind: "cast",
              actorId: c.id,
              spellId: id,
              targetInstanceId: enemies[0].instanceId,
            })
          );
        } else {
          this.openTargetSelect("enemy");
        }
      } else if (spell?.target === "singleAlly") {
        this.openTargetSelect("ally");
      } else if (spell?.effect.kind === "fizzleField") {
        // BACORTU targets one enemy row — ask which.
        this.openRowSelect();
      } else {
        // Group / self / all spells need no target.
        this.rememberLastCommand(c.id, { kind: "cast", spellId: id });
        this.resolveAndPlay(() =>
          resolvePlayerTurn(this.state, {
            kind: "cast",
            actorId: c.id,
            spellId: id,
          })
        );
      }
      return;
    }

    if (this.phase === "selectTechnique") {
      const entry = this.selectionEntries[this.selectionIndex];
      if (entry?.disabled) {
        this.setFlash("Not enough rage!");
        return;
      }
      this.pending.techniqueId = id;
      const tech = this.knownTechniques(c).find((t) => t.id === id);
      if (!tech) return;
      // Determine target selection based on technique target type.
      if (tech.target === "singleEnemy") {
        const enemies = this.livingEnemies();
        if (enemies.length === 1) {
          this.rememberLastCommand(c.id, {
            kind: "technique",
            techniqueId: id,
            targetInstanceId: enemies[0].instanceId,
          });
          this.resolveAndPlay(() =>
            resolvePlayerTurn(this.state, {
              kind: "technique",
              actorId: c.id,
              techniqueId: id,
              targetInstanceId: enemies[0].instanceId,
            })
          );
        } else {
          this.openTargetSelect("enemy");
        }
      } else if (tech.target === "singleAlly") {
        this.openTargetSelect("ally");
      } else if (tech.target === "rowEnemies") {
        this.openRowSelect();
      } else if (tech.target === "columnEnemies") {
        // Column targeting: pick an enemy, we'll derive the column from its position.
        this.openTargetSelect("enemy");
      } else {
        // self / allEnemies / allFrontEnemies / allAllies / allFrontAllies / randomEnemies
        this.rememberLastCommand(c.id, { kind: "technique", techniqueId: id });
        this.resolveAndPlay(() =>
          resolvePlayerTurn(this.state, {
            kind: "technique",
            actorId: c.id,
            techniqueId: id,
          })
        );
      }
      return;
    }

    if (this.phase === "selectItem") {
      this.pending.itemId = id;
      this.openTargetSelect("ally");
      return;
    }

    if (this.phase === "selectTarget") {
      const pending = this.pending;
      if (this.targetKind === "row" && pending.kind === "cast" && pending.spellId) {
        const spellId = pending.spellId;
        this.rememberLastCommand(c.id, {
          kind: "cast",
          spellId,
          targetRow: id as Row,
        });
        this.resolveAndPlay(() =>
          resolvePlayerTurn(this.state, {
            kind: "cast",
            actorId: c.id,
            spellId,
            targetRow: id as Row,
          })
        );
        return;
      }
      // Row selection for row-targeted techniques (Sweep, Phalanx Break).
      if (this.targetKind === "row" && pending.kind === "technique" && pending.techniqueId) {
        const techniqueId = pending.techniqueId;
        this.rememberLastCommand(c.id, {
          kind: "technique",
          techniqueId,
          targetRow: id as Row,
        });
        this.resolveAndPlay(() =>
          resolvePlayerTurn(this.state, {
            kind: "technique",
            actorId: c.id,
            techniqueId,
            targetRow: id as Row,
          })
        );
        return;
      }
      if (pending.kind === "attack") {
        this.fireAttackLike("attack", c.id, id);
      } else if (pending.kind === "ambush") {
        this.fireAttackLike("ambush", c.id, id);
      } else if (pending.kind === "cast" && pending.spellId) {
        const action: PlayerAction =
          this.targetKind === "enemy"
            ? {
                kind: "cast",
                actorId: c.id,
                spellId: pending.spellId,
                targetInstanceId: id,
              }
            : {
                kind: "cast",
                actorId: c.id,
                spellId: pending.spellId,
                targetAllyId: id,
              };
        this.rememberLastCommand(c.id, {
          kind: "cast",
          spellId: pending.spellId,
          targetInstanceId: action.targetInstanceId,
          targetAllyId: action.targetAllyId,
        });
        this.resolveAndPlay(() => resolvePlayerTurn(this.state, action));
      } else if (pending.kind === "item" && pending.itemId) {
        // Items are never stored for Auto (consumables).
        const itemId = pending.itemId;
        this.resolveAndPlay(() =>
          resolvePlayerTurn(this.state, {
            kind: "item",
            actorId: c.id,
            itemId,
            targetAllyId: id,
          })
        );
      } else if (pending.kind === "technique" && pending.techniqueId) {
        const techniqueId = pending.techniqueId;
        const action: PlayerAction =
          this.targetKind === "enemy"
            ? {
                kind: "technique",
                actorId: c.id,
                techniqueId,
                targetInstanceId: id,
              }
            : {
                kind: "technique",
                actorId: c.id,
                techniqueId,
                targetAllyId: id,
              };
        this.rememberLastCommand(c.id, {
          kind: "technique",
          techniqueId,
          targetInstanceId: action.targetInstanceId,
          targetAllyId: action.targetAllyId,
        });
        this.resolveAndPlay(() => resolvePlayerTurn(this.state, action));
      }
    }
  }

  /** Step back from a submenu to the action menu. */
  private backToMenu(): void {
    const c = this.currentChar();
    if (!c) return;
    this.scene.cursor = null;
    if (this.phase === "selectTarget" && this.pending?.kind === "cast") {
      // Back out of target selection into the spell list.
      this.openSpellSelect(c);
      return;
    }
    if (this.phase === "selectTarget" && this.pending?.kind === "technique") {
      // Back out of target selection into the technique list.
      this.openTechniqueSelect(c);
      return;
    }
    if (this.phase === "selectTechnique") {
      this.phase = "palette";
      this.pending = null;
      this.windowsDirty = true;
      return;
    }
    if (this.phase === "selectTarget" && this.pending?.kind === "item") {
      this.openItemSelect();
      return;
    }
    this.phase = "palette";
    this.pending = null;
    this.windowsDirty = true;
  }

  // --- Result --------------------------------------------------------------------

  private showResult(): void {
    this.phase = "result";
    this.currentActorId = null;
    this.scene.activeActorId = null;
    this.scene.cursor = null;
    this.inspectCharacterId = null;
    // Victory is sacred — clear turbo affordances so Enter only confirms.
    this.autoFast = false;
    this.shiftHeld = false;
    this.partyAuto = false;
    this.syncPlaybackRate();

    const r = this.state.result;
    if (r === "victory") {
      this.result = {
        title: "Victory!",
        lines: [
          `Got ${this.state.goldEarned} gold`,
          `${this.state.xpEarned} XP each`,
        ],
      };
    } else if (r === "fled") {
      this.result = { title: "Escaped", lines: [] };
    } else {
      this.result = {
        title: "Annihilated...",
        lines: ["The party retreats to the entrance."],
      };
    }
    this.windowsDirty = true;
  }

  // --- Input ----------------------------------------------------------------------

  /** Current phase (for main.ts playback key routing). */
  getPhase(): Phase {
    return this.phase;
  }

  /**
   * Primary input path — normalized controller / keyboard face buttons.
   */
  handleInput(event: ControllerInputEvent): void {
    if (this.phase === "result") {
      if (event.kind === "press" && event.button === "a") {
        this.destroy();
        this.onEnd(this.state);
      }
      return;
    }

    if (this.phase === "playback") {
      if (event.kind === "hold" && event.button === "lt") {
        this.shiftHeld = true;
        this.syncPlaybackRate();
        return;
      }
      if (event.kind === "release" && event.button === "lt") {
        this.shiftHeld = false;
        this.syncPlaybackRate();
        return;
      }
      if (event.kind !== "press") return;
      if (event.button === "start") {
        this.togglePartyAuto();
        return;
      }
      if (event.button === "y") {
        this.autoFast = !this.autoFast;
        this.syncPlaybackRate();
        this.windowsDirty = true;
        return;
      }
      if (event.button === "b") {
        skipPlaybackToEnd(this.scene, performance.now());
        this.windowsDirty = true;
        return;
      }
      return;
    }

    switch (this.phase) {
      case "palette":
        this.handlePaletteInput(event);
        return;
      case "selectTarget":
      case "selectSpell":
      case "selectItem":
      case "selectTechnique":
        if (event.kind === "press") {
          if (event.button === "lt") {
            this.cycleInspect(-1);
            return;
          }
          if (event.button === "rt") {
            this.cycleInspect(1);
            return;
          }
        }
        this.handleSelectionInput(event);
        return;
    }
  }

  private togglePartyAuto(): void {
    if (this.phase === "result") return;
    this.partyAuto = !this.partyAuto;
    this.syncPlaybackRate();
    this.windowsDirty = true;
    if (this.partyAuto && this.phase === "palette") {
      const c = this.currentChar();
      if (c && this.tryPartyAuto(c)) return;
    }
  }

  private handlePaletteInput(event: ControllerInputEvent): void {
    const c = this.currentChar();
    if (!c || !this.palette) return;

    if (event.kind === "hold" && event.button === "b") {
      this.chooseAction("flee");
      return;
    }
    if (event.kind !== "press") return;

    switch (event.button) {
      case "a":
        this.chooseAction("attack");
        return;
      case "b":
        this.chooseAction("defend");
        return;
      case "x": {
        if (this.state.silencedThisRound.includes(c.id)) {
          this.setFlash("Silenced!");
          return;
        }
        const cast = this.palette.slots.find((s) => s.kind === "cast");
        if (cast && "disabled" in cast && cast.disabled) {
          this.setFlash("No magic!");
        } else {
          this.chooseAction("cast");
        }
        return;
      }
      case "y": {
        const skill = this.palette.slots.find((s) => s.kind === "skill");
        if (skill && "disabled" in skill && skill.disabled) {
          this.setFlash("No skills!");
        } else if (c.class === "Thief") {
          this.chooseAction(c.status.includes("hidden") ? "ambush" : "hide");
        } else {
          this.chooseAction("technique");
        }
        return;
      }
      case "select":
        this.chooseAction("item");
        return;
      case "start":
        this.togglePartyAuto();
        return;
      case "lt":
        this.cycleInspect(-1);
        return;
      case "rt":
        this.cycleInspect(1);
        return;
    }
  }

  private handleSelectionInput(event: ControllerInputEvent): void {
    const len = this.selectionEntries.length;
    if (len === 0) {
      this.backToMenu();
      return;
    }
    if (event.kind !== "press") return;

    switch (event.button) {
      case "up":
        this.selectionIndex = (this.selectionIndex - 1 + len) % len;
        this.syncTargetCursor();
        this.windowsDirty = true;
        return;
      case "down":
        this.selectionIndex = (this.selectionIndex + 1) % len;
        this.syncTargetCursor();
        this.windowsDirty = true;
        return;
      case "a":
        this.confirmSelection();
        return;
      case "b":
        this.backToMenu();
        return;
      case "lb":
      case "rb":
        if (this.phase === "selectTarget") {
          const dir = event.button === "lb" ? -1 : 1;
          this.selectionIndex = (this.selectionIndex + dir + len) % len;
          this.syncTargetCursor();
          this.windowsDirty = true;
        }
        return;
    }
  }

  private paletteSlotAction(slotIndex: number): void {
    const buttons: ControllerButton[] = ["a", "b", "x", "y"];
    const button = buttons[slotIndex];
    if (button) this.handleInput({ kind: "press", button });
  }

  /**
   * Legacy keydown path — playback/meta keys and keyboard fallbacks.
   */
  handleKey(key: string, e?: KeyboardEvent): void {
    if (this.phase !== "result" && (key === "q" || key === "Q")) {
      this.togglePartyAuto();
      return;
    }

    if (this.phase === "playback") {
      if (key === "Shift" || e?.key === "Shift") {
        this.shiftHeld = true;
        this.syncPlaybackRate();
        return;
      }
      if (key === "Tab") {
        e?.preventDefault();
        this.autoFast = !this.autoFast;
        this.syncPlaybackRate();
        this.windowsDirty = true;
        return;
      }
      if (key === "Escape") {
        skipPlaybackToEnd(this.scene, performance.now());
        this.windowsDirty = true;
        return;
      }
      return;
    }

    if (this.phase === "result") {
      if (key === " " || key === "Enter") {
        this.destroy();
        this.onEnd(this.state);
      }
      return;
    }

    if ((key === "z" || key === ".") && this.phase === "palette") {
      const c = this.currentChar();
      if (c) this.tryRepeat(c);
      return;
    }

    // Legacy letter shortcuts (m/t/i/r/h/c) not on the face-button map.
    if (this.phase === "palette") {
      const lower = key.toLowerCase();
      const shortcuts: Record<string, PlayerAction["kind"]> = {
        t: "technique",
        c: "cast",
        m: "cast",
        i: "item",
        f: "flee",
        r: "flee",
        h: "hide",
      };
      const kind = shortcuts[lower];
      if (kind) {
        this.chooseAction(kind);
        return;
      }
    }

    const button = mapKeyboardKey(key);
    if (button) {
      this.handleInput({ kind: "press", button });
      return;
    }

    if (
      this.phase === "selectTarget" ||
      this.phase === "selectSpell" ||
      this.phase === "selectItem" ||
      this.phase === "selectTechnique"
    ) {
      const n = parseInt(key, 10);
      if (!isNaN(n) && n >= 1 && n <= this.selectionEntries.length) {
        this.selectionIndex = n - 1;
        this.syncTargetCursor();
        this.confirmSelection();
      }
    }
  }

  /** Keyup — release hold-Shift 2×. */
  handleKeyUp(key: string): void {
    if (key === "Shift") {
      this.shiftHeld = false;
      this.syncPlaybackRate();
    }
  }

  // --- Windows -------------------------------------------------------------------

  private renderWindows(): void {
    const menuMode =
      this.phase === "palette"
        ? "palette"
        : this.phase === "selectTarget" ||
            this.phase === "selectSpell" ||
            this.phase === "selectItem" ||
            this.phase === "selectTechnique"
          ? "selection"
          : "none";

    // Wizardry-style qualitative health for the highlighted enemy target
    // (a footer line — the narrow menu window can't fit a detail column).
    let selectionFooter: string | null = null;
    if (this.phase === "selectTarget" && this.targetKind === "enemy") {
      const target = this.findEnemy(this.selectionIds[this.selectionIndex] ?? "");
      if (target) {
        selectionFooter = enemyHealthDescriptor(target.currentHp, target.hp);
      }
    }

    const spellDetail: SpellDef | null =
      this.phase === "selectSpell"
        ? (this.state.spells[this.selectionIds[this.selectionIndex] ?? ""] ?? null)
        : null;

    const techniqueDetail: TechniqueDef | null =
      this.phase === "selectTechnique"
        ? (this.knownTechniques(this.currentChar()!).find((t) => t.id === this.selectionIds[this.selectionIndex]) ?? null)
        : null;

    const acting = this.currentChar();
    const resourceLine =
      this.phase === "palette" && acting
        ? menuResourceLine(
            acting.sp,
            acting.maxSp,
            classHasTechniques(acting.class) ? this.currentRage(acting) : null,
            classHasTechniques(acting.class)
              ? maxRageForLevel(acting.level)
              : undefined
          )
        : null;

    const view: CombatWindowsView = {
      state: this.state,
      currentCharacterId: this.currentActorId,
      menuMode,
      palette: this.phase === "palette" ? this.palette : null,
      menuEntries: [],
      menuIndex: 0,
      selectionTitle: this.selectionTitle,
      selectionEntries: this.selectionEntries,
      selectionIndex: this.selectionIndex,
      selectionFooter,
      spellDetail,
      techniqueDetail,
      flash: this.flash,
      result: this.phase === "result" ? this.result : null,
      partyAuto: this.partyAuto,
      inspectCharacterId: this.inspectCharacterId,
      playbackHint:
        this.phase === "playback"
          ? playbackHintText(this.getLastInputKind())
          : this.phase === "palette" && this.partyAuto
            ? "AUTO on · Start/Q stop"
            : null,
      menuResourceLine: resourceLine || null,
    };
    const handlers: CombatWindowsHandlers = {
      onMenuHover: () => {},
      onMenuConfirm: () => {},
      onPaletteConfirm: (i) => {
        if (this.phase !== "palette") return;
        this.paletteSlotAction(i);
      },
      onSelectionHover: (i) => {
        if (this.phase === "palette" || this.phase === "playback") return;
        this.selectionIndex = i;
        this.syncTargetCursor();
        this.windowsDirty = true;
      },
      onSelectionConfirm: (i) => {
        if (this.phase === "palette" || this.phase === "playback") return;
        this.selectionIndex = i;
        this.syncTargetCursor();
        this.confirmSelection();
      },
    };
    renderCombatWindows(combatWindows, view, handlers);
  }
}
