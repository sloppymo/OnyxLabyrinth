import { describe, expect, it } from "vitest";
import {
  floorDefToMap,
  mapToFloorDef,
  newFloorMapJSON,
  parseFloorMapJSON,
} from "./floor-map";
import { validateFloorMap } from "./floor-validate";
import { FLOORS } from "../data/floors";
import { buildSolidGrid } from "./dungeon";

describe("ceilingSprites round-trip", () => {
  it("preserves ceilingSprites (with and without scale) through FloorDef <-> JSON", () => {
    const map = newFloorMapJSON(8, 8, {
      id: 99,
      name: "Ceiling Sprite Test",
      tilesetTheme: "f1",
      ceilingSprites: [
        { x: 4, y: 4, spriteId: "test-chain" },
        { x: 2, y: 2, spriteId: "test-cage", scale: 1.5 },
      ],
    });
    const floor = mapToFloorDef(map);
    expect(floor.ceilingSprites).toEqual(map.ceilingSprites);
    const again = floorDefToMap(floor);
    expect(again.ceilingSprites).toEqual(map.ceilingSprites);
    const parsed = parseFloorMapJSON(JSON.parse(JSON.stringify(again)));
    expect(parsed.ceilingSprites).toEqual(map.ceilingSprites);
  });

  it("a floor without ceilingSprites round-trips to undefined (no behavior change)", () => {
    const map = newFloorMapJSON(8, 8, { id: 1, name: "Plain" });
    expect(map.ceilingSprites).toBeUndefined();
    const floor = mapToFloorDef(map);
    expect(floor.ceilingSprites).toBeUndefined();
  });

  it("rejects a malformed ceilingSprites entry (missing spriteId)", () => {
    expect(() =>
      parseFloorMapJSON({
        ...newFloorMapJSON(4, 4),
        ceilingSprites: [{ x: 1, y: 1 }],
      })
    ).toThrow(/spriteId/);
  });

  it("rejects a non-positive scale", () => {
    expect(() =>
      parseFloorMapJSON({
        ...newFloorMapJSON(4, 4),
        ceilingSprites: [{ x: 1, y: 1, spriteId: "torch", scale: 0 }],
      })
    ).toThrow(/scale/);
    expect(() =>
      parseFloorMapJSON({
        ...newFloorMapJSON(4, 4),
        ceilingSprites: [{ x: 1, y: 1, spriteId: "torch", scale: -2 }],
      })
    ).toThrow(/scale/);
  });

  it("flags an unknown spriteId, an out-of-bounds entry, and an invalid scale", () => {
    const map = floorDefToMap({
      id: 1,
      name: "Validate Test",
      width: 8,
      height: 8,
      grid: buildSolidGrid(8, 8),
      startX: 4,
      startY: 4,
      encounterRate: 0.08,
      ceilingSprites: [
        { x: 4, y: 4, spriteId: "nope" },
        { x: 99, y: 99, spriteId: "nope" },
        { x: 1, y: 1, spriteId: "f1-chain-hook", scale: Number.NaN },
      ],
    });
    const codes = validateFloorMap(map).map((i) => i.code);
    expect(codes).toContain("ceiling_sprite_unknown");
    expect(codes).toContain("ceiling_sprite_oob");
    expect(codes).toContain("ceiling_sprite_scale");
  });
});

describe("ceilingFeatures round-trip", () => {
  it("preserves ceilingFeatures through FloorDef <-> JSON", () => {
    const map = newFloorMapJSON(8, 8, {
      id: 99,
      name: "Ceiling Feature Test",
      tilesetTheme: "f1",
      ceilingFeatures: [
        { x: 4, y: 4, spriteId: "test-grate" },
        { x: 2, y: 2, spriteId: "test-crack" },
      ],
    });
    const floor = mapToFloorDef(map);
    expect(floor.ceilingFeatures).toEqual(map.ceilingFeatures);
    const again = floorDefToMap(floor);
    expect(again.ceilingFeatures).toEqual(map.ceilingFeatures);
    const parsed = parseFloorMapJSON(JSON.parse(JSON.stringify(again)));
    expect(parsed.ceilingFeatures).toEqual(map.ceilingFeatures);
  });

  it("a floor without ceilingFeatures round-trips to undefined (no behavior change)", () => {
    const map = newFloorMapJSON(8, 8, { id: 1, name: "Plain" });
    expect(map.ceilingFeatures).toBeUndefined();
    const floor = mapToFloorDef(map);
    expect(floor.ceilingFeatures).toBeUndefined();
  });

  it("rejects a malformed ceilingFeatures entry (missing spriteId)", () => {
    expect(() =>
      parseFloorMapJSON({
        ...newFloorMapJSON(4, 4),
        ceilingFeatures: [{ x: 1, y: 1 }],
      })
    ).toThrow(/spriteId/);
  });

  it("flags an unknown spriteId and an out-of-bounds entry", () => {
    const map = floorDefToMap({
      id: 1,
      name: "Validate Test",
      width: 8,
      height: 8,
      grid: buildSolidGrid(8, 8),
      startX: 4,
      startY: 4,
      encounterRate: 0.08,
      ceilingFeatures: [
        { x: 4, y: 4, spriteId: "nope" },
        { x: 99, y: 99, spriteId: "nope" },
      ],
    });
    const codes = validateFloorMap(map).map((i) => i.code);
    expect(codes).toContain("ceiling_feature_unknown");
    expect(codes).toContain("ceiling_feature_oob");
  });

  it("flags two ceilingFeatures entries on the same cell — only one texture can apply", () => {
    const map = floorDefToMap({
      id: 1,
      name: "Duplicate Test",
      width: 8,
      height: 8,
      grid: buildSolidGrid(8, 8),
      startX: 4,
      startY: 4,
      encounterRate: 0.08,
      ceilingFeatures: [
        { x: 3, y: 3, spriteId: "f1-ceiling-grate" },
        { x: 3, y: 3, spriteId: "f1-ceiling-hole" },
      ],
    });
    const codes = validateFloorMap(map).map((i) => i.code);
    expect(codes).toContain("ceiling_feature_duplicate");
  });

  it("campaign floors still validate without ceilingSprites/ceilingFeatures", () => {
    for (const floor of FLOORS) {
      const issues = validateFloorMap(floorDefToMap(floor)).filter(
        (i) => i.severity === "error"
      );
      expect(issues, `floor ${floor.id}`).toEqual([]);
    }
  });
});
