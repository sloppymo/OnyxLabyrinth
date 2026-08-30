import { describe, expect, it } from "vitest";
import { CARD_DEFS } from "../game/card-trial/cards";
import {
  CARD_ART_HEIGHT,
  DESIGN_H,
  DESIGN_W,
  cardTextLayoutTier,
  enemyHudAnchor,
  heroHudAnchor,
  layoutCardTrialActorIndicators,
  neighborShiftPx,
  queueInitials,
  type CardTrialActorAnchor,
} from "./card-trial-layout";
import type { CardTrialActorUiState } from "./card-trial-ui-model";

describe("cardTextLayoutTier", () => {
  it("keeps short rules on the native 128×96 art aperture", () => {
    expect(cardTextLayoutTier(CARD_DEFS.nip.text)).toBe("short");
    expect(cardTextLayoutTier(CARD_DEFS["the-staff-speaks"].text)).toBe("short");
    expect(CARD_ART_HEIGHT.short).toBe(96);
  });

  it("gives verbose Consume cards a taller rules region", () => {
    expect(cardTextLayoutTier(CARD_DEFS["swarm-the-wound"].text)).toBe("medium");
    expect(cardTextLayoutTier(CARD_DEFS["send-the-rat"].text)).toBe("long");
    expect(CARD_ART_HEIGHT.long).toBeLessThan(CARD_ART_HEIGHT.medium);
    expect(CARD_ART_HEIGHT.medium).toBeLessThan(CARD_ART_HEIGHT.short);
  });
});

describe("neighborShiftPx", () => {
  it("decays exponentially so far cards barely move", () => {
    expect(neighborShiftPx(0, 22, 0.35)).toBe(0);
    expect(neighborShiftPx(1, 22, 0.35)).toBeCloseTo(22, 6);
    expect(neighborShiftPx(2, 22, 0.35)).toBeCloseTo(22 * 0.35, 6);
    expect(neighborShiftPx(3, 22, 0.35)).toBeCloseTo(22 * 0.35 * 0.35, 6);
    expect(neighborShiftPx(4, 22, 0.35)).toBeLessThan(3);
  });
});

describe("actor HUD anchors", () => {
  it("places hero meters below Front/Back feet in 768×672 space", () => {
    const front = heroHudAnchor("rat-king", "front");
    const back = heroHudAnchor("old-man", "back");
    expect(front.side).toBe("below");
    expect(back.side).toBe("below");
    expect(front.y).toBeGreaterThan(back.y);
    expect(front.x).toBeGreaterThan(400);
    expect(front.y).toBeLessThan(DESIGN_H * 0.72);
  });

  it("places enemy meters above sprites", () => {
    const a = enemyHudAnchor("front", 0);
    expect(a.side).toBe("above");
    expect(a.x).toBeLessThan(DESIGN_W / 2);
    expect(a.y).toBeGreaterThan(0);
  });
});

describe("queueInitials", () => {
  it("uses stable hero abbreviations", () => {
    expect(queueInitials("Rat King", "rat-king")).toBe("RK");
    expect(queueInitials("Old Man", "old-man")).toBe("OM");
    expect(queueInitials("Cleaver", "cleaver")).toBe("CL");
  });
});

function actor(overrides: Partial<CardTrialActorUiState> = {}): CardTrialActorUiState {
  return {
    id: "rat-king",
    kind: "hero",
    name: "Rat King",
    hp: 40,
    maxHp: 40,
    guard: 0,
    row: "front",
    dead: false,
    active: true,
    plateVisible: true,
    legalTarget: false,
    selectedTarget: false,
    opened: false,
    intentLabel: null,
    intentDamage: null,
    intentWouldMiss: false,
    ...overrides,
  };
}

function anchor(overrides: Partial<CardTrialActorAnchor> = {}): CardTrialActorAnchor {
  return {
    id: "rat-king",
    kind: "hero",
    x: 540,
    drawY: 250,
    topY: 310,
    footY: 430,
    drawSize: 240,
    opacity: 1,
    mirrored: true,
    ...overrides,
  };
}

describe("live actor indicator geometry", () => {
  it("anchors rings to x/footY and scales them from draw size", () => {
    const small = layoutCardTrialActorIndicators(
      [anchor({ drawSize: 160 })],
      [actor()]
    )[0]!;
    const large = layoutCardTrialActorIndicators(
      [anchor({ drawSize: 260 })],
      [actor()]
    )[0]!;
    expect(small.ring.x + small.ring.width / 2).toBeCloseTo(540, 6);
    expect(small.ring.y + small.ring.height * 0.58).toBeCloseTo(430, 6);
    expect(large.ring.width).toBeGreaterThan(small.ring.width);
  });

  it("keeps semantic geometry identical for mirrored and unmirrored sprites", () => {
    const mirrored = layoutCardTrialActorIndicators([anchor({ mirrored: true })], [actor()])[0]!;
    const normal = layoutCardTrialActorIndicators([anchor({ mirrored: false })], [actor()])[0]!;
    expect(mirrored).toEqual(normal);
  });

  it("hides dead or fully transparent actors", () => {
    const faded = layoutCardTrialActorIndicators([anchor({ opacity: 0 })], [actor()])[0]!;
    const dead = layoutCardTrialActorIndicators([anchor()], [actor({ dead: true })])[0]!;
    expect(faded.visible).toBe(false);
    expect(dead.visible).toBe(false);
  });

  it("puts selected-target arrow on the actor, independent of plate collision offsets", () => {
    const selected = actor({ kind: "enemy", selectedTarget: true, legalTarget: true });
    const firstAnchor = anchor({ id: "target", kind: "enemy", x: 260, topY: 260, footY: 390 });
    selected.id = "target";
    const layout = layoutCardTrialActorIndicators([firstAnchor], [selected])[0]!;
    expect(layout.arrow.x).toBe(260);
    expect(layout.arrow.y).toBe(233);
    expect(layout.plate.y + layout.plate.height).toBeLessThanOrEqual(layout.arrow.y);
  });

  it("resolves close plate collisions deterministically", () => {
    const a1 = anchor({ id: "a", x: 250, topY: 280, footY: 380 });
    const a2 = anchor({ id: "b", x: 255, topY: 282, footY: 382 });
    const layouts = layoutCardTrialActorIndicators(
      [a2, a1],
      [actor({ id: "a" }), actor({ id: "b" })]
    );
    const pa = layouts.find((layout) => layout.id === "a")!.plate;
    const pb = layouts.find((layout) => layout.id === "b")!.plate;
    expect(pa).not.toEqual(pb);
    expect(layouts.map((layout) => layout.id)).toEqual(["a", "b"]);
  });

  it("keeps plate height compact regardless of intent or Guard state", () => {
    const compact = layoutCardTrialActorIndicators([anchor()], [actor()])[0]!;
    const decorated = layoutCardTrialActorIndicators(
      [anchor()],
      [actor({ guard: 5, intentLabel: "our Front", intentDamage: 7 })]
    )[0]!;
    expect(compact.plate.height).toBe(38);
    expect(decorated.plate.height).toBe(compact.plate.height);
  });

  it("does not let hidden plates reserve collision space", () => {
    const hiddenAnchor = anchor({ id: "hidden", x: 250, footY: 380, topY: 280 });
    const visibleAnchor = anchor({ id: "visible", x: 255, footY: 382, topY: 282 });
    const solo = layoutCardTrialActorIndicators(
      [visibleAnchor],
      [actor({ id: "visible" })]
    )[0]!.plate;
    const combined = layoutCardTrialActorIndicators(
      [hiddenAnchor, visibleAnchor],
      [actor({ id: "hidden", plateVisible: false }), actor({ id: "visible" })]
    ).find((layout) => layout.id === "visible")!.plate;
    expect(combined).toEqual(solo);
  });
});
