import { describe, expect, it } from "vitest";
import { createGameState } from "../game/state";
import { findFloor } from "../game/floor-registry";
import { PARTY_SIZE } from "../game/party";
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
    expect(state.party).toHaveLength(PARTY_SIZE);
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
    expect(events[2]).toMatchObject({ type: "spellEffect", spellId: "Opened", targetId: "ash" });
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
