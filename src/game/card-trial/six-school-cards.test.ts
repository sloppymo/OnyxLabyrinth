import { describe, expect, it } from "vitest";
import {
  cardsForHero,
  cardsForSchool,
  SCHOOL_HERO,
  SIX_SCHOOL_CATALOGUE,
  SIX_SCHOOL_IDS,
  schoolSliceDeck,
  sixSchoolCard,
  validateSixSchoolCatalogue,
  type SixSchoolEffect,
} from "./six-school-cards";

function containsEffect(effects: readonly SixSchoolEffect[], kind: SixSchoolEffect["kind"]): boolean {
  return effects.some((effect) => {
    if (effect.kind === kind) return true;
    if (
      effect.kind === "conditional" ||
      effect.kind === "magnitude" ||
      effect.kind === "overchannel" ||
      effect.kind === "blood-price" ||
      effect.kind === "consume-opened"
    ) {
      return containsEffect(effect.then, kind) ||
        (effect.kind === "conditional" && effect.otherwise ? containsEffect(effect.otherwise, kind) : false);
    }
    if (effect.kind === "foretell") {
      return containsEffect(effect.immediate, kind) || containsEffect(effect.omen, kind);
    }
    return false;
  });
}

describe("six-school card catalogue", () => {
  it("ships the canonical 36-card six-school corpus", () => {
    expect(SIX_SCHOOL_CATALOGUE).toHaveLength(36);
    expect(new Set(SIX_SCHOOL_CATALOGUE.map((card) => card.id)).size).toBe(36);
    expect(validateSixSchoolCatalogue()).toEqual([]);

    for (const school of SIX_SCHOOL_IDS) {
      const cards = cardsForSchool(school);
      expect(cards).toHaveLength(6);
      expect(cards.every((card) => card.hero === SCHOOL_HERO[school])).toBe(true);
      expect(new Set(schoolSliceDeck(school))).toEqual(new Set(cards.map((card) => card.id)));
      for (const id of schoolSliceDeck(school)) {
        expect(schoolSliceDeck(school).filter((candidate) => candidate === id)).toHaveLength(2);
      }
    }

    expect(cardsForHero("old-man")).toHaveLength(18);
    expect(cardsForHero("rat-king")).toHaveLength(18);
  });

  it("keeps every definition branchable and cross-school by construction", () => {
    for (const card of SIX_SCHOOL_CATALOGUE) {
      expect(card.branches).toHaveLength(2);
      expect(card.branches[0].effects.length).toBeGreaterThan(0);
      expect(card.branches[1].effects.length).toBeGreaterThan(0);
      expect(card.bridges.length).toBeGreaterThan(0);
      expect(card.bridges.every((school) => school !== card.school)).toBe(true);
      expect(card.bridges.every((school) => SIX_SCHOOL_IDS.includes(school))).toBe(true);
      expect(card.cost).toBeGreaterThanOrEqual(1);
      expect(card.cost).toBeLessThanOrEqual(3);
    }
  });

  it("keeps signature power concentrated in a single three-Energy card per school", () => {
    for (const school of SIX_SCHOOL_IDS) {
      expect(cardsForSchool(school).filter((card) => card.cost === 3).length).toBeLessThanOrEqual(1);
    }
    expect(sixSchoolCard("collapse-the-constellation").cost).toBe(3);
    expect(SIX_SCHOOL_CATALOGUE.filter((card) => card.cost === 3)).toHaveLength(1);
  });

  it("covers the defining interaction vocabulary in real cards", () => {
    const death = sixSchoolCard("a-death-foreseen");
    expect(death.tags).toEqual(expect.arrayContaining(["omen", "opened"]));
    expect(containsEffect(death.effects, "foretell")).toBe(true);

    const star = sixSchoolCard("star-lance");
    expect(star.tags).toEqual(expect.arrayContaining(["resonance", "magnitude"]));
    expect(containsEffect(star.effects, "magnitude")).toBe(true);

    const crown = sixSchoolCard("crown-of-hunger");
    expect(crown.tags).toEqual(expect.arrayContaining(["crowned", "blood-price", "opened", "rats"]));
    expect(containsEffect(crown.effects, "blood-price")).toBe(true);

    const tribute = sixSchoolCard("tribute");
    expect(containsEffect(tribute.effects, "steal-barrier")).toBe(true);
    expect(tribute.bridges).toEqual(expect.arrayContaining(["ashen-silence", "starving-crown"]));
  });
});
