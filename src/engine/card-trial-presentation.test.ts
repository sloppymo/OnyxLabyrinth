import { describe, expect, it } from "vitest";
import { createGameState } from "../game/state";
import { findFloor } from "../game/floor-registry";
import { createAdversarialTriangle, createFight } from "../game/card-trial/engine";
import { toCombatEvents, toCombatState } from "./card-trial-presentation";

describe("Card Trial presentation adapter", () => {
  it("builds a 2-hero presentation combat without mutating campaign party", () => {
    const state = createGameState(findFloor(1)!);
    const before = state.party.map((c) => c.id);
    const trial = createFight(2, { seed: 1 });
    const combat = toCombatState(trial);
    expect(combat.party).toHaveLength(2);
    expect(combat.party.map((c) => c.id).sort()).toEqual(["old-man", "rat-king"]);
    expect(combat.partyFormation).toEqual({
      kind: "card-trial-rows",
      rowsByActorId: {
        "rat-king": { row: "front", rowEnteredAt: 1 },
        "old-man": { row: "back", rowEnteredAt: 2 },
      },
    });
    expect(state.party).toHaveLength(2);
    expect(state.party.map((c) => c.id).sort()).toEqual(["old-man", "rat-king"]);
    expect(state.party.map((c) => c.id)).toEqual(before);
    expect(state.combat).toBeUndefined();
  });

  it("maps triangle attacks onto existing CombatEvents without inventing campaign enemies", () => {
    const trial = createAdversarialTriangle();
    const combat = toCombatState(trial);
    expect(combat.enemies.front.some((e) => e.id === "cleaver" || e.instanceId === "cleaver")).toBe(true);
    const events = toCombatEvents(
      [
        { type: "banner", text: "Nip", actorId: "rat-king" },
        { type: "attack", actorId: "rat-king", targetId: "ash", damage: 5 },
        { type: "open", targetId: "ash" },
      ],
      trial
    );
    expect(events[0]).toMatchObject({ type: "cast", actorId: "rat-king", spellId: "Nip" });
    expect(events[1]).toMatchObject({ type: "attack", actorId: "rat-king", targetId: "ash", damage: 5 });
    expect(events[2]).toMatchObject({
      type: "spellEffect",
      spellId: "Opened",
      targetId: "ash",
      cardPresentation: "opened",
    });
  });

  it("routes Old Man card damage through the magical spell presentation", () => {
    const trial = createFight(4, { seed: 2 });
    const events = toCombatEvents(
      [
        { type: "banner", text: "The Staff Speaks", actorId: "old-man", cardId: "the-staff-speaks" },
        { type: "attack", actorId: "old-man", targetId: "brute", damage: 6 },
      ],
      trial
    );
    expect(events[0]).toMatchObject({
      type: "cast",
      actorId: "old-man",
      spellId: "the-staff-speaks",
      cardPresentation: "card-spell",
    });
    expect(events[1]).toEqual({
      type: "spellEffect",
      spellId: "the-staff-speaks",
      actorId: "old-man",
      targetId: "brute",
      damage: 6,
      cardPresentation: "card-spell",
    });
  });

  it("preserves Guard absorption for the presentation layer", () => {
    const trial = createAdversarialTriangle();
    const events = toCombatEvents(
      [{ type: "intent-hit", enemyId: "cleaver", targetId: "rat-king", damage: 2, absorbed: 9 }],
      trial
    );
    expect(events).toEqual([
      { type: "attack", actorId: "cleaver", targetId: "rat-king", damage: 2, absorbed: 9 },
    ]);
  });

  it("carries Card Trial-only verbs without changing the shared rules events", () => {
    const trial = createFight(1, { seed: 7 });
    const events = toCombatEvents(
      [
        { type: "guard", actorId: "rat-king", amount: 6 },
        { type: "spawn-rat", row: "front" },
        { type: "open", targetId: "cleaver" },
        { type: "consume", targetId: "cleaver" },
      ],
      trial,
      { openedBefore: "ash" }
    );
    expect(events[0]).toEqual({ type: "defend", actorId: "rat-king", amount: 6 });
    expect(events[1]).toMatchObject({ type: "cast", cardPresentation: "rat" });
    expect(events[2]).toMatchObject({ type: "spellEffect", cardPresentation: "opened" });
    expect(events[2]).toMatchObject({ cardPresentationSourceId: "ash" });
    expect(events[3]).toMatchObject({ type: "spellEffect", cardPresentation: "consume-opened" });
  });

  it("maps Hush and Omen state transitions to semantic spell effects", () => {
    const trial = createFight(4, { seed: 8 });
    const events = toCombatEvents(
      [
        { type: "hush-applied", targetId: "brute" },
        { type: "hush-triggered", targetId: "brute", rawDamage: 12, damage: 6 },
        { type: "omen-armed", targetId: "brute", damage: 7 },
        { type: "omen-triggered", targetId: "brute", damage: 7 },
        { type: "omen-fizzled", targetId: "brute" },
      ],
      trial
    );
    expect(events).toEqual([
      expect.objectContaining({ type: "spellEffect", spellId: "Hush", cardPresentation: "hush", targetId: "brute" }),
      expect.objectContaining({ type: "spellEffect", spellId: "Hush", cardPresentation: "hush-trigger", targetId: "brute" }),
      expect.objectContaining({ type: "spellEffect", spellId: "Omen", cardPresentation: "omen", targetId: "brute" }),
      expect.objectContaining({ type: "spellEffect", spellId: "Omen", cardPresentation: "omen-trigger", damage: 7, targetId: "brute" }),
      expect.objectContaining({ type: "spellEffect", spellId: "Omen", cardPresentation: "omen-fizzle", targetId: "brute" }),
    ]);
  });

  it("maps Crown application, replacement, and tribute to semantic effects", () => {
    const trial = createFight(8, { seed: 9 });
    const events = toCombatEvents(
      [
        { type: "crowned", targetId: "twinblade" },
        { type: "crown-cleared", targetId: "twinblade", reason: "replaced" },
        { type: "crowned", targetId: "partner" },
        { type: "crown-tribute", targetId: "rat-king", amount: 2, sourceId: "partner" },
      ],
      trial
    );
    expect(events).toHaveLength(4);
    expect(events[0]).toMatchObject({ type: "spellEffect", spellId: "Crown", targetId: "twinblade", cardPresentation: "crowned" });
    expect(events[1]).toMatchObject({ type: "spellEffect", spellId: "Crown", targetId: "twinblade", cardPresentation: "crown-cleared" });
    expect(events[2]).toMatchObject({ type: "spellEffect", spellId: "Crown", targetId: "partner", cardPresentation: "crowned" });
    expect(events[3]).toMatchObject({ type: "spellEffect", spellId: "Crown Tribute", targetId: "rat-king", damage: 2, cardPresentation: "crown-tribute" });
  });

  it("maps paid and card-driven hero moves to identical row presentation", () => {
    const trial = createFight(1, { seed: 7 });
    trial.heroes["rat-king"].row = "back";
    trial.heroes["rat-king"].rowEnteredAt = 3;
    const paid = toCombatEvents(
      [{ type: "hero-move", actorId: "rat-king", row: "back", via: "paid" }],
      trial
    );
    const card = toCombatEvents(
      [{ type: "hero-move", actorId: "rat-king", row: "back", via: "card" }],
      trial
    );
    expect(paid).toEqual(card);
    expect(paid).toEqual([
      {
        type: "partyRowMove",
        actorId: "rat-king",
        row: "back",
        rowEnteredAt: 3,
      },
    ]);
  });
});
