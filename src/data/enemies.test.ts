import { describe, it, expect } from "vitest";
import { ENEMIES_BY_ID, enemiesForFloor, ENCOUNTER_TABLES, BIG_TITTY_OGRE } from "./enemies";
import { FLOORS } from "./floors";

describe("enemy data", () => {
  it("registers big-titty-ogre", () => {
    expect(ENEMIES_BY_ID["big-titty-ogre"]).toBeDefined();
    expect(ENEMIES_BY_ID["big-titty-ogre"].isBoss).toBe(false);
  });

  it("exports the ogre constant with expected stats", () => {
    expect(BIG_TITTY_OGRE).toBeDefined();
    expect(BIG_TITTY_OGRE.id).toBe("big-titty-ogre");
    expect(BIG_TITTY_OGRE.floors).toContain(3);
  });

  it("includes the ogre in floor 3 enemies", () => {
    const ids = enemiesForFloor(3).map((e) => e.id);
    expect(ids).toContain("big-titty-ogre");
  });

  it("includes the ogre in floor 3 encounter tables", () => {
    const refs = ENCOUNTER_TABLES[3].flatMap((entry) =>
      entry.spawns.map((spawn) => spawn.enemyId)
    );
    expect(refs).toContain("big-titty-ogre");
  });

  it("puts the boss on the final floor's table", () => {
    const refs = ENCOUNTER_TABLES[3].flatMap((entry) =>
      entry.spawns.map((spawn) => spawn.enemyId)
    );
    expect(refs).toContain("headmasters-echo");
  });
});

describe("encounter table integrity", () => {
  it("every spawn enemyId in every floor's table resolves to a defined enemy", () => {
    for (const [floor, entries] of Object.entries(ENCOUNTER_TABLES)) {
      for (const entry of entries) {
        for (const spawn of entry.spawns) {
          expect(
            ENEMIES_BY_ID[spawn.enemyId],
            `floor ${floor}: unknown enemyId "${spawn.enemyId}"`
          ).toBeDefined();
        }
      }
    }
  });

  it("has a table for every defined floor and no orphan tables", () => {
    const floorIds = FLOORS.map((f) => f.id).sort();
    const tableIds = Object.keys(ENCOUNTER_TABLES).map(Number).sort();
    expect(tableIds).toEqual(floorIds);
  });

  it("re-themed bestiary ids are registered (slime/skeleton/orc family)", () => {
    for (const id of [
      "slime",
      "skeleton",
      "armored-skeleton",
      "skeleton-archer",
      "orc",
      "elite-orc",
      "werewolf",
    ]) {
      expect(ENEMIES_BY_ID[id], `missing ${id}`).toBeDefined();
    }
  });
});
