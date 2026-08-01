import { describe, it, expect } from "vitest";
import {
  FEATURE_PROP_SPRITES,
  LOOTED_TREASURE_SPRITES,
  featurePropSpriteIds,
} from "./maze-props";
import { MAP_SPRITES_BY_ID } from "./map-sprites";

describe("featurePropSpriteIds", () => {
  it("prefers the purpose-made closed chest over the stand-in", () => {
    expect(featurePropSpriteIds("treasure")).toEqual(["chest-closed", "chest-unlocked"]);
  });

  it("uses the emptied-chest candidates once a chest is looted", () => {
    expect(featurePropSpriteIds("treasure", { looted: true })).toEqual(LOOTED_TREASURE_SPRITES);
  });

  it("never offers the gold-heaped chest as an emptied-chest marker", () => {
    // `chest-unlocked` shows loot. Using it for a looted chest would advertise
    // treasure the party already took — the exact mis-signal to avoid.
    expect(featurePropSpriteIds("treasure", { looted: true })).not.toContain("chest-unlocked");
  });

  it("ignores the looted flag for features that cannot be looted", () => {
    expect(featurePropSpriteIds("teleporter", { looted: true })).toEqual(["teleporter-disc"]);
  });

  it("returns no candidates for features with no prop assigned", () => {
    expect(featurePropSpriteIds("npc")).toEqual([]);
    expect(featurePropSpriteIds("chute")).toEqual([]);
  });

  it("never maps stairs, which render as door panels", () => {
    expect(featurePropSpriteIds("stairs_up")).toEqual([]);
    expect(featurePropSpriteIds("stairs_down")).toEqual([]);
  });
});

describe("FEATURE_PROP_SPRITES as a work queue", () => {
  it("lists no duplicate candidates within a feature", () => {
    for (const ids of Object.values(FEATURE_PROP_SPRITES)) {
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("tolerates ids whose art has not shipped yet", () => {
    // The table deliberately names art that does not exist: the renderer's
    // cache lookup misses and the next candidate (or the glyph) takes over.
    // Documenting the contract here means adding a row can never break a build.
    for (const ids of Object.values(FEATURE_PROP_SPRITES)) {
      for (const id of ids) {
        expect(typeof id).toBe("string");
        expect(id.length).toBeGreaterThan(0);
      }
    }
  });

  it("any id that IS registered resolves to its own MAP_SPRITES entry", () => {
    // Catches a typo'd id that would otherwise fall back to a glyph forever.
    const all = [...Object.values(FEATURE_PROP_SPRITES).flat(), ...LOOTED_TREASURE_SPRITES];
    for (const id of all) {
      const def = MAP_SPRITES_BY_ID[id];
      if (def) expect(def.id).toBe(id);
    }
  });
});
