import { describe, expect, it } from "vitest";
import { CARD_DEFS } from "../game/card-trial/cards";
import {
  CARD_ART_HEIGHT,
  DESIGN_H,
  DESIGN_W,
  cardTextLayoutTier,
  enemyHudAnchor,
  heroHudAnchor,
  neighborShiftPx,
  queueInitials,
} from "./card-trial-layout";

describe("cardTextLayoutTier", () => {
  it("keeps short rules on the native 128×96 art aperture", () => {
    expect(cardTextLayoutTier(CARD_DEFS.nip.text)).toBe("short");
    expect(cardTextLayoutTier(CARD_DEFS.staff.text)).toBe("short");
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
