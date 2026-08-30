import { describe, expect, it } from "vitest";
import { endHeroTurn, playCard, playerView } from "../engine";
import { productionFightDefinitions } from "./production";
import { createFightFromDefinition } from "./factory";
import { fixedPolicy } from "./policies";
import { runFight } from "./runner";

function baseDefinition() {
  return {
    ...productionFightDefinitions()[1]!,
    id: "row-ablation-test",
    name: "Row ablation test",
    enemies: [
      {
        id: "target",
        name: "Target",
        maxHp: 30,
        visualRow: "front" as const,
        cycle: [{ kind: "row" as const, row: "front" as const, damage: 9 }],
        slot: "fast" as const,
        order: 0,
      },
    ],
    decks: {
      "rat-king": ["tide", "lunge", "king-of-the-heap", "litter", "send-the-rat"],
      "old-man": ["the-threshold", "distant-hand", "parting-word", "last-bastion", "the-staff-speaks"],
    },
  };
}

describe("row-ablation simulator mode", () => {
  it("aliases row cards, disables Move, and removes Front damage riders", () => {
    const s = createFightFromDefinition({
      ...baseDefinition(),
      rowMode: "none",
      setup: { hands: { "rat-king": ["tide"] } },
    });
    const view = playerView(s);
    expect(view.rowMode).toBe("none");
    expect(view.moveAvailable).toBe(false);
    expect(view.heroes.map((hero) => hero.row)).toEqual(["front", "front"]);
    expect(view.hand[0]?.defId).toBe("no-row:tide");

    const card = s.heroes["rat-king"].hand[0]!;
    const result = playCard(s, card.uid, { targetId: "target" });
    expect(result.ok).toBe(true);
    expect(s.enemies[0]!.hp).toBe(26);
  });

  it("maps row intents to the configured deterministic target", () => {
    const s = createFightFromDefinition({
      ...baseDefinition(),
      rowMode: "none",
      setup: {
        hp: { "rat-king": 10, "old-man": 30 },
        hands: { "rat-king": ["tide"] },
      },
    });
    expect(playerView(s).intents[0]?.label).toContain("one hero");
    endHeroTurn(s);
    expect(s.heroes["rat-king"].hp).toBe(1);
    expect(s.heroes["old-man"].hp).toBe(30);
    expect(s.telemetry.intents[0]?.missedEmpty).toBe(0);
  });

  it("supports the deliberately harsher both-heroes row-intent mapping", () => {
    const s = createFightFromDefinition({
      ...baseDefinition(),
      rowMode: "none",
      noRowIntentTargeting: "both-heroes",
      setup: { hands: { "rat-king": ["tide"] } },
    });
    endHeroTurn(s);
    expect(s.heroes["rat-king"].hp).toBe(31);
    expect(s.heroes["old-man"].hp).toBe(31);
  });

  it("ignores the row field for named intents in no-row mode", () => {
    const s = createFightFromDefinition({
      ...baseDefinition(),
      rowMode: "none",
      enemies: [
        {
          id: "named",
          name: "Named",
          maxHp: 20,
          visualRow: "back",
          cycle: [{ kind: "named-hero", heroId: "rat-king", row: "back", damage: 7 }],
          slot: "fast",
          order: 0,
        },
      ],
      setup: { hands: { "rat-king": ["tide"] } },
    });
    endHeroTurn(s);
    expect(s.heroes["rat-king"].hp).toBe(33);
  });

  it("keeps Rat creation and biting meaningful without a Rat position", () => {
    const absent = createFightFromDefinition({
      ...baseDefinition(),
      rowMode: "none",
      setup: { hands: { "rat-king": ["send-the-rat"] } },
    });
    const absentCard = absent.heroes["rat-king"].hand[0]!;
    playCard(absent, absentCard.uid, { targetId: "target" });
    expect(absent.enemies[0]!.hp).toBe(26);

    const present = createFightFromDefinition({
      ...baseDefinition(),
      rowMode: "none",
      setup: {
        rat: { row: "back" },
        hands: { "rat-king": ["send-the-rat"] },
      },
    });
    const presentCard = present.heroes["rat-king"].hand[0]!;
    playCard(present, presentCard.uid, { targetId: "target" });
    expect(present.enemies[0]!.hp).toBe(25);
  });

  it("measures row-sensitive alternatives only in full row mode", () => {
    const full = createFightFromDefinition(baseDefinition());
    const fullRun = runFight(full, {
      policy: fixedPolicy("damage"),
      maxRounds: 4,
      measureRowValue: true,
    });
    expect(fullRun.rowCounterfactual.decisionTurns).toBeGreaterThan(0);
    expect(fullRun.rowCounterfactual.rowSensitiveActions).toBeGreaterThan(0);

    const none = createFightFromDefinition({ ...baseDefinition(), rowMode: "none" });
    const noneRun = runFight(none, {
      policy: fixedPolicy("damage"),
      maxRounds: 4,
      measureRowValue: true,
    });
    expect(noneRun.rowCounterfactual.decisionTurns).toBe(0);
    expect(noneRun.rowCounterfactual.rowSensitiveActions).toBe(0);
    expect(noneRun.rowCounterfactual.maxAbsTacticalDelta).toBe(0);
  });
});
