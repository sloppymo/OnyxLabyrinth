import "./styles.css";
import { getFloors, findFloor, registerFloorMap } from "./game/floor-registry";
import { createGameState, setMode } from "./game/state";
import { turnLeft, turnRight, tryUnlock, resolveTraversal, openBarredGate } from "./engine/camera";
import { type Direction, type TraversalResult } from "./game/traversal";
import { RaftAnimationController, isRaftAnimating } from "./engine/raft-animation";
import { DungeonDialogController } from "./engine/dungeon-dialog";
import {
  handleTileFeature,
  transitionToFloor,
  inspectChest,
  disarmChest,
  openChest,
  leaveChest,
  confirmChuteDrop,
  clearStairsGuardian,
  resolveClimaxVictory,
  type ChestActionResult,
} from "./game/features";
import { revealAround } from "./game/explore";
import {
  loadTextures,
  isRenderCameraAnimating,
  isRenderCameraSettledFor,
  resetRenderCamera,
  renderBattleArena,
  renderCorridorBackdrop,
  setRaftVisualOverride,
} from "./engine/renderer";
import { mazeRenderProfiler } from "./engine/maze-renderer/performance";
import { createMazeRenderer } from "./engine/maze-renderer/renderer-factory";
import { MazeRendererDebugHud } from "./engine/maze-renderer/maze-debug-hud";
import type {
  MazeRenderer,
  MazeRendererSelection,
} from "./engine/maze-renderer/types";
import { partyPos, enemyPos, setBarksEnabled, getBarksEnabled } from "./engine/combat-scene";
import { geometryForBackdrop, assertFloorBottomClearOfWindows } from "./engine/combat-scene-math";
import { loadEnemySprites } from "./engine/enemy-sprite-cache";
import { loadPartySprites } from "./engine/party-sprite-cache";
import { loadEffectSprites } from "./engine/effect-sprite-cache";
import { loadMapSprites } from "./engine/map-sprite-cache";
import { loadWallFeatures } from "./engine/wall-feature-cache";
import { loadCeilingSprites } from "./engine/ceiling-sprite-cache";
import { loadCeilingFeatures } from "./engine/renderer";
import { loadDoorFeatures } from "./engine/door-feature-cache";
import { audio } from "./engine/audio";
import { renderAutoMap } from "./engine/automap";
import { bindInput, type InputHandlers } from "./engine/input";
import {
  MapOverlayRenderer,
  createMapOverlayState,
  hideMapOverlayState,
  syncMapOverlayMode,
  toggleMapOverlayState,
} from "./engine/map-overlay";
import {
  canvas,
  ctx,
  mazeWebglCanvas,
  mapCtx,
  mapOverlayCtx,
  setMessage,
  clearMessageOnPlayerAction,
  renderPartyStrip,
  clearPartyStrip,
  showMode as showShellMode,
  bindMapOverlayButton,
  setMapOverlayPresentation,
  compassForFacing,
  setContextualPrompt,
  getMessageText,
  setDebugMessageHook,
  getMazeRendererSurface,
  setMazeRendererSurface,
  setMazeSurfaceOpacity,
  showAmbientBark,
} from "./engine/shell";
import {
  resolveAbyssFaceStep,
  resolveAbyssFaceTurn,
  isOnAbyssBridge,
  type AmbientBarkCue,
} from "./game/abyss-face";
import {
  playEncounterTransition,
  playReturnTransition,
  revealAfterTransition,
} from "./engine/battle-transition";
import { resolveContextualPrompt } from "./engine/contextual-prompt";
import { buildSnapshot } from "./debug/snapshot";
import { computeIdle } from "./debug/idle";
import { normalizeLoadedMode } from "./debug/load-normalize";
import { applyJumpPartyOptions, type JumpToOptions } from "./debug/jump-to";
import { DebugEventBuffer, type DebugEventKind } from "./debug/event-buffer";
import { checkInvariants } from "./debug/invariants";
import { installAudioSpy } from "./debug/audio-spy";
import { buildDebugCombat } from "./debug/start-combat";
import { CombatController } from "./engine/combat-ui";
import { PALETTE_LETTER_SHORTCUTS } from "./engine/combat-action-palette";
import { createCombatStage } from "./engine/combat-stage";
import {
  createControllerInput,
  type ControllerInputEvent,
} from "./engine/controller-input";
import { controllerEventToMenuKey } from "./engine/menu-controller-adapter";
import {
  resolveControllerRoute,
  type ControllerRouteContext,
  type ControllerRouteKind,
} from "./engine/controller-route";
import { DungeonActionRingController } from "./engine/dungeon-action-ring-ui";
import { TrapPromptController } from "./engine/trap-prompt-ui";
import { CampController } from "./engine/camp-ui";
import { SaveController } from "./engine/save-ui";
import { TownController } from "./engine/town-ui";
import { PartyCreationController } from "./engine/party-ui";
import { GameOverController } from "./engine/game-over-ui";
import { TitleController } from "./engine/title-ui";
import { PrologueController } from "./engine/prologue-ui";
import { EndingController } from "./engine/ending-ui";
import { ArenaController } from "./engine/arena-ui";
import { FF6Window } from "./engine/ff6-window-library";
import { autoSave, serialize, deserialize } from "./game/save";
import { createCombatFromEncounter } from "./game/combat";
import { getGameplayRng, setGameplayRng, resetGameplayRng, createSeededRng } from "./game/rng";
import { defaultLoadoutForCharacter } from "./game/combat-equipment";
import { reconcileInventoryAfterCombat } from "./game/combat-inventory";
import type { CombatState, Loadout } from "./game/combat-types";
import { rollEncounter, resolveEncounter } from "./data/enemies";
import {
  encounterRollChance,
  encounterRateAt,
  encounterTableFloorId,
  zoneHeatAt,
  pityPressureFor,
  arenaStartFloorForLevel,
  arenaFloorForWave,
  rollArenaEncounter,
  adjustArenaEncounterForSmallParty,
  isSafeZoneAt,
  stepPity,
} from "./game/encounters";
import { tickBuffs, clearBuffs } from "./game/persistent-spells";
import { SpellMenuController } from "./engine/spell-ui";
import { NPCController } from "./engine/npc-ui";
import { TavernController } from "./engine/tavern-ui";
import { NamandaController } from "./engine/namanda-ui";
import { applyNamandaBlessing } from "./game/namanda";
import { PerkSelectController } from "./engine/perk-select-ui";
import { markKilled, adjustDisposition } from "./game/npc";
import { companionAsSummonedAlly, syncCompanionAfterCombat } from "./game/companion";
import { ENEMIES_BY_ID } from "./data/enemies";
import type { NPCDef, FloorDef, StairsGuardianDef } from "./data/floors";
import { ALL_SPELLS } from "./data/spells";
import { ITEMS_BY_ID } from "./data/items";
import {
  reviveKnockedOut,
  applyCombatPartyResult,
  awardCombatXp,
  type Character,
} from "./game/party";
import { levelUpChar, applyLevelUps } from "./game/leveling";
import type { PendingPerkChoice } from "./game/perks";
import type { GameState, GameMode } from "./types";
import { parseFloorMapJSON, resolveTilesetTheme } from "./game/floor-map";
import { createVerticalTraversalDemoMap } from "./content/vertical-traversal-demo";

const PLAYTEST_STORAGE_KEY = "onyx-floor-playtest";

/** Load editor playtest floor from localStorage when ?playtestFloor=1. */
function tryBootPlaytestFloor(): ReturnType<typeof registerFloorMap> | null {
  if (!new URLSearchParams(window.location.search).has("playtestFloor")) {
    return null;
  }
  try {
    const raw = localStorage.getItem(PLAYTEST_STORAGE_KEY);
    if (!raw) {
      console.warn("[playtest] playtestFloor=1 but no localStorage map");
      return null;
    }
    return registerFloorMap(parseFloorMapJSON(JSON.parse(raw)));
  } catch (err) {
    console.error("[playtest] failed to load floor map", err);
    return null;
  }
}

/** Direct live-demo entry point; normal title/new-game flow is unchanged. */
function tryBootVerticalDemo(): ReturnType<typeof registerFloorMap> | null {
  if (!new URLSearchParams(window.location.search).has("mazeVerticalDemo")) {
    return null;
  }
  return registerFloorMap(createVerticalTraversalDemoMap());
}

const playtestFloor = tryBootPlaytestFloor() ?? tryBootVerticalDemo();
const state = createGameState(playtestFloor ?? getFloors()[0]!);
let mazeRenderer: MazeRenderer | null = null;
let mazeRendererSelection: MazeRendererSelection | null = null;
let mazeRendererFloor: FloorDef | null = null;
let mazeRendererWidth = -1;
let mazeRendererHeight = -1;
let mazeRendererFloorLoading = false;
let mazeRendererFloorLoadId = 0;
const mazeRendererDebugHud = new MazeRendererDebugHud();

async function loadMazeRendererFloor(floor: FloorDef): Promise<void> {
  if (!mazeRenderer) return;
  const loadId = ++mazeRendererFloorLoadId;
  mazeRendererFloorLoading = true;
  try {
    await mazeRenderer.loadFloor(floor);
  } finally {
    if (loadId === mazeRendererFloorLoadId) mazeRendererFloorLoading = false;
  }
}

async function initializeMazeRenderer(): Promise<void> {
  mazeRendererSelection = await createMazeRenderer({
    canvas,
    context: ctx,
    webglCanvas: mazeWebglCanvas,
  });
  mazeRenderer = mazeRendererSelection.renderer;
  setMazeRendererSurface(mazeRendererSelection.active);
  const initialFloor = state.floor;
  await loadMazeRendererFloor(initialFloor);
  mazeRendererFloor = initialFloor;
  syncMazeRendererSize();
}

function syncMazeRendererFloor(): void {
  if (!mazeRenderer || mazeRendererFloor === state.floor) return;
  const nextFloor = state.floor;
  // Keep the previous buffers alive while shared images finish loading. The
  // backend atomically replaces them after preparation, avoiding a black
  // transition frame and preventing the render loop from scheduling the same
  // async load repeatedly.
  mazeRendererFloor = nextFloor;
  void loadMazeRendererFloor(nextFloor);
}

function syncMazeRendererSize(): void {
  if (!mazeRenderer) return;
  const surface = getMazeRendererSurface();
  if (surface.width === mazeRendererWidth && surface.height === mazeRendererHeight) return;
  mazeRendererWidth = surface.width;
  mazeRendererHeight = surface.height;
  mazeRenderer.resize({ width: surface.width, height: surface.height });
}

// Auto-map visibility flag.
let mapVisible = false;

// The quick overlay is session-only UI state. Explored terrain remains in the
// normal GameState save fields; whether this panel happens to be open does not.
const mapOverlayState = createMapOverlayState();
const mapOverlayRenderer = new MapOverlayRenderer();

function closeMapOverlay(): void {
  if (!hideMapOverlayState(mapOverlayState)) return;
  setMapOverlayPresentation(false);
}

/** Shell-mode seam: every blocking pane closes the quick map before display. */
function showMode(mode: GameMode, fullMapVisible = mapVisible): void {
  syncMapOverlayMode(mapOverlayState, mode);
  showShellMode(mode, fullMapVisible, mapOverlayState.visible);
}

/** First dungeon entry this page session — keyboard discoverability door hint. */
let shownDungeonKeyboardHint = false;
/** First-ever town visit this session (right after party creation) —
 *  orientation hint pointing at Enter Dungeon so a new player isn't left
 *  facing eight menu options with no stated objective. */
let shownTownIntro = false;
/**
 * Swallow the first town key after party creation / openTown so the same
 * Enter that confirmed the party cannot also select Inn (AGENTS.md
 * synchronous mode-open mid-keydown / key-repeat).
 */
let justOpenedTown = false;
/**
 * After the ending closes on Esc, ignore dungeon Esc→Save until keyup so
 * key-repeat cannot open the save menu on the same physical press.
 */
let suppressDungeonEscUntilKeyup = false;

// Session-wide gamepad/keyboard poller (combat keyboard path feeds this too).
let actionRingController: DungeonActionRingController | null = null;
let trapPrompt: TrapPromptController | null = null;
/** Swallow the step key that opened the trap so it cannot wrap the cursor. */
let justOpenedTrapPrompt = false;
type RingActionId = "camp" | "map" | "grimoire" | "unlock" | "town";
let pendingRingAction: RingActionId | null = null;

// --- Raft animation + dungeon dialog controllers ---
let raftAnimation: RaftAnimationController | null = null;
let dungeonDialog: DungeonDialogController | null = null;
/** Swallow the step key that opened a dungeon dialog so it cannot also move. */
let justOpenedDungeonDialog = false;
/** Swallow movement after closing a dialog until the closing key is released. */
let suppressDungeonMovementUntilKeyup = false;

// --- Mode transition with fade -------------------------------------------
// The canvas has `transition: opacity 0.15s` in CSS. This helper fades out,
// swaps mode + shell visibility, then fades in.

/**
 * True from the moment a fade starts until the new mode's frame has actually
 * painted. `state.mode` flips synchronously inside the setTimeout below, so
 * it alone can't tell a caller "the fade is still in flight" — this flag is
 * what `isIdle()` (debug/idle.ts) reads instead. Cleared one rAF after the
 * opacity is restored, not in the same tick, so a poller checking
 * immediately after the timeout fires still sees the fade as pending until
 * the browser has actually committed the restored frame.
 */
let modeTransitionPending = false;

/**
 * Event ring buffer for the ?debug=1 evidence layer. Null in normal play, so
 * every `recordDebugEvent` call below is a single null check. Assigned in the
 * debug block at the bottom of this file.
 */
let debugEvents: DebugEventBuffer | null = null;

function recordDebugEvent(kind: DebugEventKind, data: Record<string, unknown>): void {
  debugEvents?.push(kind, data);
}

function transitionToMode(newMode: GameMode): void {
  recordDebugEvent("modeChange", { from: state.mode, to: newMode });
  if (newMode !== "dungeon") closeMapOverlay();
  modeTransitionPending = true;
  setMazeSurfaceOpacity("0");
  setTimeout(() => {
    setMode(state, newMode);
    showMode(newMode, mapVisible);
    setMazeSurfaceOpacity("1");
    requestAnimationFrame(() => {
      modeTransitionPending = false;
    });
  }, 150);
}

// --- Exploration tracking ------------------------------------------------
// Flood-fill through open/door edges so the automap shows connected rooms
// and corridors, not a plus-shaped smear through solid rock.
function markExplored(): void {
  const { player, floor, explored } = state;
  revealAround(explored, floor, player.x, player.y);
}

// Reveal the starting area on load.
markExplored();

// --- Town mode -----------------------------------------------------------
let townController: TownController | null = null;

function openTown(opts?: { showIntroHint?: boolean }): void {
  if (mapVisible) toggleMap();
  transitionToMode("town");
  setMessage("");
  justOpenedTown = true;
  let introHint = "";
  if (opts?.showIntroHint && !shownTownIntro) {
    shownTownIntro = true;
    // Kept short (one line) so it doesn't compete with the menu items for
    // vertical space in the fixed-height FF6Window on narrow viewports.
    introHint = "Ready when you are — [>] Enter Dungeon.";
  }
  // Most openTown() callers are decoupled from any keydown event (e.g. the
  // party-creation confirm flash's setTimeout, or the combat return
  // transition's async dissolve) — for those, no cascaded keydown ever
  // arrives to clear the flag, so it would otherwise sit armed until the
  // player's next *genuine* keypress and silently eat that one instead.
  // A truly cascaded same-event keydown (e.g. game_over's Enter calling
  // openTown() synchronously) still fires — and clears the flag — well
  // before this rAF's next-paint callback runs, so that protection is
  // unaffected; this only forecloses the "wait forever" failure mode.
  requestAnimationFrame(() => {
    justOpenedTown = false;
  });
  townController = new TownController({
    panel: document.querySelector<HTMLDivElement>("#combat-panel")!,
    state,
    initialFlash: introHint,
    onEnterDungeon: () => {
      townController = null;
      const last = state.lastDungeon;
      const floor = last
        ? findFloor(last.floorId) ?? getFloors()[0]!
        : getFloors()[0]!;
      const x = last ? last.x : floor.startX;
      const y = last ? last.y : floor.startY;
      const facing = last ? last.facing : 0;
      transitionToFloor(state, floor, x, y, facing);
      state.inDarkness = false;
      state.inAntimagic = false;
      markExplored();
      transitionToMode("dungeon");
      const entry = last ? "You return to the dungeon..." : "You enter the dungeon...";
      if (!shownDungeonKeyboardHint) {
        shownDungeonKeyboardHint = true;
        // Line 2 teaches the keyboard *door* (action ring), not every verb —
        // Esc is Save only; pad Start / Tab opens Camp·Map·Town·Unlock·Grimoire.
        setMessage(`${entry}\nTab: Actions · Esc: Save`);
      } else {
        setMessage(entry);
      }
    },
    onOpenSave: () => {
      townController = null;
      openSaveMenu();
    },
    onReformParty: () => {
      townController = null;
      openPartyCreation(() => openTown());
    },
  });
}

function returnToTown(): void {
  // Remember where the player was so re-entering the dungeon resumes here
  // instead of resetting to Floor 1.
  state.lastDungeon = {
    floorId: state.floor.id,
    x: state.player.x,
    y: state.player.y,
    facing: state.player.facing,
  };
  setMessage("You return to town.");
  openTown();
}

// --- Party creation ------------------------------------------------------
let partyCreationController: PartyCreationController | null = null;

function openPartyCreation(onDone: () => void): void {
  if (mapVisible) toggleMap();
  const previousMode = state.mode;
  setMode(state, "party_creation");
  showMode("party_creation", mapVisible);
  setMessage("");
  audio.startPartyCreationMusic();
  partyCreationController = new PartyCreationController({
    panel: document.querySelector<HTMLDivElement>("#combat-panel")!,
    onConfirm: (party: Character[]) => {
      partyCreationController = null;
      state.party = party;
      state.equipment = Object.fromEntries(
        party.map((c) => [c.id, defaultLoadoutForCharacter(c)])
      );
      audio.stopPartyCreationMusic();
      onDone();
    },
    onCancel: () => {
      partyCreationController = null;
      audio.stopPartyCreationMusic();
      // Restore the music that was playing before party creation
      if (previousMode === "title") {
        audio.startTitleMusic();
      } else if (previousMode === "town") {
        audio.startTownMusic();
      }
      onDone();
    },
  });
}

// --- New Game prologue -----------------------------------------------------
// Skippable SNES-style black-field narration shown once, between New Game's
// state reset and party creation. Never shown by Continue / Arena / Reform
// Party. Borrows "title" mode like the perk/save/NPC overlays.
let prologueController: PrologueController | null = null;
// The prologue is opened *from inside* the title screen's own keydown
// handler (title's onNewGame), not from a separate trigger the way
// perk-select/save/NPC are. The same "New Game" keydown that constructs
// prologueController keeps dispatching to every window "keydown" listener
// in registration order within that one event — so this flag is set
// unconditionally at open time (mirroring justOpenedSaveMenu) AND the
// listener below is registered after the title screen's own listener,
// so it observes prologueController already non-null for that same
// keydown and correctly swallows it there, not one event later.
let justOpenedPrologue = false;

function openPrologue(onDone: () => void): void {
  if (mapVisible) toggleMap();
  setMode(state, "title");
  showMode("title", mapVisible);
  setMessage(""); // critical: empty #message so it cannot cover the black field
  justOpenedPrologue = true;
  prologueController = new PrologueController({
    panel: document.querySelector<HTMLDivElement>("#combat-panel")!,
    onDone: () => {
      prologueController = null;
      onDone();
    },
  });
}

// --- The wish (ending) -----------------------------------------------------
// Design doc §6. Opened from endCombat's victory branch after the level-up/
// perk queue, once per campaign — see the hasCompletedEnding comment at the
// call site for why "boss defeated" alone can't gate this (the floor-5 boss
// is a re-rollable random encounter, not a one-time scripted fight). Never
// opened from Arena. Borrows "title" mode like the prologue; same
// justOpenedX same-keydown-dispatch hazard (see openPrologue's comment) —
// this one has two possible synchronous-open call sites (the combat result
// confirm, and the perk overlay's onDone), so the listener below is
// registered after both.
let endingController: EndingController | null = null;
let justOpenedEnding = false;

function openEnding(): void {
  if (mapVisible) toggleMap();
  // Set the flag and try to persist it before the mode flip. autoSave()
  // refuses to write while state.mode === "title" (overlays aren't
  // resumable — see its comment), so this only actually reaches disk on
  // the direct-from-combat path (mode is still "combat" here); the
  // perk-overlay-chained path already has mode === "title" by the time
  // this runs. Either way, onDone below is the call that's guaranteed to
  // persist it, on both paths and both exits (confirm-through or Escape).
  state.hasCompletedEnding = true;
  autoSave(state);
  setMode(state, "title");
  showMode("title", mapVisible);
  setMessage(""); // critical: empty #message so it cannot cover the black field
  justOpenedEnding = true;
  endingController = new EndingController({
    panel: document.querySelector<HTMLDivElement>("#combat-panel")!,
    onDone: () => {
      endingController = null;
      // Flip out of "title" before saving — autoSave() no-ops in that mode
      // (see above), and this is the one guaranteed persist point for
      // hasCompletedEnding regardless of which path opened the screen.
      // "dungeon" is also the semantically correct resume state: Continue
      // after the ending should drop the party back in the dungeon, same
      // as any other post-boss-victory save (main.ts's plain post-combat
      // branch does the same setMode+showMode pair, no openTitleScreen()).
      setMode(state, "dungeon");
      showMode("dungeon", mapVisible);
      // Esc that closed the ending (and its key-repeat) must not open Save.
      suppressDungeonEscUntilKeyup = true;
      setMessage("The lamp is empty.");
      autoSave(state);
    },
  });
}

// --- Title screen --------------------------------------------------------
let titleController: TitleController | null = null;

/**
 * Apply a deserialized save into the live session (Continue path + debug
 * loadSave). Overlays / party creation / arena are not resumable — see
 * normalizeLoadedMode.
 */
function applyLoadedGameState(loaded: GameState): void {
  closeMapOverlay();
  mapOverlayRenderer.invalidate();
  Object.assign(state, loaded);
  state.mode = normalizeLoadedMode(state.mode);
  if (state.mode === "town") {
    openTown();
  } else {
    // Combat is converted to dungeon on save; any other mode resumes directly.
    setMazeSurfaceOpacity("1");
    showMode(state.mode, mapVisible);
    setMessage("Welcome back to the labyrinth.");
    if (state.mode === "dungeon") {
      markExplored();
      resetRenderCamera(state.player.x, state.player.y, state.player.facing);
    }
  }
}

// Start the game: show the title screen so the player can choose
// "New Game" or "Continue" (if an auto-save exists).
function openTitleScreen(): void {
  setMode(state, "title");
  showMode("title", mapVisible);
  setMessage("");
  window.focus();
  audio.startTitleMusic();
  titleController = new TitleController({
    panel: document.querySelector<HTMLDivElement>("#combat-panel")!,
    onNewGame: () => {
      titleController = null;
      // Reset the shared state to defaults so a leftover Arena session (or
      // an abandoned prior campaign) doesn't leak gold/inventory/progress
      // into the new campaign. Reform Party (townController.onReformParty)
      // reuses openPartyCreation without this reset, since it's meant to
      // keep the ongoing campaign's progress.
      // Title BGM keeps playing through the prologue; stop when it ends.
      closeMapOverlay();
      mapOverlayRenderer.invalidate();
      Object.assign(state, createGameState(getFloors()[0]!));
      openPrologue(() => {
        audio.stopTitleMusic();
        openPartyCreation(() => openTown({ showIntroHint: true }));
      });
    },
    onContinue: (loaded) => {
      titleController = null;
      audio.stopTitleMusic();
      applyLoadedGameState(loaded);
    },
    onArena: () => {
      titleController = null;
      audio.stopTitleMusic();
      openArenaSetup();
    },
  });
}

if (playtestFloor) {
  setMode(state, "dungeon");
  showMode("dungeon", false);
  setMazeSurfaceOpacity("1");
  resetRenderCamera(state.player.x, state.player.y, state.player.facing);
  setMessage(`Playtesting: ${playtestFloor.name}`);
  window.focus();
} else {
  openTitleScreen();
}

// --- Spell / item / loadout lookups (built once) -------------------------
const SPELLS_BY_ID: Record<string, (typeof ALL_SPELLS)[number]> = Object.fromEntries(
  ALL_SPELLS.map((s) => [s.id, s])
);

// Build the combat loadout map from the persisted GameState.equipment.
// Falls back to the default starter gear if a character has no entry.
function buildLoadoutMap(): Record<string, Loadout> {
  const map: Record<string, Loadout> = {};
  for (const c of state.party) {
    map[c.id] = state.equipment[c.id] ?? defaultLoadoutForCharacter(c);
  }
  return map;
}

// --- Encounter trigger ---------------------------------------------------

function maybeTriggerEncounter(): boolean {
  const baseRate = encounterRateAt(
    state.floor,
    state.player.x,
    state.player.y
  );
  const chance = encounterRollChance(baseRate, state.stepsSinceEncounter);
  if (chance <= 0) return false;
  // Design doc §6.2: treasure rooms are guaranteed empty of enemies.
  const cell = state.floor.grid[state.player.y]?.[state.player.x];
  if (cell?.tile === "treasure") return false;
  if (getGameplayRng()() >= chance) return false;

  const tableId = encounterTableFloorId(
    state.floor,
    state.player.x,
    state.player.y
  );
  const entry = rollEncounter(tableId);
  if (!entry) return false;

  const resolved = resolveEncounter(entry);
  if (resolved.length === 0) return false;

  const loadout = buildLoadoutMap();
  const combat = createCombatFromEncounter(
    state.party,
    resolved,
    SPELLS_BY_ID,
    ITEMS_BY_ID,
    loadout,
    state.inventory,
    state.inAntimagic
  );
  state.combat = combat;
  setMode(state, "combat");
  state.stepsSinceEncounter = 0;

  startCombat(combat);
  return true;
}

// --- Combat mode ---------------------------------------------------------
let combatController: CombatController | null = null;

// True for the whole encounter swirl / leave dissolve (including reveal).
// Key + controller handlers no-op while set — duration tracks boss / reduced-
// motion; no fixed setTimeout heuristic. Destination screens opened by
// leaveCombat's next() (game_over / perk / ending / arena) also check this.
let combatTransitionActive = false;

/**
 * Serialize startCombat / leaveCombat so a second wipe cannot begin while a
 * prior reveal still owns `#battle-transition` (Arena double-Enter race).
 * Failures in one job do not stall the chain.
 */
let combatTransitionTail: Promise<void> = Promise.resolve();

function withCombatTransition<T>(fn: () => Promise<T>): Promise<T> {
  const run = combatTransitionTail.then(async () => {
    combatTransitionActive = true;
    try {
      return await fn();
    } finally {
      combatTransitionActive = false;
    }
  });
  combatTransitionTail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function startCombat(combat: CombatState): Promise<void> {
  // Namanda's Blessing (Church of Saint Namanda, game/namanda.ts): a flat
  // party-wide armor bonus while the dungeon buff is active. Applied here,
  // once, so every real fight (dungeon encounters, NPC fights, the stairs
  // guardian, Arena) picks it up uniformly instead of threading a flag
  // through each of their individual createCombatFromEncounter call sites.
  applyNamandaBlessing(state, combat);
  // The one authored temporary companion (game/companion.ts) rides the same
  // summonedAllies channel as the Priest's BAMORDI/SOCORDI summons — a
  // simple AI-controlled combatant, not a real party slot — so it never
  // touches PARTY_SIZE/formation/save-schema assumptions. Never follows
  // into Arena, matching how boss music/ending never fire there either.
  if (!arenaController) {
    const ally = companionAsSummonedAlly(state);
    if (ally) combat.summonedAllies.push(ally);
  }
  return withCombatTransition(async () => {
    closeMapOverlay();
    state.combat = combat;
    // Mode flag only — keep dungeon painted until the swirl finishes.
    setMode(state, "combat");
    audio.playCombatSfx(combat.isBoss ? "bossAppear" : "encounterStart");
    if (combat.isBoss) {
      audio.startBossCombat();
    } else {
      audio.startBattleMusic();
    }

    // Corridor canvas is 1×1 when coming from title/arena (viewport hidden).
    // snapshotSource treats tiny sources as a dark field so the wipe still
    // reads; dungeon encounters get the live corridor pixels.
    await playEncounterTransition({ source: getMazeRendererSurface(), isBoss: combat.isBoss });

    showMode("combat", mapVisible);

    // Ensure renderer tilesets are loaded before baking the arena backdrop.
    // Textures are loaded at boot, but arena mode can start before that finishes.
    await loadTextures();

    const bd = renderBattleArena(state, 768, 672);
    const theme = resolveTilesetTheme(state.floor);
    const backdropId = `theme:${theme}`;

    const stage = await createCombatStage({
      state: combat,
      backdrop: bd,
      backdropId,
    });
    combatController = new CombatController(combat, {
      onEnd: (result: CombatState) => {
        endCombat(result);
      },
      backdrop: bd,
      backdropId,
      stage,
      getLastInputKind: () => globalInput.getLastInputKind(),
    });

    await revealAfterTransition();
  });
}

/**
 * Snapshot → dissolve to black → clear combat → run `next` (any of the five
 * post-combat destinations) → reveal. Owns teardown so wipe / arena / perk /
 * ending / dungeon all share one exit path.
 */
async function leaveCombat(next: () => void): Promise<void> {
  return withCombatTransition(async () => {
    const snap = combatController?.snapshotCanvas() ?? null;
    const source =
      snap && snap.width >= 16 && snap.height >= 16 ? snap : null;
    await playReturnTransition({ source });
    combatController?.destroy();
    state.combat = undefined;
    combatController = null;
    next();
    await revealAfterTransition();
  });
}

function endCombat(result: CombatState): void {
  // Always stop both combat beds so every wipe/flee/victory/arena exit is
  // safe regardless of which kind of encounter created this CombatState.
  audio.stopBattleMusic();
  audio.stopBossCombat();

  // Apply post-combat party state back to GameState.
  state.party = applyCombatPartyResult(result.party);

  // Write the (possibly depleted) combat inventory back to GameState,
  // preserving per-instance identification flags.
  state.inventory = reconcileInventoryAfterCombat(state.inventory, result.inventory);

  // Persist equipment changes from combat.
  state.equipment = { ...state.equipment, ...result.loadout };

  // Sync the companion's ending HP (or death) back onto persisted state.
  // No-op if no companion was traveling (e.g. an Arena fight never injects
  // one in the first place — see startCombat).
  syncCompanionAfterCombat(state, result.summonedAllies);

  // Perk choices queued by post-combat level-ups. Kept local to this flow; the
  // overlay consumes it and then returns to the dungeon / arena / ending.
  let pendingPerkChoices: PendingPerkChoice[] = [];

  if (result.result === "wipe") {
    // Century cycle §7.3 (supersedes the old design doc §9.1 entrance-retreat
    // for campaign wipes): the party revives, and openGameOver()'s Continue
    // sends them to town, not back into the dungeon.
    state.party = reviveKnockedOut(state.party);
    state.player.x = state.floor.startX;
    state.player.y = state.floor.startY;
    void leaveCombat(() => {
      openGameOver();
    });
    return;
  } else if (result.result === "fled") {
    setMessage("You fled from combat.");
  } else if (result.result === "victory") {
    // Award gold and XP from defeated enemies (accumulated during combat).
    const goldEarned = result.goldEarned;
    const xpEarned = result.xpEarned;
    state.partyGold += goldEarned;
    awardCombatXp(state.party, xpEarned);

    // Process post-combat level-ups for living party members.
    const levelUpMessages: string[] = [];
    state.party = state.party.map((c) => {
      if (c.hp <= 0) return c;
      const startLevel = c.level;
      const { character: char, tiersCrossed } = applyLevelUps(c, state.equipment[c.id]);
      pendingPerkChoices.push(...tiersCrossed);
      // One line per character even across multiple level-ups in a single
      // fight — "X reaches 14! X reaches 15!" was unreadable with a full
      // party leveling at once (see message-band truncation).
      if (char.level > startLevel) {
        levelUpMessages.push(`${char.name} reaches Level ${char.level}!`);
      }
      return char;
    });
    if (levelUpMessages.length > 0) audio.levelUp();

    const baseMsg = `Victory! +${goldEarned} gold, +${xpEarned} XP each.`;
    const levelMsg = levelUpMessages.length > 0 ? ` ${levelUpMessages.join(" ")}` : "";
    const climaxLoot = result.climaxId ? resolveClimaxVictory(state, result.climaxId) : "";
    const climaxLootMsg = climaxLoot ? ` ${climaxLoot}` : "";
    setMessage(baseMsg + levelMsg + climaxLootMsg);
  }

  // NPC fights: victory kills the NPC (tile cleared); fleeing leaves them
  // alive and unforgiving.
  if (npcFightId) {
    const npc = state.floor.npcs?.find((n) => n.id === npcFightId);
    if (npc) {
      if (result.result === "victory") {
        markKilled(state, npc);
        setMessage(
          `${npc.name} falls. +${result.goldEarned} gold, +${result.xpEarned} XP each.`
        );
      } else if (result.result === "fled") {
        adjustDisposition(state, npc, -20);
        setMessage(`You flee from ${npc.name}.`);
      }
    }
    npcFightId = null;
  }

  // Stairs guardian ("The Party That Returned"): victory permanently clears
  // the blocker (idempotent — a re-fought/reloaded guardian can't grant the
  // reward twice); flee/wipe leave it uncleared so the tile still blocks the
  // stairs on the next approach. See game/features.ts handleStairsGuardian.
  if (pendingStairsGuardianFight) {
    const guardian = pendingStairsGuardianFight;
    if (result.result === "victory" && clearStairsGuardian(state, guardian)) {
      if (guardian.rewardItemId) {
        state.inventory.push({ itemId: guardian.rewardItemId, identified: true });
      }
      setMessage(guardian.victoryLine);
    }
    pendingStairsGuardianFight = null;
  }

  // The wish (§6): floor-5 boss victory, once per campaign. The floor-5 boss
  // pack is a re-rollable random encounter (data/enemies.ts ENCOUNTER_TABLES,
  // weight: 1 like any other pack), not a one-time scripted fight — so a
  // second win is fully possible, and hasCompletedEnding (not "isBoss won"
  // alone) is what stops it from re-opening this screen.
  const triggersEnding =
    result.result === "victory" &&
    result.isBoss &&
    state.floor.id === 5 &&
    !state.hasCompletedEnding;

  void leaveCombat(() => {
    if (inArena) {
      const onDone = () => {
        openArena();
      };
      if (pendingPerkChoices.length > 0) {
        openPerkSelectOverlay(pendingPerkChoices, onDone);
      } else {
        onDone();
      }
      return;
    }

    if (pendingPerkChoices.length > 0) {
      openPerkSelectOverlay(pendingPerkChoices, triggersEnding ? openEnding : undefined);
    } else if (triggersEnding) {
      openEnding();
    } else {
      setMode(state, "dungeon");
      showMode("dungeon", mapVisible);
    }
  });
}

// --- Perk selection overlay ----------------------------------------------
let perkSelectController: PerkSelectController | null = null;

function openPerkSelectOverlay(queue: PendingPerkChoice[], onDone?: () => void): void {
  setMode(state, "title");
  showMode("title", mapVisible);
  setMazeSurfaceOpacity("0.2");
  perkSelectController = new PerkSelectController({
    panel: document.querySelector<HTMLDivElement>("#combat-panel")!,
    state,
    queue,
    onDone: () => {
      perkSelectController = null;
      setMazeSurfaceOpacity("1");
      if (onDone) {
        onDone();
      } else {
        setMode(state, "dungeon");
        showMode("dungeon", mapVisible);
      }
    },
  });
}

window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (state.mode !== "title" || !perkSelectController) return;
  if (combatTransitionActive) {
    e.preventDefault();
    return;
  }
  perkSelectController.handleKey(e.key);
  e.preventDefault();
});

// --- Game over mode ------------------------------------------------------
let gameOverController: GameOverController | null = null;

function openGameOver(): void {
  setMode(state, "game_over");
  showMode("game_over", mapVisible);
  setMessage("");
  // §7.1: campaign wipes advance the century cycle before the screen renders
  // so the player reads the *new* year; Arena wipes never advance it.
  if (!inArena) {
    state.worldYear += 100;
  }
  gameOverController = new GameOverController({
    panel: document.querySelector<HTMLDivElement>("#combat-panel")!,
    party: state.party,
    floorName: state.floor.name,
    worldYear: state.worldYear,
    inArena,
    onContinue: () => {
      gameOverController = null;
      if (inArena) {
        openArena();
      } else {
        // §7.3: wipe returns the party to town, not the dungeon entrance.
        // Keep the deepest floor reached (no soft-reset) but land on that
        // floor's start tile for a clean next Enter Dungeon.
        state.lastDungeon = {
          floorId: state.floor.id,
          x: state.floor.startX,
          y: state.floor.startY,
          facing: 0,
        };
        openTown();
      }
    },
  });
}

/** Cleanly exit the current combat for automated visual testing. */
function exitDebugCombat(result: "victory" | "wipe" | "fled"): void {
  if (!combatController || !state.combat) return;
  state.combat.result = result;
  state.combat.ended = true;
  // Soft-stop only — leaveCombat snapshots the stage then destroy()s.
  combatController.stop();
  endCombat(state.combat);
}

// --- Camp mode -----------------------------------------------------------
let campController: CampController | null = null;

function startCamp(): void {
  // Design doc §5.2: cannot camp on hazard tiles (teleporters, chutes,
  // stairs — or standing in water).
  const cell = state.floor.grid[state.player.y]?.[state.player.x];
  const tile = cell?.tile;
  if (tile === "teleporter" || tile === "chute" || tile === "stairs_up" || tile === "stairs_down" || tile === "water") {
    setMessage("You can't make camp here — the ground is unstable.");
    return;
  }
  setMode(state, "camp");
  if (mapVisible) toggleMap();
  showMode("camp", mapVisible);
  setMessage("");

  state.dayCount++;
  // A night's rest dispels standing magic (light/levitation) — re-cast after,
  // from the camp menu or the dungeon G menu.
  clearBuffs(state);
  campController = new CampController({
    panel: document.querySelector<HTMLDivElement>("#combat-panel")!,
    party: state.party,
    dayCount: state.dayCount,
    state,
    onEnd: () => {
      campController = null;
      setMode(state, "dungeon");
      showMode("dungeon", mapVisible);
      setMessage(`The party rests. Day ${state.dayCount}. HP and SP restored.`);
    },
  });
}

// --- Input ---------------------------------------------------------------

/**
 * Schedule a footstep sound at the midpoint of the smooth movement
 * animation. The renderer's move animation is 150ms (RENDER_CONFIG.
 * moveAnimDuration), so the footstep fires at ~75ms — the moment the
 * camera is "passing through" the cell boundary.
 */
function scheduleFootstep(): void {
  const MOVE_ANIM_MS = 150;
  setTimeout(() => audio.footstep(), MOVE_ANIM_MS / 2);
}

function syncAbyssExposure(): void {
  audio.setAbyssExposure(isOnAbyssBridge(state));
}

function presentAbyssCue(cue: AmbientBarkCue | null): void {
  if (!cue) return;
  showAmbientBark({
    speakerId: cue.speakerId,
    speaker: cue.speaker,
    text: cue.text,
    durationMs: cue.durationMs,
    onShow: cue.sfx === "abyss-fart" ? () => audio.playAbyssFart() : undefined,
  });
}

function onMove(): void {
  if (state.mode !== "dungeon") return;
  // Safe-zone pity preservation: if the player is in a safe zone, do NOT
  // increment stepsSinceEncounter. Pity pauses while inside and resumes
  // from its pre-hub value when leaving.
  if (isSafeZoneAt(state.floor, state.player.x, state.player.y)) {
    // Still process tile features and buff ticks, but skip encounter pity.
    const expiry = tickBuffs(state);
    const steppedOn = {
      tile: state.floor.grid[state.player.y]?.[state.player.x]?.tile ?? null,
      x: state.player.x,
      y: state.player.y,
      floorId: state.floor.id,
    };
    const result = handleTileFeature(state);
    if (result) {
      recordDebugEvent("feature", {
        ...steppedOn,
        message: result.message,
        looted: result.looted ?? false,
        changedFloor: result.changedFloor ?? false,
        npcId: result.npcId ?? null,
      });
      if (result.looted) audio.playDungeonSfx("chestOpen");
      if (!state.pendingTrap) {
        setMessage([...expiry, result.message].join(" "));
      }
      if (result.changedFloor) {
        markExplored();
        resetRenderCamera(state.player.x, state.player.y, state.player.facing);
        syncAbyssExposure();
        return;
      }
      if (result.npcId) {
        openNPCPanel(result.npcId);
        return;
      }
      if (result.pendingChuteDrop) {
        const drop = result.pendingChuteDrop;
        openDungeonDialog({
          lines: [
            "A steep sluice disappears into darkness. There may be no way back up.",
          ],
          choices: [
            { label: "Descend", value: "descend" },
            { label: "Step away", value: "cancel" },
          ],
          onSelect: (value) => {
            if (value === "descend") {
              const dropResult = confirmChuteDrop(state, drop);
              if (dropResult.changedFloor) {
                markExplored();
                resetRenderCamera(state.player.x, state.player.y, state.player.facing);
              }
              setMessage(dropResult.message);
            }
          },
        });
        return;
      }
      if (result.pendingStairsGuardian) {
        const guardian = result.pendingStairsGuardian;
        openDungeonDialog({
          // No choices, so this dialog never reaches DungeonDialogController's
          // choice-menu phase — Escape and Enter both just advance/dismiss
          // text pages there, same as any other pure-text dialog. The real
          // guarantee that this can't be skipped is the sealed edge
          // (StairsGuardianDef.blocksDir), not a dialog-level cancel guard.
          lines: guardian.introLines,
          onSelect: () => {
            startStairsGuardianFight(guardian);
          },
        });
        return;
      }
    } else if (expiry.length > 0) {
      setMessage(expiry.join(" "));
    }
    // Skip maybeTriggerEncounter — safe zones suppress all random encounters.
    return;
  }
  state.stepsSinceEncounter = stepPity(
    state.floor,
    state.player.x,
    state.player.y,
    state.stepsSinceEncounter
  );

  // Tick persistent spell buffs (light/levitation) BEFORE processing the
  // tile, so a light that just expired doesn't still counter this darkness.
  const expiry = tickBuffs(state);

  // Snapshotted before handleTileFeature, which may move the party to another
  // floor and leave state.player pointing at the destination tile.
  const steppedOn = {
    tile: state.floor.grid[state.player.y]?.[state.player.x]?.tile ?? null,
    x: state.player.x,
    y: state.player.y,
    floorId: state.floor.id,
  };

  // Process the tile feature at the player's current position.
  const result = handleTileFeature(state);
  if (result) {
    recordDebugEvent("feature", {
      ...steppedOn,
      message: result.message,
      looted: result.looted ?? false,
      changedFloor: result.changedFloor ?? false,
      npcId: result.npcId ?? null,
    });
    if (result.looted) audio.playDungeonSfx("chestOpen");
    if (!state.pendingTrap) {
      setMessage([...expiry, result.message].join(" "));
    }
    if (result.changedFloor) {
      // Floor transition happened — mark explored on the new floor and snap
      // the render camera instantly to the new position (don't slide across
      // floors).
      markExplored();
      resetRenderCamera(state.player.x, state.player.y, state.player.facing);
      syncAbyssExposure();
      // Don't trigger encounters on the same step as a floor transition.
      return;
    }
    if (result.npcId) {
      // Stepped onto a living NPC — open the interaction panel instead of
      // rolling an encounter.
      openNPCPanel(result.npcId);
      return;
    }
    if (result.pendingChuteDrop) {
      // Stepped onto a chute that requires confirmation — show a
      // point-of-no-return dialog instead of dropping immediately.
      const drop = result.pendingChuteDrop;
      openDungeonDialog({
        lines: [
          "A steep sluice disappears into darkness. There may be no way back up.",
        ],
        choices: [
          { label: "Descend", value: "descend" },
          { label: "Step away", value: "cancel" },
        ],
        onSelect: (value) => {
          if (value === "descend") {
            const dropResult = confirmChuteDrop(state, drop);
            if (dropResult.changedFloor) {
              markExplored();
              resetRenderCamera(state.player.x, state.player.y, state.player.facing);
            }
            setMessage(dropResult.message);
          }
        },
      });
      return;
    }
    if (result.pendingStairsGuardian) {
      const guardian = result.pendingStairsGuardian;
      openDungeonDialog({
        // No choices, so this dialog never reaches DungeonDialogController's
        // choice-menu phase — Escape and Enter both just advance/dismiss
        // text pages there, same as any other pure-text dialog. The real
        // guarantee that this can't be skipped is the sealed edge
        // (StairsGuardianDef.blocksDir), not a dialog-level cancel guard.
        lines: guardian.introLines,
        onSelect: () => {
          startStairsGuardianFight(guardian);
        },
      });
      return;
    }
  } else if (expiry.length > 0) {
    setMessage(expiry.join(" "));
  }

  if (state.pendingTrap) {
    // Trap choices own dungeon input without changing GameMode, so they need
    // the same explicit quick-map cleanup as other blocking overlays.
    closeMapOverlay();
    if (!trapPrompt) {
      trapPrompt = new TrapPromptController();
      // Swallow the opening step key (same keydown may reach the trap
      // listener and wrap Inspect→Leave). Clear on next macrotask so the
      // player's first intentional A/B is not also swallowed.
      justOpenedTrapPrompt = true;
      setTimeout(() => {
        justOpenedTrapPrompt = false;
      }, 0);
    }
    setMessage(trapPrompt.renderMessage(state.pendingTrap.inspected), {
      instant: true,
    });
  } else {
    trapPrompt = null;
    justOpenedTrapPrompt = false;
  }

  maybeTriggerEncounter();
}

/**
 * Execute a traversal result from resolveTraversal(). Handles ordinary
 * steps, blocked moves, raft-route triggers, and barred-gate interactions.
 */
function handleTraversalResult(result: TraversalResult, dir: Direction): void {
  switch (result.kind) {
    case "step": {
      const from = { x: state.player.x, y: state.player.y };
      state.player.x = result.x;
      state.player.y = result.y;
      presentAbyssCue(resolveAbyssFaceStep(state, from, result));
      syncAbyssExposure();
      markExplored();
      onMove();
      scheduleFootstep();
      break;
    }
    case "blocked": {
      audio.wallBump();
      if (result.message) {
        // Show blocking dialog for raft-channel messages.
        openDungeonDialog({
          lines: [result.message],
          cancelable: true,
        });
      }
      break;
    }
    case "raft": {
      // Find the route and start the animation.
      const route = state.floor.raftRoutes?.find((r) => r.id === result.routeId);
      if (route) {
        startRaftAnimation(route, result.reverse);
      }
      break;
    }
    case "barred-gate": {
      if (result.canOpen) {
        // Open the gate from this side.
        openBarredGate(state, dir);
        audio.doorOpen();
        setMessage("You lift the bar and push the gate open.");
        // Now step through.
        const stepResult = resolveTraversal(state, dir);
        if (stepResult.kind === "step") {
          const from = { x: state.player.x, y: state.player.y };
          state.player.x = stepResult.x;
          state.player.y = stepResult.y;
          presentAbyssCue(resolveAbyssFaceStep(state, from, stepResult));
          syncAbyssExposure();
          markExplored();
          onMove();
          scheduleFootstep();
        }
      } else {
        audio.wallBump();
        openDungeonDialog({
          lines: [result.message ?? "A barred gate blocks the way."],
          cancelable: true,
        });
      }
      break;
    }
  }
}

/** Start a raft route animation. */
function startRaftAnimation(route: NonNullable<FloorDef["raftRoutes"]>[number], reverse: boolean): void {
  // Show boarding message as a blocking dialog, then start animation.
  openDungeonDialog({
    lines: ["You step onto the raft. It carries you across the water..."],
    onClose: () => {
      // Start the animation after the boarding message is dismissed.
      raftAnimation = new RaftAnimationController({
        state,
        route,
        reverse,
        onComplete: () => {
          raftAnimation = null;
          markExplored();
          setMessage("The raft nudges against the far dock. You step off.");
        },
        onInterrupt: () => {
          raftAnimation = null;
          setMessage("The crossing was interrupted. You return to a dock.");
        },
      });
      raftAnimation.start();
    },
  });
}

/** Open a blocking dungeon dialog. */
function openDungeonDialog(opts: {
  lines: string[];
  choices?: { label: string; value: string }[];
  title?: string;
  onSelect?: (value: string) => void;
  onClose?: () => void;
  cancelable?: boolean;
}): void {
  dungeonDialog = new DungeonDialogController({
    state: state as { mode: string },
    panel: document.querySelector<HTMLDivElement>("#combat-panel")!,
    lines: opts.lines,
    choices: opts.choices,
    title: opts.title,
    onSelect: opts.onSelect,
    onClose: () => {
      dungeonDialog = null;
      // Swallow the closing keypress so it doesn't also move the player.
      suppressDungeonMovementUntilKeyup = true;
      showMode("dungeon", mapVisible);
      opts.onClose?.();
    },
    cancelable: opts.cancelable,
  });
  justOpenedDungeonDialog = true;
  setTimeout(() => { justOpenedDungeonDialog = false; }, 0);
  dungeonDialog.open();
  showMode("dialog", mapVisible);
}

const dungeonHandlers: InputHandlers = {
  onForward: () => {
    if (combatTransitionActive) return;
    if (suppressDungeonMovementUntilKeyup) return;
    if (isRaftAnimating(raftAnimation)) return;
    if (state.mode === "dungeon" && !mapVisible && !state.pendingTrap && !isRenderCameraAnimating()) {
      audio.resume();
      clearMessageOnPlayerAction();
      const result = resolveTraversal(state, state.player.facing as Direction);
      handleTraversalResult(result, state.player.facing as Direction);
    }
  },
  onBackward: () => {
    if (combatTransitionActive) return;
    if (suppressDungeonMovementUntilKeyup) return;
    if (isRaftAnimating(raftAnimation)) return;
    if (state.mode === "dungeon" && !mapVisible && !state.pendingTrap && !isRenderCameraAnimating()) {
      audio.resume();
      clearMessageOnPlayerAction();
      const behindDir = ((state.player.facing + 2) % 4) as Direction;
      const result = resolveTraversal(state, behindDir);
      handleTraversalResult(result, behindDir);
    }
  },
  onTurnLeft: () => {
    if (combatTransitionActive) return;
    if (state.mode === "dungeon" && !mapVisible && !state.pendingTrap && !isRenderCameraAnimating()) {
      audio.resume();
      clearMessageOnPlayerAction();
      turnLeft(state);
      markExplored();
      presentAbyssCue(resolveAbyssFaceTurn(state));
    }
  },
  onTurnRight: () => {
    if (combatTransitionActive) return;
    if (state.mode === "dungeon" && !mapVisible && !state.pendingTrap && !isRenderCameraAnimating()) {
      audio.resume();
      clearMessageOnPlayerAction();
      turnRight(state);
      markExplored();
      presentAbyssCue(resolveAbyssFaceTurn(state));
    }
  },
  onCamp: () => {
    if (combatTransitionActive) return;
    if (state.mode === "dungeon" && !mapVisible && !state.pendingTrap) {
      clearMessageOnPlayerAction();
      startCamp();
    }
  },
  onToggleMap: () => {
    if (combatTransitionActive) return;
    if (state.mode === "dungeon" && !state.pendingTrap) {
      clearMessageOnPlayerAction();
      toggleMap();
    }
  },
  onToggleMapOverlay: () => {
    if (combatTransitionActive) return;
    const handled = toggleMapOverlayState(mapOverlayState, {
      mode: state.mode,
      fullMapVisible: mapVisible,
      blocked: !!state.pendingTrap,
    });
    if (!handled) return;
    clearMessageOnPlayerAction();
    if (mapOverlayState.visible) mapOverlayRenderer.invalidate();
    showMode("dungeon", mapVisible);
  },
  onSystemMenu: () => {
    if (combatTransitionActive) return;
    // In town mode, Esc is handled by the town controller (back from
    // sub-screens). Only open the save menu from the town main menu.
    // While a trap prompt is up, Esc means "leave the chest" (handled by the
    // trap key listener below).
    if (state.mode !== "dungeon" || state.pendingTrap) return;
    if (suppressDungeonEscUntilKeyup) return;
    if (mapVisible) {
      toggleMap();
      return;
    }
    clearMessageOnPlayerAction();
    openSaveMenu();
  },
  onTown: () => {
    if (combatTransitionActive) return;
    if (state.mode === "dungeon" && !mapVisible && !state.pendingTrap) {
      clearMessageOnPlayerAction();
      returnToTown();
    }
  },
  onCastSpell: () => {
    if (combatTransitionActive) return;
    if (state.mode === "dungeon" && !mapVisible && !state.pendingTrap) {
      clearMessageOnPlayerAction();
      openSpellMenu();
    }
  },
  onActionRing: () => {
    if (combatTransitionActive) return;
    if (state.mode === "dungeon" && !mapVisible && !state.pendingTrap) {
      clearMessageOnPlayerAction();
      openActionRing();
    }
  },
  onUnlock: () => {
    if (combatTransitionActive) return;
    if (state.mode === "dungeon" && !mapVisible && !state.pendingTrap) {
      audio.resume();
      clearMessageOnPlayerAction();
      const msg = tryUnlock(state);
      setMessage(msg);
      // Play the appropriate door sound based on the result.
      if (
        msg.includes("unlock") ||
        msg.includes("picks the lock") ||
        msg.includes("lock yields")
      ) {
        audio.doorOpen();
      } else if (msg.includes("locked") || msg.includes("no locked door")) {
        audio.doorLocked();
      }
    }
  },
};

bindInput(window, dungeonHandlers, {
  shouldHandle: () =>
    state.mode === "dungeon" && !state.pendingTrap && !isRaftAnimating(raftAnimation),
});
bindMapOverlayButton(dungeonHandlers.onToggleMapOverlay);

// --- Dungeon dialog mode --------------------------------------------------
// Active while state.mode === "dialog" (blocking dungeon dialogs: raft
// warnings, boarding messages, gate prompts, chute warnings). All dungeon
// movement/turning/encounters are suppressed by the shouldHandle guard
// above (mode !== "dungeon"). These keys drive the dialog controller.

window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (state.mode !== "dialog") return;
  if (!dungeonDialog) return;
  if (justOpenedDungeonDialog) {
    e.preventDefault();
    return;
  }
  dungeonDialog.handleKey(e.key);
  e.preventDefault();
});

window.addEventListener("keyup", () => {
  if (suppressDungeonMovementUntilKeyup) {
    suppressDungeonMovementUntilKeyup = false;
  }
});

// --- Trapped chest prompt --------------------------------------------------
// Active while state.pendingTrap is set (the party is standing on a trapped,
// unopened chest). Movement/camp/town/save inputs are gated off above; these
// keys drive the chest interaction from game/features.ts.

/** Route a chest action result: message, camera snap, forced encounter. */
function applyChestResult(result: ChestActionResult): void {
  if (!result.message) return;
  if (result.opened && !result.alarm) audio.playDungeonSfx("chestOpen");
  setMessage(result.message);
  if (result.relocated) {
    // Teleporter trap moved the party — snap the camera, no slide.
    markExplored();
    resetRenderCamera(state.player.x, state.player.y, state.player.facing);
  }
  if (result.alarm) {
    forceEncounter();
  }
}

/** Alarm trap: start an encounter immediately, ignoring cooldown and rate. */
function forceEncounter(): void {
  const tableId = encounterTableFloorId(
    state.floor,
    state.player.x,
    state.player.y
  );
  const entry = rollEncounter(tableId);
  if (!entry) return;
  const resolved = resolveEncounter(entry);
  if (resolved.length === 0) return;

  const loadout = buildLoadoutMap();
  const combat = createCombatFromEncounter(
    state.party,
    resolved,
    SPELLS_BY_ID,
    ITEMS_BY_ID,
    loadout,
    state.inventory,
    state.inAntimagic
  );
  const pending = state.pendingClimax;
  const isCurrentClimax =
    pending !== undefined &&
    pending.floorId === state.floor.id &&
    pending.x === state.player.x &&
    pending.y === state.player.y;
  combat.climaxId = isCurrentClimax ? pending.id : undefined;
  state.combat = combat;
  setMode(state, "combat");
  state.stepsSinceEncounter = 0;
  startCombat(combat);
}

/** Route trap prompt keys (keyboard or adapter) to features.ts chest APIs. */
function handleTrapInput(key: string): boolean {
  if (state.mode !== "dungeon" || !state.pendingTrap || !trapPrompt) return false;
  if (justOpenedTrapPrompt) {
    justOpenedTrapPrompt = false;
    return true;
  }
  const action = trapPrompt.handleKey(key);
  if (action === null) {
    // Instant: cursor moves must not restart the typewriter.
    setMessage(trapPrompt.renderMessage(state.pendingTrap.inspected), {
      instant: true,
    });
    return true;
  }
  switch (action) {
    case "inspect": {
      const msg = inspectChest(state);
      setMessage(msg);
      break;
    }
    case "disarm":
      applyChestResult(disarmChest(state));
      if (state.pendingTrap && trapPrompt) {
        setMessage(trapPrompt.renderMessage(state.pendingTrap.inspected), {
          instant: true,
        });
      } else {
        trapPrompt = null;
      }
      break;
    case "open":
      applyChestResult(openChest(state));
      trapPrompt = null;
      break;
    case "leave":
      setMessage(leaveChest(state));
      trapPrompt = null;
      break;
  }
  return true;
}

function openActionRing(): void {
  if (
    perkSelectController ||
    saveController ||
    spellMenuController ||
    npcController ||
    tavernController ||
    namandaController ||
    actionRingController
  ) {
    return;
  }
  if (state.mode !== "dungeon" || state.pendingTrap || mapVisible || isRenderCameraAnimating()) {
    return;
  }
  setMode(state, "title");
  showMode("title", mapVisible);
  setMazeSurfaceOpacity("0.2");
  // No justOpened* guard: Start opens the ring on the dungeon route and is
  // never fed into the ring's handleKey (unlike Esc→save), so the first A/B
  // must confirm/cancel immediately.
  pendingRingAction = null;
  actionRingController = new DungeonActionRingController({
    panel: document.querySelector<HTMLDivElement>("#combat-panel")!,
    onCamp: () => {
      pendingRingAction = "camp";
    },
    onToggleMap: () => {
      pendingRingAction = "map";
    },
    onCastSpell: () => {
      pendingRingAction = "grimoire";
    },
    onUnlock: () => {
      pendingRingAction = "unlock";
    },
    onTown: () => {
      pendingRingAction = "town";
    },
    onClose: () => {
      actionRingController = null;
      setMazeSurfaceOpacity("1");
      setMode(state, "dungeon");
      showMode("dungeon", mapVisible);
      setMessage("");
      const action = pendingRingAction;
      pendingRingAction = null;
      if (action === "camp") dungeonHandlers.onCamp();
      else if (action === "map") dungeonHandlers.onToggleMap();
      else if (action === "grimoire") dungeonHandlers.onCastSpell();
      else if (action === "unlock") dungeonHandlers.onUnlock();
      else if (action === "town") dungeonHandlers.onTown();
    },
  });
}

/**
 * Live controller flags for `resolveControllerRoute`. Shared by the input
 * router and the ?debug=1 snapshot so the two can never disagree about which
 * overlay actually owns input (four of them borrow mode "title").
 */
function currentRouteFlags(): ControllerRouteContext {
  return {
    mode: state.mode,
    hasPerkSelect: !!perkSelectController,
    hasCombat: !!combatController,
    hasSave: !!saveController,
    hasSpellMenu: !!spellMenuController,
    hasNpc: !!npcController,
    hasTavern: !!tavernController,
    hasNamanda: !!namandaController,
    hasActionRing: !!actionRingController,
    hasTown: !!townController,
    hasCamp: !!campController,
    hasGameOver: !!gameOverController,
    hasPartyCreation: !!partyCreationController,
    hasPrologue: !!prologueController,
    hasEnding: !!endingController,
    hasTitle: !!titleController,
    hasPendingTrap: !!state.pendingTrap,
    hasTrapPrompt: !!trapPrompt,
  };
}


function routeControllerEvent(event: ControllerInputEvent): void {
  if (combatTransitionActive) return;
  const route = resolveControllerRoute(currentRouteFlags());

  switch (route) {
    case "perk": {
      const key = controllerEventToMenuKey(event);
      if (key) perkSelectController!.handleKey(key);
      return;
    }
    case "combat":
      combatController!.handleInput(event);
      return;
    case "save": {
      if (justOpenedSaveMenu) {
        if (event.kind === "press") justOpenedSaveMenu = false;
        return;
      }
      const key = controllerEventToMenuKey(event);
      if (key) saveController!.handleKey(key);
      return;
    }
    case "spell": {
      if (justOpenedSpellMenu) {
        if (event.kind === "press") justOpenedSpellMenu = false;
        return;
      }
      const key = controllerEventToMenuKey(event);
      if (key) spellMenuController!.handleKey(key);
      return;
    }
    case "npc": {
      if (justOpenedNPCPanel) {
        if (event.kind === "press") justOpenedNPCPanel = false;
        return;
      }
      const key = controllerEventToMenuKey(event);
      if (key) npcController!.handleKey(key);
      return;
    }
    case "tavern": {
      if (justOpenedTavernPanel) {
        if (event.kind === "press") justOpenedTavernPanel = false;
        return;
      }
      const key = controllerEventToMenuKey(event);
      if (key) tavernController!.handleKey(key);
      return;
    }
    case "action_ring": {
      const key = controllerEventToMenuKey(event);
      if (key) actionRingController!.handleKey(key);
      return;
    }
    case "town": {
      if (justOpenedTown) {
        if (event.kind === "press") justOpenedTown = false;
        return;
      }
      const key = controllerEventToMenuKey(event);
      if (key) townController!.handleKey(key);
      return;
    }
    case "camp": {
      const key = controllerEventToMenuKey(event);
      if (key) campController!.handleKey(key);
      return;
    }
    case "game_over": {
      const key = controllerEventToMenuKey(event);
      if (key) gameOverController!.handleKey(key);
      return;
    }
    case "party_creation": {
      // Local DAS/ARR in PartyCreationController needs release to clear held dir.
      if (
        event.kind === "release" &&
        (event.button === "left" || event.button === "right")
      ) {
        partyCreationController!.releaseDirection(event.button === "left" ? -1 : 1);
        return;
      }
      const key = controllerEventToMenuKey(event);
      if (key) partyCreationController!.handleKey(key);
      return;
    }
    case "prologue": {
      if (justOpenedPrologue) {
        if (event.kind === "press") justOpenedPrologue = false;
        return;
      }
      const key = controllerEventToMenuKey(event);
      if (key) prologueController!.handleKey(key);
      return;
    }
    case "ending": {
      if (justOpenedEnding) {
        if (event.kind === "press") justOpenedEnding = false;
        return;
      }
      const key = controllerEventToMenuKey(event);
      if (key) endingController!.handleKey(key);
      return;
    }
    case "title": {
      const key = controllerEventToMenuKey(event);
      if (key) titleController!.handleKey(key);
      return;
    }
    case "arena": {
      if (justOpenedArena) {
        if (event.kind === "press") justOpenedArena = false;
        return;
      }
      const key = controllerEventToMenuKey(event);
      if (!key) return;
      if (arenaSetupController) {
        arenaSetupController.handleKey(key);
        return;
      }
      if (arenaController) {
        arenaController.handleKey(key);
      }
      return;
    }
    case "trap": {
      const key = controllerEventToMenuKey(event);
      if (key) handleTrapInput(key);
      return;
    }
    case "dungeon":
      break;
    default:
      return;
  }

  // Dungeon exploration (press-only)
  if (event.kind !== "press") return;

  switch (event.button) {
    case "up":
      if (!mapVisible && !state.pendingTrap && !isRenderCameraAnimating()) {
        dungeonHandlers.onForward();
      }
      break;
    case "down":
      if (!mapVisible && !state.pendingTrap && !isRenderCameraAnimating()) {
        dungeonHandlers.onBackward();
      }
      break;
    case "left":
      if (!mapVisible && !state.pendingTrap && !isRenderCameraAnimating()) {
        dungeonHandlers.onTurnLeft();
      }
      break;
    case "right":
      if (!mapVisible && !state.pendingTrap && !isRenderCameraAnimating()) {
        dungeonHandlers.onTurnRight();
      }
      break;
    case "b":
      // Cancel closes the map (M / Esc on keyboard). Select also closes via
      // onSystemMenu; Start toggles below — B is the obvious pad cancel.
      if (mapVisible) {
        dungeonHandlers.onToggleMap();
      }
      break;
    case "select":
      dungeonHandlers.onSystemMenu();
      break;
    case "start":
      if (mapVisible) {
        // Mirror keyboard M — Start opened the ring that toggled the map on,
        // so the same button can dismiss it without needing the ring again.
        dungeonHandlers.onToggleMap();
      } else if (!isRenderCameraAnimating()) {
        clearMessageOnPlayerAction();
        openActionRing();
      }
      break;
    case "y":
      // Quick-map counterpart to keyboard V. This remains nonmodal, so the
      // movement buttons keep working while the overlay is visible.
      dungeonHandlers.onToggleMapOverlay();
      break;
    case "a": {
      // Contextual A = Unlock when facing a locked door (input-adaptive glyph).
      const kind = globalInput.getLastInputKind();
      const prompt = resolveContextualPrompt(state, kind);
      if (prompt?.action === "unlock") {
        dungeonHandlers.onUnlock();
      }
      break;
    }
    default:
      break;
  }
}

const globalInput = createControllerInput((event) => {
  routeControllerEvent(event);
}, { attachListeners: false });

// handleTrapInput returns false when no trap is active — let other listeners run.
window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (!handleTrapInput(e.key)) return;
  e.preventDefault();
});

// One-shot listener: resume the AudioContext on the first keydown anywhere.
// Browser autoplay policies require a user gesture before audio can start.
// This fires once, resumes audio, then removes itself.
const resumeAudioOnce = () => {
  audio.resume();
  window.removeEventListener("keydown", resumeAudioOnce);
};
window.addEventListener("keydown", resumeAudioOnce);

// Clear the post-ending Esc swallow once the physical key is released so a
// later intentional Esc can open Save.
window.addEventListener("keyup", (e: KeyboardEvent) => {
  if (e.key === "Escape") suppressDungeonEscUntilKeyup = false;
});

// Auto-save when the player leaves or reloads the page so the next session
// can resume where they left off.
window.addEventListener("beforeunload", () => {
  autoSave(state, inArena);
});

// Combat key handler — separate listener that only fires in combat mode.
window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (state.mode !== "combat" || !combatController) return;
  if (combatTransitionActive) {
    e.preventDefault();
    return;
  }

  // Playback/meta keys and Repeat (not face-button mapped).
  const phase = combatController.getPhase();
  if (
    phase === "playback" &&
    (e.key === "Shift" || e.key === "Tab" || e.key === "Escape")
  ) {
    combatController.handleKey(e.key, e);
    e.preventDefault();
    return;
  }
  if (e.key === "q" || e.key === "Q" || e.key === "z" || e.key === ".") {
    combatController.handleKey(e.key, e);
    e.preventDefault();
    return;
  }
  // Magic-sheet number tabs are controller-owned shortcuts, not normalized
  // face-button input. Route them directly just like the palette letters.
  if (phase === "selectSpell" && /^[1-5]$/.test(e.key)) {
    combatController.handleKey(e.key, e);
    e.preventDefault();
    return;
  }
  if (phase === "palette") {
    const lower = e.key.toLowerCase();
    if (lower in PALETTE_LETTER_SHORTCUTS) {
      combatController.handleKey(e.key, e);
      e.preventDefault();
      return;
    }
  }
  if (phase === "result" && (e.key === "Enter" || e.key === " ")) {
    combatController.handleKey(e.key, e);
    e.preventDefault();
    return;
  }

  globalInput.handleKeyboardDown(e);
  e.preventDefault();
});

window.addEventListener("keyup", (e: KeyboardEvent) => {
  if (state.mode !== "combat" || !combatController) return;
  if (combatTransitionActive) return;
  if (e.key === "Shift") {
    combatController.handleKeyUp(e.key);
  }
  globalInput.handleKeyboardUp(e);
});

// Camp key handler — dismisses the camp screen after the animation finishes.
window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (state.mode !== "camp" || !campController) return;
  campController.handleKey(e.key);
  e.preventDefault();
});

// Game-over key handler — dismisses the screen and revives the party.
window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (state.mode !== "game_over" || !gameOverController) return;
  if (combatTransitionActive) {
    e.preventDefault();
    return;
  }
  gameOverController.handleKey(e.key);
  e.preventDefault();
});

// Town key handler — routes keys to the TownController.
window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (state.mode !== "town" || !townController) return;
  if (justOpenedTown) {
    justOpenedTown = false;
    e.preventDefault();
    return;
  }
  townController.handleKey(e.key);
  e.preventDefault();
});

// Party-creation key handler — routes keys to the PartyCreationController.
window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (state.mode !== "party_creation" || !partyCreationController) return;
  partyCreationController.handleKey(e.key);
  e.preventDefault();
});

// Clear held Left/Right so local DAS/ARR stops (mirrors gamepad release).
window.addEventListener("keyup", (e: KeyboardEvent) => {
  if (state.mode !== "party_creation" || !partyCreationController) return;
  const lower = e.key.toLowerCase();
  if (lower === "arrowleft") {
    partyCreationController.releaseDirection(-1);
    e.preventDefault();
  } else if (lower === "arrowright") {
    partyCreationController.releaseDirection(1);
    e.preventDefault();
  }
});

// --- Arena mode ----------------------------------------------------------
let arenaController: ArenaController | null = null;
let justOpenedArena = false;
let inArena = false;
let arenaWave = 1;
let arenaFloor = 1;
let arenaStartFloor = 1;

let arenaSetupController: { handleKey: (key: string) => void } | null = null;

function openArenaSetup(): void {
  setMode(state, "arena");
  showMode("arena", mapVisible);
  setMessage("");

  const levels = [1, 3, 6, 9, 12];
  let selected = 0;
  let hasRendered = false;

  const render = () => {
    const panel = document.querySelector<HTMLDivElement>("#combat-panel")!;
    const animated = !hasRendered;
    hasRendered = true;

    const win = new FF6Window({
      title: "Arena Mode",
      contentHtml: `<div class="ff6-arena-meta">Choose starting party level</div>`,
      items: levels.map((lv) => ({
        label: `Level ${lv}`,
        metadata: lv,
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
        arenaSetupController = null;
        startArena(levels[selected]!);
      },
      onBack: () => {
        arenaSetupController = null;
        openTitleScreen();
      },
    });
    panel.innerHTML = "";
    panel.appendChild(win.render());
  };

  arenaSetupController = {
    handleKey: (key: string) => {
      audio.uiForMenuKey(key);
      const lower = key.toLowerCase();
      if (lower === "arrowup" || lower === "w") {
        selected = (selected - 1 + levels.length) % levels.length;
        render();
      } else if (lower === "arrowdown" || lower === "s") {
        selected = (selected + 1) % levels.length;
        render();
      } else if (key === "Enter" || key === " ") {
        arenaSetupController = null;
        startArena(levels[selected]!);
      } else if (key === "Escape") {
        arenaSetupController = null;
        openTitleScreen();
      }
    },
  };

  render();
}

function startArena(targetLevel: number): void {
  // Reset to a fresh default party and the first arena wave.
  Object.assign(state, createGameState(getFloors()[0]!));
  inArena = true;
  arenaWave = 1;

  // Scale starting floor with party level so high-level parties don't
  // waste waves trivially one-shotting floor-1 skeletons.
  arenaStartFloor = arenaStartFloorForLevel(targetLevel);
  arenaFloor = arenaStartFloor;

  // Level the starter party up to the selected target level directly (not
  // via applyLevelUps/xp) — Arena setup wants an exact target level, not a
  // banked-xp simulation, and never touches char.xp, so it's unaffected by
  // the level-up-spends-xp semantics used by real combat victories below.
  const equipment: Record<string, Loadout> = Object.fromEntries(
    state.party.map((c) => [c.id, defaultLoadoutForCharacter(c)])
  );
  state.party = state.party.map((c) => {
    let leveled = c;
    for (let i = 1; i < targetLevel; i++) {
      leveled = levelUpChar(leveled, equipment[c.id]);
    }
    return leveled;
  });
  state.equipment = equipment;

  // Wave 1 kicks off immediately — no extra hub click before the first fight.
  startNextArenaFight();
}

function openArena(): void {
  setMode(state, "arena");
  showMode("arena", mapVisible);
  setMessage("");
  justOpenedArena = true;
  arenaController = new ArenaController({
    panel: document.querySelector<HTMLDivElement>("#combat-panel")!,
    state,
    wave: arenaWave,
    floor: arenaFloor,
    onNext: () => {
      arenaController = null;
      startNextArenaFight();
    },
    onExit: () => {
      arenaController = null;
      inArena = false;
      openTitleScreen();
    },
  });
}

function startNextArenaFight(): void {
  const floor = arenaFloor;
  const wave = arenaWave;
  arenaWave++;
  arenaFloor = arenaFloorForWave(arenaStartFloor, arenaWave);

  const entry = rollArenaEncounter(floor, wave);
  if (!entry) {
    // No encounters for this floor; start a fresh wave hub.
    openArena();
    return;
  }
  const sized = adjustArenaEncounterForSmallParty(entry);
  const resolved = resolveEncounter(sized);
  if (resolved.length === 0) {
    openArena();
    return;
  }

  const loadout = buildLoadoutMap();
  const combat = createCombatFromEncounter(
    state.party,
    resolved,
    SPELLS_BY_ID,
    ITEMS_BY_ID,
    loadout,
    state.inventory,
    state.inAntimagic
  );
  state.combat = combat;
  setMode(state, "combat");
  state.stepsSinceEncounter = 0;

  startCombat(combat);
}

// Title screen key handler — routes keys to the TitleController.
window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (state.mode !== "title" || !titleController) return;
  // First gesture unlocks AudioContext + title BGM (autoplay policy).
  audio.resume();
  if (titleController.handleKey(e.key)) {
    e.preventDefault();
  }
});

// Prologue key handler — routes keys to the PrologueController. Registered
// after the title screen's own listener above (load-bearing — see the
// justOpenedPrologue comment near openPrologue): title's onNewGame can
// construct prologueController synchronously from within its own keydown
// listener, and this listener must run afterward, in the same dispatch, to
// see it and correctly swallow that keypress.
window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (state.mode !== "title" || !prologueController) return;
  if (justOpenedPrologue) {
    justOpenedPrologue = false;
    e.preventDefault();
    return;
  }
  prologueController.handleKey(e.key);
  e.preventDefault();
});

// Ending key handler — routes keys to the EndingController. Registered after
// both of this controller's possible synchronous-open sources (the combat
// key handler above, and the perk-select listener further up), so it always
// observes endingController already non-null within the same dispatch and
// correctly swallows that keypress via justOpenedEnding — see openEnding's
// comment.
window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (state.mode !== "title" || !endingController) return;
  if (combatTransitionActive) {
    e.preventDefault();
    return;
  }
  if (justOpenedEnding) {
    justOpenedEnding = false;
    e.preventDefault();
    return;
  }
  endingController.handleKey(e.key);
  e.preventDefault();
});

// Arena key handler — routes keys to the ArenaController.
// The `justOpenedArena` flag prevents the same keydown that opened the arena
// (e.g. the Enter that exits a combat result) from also selecting a menu item.
// combatTransitionActive covers the full leave-reveal window (much longer
// than justOpenedArena's single swallow) so "Next Fight" can't start a second
// startCombat under an in-flight reveal.
window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (state.mode !== "arena") return;
  if (combatTransitionActive) {
    e.preventDefault();
    return;
  }
  if (justOpenedArena) {
    justOpenedArena = false;
    e.preventDefault();
    return;
  }
  if (arenaSetupController) {
    arenaSetupController.handleKey(e.key);
    e.preventDefault();
    return;
  }
  if (arenaController) {
    arenaController.handleKey(e.key);
    e.preventDefault();
  }
});

// --- Save/Load menu ------------------------------------------------------
let saveController: SaveController | null = null;
let modeBeforeSaveMenu: GameMode = "dungeon";

function openSaveMenu(): void {
  // Close the map if it's open — the save menu takes over the panel.
  if (mapVisible) toggleMap();
  modeBeforeSaveMenu = state.mode;
  setMode(state, "title"); // borrow "title" mode so dungeon input pauses
  showMode("title", mapVisible);
  setMazeSurfaceOpacity("0.2");
  justOpenedSaveMenu = true;
  saveController = new SaveController({
    panel: document.querySelector<HTMLDivElement>("#combat-panel")!,
    state,
    modeBeforeSave: modeBeforeSaveMenu,
    onLoaded: (loaded: GameState) => {
      // Replace the current game state with the loaded one.
      // We can't reassign `state` (it's const), so we mutate in place.
      mapOverlayRenderer.invalidate();
      Object.assign(state, loaded);
      saveController = null;
      setMazeSurfaceOpacity("1");
      // Return to the mode from the loaded save, or dungeon if it was combat.
      const targetMode = state.mode === "combat" ? "dungeon" : state.mode;
      setMode(state, targetMode);
      if (targetMode === "town") {
        openTown();
      } else {
        showMode(targetMode, mapVisible);
        setMessage("Game loaded.");
      }
    },
    onClose: () => {
      saveController = null;
      setMazeSurfaceOpacity("1");
      if (modeBeforeSaveMenu === "town") {
        openTown();
      } else {
        setMode(state, "dungeon");
        showMode("dungeon", mapVisible);
        setMessage("");
      }
    },
  });
}

// Save menu key handler — routes keys to the SaveController.
// The `justOpenedSaveMenu` flag prevents the Escape key that opened the menu
// from being immediately processed by this handler (which would close it).
let justOpenedSaveMenu = false;
window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (state.mode !== "title" || !saveController) return;
  if (justOpenedSaveMenu) {
    justOpenedSaveMenu = false;
    e.preventDefault();
    return;
  }
  saveController.handleKey(e.key);
  e.preventDefault();
});

// --- Dungeon spell menu (G — grimoire) -------------------------------------
// Borrows "title" mode like the save menu so dungeon input pauses. The
// justOpenedSpellMenu flag keeps the G that opened the menu from closing it.
let spellMenuController: SpellMenuController | null = null;
let justOpenedSpellMenu = false;

function openSpellMenu(): void {
  setMode(state, "title");
  showMode("title", mapVisible);
  setMazeSurfaceOpacity("0.2");
  justOpenedSpellMenu = true;
  spellMenuController = new SpellMenuController({
    panel: document.querySelector<HTMLDivElement>("#combat-panel")!,
    state,
    onClose: (message: string) => {
      spellMenuController = null;
      setMazeSurfaceOpacity("1");
      setMode(state, "dungeon");
      showMode("dungeon", mapVisible);
      setMessage(message);
    },
  });
}

window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (state.mode !== "title" || !spellMenuController) return;
  if (justOpenedSpellMenu) {
    justOpenedSpellMenu = false;
    e.preventDefault();
    return;
  }
  spellMenuController.handleKey(e.key);
  e.preventDefault();
});

// --- Dungeon NPC panel ------------------------------------------------------
// Borrows "title" mode like the save/grimoire menus. Opened by stepping onto
// a living NPC's tile; Attack (or a caught theft) hands off to a real fight.
let npcController: NPCController | null = null;
/** NPC the current combat is against (set for Attack/caught-steal fights). */
let npcFightId: string | null = null;

let justOpenedNPCPanel = false;

function openNPCPanel(npcId: string): void {
  // Hot Boi's tavern is a dedicated hub, not a generic dungeon NPC — see
  // engine/tavern-ui.ts for why it isn't just another NPCController capability
  // set.
  if (npcId === "hot-boi") {
    openTavernPanel();
    return;
  }
  // The Church of Saint Namanda's altar — a physical interaction point, not
  // a character. See engine/namanda-ui.ts's doc comment.
  if (npcId === "namanda-altar") {
    openNamandaPanel();
    return;
  }
  const npc = state.floor.npcs?.find((n) => n.id === npcId);
  if (!npc) return;
  setMode(state, "title");
  showMode("title", mapVisible);
  setMazeSurfaceOpacity("0.2");
  justOpenedNPCPanel = true;
  npcController = new NPCController({
    panel: document.querySelector<HTMLDivElement>("#combat-panel")!,
    state,
    npc,
    onClose: (message: string) => {
      npcController = null;
      if (npcFightId) return; // a fight is taking over the screen
      setMazeSurfaceOpacity("1");
      setMode(state, "dungeon");
      showMode("dungeon", mapVisible);
      setMessage(message);
    },
    onFight: (target: NPCDef) => {
      startNPCFight(target);
    },
  });
}

function startNPCFight(npc: NPCDef): void {
  const spawns = npc.combatEnemyIds
    .map((id) => ENEMIES_BY_ID[id])
    .filter((def) => def !== undefined)
    .map((def) => ({ enemy: def, row: "front" as const }));
  if (spawns.length === 0) return;
  npcFightId = npc.id;
  setMazeSurfaceOpacity("1");
  const combat = createCombatFromEncounter(
    state.party,
    spawns,
    SPELLS_BY_ID,
    ITEMS_BY_ID,
    buildLoadoutMap(),
    state.inventory,
    state.inAntimagic
  );
  state.combat = combat;
  setMode(state, "combat");
  state.stepsSinceEncounter = 0;
  startCombat(combat);
}

// --- Stairs guardian ("The Party That Returned") -------------------------
let pendingStairsGuardianFight: StairsGuardianDef | null = null;

function startStairsGuardianFight(guardian: StairsGuardianDef): void {
  const spawns = guardian.spawns
    .map((s) => {
      const enemy = ENEMIES_BY_ID[s.enemyId];
      return enemy ? { enemy, row: s.row } : null;
    })
    .filter((s): s is { enemy: (typeof ENEMIES_BY_ID)[string]; row: "front" | "back" } => s !== null);
  if (spawns.length === 0) return;
  pendingStairsGuardianFight = guardian;
  setMazeSurfaceOpacity("1");
  const combat = createCombatFromEncounter(
    state.party,
    spawns,
    SPELLS_BY_ID,
    ITEMS_BY_ID,
    buildLoadoutMap(),
    state.inventory,
    state.inAntimagic
  );
  state.combat = combat;
  setMode(state, "combat");
  state.stepsSinceEncounter = 0;
  startCombat(combat);
}

window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (state.mode !== "title" || !npcController) return;
  if (justOpenedNPCPanel) {
    // The movement key that stepped onto the NPC must not also drive the menu.
    justOpenedNPCPanel = false;
    e.preventDefault();
    return;
  }
  if (npcController.handleKey(e.key)) {
    e.preventDefault();
  }
});

// --- Hot Boi's tavern --------------------------------------------------
// Borrows "title" mode like the save/grimoire/NPC panels. Opened by stepping
// onto Hot Boi's tile (see openNPCPanel's dispatch above) instead of the
// generic NPCController.
let tavernController: TavernController | null = null;
let justOpenedTavernPanel = false;

function openTavernPanel(): void {
  setMode(state, "title");
  showMode("title", mapVisible);
  setMazeSurfaceOpacity("0.2");
  justOpenedTavernPanel = true;
  audio.startTavernMusic();
  tavernController = new TavernController({
    panel: document.querySelector<HTMLDivElement>("#combat-panel")!,
    state,
    onClose: () => {
      tavernController = null;
      setMazeSurfaceOpacity("1");
      setMode(state, "dungeon");
      showMode("dungeon", mapVisible);
      setMessage("");
      audio.stopTavernMusic();
    },
    // A Rest/turn-in/companion transaction has already fully committed to
    // `state` by the time this fires — never called mid-transaction, so the
    // autosave can't capture a half-applied gold deduction or reward.
    onSave: () => {
      autoSave(state);
    },
  });
}

window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (state.mode !== "title" || !tavernController) return;
  if (justOpenedTavernPanel) {
    // The movement key that stepped onto Hot Boi must not also drive the menu.
    justOpenedTavernPanel = false;
    e.preventDefault();
    return;
  }
  if (tavernController.handleKey(e.key)) {
    e.preventDefault();
  }
});

// --- Church of Saint Namanda ---------------------------------------------
// Borrows "title" mode like the Tavern. Opened by stepping onto the altar's
// interaction tile (see openNPCPanel's dispatch above) instead of the
// generic NPCController — there is no NPC here, just the altar itself.
let namandaController: NamandaController | null = null;
let justOpenedNamandaPanel = false;

function openNamandaPanel(): void {
  setMode(state, "title");
  showMode("title", mapVisible);
  setMazeSurfaceOpacity("0.2");
  justOpenedNamandaPanel = true;
  namandaController = new NamandaController({
    panel: document.querySelector<HTMLDivElement>("#combat-panel")!,
    state,
    onClose: () => {
      namandaController = null;
      setMazeSurfaceOpacity("1");
      setMode(state, "dungeon");
      showMode("dungeon", mapVisible);
      setMessage("");
    },
    // Same atomicity contract as the Tavern's onSave: a heal/bless/uncurse/
    // identify transaction has already fully committed to `state`.
    onSave: () => {
      autoSave(state);
    },
  });
}

window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (state.mode !== "title" || !namandaController) return;
  if (justOpenedNamandaPanel) {
    // The movement key that stepped onto the altar must not also drive the menu.
    justOpenedNamandaPanel = false;
    e.preventDefault();
    return;
  }
  if (namandaController.handleKey(e.key)) {
    e.preventDefault();
  }
});

// --- Auto-map toggle -----------------------------------------------------
function toggleMap(): void {
  mapVisible = !mapVisible;
  if (mapVisible) closeMapOverlay();
  showMode("dungeon", mapVisible);
  setMazeSurfaceOpacity(mapVisible ? "0.3" : "1");
  // The map canvas owns its floor/position header and input-specific close
  // hint. Clear any corridor notice so it cannot reappear stale on map close.
  setMessage("");
}

// --- Render loop ---------------------------------------------------------
// Track the previous mode so we only start/stop the audio drone on
// transitions, not every frame.
let prevMode: GameMode | null = null;

function loop() {
  // Manage BGM beds on mode transitions (maze / town / party_creation).
  if (state.mode !== prevMode) {
    if (state.mode === "dungeon") {
      audio.startDungeon();
      syncAbyssExposure();
    } else if (prevMode === "dungeon") {
      audio.setAbyssExposure(false);
      audio.stopDungeon();
      clearPartyStrip();
    }
    if (state.mode === "town") {
      audio.startTownMusic();
    } else if (prevMode === "town") {
      audio.stopTownMusic();
    }
    if (state.mode === "party_creation") {
      // Party creation music is started by openPartyCreation()
      // Don't start it here to avoid double-starting
    } else if (prevMode === "party_creation") {
      // Party creation music is stopped by the controller callbacks
      // Don't stop it here to avoid double-stopping
    }
    prevMode = state.mode;
  }

  // Update raft animation if active. The animation runs in "dialog" mode
  // (input locked), so this update happens regardless of dungeon mode.
  if (raftAnimation && raftAnimation.isActive()) {
    raftAnimation.update();
  }

  if (state.mode === "dungeon" || (state.mode === "dialog" && raftAnimation)) {
    // While a raft animation is active, install the interpolated visual
    // camera override so the first-person view glides along the path. The
    // authoritative grid position stays at the origin dock until completion.
    if (raftAnimation && raftAnimation.isActive()) {
      setRaftVisualOverride(raftAnimation.getVisualCamera());
    } else {
      setRaftVisualOverride(null);
    }
    syncMazeRendererFloor();
    syncMazeRendererSize();
    mazeRenderer?.render(state);
    if (mazeRenderer) mazeRendererDebugHud.update(mazeRenderer);
    setRaftVisualOverride(null);
    const floorLabel = `F${state.floor.id}`;
    renderPartyStrip(
      state.party,
      compassForFacing(state.player.facing),
      floorLabel,
      {
        heat: zoneHeatAt(state.floor, state.player.x, state.player.y),
        pressure: pityPressureFor(state.stepsSinceEncounter),
      }
    );
    const kind = globalInput.getLastInputKind();
    setContextualPrompt(resolveContextualPrompt(state, kind));
    if (mapVisible) {
      renderAutoMap(mapCtx, state, globalInput.getLastInputKind());
    }
    if (mapOverlayState.visible) {
      mapOverlayRenderer.renderIfNeeded(mapOverlayCtx, state);
    }
  }
  requestAnimationFrame(loop);
}

// --- Boot readiness tracking (feeds the ?debug=1 readiness() probe) -------
// Each of these already tolerates failure by design — the game starts either
// way, falling back to gradients/procedural shapes. The flags below just make
// that outcome observable (booleans mean "settled", success or fail; the
// specific asset name lands in failedAssets on failure) instead of the
// previous bare `.catch(() => {})` swallowing it.
let fontsReady = false;
let texturesReady = false;
let enemySpritesReady = false;
let partySpritesReady = false;
let effectSpritesReady = false;
let mapSpritesReady = false;
let wallFeaturesReady = false;
let ceilingSpritesReady = false;
let ceilingFeaturesReady = false;
let doorFeaturesReady = false;
const failedAssets: string[] = [];

// Wait for the custom font and corridor textures to load before starting the
// render loop, so Canvas text rendering uses FF36 from the first frame and
// the dungeon renderer has bitmaps ready.
if ("fonts" in document) {
  Promise.all([
    document.fonts
      .load('14px "FF36"')
      .then(() => {
        fontsReady = true;
      })
      .catch(() => {
        fontsReady = true;
        failedAssets.push("fonts");
      }),
    initializeMazeRenderer()
      .then(() => {
        texturesReady = true;
      })
      .catch(() => {
        texturesReady = true;
        failedAssets.push("textures");
      }),
  ]).then(() => loop()); // both branches above resolve — this never rejects
} else {
  initializeMazeRenderer()
    .then(() => {
      texturesReady = true;
    })
    .catch(() => {
      texturesReady = true;
      failedAssets.push("textures");
    })
    .then(loop);
}

// Prewarm enemy/party sprite and effect caches without blocking the render loop.
loadEnemySprites()
  .then(() => {
    enemySpritesReady = true;
  })
  .catch(() => {
    enemySpritesReady = true;
    failedAssets.push("enemySprites");
  });
loadPartySprites()
  .then(() => {
    partySpritesReady = true;
  })
  .catch(() => {
    partySpritesReady = true;
    failedAssets.push("partySprites");
  });
loadEffectSprites()
  .then(() => {
    effectSpritesReady = true;
  })
  .catch(() => {
    effectSpritesReady = true;
    failedAssets.push("effectSprites");
  });
loadMapSprites()
  .then(() => {
    mapSpritesReady = true;
  })
  .catch(() => {
    mapSpritesReady = true;
    failedAssets.push("mapSprites");
  });
loadWallFeatures()
  .then(() => {
    wallFeaturesReady = true;
  })
  .catch(() => {
    wallFeaturesReady = true;
    failedAssets.push("wallFeatures");
  });
loadCeilingSprites()
  .then(() => {
    ceilingSpritesReady = true;
  })
  .catch(() => {
    ceilingSpritesReady = true;
    failedAssets.push("ceilingSprites");
  });
loadCeilingFeatures()
  .then(() => {
    ceilingFeaturesReady = true;
  })
  .catch(() => {
    ceilingFeaturesReady = true;
    failedAssets.push("ceilingFeatures");
  });
loadDoorFeatures()
  .then(() => {
    doorFeaturesReady = true;
  })
  .catch(() => {
    doorFeaturesReady = true;
    failedAssets.push("doorFeatures");
  });

// Debug helpers for targeted visual verification; only active when the page
// is loaded with ?debug=1. Never used in normal play.
if (new URLSearchParams(window.location.search).has("debug")) {
  // --- Evidence layer ----------------------------------------------------
  // Everything below records *why* the game got where it is: mode/route
  // changes, messages, tile features, audio cues, errors, and asset
  // failures. Combat is already covered by CombatState.events.
  const events = new DebugEventBuffer();
  debugEvents = events;

  const audioSpy = installAudioSpy(audio, {
    onCue: (rec) => {
      events.push("audioCue", { ...rec });
    },
  });

  setDebugMessageHook((text) => {
    const trimmed = text.trim();
    events.push("message", { text: trimmed, cleared: trimmed.length === 0 });
  });

  // Route changes have no single call site (controllers are constructed all
  // over), so sample instead of instrumenting each one: after every keydown
  // has been dispatched, and on every snapshot read.
  let lastRoute: ControllerRouteKind | null = null;
  const sampleRoute = (trigger: string): ControllerRouteKind => {
    const route = resolveControllerRoute(currentRouteFlags());
    if (route !== lastRoute) {
      events.push("route", { from: lastRoute, to: route, mode: state.mode, trigger });
      lastRoute = route;
    }
    return route;
  };
  // Registered last, so it runs after every controller's own listener in the
  // same dispatch and observes the post-key route.
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    sampleRoute(`key:${e.key}`);
  });

  window.addEventListener("error", (e: ErrorEvent) => {
    events.push("error", {
      kind: "error",
      message: e.message,
      source: `${e.filename}:${e.lineno}:${e.colno}`,
      stack: e.error instanceof Error ? e.error.stack : undefined,
    });
  });
  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const reason: unknown = e.reason;
    events.push("error", {
      kind: "unhandledrejection",
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  /**
   * Quiescent = no pending mode fade, no render-camera tween, no prologue
   * auto-play, no unfinished combat playback. Decision logic lives in the
   * pure, unit-tested debug/idle.ts so this stays a thin call with live
   * values — see AGENTS.md's Debug/testing aids section.
   */
  const isIdle = (): boolean =>
    !mazeRendererFloorLoading && computeIdle({
      modeTransitionPending,
      // isRenderCameraAnimating() alone misses the window between a movement
      // keydown and the next frame's camera update (the tween starts in the
      // render loop, not the key handler) — a waitForIdle poll landing there
      // saw "idle" and the follow-up scripted press was swallowed by the
      // dungeon input gate. The settled probe closes that window; scoped to
      // dungeon mode because only dungeon input is camera-gated.
      cameraAnimating:
        isRenderCameraAnimating() ||
        (state.mode === "dungeon" &&
          !isRenderCameraSettledFor(
            state.player.x,
            state.player.y,
            state.player.facing
          )),
      prologueActive: !!prologueController,
      endingActive: !!endingController,
      // Phaser stage boot + swirl/dissolve sit inside withCombatTransition;
      // without this, waitForIdle returns true while route is still "none".
      combatTransitionActive,
      combat: combatController
        ? {
            phase: combatController.getPhase(),
            playbackDone: combatController.isChoreographyDone(),
          }
        : null,
    });

  /**
   * Boot/asset readiness for scripts that want to wait past the first
   * splash before driving input. Fonts/textures/sprite fields are booleans
   * (settled, success or fail — see the boot section above); the audio
   * sample families are tri-state because they only start on the first
   * user keydown, so "not-started" must stay distinct from "failed."
   */
  /**
   * Turn newly-failed assets into `assetFailed` events. A failed WAV is
   * otherwise invisible — the play call just returns (AGENTS.md) — so this is
   * what lets a bundle say "cue fired, sample never loaded" instead of
   * showing silence indistinguishable from "no cue fired."
   */
  const reportedAssetFailures = new Set<string>();
  const syncAssetFailures = (failed: string[]): void => {
    for (const name of failed) {
      if (reportedAssetFailures.has(name)) continue;
      reportedAssetFailures.add(name);
      events.push("assetFailed", { asset: name });
    }
  };

  const readiness = () => {
    const audioStatus = audio.getSampleLoadStatus();
    syncAssetFailures([...failedAssets, ...audioStatus.failed]);
    return {
      fonts: fontsReady,
      textures: texturesReady,
      mazeRendererFloor: !mazeRendererFloorLoading,
      enemySprites: enemySpritesReady,
      partySprites: partySpritesReady,
      effectSprites: effectSpritesReady,
      mapSprites: mapSpritesReady,
      wallFeatures: wallFeaturesReady,
      ceilingSprites: ceilingSpritesReady,
      ceilingFeatures: ceilingFeaturesReady,
      doorFeatures: doorFeaturesReady,
      audioUi: audioStatus.ui,
      audioCombat: audioStatus.combat,
      audioDungeon: audioStatus.dungeon,
      failed: [...failedAssets, ...audioStatus.failed],
    };
  };

  const debugSnapshot = (opts?: { map?: boolean; mapRadius?: number }) => {
    const route = sampleRoute("snapshot");
    syncAssetFailures([...failedAssets, ...audio.getSampleLoadStatus().failed]);
    const combat = combatController ? combatController.debugView() : null;
    return buildSnapshot({
      state,
      route,
      message: getMessageText(),
      mapVisible,
      mapOverlayVisible: mapOverlayState.visible,
      inArena,
      idle: isIdle(),
      combat,
      warnings: checkInvariants({ state, route, combat }),
      soundsPlaying: audioSpy.log.playingNow(),
      map: opts?.map,
      mapRadius: opts?.mapRadius,
    });
  };

  /**
   * Teleport via the real transitionToFloor path (applies killed NPCs, loot,
   * unlocked doors, deepestFloorReached, explored-by-floor). Refuses while
   * combat or a borrowed-title overlay is live.
   */
  const jumpTo = (opts: JumpToOptions): void => {
    if (combatController) {
      throw new Error("jumpTo: refuse while combat is active — exitDebugCombat first");
    }
    if (
      saveController ||
      spellMenuController ||
      npcController ||
      tavernController ||
      namandaController ||
      perkSelectController ||
      prologueController ||
      endingController
    ) {
      throw new Error("jumpTo: refuse while an overlay controller is open");
    }
    if (campController || gameOverController || arenaController || partyCreationController) {
      throw new Error("jumpTo: refuse while camp/game-over/arena/party-creation is live");
    }

    const floor = findFloor(opts.floorId);
    if (!floor) throw new Error(`jumpTo: no floor ${opts.floorId}`);

    // Close hub controllers that boot/jump may leave behind; clear their DOM.
    if (titleController) titleController = null;
    if (townController) townController = null;
    if (actionRingController) {
      actionRingController.destroy();
      actionRingController = null;
    }
    const panel = document.querySelector<HTMLDivElement>("#combat-panel");
    if (panel) {
      panel.innerHTML = "";
      panel.style.display = "none";
    }

    if (opts.clearUnlockedDoors) state.unlockedDoors.clear();
    state.pendingTrap = null;
    inArena = false;

    applyJumpPartyOptions(state, opts);
    transitionToFloor(state, floor, opts.x, opts.y, (opts.facing ?? 0) as 0 | 1 | 2 | 3, {
      autosave: opts.autosave !== false,
    });
    if (opts.stepsSinceEncounter !== undefined) {
      state.stepsSinceEncounter = opts.stepsSinceEncounter;
    }

    markExplored();
    mapOverlayRenderer.invalidate();
    resetRenderCamera(state.player.x, state.player.y, state.player.facing);
    setMode(state, "dungeon");
    showMode("dungeon", mapVisible);
    setMazeSurfaceOpacity("1");
    setMessage("");
  };

  const dumpSave = (): string => serialize(state);

  const loadSave = (json: string): void => {
    if (combatController) {
      throw new Error("loadSave: refuse while combat is active");
    }
    if (
      saveController ||
      spellMenuController ||
      npcController ||
      tavernController ||
      namandaController ||
      perkSelectController ||
      prologueController ||
      endingController ||
      campController ||
      gameOverController ||
      arenaController ||
      partyCreationController
    ) {
      throw new Error("loadSave: refuse while an overlay/hub controller is open");
    }
    const loaded = deserialize(json);
    if (!loaded) throw new Error("loadSave: deserialize failed");
    if (titleController) titleController = null;
    if (townController) townController = null;
    applyLoadedGameState(loaded);
  };

  (window as any).render_game_to_text = () => JSON.stringify(debugSnapshot());

  // @ts-expect-error Vite `define` replaces this global at build/dev time.
  (window as any).__onyxBuild = __ONYX_BUILD__;

  (window as any).__onyxDebug = {
    state,
    snapshot: debugSnapshot,
    isIdle,
    readiness,
    /** Recent debug events, oldest-first. `log(50, "audioCue")` to filter. */
    log: (n?: number, kind?: DebugEventKind) => events.log(n, kind),
    clearLog: () => events.clear(),
    mazeRendererPerformance: {
      snapshot: () => mazeRenderProfiler.snapshot(),
      reset: () => mazeRenderProfiler.reset(),
      setEnabled: (enabled: boolean) => mazeRenderProfiler.setEnabled(enabled),
    },
    mazeRendererInfo: () => ({
      requested: mazeRendererSelection?.requested ?? null,
      active: mazeRendererSelection?.active ?? null,
      fallbackReason: mazeRendererSelection?.fallbackReason ?? null,
      size: { width: mazeRendererWidth, height: mazeRendererHeight },
      statistics: mazeRenderer?.getStatistics?.() ?? null,
    }),
    /** Audio cue records (id, firedAt, durationMs, endsAt, bufferMissing). */
    sounds: (n?: number) => audioSpy.log.recent(n),
    soundsPlaying: () => audioSpy.log.playingNow(),
    jumpTo,
    dumpSave,
    loadSave,
    startCombat: async () => {
      if (combatController) {
        throw new Error("startCombat: combat is already active — use exitDebugCombat first");
      }
      const combat = buildDebugCombat(state, buildLoadoutMap());
      setMode(state, "combat");
      await startCombat(combat);
    },
    exitDebugCombat,
    FLOORS: getFloors(),
    findFloor,
    registerFloorMap,
    createGameState,
    createCombatFromEncounter,
    resolveEncounter,
    rollEncounter,
    SPELLS_BY_ID,
    ITEMS_BY_ID,
    defaultLoadoutForCharacter,
    getCombatController: () => combatController,
    setBarksEnabled,
    getBarksEnabled,
    // Seeded gameplay RNG — call setGameplayRng(createSeededRng(seed)) before
    // a playtest run to make combat/encounters/stat-rolls reproducible. Reset
    // with resetGameplayRng() (or a page reload) to return to Math.random.
    setGameplayRng,
    resetGameplayRng,
    createSeededRng,
    renderBattleArena,
    renderCorridorBackdrop,
    groundPlaneProbe: () => {
      const cc = combatController;
      if (!cc) return null;
      const scene = (cc as unknown as { scene: { backdropId: string; state: { party: { length: number }; enemies: { front: unknown[]; back: unknown[] } } } }).scene;
      const bd = scene.backdropId;
      const geo = geometryForBackdrop(bd);
      const w = 768;
      const h = 672;
      const party = Array.from({ length: scene.state.party.length }, (_, i) =>
        partyPos(i, w, h, bd)
      );
      const enemies = [
        ...scene.state.enemies.front.map((_, i) => enemyPos(i, "front", w, h, bd)),
        ...scene.state.enemies.back.map((_, i) => enemyPos(i, "back", w, h, bd)),
      ];
      const all = [...party, ...enemies];
      const feetOk = all.every(
        (p) => p.footY >= geo.seamY && p.footY <= geo.floorBottomY
      );
      let occlusionOk = true;
      try {
        assertFloorBottomClearOfWindows(geo, h);
      } catch {
        occlusionOk = false;
      }
      const partyXOk = party.every((p) => {
        const half = (300 * p.scale) / 2;
        return p.x >= half + 4 && p.x <= w - half - 4;
      });
      const enemyXOk = enemies.every((p) => {
        const half = (300 * p.scale) / 2;
        return p.x >= half + 4 && p.x <= w - half - 4;
      });
      const xBoundsOk = partyXOk && enemyXOk;
      return {
        backdropId: bd,
        geo,
        party: party.map((p) => ({ footY: p.footY, scale: p.scale, y: p.y, x: p.x })),
        enemies: enemies.map((p) => ({ footY: p.footY, scale: p.scale, y: p.y, x: p.x })),
        feetOk,
        occlusionOk,
        xBoundsOk,
        ok: feetOk && occlusionOk && xBoundsOk,
      };
    },
  };
}
