import { describe, it, expect } from "vitest";
import { createDefaultParty, createCharacter } from "./party";
import {
  ACTIVE_ROSTER_SIZE,
  BENCH_XP_FRACTION,
  activePartyForCombat,
  applyCombatPartyResult,
  awardCombatXp,
  combatXpVictoryMessage,
  defaultActiveCharIds,
  normalizeActiveCharIds,
} from "./active-roster";
import { beginRound, createCombatFromEncounter } from "./combat";
import { SPELLS_BY_ID } from "../data/spells";
import { ITEMS_BY_ID } from "../data/items";
import { defaultLoadoutForCharacter } from "./combat-equipment";

describe("defaultActiveCharIds", () => {
  it("picks the first four members by formation slot", () => {
    const party = createDefaultParty();
    const ids = defaultActiveCharIds(party);
    expect(ids).toHaveLength(ACTIVE_ROSTER_SIZE);
    expect(ids).toEqual(["c1", "c2", "c3", "c4"]);
  });

  it("returns all members when the roster is smaller than four", () => {
    const party = [
      createCharacter("a", "A", "Human", "Good", "Fighter", 0),
      createCharacter("b", "B", "Human", "Good", "Priest", 1),
    ];
    expect(defaultActiveCharIds(party)).toEqual(["a", "b"]);
  });
});

describe("normalizeActiveCharIds", () => {
  it("fills missing slots from formation order", () => {
    const party = createDefaultParty();
    expect(normalizeActiveCharIds(party, ["c5", "c6"])).toEqual([
      "c5",
      "c6",
      "c1",
      "c2",
    ]);
  });
});

describe("awardCombatXp", () => {
  it("gives full XP to active survivors and 25% to bench", () => {
    const party = createDefaultParty();
    const active = defaultActiveCharIds(party);
    party[4].hp = 10;
    party[5].hp = 0;

    awardCombatXp(party, active, 100);

    expect(party[0].xp).toBe(100);
    expect(party[3].xp).toBe(100);
    expect(party[4].xp).toBe(Math.floor(100 * BENCH_XP_FRACTION));
    expect(party[5].xp).toBe(0);
  });
});

describe("combatXpVictoryMessage", () => {
  it("mentions bench XP when the roster has reserves", () => {
    expect(combatXpVictoryMessage(100, true)).toBe("+100 XP active, +25 XP bench");
    expect(combatXpVictoryMessage(100, false)).toBe("+100 XP each");
  });
});

describe("applyCombatPartyResult", () => {
  it("updates fighters but leaves bench members untouched", () => {
    const roster = createDefaultParty();
    const fighters = activePartyForCombat(roster, defaultActiveCharIds(roster));
    fighters[0]!.hp = 3;
    fighters[0]!.sp = 1;

    const merged = applyCombatPartyResult(roster, fighters);
    expect(merged[0].hp).toBe(3);
    expect(merged[0].sp).toBe(1);
    expect(merged[4].hp).toBe(roster[4].hp);
  });
});

describe("createCombatFromEncounter active roster", () => {
  const ratSpawn = {
    enemy: {
      id: "rat",
      name: "Rat",
      hp: 5,
      attack: 1,
      agi: 5,
      ac: 5,
      xp: 10,
      gold: 1,
      floors: [1],
      special: [] as string[],
    },
    row: "front" as const,
  };

  it("only clones active fighters into combat state", () => {
    const party = createDefaultParty();
    const active = defaultActiveCharIds(party);
    const loadout = Object.fromEntries(
      party.map((c) => [c.id, defaultLoadoutForCharacter(c)])
    );
    const combat = createCombatFromEncounter(
      party,
      [ratSpawn],
      SPELLS_BY_ID,
      ITEMS_BY_ID,
      loadout,
      [],
      false,
      active
    );
    expect(combat.party).toHaveLength(4);
    expect(combat.party.map((c) => c.id)).toEqual(active);
  });

  it("builds a four-entry player queue in beginRound", () => {
    const party = createDefaultParty();
    const active = defaultActiveCharIds(party);
    const loadout = Object.fromEntries(
      party.map((c) => [c.id, defaultLoadoutForCharacter(c)])
    );
    const combat = createCombatFromEncounter(
      party,
      [ratSpawn],
      SPELLS_BY_ID,
      ITEMS_BY_ID,
      loadout,
      [],
      false,
      active
    );
    const { queue } = beginRound(combat);
    const players = queue.filter((e) => e.kind === "player");
    expect(players).toHaveLength(4);
  });
});
