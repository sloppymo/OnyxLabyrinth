import { describe, expect, it } from "vitest";
import {
  resolveControllerRoute,
  type ControllerRouteContext,
} from "./controller-route";

function ctx(overrides: Partial<ControllerRouteContext> = {}): ControllerRouteContext {
  return {
    mode: "dungeon",
    hasCombat: false,
    hasTown: false,
    hasCamp: false,
    hasGameOver: false,
    hasPartyCreation: false,
    hasPrologue: false,
    hasEnding: false,
    hasTitle: false,
    ...overrides,
  };
}

describe("resolveControllerRoute", () => {
  it("routes combat before other live screens", () => {
    expect(
      resolveControllerRoute(ctx({ mode: "combat", hasCombat: true, hasTitle: true })),
    ).toBe("combat");
  });

  it("routes base mode UIs from GameState.mode", () => {
    expect(resolveControllerRoute(ctx({ mode: "town", hasTown: true }))).toBe("town");
    expect(resolveControllerRoute(ctx({ mode: "camp", hasCamp: true }))).toBe("camp");
    expect(resolveControllerRoute(ctx({ mode: "game_over", hasGameOver: true }))).toBe(
      "game_over",
    );
    expect(
      resolveControllerRoute(ctx({ mode: "party_creation", hasPartyCreation: true })),
    ).toBe("party_creation");
    expect(resolveControllerRoute(ctx({ mode: "title", hasTitle: true }))).toBe("title");
    expect(resolveControllerRoute(ctx({ mode: "arena" }))).toBe("arena");
    expect(resolveControllerRoute(ctx({ mode: "dungeon" }))).toBe("dungeon");
  });

  it("does not infer overlay ownership from leftover controller flags", () => {
    expect(resolveControllerRoute(ctx({ mode: "dungeon" }))).toBe("dungeon");
    expect(resolveControllerRoute(ctx({ mode: "title", hasTitle: true }))).toBe("title");
  });

  it("returns none for unhandled modes", () => {
    expect(resolveControllerRoute(ctx({ mode: "town" }))).toBe("none");
    expect(resolveControllerRoute(ctx({ mode: "dialog" }))).toBe("none");
  });

  it("prefers prologue over the title menu while both could be set", () => {
    expect(
      resolveControllerRoute(
        ctx({ mode: "title", hasPrologue: true, hasTitle: true }),
      ),
    ).toBe("prologue");
  });

  it("requires title mode for prologue", () => {
    expect(
      resolveControllerRoute(ctx({ mode: "dungeon", hasPrologue: true })),
    ).toBe("dungeon");
  });

  it("prefers ending over prologue and the title menu", () => {
    expect(
      resolveControllerRoute(
        ctx({ mode: "title", hasEnding: true, hasPrologue: true, hasTitle: true }),
      ),
    ).toBe("ending");
  });

  it("requires title mode for ending", () => {
    expect(
      resolveControllerRoute(ctx({ mode: "dungeon", hasEnding: true })),
    ).toBe("dungeon");
  });
});
