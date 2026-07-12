/**
 * Save/load system — design doc Section 13.
 *
 * Save anywhere, anytime — including during combat (per §13: "Save anywhere,
 * anytime. Including in dungeons, during exploration, even in combat."). 10
 * slots persisted to localStorage. Auto-save on floor transition.
 *
 * Serialization: GameState is mostly JSON-safe except for `explored` and
 * `lootTaken`/`unlockedDoors` (Sets) which are converted to/from arrays. The
 * floor grid (Cell[][]) and party (Character[]) are plain objects and serialize
 * directly, but the floor itself is cloned from the immutable FLOORS definition
 * on load rather than persisted. Combat
 * state is NOT saved — if the player saves during combat, the mode is
 * converted to "dungeon" and they reload in dungeon mode at their pre-combat
 * position. This satisfies §13's "even in combat" without persisting
 * mid-round combat state.
 */

import type { GameState } from "../types";
import { FLOORS, cloneFloor } from "../data/floors";
import { ALL_SPELLS } from "../data/spells";
import { defaultLoadoutForCharacter } from "./combat";
import { applyKilledNPCs } from "./npc";

const STORAGE_PREFIX = "wizardry-clone-save-";
const SLOT_COUNT = 10;

/** Current save format version. Bump when the serialized shape changes. */
const SAVE_VERSION = 9;

/**
 * v6 → v7: every spell id was renamed from classic Wizardry names to
 * pseudo-Latin names. Maps each old id to its pseudo-Latin counterpart.
 * (The v7 → v8 step below then remaps those to the current D&D-style names.)
 */
const SPELL_ID_MIGRATION_V6_TO_V7: Record<string, string> = {
  "mage-dumapic": "mage-pathrend",
  "mage-litofit": "mage-aerivex",
  "mage-halito": "mage-zornyx",
  "mage-mogref": "mage-wyrshel",
  "mage-melito": "mage-zornath",
  "mage-katino": "mage-somnyx",
  "mage-mahalito": "mage-zornorum",
  "mage-molito": "mage-kraelith",
  "mage-lahalito": "mage-zornyrix",
  "mage-madalto": "mage-kraelorum",
  "mage-cortu": "mage-velumbra",
  "mage-bacortu": "mage-fracturis",
  "mage-palios": "mage-sundrathis",
  "mage-socordi": "mage-mawcallix",
  "mage-fulmen": "mage-sparkyx",
  "mage-fulgor": "mage-voltis",
  "mage-fulgur": "mage-vashorum",
  "mage-ignis": "mage-emberik",
  "mage-immolatus": "mage-flammorum",
  "mage-pyro": "mage-cinderis",
  "mage-glacies": "mage-frostik",
  "mage-frigus": "mage-rimeis",
  "mage-cryo": "mage-hoarix",
  "mage-necro": "mage-venomik",
  "mage-pestis": "mage-miasmorum",
  "priest-milwa": "priest-lucenis",
  "priest-dios": "priest-aethel",
  "priest-badialma": "priest-sacrumix",
  "priest-dial": "priest-aethelin",
  "priest-latumofis": "priest-purgyx",
  "priest-dialma": "priest-aethralm",
  "priest-bamatu": "priest-wyrathis",
  "priest-di": "priest-reviscant",
  "priest-lorto": "priest-solumorum",
  "priest-bamordi": "priest-convocix",
  "priest-iride": "priest-lumenik",
};

/**
 * v7 → v8: spell ids were renamed again from pseudo-Latin to evocative
 * D&D-style English names (see data/spells.ts). Maps each pseudo-Latin id
 * to its current counterpart so existing saves keep their spells.
 */
const SPELL_ID_MIGRATION_V7_TO_V8: Record<string, string> = {
  "mage-pathrend": "mage-wayfinder",
  "mage-aerivex": "mage-levitate",
  "mage-zornyx": "mage-fire-bolt",
  "mage-wyrshel": "mage-arcane-ward",
  "mage-zornath": "mage-burning-hands",
  "mage-somnyx": "mage-sleep",
  "mage-zornorum": "mage-fireball",
  "mage-kraelith": "mage-cone-of-cold",
  "mage-zornyrix": "mage-immolate",
  "mage-kraelorum": "mage-ice-storm",
  "mage-velumbra": "mage-spell-shield",
  "mage-fracturis": "mage-silence",
  "mage-sundrathis": "mage-dispel-magic",
  "mage-mawcallix": "mage-conjure-elemental",
  "mage-sparkyx": "mage-spark",
  "mage-voltis": "mage-shock-lance",
  "mage-vashorum": "mage-chain-lightning",
  "mage-emberik": "mage-ember",
  "mage-flammorum": "mage-flame-burst",
  "mage-cinderis": "mage-cinder-bolt",
  "mage-frostik": "mage-frostbite",
  "mage-rimeis": "mage-ray-of-frost",
  "mage-hoarix": "mage-chill-touch",
  "mage-venomik": "mage-poison-spray",
  "mage-miasmorum": "mage-noxious-cloud",
  "priest-lucenis": "priest-light",
  "priest-aethel": "priest-cure-wounds",
  "priest-sacrumix": "priest-sacred-flame",
  "priest-aethelin": "priest-cure-serious",
  "priest-purgyx": "priest-neutralize-poison",
  "priest-aethralm": "priest-cure-critical",
  "priest-wyrathis": "priest-bless",
  "priest-reviscant": "priest-raise-dead",
  "priest-solumorum": "priest-sunburst",
  "priest-convocix": "priest-summon-celestial",
  "priest-lumenik": "priest-guiding-bolt",
};

/**
 * Migrate a serialized state from an older version to the current one.
 * Each step transforms one version to the next. If the save is newer than
 * the current code, return null (can't downgrade).
 */
function migrate(ser: Record<string, unknown>): SerializedState | null {
  let version = ser.version as number;
  if (version > SAVE_VERSION) return null;
  if (version === 4) {
    // v4 → v5: inventory was string[] of item ids; it becomes
    // InventoryEntry[] with everything the player already owns identified.
    const oldInv = (ser.inventory as string[] | undefined) ?? [];
    ser.inventory = oldInv.map((itemId) => ({ itemId, identified: true }));
    version = 5;
  }
  if (version === 5) {
    // v5 → v6: characters now store chosen perk ids.
    const oldParty = (ser.party as Array<Record<string, unknown>> | undefined) ?? [];
    ser.party = oldParty.map((c) => ({ ...c, perkIds: (c.perkIds as string[] | undefined) ?? [] }));
    version = 6;
  }
  if (version === 6) {
    // v6 → v7: spell ids were renamed; remap each character's knownSpellIds.
    const oldParty = (ser.party as Array<Record<string, unknown>> | undefined) ?? [];
    ser.party = oldParty.map((c) => ({
      ...c,
      knownSpellIds: ((c.knownSpellIds as string[] | undefined) ?? []).map(
        (id) => SPELL_ID_MIGRATION_V6_TO_V7[id] ?? id
      ),
    }));
    version = 7;
  }
  if (version === 7) {
    // v7 → v8: spell ids were renamed from pseudo-Latin to D&D-style names.
    const oldParty = (ser.party as Array<Record<string, unknown>> | undefined) ?? [];
    ser.party = oldParty.map((c) => ({
      ...c,
      knownSpellIds: ((c.knownSpellIds as string[] | undefined) ?? []).map(
        (id) => SPELL_ID_MIGRATION_V7_TO_V8[id] ?? id
      ),
    }));
    version = 8;
  }
  if (version === 8) {
    // v8 → v9: VFX cantrip consolidation removed 7 duplicate spell ids.
    // Map removed cantrips to their consolidated equivalents, then filter
    // out any ids that no longer exist in the spell list.
    const v8ToV9CantripMap: Record<string, string> = {
      "mage-shock-lance": "mage-spark",
      "mage-cinder-bolt": "mage-ember",
      "mage-ray-of-frost": "mage-frostbite",
      "mage-chill-touch": "mage-frostbite",
      "mage-chain-lightning": "mage-spark",
      "mage-flame-burst": "mage-ember",
      "mage-noxious-cloud": "mage-poison-spray",
    };
    const validIds = new Set(ALL_SPELLS.map((s) => s.id));
    const oldParty = (ser.party as Array<Record<string, unknown>> | undefined) ?? [];
    ser.party = oldParty.map((c) => ({
      ...c,
      knownSpellIds: ((c.knownSpellIds as string[] | undefined) ?? [])
        .map((id) => v8ToV9CantripMap[id] ?? id)
        .filter((id) => validIds.has(id)),
    }));
    version = 9;
  }
  if (version !== SAVE_VERSION) return null;
  return ser as unknown as SerializedState;
}
const AUTO_SAVE_KEY = "wizardry-clone-autosave";

export interface SaveSlotMeta {
  slot: number;
  empty: boolean;
  floorId: number;
  floorName: string;
  dayCount: number;
  partySummary: string;
  gold: number;
  savedAt: string; // ISO timestamp
}

interface SerializedState {
  version: number;
  mode: GameState["mode"];
  floorId: number;
  player: GameState["player"];
  party: GameState["party"];
  explored: string[]; // Set -> array
  exploredByFloor: Record<number, string[]>;
  stepsSinceEncounter: number;
  dayCount: number;
  partyGold: number;
  inventory: GameState["inventory"];
  keys: string[];
  unlockedDoors: string[];
  inDarkness: boolean;
  inAntimagic: boolean;
  lastDungeon: GameState["lastDungeon"];
  equipment?: GameState["equipment"];
  // Active utility-spell buffs (light/levitation). Optional: absent in saves
  // from before the buff system, defaulting to none on load.
  persistentBuffs?: GameState["persistentBuffs"];
  // Per-character swim skill. Optional: absent in older saves, defaults to {}.
  swimSkill?: GameState["swimSkill"];
  // Dungeon NPC state. Optional: absent in saves from before NPCs existed.
  talkedToNPCs?: string[];
  npcDisposition?: Record<string, number>;
  killedNPCs?: string[];
  npcTradesDone?: string[];
  // Treasure state: which treasures have been looted, keyed by floor ID.
  // Each value is an array of "x,y" position strings. The floor clone is
  // restored from the immutable FLOORS definition on load.
  lootTaken: Record<number, string[]>;
  // Event state: which one-time floor events have triggered, keyed by floor ID.
  // Optional: absent in saves from before the event system.
  eventsTriggered?: Record<number, string[]>;
  savedAt: string;
}

// --- Serialize / deserialize ----------------------------------------------

export function serialize(state: GameState): string {
  // Don't save combat state — reload returns to dungeon mode.
  // Save the current floor's explored tiles into exploredByFloor first.
  const exploredByFloor = { ...state.exploredByFloor };
  exploredByFloor[state.floor.id] = Array.from(state.explored);

  // Sync treasures looted on the current floor into the cross-floor record.
  const lootTaken: Record<number, string[]> = {};
  for (const [floorId, taken] of Object.entries(state.lootTaken)) {
    lootTaken[Number(floorId)] = Array.from(taken);
  }
  if (state.floor.treasures) {
    const current = new Set(lootTaken[state.floor.id] ?? []);
    for (const t of state.floor.treasures) {
      if (t.itemIds.length === 0) {
        current.add(`${t.x},${t.y}`);
      }
    }
    lootTaken[state.floor.id] = Array.from(current);
  }

  // Sync triggered one-time events on the current floor into the cross-floor record.
  const eventsTriggered: Record<number, string[]> = {};
  for (const [floorId, triggered] of Object.entries(state.eventsTriggered)) {
    eventsTriggered[Number(floorId)] = Array.from(triggered);
  }

  const ser: SerializedState = {
    version: SAVE_VERSION,
    mode: state.mode === "combat" ? "dungeon" : state.mode,
    floorId: state.floor.id,
    player: { ...state.player },
    party: state.party.map((c) => ({
      ...c,
      stats: { ...c.stats },
      status: [...c.status],
      knownSpellIds: [...c.knownSpellIds],
      perkIds: [...c.perkIds],
    })),
    explored: Array.from(state.explored),
    exploredByFloor,
    stepsSinceEncounter: state.stepsSinceEncounter,
    dayCount: state.dayCount,
    partyGold: state.partyGold,
    inventory: state.inventory.map((e) => ({ ...e })),
    keys: [...state.keys],
    unlockedDoors: Array.from(state.unlockedDoors),
    inDarkness: state.inDarkness,
    inAntimagic: state.inAntimagic,
    lastDungeon: state.lastDungeon,
    equipment: { ...state.equipment },
    persistentBuffs: state.persistentBuffs.map((b) => ({ ...b })),
    swimSkill: { ...state.swimSkill },
    talkedToNPCs: [...state.talkedToNPCs],
    npcDisposition: { ...state.npcDisposition },
    killedNPCs: [...state.killedNPCs],
    npcTradesDone: [...state.npcTradesDone],
    lootTaken,
    eventsTriggered,
    savedAt: new Date().toISOString(),
  };
  return JSON.stringify(ser);
}

export function deserialize(json: string): GameState | null {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    const ser = migrate(raw);
    if (!ser) {
      console.warn(
        `[save] Rejecting save: version ${raw.version} is incompatible ` +
        `with current version ${SAVE_VERSION}.`
      );
      return null;
    }

    const floorDef = FLOORS.find((f) => f.id === ser.floorId);
    if (!floorDef) return null;

    const unlockedDoors = new Set<string>(ser.unlockedDoors ?? []);

    // Rebuild per-floor looted-treasure Sets.
    const lootTaken: Record<number, Set<string>> = {};
    for (const [floorIdStr, positions] of Object.entries(ser.lootTaken ?? {})) {
      lootTaken[Number(floorIdStr)] = new Set(positions);
    }

    // Rebuild per-floor triggered-event Sets.
    const eventsTriggered: Record<number, Set<string>> = {};
    for (const [floorIdStr, positions] of Object.entries(ser.eventsTriggered ?? {})) {
      eventsTriggered[Number(floorIdStr)] = new Set(positions);
    }

    // Build a private mutable copy of the floor and restore runtime state.
    const floor = cloneFloor(floorDef);
    for (const doorKey of unlockedDoors) {
      const parts = doorKey.split(":");
      if (parts.length !== 4 || parseInt(parts[0]) !== floor.id) continue;
      const dx = parseInt(parts[1]);
      const dy = parseInt(parts[2]);
      const dir = parts[3] as "n" | "e" | "s" | "w";
      if (floor.grid[dy]?.[dx]) {
        floor.grid[dy][dx][dir] = "door";
      }
    }
    const killedNPCs = ser.killedNPCs ? [...ser.killedNPCs] : [];
    applyKilledNPCs(floor, killedNPCs);

    const taken = lootTaken[floor.id];
    if (taken) {
      for (const pos of taken) {
        const [xStr, yStr] = pos.split(",");
        const x = parseInt(xStr);
        const y = parseInt(yStr);
        const treasureDef = floor.treasures?.find((t) => t.x === x && t.y === y);
        if (treasureDef) treasureDef.itemIds = [];
        if (floor.grid[y]?.[x]) floor.grid[y][x].tile = undefined;
      }
    }

    // Clear one-time event tiles that were already triggered.
    const triggered = eventsTriggered[floor.id];
    if (triggered) {
      for (const pos of triggered) {
        const [xStr, yStr] = pos.split(",");
        const x = parseInt(xStr);
        const y = parseInt(yStr);
        const cell = floor.grid[y]?.[x];
        if (cell && cell.tile === "event") cell.tile = undefined;
      }
    }

    return {
      mode: ser.mode,
      floor,
      player: { ...ser.player },
      party: ser.party.map((c) => ({
        ...c,
        stats: { ...c.stats },
        status: [...c.status],
        knownSpellIds: [...c.knownSpellIds],
        perkIds: [...c.perkIds],
      })),
      explored: new Set(ser.explored),
      exploredByFloor: ser.exploredByFloor ?? {},
      stepsSinceEncounter: ser.stepsSinceEncounter,
      dayCount: ser.dayCount,
      partyGold: ser.partyGold ?? 0,
      inventory: ser.inventory ? ser.inventory.map((e) => ({ ...e })) : [],
      keys: ser.keys ? [...ser.keys] : [],
      unlockedDoors,
      lootTaken,
      eventsTriggered,
      // Never persisted (the save menu is unreachable while a trap prompt is
      // open; only the beforeunload autosave can capture one). Loading such a
      // save stands the party on the unopened chest with no prompt — stepping
      // off and back onto the tile re-prompts.
      pendingTrap: null,
      persistentBuffs: ser.persistentBuffs?.map((b) => ({ ...b })) ?? [],
      swimSkill: ser.swimSkill ? { ...ser.swimSkill } : {},
      talkedToNPCs: ser.talkedToNPCs ? [...ser.talkedToNPCs] : [],
      npcDisposition: ser.npcDisposition ? { ...ser.npcDisposition } : {},
      killedNPCs,
      npcTradesDone: ser.npcTradesDone ? [...ser.npcTradesDone] : [],
      inDarkness: ser.inDarkness ?? false,
      inAntimagic: ser.inAntimagic ?? false,
      lastDungeon: ser.lastDungeon ?? null,
      equipment:
        ser.equipment ??
        Object.fromEntries(
          ser.party.map((c) => [c.id, defaultLoadoutForCharacter(c)])
        ),
    };
  } catch {
    return null;
  }
}

// --- Slot metadata (for the save/load menu) --------------------------------

function getSlotMeta(slot: number): SaveSlotMeta {
  const key = `${STORAGE_PREFIX}${slot}`;
  const raw = localStorage.getItem(key);
  if (!raw) {
    return { slot, empty: true, floorId: 0, floorName: "", dayCount: 0, partySummary: "", gold: 0, savedAt: "" };
  }
  try {
    const ser = JSON.parse(raw) as SerializedState;
    const floor = FLOORS.find((f) => f.id === ser.floorId);
    const livingCount = ser.party.filter((c) => c.hp > 0).length;
    return {
      slot,
      empty: false,
      floorId: ser.floorId,
      floorName: floor?.name ?? `Floor ${ser.floorId}`,
      dayCount: ser.dayCount,
      partySummary: `${livingCount}/${ser.party.length} alive`,
      gold: ser.partyGold ?? 0,
      savedAt: ser.savedAt,
    };
  } catch {
    return { slot, empty: true, floorId: 0, floorName: "", dayCount: 0, partySummary: "", gold: 0, savedAt: "" };
  }
}

export function getAllSlotMetas(): SaveSlotMeta[] {
  const metas: SaveSlotMeta[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    metas.push(getSlotMeta(i));
  }
  return metas;
}

// --- Public API ------------------------------------------------------------

export function saveToSlot(state: GameState, slot: number): boolean {
  if (slot < 0 || slot >= SLOT_COUNT) return false;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${slot}`, serialize(state));
    return true;
  } catch {
    return false;
  }
}

export function loadFromSlot(slot: number): GameState | null {
  if (slot < 0 || slot >= SLOT_COUNT) return null;
  const raw = localStorage.getItem(`${STORAGE_PREFIX}${slot}`);
  if (!raw) return null;
  return deserialize(raw);
}

export function deleteSlot(slot: number): void {
  if (slot < 0 || slot >= SLOT_COUNT) return;
  localStorage.removeItem(`${STORAGE_PREFIX}${slot}`);
}

export function isSlotEmpty(slot: number): boolean {
  return localStorage.getItem(`${STORAGE_PREFIX}${slot}`) === null;
}

export function autoSave(state: GameState): void {
  // Overlays and party creation cannot be resumed safely: no controller is
  // reconstructed for them on boot. Keep the previous auto-save instead.
  if (state.mode === "title" || state.mode === "party_creation" || state.mode === "arena") return;
  try {
    localStorage.setItem(AUTO_SAVE_KEY, serialize(state));
  } catch {
    // Auto-save failure is non-fatal.
  }
}

export function loadAutoSave(): GameState | null {
  const raw = localStorage.getItem(AUTO_SAVE_KEY);
  if (!raw) return null;
  return deserialize(raw);
}

export { SLOT_COUNT };
