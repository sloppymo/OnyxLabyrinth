import { describe, it, expect } from "vitest";
import { ENEMIES_BY_ID, enemiesForFloor, ENCOUNTER_TABLES, BIG_TITTY_OGRE } from "./enemies";

describe("enemy data", () => {
  it("registers big-titty-ogre", () => {
    expect(ENEMIES_BY_ID["big-titty-ogre"]).toBeDefined();
    expect(ENEMIES_BY_ID["big-titty-ogre"].isBoss).toBe(false);
  });

  it("exports the ogre constant with expected stats", () => {
    expect(BIG_TITTY_OGRE).toBeDefined();
    expect(BIG_TITTY_OGRE.id).toBe("big-titty-ogre");
    expect(BIG_TITTY_OGRE.floors).toContain(4);
  });

  it("includes the ogre in floor 4 enemies", () => {
    const ids = enemiesForFloor(4).map((e) => e.id);
    expect(ids).toContain("big-titty-ogre");
  });

  it("includes the ogre in floor 4 encounter tables", () => {
    const refs = ENCOUNTER_TABLES[4].flatMap((entry) =>
      entry.spawns.map((spawn) => spawn.enemyId)
    );
    expect(refs).toContain("big-titty-ogre");
  });
});
