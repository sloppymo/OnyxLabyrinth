import { describe, expect, it } from "vitest";
import {
  resolveControllerRoute,
  type ControllerRouteContext,
} from "./controller-route";

function ctx(overrides: Partial<ControllerRouteContext> = {}): ControllerRouteContext {
  return {
    mode: "dungeon",
    hasPerkSelect: false,
    hasCombat: false,
    hasSave: false,
    hasSpellMenu: false,
    hasNpc: false,
    hasActionRing: false,
    hasTown: false,
    hasCamp: false,
    hasGameOver: false,
    hasPartyCreation: false,
    hasTitle: false,
    hasPendingTrap: false,
    hasTrapPrompt: false,
    ...overrides,
  };
}

describe("resolveControllerRoute", () => {
  it("prefers perk select over other title overlays", () => {
    expect(
      resolveControllerRoute(
        ctx({
          mode: "title",
          hasPerkSelect: true,
          hasSave: true,
          hasActionRing: true,
        }),
      ),
    ).toBe("perk");
  });

  it("routes combat before title overlays", () => {
    expect(
      resolveControllerRoute(
        ctx({ mode: "combat", hasCombat: true, hasPerkSelect: true }),
      ),
    ).toBe("combat");
  });

  it("orders title overlays save > spell > npc > action ring", () => {
    expect(resolveControllerRoute(ctx({ mode: "title", hasSave: true }))).toBe("save");
    expect(
      resolveControllerRoute(ctx({ mode: "title", hasSpellMenu: true, hasNpc: true })),
    ).toBe("spell");
    expect(
      resolveControllerRoute(ctx({ mode: "title", hasNpc: true, hasActionRing: true })),
    ).toBe("npc");
    expect(resolveControllerRoute(ctx({ mode: "title", hasActionRing: true }))).toBe(
      "action_ring",
    );
  });

  it("requires title mode for action ring", () => {
    expect(
      resolveControllerRoute(ctx({ mode: "dungeon", hasActionRing: true })),
    ).toBe("dungeon");
  });

  it("routes mode UIs and trap before dungeon exploration", () => {
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
    expect(
      resolveControllerRoute(
        ctx({ mode: "dungeon", hasPendingTrap: true, hasTrapPrompt: true }),
      ),
    ).toBe("trap");
    expect(resolveControllerRoute(ctx({ mode: "dungeon" }))).toBe("dungeon");
  });

  it("returns none for unhandled modes", () => {
    expect(resolveControllerRoute(ctx({ mode: "town" }))).toBe("none");
  });
});
