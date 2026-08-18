/**
 * Application owner for dungeon overlays. Controller instances and UiStack
 * registration live here; GameState.mode stays on the underlying screen.
 * Input ownership is still `uiStack.top()` — this class does not keep a
 * second priority table.
 */

import type { GameMode, GameState } from "../types";
import type { NPCDef } from "../data/floors";
import type { PendingPerkChoice } from "../game/perks";
import type { OverlayRouteKind } from "./controller-route";
import { createMenuLayer, type UiStack } from "./ui-stack";
import { SaveController } from "./save-ui";
import { SpellMenuController } from "./spell-ui";
import { NPCController } from "./npc-ui";
import { TavernController } from "./tavern-ui";
import { NamandaController } from "./namanda-ui";
import { DungeonActionRingController } from "./dungeon-action-ring-ui";
import { PerkSelectController } from "./perk-select-ui";
import { DungeonDialogController } from "./dungeon-dialog";
import { TrapPromptController } from "./trap-prompt-ui";

export interface OverlayShell {
  panel(): HTMLElement;
  presentBlocking(): void;
  restore(): void;
  showDialog(): void;
  showDungeon(): void;
  showNpcDialogue(): void;
  hideNpcDialogue(): void;
  syncMapOverlayTitle(): void;
  setMessage(text: string, opts?: { instant?: boolean }): void;
  closeMapIfOpen(): void;
}

export interface DungeonOverlayActions {
  camp(): void;
  returnToTown(): void;
  toggleMap(): void;
  unlock(): void;
  canOpenActionRing(): boolean;
}

export interface SessionOverlayActions {
  applyLoadedState(state: GameState): void;
  persist(): void;
  reopenTown(): void;
}

export interface CombatOverlayActions {
  startNpcFight(npc: NPCDef): void;
}

export interface TrapOverlayActions {
  isPending(): boolean;
  inspected(): boolean;
  inspect(): void;
  disarm(): { stillPending: boolean };
  open(): void;
  leave(): void;
}

export interface OverlayAudio {
  stopDungeon(): void;
  startTavernMusic(): void;
  stopTavernMusic(): void;
  startDungeon(): void;
}

export interface OverlayRuntimeDeps {
  state: GameState;
  uiStack: UiStack;
  shell: OverlayShell;
  dungeon: DungeonOverlayActions;
  session: SessionOverlayActions;
  combat: CombatOverlayActions;
  trap: TrapOverlayActions;
  audio: OverlayAudio;
  inArena(): boolean;
  setMode(mode: GameMode): void;
  onDialogClosed(): void;
}

type RingActionId = "camp" | "map" | "grimoire" | "unlock" | "town";

export class OverlayRuntime {
  private save: SaveController | null = null;
  private spell: SpellMenuController | null = null;
  private npc: NPCController | null = null;
  private tavern: TavernController | null = null;
  private namanda: NamandaController | null = null;
  private actionRing: DungeonActionRingController | null = null;
  private dialog: DungeonDialogController | null = null;
  private perk: PerkSelectController | null = null;
  private trapPrompt: TrapPromptController | null = null;
  private pendingRingAction: RingActionId | null = null;

  constructor(private readonly deps: OverlayRuntimeDeps) {}

  hasOpenOverlay(): boolean {
    return this.deps.uiStack.top() !== null;
  }

  /** Debug playtests read the live NPC panel; not used for input routing. */
  get npcController(): NPCController | null {
    return this.npc;
  }

  openSave(): void {
    this.deps.shell.closeMapIfOpen();
    this.deps.shell.presentBlocking();
    this.save = new SaveController({
      panel: this.deps.shell.panel(),
      state: this.deps.state,
      modeBeforeSave: this.deps.state.mode,
      onLoaded: (loaded) => {
        this.save = null;
        this.dismiss("save");
        this.deps.session.applyLoadedState(loaded);
      },
      onClose: () => {
        this.save = null;
        this.dismiss("save");
        this.deps.shell.restore();
        if (this.deps.state.mode === "town") {
          this.deps.session.reopenTown();
        } else {
          this.deps.shell.setMessage("");
        }
      },
    });
    this.register("save", (key) => this.save?.handleKey(key));
  }

  openSpell(): void {
    this.deps.shell.presentBlocking();
    this.spell = new SpellMenuController({
      panel: this.deps.shell.panel(),
      state: this.deps.state,
      onClose: (message) => {
        this.spell = null;
        this.dismiss("spell");
        this.deps.shell.restore();
        this.deps.shell.setMessage(message);
      },
    });
    this.register("spell", (key) => this.spell?.handleKey(key));
  }

  openNpc(npcId: string): void {
    if (npcId === "hot-boi") {
      this.openTavern();
      return;
    }
    if (npcId === "namanda-altar") {
      this.openNamanda();
      return;
    }
    const npc = this.deps.state.floor.npcs?.find((n) => n.id === npcId);
    if (!npc) return;
    this.deps.shell.syncMapOverlayTitle();
    this.deps.shell.showNpcDialogue();
    this.npc = new NPCController({
      panel: this.deps.shell.panel(),
      state: this.deps.state,
      npc,
      onClose: (message) => {
        this.npc = null;
        this.dismiss("npc");
        this.deps.shell.hideNpcDialogue();
        this.deps.shell.restore();
        this.deps.shell.setMessage(message);
      },
      onFight: (target) => {
        this.deps.combat.startNpcFight(target);
      },
    });
    this.register("npc", (key) => this.npc?.handleKey(key));
  }

  openTavern(): void {
    this.deps.shell.presentBlocking();
    this.deps.audio.stopDungeon();
    this.deps.audio.startTavernMusic();
    this.tavern = new TavernController({
      panel: this.deps.shell.panel(),
      state: this.deps.state,
      onClose: () => {
        this.tavern = null;
        this.dismiss("tavern");
        this.deps.shell.restore();
        this.deps.shell.setMessage("");
        this.deps.audio.stopTavernMusic();
        this.deps.audio.startDungeon();
      },
      onSave: () => this.deps.session.persist(),
    });
    this.register("tavern", (key) => this.tavern?.handleKey(key));
  }

  openNamanda(): void {
    this.deps.shell.presentBlocking();
    this.namanda = new NamandaController({
      panel: this.deps.shell.panel(),
      state: this.deps.state,
      onClose: () => {
        this.namanda = null;
        this.dismiss("namanda");
        this.deps.shell.restore();
        this.deps.shell.setMessage("");
      },
      onSave: () => this.deps.session.persist(),
    });
    this.register("namanda", (key) => this.namanda?.handleKey(key));
  }

  openActionRing(): void {
    if (this.deps.uiStack.top()) return;
    if (
      this.deps.state.mode !== "dungeon" ||
      this.deps.state.pendingTrap ||
      !this.deps.dungeon.canOpenActionRing()
    ) {
      return;
    }
    this.deps.shell.presentBlocking();
    this.pendingRingAction = null;
    this.actionRing = new DungeonActionRingController({
      panel: this.deps.shell.panel(),
      onCamp: () => {
        this.pendingRingAction = "camp";
      },
      onToggleMap: () => {
        this.pendingRingAction = "map";
      },
      onCastSpell: () => {
        this.pendingRingAction = "grimoire";
      },
      onUnlock: () => {
        this.pendingRingAction = "unlock";
      },
      onTown: () => {
        this.pendingRingAction = "town";
      },
      onClose: () => {
        this.actionRing = null;
        this.dismiss("action_ring");
        this.deps.shell.restore();
        this.deps.shell.setMessage("");
        const action = this.pendingRingAction;
        this.pendingRingAction = null;
        if (action === "camp") this.deps.dungeon.camp();
        else if (action === "map") this.deps.dungeon.toggleMap();
        else if (action === "grimoire") this.openSpell();
        else if (action === "unlock") this.deps.dungeon.unlock();
        else if (action === "town") this.deps.dungeon.returnToTown();
      },
    });
    this.deps.uiStack.push({
      id: "action_ring",
      handleInput: (event) => {
        this.actionRing?.handleInput(event);
        return true;
      },
      close: () => {
        this.actionRing?.destroy();
      },
    });
  }

  openDialog(opts: {
    lines: string[];
    choices?: { label: string; value: string }[];
    title?: string;
    choiceTimerMs?: number;
    onSelect?: (value: string, meta?: { elapsedMs: number }) => void;
    onClose?: () => void;
    cancelable?: boolean;
  }): void {
    this.dialog = new DungeonDialogController({
      state: this.deps.state,
      panel: this.deps.shell.panel(),
      lines: opts.lines,
      choices: opts.choices,
      title: opts.title,
      choiceTimerMs: opts.choiceTimerMs,
      onSelect: opts.onSelect,
      onClose: () => {
        this.dialog = null;
        this.dismiss("dialog");
        this.deps.onDialogClosed();
        this.deps.shell.showDungeon();
        opts.onClose?.();
      },
      cancelable: opts.cancelable,
    });
    this.dialog.open();
    this.register("dialog", (key) => this.dialog?.handleKey(key));
    this.deps.shell.showDialog();
  }

  openPerk(queue: PendingPerkChoice[], onDone?: () => void): void {
    this.deps.setMode(this.deps.inArena() ? "arena" : "dungeon");
    this.deps.shell.presentBlocking();
    this.perk = new PerkSelectController({
      panel: this.deps.shell.panel(),
      state: this.deps.state,
      queue,
      onDone: () => {
        this.perk = null;
        this.dismiss("perk");
        this.deps.shell.restore();
        onDone?.();
      },
    });
    this.register("perk", (key) => this.perk?.handleKey(key));
  }

  syncTrap(pending: boolean): string | null {
    if (!pending) {
      this.closeTrap();
      return null;
    }
    if (!this.trapPrompt) {
      this.trapPrompt = new TrapPromptController();
      this.register("trap", (key) => {
        this.handleTrapKey(key);
      });
    }
    return this.trapPrompt.renderMessage(this.deps.trap.inspected());
  }

  handleTrapKey(key: string): boolean {
    if (!this.trapPrompt || !this.deps.trap.isPending()) return false;
    const action = this.trapPrompt.handleKey(key);
    if (action === null) {
      this.deps.shell.setMessage(this.trapPrompt.renderMessage(this.deps.trap.inspected()), {
        instant: true,
      });
      return true;
    }
    switch (action) {
      case "inspect":
        this.deps.trap.inspect();
        break;
      case "disarm": {
        const { stillPending } = this.deps.trap.disarm();
        if (stillPending && this.trapPrompt) {
          this.deps.shell.setMessage(
            this.trapPrompt.renderMessage(this.deps.trap.inspected()),
            { instant: true },
          );
        } else {
          this.closeTrap();
        }
        break;
      }
      case "open":
        this.deps.trap.open();
        this.closeTrap();
        break;
      case "leave":
        this.deps.trap.leave();
        this.closeTrap();
        break;
    }
    return true;
  }

  closeAll(): void {
    this.actionRing?.destroy();
    this.actionRing = null;
    this.save = null;
    this.spell = null;
    this.npc = null;
    this.tavern = null;
    this.namanda = null;
    this.dialog = null;
    this.perk = null;
    this.trapPrompt = null;
    this.pendingRingAction = null;
    for (const id of OVERLAY_IDS) this.deps.uiStack.close(id);
  }

  private closeTrap(): void {
    this.trapPrompt = null;
    this.dismiss("trap");
  }

  private register(id: OverlayRouteKind, handleKey: (key: string) => void): void {
    this.deps.uiStack.push(createMenuLayer(id, handleKey, () => {}));
  }

  private dismiss(id: OverlayRouteKind): void {
    this.deps.uiStack.close(id);
  }
}

const OVERLAY_IDS: OverlayRouteKind[] = [
  "perk",
  "save",
  "spell",
  "npc",
  "tavern",
  "namanda",
  "action_ring",
  "trap",
  "dialog",
];
