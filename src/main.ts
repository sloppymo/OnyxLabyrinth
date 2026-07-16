import "./styles.css";
import { getFloors, findFloor, registerFloorMap } from "./game/floor-registry";
import { createGameState, setMode } from "./game/state";
import { moveForward, moveBackward, turnLeft, turnRight, tryUnlock } from "./engine/camera";
import {
  handleTileFeature,
  transitionToFloor,
  inspectChest,
  disarmChest,
  openChest,
  leaveChest,
  type ChestActionResult,
} from "./game/features";
import { DX, DY } from "./game/dungeon";
import {
  render,
  loadTextures,
  isRenderCameraAnimating,
  resetRenderCamera,
  renderBattleArena,
  renderCorridorBackdrop,
} from "./engine/renderer";
import { partyPos, enemyPos } from "./engine/combat-scene";
import { geometryForBackdrop } from "./engine/combat-scene-math";
import { loadEnemySprites } from "./engine/enemy-sprite-cache";
import { loadPartySprites } from "./engine/party-sprite-cache";
import { loadEffectSprites } from "./engine/effect-sprite-cache";
import { loadMapSprites } from "./engine/map-sprite-cache";
import { audio } from "./engine/audio";
import { renderAutoMap } from "./engine/automap";
import { bindInput, type InputHandlers } from "./engine/input";
import {
  canvas,
  ctx,
  mapCtx,
  setMessage,
  clearMessageOnPlayerAction,
  flashEncounter,
  renderPartyStrip,
  clearPartyStrip,
  showMode,
  compassForFacing,
  setContextualPrompt,
} from "./engine/shell";
import { resolveContextualPrompt } from "./engine/contextual-prompt";
import { CombatController } from "./engine/combat-ui";
import {
  createControllerInput,
  type ControllerInputEvent,
} from "./engine/controller-input";
import { controllerEventToMenuKey } from "./engine/menu-controller-adapter";
import { resolveControllerRoute } from "./engine/controller-route";
import { DungeonActionRingController } from "./engine/dungeon-action-ring-ui";
import { TrapPromptController } from "./engine/trap-prompt-ui";
import { CampController } from "./engine/camp-ui";
import { SaveController } from "./engine/save-ui";
import { TownController } from "./engine/town-ui";
import { PartyCreationController } from "./engine/party-ui";
import { GameOverController } from "./engine/game-over-ui";
import { TitleController } from "./engine/title-ui";
import { ArenaController } from "./engine/arena-ui";
import { FF6Window } from "./engine/ff6-window-library";
import { autoSave } from "./game/save";
import {
  createCombatFromEncounter,
  reconcileInventoryAfterCombat,
  defaultLoadoutForCharacter,
  type CombatState,
  type Loadout,
} from "./game/combat";
import { rollEncounter, resolveEncounter } from "./data/enemies";
import {
  encounterRollChance,
  encounterRateAt,
  encounterTableFloorId,
  arenaStartFloorForLevel,
  arenaFloorForWave,
  rollArenaEncounter,
} from "./game/encounters";
import { tickBuffs, clearBuffs } from "./game/persistent-spells";
import { SpellMenuController } from "./engine/spell-ui";
import { NPCController } from "./engine/npc-ui";
import { PerkSelectController } from "./engine/perk-select-ui";
import { markKilled, adjustDisposition } from "./game/npc";
import { ENEMIES_BY_ID } from "./data/enemies";
import type { NPCDef } from "./data/floors";
import { ALL_SPELLS } from "./data/spells";
import { ITEMS_BY_ID } from "./data/items";
import { reviveKnockedOut, type Character } from "./game/party";
import { xpForNextLevel, levelUpChar } from "./game/leveling";
import { isPerkTierLevel, tierForLevel, type PendingPerkChoice } from "./game/perks";
import type { GameState, GameMode } from "./types";
import { parseFloorMapJSON, resolveTilesetTheme } from "./game/floor-map";

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

const playtestFloor = tryBootPlaytestFloor();
const state = createGameState(playtestFloor ?? getFloors()[0]!);

// Auto-map visibility flag.
let mapVisible = false;

/** First dungeon entry this page session — keyboard discoverability door hint. */
let shownDungeonKeyboardHint = false;

// Session-wide gamepad/keyboard poller (combat keyboard path feeds this too).
let actionRingController: DungeonActionRingController | null = null;
let trapPrompt: TrapPromptController | null = null;
/** Swallow the step key that opened the trap so it cannot wrap the cursor. */
let justOpenedTrapPrompt = false;
type RingActionId = "camp" | "map" | "grimoire" | "unlock" | "town";
let pendingRingAction: RingActionId | null = null;

// --- Mode transition with fade -------------------------------------------
// The canvas has `transition: opacity 0.15s` in CSS. This helper fades out,
// swaps mode + shell visibility, then fades in.
function transitionToMode(newMode: GameMode): void {
  canvas.style.opacity = "0";
  setTimeout(() => {
    setMode(state, newMode);
    showMode(newMode, mapVisible);
    canvas.style.opacity = "1";
  }, 150);
}

// --- Exploration tracking ------------------------------------------------
// Mark the current tile and all 4 adjacent tiles as explored. The player
// can see the current tile plus one ahead, so revealing adjacent tiles gives
// a useful map without spoiling unexplored areas.
function markExplored(): void {
  const { player, floor, explored } = state;
  const key = (x: number, y: number) => `${x},${y}`;
  explored.add(key(player.x, player.y));
  for (let dir = 0; dir < 4; dir++) {
    const nx = player.x + DX[dir];
    const ny = player.y + DY[dir];
    if (nx >= 0 && nx < floor.width && ny >= 0 && ny < floor.height) {
      explored.add(key(nx, ny));
    }
  }
}

// Reveal the starting area on load.
markExplored();

// --- Town mode -----------------------------------------------------------
let townController: TownController | null = null;

function openTown(): void {
  if (mapVisible) toggleMap();
  transitionToMode("town");
  setMessage("");
  townController = new TownController({
    panel: document.querySelector<HTMLDivElement>("#combat-panel")!,
    state,
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
  setMode(state, "party_creation");
  showMode("party_creation", mapVisible);
  setMessage("");
  partyCreationController = new PartyCreationController({
    panel: document.querySelector<HTMLDivElement>("#combat-panel")!,
    onConfirm: (party: Character[]) => {
      partyCreationController = null;
      state.party = party;
      state.equipment = Object.fromEntries(
        party.map((c) => [c.id, defaultLoadoutForCharacter(c)])
      );
      onDone();
    },
    onCancel: () => {
      partyCreationController = null;
      onDone();
    },
  });
}

// --- Title screen --------------------------------------------------------
let titleController: TitleController | null = null;

// Start the game: show the title screen so the player can choose
// "New Game" or "Continue" (if an auto-save exists).
function openTitleScreen(): void {
  setMode(state, "title");
  showMode("title", mapVisible);
  setMessage("");
  window.focus();
  titleController = new TitleController({
    panel: document.querySelector<HTMLDivElement>("#combat-panel")!,
    onNewGame: () => {
      titleController = null;
      openPartyCreation(() => openTown());
    },
    onContinue: (loaded) => {
      titleController = null;
      Object.assign(state, loaded);
      // Overlays and party creation are not resumable (no controller is
      // reconstructed for them). Fall back to town so the player can continue.
      if (state.mode === "title" || state.mode === "party_creation" || state.mode === "arena") {
        state.mode = "town";
      }
      if (state.mode === "town") {
        openTown();
      } else {
        // Combat is converted to dungeon on save; any other mode resumes directly.
        canvas.style.opacity = "1";
        showMode(state.mode, mapVisible);
        setMessage("Welcome back to the labyrinth.");
      }
    },
    onArena: () => {
      titleController = null;
      openArenaSetup();
    },
  });
}

if (playtestFloor) {
  setMode(state, "dungeon");
  showMode("dungeon", false);
  canvas.style.opacity = "1";
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
  if (Math.random() >= chance) return false;

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

// When an encounter starts mid-keydown (the same forward-step keypress that
// triggers maybeTriggerEncounter flips state.mode to "combat" synchronously),
// the combat key listener below runs later for that *same* event and would
// otherwise treat the dungeon-movement key as combat-menu input (e.g. the
// ArrowUp that stepped into the encounter would also nudge the selectAction
// menu). This flag suppresses exactly that one leaked keypress. It's cleared
// on a microtask as a fallback in case combat is ever started outside of a
// keydown handler, so it can never swallow a later, legitimate keypress.
let suppressNextCombatKey = false;

async function startCombat(combat: CombatState): Promise<void> {
  setMode(state, "combat");
  flashEncounter();
  showMode("combat", mapVisible);
  suppressNextCombatKey = true;
  setTimeout(() => {
    suppressNextCombatKey = false;
  }, 0);

  // Ensure renderer tilesets are loaded before baking the arena backdrop.
  // Textures are loaded at boot, but arena mode can start before that finishes.
  await loadTextures();

  const bd = renderBattleArena(state, 768, 672);
  const theme = resolveTilesetTheme(state.floor);
  const backdropId = `theme:${theme}`;

  combatController = new CombatController(combat, {
    onEnd: (result: CombatState) => {
      endCombat(result);
    },
    backdrop: bd,
    backdropId,
    getLastInputKind: () => globalInput.getLastInputKind(),
  });
}

function endCombat(result: CombatState): void {
  // Apply post-combat party state back to GameState.
  // The combat state's party has the current HP/SP/status after all rounds.
  state.party = result.party.map((c) => ({
    ...c,
    stats: { ...c.stats },
    status: [...c.status],
    knownSpellIds: [...c.knownSpellIds],
    perkIds: [...c.perkIds],
  }));

  // Write the (possibly depleted) combat inventory back to GameState,
  // preserving per-instance identification flags.
  state.inventory = reconcileInventoryAfterCombat(state.inventory, result.inventory);

  // Persist any equipment changes made during this combat back to GameState.
  state.equipment = { ...result.loadout };

  // Perk choices queued by post-combat level-ups. Kept local to this flow; the
  // overlay in Task 5 will consume it and then return to the dungeon.
  let pendingPerkChoices: PendingPerkChoice[] = [];

  if (result.result === "wipe") {
    // Design doc §9.1: party retreats to dungeon entrance, revives at 1 HP.
    state.party = reviveKnockedOut(state.party);
    state.player.x = state.floor.startX;
    state.player.y = state.floor.startY;
    openGameOver();
    return;
  } else if (result.result === "fled") {
    setMessage("You fled from combat.");
  } else if (result.result === "victory") {
    // Award gold and XP from defeated enemies (accumulated during combat).
    const goldEarned = result.goldEarned;
    const xpEarned = result.xpEarned;
    state.partyGold += goldEarned;
    // Generous XP: each living member gets the full enemy XP (no 6-way split).
    for (const c of state.party) {
      if (c.hp > 0) c.xp += xpEarned;
    }

    // Process post-combat level-ups for living party members.
    const levelUpMessages: string[] = [];
    state.party = state.party.map((c) => {
      if (c.hp <= 0) return c;
      let char = c;
      while (char.xp >= xpForNextLevel(char.level)) {
        char = levelUpChar(char, state.equipment[char.id]);
        levelUpMessages.push(`${char.name} reaches Level ${char.level}!`);
        if (isPerkTierLevel(char.level)) {
          pendingPerkChoices.push({ charId: char.id, tier: tierForLevel(char.level)! });
        }
      }
      return char;
    });

    const baseMsg = `Victory! +${goldEarned} gold, +${xpEarned} XP each.`;
    const levelMsg = levelUpMessages.length > 0 ? ` ${levelUpMessages.join(" ")}` : "";
    setMessage(baseMsg + levelMsg);
  }

  // NPC fights: victory kills the NPC (tile cleared); fleeing leaves them
  // alive and unforgiving.
  if (npcFightId) {
    const npc = state.floor.npcs?.find((n) => n.id === npcFightId);
    if (npc) {
      if (result.result === "victory") {
        markKilled(state, npc);
        setMessage(`${npc.name} falls. +${result.goldEarned} gold, +${result.xpEarned} XP each.`);
      } else if (result.result === "fled") {
        adjustDisposition(state, npc, -20);
        setMessage(`You flee from ${npc.name}.`);
      }
    }
    npcFightId = null;
  }

  state.combat = undefined;
  combatController = null;

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

  // If any characters reached a perk tier, open the perk selection overlay.
  // Otherwise return to the dungeon immediately.
  if (pendingPerkChoices.length > 0) {
    openPerkSelectOverlay(pendingPerkChoices);
  } else {
    setMode(state, "dungeon");
    showMode("dungeon", mapVisible);
  }
}

// --- Perk selection overlay ----------------------------------------------
let perkSelectController: PerkSelectController | null = null;

function openPerkSelectOverlay(queue: PendingPerkChoice[], onDone?: () => void): void {
  setMode(state, "title");
  showMode("title", mapVisible);
  canvas.style.opacity = "0.2";
  perkSelectController = new PerkSelectController({
    panel: document.querySelector<HTMLDivElement>("#combat-panel")!,
    state,
    queue,
    onDone: () => {
      perkSelectController = null;
      canvas.style.opacity = "1";
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
  perkSelectController.handleKey(e.key);
  e.preventDefault();
});

// --- Game over mode ------------------------------------------------------
let gameOverController: GameOverController | null = null;

function openGameOver(): void {
  setMode(state, "game_over");
  showMode("game_over", mapVisible);
  setMessage("");
  gameOverController = new GameOverController({
    panel: document.querySelector<HTMLDivElement>("#combat-panel")!,
    party: state.party,
    floorName: state.floor.name,
    onContinue: () => {
      gameOverController = null;
      if (inArena) {
        openArena();
      } else {
        setMode(state, "dungeon");
        showMode("dungeon", mapVisible);
        setMessage("You wake at the dungeon entrance, barely alive.");
      }
    },
  });
}

/** Cleanly exit the current combat for automated visual testing. */
function exitDebugCombat(result: "victory" | "wipe" | "fled"): void {
  if (!combatController || !state.combat) return;
  state.combat.result = result;
  state.combat.ended = true;
  combatController.destroy();
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

function onMove(): void {
  if (state.mode !== "dungeon") return;
  state.stepsSinceEncounter++;

  // Tick persistent spell buffs (light/levitation) BEFORE processing the
  // tile, so a light that just expired doesn't still counter this darkness.
  const expiry = tickBuffs(state);

  // Process the tile feature at the player's current position.
  const result = handleTileFeature(state);
  if (result) {
    if (!state.pendingTrap) {
      setMessage([...expiry, result.message].join(" "));
    }
    if (result.changedFloor) {
      // Floor transition happened — mark explored on the new floor and snap
      // the render camera instantly to the new position (don't slide across
      // floors).
      markExplored();
      resetRenderCamera(state.player.x, state.player.y, state.player.facing);
      // Don't trigger encounters on the same step as a floor transition.
      return;
    }
    if (result.npcId) {
      // Stepped onto a living NPC — open the interaction panel instead of
      // rolling an encounter.
      openNPCPanel(result.npcId);
      return;
    }
  } else if (expiry.length > 0) {
    setMessage(expiry.join(" "));
  }

  if (state.pendingTrap) {
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
    setMessage(trapPrompt.renderMessage(state.pendingTrap.inspected));
  } else {
    trapPrompt = null;
    justOpenedTrapPrompt = false;
  }

  maybeTriggerEncounter();
}

const dungeonHandlers: InputHandlers = {
  onForward: () => {
    if (state.mode === "dungeon" && !mapVisible && !state.pendingTrap && !isRenderCameraAnimating()) {
      audio.resume();
      clearMessageOnPlayerAction();
      const before = { x: state.player.x, y: state.player.y };
      moveForward(state);
      if (state.player.x !== before.x || state.player.y !== before.y) {
        markExplored();
        onMove();
        scheduleFootstep();
      }
    }
  },
  onBackward: () => {
    if (state.mode === "dungeon" && !mapVisible && !state.pendingTrap && !isRenderCameraAnimating()) {
      audio.resume();
      clearMessageOnPlayerAction();
      const before = { x: state.player.x, y: state.player.y };
      moveBackward(state);
      if (state.player.x !== before.x || state.player.y !== before.y) {
        markExplored();
        onMove();
        scheduleFootstep();
      }
    }
  },
  onTurnLeft: () => {
    if (state.mode === "dungeon" && !mapVisible && !state.pendingTrap && !isRenderCameraAnimating()) {
      audio.resume();
      clearMessageOnPlayerAction();
      turnLeft(state);
      markExplored();
    }
  },
  onTurnRight: () => {
    if (state.mode === "dungeon" && !mapVisible && !state.pendingTrap && !isRenderCameraAnimating()) {
      audio.resume();
      clearMessageOnPlayerAction();
      turnRight(state);
      markExplored();
    }
  },
  onCamp: () => {
    if (state.mode === "dungeon" && !mapVisible && !state.pendingTrap) {
      clearMessageOnPlayerAction();
      startCamp();
    }
  },
  onToggleMap: () => {
    if (state.mode === "dungeon" && !state.pendingTrap) {
      clearMessageOnPlayerAction();
      toggleMap();
    }
  },
  onSystemMenu: () => {
    // In town mode, Esc is handled by the town controller (back from
    // sub-screens). Only open the save menu from the town main menu.
    // While a trap prompt is up, Esc means "leave the chest" (handled by the
    // trap key listener below).
    if (state.mode !== "dungeon" || state.pendingTrap) return;
    if (mapVisible) {
      toggleMap();
      return;
    }
    clearMessageOnPlayerAction();
    openSaveMenu();
  },
  onTown: () => {
    if (state.mode === "dungeon" && !mapVisible && !state.pendingTrap) {
      clearMessageOnPlayerAction();
      returnToTown();
    }
  },
  onCastSpell: () => {
    if (state.mode === "dungeon" && !mapVisible && !state.pendingTrap) {
      clearMessageOnPlayerAction();
      openSpellMenu();
    }
  },
  onActionRing: () => {
    if (state.mode === "dungeon" && !mapVisible && !state.pendingTrap) {
      clearMessageOnPlayerAction();
      openActionRing();
    }
  },
  onUnlock: () => {
    if (state.mode === "dungeon" && !mapVisible && !state.pendingTrap) {
      audio.resume();
      clearMessageOnPlayerAction();
      const msg = tryUnlock(state);
      setMessage(msg);
      // Play the appropriate door sound based on the result.
      if (msg.includes("unlock") || msg.includes("picks the lock")) {
        audio.doorOpen();
      } else if (msg.includes("locked")) {
        audio.doorLocked();
      }
    }
  },
};

bindInput(window, dungeonHandlers);

// --- Trapped chest prompt --------------------------------------------------
// Active while state.pendingTrap is set (the party is standing on a trapped,
// unopened chest). Movement/camp/town/save inputs are gated off above; these
// keys drive the chest interaction from game/features.ts.

/** Route a chest action result: message, camera snap, forced encounter. */
function applyChestResult(result: ChestActionResult): void {
  if (!result.message) return;
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
    setMessage(trapPrompt.renderMessage(state.pendingTrap.inspected));
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
        setMessage(trapPrompt.renderMessage(state.pendingTrap.inspected));
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
    actionRingController
  ) {
    return;
  }
  if (state.mode !== "dungeon" || state.pendingTrap || mapVisible || isRenderCameraAnimating()) {
    return;
  }
  setMode(state, "title");
  showMode("title", mapVisible);
  canvas.style.opacity = "0.2";
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
      canvas.style.opacity = "1";
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

function routeControllerEvent(event: ControllerInputEvent): void {
  const route = resolveControllerRoute({
    mode: state.mode,
    hasPerkSelect: !!perkSelectController,
    hasCombat: !!combatController,
    hasSave: !!saveController,
    hasSpellMenu: !!spellMenuController,
    hasNpc: !!npcController,
    hasActionRing: !!actionRingController,
    hasTown: !!townController,
    hasCamp: !!campController,
    hasGameOver: !!gameOverController,
    hasPartyCreation: !!partyCreationController,
    hasTitle: !!titleController,
    hasPendingTrap: !!state.pendingTrap,
    hasTrapPrompt: !!trapPrompt,
  });

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
    case "action_ring": {
      const key = controllerEventToMenuKey(event);
      if (key) actionRingController!.handleKey(key);
      return;
    }
    case "town": {
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
      const key = controllerEventToMenuKey(event);
      if (key) partyCreationController!.handleKey(key);
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
    case "select":
      dungeonHandlers.onSystemMenu();
      break;
    case "start":
      if (!mapVisible && !isRenderCameraAnimating()) {
        clearMessageOnPlayerAction();
        openActionRing();
      }
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

// Auto-save when the player leaves or reloads the page so the next session
// can resume where they left off.
window.addEventListener("beforeunload", () => {
  autoSave(state);
});

// Combat key handler — separate listener that only fires in combat mode.
window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (state.mode !== "combat" || !combatController) return;
  if (suppressNextCombatKey) {
    suppressNextCombatKey = false;
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
  if (phase === "palette") {
    const lower = e.key.toLowerCase();
    if ("tcmifr".includes(lower)) {
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
  gameOverController.handleKey(e.key);
  e.preventDefault();
});

// Town key handler — routes keys to the TownController.
window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (state.mode !== "town" || !townController) return;
  townController.handleKey(e.key);
  e.preventDefault();
});

// Party-creation key handler — routes keys to the PartyCreationController.
window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (state.mode !== "party_creation" || !partyCreationController) return;
  partyCreationController.handleKey(e.key);
  e.preventDefault();
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
        startArena(levels[selected]);
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
        startArena(levels[selected]);
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

  // Level the starter party up to the selected target level.
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
  const resolved = resolveEncounter(entry);
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
  if (titleController.handleKey(e.key)) {
    e.preventDefault();
  }
});

// Arena key handler — routes keys to the ArenaController.
// The `justOpenedArena` flag prevents the same keydown that opened the arena
// (e.g. the Enter that exits a combat result) from also selecting a menu item.
window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (state.mode !== "arena") return;
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
  canvas.style.opacity = "0.2";
  justOpenedSaveMenu = true;
  saveController = new SaveController({
    panel: document.querySelector<HTMLDivElement>("#combat-panel")!,
    state,
    modeBeforeSave: modeBeforeSaveMenu,
    onLoaded: (loaded: GameState) => {
      // Replace the current game state with the loaded one.
      // We can't reassign `state` (it's const), so we mutate in place.
      Object.assign(state, loaded);
      saveController = null;
      canvas.style.opacity = "1";
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
      canvas.style.opacity = "1";
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
  canvas.style.opacity = "0.2";
  justOpenedSpellMenu = true;
  spellMenuController = new SpellMenuController({
    panel: document.querySelector<HTMLDivElement>("#combat-panel")!,
    state,
    onClose: (message: string) => {
      spellMenuController = null;
      canvas.style.opacity = "1";
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
  const npc = state.floor.npcs?.find((n) => n.id === npcId);
  if (!npc) return;
  setMode(state, "title");
  showMode("title", mapVisible);
  canvas.style.opacity = "0.2";
  justOpenedNPCPanel = true;
  npcController = new NPCController({
    panel: document.querySelector<HTMLDivElement>("#combat-panel")!,
    state,
    npc,
    onClose: (message: string) => {
      npcController = null;
      if (npcFightId) return; // a fight is taking over the screen
      canvas.style.opacity = "1";
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
  canvas.style.opacity = "1";
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

// --- Auto-map toggle -----------------------------------------------------
function toggleMap(): void {
  mapVisible = !mapVisible;
  showMode("dungeon", mapVisible);
  canvas.style.opacity = mapVisible ? "0.3" : "1";
  if (mapVisible) {
    setMessage("Auto-map open. Press M to close.");
  } else {
    setMessage("");
  }
}

// --- Render loop ---------------------------------------------------------
// Track the previous mode so we only start/stop the audio drone on
// transitions, not every frame.
let prevMode: GameMode | null = null;

function loop() {
  // Manage ambient drone on mode transitions.
  if (state.mode !== prevMode) {
    if (state.mode === "dungeon") {
      audio.startDungeon();
    } else if (prevMode === "dungeon") {
      audio.stopDungeon();
      clearPartyStrip();
    }
    prevMode = state.mode;
  }

  if (state.mode === "dungeon") {
    render(ctx, state);
    const floorLabel = `F${state.floor.id}`;
    renderPartyStrip(
      state.party,
      compassForFacing(state.player.facing),
      floorLabel
    );
    const kind = globalInput.getLastInputKind();
    setContextualPrompt(resolveContextualPrompt(state, kind));
    if (mapVisible) {
      renderAutoMap(mapCtx, state);
    }
  }
  requestAnimationFrame(loop);
}

// Wait for the custom font and corridor textures to load before starting the
// render loop, so Canvas text rendering uses FF36 from the first frame and
// the dungeon renderer has bitmaps ready.
if ("fonts" in document) {
  Promise.all([
    document.fonts.load('14px "FF36"'),
    loadTextures(),
  ])
    .then(() => loop())
    .catch(() => loop()); // start anyway if an asset fails to load
} else {
  loadTextures().then(loop).catch(loop);
}

// Prewarm enemy/party sprite and effect caches without blocking the render loop.
loadEnemySprites().catch(() => {});
loadPartySprites().catch(() => {});
loadEffectSprites().catch(() => {});
loadMapSprites().catch(() => {});

// Debug helpers for targeted visual verification; only active when the page
// is loaded with ?debug=1. Never used in normal play.
if (new URLSearchParams(window.location.search).has("debug")) {
  (window as any).__onyxDebug = {
    state,
    startCombat,
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
      const feetOk = [...party, ...enemies].every(
        (p) => p.footY >= geo.seamY && p.footY <= geo.floorBottomY
      );
      return {
        backdropId: bd,
        geo,
        party: party.map((p) => ({ footY: p.footY, scale: p.scale, y: p.y })),
        enemies: enemies.map((p) => ({ footY: p.footY, scale: p.scale, y: p.y })),
        feetOk,
      };
    },
  };
}


