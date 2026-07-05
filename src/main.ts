import "./styles.css";
import { FLOORS } from "./data/floors";
import { createGameState, setMode } from "./game/state";
import { moveForward, moveBackward, turnLeft, turnRight, tryUnlock } from "./engine/camera";
import { handleTileFeature, transitionToFloor } from "./game/features";
import { DX, DY } from "./game/dungeon";
import { render } from "./engine/renderer";
import { renderAutoMap } from "./engine/automap";
import { bindInput } from "./engine/input";
import { CombatController } from "./engine/combat-ui";
import { CampController } from "./engine/camp-ui";
import { SaveController } from "./engine/save-ui";
import { TownController } from "./engine/town-ui";
import { PartyCreationController } from "./engine/party-ui";
import {
  createCombatFromEncounter,
  inventoryFromCounts,
  defaultLoadoutForCharacter,
  type CombatState,
  type Loadout,
} from "./game/combat";
import { rollEncounter, resolveEncounter } from "./data/enemies";
import { ALL_SPELLS } from "./data/spells";
import { ITEMS_BY_ID } from "./data/items";
import { reviveKnockedOut, type Character } from "./game/party";
import type { GameState, GameMode } from "./types";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div id="game-wrap">
    <div id="viewport-wrap">
      <div id="message"></div>
      <canvas id="view" width="768" height="672"></canvas>
      <canvas id="map-canvas" width="768" height="672" style="display:none"></canvas>
    </div>
    <div id="party-strip"></div>
    <div id="hint"><span id="compass">N</span> &uarr;/W forward &middot; &darr;/S back &middot; &larr;/A turn left &middot; &rarr;/D turn right &middot; C camp &middot; M map &middot; T town &middot; U unlock &middot; Esc menu</div>
    <div id="combat-panel"></div>
  </div>
`;

const viewportWrap = document.querySelector<HTMLDivElement>("#viewport-wrap")!;
const canvas = document.querySelector<HTMLCanvasElement>("#view")!;
const ctx = canvas.getContext("2d")!;
const mapCanvas = document.querySelector<HTMLCanvasElement>("#map-canvas")!;
const mapCtx = mapCanvas.getContext("2d")!;
const messageEl = document.querySelector<HTMLDivElement>("#message")!;
const partyStripEl = document.querySelector<HTMLDivElement>("#party-strip")!;
const combatPanel = document.querySelector<HTMLDivElement>("#combat-panel")!;
const compassEl = document.querySelector<HTMLSpanElement>("#compass")!;

const state = createGameState(FLOORS[0]);

// Auto-map visibility flag — declared early because openTown() references it.
let mapVisible = false;

// --- Mode transition with fade -------------------------------------------
// The canvas has `transition: opacity 0.15s` in CSS. This helper fades out,
// swaps display + mode, then fades in. Non-canvas panels (combat/town/save)
// don't need the fade — they appear instantly.
function transitionToMode(newMode: GameMode, showCanvas: boolean): void {
  canvas.style.opacity = "0";
  setTimeout(() => {
    setMode(state, newMode);
    viewportWrap.style.display = showCanvas ? "" : "none";
    canvas.style.display = showCanvas ? "" : "none";
    canvas.style.opacity = "1";
  }, 150);
}

// --- Exploration tracking ------------------------------------------------
// Mark the current tile and all 4 adjacent tiles as explored. The player
// can see the current tile plus one ahead (wireframe renders 4 tiles deep),
// so revealing adjacent tiles gives a useful map without spoiling unexplored
// areas. Tiles are stored as "x,y" keys in the explored Set.
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
  transitionToMode("town", false);
  messageEl.textContent = "";
  townController = new TownController({
    panel: combatPanel,
    state,
    onEnterDungeon: () => {
      townController = null;
      combatPanel.style.display = "none";
      canvas.style.display = "";
      // Resume from the last dungeon position if the player had been in the
      // dungeon before; otherwise start fresh at Floor 1. transitionToFloor
      // clones the floor from the immutable FLOORS definition and restores
      // unlocked doors / looted treasures from GameState.
      const last = state.lastDungeon;
      const floor = last
        ? FLOORS.find((f) => f.id === last.floorId) ?? FLOORS[0]
        : FLOORS[0];
      const x = last ? last.x : floor.startX;
      const y = last ? last.y : floor.startY;
      const facing = last ? last.facing : 0;
      transitionToFloor(state, floor, x, y, facing);
      state.inDarkness = false;
      state.inAntimagic = false;
      markExplored();
      transitionToMode("dungeon", true);
      setMessage(last ? "You return to the dungeon..." : "You enter the dungeon...");
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
  canvas.style.display = "none";
  messageEl.textContent = "";
  partyCreationController = new PartyCreationController({
    panel: combatPanel,
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

// Start the game with party creation, then go to town.
openPartyCreation(() => openTown());

// --- Spell / item / loadout lookups (built once) -------------------------
const SPELLS_BY_ID: Record<string, typeof ALL_SPELLS[number]> = Object.fromEntries(
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
const ENCOUNTER_COOLDOWN = 8; // design doc §6.3: no more than 1 per 8 steps

function maybeTriggerEncounter(): boolean {
  if (state.stepsSinceEncounter < ENCOUNTER_COOLDOWN) return false;
  // Design doc §6.2: treasure rooms are guaranteed empty of enemies.
  const cell = state.floor.grid[state.player.y]?.[state.player.x];
  if (cell?.tile === "treasure") return false;
  if (Math.random() >= state.floor.encounterRate) return false;

  const entry = rollEncounter(state.floor.id);
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

function startCombat(combat: CombatState): void {
  combatPanel.style.display = "block";
  viewportWrap.style.display = "none";
  canvas.style.display = "none";
  messageEl.textContent = "";

  combatController = new CombatController(combat, {
    panel: combatPanel,
    onEnd: (result: CombatState) => {
      endCombat(result);
    },
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
  }));

  // Write the (possibly depleted) combat inventory back to GameState.
  state.inventory = inventoryFromCounts(result.inventory);

  // Persist any equipment changes made during this combat back to GameState.
  state.equipment = { ...result.loadout };

  if (result.result === "wipe") {
    // Design doc §9.1: party retreats to dungeon entrance, revives at 1 HP.
    state.party = reviveKnockedOut(state.party);
    state.player.x = state.floor.startX;
    state.player.y = state.floor.startY;
    setMessage("The party was wiped out! You retreat to the entrance and revive.");
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
    setMessage(`Victory! +${goldEarned} gold, +${xpEarned} XP each.`);
  }

  state.combat = undefined;
  combatController = null;
  combatPanel.style.display = "none";
  viewportWrap.style.display = "";
  canvas.style.display = "";
  setMode(state, "dungeon");
}

// --- Camp mode -----------------------------------------------------------
let campController: CampController | null = null;

function startCamp(): void {
  // Design doc §5.2: cannot camp on hazard tiles (teleporters, chutes, stairs).
  const cell = state.floor.grid[state.player.y]?.[state.player.x];
  const tile = cell?.tile;
  if (tile === "teleporter" || tile === "chute" || tile === "stairs_up" || tile === "stairs_down") {
    setMessage("You can't make camp here — the ground is unstable.");
    return;
  }
  setMode(state, "camp");
  if (mapVisible) toggleMap();
  viewportWrap.style.display = "none";
  canvas.style.display = "none";
  messageEl.textContent = "";

  state.dayCount++;
  campController = new CampController({
    panel: combatPanel, // reuse the same panel element (hidden during dungeon)
    party: state.party,
    dayCount: state.dayCount,
    onEnd: () => {
      campController = null;
      combatPanel.style.display = "none";
      viewportWrap.style.display = "";
      canvas.style.display = "";
      setMode(state, "dungeon");
      setMessage(`The party rests. Day ${state.dayCount}. HP and SP restored.`);
    },
  });
}

// --- Input ---------------------------------------------------------------
function setMessage(text: string): void {
  messageEl.textContent = text;
}

function onMove(): void {
  if (state.mode !== "dungeon") return;
  state.stepsSinceEncounter++;

  // Process the tile feature at the player's current position.
  const result = handleTileFeature(state);
  if (result) {
    setMessage(result.message);
    if (result.changedFloor) {
      // Floor transition happened — mark explored on the new floor.
      markExplored();
      // Don't trigger encounters on the same step as a floor transition.
      return;
    }
  }

  maybeTriggerEncounter();
}

bindInput(window, {
  onForward: () => {
    if (state.mode === "dungeon" && !mapVisible) {
      moveForward(state);
      markExplored();
      onMove();
    }
  },
  onBackward: () => {
    if (state.mode === "dungeon" && !mapVisible) {
      moveBackward(state);
      markExplored();
      onMove();
    }
  },
  onTurnLeft: () => {
    if (state.mode === "dungeon" && !mapVisible) {
      turnLeft(state);
      markExplored();
    }
  },
  onTurnRight: () => {
    if (state.mode === "dungeon" && !mapVisible) {
      turnRight(state);
      markExplored();
    }
  },
  onCamp: () => {
    if (state.mode === "dungeon" && !mapVisible) startCamp();
  },
  onToggleMap: () => {
    if (state.mode === "dungeon") toggleMap();
  },
  onSystemMenu: () => {
    // In town mode, Esc is handled by the town controller (back from
    // sub-screens). Only open the save menu from the town main menu.
    if (state.mode !== "dungeon") return;
    if (mapVisible) {
      toggleMap();
      return;
    }
    openSaveMenu();
  },
  onTown: () => {
    if (state.mode === "dungeon" && !mapVisible) returnToTown();
  },
  onUnlock: () => {
    if (state.mode === "dungeon" && !mapVisible) {
      const msg = tryUnlock(state);
      setMessage(msg);
    }
  },
});

// Combat key handler — separate listener that only fires in combat mode.
window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (state.mode !== "combat" || !combatController) return;
  combatController.handleKey(e.key);
  e.preventDefault();
});

// Camp key handler — dismisses the camp screen after the animation finishes.
window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (state.mode !== "camp" || !campController) return;
  campController.handleKey(e.key);
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

// --- Save/Load menu ------------------------------------------------------
let saveController: SaveController | null = null;
let modeBeforeSaveMenu: GameMode = "dungeon";

function openSaveMenu(): void {
  // Close the map if it's open — the save menu takes over the panel.
  if (mapVisible) toggleMap();
  modeBeforeSaveMenu = state.mode;
  setMode(state, "title"); // borrow "title" mode so dungeon input pauses
  canvas.style.opacity = "0.2";
  justOpenedSaveMenu = true;
  saveController = new SaveController({
    panel: combatPanel,
    state,
    onLoaded: (loaded: GameState) => {
      // Replace the current game state with the loaded one.
      // We can't reassign `state` (it's const), so we mutate in place.
      Object.assign(state, loaded);
      saveController = null;
      combatPanel.style.display = "none";
      canvas.style.opacity = "1";
      // Return to the mode from the loaded save, or dungeon if it was combat.
      const targetMode = state.mode === "combat" ? "dungeon" : state.mode;
      setMode(state, targetMode);
      if (targetMode === "town") {
        openTown();
      } else {
        canvas.style.display = "";
        setMessage("Game loaded.");
      }
    },
    onClose: () => {
      saveController = null;
      combatPanel.style.display = "none";
      canvas.style.opacity = "1";
      if (modeBeforeSaveMenu === "town") {
        openTown();
      } else {
        setMode(state, "dungeon");
        canvas.style.display = "";
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

// --- Auto-map toggle -----------------------------------------------------

function toggleMap(): void {
  mapVisible = !mapVisible;
  mapCanvas.style.display = mapVisible ? "block" : "none";
  canvas.style.opacity = mapVisible ? "0.3" : "1";
  if (mapVisible) {
    setMessage("Auto-map open. Press M to close.");
  } else {
    setMessage("");
  }
}

// --- Party status strip (always visible in dungeon) ----------------------
function renderPartyStrip(): void {
  const parts: string[] = [];
  for (const c of state.party) {
    const ko = c.status.includes("knockedOut") || c.hp <= 0;
    const hpPct = c.maxHp > 0 ? (Math.max(0, c.hp) / c.maxHp) * 100 : 0;
    const spPct = c.maxSp > 0 ? (c.sp / c.maxSp) * 100 : 0;
    const row = c.formationSlot <= 2 ? "F" : "B";
    parts.push(
      `<div class="ps-char ${ko ? "ko" : ""}">` +
      `<span class="ps-name">${c.name}</span>` +
      `<span class="ps-bar"><span class="ps-bar-fill hp" style="width:${hpPct}%"></span></span>` +
      `<span class="ps-num">${Math.max(0, c.hp)}/${c.maxHp}</span>` +
      (c.maxSp > 0
        ? `<span class="ps-bar"><span class="ps-bar-fill sp" style="width:${spPct}%"></span></span>` +
          `<span class="ps-num">${c.sp}/${c.maxSp}</span>`
        : `<span class="ps-num">${row}</span>`) +
      `</div>`
    );
  }
  partyStripEl.innerHTML = parts.join("");
}

// --- Render loop ---------------------------------------------------------
const COMPASS_DIRS = ["N", "E", "S", "W"];
function loop() {
  if (state.mode === "dungeon") {
    render(ctx, state);
    renderPartyStrip();
    compassEl.textContent = COMPASS_DIRS[state.player.facing];
    if (mapVisible) {
      renderAutoMap(mapCtx, state);
    }
  } else {
    partyStripEl.innerHTML = "";
  }
  requestAnimationFrame(loop);
}

// Wait for the custom font to load before starting the render loop, so
// Canvas text rendering uses FF36 from the first frame instead of the
// fallback monospace.
if ("fonts" in document) {
  document.fonts
    .load('14px "FF36"')
    .then(() => loop())
    .catch(() => loop()); // start anyway if the font fails to load
} else {
  loop();
}
