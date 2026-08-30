import { describe, expect, it } from "vitest";
import { playerView } from "../engine";
import { createFightFromDefinition } from "./factory";
import { applyAction, runFight } from "./runner";
import { fixedPolicy, randomLegalPolicy } from "./policies";

function fodderFight(seed: number) {
  return createFightFromDefinition({
    id: "fodder",
    name: "Fodder",
    seed,
    decks: {
      "rat-king": ["nip", "nip", "nip", "nip", "nip"],
      "old-man": ["the-staff-speaks", "the-staff-speaks", "the-staff-speaks", "the-staff-speaks", "the-staff-speaks"],
    },
    enemies: [
      {
        id: "dummy",
        name: "Dummy",
        maxHp: 12,
        visualRow: "front",
        cycle: [{ kind: "row", row: "front", damage: 1 }],
        slot: "slow",
        order: 0,
      },
    ],
  });
}

describe("applyAction", () => {
  it("plays a legal card, Move, and Pass through the production engine", () => {
    const s = fodderFight(1);
    const nip = s.heroes["rat-king"].hand.find((c) => c.defId === "nip")!;
    const hp = s.enemies[0]!.hp;
    const played = applyAction(s, { kind: "card", cardUid: nip.uid, targetId: "dummy" });
    expect(played.ok).toBe(true);
    expect(s.enemies[0]!.hp).toBe(hp - 5);

    const row = s.heroes["rat-king"].row;
    const moved = applyAction(s, { kind: "move" });
    expect(moved.ok).toBe(true);
    expect(s.heroes["rat-king"].row).not.toBe(row);

    const passed = applyAction(s, { kind: "pass" });
    expect(passed.ok).toBe(true);
    expect(playerView(s).actingHero).toBe("old-man");
  });

  it("rejects an illegal Move without mutating energy", () => {
    const s = fodderFight(2);
    s.heroes["rat-king"].paidMoveUsed = true;
    const energy = s.heroes["rat-king"].energy;
    const result = applyAction(s, { kind: "move" });
    expect(result.ok).toBe(false);
    expect(s.heroes["rat-king"].energy).toBe(energy);
  });
});

describe("runFight", () => {
  it("wins a 12 HP dummy when both heroes always spend on damage", () => {
    const record = runFight(fodderFight(3), {
      policy: fixedPolicy("damage"),
      maxRounds: 8,
    });
    expect(record.outcome).toBe("victory");
    expect(record.rounds).toBeGreaterThan(0);
    expect(record.heroTurns).toBeGreaterThan(0);
    expect(record.damageDealt).toBeGreaterThan(0);
  });

  it("times out rather than looping when the policy only passes", () => {
    const s = createFightFromDefinition({
      id: "stalemate",
      name: "Stalemate",
      seed: 1,
      decks: {
        "rat-king": ["brace", "brace", "brace", "brace", "brace"],
        "old-man": ["pale-ward", "pale-ward", "pale-ward", "pale-ward", "pale-ward"],
      },
      enemies: [
        {
          id: "idle",
          name: "Idle",
          maxHp: 40,
          visualRow: "front",
          cycle: [{ kind: "row", row: "back", damage: 0 }],
          slot: "slow",
          order: 0,
        },
      ],
    });
    const record = runFight(s, { policy: fixedPolicy("pass"), maxRounds: 3, maxActions: 20 });
    expect(record.outcome).toBe("timeout");
  });

  it("is paired-seed deterministic for randomLegal", () => {
    const a = runFight(fodderFight(44), { policy: randomLegalPolicy(44), maxRounds: 12 });
    const b = runFight(fodderFight(44), { policy: randomLegalPolicy(44), maxRounds: 12 });
    expect(a.outcome).toBe(b.outcome);
    expect(a.actions).toEqual(b.actions);
    expect(a.rounds).toBe(b.rounds);
  });

  it("exposes only the player view to the policy", () => {
    const seen: string[] = [];
    runFight(fodderFight(5), {
      maxRounds: 2,
      policy: ({ view, legalActions }) => {
        expect(view.pileCountsOnly).toBe(true);
        expect("streams" in view).toBe(false);
        expect(legalActions.length).toBeGreaterThan(0);
        seen.push(view.actingHero ?? "none");
        return { kind: "pass" };
      },
    });
    expect(seen[0]).toBe("rat-king");
  });
});

describe("legalActions during a run", () => {
  it("never offers an action the engine rejects on the fodder fight", () => {
    const record = runFight(fodderFight(9), {
      policy: fixedPolicy("damage"),
      maxRounds: 6,
    });
    expect(record.illegalActions).toBe(0);
    expect(["victory", "wipe", "timeout"]).toContain(record.outcome);
  });
});
