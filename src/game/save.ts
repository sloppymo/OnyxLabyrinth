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
 * directly, but the floor itself is cloned from the floor registry on load
 * rather than persisted. Combat
 * state is NOT saved — if the player saves during combat, the mode is
 * converted to "dungeon" and they reload in dungeon mode at their pre-combat
 * position. This satisfies §13's "even in combat" without persisting
 * mid-round combat state.
 */

import type { GameState } from "../types";
import { cloneFloor } from "../data/floors";
import { findFloor } from "./floor-registry";
import { ALL_SPELLS } from "../data/spells";
import { defaultLoadoutForCharacter } from "./combat-equipment";
import { applyKilledNPCs } from "./npc";
import { applyLootedTreasures } from "./loot-restore";
import { cumulativeXpToReachLevel } from "./leveling";
import { LEGACY_PARTY_SIZE, sortPartyByFormation, type Character } from "./party";
import { normalizeLoadedDuo } from "./playable-duo";

const STORAGE_PREFIX = "wizardry-clone-save-";
const SLOT_COUNT = 10;

/** Current save format version. Bump when the serialized shape changes. */
const SAVE_VERSION = 18;

/** v9 → v10 historical helper: first legacy-roster characters by formation order —
 *  mirrors the now-deleted active-roster.ts's defaultActiveCharIds(). */
function firstFourIdsByFormation(party: Character[]): string[] {
  return sortPartyByFormation(party)
    .slice(0, Math.min(LEGACY_PARTY_SIZE, party.length))
    .map((c) => c.id);
}

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
  if (version === 9) {
    // v9 → v10: four active battle roster ids (first four by formation).
    const oldParty = (ser.party as Character[] | undefined) ?? [];
    ser.activeCharIds = firstFourIdsByFormation(oldParty);
    version = 10;
  }
  if (version === 10) {
    // v10 → v11: level-ups now spend xp instead of leaving it as a lifetime
    // total (game/leveling.ts applyLevelUps), and the shop gates stock on a
    // new deepestFloorReached field.
    //
    // XP: under the old (flat, never-spent) curve, `level` and `xp` were
    // always in sync after every combat — a real level-L character's xp
    // sits in [xpForNextLevel(L-1), xpForNextLevel(L)). Under the new
    // triangular curve, "progress toward next level" is a much bigger
    // number (cumulativeXpToReachLevel(L) can be ~2.5x the old per-level
    // threshold by L6, and the gap grows with level). Recomputing
    // `xp - cumulativeXpToReachLevel(level)` clamps to 0 for effectively
    // every character above level 1 — this IS a reset of in-level progress,
    // not a proportional carry-over. That's intentional: it keeps the
    // level itself (already earned) but doesn't let cheap old-economy xp
    // buy free progress under the new, steeper economy. Left un-migrated,
    // real saves wouldn't cascade either (old and new share the same
    // per-level cost formula for the *current* level), so this is a
    // one-time fairness choice, not a bug workaround.
    //
    // deepestFloorReached backfills from the save's current floor — an
    // approximation for parties that have backtracked below their deepest
    // floor; it self-corrects the next time they reach that depth again.
    const oldParty = (ser.party as Array<Record<string, unknown>> | undefined) ?? [];
    ser.party = oldParty.map((c) => {
      const level = (c.level as number | undefined) ?? 1;
      const xp = (c.xp as number | undefined) ?? 0;
      return { ...c, xp: Math.max(0, xp - cumulativeXpToReachLevel(level)) };
    });
    ser.deepestFloorReached = (ser.floorId as number | undefined) ?? 1;
    version = 11;
  }
  if (version === 11) {
    // v11 → v12: century cycle (docs/superpowers/specs/2026-07-25-labyrinth-narrative-design.md
    // §7.2). Pre-existing saves predate the cycle entirely, so they start at
    // the same year New Game does.
    ser.worldYear = 3847;
    version = 12;
  }
  if (version === 12) {
    // v12 → v13: the wish/ending sequence (§6). Every pre-existing save
    // predates it, so none of them have "used" the wish yet.
    ser.hasCompletedEnding = false;
    version = 13;
  }
  if (version === 13) {
    // v13 → v14: the retired roster was capped at four — no 6-person roster.
    // Every save reaching this step already has activeCharIds (set natively
    // in v10+ saves, or backfilled by the v9→v10 step above), so trim the
    // roster down to those members. The other characters' equipped gear comes
    // back to inventory rather than vanishing; their formationSlot is
    // renumbered densely (0..3) in their prior formation order.
    const oldParty = (ser.party as Character[] | undefined) ?? [];
    if (oldParty.length > LEGACY_PARTY_SIZE) {
      const partyIds = new Set(oldParty.map((c) => c.id));
      const rawActive = ((ser.activeCharIds as string[] | undefined) ?? []).filter((id) =>
        partyIds.has(id)
      );
      const keepIds = new Set(rawActive.slice(0, LEGACY_PARTY_SIZE));
      if (keepIds.size < LEGACY_PARTY_SIZE) {
        for (const c of sortPartyByFormation(oldParty)) {
          if (keepIds.size >= LEGACY_PARTY_SIZE) break;
          keepIds.add(c.id);
        }
      }

      const equipment = (ser.equipment as GameState["equipment"] | undefined) ?? {};
      const inventory = (ser.inventory as GameState["inventory"] | undefined) ?? [];
      for (const c of oldParty) {
        if (keepIds.has(c.id)) continue;
        const loadout = equipment[c.id];
        if (loadout?.weapon) inventory.push({ itemId: loadout.weapon.id, identified: true });
        for (const piece of loadout?.armor ?? []) {
          inventory.push({ itemId: piece.id, identified: true });
        }
        delete equipment[c.id];
      }
      ser.equipment = equipment;
      ser.inventory = inventory;

      const kept = sortPartyByFormation(oldParty.filter((c) => keepIds.has(c.id)));
      kept.forEach((c, i) => {
        c.formationSlot = i;
      });
      ser.party = kept;
    }
    delete ser.activeCharIds;
    version = 14;
  }
  if (version === 14) {
    // v14 → v15: Hot Boi's tavern — Scorchboard quest progress, deterministic
    // rumor cycling, and the one authored temporary companion. Every
    // pre-existing save predates all three, so they start empty/unrecruited.
    ser.questStates = {};
    ser.tavernRumorCursor = 0;
    ser.companion = null;
    version = 15;
  }
  if (version === 15) {
    // v15 → v16: "The Party That Returned" scripted stairs guardian on
    // Floor 1. Every pre-existing save predates it. A party that has
    // already reached floor 2 or deeper under the old rules never fought
    // it and must not be retroactively trapped behind it on their way back
    // up — treat deepestFloorReached >= 2 as an already-cleared encounter;
    // everyone else starts in the pre-encounter state. Marking the flag
    // alone is not enough: the guardian's edge (18,21).e is authored
    // "barred" in the static floor content and only game state (via
    // unlockedDoors) opens it — an already-cleared save with the flag set
    // but no matching unlockedDoors entry would load with the flag saying
    // "done" while the tile is still physically sealed, trapping the
    // party right where the fight used to be.
    const deepest = (ser.deepestFloorReached as number | undefined) ?? 1;
    const alreadyCleared = deepest >= 2;
    ser.clearedStairsGuardians = alreadyCleared ? ["floor1-returned-party"] : [];
    if (alreadyCleared) {
      // Both sides of the edge — see the matching comment in
      // features.ts's openStairsGuardianEdge for why one side isn't enough.
      const doors = new Set<string>((ser.unlockedDoors as string[] | undefined) ?? []);
      doors.add("1:18:21:e");
      doors.add("1:19:21:w");
      ser.unlockedDoors = [...doors];
    }
    version = 16;
  }
  if (version === 16) {
    // v16 → v17: Isobel's purchased Iso-spells. Older saves have none.
    ser.purchasedSpellIds = [];
    version = 17;
  }
  if (version === 17) {
    // v17 → v18: authored environmental encounter progress (abyss face).
    ser.environmentalEncounters = {};
    version = 18;
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
  worldYear: number;
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
  // Climax chest whose treasure is held until the linked guardian is defeated.
  pendingClimax?: GameState["pendingClimax"];
  // Per-character swim skill. Optional: absent in older saves, defaults to {}.
  swimSkill?: GameState["swimSkill"];
  // Dungeon NPC state. Optional: absent in saves from before NPCs existed.
  talkedToNPCs?: string[];
  npcDisposition?: Record<string, number>;
  killedNPCs?: string[];
  npcTradesDone?: string[];
  // Floor 3 "Duelist's Vigil" state. Optional: absent in saves from before
  // this content existed, defaulting to false/undefined on load.
  kazeharuToldTruth?: boolean;
  kazeharuRecruited?: boolean;
  kazeharuOutcome?: GameState["kazeharuOutcome"];
  // Treasure state: which treasures have been looted, keyed by floor ID.
  // Each value is an array of "x,y" position strings. The floor clone is
  // restored from the immutable FLOORS definition on load.
  lootTaken: Record<number, string[]>;
  // Event state: which one-time floor events have triggered, keyed by floor ID.
  // Optional: absent in saves from before the event system.
  eventsTriggered?: Record<number, string[]>;
  /** Highest floor id ever reached; gates shop stock by depth. v11+. */
  deepestFloorReached?: number;
  /** Century cycle year; advances by 100 on a campaign party wipe. v12+. */
  worldYear?: number;
  /** Whether the wish/ending sequence has already played. v13+. */
  hasCompletedEnding?: boolean;
  /** Permanent party-level key items (e.g. "raft"). v14+. */
  keyItems?: string[];
  /** Per-floor revision tracking: floorId → revision when last visited. v14+. */
  floorRevisions?: Record<number, number>;
  /** Scorchboard quest progress, keyed by quest id. v15+. */
  questStates?: GameState["questStates"];
  /** Deterministic rumor-cycling cursor. v15+. */
  tavernRumorCursor?: number;
  /** The one authored temporary companion, if recruited. v15+. */
  companion?: GameState["companion"];
  /** Ids of cleared stairsGuardian scripted encounters. v16+. */
  clearedStairsGuardians?: string[];
  /** Iso-spells bought from Isobel's; optional for pre-v17 saves. */
  purchasedSpellIds?: string[];
  environmentalEncounters?: NonNullable<GameState["environmentalEncounters"]>;
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
    worldYear: state.worldYear,
    partyGold: state.partyGold,
    inventory: state.inventory.map((e) => ({ ...e })),
    keys: [...state.keys],
    unlockedDoors: Array.from(state.unlockedDoors),
    inDarkness: state.inDarkness,
    inAntimagic: state.inAntimagic,
    lastDungeon: state.lastDungeon,
    equipment: { ...state.equipment },
    persistentBuffs: state.persistentBuffs.map((b) => ({ ...b })),
    pendingClimax: state.pendingClimax,
    swimSkill: { ...state.swimSkill },
    talkedToNPCs: [...state.talkedToNPCs],
    npcDisposition: { ...state.npcDisposition },
    killedNPCs: [...state.killedNPCs],
    npcTradesDone: [...state.npcTradesDone],
    kazeharuToldTruth: state.kazeharuToldTruth,
    kazeharuRecruited: state.kazeharuRecruited,
    kazeharuOutcome: state.kazeharuOutcome,
    lootTaken,
    eventsTriggered,
    deepestFloorReached: state.deepestFloorReached,
    hasCompletedEnding: state.hasCompletedEnding,
    keyItems: [...state.keyItems],
    floorRevisions: { ...state.floorRevisions },
    questStates: Object.fromEntries(
      Object.entries(state.questStates).map(([id, p]) => [
        id,
        { ...p, counters: p.counters ? { ...p.counters } : undefined, flags: p.flags ? { ...p.flags } : undefined },
      ])
    ),
    tavernRumorCursor: state.tavernRumorCursor,
    companion: state.companion ? { ...state.companion } : null,
    clearedStairsGuardians: [...state.clearedStairsGuardians],
    purchasedSpellIds: [...(state.purchasedSpellIds ?? [])],
    environmentalEncounters: Object.fromEntries(
      Object.entries(state.environmentalEncounters ?? {}).map(([id, progress]) => [
        id,
        { ...progress, oneShots: [...progress.oneShots] },
      ])
    ),
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

    const floorDef = findFloor(ser.floorId);
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

    // Per-floor explored tile tracking (restored from save).
    const exploredByFloor: Record<number, string[]> = { ...(ser.exploredByFloor ?? {}) };

    // Build a private mutable copy of the floor and restore runtime state.
    const floor = cloneFloor(floorDef);

    // Floor-revision check: if the floor's geometry/content has changed
    // since the save was made, clear that floor's explored/loot/events/doors
    // state and reset the player to the floor's start position. Other floors
    // are unaffected. This is the development save-break policy for floor
    // revisions (see FloorDef.floorRevision).
    const floorRevisions = ser.floorRevisions ?? {};
    const savedRev = floorRevisions[floor.id];
    const currentRev = floor.floorRevision;
    const stale = savedRev !== undefined && currentRev !== undefined && savedRev !== currentRev;

    if (stale) {
      // Clear this floor's state from the save.
      unlockedDoors.delete(`${floor.id}:`);
      // More precise: remove all door keys for this floor.
      for (const key of [...unlockedDoors]) {
        const parts = key.split(":");
        if (parts.length > 0 && parseInt(parts[0]) === floor.id) {
          unlockedDoors.delete(key);
        }
      }
      delete lootTaken[floor.id];
      delete eventsTriggered[floor.id];
      // Clear explored for this floor.
      exploredByFloor[floor.id] = [];
      // Reset player to floor start.
      ser.player = { ...ser.player, x: floor.startX, y: floor.startY };
      // Update the revision.
      floorRevisions[floor.id] = currentRev;
    } else {
      // Restore door state.
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
    }
    const killedNPCs = ser.killedNPCs ? [...ser.killedNPCs] : [];
    applyKilledNPCs(floor, killedNPCs);

    applyLootedTreasures(floor, lootTaken);

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

    const savedParty = ser.party.map((c) => ({
      ...c,
      stats: { ...c.stats },
      status: [...c.status],
      knownSpellIds: [...c.knownSpellIds],
      perkIds: [...c.perkIds],
    }));
    const loadedDuo = normalizeLoadedDuo(savedParty);
    if (!loadedDuo) return null;

    const savedEquipment = ser.equipment ?? {};
    const equipment = Object.fromEntries(
      loadedDuo.party.map((character) => {
        const sourceId = loadedDuo.sourceIdByDuoId[character.id as "old-man" | "rat-king"];
        const sourceLoadout = sourceId ? savedEquipment[sourceId] : undefined;
        return [character.id, sourceLoadout ?? defaultLoadoutForCharacter(character)];
      })
    );
    const savedSwimSkill = ser.swimSkill ?? {};
    const swimSkill = Object.fromEntries(
      loadedDuo.party.flatMap((character) => {
        const sourceId = loadedDuo.sourceIdByDuoId[character.id as "old-man" | "rat-king"];
        const value = sourceId ? savedSwimSkill[sourceId] : undefined;
        return value === undefined ? [] : [[character.id, value]];
      })
    );

    return {
      mode: ser.mode,
      floor,
      player: { ...ser.player },
      party: loadedDuo.party,
      explored: stale ? new Set() : new Set(ser.explored),
      exploredByFloor,
      stepsSinceEncounter: ser.stepsSinceEncounter,
      dayCount: ser.dayCount,
      worldYear: ser.worldYear ?? 3847,
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
      pendingClimax: ser.pendingClimax,
      swimSkill,
      talkedToNPCs: ser.talkedToNPCs ? [...ser.talkedToNPCs] : [],
      npcDisposition: ser.npcDisposition ? { ...ser.npcDisposition } : {},
      killedNPCs,
      npcTradesDone: ser.npcTradesDone ? [...ser.npcTradesDone] : [],
      kazeharuToldTruth: ser.kazeharuToldTruth ?? false,
      kazeharuRecruited: ser.kazeharuRecruited ?? false,
      kazeharuOutcome: ser.kazeharuOutcome,
      inDarkness: ser.inDarkness ?? false,
      inAntimagic: ser.inAntimagic ?? false,
      lastDungeon: ser.lastDungeon ?? null,
      equipment,
      deepestFloorReached: ser.deepestFloorReached ?? floor.id,
      hasCompletedEnding: ser.hasCompletedEnding ?? false,
      keyItems: ser.keyItems ? [...ser.keyItems] : [],
      floorRevisions,
      questStates: ser.questStates
        ? Object.fromEntries(
            Object.entries(ser.questStates).map(([id, p]) => [
              id,
              { ...p, counters: p.counters ? { ...p.counters } : undefined, flags: p.flags ? { ...p.flags } : undefined },
            ])
          )
        : {},
      tavernRumorCursor: ser.tavernRumorCursor ?? 0,
      companion: ser.companion ? { ...ser.companion } : null,
      clearedStairsGuardians: ser.clearedStairsGuardians ? [...ser.clearedStairsGuardians] : [],
      purchasedSpellIds: ser.purchasedSpellIds ? [...ser.purchasedSpellIds] : [],
      environmentalEncounters: ser.environmentalEncounters
        ? Object.fromEntries(
            Object.entries(ser.environmentalEncounters).map(([id, progress]) => [
              id,
              { ...progress, oneShots: [...progress.oneShots] },
            ])
          )
        : {},
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
    return { slot, empty: true, floorId: 0, floorName: "", dayCount: 0, partySummary: "", gold: 0, worldYear: 0, savedAt: "" };
  }
  try {
    const ser = JSON.parse(raw) as SerializedState;
    const floor = findFloor(ser.floorId);
    const livingCount = ser.party.filter((c) => c.hp > 0).length;
    return {
      slot,
      empty: false,
      floorId: ser.floorId,
      floorName: floor?.name ?? `Floor ${ser.floorId}`,
      dayCount: ser.dayCount,
      // Slot metadata is read before deserialize. Keep legacy saves from
      // leaking their retired roster names into the current UI.
      partySummary: `Old Man + Rat King (${Math.min(livingCount, 2)}/2 alive)`,
      gold: ser.partyGold ?? 0,
      worldYear: ser.worldYear ?? 3847,
      savedAt: ser.savedAt,
    };
  } catch {
    return { slot, empty: true, floorId: 0, floorName: "", dayCount: 0, partySummary: "", gold: 0, worldYear: 0, savedAt: "" };
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

export function autoSave(state: GameState, inArenaSession = false): void {
  // Title / arena cannot be resumed safely: no controller is
  // reconstructed for them on boot. Keep the previous auto-save instead.
  // Overlays no longer flip GameState.mode to "title"; perk selection is
  // skipped at the beforeunload call site because that queue is not persisted.
  // `inArenaSession` covers the whole Arena session, not just `state.mode
  // === "arena"`: Arena mutates the shared GameState in place and switches
  // it to mode "combat" for each wave fight, which the mode check alone
  // would not catch — without this flag, an autosave firing mid-fight (or
  // between waves) would silently overwrite the player's real campaign
  // progress with the throwaway Arena party/floor.
  if (
    inArenaSession ||
    state.mode === "title" ||
    state.mode === "arena"
  ) {
    return;
  }
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
