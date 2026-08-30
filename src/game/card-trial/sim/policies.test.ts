import { describe, expect, it } from "vitest";
import { createFightFromDefinition } from "./factory";
import {
  beamSearchPolicy,
  frontAwarePolicy,
  guardAwarePolicy,
  openedAwarePolicy,
  threatFirstPolicy,
} from "./policies";
import { legalActions } from "./legal-actions";
import { playerView } from "../engine";
import { runFight } from "./runner";

describe("headless policies", () => {
  it("threatFirst prefers to hit the enemy aiming at the acting hero's row", () => {
    const s = createFightFromDefinition({
      id: "threat",
      name: "Threat",
      seed: 1,
      decks: {
        "rat-king": ["nip", "nip", "nip", "nip", "nip"],
        "old-man": ["the-staff-speaks", "the-staff-speaks", "the-staff-speaks", "pale-ward", "pale-ward"],
      },
      enemies: [
        {
          id: "front-hit",
          name: "Front Hit",
          maxHp: 20,
          visualRow: "front",
          cycle: [{ kind: "row", row: "front", damage: 11 }],
          slot: "fast",
          order: 0,
        },
        {
          id: "back-hit",
          name: "Back Hit",
          maxHp: 8,
          visualRow: "back",
          cycle: [{ kind: "row", row: "back", damage: 8 }],
          slot: "fast",
          order: 1,
        },
      ],
      setup: { hands: { "rat-king": ["nip", "nip", "nip"] }, rows: { "rat-king": "front" } },
    });
    const action = threatFirstPolicy()({
      view: playerView(s),
      legalActions: legalActions(s),
      rng: () => 0,
    });
    expect(action.kind).toBe("card");
    if (action.kind === "card") expect(action.targetId).toBe("front-hit");
  });

  it("openedAware consumes Opened when a Consume card is legal", () => {
    const s = createFightFromDefinition({
      id: "opened-pol",
      name: "Opened pol",
      seed: 1,
      decks: {
        "rat-king": ["swarm-the-wound", "nip", "brace", "tide", "lunge"],
        "old-man": ["the-staff-speaks", "pale-ward", "faultline", "full-stop", "sever-the-thread"],
      },
      enemies: [
        {
          id: "a",
          name: "A",
          maxHp: 22,
          visualRow: "front",
          cycle: [{ kind: "row", row: "front", damage: 8 }],
          slot: "slow",
          order: 0,
        },
      ],
      setup: {
        opened: { enemyId: "a", createdBy: "rat-king" },
        hands: { "rat-king": ["swarm-the-wound", "nip"] },
      },
    });
    const action = openedAwarePolicy()({
      view: playerView(s),
      legalActions: legalActions(s),
      rng: () => 0,
    });
    expect(action.kind).toBe("card");
    if (action.kind === "card") {
      const card = s.heroes["rat-king"].hand.find((c) => c.uid === action.cardUid);
      expect(card?.defId).toBe("swarm-the-wound");
      expect(action.targetId).toBe("a");
    }
  });

  it("frontAware keeps Tide in Front instead of moving away first", () => {
    const s = createFightFromDefinition({
      id: "front-pol",
      name: "Front pol",
      seed: 1,
      decks: {
        "rat-king": ["tide", "nip", "brace", "lunge", "open-the-rank"],
        "old-man": ["the-staff-speaks", "pale-ward", "faultline", "the-threshold", "full-stop"],
      },
      enemies: [
        {
          id: "a",
          name: "A",
          maxHp: 30,
          visualRow: "front",
          cycle: [{ kind: "row", row: "front", damage: 11 }],
          slot: "fast",
          order: 0,
        },
      ],
      setup: {
        rows: { "rat-king": "front" },
        hands: { "rat-king": ["tide", "nip"] },
      },
    });
    const action = frontAwarePolicy()({
      view: playerView(s),
      legalActions: legalActions(s),
      rng: () => 0,
    });
    expect(action).not.toEqual({ kind: "move" });
    expect(action.kind).toBe("card");
  });

  it("guardAware prefers Brace when the next hit exceeds current Guard", () => {
    const s = createFightFromDefinition({
      id: "guard-pol",
      name: "Guard pol",
      seed: 1,
      decks: {
        "rat-king": ["brace", "nip", "nip", "tide", "lunge"],
        "old-man": ["the-staff-speaks", "pale-ward", "faultline", "full-stop", "sever-the-thread"],
      },
      enemies: [
        {
          id: "a",
          name: "A",
          maxHp: 40,
          visualRow: "front",
          cycle: [{ kind: "row", row: "front", damage: 11 }],
          slot: "fast",
          order: 0,
        },
      ],
      setup: { hands: { "rat-king": ["brace", "nip"] } },
    });
    const action = guardAwarePolicy()({
      view: playerView(s),
      legalActions: legalActions(s),
      rng: () => 0,
    });
    const card = s.heroes["rat-king"].hand.find(
      (c) => action.kind === "card" && c.uid === action.cardUid,
    );
    expect(card?.defId).toBe("brace");
  });

  it("beamSearch finds a one-turn kill on a 5 HP dummy", () => {
    const s = createFightFromDefinition({
      id: "beam",
      name: "Beam",
      seed: 1,
      decks: {
        "rat-king": ["nip", "brace", "tide", "lunge", "open-the-rank"],
        "old-man": ["the-staff-speaks", "pale-ward", "faultline", "the-threshold", "full-stop"],
      },
      enemies: [
        {
          id: "a",
          name: "A",
          maxHp: 5,
          visualRow: "front",
          cycle: [{ kind: "row", row: "front", damage: 14 }],
          slot: "fast",
          order: 0,
        },
      ],
      setup: { hands: { "rat-king": ["nip", "brace"] } },
    });
    const record = runFight(s, { policy: beamSearchPolicy({ width: 6, depth: 3 }), maxRounds: 4 });
    expect(record.outcome).toBe("victory");
    expect(record.rounds).toBe(1);
  });
});
