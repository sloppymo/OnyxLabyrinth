/**
 * Application owner for base-screen controller lifetime: Title, Town, Camp,
 * Game Over, Party Creation, and Arena (including the level-setup pane).
 *
 * GameState.mode still names the live screen. This class owns the controller
 * instances and construction. Gameplay consequences stay in injected callbacks.
 * Prologue and Ending remain title-mode screens owned by the caller.
 */

import type { GameMode, GameState } from "../types";
import type { Character } from "../game/party";
import type { ControllerInputEvent } from "./controller-input";
import { controllerEventToMenuKey } from "./menu-controller-adapter";
import { TitleController } from "./title-ui";
import { TownController } from "./town-ui";
import { CampController } from "./camp-ui";
import { GameOverController } from "./game-over-ui";
import { PartyCreationController } from "./party-ui";
import { ArenaController } from "./arena-ui";
import { CardTrialLobbyController } from "./card-trial-lobby";
import { FF6Window } from "./ff6-window-library";
import { audio } from "./audio";

export interface BaseScreenShell {
  panel(): HTMLElement;
  setMode(mode: GameMode): void;
  show(mode: GameMode): void;
  fadeTo(mode: GameMode): void;
  closeMapIfOpen(): void;
  setMessage(text: string): void;
  focusWindow(): void;
}

export interface BaseScreenAudio {
  startTitleMusic(): void;
  stopTitleMusic(): void;
  startPartyCreationMusic(): void;
  stopPartyCreationMusic(): void;
  startTownMusic(): void;
}

export interface TitleScreenActions {
  newGame(): void;
  continue(loaded: GameState): void;
  openArenaSetup(): void;
}

export interface TownScreenActions {
  enterDungeon(): void;
  openSave(): void;
  reformParty(): void;
}

export interface PartyScreenActions {
  confirm(party: Character[], onDone: () => void): void;
  cancel(previousMode: GameMode, onDone: () => void): void;
}

export interface GameOverScreenActions {
  continue(): void;
}

export interface CampScreenActions {
  end(): void;
}

export interface ArenaScreenActions {
  nextFight(): void;
  exitToTitle(): void;
  startAtLevel(level: number): void;
  openCardTrial(): void;
}

export interface BaseScreenRuntimeDeps {
  state: GameState;
  shell: BaseScreenShell;
  audio: BaseScreenAudio;
  title: TitleScreenActions;
  town: TownScreenActions;
  party: PartyScreenActions;
  gameOver: GameOverScreenActions;
  camp: CampScreenActions;
  arena: ArenaScreenActions;
  inArena(): boolean;
}

const ARENA_LEVELS = [1, 3, 6, 9, 12];

export class BaseScreenRuntime {
  private title: TitleController | null = null;
  private town: TownController | null = null;
  private camp: CampController | null = null;
  private gameOver: GameOverController | null = null;
  private partyCreation: PartyCreationController | null = null;
  private arena: ArenaController | null = null;
  private arenaSetup: { handleKey: (key: string) => void } | null = null;
  private cardTrialLobby: CardTrialLobbyController | null = null;

  constructor(private readonly deps: BaseScreenRuntimeDeps) {}

  get hasTitle(): boolean {
    return this.title !== null;
  }
  get hasTown(): boolean {
    return this.town !== null;
  }
  get hasCamp(): boolean {
    return this.camp !== null;
  }
  get hasGameOver(): boolean {
    return this.gameOver !== null;
  }
  get hasPartyCreation(): boolean {
    return this.partyCreation !== null;
  }
  get hasArena(): boolean {
    return this.arena !== null || this.arenaSetup !== null || this.cardTrialLobby !== null;
  }

  get hasCardTrialLobby(): boolean {
    return this.cardTrialLobby !== null;
  }

  dismissTitle(): void {
    this.title = null;
  }
  dismissTown(): void {
    this.town = null;
  }

  openTitle(): void {
    this.deps.shell.setMode("title");
    this.deps.shell.show("title");
    this.deps.shell.setMessage("");
    this.deps.shell.focusWindow();
    this.deps.audio.startTitleMusic();
    this.title = new TitleController({
      panel: this.deps.shell.panel(),
      onNewGame: () => {
        this.title = null;
        this.deps.title.newGame();
      },
      onContinue: (loaded) => {
        this.title = null;
        this.deps.audio.stopTitleMusic();
        this.deps.title.continue(loaded);
      },
      onArena: () => {
        this.title = null;
        this.deps.audio.stopTitleMusic();
        this.deps.title.openArenaSetup();
      },
    });
  }

  openTown(opts?: { introHint?: string }): void {
    this.deps.shell.fadeTo("town");
    this.deps.shell.setMessage("");
    this.town = new TownController({
      panel: this.deps.shell.panel(),
      state: this.deps.state,
      initialFlash: opts?.introHint ?? "",
      onEnterDungeon: () => {
        this.town = null;
        this.deps.town.enterDungeon();
      },
      onOpenSave: () => {
        this.town = null;
        this.deps.town.openSave();
      },
      onReformParty: () => {
        this.town = null;
        this.deps.town.reformParty();
      },
    });
  }

  openPartyCreation(onDone: () => void): void {
    this.deps.shell.closeMapIfOpen();
    const previousMode = this.deps.state.mode;
    this.deps.shell.setMode("party_creation");
    this.deps.shell.show("party_creation");
    this.deps.shell.setMessage("");
    this.deps.audio.startPartyCreationMusic();
    this.partyCreation = new PartyCreationController({
      panel: this.deps.shell.panel(),
      onConfirm: (party) => {
        this.partyCreation = null;
        this.deps.audio.stopPartyCreationMusic();
        this.deps.party.confirm(party, onDone);
      },
      onCancel: () => {
        this.partyCreation = null;
        this.deps.audio.stopPartyCreationMusic();
        this.deps.party.cancel(previousMode, onDone);
      },
    });
  }

  openGameOver(): void {
    this.deps.shell.setMode("game_over");
    this.deps.shell.show("game_over");
    this.deps.shell.setMessage("");
    this.gameOver = new GameOverController({
      panel: this.deps.shell.panel(),
      party: this.deps.state.party,
      floorName: this.deps.state.floor.name,
      worldYear: this.deps.state.worldYear,
      inArena: this.deps.inArena(),
      onContinue: () => {
        this.gameOver = null;
        this.deps.gameOver.continue();
      },
    });
  }

  openCamp(): void {
    this.deps.shell.setMode("camp");
    this.deps.shell.closeMapIfOpen();
    this.deps.shell.show("camp");
    this.deps.shell.setMessage("");
    this.camp = new CampController({
      panel: this.deps.shell.panel(),
      party: this.deps.state.party,
      dayCount: this.deps.state.dayCount,
      state: this.deps.state,
      onEnd: () => {
        this.camp = null;
        this.deps.camp.end();
      },
    });
  }

  openArena(wave: number, floor: number): void {
    this.deps.shell.setMode("arena");
    this.deps.shell.show("arena");
    this.deps.shell.setMessage("");
    this.arena = new ArenaController({
      panel: this.deps.shell.panel(),
      state: this.deps.state,
      wave,
      floor,
      onNext: () => {
        this.arena = null;
        this.deps.arena.nextFight();
      },
      onExit: () => {
        this.arena = null;
        this.deps.arena.exitToTitle();
      },
    });
  }

  openArenaSetup(): void {
    this.deps.shell.setMode("arena");
    this.deps.shell.show("arena");
    this.deps.shell.setMessage("");
    type SetupItem = { kind: "level"; level: number } | { kind: "card-trial" };
    const items: SetupItem[] = [
      ...ARENA_LEVELS.map((level) => ({ kind: "level" as const, level })),
      { kind: "card-trial" },
    ];
    let selected = 0;
    let hasRendered = false;
    const choose = (index: number) => {
      const item = items[index]!;
      this.arenaSetup = null;
      if (item.kind === "card-trial") this.deps.arena.openCardTrial();
      else this.deps.arena.startAtLevel(item.level);
    };
    const render = () => {
      const panel = this.deps.shell.panel();
      const animated = !hasRendered;
      hasRendered = true;
      const win = new FF6Window({
        title: "Arena Mode",
        contentHtml: `<div class="ff6-arena-meta">Classic Arena or Card Trial</div>`,
        items: items.map((item) => ({
          label: item.kind === "level" ? `Level ${item.level}` : "Card Trial",
        })),
        selectedIndex: selected,
        mode: "menu",
        footer: "D-pad navigate · A start · B title",
        animated,
        onHover: (i) => {
          selected = i;
        },
        onConfirm: (i) => {
          selected = i;
          choose(selected);
        },
        onBack: () => {
          this.arenaSetup = null;
          this.openTitle();
        },
      });
      panel.innerHTML = "";
      panel.appendChild(win.render());
    };
    this.arenaSetup = {
      handleKey: (key) => {
        audio.uiForMenuKey(key);
        const lower = key.toLowerCase();
        if (lower === "arrowup" || lower === "w") {
          selected = (selected - 1 + items.length) % items.length;
          render();
        } else if (lower === "arrowdown" || lower === "s") {
          selected = (selected + 1) % items.length;
          render();
        } else if (key === "Enter" || key === " ") {
          choose(selected);
        } else if (key === "Escape") {
          this.arenaSetup = null;
          this.openTitle();
        }
      },
    };
    render();
  }

  openCardTrialLobby(opts: {
    onFight: (fightId: number, sequential: boolean) => void;
    onTriangle: () => void;
    onExit: () => void;
    debug: boolean;
    summary?: string | null;
  }): void {
    this.arena = null;
    this.arenaSetup = null;
    this.deps.shell.setMode("arena");
    this.deps.shell.show("arena");
    this.deps.shell.setMessage("");
    this.cardTrialLobby = new CardTrialLobbyController({
      panel: this.deps.shell.panel(),
      ...opts,
    });
  }

  dismissCardTrialLobby(): void {
    this.cardTrialLobby = null;
  }

  handleTown(event: ControllerInputEvent): void {
    const key = controllerEventToMenuKey(event);
    if (key) this.town?.handleKey(key);
  }

  handleCamp(event: ControllerInputEvent): void {
    const key = controllerEventToMenuKey(event);
    if (key) this.camp?.handleKey(key);
  }

  handleGameOver(event: ControllerInputEvent): void {
    const key = controllerEventToMenuKey(event);
    if (key) this.gameOver?.handleKey(key);
  }

  handlePartyCreation(event: ControllerInputEvent): void {
    if (
      event.kind === "release" &&
      (event.button === "left" || event.button === "right")
    ) {
      this.partyCreation?.releaseDirection(event.button === "left" ? -1 : 1);
      return;
    }
    const key = controllerEventToMenuKey(event);
    if (key) this.partyCreation?.handleKey(key);
  }

  handleTitle(event: ControllerInputEvent): void {
    const key = controllerEventToMenuKey(event);
    if (key) this.title?.handleKey(key);
  }

  handleArena(event: ControllerInputEvent): void {
    const key = controllerEventToMenuKey(event);
    if (!key) return;
    if (this.cardTrialLobby) {
      this.cardTrialLobby.handleKey(key);
      return;
    }
    if (this.arenaSetup) {
      this.arenaSetup.handleKey(key);
      return;
    }
    this.arena?.handleKey(key);
  }
}
