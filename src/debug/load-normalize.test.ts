import { describe, it, expect } from "vitest";
import { normalizeLoadedMode } from "./load-normalize";

describe("normalizeLoadedMode", () => {
  it("maps non-resumable modes to town", () => {
    expect(normalizeLoadedMode("title")).toBe("town");
    expect(normalizeLoadedMode("arena")).toBe("town");
  });

  it("leaves resumable modes unchanged", () => {
    expect(normalizeLoadedMode("town")).toBe("town");
    expect(normalizeLoadedMode("dungeon")).toBe("dungeon");
    expect(normalizeLoadedMode("camp")).toBe("camp");
    expect(normalizeLoadedMode("combat")).toBe("combat");
    expect(normalizeLoadedMode("game_over")).toBe("game_over");
  });
});
