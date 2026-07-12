/**
 * Tile feature handler — design doc §6.2.
 *
 * Called after each step (forward or backward) to process the tile the player
 * is now standing on. Each feature type has a distinct behavior:
 *
 *   stairs_up   → transition to the floor above (if it exists)
 *   stairs_down → transition to the floor below (if it exists)
 *   teleporter  → instant relocation to the paired tile (possibly another floor)
 *   chute       → forced descent to a lower floor (one-way)
 *   darkness    → set inDarkness flag (renderer limits visibility to 1 tile)
 *   antimagic   → set inAntimagic flag (spell casting fails in combat)
 *   treasure    → give loot to the party, then clear the tile feature
 *
 * The handler returns a FeatureResult describing what happened (for the message
 * bar) and whether a floor transition occurred.
 */

import type { Facing, GameState, TrapType } from "../types";
import type { Character } from "./party";
import { FLOORS, cloneFloor, type EventDef } from "../data/floors";
import { ITEMS_BY_ID } from "../data/items";
import { autoSave } from "./save";
import { equipItem, forceEquip, findBestEquipTarget, getDisplacedItem } from "./combat";
import { hasBuff } from "./persistent-spells";
import { npcAt, applyKilledNPCs } from "./npc";
import { displayNameFor } from "../data/items";
import { effectiveStats } from "./effective-stats";
import { perksForCharacter, perkModifiers } from "./perks";

type Rng = () => number;

export interface FeatureResult {
  message: string;
  /** Whether a floor transition happened (stairs, teleporter, chute). */
  changedFloor: boolean;
  /** Whether the tile feature was consumed (treasure looted). */
  consumed: boolean;
  /** Set when the party stepped onto a living NPC — main.ts opens the panel. */
  npcId?: string;
}

/**
 * Process the tile feature at the player's current position.
 * Returns null if the current tile has no feature.
 */
export function handleTileFeature(state: GameState, rng: Rng = Math.random): FeatureResult | null {
  const { floor, player } = state;
  const cell = floor.grid[player.y]?.[player.x];
  if (!cell || !cell.tile) {
    // No feature — clear darkness/antimagic flags
    state.inDarkness = false;
    state.inAntimagic = false;
    return null;
  }

  const feature = cell.tile;
  switch (feature) {
    case "stairs_up":
      return handleStairs(state, true);
    case "stairs_down":
      return handleStairs(state, false);
    case "teleporter":
      return handleTeleporter(state);
    case "chute":
      return handleChute(state);
    case "darkness":
      if (hasBuff(state, "light")) {
        state.inDarkness = false;
        state.inAntimagic = false;
        return { message: "Your magical light holds back the darkness.", changedFloor: false, consumed: false };
      }
      state.inDarkness = true;
      state.inAntimagic = false;
      return { message: "You are in a darkness zone. Visibility is reduced.", changedFloor: false, consumed: false };
    case "antimagic":
      state.inAntimagic = true;
      state.inDarkness = false;
      return { message: "You are in an anti-magic zone. Spells will fail here.", changedFloor: false, consumed: false };
    case "treasure":
      return handleTreasure(state);
    case "water":
      return handleWater(state, rng);
    case "event":
      return handleEvent(state);
    case "npc": {
      const npc = npcAt(state, player.x, player.y);
      if (!npc) {
        // Stale tile (NPC killed) — clear it.
        cell.tile = undefined;
        return null;
      }
      return {
        message: `${npc.name}, ${npc.title}, stands here.`,
        changedFloor: false,
        consumed: false,
        npcId: npc.id,
      };
    }
    default:
      return null;
  }
}

/**
 * Handle stairs_up / stairs_down. Transitions to the adjacent floor.
 * Saves the current floor's explored tiles and restores the new floor's.
 */
function handleStairs(state: GameState, goingUp: boolean): FeatureResult {
  const currentId = state.floor.id;
  const targetId = goingUp ? currentId - 1 : currentId + 1;
  const targetFloor = FLOORS.find((f) => f.id === targetId);

  if (!targetFloor) {
    return {
      message: goingUp
        ? "These stairs lead up, but there is nothing above this floor."
        : "These stairs lead down, but there is nothing below this floor.",
      changedFloor: false,
      consumed: false,
    };
  }

  transitionToFloor(state, targetFloor, targetFloor.startX, targetFloor.startY);
  return {
    message: goingUp
      ? `You climb the stairs up to ${targetFloor.name} (Floor ${targetFloor.id}).`
      : `You descend the stairs to ${targetFloor.name} (Floor ${targetFloor.id}).`,
    changedFloor: true,
    consumed: false,
  };
}

/**
 * Handle teleporter. Finds the teleporter link for the current tile and
 * relocates the player. May transition to a different floor.
 */
function handleTeleporter(state: GameState): FeatureResult {
  const { floor, player } = state;
  const link = floor.teleporters?.find((t) => t.x === player.x && t.y === player.y);

  if (!link) {
    return { message: "You feel a strange tingling, but nothing happens.", changedFloor: false, consumed: false };
  }

  const targetFloor = FLOORS.find((f) => f.id === link.toFloorId);
  if (!targetFloor) {
    return { message: "The teleporter hums, but its destination is unknown.", changedFloor: false, consumed: false };
  }

  const changedFloor = link.toFloorId !== floor.id;
  if (changedFloor) {
    transitionToFloor(state, targetFloor, link.toX, link.toY);
  } else {
    state.player.x = link.toX;
    state.player.y = link.toY;
  }

  return {
    message: changedFloor
      ? `A teleporter whisks you away to ${targetFloor.name} (Floor ${targetFloor.id}).`
      : "A teleporter whisks you away to another part of this floor.",
    changedFloor,
    consumed: false,
  };
}

/**
 * Handle chute. Forced descent to a lower floor. One-way — no return chute.
 */
function handleChute(state: GameState): FeatureResult {
  // Levitation (Levitate) carries the party safely over chutes.
  if (hasBuff(state, "levitation")) {
    return { message: "You float over the chute's mouth.", changedFloor: false, consumed: false };
  }
  const { floor, player } = state;
  const drop = floor.chuteDrops?.find((c) => c.x === player.x && c.y === player.y);

  if (!drop) {
    // Fallback: go to the next floor down
    const targetId = floor.id + 1;
    const targetFloor = FLOORS.find((f) => f.id === targetId);
    if (!targetFloor) {
      return { message: "The chute is blocked. You can't go down here.", changedFloor: false, consumed: false };
    }
    transitionToFloor(state, targetFloor, targetFloor.startX, targetFloor.startY);
    return {
      message: `You slide down the chute to ${targetFloor.name} (Floor ${targetFloor.id}).`,
      changedFloor: true,
      consumed: false,
    };
  }

  const targetFloor = FLOORS.find((f) => f.id === drop.toFloorId);
  if (!targetFloor) {
    return { message: "The chute is blocked. You can't go down here.", changedFloor: false, consumed: false };
  }

  transitionToFloor(state, targetFloor, drop.toX, drop.toY);
  return {
    message: `You slide down the chute to ${targetFloor.name} (Floor ${targetFloor.id}).`,
    changedFloor: true,
    consumed: false,
  };
}

/**
 * Handle treasure. Untrapped chests are looted immediately. Trapped chests
 * set `state.pendingTrap` instead — the tile stays, movement is blocked, and
 * the Inspect/Disarm/Open/Leave keys (main.ts) drive the chest API below.
 */
function handleTreasure(state: GameState): FeatureResult {
  const { floor, player } = state;
  const treasureDef = floor.treasures?.find((t) => t.x === player.x && t.y === player.y);

  if (!treasureDef || treasureDef.itemIds.length === 0) {
    // Already looted — clear the feature
    floor.grid[player.y][player.x].tile = undefined;
    return { message: "This treasure has already been looted.", changedFloor: false, consumed: true };
  }

  if (treasureDef.trap) {
    state.pendingTrap = {
      x: player.x,
      y: player.y,
      trapType: treasureDef.trap,
      inspected: false,
    };
    // Keep prompt strings short: the #message overlay shows ~2 lines of
    // ~30 chars before clipping, and the key hints must stay visible.
    return {
      message: "A chest! [I]nspect · [D]isarm · [O]pen · [L]eave",
      changedFloor: false,
      consumed: false,
    };
  }

  return awardTreasure(state, treasureDef);
}

/** Loot a treasure definition: give items, auto-equip gear, clear the tile. */
function awardTreasure(
  state: GameState,
  treasureDef: { x: number; y: number; itemIds: string[]; trap?: TrapType }
): FeatureResult {
  const itemNames: string[] = [];
  for (const itemId of treasureDef.itemIds) {
    // Key IDs (freeform "*-key" strings, not in ITEMS_BY_ID) go to the key
    // ring so tryUnlock() can consume them — not to the item inventory.
    if (itemId.endsWith("-key")) {
      addKey(state, itemId);
      itemNames.push(keyDisplayName(itemId));
      continue;
    }
    const item = ITEMS_BY_ID[itemId];
    // Chest weapons/armor drop unidentified (appraise in town to reveal);
    // consumables and trinkets are self-evident.
    const identified = !item || !(item.type === "weapon" || item.type === "armor");
    const entry = { itemId, identified };

    if (!item) {
      state.inventory.push(entry);
      itemNames.push(itemId);
      continue;
    }

    if (item.cursed) {
      // Cursed gear reveals itself by clamping onto whoever handles it.
      entry.identified = true;
      state.inventory.push(entry);
      const targetId = findBestEquipTarget(state.party, state.equipment, item);
      const target = targetId ? state.party.find((c) => c.id === targetId) : undefined;
      const forced = targetId ? forceEquip(state.equipment[targetId], item) : null;
      if (target && forced) {
        state.equipment[target.id] = forced;
        itemNames.push(`${item.name} — it clamps onto ${target.name}! CURSED!`);
      } else {
        itemNames.push(`${item.name} (cursed)`);
      }
      continue;
    }

    // Auto-equip found gear to the party member who needs it most (works
    // even unidentified — the party tries it on; the name stays unknown).
    if (item.type === "weapon" || item.type === "armor") {
      const targetId = findBestEquipTarget(state.party, state.equipment, item);
      if (targetId) {
        const old = state.equipment[targetId];
        const next = equipItem(old, item);
        if (next !== old) {
          state.equipment[targetId] = next;
          const displaced = getDisplacedItem(old, next, item);
          if (displaced) {
            state.inventory.push({ itemId: displaced.id, identified: true });
          }
          itemNames.push(displayNameFor(item, entry.identified));
          continue;
        }
      }
    }

    // Not equipped (consumable, trinket, or not an upgrade): add to inventory.
    state.inventory.push(entry);
    itemNames.push(displayNameFor(item, entry.identified));
  }

  // Clear the treasure
  treasureDef.itemIds = [];
  state.floor.grid[treasureDef.y][treasureDef.x].tile = undefined;

  // Record cross-floor so returning later or saving/loading doesn't need to
  // inspect (or mutate) the global FLOORS definition.
  const taken = state.lootTaken[state.floor.id] ?? new Set<string>();
  taken.add(`${treasureDef.x},${treasureDef.y}`);
  state.lootTaken[state.floor.id] = taken;

  return {
    message: `Treasure! You found: ${itemNames.join(", ")}.`,
    changedFloor: false,
    consumed: true,
  };
}

/**
 * Transition to a new floor. Saves the current floor's explored tiles and
 * restores the new floor's explored tiles (if any). The new floor is cloned
 * from the global definition, then mutable runtime state (unlocked doors,
 * looted treasures) is applied so FLOORS itself is never modified.
 */
export function transitionToFloor(
  state: GameState,
  newFloor: (typeof FLOORS)[number],
  x: number,
  y: number,
  facing: Facing = 0
): void {
  // Save current floor's explored tiles
  const currentId = state.floor.id;
  state.exploredByFloor[currentId] = Array.from(state.explored);

  // Switch to a private mutable copy of the new floor.
  const floorCopy = cloneFloor(newFloor);
  applyUnlockedDoors(floorCopy, state.unlockedDoors);
  applyLootedTreasures(floorCopy, state.lootTaken);
  applyTriggeredEvents(floorCopy, state.eventsTriggered);
  applyKilledNPCs(floorCopy, state.killedNPCs);
  state.floor = floorCopy;
  state.player.x = x;
  state.player.y = y;
  state.player.facing = facing;
  state.stepsSinceEncounter = 99; // allow encounter on first step
  state.inDarkness = false;
  state.inAntimagic = false;

  // Restore explored tiles for the new floor (if previously visited)
  const saved = state.exploredByFloor[newFloor.id];
  state.explored = saved ? new Set(saved) : new Set<string>();

  // Auto-save on floor transition (design doc §13).
  autoSave(state);
}

/** Apply previously unlocked doors to a floor copy. */
function applyUnlockedDoors(floor: (typeof FLOORS)[number], unlockedDoors: Set<string>): void {
  for (const key of unlockedDoors) {
    const parts = key.split(":");
    if (parts.length !== 4 || parseInt(parts[0]) !== floor.id) continue;
    const x = parseInt(parts[1]);
    const y = parseInt(parts[2]);
    const dir = parts[3] as "n" | "e" | "s" | "w";
    if (floor.grid[y]?.[x]) {
      floor.grid[y][x][dir] = "door";
    }
  }
}

/** Apply previously looted treasures to a floor copy. */
function applyLootedTreasures(
  floor: (typeof FLOORS)[number],
  lootTaken: Record<number, Set<string>>
): void {
  const taken = lootTaken[floor.id];
  if (!taken) return;
  for (const pos of taken) {
    const [xStr, yStr] = pos.split(",");
    const x = parseInt(xStr);
    const y = parseInt(yStr);
    const treasureDef = floor.treasures?.find((t) => t.x === x && t.y === y);
    if (treasureDef) {
      treasureDef.itemIds = [];
    }
    if (floor.grid[y]?.[x]) {
      floor.grid[y][x].tile = undefined;
    }
  }
}

/** Apply previously triggered one-time events to a floor copy. */
function applyTriggeredEvents(
  floor: (typeof FLOORS)[number],
  eventsTriggered: Record<number, Set<string>>
): void {
  const triggered = eventsTriggered[floor.id];
  if (!triggered) return;
  for (const pos of triggered) {
    const [xStr, yStr] = pos.split(",");
    const x = parseInt(xStr);
    const y = parseInt(yStr);
    const cell = floor.grid[y]?.[x];
    if (cell && cell.tile === "event") cell.tile = undefined;
  }
}

// ---------------------------------------------------------------------------
// Water (design: The Flooded Crypt should actually flood)
//
// Water tiles are passable but risky: each living member makes a swim check
// against the tile's depth. Failures take depth-scaled damage (floored at
// 1 HP — drowning outside combat would be a cheap death). Swimming is
// learned by doing: attempts raise swimSkill. Levitation (Levitate) or the
// Ring of Water Walking crosses without a check. Pool effects (heal /
// damage / cure) apply to everyone on entry. Tiles are never consumed.
// ---------------------------------------------------------------------------

/** Success chance for one swim attempt. Exported for balance tests. */
export function swimChance(skill: number, depth: number): number {
  return Math.min(0.95, Math.max(0.05, (80 - depth * 20 + skill / 2) / 100));
}

function handleWater(state: GameState, rng: Rng): FeatureResult {
  const { floor, player } = state;
  const def = floor.waters?.find((w) => w.x === player.x && w.y === player.y);
  const depth = def?.depth ?? 1;
  const noEvent = { changedFloor: false, consumed: false };

  if (hasBuff(state, "levitation")) {
    return { message: "You drift above the water.", ...noEvent };
  }
  if (state.inventory.some((e) => e.itemId === "ring-of-water-walking")) {
    return { message: "The ring bears you across the water.", ...noEvent };
  }

  // Swim checks for every living member.
  const strugglers: string[] = [];
  let totalDamage = 0;
  for (const c of aliveMembers(state)) {
    const skill = state.swimSkill[c.id] ?? 0;
    if (rng() < swimChance(skill, depth)) {
      state.swimSkill[c.id] = Math.min(100, skill + 1 + Math.floor(rng() * 3));
    } else {
      const dmg = depth * (1 + Math.floor(rng() * 3));
      c.hp = Math.max(1, c.hp - dmg);
      totalDamage += dmg;
      strugglers.push(c.name);
      state.swimSkill[c.id] = Math.min(100, skill + Math.floor(rng() * 2));
    }
  }

  let message =
    strugglers.length === 0
      ? depth >= 3
        ? "You swim the deep water safely."
        : "You wade through the water."
      : `${strugglers.join(", ")} struggle${strugglers.length === 1 ? "s" : ""} in the water (${totalDamage} dmg).`;

  // Pool effect on everyone who entered.
  if (def?.effect) {
    const eff = def.effect;
    if (eff.kind === "heal") {
      for (const c of aliveMembers(state)) {
        c.hp = Math.min(c.maxHp, c.hp + eff.power);
      }
      message += " The blessed water knits wounds.";
    } else if (eff.kind === "damage") {
      for (const c of aliveMembers(state)) {
        c.hp = Math.max(1, c.hp - eff.power);
      }
      message += " The black water burns!";
    } else {
      for (const c of aliveMembers(state)) {
        c.status = c.status.filter((st) => st !== eff.status);
      }
      message += ` The clear water washes away ${eff.status}.`;
    }
  }

  return { message, ...noEvent };
}

// ---------------------------------------------------------------------------
// Floor events (scripted traps, messages, altars, rewards)
// ---------------------------------------------------------------------------

function eventKey(x: number, y: number): string {
  return `${x},${y}`;
}

function markEventTriggered(state: GameState, x: number, y: number): void {
  const floorSet = state.eventsTriggered[state.floor.id] ?? new Set<string>();
  floorSet.add(eventKey(x, y));
  state.eventsTriggered[state.floor.id] = floorSet;
}

function isEventTriggered(state: GameState, x: number, y: number): boolean {
  return state.eventsTriggered[state.floor.id]?.has(eventKey(x, y)) ?? false;
}

export function handleEvent(state: GameState): FeatureResult | null {
  const { floor, player } = state;
  const cell = floor.grid[player.y]?.[player.x];
  if (!cell || cell.tile !== "event") return null;

  const event = floor.events?.find((e) => e.x === player.x && e.y === player.y);
  if (!event) {
    cell.tile = undefined;
    return null;
  }

  const once = event.once ?? true;
  if (once && isEventTriggered(state, player.x, player.y)) {
    cell.tile = undefined;
    return null;
  }

  state.inDarkness = false;
  state.inAntimagic = false;

  const result = applyEvent(state, event);

  if (once) {
    markEventTriggered(state, player.x, player.y);
    cell.tile = undefined;
  }

  return result;
}

function applyEvent(state: GameState, event: EventDef): FeatureResult {
  const noEvent = { changedFloor: false, consumed: event.once ?? true };
  switch (event.kind) {
    case "message":
      return { message: event.message, ...noEvent };
    case "damage": {
      const members = aliveMembers(state);
      const power = event.power ?? 0;
      const names: string[] = [];
      let total = 0;
      for (const c of members) {
        const before = c.hp;
        c.hp = Math.max(1, c.hp - power);
        const actual = before - c.hp;
        if (actual > 0) {
          names.push(c.name);
          total += actual;
        }
      }
      const dmgMsg =
        names.length === 0
          ? ""
          : ` ${names.join(", ")} ${names.length === 1 ? "takes" : "take"} ${total} damage.`;
      return { message: `${event.message}${dmgMsg}`, ...noEvent };
    }
    case "heal": {
      const members = aliveMembers(state);
      const power = event.power ?? 0;
      const names: string[] = [];
      let total = 0;
      for (const c of members) {
        const before = c.hp;
        c.hp = Math.min(c.maxHp, c.hp + power);
        const actual = c.hp - before;
        if (actual > 0) {
          names.push(c.name);
          total += actual;
        }
      }
      const healMsg =
        names.length === 0
          ? ""
          : ` ${names.join(", ")} ${names.length === 1 ? "recovers" : "recover"} ${total} HP.`;
      return { message: `${event.message}${healMsg}`, ...noEvent };
    }
    case "reward": {
      const itemId = event.itemId ?? "";
      const item = ITEMS_BY_ID[itemId];
      if (item) {
        state.inventory.push({ itemId, identified: true });
      }
      return { message: event.message, ...noEvent };
    }
    default:
      return { message: event.message, ...noEvent };
  }
}

// ---------------------------------------------------------------------------
// Trapped chest interaction (Inspect / Disarm / Open / Leave)
//
// While GameState.pendingTrap is set, main.ts blocks dungeon movement and
// routes the I/D/O/L keys to these functions. All of them are no-ops when no
// trap prompt is active.
// ---------------------------------------------------------------------------

/** Result of a chest action, consumed by main.ts. */
export interface ChestActionResult {
  message: string;
  /** The chest was opened (loot awarded) — the prompt is over. */
  opened: boolean;
  /** An alarm trap fired: main.ts must start a forced encounter. */
  alarm: boolean;
  /** A teleporter trap fired: main.ts must snap the render camera. */
  relocated: boolean;
}

const TRAP_NAMES: Record<TrapType, string> = {
  gas: "Gas Bomb",
  teleporter: "Teleporter",
  alarm: "Alarm",
  stunner: "Stunner",
  poison: "Poison Needle",
};

function noChest(): ChestActionResult {
  return { message: "", opened: false, alarm: false, relocated: false };
}

/** The treasure definition behind the active trap prompt. */
function pendingTreasure(state: GameState) {
  const p = state.pendingTrap;
  if (!p) return null;
  return state.floor.treasures?.find((t) => t.x === p.x && t.y === p.y) ?? null;
}

function aliveMembers(state: GameState): Character[] {
  return state.party.filter((c) => c.hp > 0 && !c.status.includes("knockedOut"));
}

/**
 * Inspect the chest. A living Thief identifies the trap exactly; anyone else
 * only senses that the mechanism is dangerous.
 */
export function inspectChest(state: GameState): string {
  const p = state.pendingTrap;
  if (!p) return "";
  const thief = aliveMembers(state).find((c) => c.class === "Thief");
  p.inspected = true;
  if (thief) {
    return `${thief.name}: a ${TRAP_NAMES[p.trapType]} trap! [D]isarm · [O]pen · [L]eave`;
  }
  return "Looks dangerous. [D]isarm · [O]pen · [L]eave";
}

/**
 * Attempt to disarm the trap. A Thief uses (level + AGI) / 2 + 10%; anyone
 * else falls back to LUK / 4 + 5%. On failure there is a 50% chance the trap
 * fires (the chest still opens — the trap is spent, loot survives) and a 50%
 * chance nothing happens (the party may retry).
 */
export function disarmChest(state: GameState, rng: Rng = Math.random): ChestActionResult {
  const p = state.pendingTrap;
  const treasure = pendingTreasure(state);
  if (!p || !treasure) return noChest();

  const alive = aliveMembers(state);
  if (alive.length === 0) return noChest();
  const thieves = alive.filter((c) => c.class === "Thief");
  const disarmer =
    thieves.length > 0
      ? thieves.reduce((a, b) => {
          const aStats = effectiveStats(a, state.equipment[a.id], perksForCharacter(a));
          const bStats = effectiveStats(b, state.equipment[b.id], perksForCharacter(b));
          return a.level + aStats.agi + aStats.luk >= b.level + bStats.agi + bStats.luk ? a : b;
        })
      : alive.reduce((a, b) => {
          const aStats = effectiveStats(a, state.equipment[a.id], perksForCharacter(a));
          const bStats = effectiveStats(b, state.equipment[b.id], perksForCharacter(b));
          return aStats.luk >= bStats.luk ? a : b;
        });
  const disarmerStats = effectiveStats(
    disarmer,
    state.equipment[disarmer.id],
    perksForCharacter(disarmer)
  );
  const disarmerMods = perkModifiers(perksForCharacter(disarmer), disarmerStats);
  const chance =
    disarmer.class === "Thief"
      ? Math.min(
          0.95,
          ((disarmer.level + disarmerStats.agi + disarmerStats.luk) / 3 + 10) / 100
        ) + disarmerMods.trapDisarmBonusPercent
      : Math.min(0.95, (disarmerStats.luk / 3 + 5) / 100) + disarmerMods.trapDisarmBonusPercent;

  if (rng() < chance) {
    state.pendingTrap = null;
    const loot = awardTreasure(state, treasure);
    return {
      message: `${disarmer.name} disarms the ${TRAP_NAMES[p.trapType]} trap! ${loot.message}`,
      opened: true,
      alarm: false,
      relocated: false,
    };
  }

  if (rng() < 0.5) {
    // Fumbled — the trap fires. The chest springs open anyway (trap spent).
    return triggerTrapAndOpen(state, `${disarmer.name} fumbles — the trap goes off!`, rng);
  }

  return {
    message: `${disarmer.name} slips… [D]isarm · [O]pen · [L]eave`,
    opened: false,
    alarm: false,
    relocated: false,
  };
}

/** Open the chest without disarming: the trap fires, then the loot is taken. */
export function openChest(state: GameState, rng: Rng = Math.random): ChestActionResult {
  const p = state.pendingTrap;
  const treasure = pendingTreasure(state);
  if (!p || !treasure) return noChest();
  return triggerTrapAndOpen(state, "You force the lid —", rng);
}

/** Walk away. The chest stays; stepping onto the tile again re-prompts. */
export function leaveChest(state: GameState): string {
  if (!state.pendingTrap) return "";
  state.pendingTrap = null;
  return "You leave the chest untouched.";
}

/** Fire the pending trap's effect, then award the loot and clear the prompt. */
function triggerTrapAndOpen(state: GameState, prefix: string, rng: Rng): ChestActionResult {
  const p = state.pendingTrap;
  const treasure = pendingTreasure(state);
  if (!p || !treasure) return noChest();

  state.pendingTrap = null;
  let alarm = false;
  let relocated = false;
  let effectMsg = "";

  switch (p.trapType) {
    case "gas": {
      // 2d6 to every living member. Chest traps sting but never kill —
      // wipes belong to combat, so damage floors each member at 1 HP.
      const baseDmg = 2 + Math.floor(rng() * 6) + Math.floor(rng() * 6);
      let totalDmg = 0;
      for (const c of aliveMembers(state)) {
        const effStats = effectiveStats(c, state.equipment[c.id], perksForCharacter(c));
        const mods = perkModifiers(perksForCharacter(c), effStats);
        const dmg = Math.max(0, Math.round(baseDmg * mods.trapDamageMultiplier));
        c.hp = Math.max(1, c.hp - dmg);
        totalDmg += dmg;
      }
      effectMsg = `Gas! The party takes ${totalDmg} damage.`;
      break;
    }
    case "poison": {
      for (const c of aliveMembers(state)) {
        if (!c.status.includes("poison")) c.status.push("poison");
      }
      effectMsg = "Needles! The party is poisoned.";
      break;
    }
    case "stunner": {
      const alive = aliveMembers(state);
      const count = Math.min(alive.length, 1 + Math.floor(rng() * 3));
      const pool = [...alive];
      const stunned: string[] = [];
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(rng() * pool.length);
        const victim = pool.splice(idx, 1)[0];
        if (!victim.status.includes("paralysis")) victim.status.push("paralysis");
        stunned.push(victim.name);
      }
      effectMsg = `A flash! ${stunned.join(", ")} paralyzed!`;
      break;
    }
    case "teleporter": {
      const dest = randomCarvedTile(state, p.x, p.y, rng);
      if (dest) {
        state.player.x = dest.x;
        state.player.y = dest.y;
        relocated = true;
        effectMsg = "The floor glows — you are hurled away!";
      } else {
        effectMsg = "The floor glows, but the magic fizzles.";
      }
      break;
    }
    case "alarm": {
      alarm = true;
      effectMsg = "An alarm shrieks through the halls!";
      break;
    }
  }

  // The trap is spent; the loot survives (design: traps punish, not rob).
  const loot = awardTreasure(state, treasure);

  // Teleported away from the chest: the loot message still applies (the
  // party grabbed the contents as the spell took hold).
  return {
    message: `${prefix} ${effectMsg} ${loot.message}`,
    opened: true,
    alarm,
    relocated,
  };
}

/**
 * Pick a random carved, feature-free tile (excluding the chest tile) for the
 * teleporter trap. A tile is "carved" if at least one edge is open or a door.
 */
function randomCarvedTile(
  state: GameState,
  notX: number,
  notY: number,
  rng: Rng
): { x: number; y: number } | null {
  const candidates: { x: number; y: number }[] = [];
  const grid = state.floor.grid;
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (x === notX && y === notY) continue;
      const cell = grid[y][x];
      if (cell.tile !== undefined) continue;
      if (cell.n === "wall" && cell.e === "wall" && cell.s === "wall" && cell.w === "wall") continue;
      candidates.push({ x, y });
    }
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

/** "crypt-key" → "Crypt Key" for treasure messages. */
function keyDisplayName(keyId: string): string {
  return keyId
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Check if the party has a key for a given key ID. */
export function hasKey(state: GameState, keyId: string): boolean {
  return state.keys.includes(keyId);
}

/** Add a key to the party's key inventory. */
export function addKey(state: GameState, keyId: string): void {
  if (!state.keys.includes(keyId)) {
    state.keys.push(keyId);
  }
}
