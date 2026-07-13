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
import { techniquesForClass, techniqueById, type TechniqueDef } from "../data/techniques";
import type { ItemDef } from "../data/items";
import { combatCtx, combatCanvas, combatWindows } from "./shell";
import {
  createScene,
  renderScene,
  updateScene,
  playTurn,
  isPlaybackDone,
  absorbDeaths,
  type CombatScene,
} from "./combat-scene";
import {
  renderCombatWindows,
  menuEntriesForCharacter,
  type CombatWindowsView,
  type CombatWindowsHandlers,
  type MenuEntry,
  type SelectionEntry,
  type ResultView,
} from "./combat-select-action-view";

type Phase =
  | "menu"
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
  private menuEntries: MenuEntry[] = [];
  private menuIndex = 0;
  private selectionTitle = "";
  private selectionEntries: SelectionEntry[] = [];
  private selectionIndex = 0;
  /** Ids behind selectionEntries (enemy instance ids / ally ids / spell ids / item ids / rows). */
  private selectionIds: string[] = [];
  private targetKind: "enemy" | "ally" | "row" = "enemy";
  private flash: string | null = null;
  private result: ResultView | null = null;

  private scene: CombatScene;
  private rafId: number | null = null;
  private windowsDirty = true;

  constructor(state: CombatState, opts: CombatControllerOptions) {
    this.state = state;
    this.onEnd = opts.onEnd;
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
    updateScene(this.scene, now);

    if (this.phase === "playback" && isPlaybackDone(this.scene, now)) {
      this.afterPlayback();
    }

    if (this.windowsDirty) {
      this.renderWindows();
      this.windowsDirty = false;
    }

    renderScene(combatCtx, combatCanvas.width, combatCanvas.height, this.scene, now);
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
      this.openMenuFor(c);
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

    // Clear a stale spell banner from the previous turn.
    this.scene.banner = null;

    this.currentActorId = null;
    this.scene.activeActorId = null;
    this.scene.cursor = null;
    this.pending = null;
    this.flash = null;
    this.phase = "playback";
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

  // --- Menu -----------------------------------------------------------------

  private openMenuFor(c: Character): void {
    this.phase = "menu";
    this.currentActorId = c.id;
    this.scene.activeActorId = c.id;
    this.menuEntries = menuEntriesForCharacter(c);
    this.menuIndex = 0;
    this.pending = null;
    this.flash = null;
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
  private chooseAction(kind: PlayerAction["kind"]): void {
    const c = this.currentChar();
    if (!c) return;
    this.flash = null;

    switch (kind) {
      case "attack":
      case "ambush": {
        const enemies = this.livingEnemies();
        if (enemies.length === 0) {
          this.setFlash("No target!");
          return;
        }
        this.pending = { kind };
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
        this.resolveAndPlay(() =>
          resolvePlayerTurn(this.state, { kind: "defend", actorId: c.id })
        );
        return;
      case "hide":
        this.resolveAndPlay(() =>
          resolvePlayerTurn(this.state, { kind: "hide", actorId: c.id })
        );
        return;
      case "flee":
        this.resolveAndPlay(() =>
          resolvePlayerTurn(this.state, { kind: "flee", actorId: c.id })
        );
        return;
    }
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
    }
    this.selectionIndex = 0;
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
        this.openTargetSelect("enemy");
      } else if (spell?.target === "singleAlly") {
        this.openTargetSelect("ally");
      } else if (spell?.effect.kind === "fizzleField") {
        // BACORTU targets one enemy row — ask which.
        this.openRowSelect();
      } else {
        // Group / self / all spells need no target.
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
        this.openTargetSelect("enemy");
      } else if (tech.target === "singleAlly") {
        this.openTargetSelect("ally");
      } else if (tech.target === "rowEnemies") {
        this.openRowSelect();
      } else if (tech.target === "columnEnemies") {
        // Column targeting: pick an enemy, we'll derive the column from its position.
        this.openTargetSelect("enemy");
      } else {
        // self / allEnemies / allFrontEnemies / allAllies / allFrontAllies / randomEnemies
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
        this.resolveAndPlay(() =>
          resolvePlayerTurn(this.state, {
            kind: "attack",
            actorId: c.id,
            targetInstanceId: id,
          })
        );
      } else if (pending.kind === "ambush") {
        this.resolveAndPlay(() =>
          resolvePlayerTurn(this.state, {
            kind: "ambush",
            actorId: c.id,
            targetInstanceId: id,
          })
        );
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
        this.resolveAndPlay(() => resolvePlayerTurn(this.state, action));
      } else if (pending.kind === "item" && pending.itemId) {
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
      // Back out of technique list into the action menu.
      this.phase = "menu";
      this.pending = null;
      this.windowsDirty = true;
      return;
    }
    if (this.phase === "selectTarget" && this.pending?.kind === "item") {
      this.openItemSelect();
      return;
    }
    this.phase = "menu";
    this.pending = null;
    this.windowsDirty = true;
  }

  // --- Result --------------------------------------------------------------------

  private showResult(): void {
    this.phase = "result";
    this.currentActorId = null;
    this.scene.activeActorId = null;
    this.scene.cursor = null;

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

  /** Route a keypress to the controller. Called by main.ts for combat mode. */
  handleKey(key: string): void {
    switch (this.phase) {
      case "playback":
        return; // playback is auto — nothing to advance

      case "result":
        if (key === " " || key === "Enter") {
          this.destroy();
          this.onEnd(this.state);
        }
        return;

      case "menu":
        this.handleMenuKey(key);
        return;

      case "selectTarget":
      case "selectSpell":
      case "selectItem":
      case "selectTechnique":
        this.handleSelectionKey(key);
        return;
    }
  }

  private handleMenuKey(key: string): void {
    switch (key) {
      case "ArrowUp":
        this.menuIndex =
          (this.menuIndex - 1 + this.menuEntries.length) % this.menuEntries.length;
        this.windowsDirty = true;
        return;
      case "ArrowDown":
        this.menuIndex = (this.menuIndex + 1) % this.menuEntries.length;
        this.windowsDirty = true;
        return;
      case " ":
      case "Enter":
        this.chooseAction(this.menuEntries[this.menuIndex].kind);
        return;
    }
    const shortcuts: Record<string, PlayerAction["kind"]> = {
      a: "attack",
      c: "cast",
      m: "cast",
      d: "defend",
      i: "item",
      f: "flee",
      r: "flee",
      h: "hide",
    };
    const kind = shortcuts[key.toLowerCase()];
    if (kind && this.menuEntries.some((e) => e.kind === kind)) {
      this.chooseAction(kind);
    }
  }

  private handleSelectionKey(key: string): void {
    const len = this.selectionEntries.length;
    if (len === 0) {
      this.backToMenu();
      return;
    }
    switch (key) {
      case "ArrowUp":
        this.selectionIndex = (this.selectionIndex - 1 + len) % len;
        this.syncTargetCursor();
        this.windowsDirty = true;
        return;
      case "ArrowDown":
        this.selectionIndex = (this.selectionIndex + 1) % len;
        this.syncTargetCursor();
        this.windowsDirty = true;
        return;
      case " ":
      case "Enter":
        this.confirmSelection();
        return;
      case "Escape":
      case "Backspace":
        this.backToMenu();
        return;
    }
    // Number keys jump straight to an entry.
    const n = parseInt(key, 10);
    if (!isNaN(n) && n >= 1 && n <= len) {
      this.selectionIndex = n - 1;
      this.syncTargetCursor();
      this.confirmSelection();
    }
  }

  // --- Windows -------------------------------------------------------------------

  private renderWindows(): void {
    const menuMode =
      this.phase === "menu"
        ? "menu"
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

    // While picking a spell, the enemy window is replaced by a description
    // panel for whichever spell is currently highlighted (see
    // buildSpellDetailWindow in combat-select-action-view.ts).
    const spellDetail: SpellDef | null =
      this.phase === "selectSpell"
        ? (this.state.spells[this.selectionIds[this.selectionIndex] ?? ""] ?? null)
        : null;

    // While picking a technique, show its description in the same panel.
    const techniqueDetail: TechniqueDef | null =
      this.phase === "selectTechnique"
        ? (this.knownTechniques(this.currentChar()!).find((t) => t.id === this.selectionIds[this.selectionIndex]) ?? null)
        : null;

    const view: CombatWindowsView = {
      state: this.state,
      currentCharacterId: this.currentActorId,
      menuMode,
      menuEntries: this.menuEntries,
      menuIndex: this.menuIndex,
      selectionTitle: this.selectionTitle,
      selectionEntries: this.selectionEntries,
      selectionIndex: this.selectionIndex,
      selectionFooter,
      spellDetail,
      techniqueDetail,
      flash: this.flash,
      result: this.phase === "result" ? this.result : null,
    };
    const handlers: CombatWindowsHandlers = {
      onMenuHover: (i) => {
        if (this.phase !== "menu") return;
        this.menuIndex = i;
        this.windowsDirty = true;
      },
      onMenuConfirm: (i) => {
        if (this.phase !== "menu") return;
        this.menuIndex = i;
        this.chooseAction(this.menuEntries[i].kind);
      },
      onSelectionHover: (i) => {
        if (this.phase === "menu" || this.phase === "playback") return;
        this.selectionIndex = i;
        this.syncTargetCursor();
        this.windowsDirty = true;
      },
      onSelectionConfirm: (i) => {
        if (this.phase === "menu" || this.phase === "playback") return;
        this.selectionIndex = i;
        this.syncTargetCursor();
        this.confirmSelection();
      },
    };
    renderCombatWindows(combatWindows, view, handlers);
  }
}
