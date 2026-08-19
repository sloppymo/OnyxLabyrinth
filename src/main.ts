import "./styles.css";
import { getFloors, findFloor, registerFloorMap } from "./game/floor-registry";
import { createGameState, setMode } from "./game/state";
import { turnLeft, turnRight, tryUnlock, resolveTraversal, openBarredGate } from "./engine/camera";
import { type Direction, type TraversalResult } from "./game/traversal";
import { RaftAnimationController, isRaftAnimating } from "./engine/raft-animation";
import {
  handleTileFeature,
  transitionToFloor,
  syncVisionZoneFlags,
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
import { dungeonActionForKey, isEditableInputTarget, type InputHandlers } from "./engine/input";
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
  getHudChrome,
  getPartyStripPresentation,
  getContextualPromptText,
  getAmbientBarkPresentation,
  isMapOverlayOpen,
  setDebugMessageHook,
  getMazeRendererSurface,
  setMazeRendererSurface,
  setMazeSurfaceOpacity,
  showAmbientBark,
  showNpcDialogueOverlay,
  hideNpcDialogueOverlay,
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
import { gatherPlayerPresentation } from "./debug/gather-player-presentation";
import { playerMenuFromElement, contentTextFromElement } from "./debug/visible-menu";
import { computeIdle } from "./debug/idle";
import { normalizeLoadedMode } from "./debug/load-normalize";
import { applyJumpPartyOptions, type JumpToOptions } from "./debug/jump-to";
import { DebugEventBuffer, type DebugEventKind } from "./debug/event-buffer";
import { CombatAudit, type CombatAuditContext } from "./debug/combat-audit";
import { checkInvariants } from "./debug/invariants";
import { installAudioSpy } from "./debug/audio-spy";
import { buildDebugCombat } from "./debug/start-combat";
import { CombatController } from "./engine/combat-ui";
import { createCombatStage } from "./engine/combat-stage";
import { type ControllerInputEvent } from "./engine/controller-input";
import { controllerEventToMenuKey } from "./engine/menu-controller-adapter";
import {
  assertUnhandledRoute,
  resolveControllerRoute,
  type BaseRouteKind,
  type ControllerRouteContext,
  type ControllerRouteKind,
} from "./engine/controller-route";
import { createApplication } from "./engine/application";
import { PrologueController } from "./engine/prologue-ui";
import { EndingController } from "./engine/ending-ui";
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
  encounterCooldownFor,
  encounterTableFloorId,
  zoneHeatAt,
  pityPressureFor,
  createEncounterFamilyMemory,
  rememberEncounterFamily,
  resetEncounterFamilyMemory as resetEncounterFamilyMemoryState,
  syncEncounterFamilyMemory,
  arenaStartFloorForLevel,
  arenaFloorForWave,
  rollArenaEncounter,
  adjustArenaEncounterForSmallParty,
  isSafeZoneAt,
  stepPity,
} from "./game/encounters";
import {
  createVignetteMemory,
  resetVignetteMemory,
  selectVignette,
  markVignetteShown,
  resolveTimedOut,
} from "./game/encounter-vignettes";
import { tickBuffs, clearBuffs } from "./game/persistent-spells";
import { applyNamandaBlessing } from "./game/namanda";
import { markKilled, adjustDisposition } from "./game/npc";
import { companionAsSummonedAlly, syncCompanionAfterCombat } from "./game/companion";
import {
  kazeharuGuestAlly,
  resolveKazeharuAfterForge,
  FLOOR3_GUARDIAN_CLIMAX_ID,
  KAZEHARU_GUEST_ID,
} from "./game/kazeharu";
import { ENEMIES_BY_ID, ENCOUNTER_TABLES } from "./data/enemies";
import type { NPCDef, FloorDef, StairsGuardianDef } from "./data/floors";
import { ALL_SPELLS } from "./data/spells";
import { ITEMS_BY_ID } from "./data/items";
import {
  reviveKnockedOut,
  applyCombatPartyResult,
  awardCombatXp,
} from "./game/party";
import { levelUpChar, applyLevelUps } from "./game/leveling";
import {
  analyzeRecoveryPath,
  isSafeRecoveryLanding,
  resolveRecoveryLanding,
} from "./game/recovery";
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
const app = createApplication({
  initialFloor: playtestFloor ?? getFloors()[0]!,
  overlay: {
    shell: {
      panel: () => document.querySelector<HTMLDivElement>("#combat-panel")!,
      presentBlocking: () => {
        showMode("title", mapVisible);
        setMazeSurfaceOpacity("0.2");
      },
      restore: () => {
        setMazeSurfaceOpacity("1");
        showMode(state.mode, mapVisible);
      },
      showDialog: () => showMode("dialog", mapVisible),
      showDungeon: () => showMode("dungeon", mapVisible),
      showNpcDialogue: () => showNpcDialogueOverlay(),
      hideNpcDialogue: () => hideNpcDialogueOverlay(),
      syncMapOverlayTitle: () => syncMapOverlayMode(mapOverlayState, "title"),
      setMessage: (text, opts) => setMessage(text, opts),
      closeMapIfOpen: () => {
        if (mapVisible) toggleMap();
      },
    },
    dungeon: {
      camp: () => dungeonHandlers.onCamp(),
      returnToTown: () => dungeonHandlers.onTown(),
      toggleMap: () => dungeonHandlers.onToggleMap(),
      unlock: () => dungeonHandlers.onUnlock(),
      canOpenActionRing: () => !mapVisible && !isRenderCameraAnimating(),
    },
    session: {
      applyLoadedState: (loaded) => applyLoadedGameState(loaded, { message: "Game loaded." }),
      persist: () => autoSave(state),
      reopenTown: () => openTown(),
    },
    combat: {
      startNpcFight: (npc) => startNPCFight(npc),
    },
    trap: {
      isPending: () => state.mode === "dungeon" && !!state.pendingTrap,
      inspected: () => !!state.pendingTrap?.inspected,
      inspect: () => setMessage(inspectChest(state)),
      disarm: () => {
        applyChestResult(disarmChest(state));
        return { stillPending: !!state.pendingTrap };
      },
      open: () => applyChestResult(openChest(state)),
      leave: () => setMessage(leaveChest(state)),
    },
    audio: {
      stopDungeon: () => audio.stopDungeon(),
      startTavernMusic: () => audio.startTavernMusic(),
      stopTavernMusic: () => audio.stopTavernMusic(),
      startDungeon: () => audio.startDungeon(),
    },
    inArena: () => inArena,
    setMode: (mode) => setMode(state, mode),
    onDialogClosed: () => {
      suppressDungeonMovementUntilKeyup = true;
    },
  },
  screens: {
    shell: {
      panel: () => document.querySelector<HTMLDivElement>("#combat-panel")!,
      setMode: (mode) => setMode(state, mode),
      show: (mode) => showMode(mode, mapVisible),
      fadeTo: (mode) => transitionToMode(mode),
      closeMapIfOpen: () => {
        if (mapVisible) toggleMap();
      },
      setMessage: (text) => setMessage(text),
      focusWindow: () => window.focus(),
    },
    audio: {
      startTitleMusic: () => audio.startTitleMusic(),
      stopTitleMusic: () => audio.stopTitleMusic(),
      startPartyCreationMusic: () => audio.startPartyCreationMusic(),
      stopPartyCreationMusic: () => audio.stopPartyCreationMusic(),
      startTownMusic: () => audio.startTownMusic(),
    },
    title: {
      newGame: () => {
        closeMapOverlay();
        mapOverlayRenderer.invalidate();
        Object.assign(state, createGameState(getFloors()[0]!));
        resetEncounterFamilyMemory();
        openPrologue(() => {
          audio.stopTitleMusic();
          openPartyCreation(() => openTown({ showIntroHint: true }));
        });
      },
      continue: (loaded) => applyLoadedGameState(loaded),
      openArenaSetup: () => screens.openArenaSetup(),
    },
    town: {
      enterDungeon: () => enterDungeonFromTown(),
      openSave: () => overlays.openSave(),
      reformParty: () => openPartyCreation(() => openTown()),
    },
    party: {
      confirm: (party, onDone) => {
        state.party = party;
        state.equipment = Object.fromEntries(
          party.map((c) => [c.id, defaultLoadoutForCharacter(c)])
        );
        onDone();
      },
      cancel: (previousMode, onDone) => {
        if (previousMode === "title") audio.startTitleMusic();
        else if (previousMode === "town") audio.startTownMusic();
        onDone();
      },
    },
    gameOver: {
      continue: () => {
        if (inArena) openArena();
        else openTown();
      },
    },
    camp: {
      end: () => {
        setMode(state, "dungeon");
        showMode("dungeon", mapVisible);
        setMessage(`The party rests. Day ${state.dayCount}. HP and SP restored.`);
      },
    },
    arena: {
      nextFight: () => startNextArenaFight(),
      exitToTitle: () => {
        inArena = false;
        screens.openTitle();
      },
      startAtLevel: (level) => startArena(level),
    },
    inArena: () => inArena,
  },
  onInput: (event) => routeControllerEvent(event),
  onKeyDown: onGameplayKeyDown,
  onKeyUp: onGameplayKeyUp,
});
const { state, uiStack, overlays, screens, input: globalInput } = app;
// Random dungeon encounter anti-repeat is deliberately session-only. It is
// not part of GameState and therefore cannot leak through saves or Arena.
const encounterFamilyMemory = createEncounterFamilyMemory(state.floor.id);
// First-time/repeat vignette bookkeeping follows the same session-only rule.
const vignetteMemory = createVignetteMemory();

function resetEncounterFamilyMemory(): void {
  resetEncounterFamilyMemoryState(encounterFamilyMemory, state.floor.id);
  resetVignetteMemory(vignetteMemory);
}

function syncEncounterFamilyMemoryToFloor(): void {
  syncEncounterFamilyMemory(encounterFamilyMemory, state.floor.id);
}

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
 * After the ending closes on Esc, ignore dungeon Esc→Save until keyup so
 * key-repeat cannot open the save menu on the same physical press.
 */
let suppressDungeonEscUntilKeyup = false;

function currentRoute(): ControllerRouteKind {
  const overlay = uiStack.top();
  if (overlay) return overlay.id;
  return resolveControllerRoute(currentRouteFlags());
}

// --- Raft animation ------------------------------------------------------
let raftAnimation: RaftAnimationController | null = null;
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
/** Debug-only: sample route after the single gameplay keydown owner runs. */
let debugAfterKeyDown: ((key: string) => void) | null = null;
/** Debug-only natural-campaign combat evidence; never serialized. */
let combatAudit: CombatAudit | null = null;

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

/** Record a successful physical step before revealAround expands the map. */
function noteAuditStep(): void {
  if (!combatAudit) return;
  const { player, floor, explored } = state;
  const cell = floor.grid[player.y]?.[player.x];
  const walkableCells = floor.grid.reduce(
    (count, row) => count + row.filter((candidate) => !candidate?.void).length,
    0
  );
  const event = floor.events?.find((candidate) => candidate.x === player.x && candidate.y === player.y);
  combatAudit.noteStep({
    floorId: floor.id,
    x: player.x,
    y: player.y,
    exploredBefore: explored.has(`${player.x},${player.y}`),
    exploredTileCountBefore: explored.size,
    floorExploredFractionBefore: walkableCells > 0 ? explored.size / walkableCells : 0,
    safeZone: isSafeZoneAt(floor, player.x, player.y),
    authoredEventKind: event?.kind,
    tile: cell?.tile,
  });
}

// Reveal the starting area on load.
markExplored();

// --- Town mode -----------------------------------------------------------
function openTown(opts?: { showIntroHint?: boolean }): void {
  combatAudit?.noteRecovery({ kind: "town", floorId: state.floor.id });
  if (mapVisible) toggleMap();
  let introHint = "";
  if (opts?.showIntroHint && !shownTownIntro) {
    shownTownIntro = true;
    introHint = "Ready when you are — [>] Enter Dungeon.";
  }
  screens.openTown({ introHint });
}

function enterDungeonFromTown(): void {
  const last = state.lastDungeon;
  const floor = last
    ? findFloor(last.floorId) ?? getFloors()[0]!
    : getFloors()[0]!;
  const x = last ? last.x : floor.startX;
  const y = last ? last.y : floor.startY;
  const facing = last ? last.facing : 0;
  // A wipe checkpoint is earned location context, not a promise that the
  // authored cell will remain legal forever. Apply runtime doors/loot/etc.
  // first, then resolve the landing against the private floor copy so a
  // stale feature/void/elevation cannot strand the party.
  transitionToFloor(state, floor, x, y, facing, { autosave: false });
  const landing = last
    ? resolveRecoveryLanding(state.floor, x, y)
    : { x: floor.startX, y: floor.startY, exact: true, distance: 0, reason: "exact" as const };
  state.player.x = landing.x;
  state.player.y = landing.y;
  if (last) {
    combatAudit?.noteDungeonReentry({
      actual: {
        floorId: state.floor.id,
        x: state.player.x,
        y: state.player.y,
        facing: state.player.facing,
      },
      legalWalkableTile: isSafeRecoveryLanding(state.floor, state.player.x, state.player.y),
      tile: state.floor.grid[state.player.y]?.[state.player.x]?.tile,
      tileFiresEvent: Boolean(
        state.floor.grid[state.player.y]?.[state.player.x]?.tile ||
          state.floor.events?.some((event) => event.x === state.player.x && event.y === state.player.y)
      ),
      immediateCombatRetrigger: state.mode === "combat",
      safeLandingExact: landing.exact,
      safeLandingReason: landing.reason,
      path: analyzeRecoveryPath(
        state.floor,
        { x: state.player.x, y: state.player.y },
        { x, y }
      ),
    });
  }
  autoSave(state);
  syncEncounterFamilyMemoryToFloor();
  state.inDarkness = false;
  state.inAntimagic = false;
  markExplored();
  transitionToMode("dungeon");
  const entry = last ? "You return to the dungeon..." : "You enter the dungeon...";
  if (!shownDungeonKeyboardHint) {
    shownDungeonKeyboardHint = true;
    setMessage(`${entry}\nTab: Actions · Esc: Save`);
  } else {
    setMessage(entry);
  }
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
function openPartyCreation(onDone: () => void): void {
  screens.openPartyCreation(onDone);
}

// --- New Game prologue -----------------------------------------------------
// Skippable SNES-style black-field narration shown once, between New Game's
// state reset and party creation. Never shown by Continue / Arena / Reform
// Party. This is a real title-mode screen, not a UiStack overlay.
let prologueController: PrologueController | null = null;

function openPrologue(onDone: () => void): void {
  if (mapVisible) toggleMap();
  setMode(state, "title");
  showMode("title", mapVisible);
  setMessage(""); // critical: empty #message so it cannot cover the black field
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
// opened from Arena. This is a real title-mode screen, not a UiStack overlay.
let endingController: EndingController | null = null;

function openEnding(): void {
  if (mapVisible) toggleMap();
  // Persist before the title-mode flip. autoSave() refuses title (and
  // party_creation / arena) because those screens are not resumable.
  // Direct-from-combat still has mode "combat" here; perk-then-ending now
  // keeps dungeon/arena under the perk layer, so this write can land.
  // onDone below is still the guaranteed persist for both exits.
  state.hasCompletedEnding = true;
  autoSave(state);
  setMode(state, "title");
  showMode("title", mapVisible);
  setMessage(""); // critical: empty #message so it cannot cover the black field
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

/**
 * Apply a deserialized save into the live session. Title Continue, the
 * in-game Save-menu Load, and debug loadSave must all call this — do not
 * reconstruct state with a second Object.assign path.
 *
 * Overlays / party creation / arena are not resumable — see
 * normalizeLoadedMode.
 */
function applyLoadedGameState(
  loaded: GameState,
  opts: { message?: string } = {}
): void {
  closeMapOverlay();
  mapOverlayRenderer.invalidate();
  Object.assign(state, loaded);
  resetEncounterFamilyMemory();
  state.mode = normalizeLoadedMode(state.mode);
  if (state.mode === "town") {
    openTown();
  } else {
    // Combat is converted to dungeon on save; any other mode resumes directly.
    setMazeSurfaceOpacity("1");
    showMode(state.mode, mapVisible);
    setMessage(opts.message ?? "Welcome back to the labyrinth.");
    if (state.mode === "dungeon") {
      markExplored();
      resetRenderCamera(state.player.x, state.player.y, state.player.facing);
    }
  }
}

// Start the game: show the title screen so the player can choose
// "New Game" or "Continue" (if an auto-save exists).
function openTitleScreen(): void {
  screens.openTitle();
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
  syncEncounterFamilyMemoryToFloor();
  const baseRate = encounterRateAt(
    state.floor,
    state.player.x,
    state.player.y
  );
  const chance = encounterRollChance(
    baseRate,
    state.stepsSinceEncounter,
    state.floor.encounterPacing
  );
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
  const entry = rollEncounter(tableId, {
    recentFamilies: encounterFamilyMemory.recentFamilies,
  });
  if (!entry) return false;

  const resolved = resolveEncounter(entry);
  if (resolved.length === 0) return false;

  const beginFight = (): void => {
    const loadout = buildLoadoutMap();
    const combat = createCombatFromEncounter(
      state.party,
      resolved,
      SPELLS_BY_ID,
      ITEMS_BY_ID,
      loadout,
      state.inventory,
      state.inAntimagic,
      {
        id: entry.id,
        family: entry.family,
        displayName: entry.displayName,
        chemistryEnabled: true,
      }
    );
    state.combat = combat;
    setMode(state, "combat");
    state.stepsSinceEncounter = 0;
    rememberEncounterFamily(encounterFamilyMemory, entry.family, state.floor.id);

    startCombat(combat, { source: "random", tableId });
  };

  // Party-banter vignette before the encounter swirl. Selection/resolution
  // is pure (game/encounter-vignettes.ts): authored formations always show
  // their first-meeting scene (and their timed out, when they have one),
  // while repeats and generic-pool encounters roll against show-frequency
  // dials and often go straight to combat — the popup must stay surprising,
  // not become a tollbooth. A timed out can avoid the fight, or out-reward
  // it on a perfect answer. Combat state is only created when the fight
  // actually starts; until then the dungeon stays painted under the dialog.
  const vignette = selectVignette(entry, state.party, vignetteMemory, getGameplayRng());
  if (!vignette) {
    beginFight();
    return true;
  }
  markVignetteShown(vignetteMemory, entry);
  const out = vignette.out;
  let outcome: ReturnType<typeof resolveTimedOut> | null = null;
  closeMapOverlay();
  overlays.openDialog({
    title: entry.displayName,
    lines: vignette.pages,
    choices: out
      ? out.options.map((o, i) => ({ label: o.label, value: String(i) }))
      : undefined,
    choiceTimerMs: out?.timerMs,
    cancelable: false,
    onSelect: (value, meta) => {
      if (out) {
        outcome = resolveTimedOut(
          out,
          value,
          meta?.elapsedMs ?? Number.MAX_SAFE_INTEGER,
          state.party,
          getGameplayRng()
        );
      }
    },
    // Follow-up dialogs are opened from onClose (never from onSelect):
    // OverlayRuntime nulls its dialog reference during close, so a dialog
    // opened mid-onSelect would be torn down by the old dialog's cleanup —
    // same deferred-action pattern as the action ring's pendingRingAction.
    onClose: () => {
      if (!out) {
        beginFight();
        return;
      }
      const o =
        outcome ?? resolveTimedOut(out, "timeout", 0, state.party, getGameplayRng());
      overlays.openDialog({
        lines: o.pages,
        cancelable: false,
        onClose: () => {
          if (o.fight) {
            beginFight();
            return;
          }
          // Avoided: grant the payoff and keep anti-repeat memory honest.
          // The encounter clock hands back only the cooldown — no fresh
          // pity grace — so talking your way out never makes the dungeon
          // safer than fighting through it.
          if (o.gold > 0) state.partyGold += o.gold;
          rememberEncounterFamily(encounterFamilyMemory, entry.family, state.floor.id);
          state.stepsSinceEncounter = encounterCooldownFor(state.floor);
          setMessage(
            o.gold > 0
              ? `No blood spilled. The party pockets ${o.gold} gold.`
              : "No blood spilled."
          );
        },
      });
    },
  });
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

async function startCombat(
  combat: CombatState,
  auditContext: CombatAuditContext = { source: "debug", tableId: null }
): Promise<void> {
  combatAudit?.beginCombat({
    combat,
    context: auditContext,
    floorId: state.floor.id,
    x: state.player.x,
    y: state.player.y,
    party: state.party,
    inventory: state.inventory,
  });
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
  if (!screens.hasArena) {
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
  combatAudit?.endCombat(result);
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
    // Century cycle §7.3: the party revives and openGameOver()'s Continue
    // sends them to town, not straight back into combat. Preserve the failed
    // encounter's location as an earned retry checkpoint so the next attempt
    // does not require replaying the solved route from the floor entrance.
    state.lastDungeon = {
      floorId: state.floor.id,
      x: state.player.x,
      y: state.player.y,
      facing: state.player.facing,
    };
    combatAudit?.noteWipeCheckpoint({
      failed: { ...state.lastDungeon },
      storedLastDungeon: { ...state.lastDungeon },
    });
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
    let kazeharuMsg = "";
    if (result.climaxId === FLOOR3_GUARDIAN_CLIMAX_ID) {
      const survived = !result.deadAllyIds.includes(KAZEHARU_GUEST_ID);
      resolveKazeharuAfterForge(state, survived);
      if (!survived) kazeharuMsg = " Kazeharu falls beside you — his vigil ends here.";
    }
    setMessage(baseMsg + levelMsg + climaxLootMsg + kazeharuMsg);
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

  // The wish (§6): floor-5 climax boss victory, once per campaign. The
  // Crying Man lives on ENCOUNTER_TABLES[9], reached only from the
  // undersong-guardian chest — not a re-rollable hallway pack. A second
  // win is still possible if the party re-opens a restored chest, and
  // hasCompletedEnding (not "isBoss won" alone) is what stops the screen
  // from re-opening.
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
        overlays.openPerk(pendingPerkChoices, onDone);
      } else {
        onDone();
      }
      return;
    }

    if (pendingPerkChoices.length > 0) {
      overlays.openPerk(pendingPerkChoices, triggersEnding ? openEnding : undefined);
    } else if (triggersEnding) {
      openEnding();
    } else {
      setMode(state, "dungeon");
      showMode("dungeon", mapVisible);
    }
  });
}

// --- Game over mode ------------------------------------------------------
function openGameOver(): void {
  setMessage("");
  // §7.1: campaign wipes advance the century cycle before the screen renders
  // so the player reads the *new* year; Arena wipes never advance it.
  if (!inArena) {
    state.worldYear += 100;
  }
  screens.openGameOver();
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
function startCamp(): void {
  const cell = state.floor.grid[state.player.y]?.[state.player.x];
  const tile = cell?.tile;
  if (tile === "teleporter" || tile === "chute" || tile === "stairs_up" || tile === "stairs_down" || tile === "water") {
    setMessage("You can't make camp here — the ground is unstable.");
    return;
  }
  combatAudit?.noteRecovery({
    kind: "camp",
    floorId: state.floor.id,
    x: state.player.x,
    y: state.player.y,
  });
  state.dayCount++;
  clearBuffs(state);
  screens.openCamp();
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
        setMessage([...expiry, result.message].join(" "), { instant: result.looted === true });
      }
      if (result.changedFloor) {
        combatAudit?.noteRecovery({ kind: "floorStart", floorId: state.floor.id, x: state.player.x, y: state.player.y });
        markExplored();
        resetRenderCamera(state.player.x, state.player.y, state.player.facing);
        syncAbyssExposure();
        return;
      }
      if (result.npcId) {
        overlays.openNpc(result.npcId);
        return;
      }
      if (result.pendingChuteDrop) {
        const drop = result.pendingChuteDrop;
        overlays.openDialog({
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
                combatAudit?.noteRecovery({ kind: "floorStart", floorId: state.floor.id, x: state.player.x, y: state.player.y });
                syncEncounterFamilyMemoryToFloor();
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
        overlays.openDialog({
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
      setMessage([...expiry, result.message].join(" "), { instant: result.looted === true });
    }
    if (result.changedFloor) {
      syncEncounterFamilyMemoryToFloor();
      // Floor transition happened — mark explored on the new floor and snap
      // the render camera instantly to the new position (don't slide across
      // floors).
      combatAudit?.noteRecovery({ kind: "floorStart", floorId: state.floor.id, x: state.player.x, y: state.player.y });
      markExplored();
      resetRenderCamera(state.player.x, state.player.y, state.player.facing);
      syncAbyssExposure();
      // Don't trigger encounters on the same step as a floor transition.
      return;
    }
    if (result.npcId) {
      // Stepped onto a living NPC — open the interaction panel instead of
      // rolling an encounter.
      overlays.openNpc(result.npcId);
      return;
    }
    if (result.pendingChuteDrop) {
      // Stepped onto a chute that requires confirmation — show a
      // point-of-no-return dialog instead of dropping immediately.
      const drop = result.pendingChuteDrop;
      overlays.openDialog({
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
              combatAudit?.noteRecovery({ kind: "floorStart", floorId: state.floor.id, x: state.player.x, y: state.player.y });
              syncEncounterFamilyMemoryToFloor();
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
      overlays.openDialog({
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
    closeMapOverlay();
    const prompt = overlays.syncTrap(true);
    if (prompt) setMessage(prompt, { instant: true });
  } else {
    overlays.syncTrap(false);
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
      noteAuditStep();
      markExplored();
      onMove();
      scheduleFootstep();
      break;
    }
    case "blocked": {
      audio.wallBump();
      if (result.message) {
        // Show blocking dialog for raft-channel messages.
        overlays.openDialog({
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
          noteAuditStep();
          markExplored();
          onMove();
          scheduleFootstep();
        }
      } else {
        audio.wallBump();
        overlays.openDialog({
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
  overlays.openDialog({
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
    overlays.openSave();
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
      overlays.openSpell();
    }
  },
  onActionRing: () => {
    if (combatTransitionActive) return;
    if (state.mode === "dungeon" && !mapVisible && !state.pendingTrap) {
      clearMessageOnPlayerAction();
      overlays.openActionRing();
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

bindMapOverlayButton(dungeonHandlers.onToggleMapOverlay);

// --- Dungeon dialog overlay -----------------------------------------------
// Active while uiStack.top()?.id === "dialog". Raft animation still uses
// GameState.mode "dialog" separately to lock traversal while the boat moves.

// --- Trapped chest prompt --------------------------------------------------
// Active while uiStack.top()?.id === "trap" (and state.pendingTrap).
// Movement/camp/town/save stay on the dungeon route until the stack layer
// is pushed; then the trap layer owns I/D/O/L (+Esc = leave).

/** Route a chest action result: message, camera snap, forced encounter. */
function applyChestResult(result: ChestActionResult): void {
  if (!result.message) return;
  if (result.opened && !result.alarm) audio.playDungeonSfx("chestOpen");
  // Loot is a reward read, not a combat/status ticker: paint it whole so the
  // player gets the complete item list before the next input can dismiss it.
  setMessage(result.message, { instant: result.opened });
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
  if (combat.climaxId === FLOOR3_GUARDIAN_CLIMAX_ID) {
    const guest = kazeharuGuestAlly(state);
    if (guest) combat.summonedAllies.push(guest);
  }
  state.combat = combat;
  setMode(state, "combat");
  state.stepsSinceEncounter = 0;
  startCombat(combat, {
    source: combat.climaxId ? "climax" : "trap",
    tableId,
  });
}

/**
 * Live flags for `resolveControllerRoute` (base screens only). Overlay
 * ownership is `uiStack.top()`; `currentRoute()` combines the two so the
 * debug snapshot cannot drift from input routing.
 */
function currentRouteFlags(): ControllerRouteContext {
  return {
    mode: state.mode,
    hasCombat: !!combatController,
    hasTown: screens.hasTown,
    hasCamp: screens.hasCamp,
    hasGameOver: screens.hasGameOver,
    hasPartyCreation: screens.hasPartyCreation,
    hasPrologue: !!prologueController,
    hasEnding: !!endingController,
    hasTitle: screens.hasTitle,
  };
}


function dispatchControllerRoute(route: BaseRouteKind, event: ControllerInputEvent): void {
  switch (route) {
    case "combat": {
      const combat = combatController;
      if (!combat) return;
      if (event.key !== undefined) {
        if (event.kind === "release") {
          combat.handleKeyUp(event.key);
          if (event.button) combat.handleInput(event);
          return;
        }
        if (event.kind === "hold") {
          combat.handleInput(event);
          return;
        }
        if (event.kind === "press") {
          // Mapped keys already auto-repeat via native keydown; the first
          // press is enough. Unmapped letters (palette / magic tabs) keep
          // native repeat, matching the old dedicated combat listener.
          if (event.repeat && event.button) return;
          combat.handleKey(event.key);
        }
        return;
      }
      combat.handleInput(event);
      return;
    }
    case "town":
      screens.handleTown(event);
      return;
    case "camp":
      screens.handleCamp(event);
      return;
    case "game_over":
      screens.handleGameOver(event);
      return;
    case "party_creation":
      screens.handlePartyCreation(event);
      return;
    case "prologue": {
      const key = controllerEventToMenuKey(event);
      if (key) prologueController!.handleKey(key);
      return;
    }
    case "ending": {
      const key = controllerEventToMenuKey(event);
      if (key) endingController!.handleKey(key);
      return;
    }
    case "title":
      screens.handleTitle(event);
      return;
    case "arena":
      screens.handleArena(event);
      return;
    case "dungeon":
      dispatchDungeonInput(event);
      return;
    case "none":
      return;
    default:
      return assertUnhandledRoute(route);
  }
}

function dispatchDungeonInput(event: ControllerInputEvent): void {
  if (event.kind !== "press") return;

  // Keyboard keeps the dungeon WASD/C/M/V/… map. Gamepad keeps face-button
  // semantics (A = contextual unlock, not turn left). Do not fall through.
  if (event.key !== undefined) {
    const action = dungeonActionForKey(event.key, { repeat: event.repeat });
    if (action) dungeonHandlers[action]();
    return;
  }

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
        overlays.openActionRing();
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

function routeControllerEvent(event: ControllerInputEvent): void {
  if (combatTransitionActive) return;
  const overlay = uiStack.top();
  if (overlay) {
    overlay.handleInput(event);
    return;
  }
  dispatchControllerRoute(resolveControllerRoute(currentRouteFlags()), event);
}

function onGameplayKeyDown(e: KeyboardEvent): void {
  audio.resume();
  if (isEditableInputTarget(e.target)) return;
  globalInput.handleKeyboardDown(e);
  debugAfterKeyDown?.(e.key);
}

function onGameplayKeyUp(e: KeyboardEvent): void {
  if (e.key === "Escape") suppressDungeonEscUntilKeyup = false;
  if (suppressDungeonMovementUntilKeyup) {
    suppressDungeonMovementUntilKeyup = false;
  }
  globalInput.handleKeyboardUp(e);
}

app.start();

// Auto-save when the player leaves or reloads the page so the next session
// can resume where they left off.
window.addEventListener("beforeunload", () => {
  if (uiStack.top()?.id === "perk") return;
  autoSave(state, inArena);
});

// --- Arena mode ----------------------------------------------------------
let inArena = false;
let arenaWave = 1;
let arenaFloor = 1;
let arenaStartFloor = 1;

function startArena(targetLevel: number): void {
  // Reset to a fresh default party and the first arena wave.
  Object.assign(state, createGameState(getFloors()[0]!));
  resetEncounterFamilyMemory();
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
  screens.openArena(arenaWave, arenaFloor);
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

  startCombat(combat, { source: "arena", tableId: null });
}

// --- Dungeon NPC combat -----------------------------------------------------
// OverlayRuntime owns the NPC/tavern/Namanda panels. Attack (or a caught theft)
// hands off here — combat construction stays in main, not OverlayRuntime.
/** NPC the current combat is against (set for Attack/caught-steal fights). */
let npcFightId: string | null = null;

function startNPCFight(npc: NPCDef): void {
  const spawns = npc.combatEnemyIds
    .map((id) => ENEMIES_BY_ID[id])
    .filter((def) => def !== undefined)
    .map((def) => ({ enemy: def, row: "front" as const }));
  if (spawns.length === 0) return;
  npcFightId = npc.id;
  setMazeSurfaceOpacity("1");
  hideNpcDialogueOverlay();
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
  startCombat(combat, { source: "npc", tableId: null });
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
  hideNpcDialogueOverlay();
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
  startCombat(combat, { source: "stairsGuardian", tableId: null });
}

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
        pressure: pityPressureFor(state.stepsSinceEncounter, state.floor.encounterPacing),
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
  combatAudit = new CombatAudit();

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
    const route = currentRoute();
    if (route !== lastRoute) {
      events.push("route", { from: lastRoute, to: route, mode: state.mode, trigger });
      lastRoute = route;
    }
    return route;
  };
  debugAfterKeyDown = (key: string) => {
    sampleRoute(`key:${key}`);
  };

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

  const debugPlayerView = () => {
    const route = sampleRoute("playerView");
    const panel = document.querySelector("#combat-panel");
    const menu = playerMenuFromElement(panel);
    const bodyFromContent = contentTextFromElement(panel);
    const tagline = document.querySelector(".title-tagline")?.textContent?.trim();
    const prologue = document.querySelector(".prologue-root")?.textContent?.replace(/\s+/g, " ").trim();
    const bodyText =
      bodyFromContent ||
      tagline ||
      (prologue && prologue.length > 0 ? prologue.slice(0, 800) : undefined);
    return gatherPlayerPresentation({
      route,
      message: getMessageText(),
      hud: getHudChrome(),
      partyStrip: getPartyStripPresentation(),
      prompt: getContextualPromptText(),
      bark: getAmbientBarkPresentation(),
      mapOpen: isMapOverlayOpen(),
      menu,
      bodyText: bodyText ?? null,
      combat: combatController ? combatController.playerView() : null,
    });
  };

  /**
   * Teleport via the real transitionToFloor path (applies killed NPCs, loot,
   * unlocked doors, deepestFloorReached, explored-by-floor). Refuses while
   * combat or a UiStack overlay is live.
   */
  const jumpTo = (opts: JumpToOptions): void => {
    if (combatController) {
      throw new Error("jumpTo: refuse while combat is active — exitDebugCombat first");
    }
    if (overlays.hasOpenOverlay() || prologueController || endingController) {
      throw new Error("jumpTo: refuse while an overlay controller is open");
    }
    if (screens.hasCamp || screens.hasGameOver || screens.hasArena || screens.hasPartyCreation) {
      throw new Error("jumpTo: refuse while camp/game-over/arena/party-creation is live");
    }

    const floor = findFloor(opts.floorId);
    if (!floor) throw new Error(`jumpTo: no floor ${opts.floorId}`);

    // Close hub controllers that boot/jump may leave behind; clear their DOM.
    screens.dismissTitle();
    screens.dismissTown();
    overlays.closeAll();
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
    syncVisionZoneFlags(state);
    syncEncounterFamilyMemoryToFloor();
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
      overlays.hasOpenOverlay() ||
      prologueController ||
      endingController ||
      screens.hasCamp ||
      screens.hasGameOver ||
      screens.hasArena ||
      screens.hasPartyCreation
    ) {
      throw new Error("loadSave: refuse while an overlay/hub controller is open");
    }
    const loaded = deserialize(json);
    if (!loaded) throw new Error("loadSave: deserialize failed");
    screens.dismissTitle();
    screens.dismissTown();
    applyLoadedGameState(loaded);
  };

  (window as any).render_game_to_text = () => JSON.stringify(debugSnapshot());

  // @ts-expect-error Vite `define` replaces this global at build/dev time.
  (window as any).__onyxBuild = __ONYX_BUILD__;

  (window as any).__onyxDebug = {
    state,
    snapshot: debugSnapshot,
    playerView: debugPlayerView,
    isIdle,
    readiness,
    /** Live NPC controller, null when no dialogue panel is open. */
    get npcController() {
      return overlays.npcController;
    },
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
    /** Natural campaign combat evidence; read-only apart from debug clear. */
    combatAudit: {
      snapshot: () => combatAudit?.snapshot() ?? null,
      clear: () => combatAudit?.clear(),
    },
    jumpTo,
    dumpSave,
    loadSave,
    /** Start a seeded/debug fixture when supplied; otherwise roll the live floor table. */
    startCombat: async (fixture?: CombatState) => {
      if (combatController) {
        throw new Error("startCombat: combat is already active — use exitDebugCombat first");
      }
      const combat = fixture ?? buildDebugCombat(state, buildLoadoutMap());
      setMode(state, "combat");
      await startCombat(combat, { source: "debug", tableId: null });
    },
    exitDebugCombat,
    FLOORS: getFloors(),
    findFloor,
    registerFloorMap,
    createGameState,
    createCombatFromEncounter,
    resolveEncounter,
    rollEncounter,
    ENCOUNTER_TABLES,
    ENEMIES_BY_ID,
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
