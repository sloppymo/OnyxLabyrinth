import { describe, expect, it } from "vitest";
import {
  cardsForHero,
  cardsForSchool,
  flattenSixSchoolCardEffects,
  isSixSchoolCardId,
  PHASE_ONE_CARD_IDS,
  SCHOOL_HERO,
  SIX_SCHOOL_CATALOGUE,
  SIX_SCHOOL_IDS,
  schoolSliceDeck,
  sixSchoolCard,
  validateSixSchoolCatalogue,
  type SixSchoolEffect,
} from "./six-school-cards";

function effectsOfKind(cardId: string, kind: SixSchoolEffect["kind"]): SixSchoolEffect[] {
  const card = SIX_SCHOOL_CATALOGUE.find((candidate) => candidate.id === cardId);
  if (!card) throw new Error(`missing card ${cardId}`);
  return flattenSixSchoolCardEffects(card).filter((effect) => effect.kind === kind);
}

const EXPECTED_HEADERS: Readonly<Record<string, {
  cost: 1 | 2 | 3;
  rarity: "common" | "uncommon" | "rare" | "signature";
  target: "self" | "primary" | "second" | "all" | "others" | "bound-omen-target";
  text: string;
}>> = {
  "cinder-word": { cost: 1, rarity: "common", target: "primary", text: "Deal 3. Hush 1." },
  "ashen-ward": { cost: 1, rarity: "common", target: "self", text: "Gain 6 Barrier. If any enemy is Hushed, gain 2 more." },
  "mute-the-bell": { cost: 1, rarity: "common", target: "primary", text: "Hush 2. If the target was already Hushed, deal 3." },
  "black-margin": { cost: 1, rarity: "uncommon", target: "primary", text: "Deal 3. Seal the target." },
  "cut-the-chant": { cost: 1, rarity: "uncommon", target: "primary", text: "Deal 3. You may remove any Hush from the target. For each removed, add 3 Break progress; if its intent has no Break, deal 2 as a separate hit instead." },
  "final-word": { cost: 2, rarity: "rare", target: "primary", text: "Deal 7. Remove all Hush from the target. For each removed, deal 2 as a separate hit." },
  "three-knocks": { cost: 1, rarity: "common", target: "primary", text: "Foretell: deal 2 to the bound enemy. Omen — after three later player cards are played: deal 6 to it." },
  "death-arrives-late": { cost: 1, rarity: "common", target: "primary", text: "Foretell: Hush 1 on the bound enemy. Omen — after it acts: deal 6 to it." },
  "a-death-foreseen": { cost: 1, rarity: "common", target: "primary", text: "Foretell: gain 3 Barrier. Omen — when the bound enemy becomes Opened: deal 7 to it." },
  "appointment-kept": { cost: 1, rarity: "common", target: "primary", text: "Deal 5. If the target is bound by your Omen, gain 3 Barrier." },
  "borrowed-moment": { cost: 1, rarity: "uncommon", target: "self", text: "Gain 5 Barrier. You may Recall your Omen. If you do, deal 3 to its bound target, if living, and gain 1 Resonance." },
  "the-hour-comes-round": { cost: 2, rarity: "rare", target: "primary", text: "If an Omen is Foretold, resolve it now, then deal 3 to the target. If none is Foretold, deal 8 instead." },
  "star-lance": { cost: 1, rarity: "common", target: "primary", text: "Deal 5. Magnitude 7: gain 1 Resonance." },
  conjunction: { cost: 1, rarity: "common", target: "primary", text: "Deal 2 twice. If both hits deal HP damage, gain 1 Resonance." },
  "chart-the-wound": { cost: 1, rarity: "common", target: "primary", text: "Deal 3. Open the target. If it was already Opened, gain 1 Resonance instead." },
  "constellation-ward": { cost: 1, rarity: "common", target: "self", text: "Gain 5 Barrier. Resonance 3: gain 3 more; Resonance is not spent." },
  "astral-reserve": { cost: 1, rarity: "uncommon", target: "self", text: "Gain 2 Resonance. Normal overflow becomes Barrier." },
  "collapse-the-constellation": { cost: 2, rarity: "signature", target: "all", text: "Deal 4 to all enemies. Overchannel: for each Resonance spent, deal 2 to all enemies as a separate hit." },
  "litter-the-floor": { cost: 1, rarity: "common", target: "primary", text: "Deal 3. Summon a Rat on your row." },
  nip: { cost: 1, rarity: "common", target: "primary", text: "Deal 5. If the target is Crowned, Ready one Spent Rat." },
  "open-the-rank": { cost: 1, rarity: "common", target: "primary", text: "Deal 2 twice. If the target is not Opened, the second hit counts as two cracks." },
  "gnawing-court": { cost: 1, rarity: "uncommon", target: "primary", text: "Command as many Ready Rats as possible, up to two, to bite for 2 each. Deal 2 for each Rat fewer than two that bites." },
  "nest-underfoot": { cost: 1, rarity: "common", target: "self", text: "Summon a Rat on your row. Gain 2 Barrier per Rat in your row, maximum 6." },
  "swarm-the-wound": { cost: 2, rarity: "rare", target: "primary", text: "Deal 6. Command every Ready Rat to bite the target for 2. If no Rat bites, deal 2 more. Consume Opened: Ready one Rat afterward." },
  kneel: { cost: 1, rarity: "common", target: "primary", text: "Deal 3. Crown the target." },
  "royal-guard": { cost: 1, rarity: "common", target: "self", text: "Gain 5 Barrier. If the Crowned enemy's current intent names Rat King, gain 3 more." },
  "the-king-points": { cost: 1, rarity: "common", target: "primary", text: "Deal 4. If the target is Crowned, Ready and command one Rat to bite it for 2. If no Rat exists, deal 2 more instead." },
  tribute: { cost: 1, rarity: "uncommon", target: "primary", text: "Deal 3. If the target is Crowned, remove up to 6 of its Barrier and gain that much Barrier. If it is not Crowned or none is removed, deal 2 more." },
  "decree-be-still": { cost: 1, rarity: "uncommon", target: "primary", text: "Hush 1. If Crowned, Hush 1 more. If its current intent is Sovereign, add 4 Break progress; if it has no Break, deal 4 instead." },
  condemnation: { cost: 2, rarity: "rare", target: "primary", text: "Deal 7. If Crowned and still alive, Open it and command one Ready Rat to bite for 2; if no Rat can, gain 3 Barrier." },
  "bite-the-hand": { cost: 1, rarity: "common", target: "primary", text: "Deal 5. Blood Price 2: deal another 3." },
  "eat-through-it": { cost: 1, rarity: "common", target: "self", text: "Gain 6 Barrier. Blood Price 3: move to Front and gain 5 more Barrier." },
  "royal-appetite": { cost: 1, rarity: "common", target: "primary", text: "Deal 5. Magnitude 7: Devour 2." },
  "feast-on-the-wounded": { cost: 1, rarity: "common", target: "primary", text: "Deal 4. If the target is Opened, Devour 2. Opened stays." },
  "crown-of-hunger": { cost: 1, rarity: "uncommon", target: "primary", text: "Deal 2. Crown the target. Blood Price 3: Open it." },
  "devour-the-spell": { cost: 1, rarity: "uncommon", target: "primary", text: "Hush 1. Gain 4 Barrier. If its intent is a Spell, Devour 3." },
};

const EXPECTED_BRANCH_NAMES: Readonly<Record<string, readonly [string, string]>> = {
  "cinder-word": ["Smothering Cinder", "Starved Cinder"],
  "ashen-ward": ["Sealed Ward", "Conduit Ward"],
  "mute-the-bell": ["Deep Mute", "Cracked Bell"],
  "black-margin": ["Pale Margin", "Closing Margin"],
  "cut-the-chant": ["Measured Cut", "Ragged Cut"],
  "final-word": ["Lingering Word", "Shattering Word"],
  "three-knocks": ["Hasty Knocks", "Funeral Knocks"],
  "death-arrives-late": ["Merciful Delay", "Exact Appointment"],
  "a-death-foreseen": ["Death Glimpsed", "Death Certain"],
  "appointment-kept": ["Patient Appointment", "Final Appointment"],
  "borrowed-moment": ["Moment of Ash", "Moment of Stars"],
  "the-hour-comes-round": ["Sooner Hour", "Black Hour"],
  "star-lance": ["Convergent Star Lance", "Ruinous Star Lance"],
  conjunction: ["Triple Conjunction", "Quiet Conjunction"],
  "chart-the-wound": ["Convergent Chart", "Exploded Chart"],
  "constellation-ward": ["Orbiting Ward", "Spent Constellation"],
  "astral-reserve": ["Closed Circuit", "Open Circuit"],
  "collapse-the-constellation": ["Controlled Collapse", "Singular Collapse"],
  "litter-the-floor": ["Prolific Litter", "Feral Litter"],
  nip: ["Courtly Nip", "Hungry Nip"],
  "open-the-rank": ["Many Teeth in the Rank", "The King's Breach"],
  "gnawing-court": ["Full Gnawing Court", "Civil Gnawing Court"],
  "nest-underfoot": ["Deep Nest", "Hungry Nest"],
  "swarm-the-wound": ["Patient Swarm", "Ravenous Swarm"],
  kneel: ["Kneel Quietly", "Kneel Before Teeth"],
  "royal-guard": ["Guard the Court", "Guard the Hunger"],
  "the-king-points": ["The King Insists", "The King Accuses"],
  tribute: ["Living Tribute", "Tribute in Teeth"],
  "decree-be-still": ["Decree: Be Silent", "Decree: Be Broken"],
  condemnation: ["Public Condemnation", "Secret Condemnation"],
  "bite-the-hand": ["Many Bites", "Closed Mouth"],
  "eat-through-it": ["Hide in the Ribs", "Teeth Through Pain"],
  "royal-appetite": ["Carrion Appetite", "Royal Appetite Unbound"],
  "feast-on-the-wounded": ["Slow Feast", "Tear the Wound"],
  "crown-of-hunger": ["Lean Crown", "Ravenous Crown"],
  "devour-the-spell": ["Eat Magic", "Eat Violence"],
};

describe("six-school card catalogue", () => {
  it("matches the canonical phase-one IDs and exact card headers", () => {
    expect(SIX_SCHOOL_CATALOGUE).toHaveLength(36);
    expect(PHASE_ONE_CARD_IDS).toHaveLength(36);
    expect(SIX_SCHOOL_CATALOGUE.map((card) => card.id)).toEqual(PHASE_ONE_CARD_IDS);
    expect(Object.keys(EXPECTED_HEADERS).sort()).toEqual([...PHASE_ONE_CARD_IDS].sort());
    for (const card of SIX_SCHOOL_CATALOGUE) {
      expect(card).toMatchObject(EXPECTED_HEADERS[card.id]);
      expect(card.branches.map((candidate) => candidate.name)).toEqual(EXPECTED_BRANCH_NAMES[card.id]);
    }
    expect(validateSixSchoolCatalogue()).toEqual([]);
  });

  it("keeps the fixed 12-slot school slices and hero ownership", () => {
    for (const school of SIX_SCHOOL_IDS) {
      const cards = cardsForSchool(school);
      expect(cards).toHaveLength(6);
      expect(cards.every((card) => card.hero === SCHOOL_HERO[school])).toBe(true);
      const deck = schoolSliceDeck(school);
      expect(deck).toHaveLength(12);
      expect(new Set(deck)).toEqual(new Set(cards.map((card) => card.id)));
      for (const id of new Set(deck)) expect(deck.filter((candidate) => candidate === id)).toHaveLength(2);
    }
    expect(cardsForHero("old-man")).toHaveLength(18);
    expect(cardsForHero("rat-king")).toHaveLength(18);
    expect(SIX_SCHOOL_CATALOGUE.some((card) => (card.cost as number) === 3)).toBe(false);
  });

  it("keeps every branch functional, unique, and recursively visible to lint", () => {
    for (const card of SIX_SCHOOL_CATALOGUE) {
      expect(card.branches).toHaveLength(2);
      expect(new Set(card.branches.map((candidate) => candidate.id)).size).toBe(2);
      expect(new Set(card.branches.map((candidate) => candidate.name)).size).toBe(2);
      expect(card.branches.every((candidate) => candidate.effects.length > 0)).toBe(true);
      expect(card.bridges.length).toBeGreaterThan(0);
      expect(card.bridges.every((school) => school !== card.school && SIX_SCHOOL_IDS.includes(school))).toBe(true);
      expect(flattenSixSchoolCardEffects(card).length).toBeGreaterThan(card.effects.length);
    }
  });

  it("represents Cut the Chant without a card-ID resolver branch", () => {
    const card = sixSchoolCard("cut-the-chant");
    expect(card.effects).toEqual([
      { kind: "damage", amount: 3 },
      { kind: "consume-hush", remove: "any", optional: true, conversion: { kind: "break", amountPerRemoved: 3, fallbackDamage: 2 } },
    ]);
    const measured = card.branches[0].effects.find((effect) => effect.kind === "consume-hush");
    expect(measured).toEqual({ kind: "consume-hush", remove: "one", optional: true, conversion: { kind: "break", amountPerRemoved: 6, fallbackDamage: 4 } });
    const ragged = card.branches[1].effects.find((effect) => effect.kind === "consume-hush");
    expect(ragged).toEqual({ kind: "consume-hush", remove: "any", optional: true, conversion: { kind: "damage", amountPerRemoved: 1, hitsPerRemoved: 2 } });
  });

  it("represents The King Points with Crown, readiness, command, and fallback semantics", () => {
    const card = sixSchoolCard("the-king-points");
    const rider = card.effects.find((effect) => effect.kind === "conditional");
    expect(rider).toEqual({
      kind: "conditional",
      when: { kind: "target-crowned" },
      then: [{
        kind: "command-rats",
        selection: "one",
        max: 1,
        source: "ready",
        biteDamage: 2,
        readyBeforeCommand: 1,
        noBiteFallback: [{ kind: "damage", amount: 2 }],
      }],
    });
    expect(card.branches[0].name).toBe("The King Insists");
    expect(effectsOfKind("the-king-points", "command-rats").length).toBe(3);
    const guard = sixSchoolCard("royal-guard");
    expect(guard.effects).toContainEqual({
      kind: "conditional",
      when: { kind: "crowned-enemy-intent-targets", hero: "rat-king" },
      then: [{ kind: "barrier", amount: 3 }],
    });
    expect(sixSchoolCard("the-hour-comes-round").branches[0].cost).toBe(1);
    expect(sixSchoolCard("the-hour-comes-round").branches[1].cost).toBeUndefined();
  });

  it("keeps the high-risk and delayed rules explicit in data", () => {
    expect(effectsOfKind("borrowed-moment", "recall-omen")[0]).toMatchObject({ optional: true, always: [{ kind: "resonance", operation: "gain", amount: 1 }] });
    expect(effectsOfKind("bite-the-hand", "blood-price")[0]).toMatchObject({ amount: 2, optional: true, payment: "recoverable-hp" });
    expect(effectsOfKind("collapse-the-constellation", "overchannel")[0]).toMatchObject({ optional: true, spend: "all", perResonance: [{ kind: "damage", amount: 2, target: "all" }] });
    expect(effectsOfKind("astral-reserve", "resonance-overflow")[0]).toEqual({ kind: "resonance-overflow", convertsTo: "barrier" });
    expect(effectsOfKind("gnawing-court", "command-rats")[0]).toMatchObject({
      missingFallback: { effects: [{ kind: "damage", amount: 2 }], perMissing: true },
    });
    expect(effectsOfKind("condemnation", "tribute")).toHaveLength(0);
    expect(effectsOfKind("tribute", "tribute")[0]).toMatchObject({ requiresCrowned: true, selection: "up-to", maxBarrier: 6, payout: "barrier" });
    expect(effectsOfKind("swarm-the-wound", "consume-opened")[0]).toMatchObject({ optional: true });
    expect(effectsOfKind("nest-underfoot", "conditional").some((effect) => effect.kind === "conditional" && effect.optional)).toBe(true);
  });

  it("guards runtime lookups against unknown save/reward IDs", () => {
    expect(isSixSchoolCardId("cut-the-chant")).toBe(true);
    expect(isSixSchoolCardId("not-a-card")).toBe(false);
    expect(() => sixSchoolCard("not-a-card" as never)).toThrow("Unknown six-school card");
  });
});
