import { describe, expect, it } from "vitest";
import { CARD_DEFS } from "../cards";
import { playCard, playerView } from "../engine";
import type { ExtraCardDef } from "../types";
import { createFightFromDefinition } from "./factory";
import { legalActions } from "./legal-actions";

describe("declarative extra cards", () => {
  it("resolves a ruleset-only card without adding it to CARD_DEFS", () => {
    expect(CARD_DEFS).not.toHaveProperty("test-open");
    const s = createFightFromDefinition({
      id: "extra-open",
      name: "Extra open",
      seed: 1,
      extraCards: {
        "test-open": {
          id: "test-open",
          name: "Test Open",
          cost: 1,
          hero: "rat-king",
          target: "single-enemy",
          consume: "none",
          opens: true,
          text: "Deal 4. Open the target.",
          effects: [{ kind: "damage", amount: 4 }, { kind: "open" }],
        },
      },
      decks: {
        "rat-king": ["test-open", "nip", "brace", "tide", "lunge"],
        "old-man": ["the-staff-speaks", "pale-ward", "faultline", "full-stop", "sever-the-thread"],
      },
      enemies: [
        {
          id: "a",
          name: "A",
          maxHp: 20,
          visualRow: "front",
          cycle: [{ kind: "row", row: "front", damage: 5 }],
          slot: "slow",
          order: 0,
        },
      ],
      setup: { hands: { "rat-king": ["test-open"] } },
    });
    const card = s.heroes["rat-king"].hand[0]!;
    expect(card.defId as string).toBe("test-open");
    const result = playCard(s, card.uid, { targetId: "a" });
    expect(result.ok, result.reason).toBe(true);
    expect(s.enemies[0]!.hp).toBe(16);
    expect(s.opened?.enemyId).toBe("a");
    expect(playerView(s).hand.find((c) => (c.defId as string) === "test-open")).toBeUndefined();
    expect(CARD_DEFS).not.toHaveProperty("test-open");
  });

  it("enumerates extra cards as legal headless actions", () => {
    const s = createFightFromDefinition({
      id: "extra-legal",
      name: "Extra legal",
      seed: 1,
      extraCards: {
        "test-open": {
          id: "test-open",
          name: "Test Open",
          cost: 1,
          hero: "rat-king",
          target: "single-enemy",
          consume: "none",
          opens: true,
          text: "Deal 4. Open the target.",
          effects: [{ kind: "damage", amount: 4 }, { kind: "open" }],
        },
      },
      decks: {
        "rat-king": ["test-open", "nip", "brace", "tide", "lunge"],
        "old-man": ["the-staff-speaks", "pale-ward", "faultline", "full-stop", "sever-the-thread"],
      },
      enemies: [
        {
          id: "a",
          name: "A",
          maxHp: 20,
          visualRow: "front",
          cycle: [{ kind: "row", row: "front", damage: 5 }],
          slot: "slow",
          order: 0,
        },
      ],
      setup: { hands: { "rat-king": ["test-open"] } },
    });
    const card = s.heroes["rat-king"].hand[0]!;
    expect(legalActions(s)).toContainEqual({ kind: "card", cardUid: card.uid, targetId: "a" });
  });

  it("refuses extraCards that override a production id", () => {
    expect(() =>
      createFightFromDefinition({
        id: "override",
        name: "Override",
        seed: 1,
        extraCards: {
          nip: {
            id: "nip",
            name: "Fake Nip",
            cost: 1,
            hero: "rat-king",
            target: "single-enemy",
            consume: "none",
            opens: false,
            text: "Deal 99.",
            effects: [{ kind: "damage", amount: 99 }],
          },
        },
        decks: {
          "rat-king": ["nip", "brace", "tide", "lunge", "litter"],
          "old-man": ["the-staff-speaks", "pale-ward", "faultline", "full-stop", "sever-the-thread"],
        },
        enemies: [
          {
            id: "a",
            name: "A",
            maxHp: 20,
            visualRow: "front",
            cycle: [{ kind: "row", row: "front", damage: 5 }],
            slot: "slow",
            order: 0,
          },
        ],
      }),
    ).toThrow(/cannot override production card/);
    expect(CARD_DEFS.nip.text).toBe("Deal 5.");
  });

  it("applies a Consume rider only when the primary target is Opened", () => {
    const extra: ExtraCardDef = {
      id: "test-burst",
      name: "Test Burst",
      cost: 1,
      hero: "rat-king",
      target: "single-enemy",
      consume: "same-target",
      opens: false,
      text: "Deal 5. Consume Opened: deal 4 more.",
      effects: [
        { kind: "damage", amount: 5 },
        {
          kind: "if",
          when: { kind: "opened-primary" },
          then: [
            { kind: "consume" },
            { kind: "damage", amount: 4 },
          ],
        },
      ],
    };
    const s = createFightFromDefinition({
      id: "extra-burst",
      name: "Extra burst",
      seed: 1,
      extraCards: { "test-burst": extra },
      decks: {
        "rat-king": ["test-burst", "nip", "brace", "tide", "lunge"],
        "old-man": ["the-staff-speaks", "pale-ward", "faultline", "full-stop", "sever-the-thread"],
      },
      enemies: [
        {
          id: "a",
          name: "A",
          maxHp: 30,
          visualRow: "front",
          cycle: [{ kind: "row", row: "front", damage: 5 }],
          slot: "slow",
          order: 0,
        },
      ],
      setup: {
        opened: { enemyId: "a", createdBy: "rat-king" },
        hands: { "rat-king": ["test-burst"] },
      },
    });
    const card = s.heroes["rat-king"].hand[0]!;
    playCard(s, card.uid, { targetId: "a" });
    expect(s.enemies[0]!.hp).toBe(21);
    expect(s.opened).toBeNull();
  });
});
