import { describe, expect, it } from "vitest";
import { CARD_DEFS, OLD_MAN_LIST, RAT_KING_LIST } from "../cards";
import { ENCOUNTERS } from "../encounters";
import { createFight, playerView } from "../engine";
import { createFightFromDefinition } from "./factory";

describe("createFightFromDefinition", () => {
  it("builds a fight from custom decks and a custom enemy without changing production lists", () => {
    const productionRk = [...RAT_KING_LIST];
    const productionOm = [...OLD_MAN_LIST];
    const productionEncounters = ENCOUNTERS.length;
    const nipText = CARD_DEFS.nip.text;

    const s = createFightFromDefinition({
      id: "staff-test",
      name: "Staff Test",
      seed: 42,
      decks: {
        "rat-king": ["nip", "nip", "brace", "tide"],
        "old-man": ["the-staff-speaks", "the-staff-speaks", "the-staff-speaks", "pale-ward"],
      },
      enemies: [
        {
          id: "test-brute",
          name: "Test Brute",
          maxHp: 40,
          visualRow: "front",
          spriteId: "animated-armor",
          cycle: [
            { kind: "row", row: "front", damage: 11 },
            { kind: "row", row: "back", damage: 9 },
          ],
          slot: "slow",
          order: 0,
        },
      ],
    });

    expect(s.fightName).toBe("Staff Test");
    expect(s.heroes["rat-king"].row).toBe("front");
    expect(s.heroes["old-man"].row).toBe("back");
    const rkPile = [
      ...s.heroes["rat-king"].hand,
      ...s.heroes["rat-king"].draw,
      ...s.heroes["rat-king"].discard,
    ].map((c) => c.defId);
    const omPile = [
      ...s.heroes["old-man"].hand,
      ...s.heroes["old-man"].draw,
      ...s.heroes["old-man"].discard,
    ].map((c) => c.defId);
    expect(rkPile.sort()).toEqual(["brace", "nip", "nip", "tide"].sort());
    expect(omPile.sort()).toEqual(["the-staff-speaks", "the-staff-speaks", "the-staff-speaks", "pale-ward"].sort());
    expect(s.enemies).toHaveLength(1);
    expect(s.enemies[0]!.id).toBe("test-brute");
    expect(s.enemies[0]!.hp).toBe(40);
    expect(s.queue.map((q) => q.id)).toEqual(["rat-king", "old-man", "test-brute"]);
    expect(playerView(s).actingHero).toBe("rat-king");
    expect(playerView(s).hand).toHaveLength(4);

    expect(RAT_KING_LIST).toEqual(productionRk);
    expect(OLD_MAN_LIST).toEqual(productionOm);
    expect(ENCOUNTERS).toHaveLength(productionEncounters);
    expect(CARD_DEFS.nip.text).toBe(nipText);
    expect(createFight(2, { seed: 1 }).fightName).toBe("Cleaver and Ash");
  });

  it("applies fixed rows, HP, Opened, Rat, and enemy HP after the opening draw", () => {
    const s = createFightFromDefinition({
      id: "setup-test",
      name: "Setup Test",
      seed: 1,
      decks: {
        "rat-king": ["litter", "send-the-rat", "nip", "nip", "brace"],
        "old-man": ["the-staff-speaks", "the-staff-speaks", "pale-ward", "faultline", "full-stop"],
      },
      enemies: [
        {
          id: "a",
          name: "A",
          maxHp: 22,
          visualRow: "front",
          spriteId: "failed-experiment",
          cycle: [{ kind: "row", row: "front", damage: 8 }],
          slot: "fast",
          order: 0,
        },
        {
          id: "b",
          name: "B",
          maxHp: 22,
          visualRow: "back",
          spriteId: "lab-assistant",
          cycle: [{ kind: "row", row: "back", damage: 8 }],
          slot: "fast",
          order: 1,
        },
      ],
      setup: {
        rows: { "rat-king": "back", "old-man": "front" },
        hp: { "rat-king": 17, "old-man": 31 },
        rat: { row: "front" },
        opened: { enemyId: "b", createdBy: "rat-king" },
        enemyHp: { a: 10, b: 22 },
      },
    });

    expect(s.heroes["rat-king"].row).toBe("back");
    expect(s.heroes["old-man"].row).toBe("front");
    expect(s.heroes["rat-king"].hp).toBe(17);
    expect(s.heroes["old-man"].hp).toBe(31);
    expect(s.rat).toEqual({ row: "front" });
    expect(s.opened?.enemyId).toBe("b");
    expect(s.opened?.createdBy).toBe("rat-king");
    expect(s.enemies.find((e) => e.id === "a")!.hp).toBe(10);
    expect(playerView(s).openedEnemyId).toBe("b");
  });

  it("is deterministic for the same seed and definition", () => {
    const def = {
      id: "det",
      name: "Det",
      seed: 99,
      decks: {
        "rat-king": ["nip", "tide", "brace", "lunge", "king-of-the-heap"] as const,
        "old-man": ["the-staff-speaks", "pale-ward", "faultline", "the-threshold", "last-bastion"] as const,
      },
      enemies: [
        {
          id: "x",
          name: "X",
          maxHp: 30,
          visualRow: "front" as const,
          spriteId: "stone-guardian",
          cycle: [{ kind: "row" as const, row: "front" as const, damage: 9 }],
          slot: "fast" as const,
          order: 0,
        },
      ],
    };
    const a = createFightFromDefinition({ ...def, decks: { "rat-king": [...def.decks["rat-king"]], "old-man": [...def.decks["old-man"]] } });
    const b = createFightFromDefinition({ ...def, decks: { "rat-king": [...def.decks["rat-king"]], "old-man": [...def.decks["old-man"]] } });
    expect(a.heroes["rat-king"].hand.map((c) => c.defId)).toEqual(
      b.heroes["rat-king"].hand.map((c) => c.defId),
    );
  });
});
