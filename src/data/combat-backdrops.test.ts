import { describe, expect, it } from "vitest";
import {
  COMBAT_BACKDROP_NATIVE_H,
  COMBAT_BACKDROP_NATIVE_W,
  F1_BATTLEFIELD_PALETTE,
  combatBackdropRecipeForId,
  combatBackdropRecipeForTheme,
} from "./combat-backdrops";

describe("combat backdrop recipes", () => {
  it("uses an exact 3x SNES-native raster for the combat design surface", () => {
    expect(COMBAT_BACKDROP_NATIVE_W * 3).toBe(768);
    expect(COMBAT_BACKDROP_NATIVE_H * 3).toBe(672);
  });

  it("gives only the flooded first floor the authored sluice treatment", () => {
    const f1 = combatBackdropRecipeForTheme("f1");
    expect(f1.water).toBe("sluice");
    expect(f1.landmark).toBe("f1-sluice");
    expect(f1.ambient).toBe("f1-flooded");
    expect(f1.neutralizeBakedWater).toBe(true);
    expect(f1.palette).toBe(F1_BATTLEFIELD_PALETTE);

    expect(combatBackdropRecipeForTheme("f2").water).toBe("none");
    expect(combatBackdropRecipeForId("theme:f5").ambient).toBe("none");
    expect(combatBackdropRecipeForId("combat-bg").landmark).toBe("none");
  });
});
