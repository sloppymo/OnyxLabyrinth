import { describe, expect, it } from "vitest";
import { CHECKPOINTS, checkpointById, playerFacingCheckpoint } from "./checkpoints";
import { findProhibitedPlayerFields } from "../../src/debug/player-observation";

describe("checkpoints", () => {
  it("keeps setup coordinates out of the player-facing packet", () => {
    for (const def of CHECKPOINTS) {
      const facing = playerFacingCheckpoint(def);
      const json = JSON.stringify(facing);
      expect(json).not.toContain("jumpTo");
      expect(json).not.toContain("floorId");
      expect(json).not.toContain("forceCombat");
      expect(json).not.toContain("damagePartyRatio");
      expect(json).not.toMatch(/"x"\s*:\s*\d+/);
      expect(json).not.toMatch(/"y"\s*:\s*\d+/);
      expect(json).not.toContain(def.label);
      expect(findProhibitedPlayerFields(facing)).toEqual([]);
      expect(facing.intro).toBe("Continue playing naturally.");
    }
  });

  it("looks up checkpoints by id", () => {
    expect(checkpointById("f2-abyss-bridge").setup.jumpTo?.floorId).toBe(2);
    expect(() => checkpointById("not-real")).toThrow(/Unknown checkpoint/);
  });
});
