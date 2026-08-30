import { describe, expect, it } from "vitest";
import { createFightFromDefinition } from "./factory";
import { collectMetrics } from "./metrics";
import { fixedPolicy } from "./policies";
import { runFight } from "./runner";

describe("collectMetrics", () => {
  it("records discarded-while-playable cards and Opened partner vs same-hero splits", () => {
    const s = createFightFromDefinition({
      id: "metrics-open",
      name: "Metrics open",
      seed: 1,
      decks: {
        "rat-king": ["open-the-rank", "nip", "brace", "tide", "lunge"],
        "old-man": ["full-stop", "the-staff-speaks", "pale-ward", "faultline", "sever-the-thread"],
      },
      enemies: [
        {
          id: "a",
          name: "A",
          maxHp: 40,
          visualRow: "front",
          cycle: [{ kind: "row", row: "front", damage: 5 }],
          slot: "slow",
          order: 0,
        },
      ],
      setup: {
        hands: { "rat-king": ["open-the-rank", "brace"] },
      },
    });
    const run = runFight(s, { policy: fixedPolicy("damage"), maxRounds: 6 });
    const metrics = collectMetrics(s, run);
    expect(metrics.cards["open-the-rank"]!.played).toBeGreaterThan(0);
    expect(metrics.opened.created).toBeGreaterThan(0);
    expect(metrics.discardedPlayable.length).toBeGreaterThan(0);
    expect(metrics.energyLeftAtTurnEnd.length).toBe(s.telemetry.turns.length);
  });
});
