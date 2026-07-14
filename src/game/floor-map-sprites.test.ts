import { describe, expect, it } from "vitest";
import {
  floorDefToMap,
  mapToFloorDef,
  newFloorMapJSON,
  parseFloorMapJSON,
} from "./floor-map";
import { validateFloorMap } from "./floor-validate";
import { FLOORS } from "../data/floors";

describe("mapSprites round-trip", () => {
  it("preserves mapSprites through FloorDef ↔ JSON", () => {
    const map = newFloorMapJSON(8, 8, {
      id: 99,
      name: "Sprite Test",
      tilesetTheme: "f1",
      mapSprites: [
        { x: 2, y: 3, spriteId: "torch" },
        { x: 4, y: 4, spriteId: "crate" },
      ],
    });
    const floor = mapToFloorDef(map);
    expect(floor.mapSprites).toEqual(map.mapSprites);
    const again = floorDefToMap(floor);
    expect(again.mapSprites).toEqual(map.mapSprites);
    const parsed = parseFloorMapJSON(JSON.parse(JSON.stringify(again)));
    expect(parsed.mapSprites).toEqual(map.mapSprites);
  });

  it("flags unknown and oob sprites", () => {
    const map = newFloorMapJSON(4, 4, {
      mapSprites: [
        { x: 1, y: 1, spriteId: "nope" },
        { x: 99, y: 0, spriteId: "torch" },
      ],
    });
    const codes = validateFloorMap(map).map((i) => i.code);
    expect(codes).toContain("sprite_unknown");
    expect(codes).toContain("sprite_oob");
  });

  it("campaign floors still validate without mapSprites", () => {
    for (const floor of FLOORS) {
      const issues = validateFloorMap(floorDefToMap(floor)).filter(
        (i) => i.severity === "error"
      );
      expect(issues, `floor ${floor.id}`).toEqual([]);
    }
  });
});
