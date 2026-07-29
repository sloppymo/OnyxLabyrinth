import { describe, it, expect, beforeEach } from "vitest";
import { serialize, deserialize, autoSave, loadAutoSave } from "./save";
import { createGameState } from "./state";
import { findFloor } from "./floor-registry";
import { createDefaultParty, createCharacter } from "./party";
import type { GameState } from "../types";

describe("save serialization", () => {
  let state: GameState;

  beforeEach(() => {
    state = createGameState(findFloor(1)!);
    state.party = createDefaultParty();
    state.partyGold = 100;
    state.dayCount = 3;
    state.inventory = [
      { itemId: "potion", identified: true },
      { itemId: "potion", identified: false },
      { itemId: "antidote", identified: true },
    ];
    state.keys = ["iron-key"];
    state.explored = new Set(["1,2", "3,4"]);
    state.unlockedDoors = new Set(["1:5:6:N"]);
  });

  it("round-trips state through serialize/deserialize", () => {
    const json = serialize(state);
    const restored = deserialize(json);
    expect(restored).not.toBeNull();
    if (!restored) return;

    expect(restored.floor.id).toBe(state.floor.id);
    expect(restored.partyGold).toBe(100);
    expect(restored.dayCount).toBe(3);
    expect(restored.inventory).toEqual([
      { itemId: "potion", identified: true },
      { itemId: "potion", identified: false },
      { itemId: "antidote", identified: true },
    ]);
    expect(restored.keys).toEqual(["iron-key"]);
    expect(restored.explored).toEqual(new Set(["1,2", "3,4"]));
    expect(restored.unlockedDoors).toEqual(new Set(["1:5:6:N"]));
  });

  it("migrates v4 saves: string inventory becomes identified entries", () => {
    const json = serialize(state);
    const raw = JSON.parse(json);
    raw.version = 4;
    raw.inventory = ["potion", "antidote"]; // old string[] shape
    const restored = deserialize(JSON.stringify(raw));
    expect(restored).not.toBeNull();
    expect(restored?.inventory).toEqual([
      { itemId: "potion", identified: true },
      { itemId: "antidote", identified: true },
    ]);
  });

  it("round-trips NPC state and clears killed NPC tiles on load", () => {
    // Maro stands at (3,6) on floor 1.
    state.talkedToNPCs = ["maro"];
    state.npcDisposition = { maro: 80 };
    state.killedNPCs = ["maro"];
    state.npcTradesDone = ["vestra:antidote>robe+2"];
    const json = serialize(state);
    const restored = deserialize(json);
    expect(restored).not.toBeNull();
    if (!restored) return;

    expect(restored.talkedToNPCs).toEqual(["maro"]);
    expect(restored.npcDisposition).toEqual({ maro: 80 });
    expect(restored.killedNPCs).toEqual(["maro"]);
    expect(restored.npcTradesDone).toEqual(["vestra:antidote>robe+2"]);
    const maro = findFloor(1)!.npcs!.find((n) => n.id === "maro")!;
    expect(restored.floor.grid[maro.y][maro.x].tile).toBeUndefined();
  });

  it("defaults NPC state to empty for saves that predate NPCs", () => {
    const raw = JSON.parse(serialize(state));
    delete raw.talkedToNPCs;
    delete raw.npcDisposition;
    delete raw.killedNPCs;
    delete raw.npcTradesDone;
    const restored = deserialize(JSON.stringify(raw));
    expect(restored).not.toBeNull();
    if (!restored) return;
    expect(restored.talkedToNPCs).toEqual([]);
    expect(restored.npcDisposition).toEqual({});
    expect(restored.killedNPCs).toEqual([]);
    expect(restored.npcTradesDone).toEqual([]);
    const maro = findFloor(1)!.npcs!.find((n) => n.id === "maro")!;
    expect(restored.floor.grid[maro.y][maro.x].tile).toBe("npc");
  });

  it("preserves party character data", () => {
    state.party[0].hp = 5;
    state.party[0].status = ["poison"];
    const json = serialize(state);
    const restored = deserialize(json);
    expect(restored).not.toBeNull();
    if (!restored) return;

    expect(restored.party[0].hp).toBe(5);
    expect(restored.party[0].status).toEqual(["poison"]);
    // Status array should be a copy, not a reference.
    expect(restored.party[0].status).not.toBe(state.party[0].status);
  });

  it("converts combat mode to dungeon on save", () => {
    state.mode = "combat";
    const json = serialize(state);
    const restored = deserialize(json);
    expect(restored).not.toBeNull();
    if (!restored) return;
    expect(restored.mode).toBe("dungeon");
  });

  it("rejects saves with incompatible version", () => {
    const json = serialize(state);
    // Tamper with the version.
    const tampered = JSON.parse(json);
    tampered.version = 999;
    const result = deserialize(JSON.stringify(tampered));
    expect(result).toBeNull();
  });

  it("rejects saves with older version (no migration)", () => {
    const json = serialize(state);
    const tampered = JSON.parse(json);
    tampered.version = 1;
    const result = deserialize(JSON.stringify(tampered));
    expect(result).toBeNull();
  });

  it("handles corrupted JSON gracefully", () => {
    const result = deserialize("not valid json{{{");
    expect(result).toBeNull();
  });

  it("preserves exploredByFloor data", () => {
    // Note: serialize() overwrites exploredByFloor[currentFloorId] with the
    // current explored set. So floor 1 gets the current explored tiles.
    state.explored = new Set(["1,2", "3,4"]);
    state.exploredByFloor = { 2: ["5,6", "7,8"] };
    const json = serialize(state);
    const restored = deserialize(json);
    expect(restored).not.toBeNull();
    if (!restored) return;
    // Floor 1 = current explored (overwritten by serialize).
    expect(restored.exploredByFloor[1]).toEqual(["1,2", "3,4"]);
    // Floor 2 = preserved from the manual set.
    expect(restored.exploredByFloor[2]).toEqual(["5,6", "7,8"]);
  });

  it("migrates v5 saves: characters gain an empty perkIds array", () => {
    const json = serialize(state);
    const raw = JSON.parse(json);
    raw.version = 5;
    for (const c of raw.party) {
      delete c.perkIds;
    }
    const restored = deserialize(JSON.stringify(raw));
    expect(restored).not.toBeNull();
    if (!restored) return;
    for (const c of restored.party) {
      expect(c.perkIds).toEqual([]);
    }
  });

  it("migrates v7 saves: pseudo-Latin spell ids remap to D&D-style names", () => {
    const json = serialize(state);
    const raw = JSON.parse(json);
    raw.version = 7;
    // Simulate a v7 save with pseudo-Latin spell ids.
    raw.party[0].knownSpellIds = ["mage-zornyx", "mage-wyrshel", "mage-pathrend"];
    raw.party[1].knownSpellIds = ["priest-aethel", "priest-lucenis"];
    const restored = deserialize(JSON.stringify(raw));
    expect(restored).not.toBeNull();
    if (!restored) return;
    expect(restored.party[0].knownSpellIds).toEqual([
      "mage-fire-bolt",
      "mage-arcane-ward",
      "mage-wayfinder",
    ]);
    expect(restored.party[1].knownSpellIds).toEqual([
      "priest-cure-wounds",
      "priest-light",
    ]);
  });

  it("migrates v6 saves: classic Wizardry spell ids remap through both steps to D&D names", () => {
    const json = serialize(state);
    const raw = JSON.parse(json);
    raw.version = 6;
    // Simulate a v6 save with classic Wizardry spell ids.
    raw.party[0].knownSpellIds = ["mage-halito", "mage-dumapic"];
    raw.party[1].knownSpellIds = ["priest-dios", "priest-milwa"];
    const restored = deserialize(JSON.stringify(raw));
    expect(restored).not.toBeNull();
    if (!restored) return;
    // v6→v7 maps halito→zornyx, then v7→v8 maps zornyx→fire-bolt,
    // then v8→v9 keeps fire-bolt (it survived the cantrip consolidation).
    expect(restored.party[0].knownSpellIds).toEqual(["mage-fire-bolt", "mage-wayfinder"]);
    expect(restored.party[1].knownSpellIds).toEqual(["priest-cure-wounds", "priest-light"]);
  });

  it("migrates v8 saves: removed cantrip ids remap to consolidated equivalents", () => {
    const json = serialize(state);
    const raw = JSON.parse(json);
    raw.version = 8;
    // v8 had 11 cantrips; 7 were removed in v9. Test that they remap correctly.
    raw.party[0].knownSpellIds = [
      "mage-spark",
      "mage-shock-lance",     // → mage-spark (duplicate)
      "mage-ember",
      "mage-cinder-bolt",     // → mage-ember (duplicate)
      "mage-frostbite",
      "mage-ray-of-frost",    // → mage-frostbite (duplicate)
      "mage-chill-touch",     // → mage-frostbite (duplicate)
      "mage-chain-lightning", // → mage-spark (duplicate)
      "mage-flame-burst",     // → mage-ember (duplicate)
      "mage-noxious-cloud",   // → mage-poison-spray
      "mage-poison-spray",
      "mage-fire-bolt",
    ];
    const restored = deserialize(JSON.stringify(raw));
    expect(restored).not.toBeNull();
    if (!restored) return;
    // Duplicates are preserved (no dedup in migration — just remap + filter).
    expect(restored.party[0].knownSpellIds).toEqual([
      "mage-spark",
      "mage-spark",
      "mage-ember",
      "mage-ember",
      "mage-frostbite",
      "mage-frostbite",
      "mage-frostbite",
      "mage-spark",
      "mage-ember",
      "mage-poison-spray",
      "mage-poison-spray",
      "mage-fire-bolt",
    ]);
  });

  it("round-trips chosen perk ids", () => {
    state.party[0].perkIds = ["fighter-cleave"];
    state.party[1].perkIds = ["thief-ambusher", "thief-shadow"];
    const json = serialize(state);
    const restored = deserialize(json);
    expect(restored).not.toBeNull();
    if (!restored) return;
    expect(restored.party[0].perkIds).toEqual(["fighter-cleave"]);
    expect(restored.party[1].perkIds).toEqual(["thief-ambusher", "thief-shadow"]);
    // perkIds should be a copy, not a reference.
    expect(restored.party[0].perkIds).not.toBe(state.party[0].perkIds);
  });

  it("migrates v13 saves: trims a 6-person roster to the 4 active members and densifies formationSlot", () => {
    const extra1 = createCharacter("c5", "Extra1", "Human", "Neutral", "Fighter", 4);
    const extra2 = createCharacter("c6", "Extra2", "Human", "Neutral", "Mage", 5);
    const json = serialize(state);
    const raw = JSON.parse(json) as Record<string, unknown>;
    raw.version = 13;
    const rawParty = raw.party as Array<Record<string, unknown>>;
    rawParty.push(extra1 as unknown as Record<string, unknown>, extra2 as unknown as Record<string, unknown>);
    raw.activeCharIds = ["c1", "c2", "c3", "c4"];
    const rawEquipment = raw.equipment as Record<string, unknown>;
    rawEquipment.c5 = { weapon: { id: "dagger", name: "Dagger" }, armor: [] };
    rawEquipment.c6 = {
      weapon: { id: "staff", name: "Staff" },
      armor: [{ id: "robe", name: "Robe" }],
    };

    const restored = deserialize(JSON.stringify(raw));
    expect(restored).not.toBeNull();
    if (!restored) return;

    expect(restored.party.map((c) => c.id)).toEqual(["c1", "c2", "c3", "c4"]);
    expect(restored.party.map((c) => c.formationSlot)).toEqual([0, 1, 2, 3]);
    expect(restored.equipment.c5).toBeUndefined();
    expect(restored.equipment.c6).toBeUndefined();
    const inventoryIds = restored.inventory.map((e) => e.itemId);
    expect(inventoryIds).toContain("dagger");
    expect(inventoryIds).toContain("staff");
    expect(inventoryIds).toContain("robe");
  });

  it("keeps a party of 4 unchanged when migrating through v13→v14", () => {
    const json = serialize(state);
    const raw = JSON.parse(json) as Record<string, unknown>;
    raw.version = 13;
    raw.activeCharIds = (raw.party as Array<{ id: string }>).map((c) => c.id);
    const restored = deserialize(JSON.stringify(raw));
    expect(restored).not.toBeNull();
    if (!restored) return;
    expect(restored.party.map((c) => c.id)).toEqual(state.party.map((c) => c.id));
    expect(restored.party.map((c) => c.formationSlot)).toEqual(
      state.party.map((c) => c.formationSlot)
    );
  });

  it("round-trips deepestFloorReached", () => {
    state.deepestFloorReached = 4;
    const json = serialize(state);
    const restored = deserialize(json);
    expect(restored).not.toBeNull();
    expect(restored?.deepestFloorReached).toBe(4);
  });

  it("round-trips worldYear", () => {
    state.worldYear = 4047;
    const json = serialize(state);
    const restored = deserialize(json);
    expect(restored).not.toBeNull();
    expect(restored?.worldYear).toBe(4047);
  });

  it("migrates v11 saves: worldYear backfills to 3847 (pre-cycle saves start at New Game's year)", () => {
    const json = serialize(state);
    const raw = JSON.parse(json) as Record<string, unknown>;
    raw.version = 11;
    delete raw.worldYear;
    const restored = deserialize(JSON.stringify(raw));
    expect(restored).not.toBeNull();
    expect(restored?.worldYear).toBe(3847);
  });

  it("round-trips hasCompletedEnding", () => {
    state.hasCompletedEnding = true;
    const json = serialize(state);
    const restored = deserialize(json);
    expect(restored).not.toBeNull();
    expect(restored?.hasCompletedEnding).toBe(true);
  });

  it("migrates v12 saves: hasCompletedEnding backfills to false (no pre-existing save has used the wish)", () => {
    const json = serialize(state);
    const raw = JSON.parse(json) as Record<string, unknown>;
    raw.version = 12;
    delete raw.hasCompletedEnding;
    const restored = deserialize(JSON.stringify(raw));
    expect(restored).not.toBeNull();
    expect(restored?.hasCompletedEnding).toBe(false);
  });

  it("migrates v10 saves: a realistic level-6 save resets in-level progress to 0", () => {
    // Under the OLD (flat, never-spent) curve, level and xp are always in
    // sync after combat: a real level-6 character's lifetime xp sits in
    // [xpForNextLevel(5), xpForNextLevel(6)) = [600, 720). This is the
    // realistic case — see the save.ts v10->v11 comment for why the new
    // triangular curve's cumulativeXpToReachLevel(6) = 1800 clamps this to 0
    // rather than preserving a proportional residual.
    state.party[0].level = 6;
    state.party[0].xp = 650;
    const json = serialize(state);
    const raw = JSON.parse(json) as Record<string, unknown>;
    raw.version = 10;
    delete raw.deepestFloorReached;
    const restored = deserialize(JSON.stringify(raw));
    expect(restored).not.toBeNull();
    if (!restored) return;
    expect(restored.party[0].level).toBe(6); // level itself is preserved
    expect(restored.party[0].xp).toBe(0); // in-level progress is not
  });

  it("migrates v10 saves: xp above a character's current-level cost clamps to 0, never negative", () => {
    state.party[0].level = 6;
    state.party[0].xp = 2000; // higher than any real old save could produce at L6
    const json = serialize(state);
    const raw = JSON.parse(json) as Record<string, unknown>;
    raw.version = 10;
    delete raw.deepestFloorReached;
    const restored = deserialize(JSON.stringify(raw));
    expect(restored).not.toBeNull();
    if (!restored) return;
    // cumulativeXpToReachLevel(6) = 1800; 2000 - 1800 = 200, still short of
    // the 720 needed to reach level 7 — no runaway level-up cascade either way.
    expect(restored.party[0].xp).toBe(200);
    expect(restored.party[0].xp).toBeLessThan(720);
  });

  it("migrates v10 saves: deepestFloorReached backfills from the save's floor", () => {
    const json = serialize(state);
    const raw = JSON.parse(json) as Record<string, unknown>;
    raw.version = 10;
    raw.floorId = 3;
    delete raw.deepestFloorReached;
    const restored = deserialize(JSON.stringify(raw));
    expect(restored).not.toBeNull();
    expect(restored?.deepestFloorReached).toBe(3);
  });
});

describe("autoSave", () => {
  let state: GameState;

  beforeEach(() => {
    localStorage.clear();
    state = createGameState(findFloor(1)!);
    state.party = createDefaultParty();
    state.partyGold = 42;
  });

  it("writes to the auto-save slot in dungeon mode", () => {
    state.mode = "dungeon";
    autoSave(state);
    const loaded = loadAutoSave();
    expect(loaded).not.toBeNull();
    expect(loaded?.partyGold).toBe(42);
  });

  it("does not overwrite the auto-save while an Arena session is active, even mid-fight", () => {
    // Seed a real campaign auto-save first.
    state.mode = "dungeon";
    autoSave(state);

    // Simulate Arena mutating the shared state in place and switching to
    // "combat" for a wave fight, then an autosave (e.g. beforeunload)
    // firing while inArenaSession is still true.
    state.mode = "combat";
    state.partyGold = 9999;
    autoSave(state, /* inArenaSession */ true);

    const loaded = loadAutoSave();
    expect(loaded?.partyGold).toBe(42);
  });

  it("does not write while state.mode is 'arena' even without the explicit flag", () => {
    state.mode = "dungeon";
    autoSave(state);

    state.mode = "arena";
    state.partyGold = 9999;
    autoSave(state);

    const loaded = loadAutoSave();
    expect(loaded?.partyGold).toBe(42);
  });
});
