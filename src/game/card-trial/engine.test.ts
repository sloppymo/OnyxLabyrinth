import { describe, expect, it } from "vitest";
import { PARTY_SIZE } from "../party";
import { CARD_DEFS, OLD_MAN_LIST, RAT_KING_LIST } from "./cards";
import { ENCOUNTERS } from "./encounters";
import {
  actingHero,
  canPaidMove,
  cardConsumeRiderDamage,
  cardGuardGain,
  cardPrimaryDamage,
  legalSecondTargetIds,
  createAdversarialTriangle,
  createFight,
  endHeroTurn,
  handCard,
  paidMove,
  playCard,
  playerView,
  singleTargetInRow,
  startHeroCardTurn,
  summarizeTelemetry,
} from "./engine";
import { resetGameplayRng, setGameplayRng } from "../rng";
import type { CardId, CardTrialState } from "./types";

function takeFromPiles(s: CardTrialState, heroId: "rat-king" | "old-man", id: CardId) {
  const hero = s.heroes[heroId];
  for (const pile of [hero.hand, hero.draw, hero.discard]) {
    const i = pile.findIndex((c) => c.defId === id);
    if (i >= 0) {
      const [card] = pile.splice(i, 1);
      return card!;
    }
  }
  throw new Error(`missing ${id} for ${heroId}`);
}

function dealHand(s: CardTrialState, heroId: "rat-king" | "old-man", ids: CardId[]) {
  const hero = s.heroes[heroId];
  hero.discard.push(...hero.hand);
  hero.hand = ids.map((id) => takeFromPiles(s, heroId, id));
  hero.energy = 3;
  hero.paidMoveUsed = false;
}

function play(s: CardTrialState, id: CardId, targetId?: string, secondTargetId?: string) {
  const card = handCard(s, id);
  expect(card, `expected ${id} in hand`).toBeTruthy();
  const result = playCard(s, card!.uid, { targetId, secondTargetId });
  expect(result.ok, result.reason).toBe(true);
  return result;
}

function finishRatKing(s: CardTrialState) {
  const events = endHeroTurn(s);
  return events;
}

describe("Card Trial decks", () => {
  it("gives each hero exactly 12 cards with the locked duplicates and curves", () => {
    expect(RAT_KING_LIST).toHaveLength(12);
    expect(OLD_MAN_LIST).toHaveLength(12);
    expect(RAT_KING_LIST.filter((id) => id === "nip")).toHaveLength(2);
    expect(OLD_MAN_LIST.filter((id) => id === "staff")).toHaveLength(2);
    const rkCosts = RAT_KING_LIST.map((id) => CARD_DEFS[id].cost);
    const omCosts = OLD_MAN_LIST.map((id) => CARD_DEFS[id].cost);
    expect(rkCosts.filter((c) => c === 1)).toHaveLength(10);
    expect(rkCosts.filter((c) => c === 2)).toHaveLength(2);
    expect(omCosts.filter((c) => c === 1)).toHaveLength(9);
    expect(omCosts.filter((c) => c === 2)).toHaveLength(3);
    expect(rkCosts.every((c) => c === 1 || c === 2)).toBe(true);
    expect(omCosts.every((c) => c === 1 || c === 2)).toBe(true);
  });

  it("keeps hero decks independent after a Rat King turn", () => {
    const s = createFight(1, { seed: 4 });
    expect(s.heroes["old-man"].hand).toHaveLength(0);
    const rkUids = new Set(
      [...s.heroes["rat-king"].draw, ...s.heroes["rat-king"].discard, ...s.heroes["rat-king"].hand].map((c) => c.uid),
    );
    finishRatKing(s);
    const omAll = [
      ...s.heroes["old-man"].draw,
      ...s.heroes["old-man"].discard,
      ...s.heroes["old-man"].hand,
    ];
    expect(omAll).toHaveLength(12);
    expect(omAll.some((c) => rkUids.has(c.uid))).toBe(false);
    expect(actingHero(s)?.id).toBe("old-man");
    expect(s.heroes["old-man"].hand).toHaveLength(5);
  });
});

describe("rules-layer card constants", () => {
  it("keeps cardGuardGain in lockstep with resolved guard events", () => {
    const cases: Array<{ hero: "rat-king" | "old-man"; id: CardId; row: "front" | "back" }> = [
      { hero: "rat-king", id: "brace", row: "front" },
      { hero: "rat-king", id: "king-of-the-heap", row: "front" },
      { hero: "old-man", id: "ward", row: "back" },
      { hero: "old-man", id: "stand-and-die", row: "front" },
      { hero: "old-man", id: "from-afar", row: "back" },
      { hero: "old-man", id: "from-afar", row: "front" },
    ];
    for (const c of cases) {
      const s = createFight(2, { seed: 3 });
      if (c.hero === "old-man") finishRatKing(s);
      s.heroes[c.hero].row = c.row;
      dealHand(s, c.hero, [c.id]);
      const target = CARD_DEFS[c.id].target === "none" ? undefined : s.enemies[0]!.id;
      const result = play(s, c.id, target);
      const guardEvent = result.events.find((e) => e.type === "guard");
      const expected = cardGuardGain(c.id, c.row);
      if (expected === null) expect(guardEvent, `${c.id} in ${c.row}`).toBeUndefined();
      else expect(guardEvent, `${c.id} in ${c.row}`).toMatchObject({ amount: expected });
    }
  });

  it("keeps same-target consume riders in lockstep with cardConsumeRiderDamage", () => {
    const cases = [
      { hero: "rat-king", openId: "open-the-rank", consumeId: "swarm-the-wound" },
      { hero: "old-man", openId: "crack", consumeId: "full-stop" },
    ] as const;
    for (const c of cases) {
      const s = createFight(2, { seed: 7 });
      if (c.hero === "old-man") finishRatKing(s);
      dealHand(s, c.hero, [c.openId, c.consumeId]);
      play(s, c.openId, "cleaver");
      const result = play(s, c.consumeId, "cleaver");
      const dealt = result.events
        .filter((e) => e.type === "attack")
        .reduce((n, e) => n + (e.type === "attack" ? e.damage : 0), 0);
      expect(result.events.some((e) => e.type === "consume")).toBe(true);
      expect(dealt).toBe(
        cardPrimaryDamage(c.consumeId, s.heroes[c.hero].row)! +
          cardConsumeRiderDamage(c.consumeId)!
      );
    }
  });

  it("keeps splash and second-enemy consume riders in lockstep with cardConsumeRiderDamage", () => {
    const splash = createFight(2, { seed: 9 });
    dealHand(splash, "rat-king", ["open-the-rank", "burst-the-nest"]);
    play(splash, "open-the-rank", "cleaver");
    const ashBeforeSplash = splash.enemies.find((e) => e.id === "ash")!.hp;
    play(splash, "burst-the-nest", "cleaver");
    expect(ashBeforeSplash - splash.enemies.find((e) => e.id === "ash")!.hp).toBe(
      cardConsumeRiderDamage("burst-the-nest")
    );

    const second = createFight(2, { seed: 9 });
    finishRatKing(second);
    dealHand(second, "old-man", ["crack", "cut-the-line"]);
    play(second, "crack", "cleaver");
    const ashBeforeCut = second.enemies.find((e) => e.id === "ash")!.hp;
    play(second, "cut-the-line", "cleaver", "ash");
    expect(ashBeforeCut - second.enemies.find((e) => e.id === "ash")!.hp).toBe(
      cardConsumeRiderDamage("cut-the-line")
    );
  });

  it("shares legalSecondTargetIds between engine and preview", () => {
    const s = createFight(2, { seed: 9 });
    expect(legalSecondTargetIds(s.enemies, "cleaver")).toContain("ash");
    s.enemies.find((e) => e.id === "ash")!.hp = 0;
    expect(legalSecondTargetIds(s.enemies, "cleaver")).toEqual([]);
    expect(legalSecondTargetIds(s.enemies, "ash")).toContain("cleaver");
    expect(legalSecondTargetIds(s.enemies, undefined)).toEqual([]);
  });
});

describe("Card Trial presentation telemetry", () => {
  it("reports decision durations in seconds", () => {
    const s = createFight(1, { seed: 2 });
    s.telemetry.presentation.decisionMs = [125, 275];
    const summary = summarizeTelemetry(s.telemetry);
    expect(summary).toContain("Decision samples: 2 · average 0.2s · longest 0.3s");
    expect(summary).toContain("Target changes: 0 · target cancels: 0");
  });
});

describe("Card Trial turn", () => {
  it("exposes primary card damage from the rules layer", () => {
    expect(cardPrimaryDamage("tide", "front")).toBe(8);
    expect(cardPrimaryDamage("tide", "back")).toBe(5);
    expect(cardPrimaryDamage("send-the-rat", "front", false)).toBe(4);
    expect(cardPrimaryDamage("send-the-rat", "front", true)).toBe(5);
    expect(cardPrimaryDamage("brace", "front")).toBeNull();
  });

  it("draws 5, sets energy to 3, and discards the remainder on pass", () => {
    const s = createFight(1, { seed: 2 });
    const rk = s.heroes["rat-king"];
    expect(rk.hand).toHaveLength(5);
    expect(rk.energy).toBe(3);
    expect(rk.draw.length + rk.discard.length + rk.hand.length).toBe(12);
    const leftover = rk.hand.map((c) => c.defId).sort();
    finishRatKing(s);
    expect(s.heroes["rat-king"].hand).toHaveLength(0);
    expect(s.heroes["rat-king"].energy).toBe(0);
    for (const id of leftover) {
      expect(s.heroes["rat-king"].discard.some((c) => c.defId === id)).toBe(true);
    }
  });

  it("reshuffles the discard into the draw pile when drawing past empty", () => {
    const s = createFight(1, { seed: 3 });
    const rk = s.heroes["rat-king"];
    rk.discard.push(...rk.hand, ...rk.draw);
    rk.hand = [];
    rk.draw = rk.discard.splice(0, 2);
    expect(rk.draw).toHaveLength(2);
    expect(rk.discard).toHaveLength(10);
    startHeroCardTurn(s, "rat-king");
    expect(rk.hand).toHaveLength(5);
    expect(rk.draw.length + rk.discard.length).toBe(7);
    expect(rk.draw.length + rk.discard.length + rk.hand.length).toBe(12);
  });
});

describe("Card Trial Move", () => {
  it("charges 1 energy once per turn and does not consume it for Lunge or Parting Blow", () => {
    const s = createFight(1, { seed: 8 });
    const rk = s.heroes["rat-king"];
    dealHand(s, "rat-king", ["lunge", "nip"]);
    rk.row = "back";

    const beforeMoveFlag = rk.paidMoveUsed;
    play(s, "lunge", s.enemies[0]!.id);
    expect(rk.row).toBe("front");
    expect(rk.paidMoveUsed).toBe(beforeMoveFlag);
    expect(canPaidMove(s).ok).toBe(true);
    expect(rk.energy).toBe(2);

    const moved = paidMove(s);
    expect(moved.ok).toBe(true);
    expect(rk.row).toBe("back");
    expect(rk.paidMoveUsed).toBe(true);
    expect(rk.energy).toBe(1);
    expect(canPaidMove(s).ok).toBe(false);

    const again = paidMove(s);
    expect(again.ok).toBe(false);
  });

  it("lets Parting Blow move to Back without spending the Move utility", () => {
    const s = createFight(3, { seed: 5 });
    finishRatKing(s);
    const om = s.heroes["old-man"];
    dealHand(s, "old-man", ["parting-blow"]);
    om.row = "front";
    play(s, "parting-blow", s.enemies[0]!.id);
    expect(om.row).toBe("back");
    expect(om.paidMoveUsed).toBe(false);
    expect(canPaidMove(s).ok).toBe(true);
    expect(om.energy).toBe(2);
  });
});

describe("Card Trial Guard", () => {
  it("absorbs damage and expires at that hero's next card-turn start", () => {
    const s = createFight(2, { seed: 6 });
    const rk = s.heroes["rat-king"];
    rk.discard.push(...rk.hand);
    rk.hand = [];
    const brace = rk.discard.find((c) => c.defId === "brace")!;
    rk.hand = [brace];
    rk.energy = 3;
    play(s, "brace");
    expect(rk.guard).toBe(6);
    finishRatKing(s);
    expect(rk.hp).toBe(35);
    expect(rk.guard).toBe(0);
    rk.guard = 4;
    startHeroCardTurn(s, "rat-king");
    expect(rk.guard).toBe(0);
  });
});

describe("Card Trial rows", () => {
  it("hits the only hero in the row and misses an empty row", () => {
    const s = createFight(2, { seed: 1 });
    expect(s.heroes["rat-king"].row).toBe("front");
    expect(s.heroes["old-man"].row).toBe("back");
    expect(singleTargetInRow(s, "front")?.id).toBe("rat-king");
    paidMove(s);
    expect(s.heroes["rat-king"].row).toBe("back");
    expect(singleTargetInRow(s, "front")).toBeNull();
    finishRatKing(s);
    expect(s.heroes["rat-king"].hp).toBe(32);
    expect(s.enemies.find((e) => e.id === "cleaver")!.intentIndex).toBe(1);
  });

  it("breaks HP ties by most recent row entrant, including combat-start placement", () => {
    const s = createFight(2, { seed: 1 });
    const rk = s.heroes["rat-king"];
    const om = s.heroes["old-man"];
    expect(rk.hp).toBe(40);
    expect(om.hp).toBe(40);
    expect(om.rowEnteredAt).toBeGreaterThan(rk.rowEnteredAt);
    paidMove(s);
    expect(rk.rowEnteredAt).toBeGreaterThan(om.rowEnteredAt);
    expect(singleTargetInRow(s, "back")?.id).toBe("rat-king");
  });

  it("updates entry order for card-printed movement", () => {
    const s = createFight(1, { seed: 9 });
    const rk = s.heroes["rat-king"];
    rk.discard.push(...rk.hand);
    const lunge = rk.discard.find((c) => c.defId === "lunge")!;
    rk.hand = [lunge];
    rk.energy = 3;
    rk.row = "back";
    const before = rk.rowEnteredAt;
    play(s, "lunge", s.enemies[0]!.id);
    expect(rk.row).toBe("front");
    expect(rk.rowEnteredAt).toBeGreaterThan(before);
  });
});

describe("Card Trial intents", () => {
  it("uses exact deterministic cycles and advances on empty-row miss", () => {
    const s = createFight(2, { seed: 1 });
    const cleaver = s.enemies.find((e) => e.id === "cleaver")!;
    expect(cleaver.cycle.map((c) => ("damage" in c ? c.damage : 0))).toEqual([11, 9, 13]);
    paidMove(s);
    finishRatKing(s);
    expect(cleaver.intentIndex).toBe(1);
    expect(s.telemetry.intents.find((i) => i.enemyId === "cleaver")!.missedEmpty).toBe(1);
  });

  it("cancels a dead enemy's future action", () => {
    const s = createAdversarialTriangle();
    play(s, "tide", "ash");
    play(s, "swarm-the-wound", "ash");
    play(s, "nip", "ash");
    expect(s.enemies.find((e) => e.id === "ash")!.hp).toBe(0);
    finishRatKing(s);
    const rec = s.telemetry.intents.find((i) => i.enemyId === "ash")!;
    expect(rec.canceledDead).toBeGreaterThanOrEqual(1);
    expect(rec.resolved).toBe(0);
  });
});

describe("Opened", () => {
  it("moves the tag, does not stack, and ignores ordinary attacks", () => {
    const s = createFight(2, { seed: 11 });
    dealHand(s, "rat-king", ["open-the-rank", "nip", "from-the-dark"]);
    play(s, "open-the-rank", "cleaver");
    expect(s.opened?.enemyId).toBe("cleaver");
    play(s, "nip", "cleaver");
    expect(s.opened?.enemyId).toBe("cleaver");
    play(s, "from-the-dark", "ash");
    expect(s.opened?.enemyId).toBe("ash");
    expect(s.opened?.movedBeforeConsume).toBe(true);
  });

  it("lets Burst consume on a lone enemy with zero splash", () => {
    const s = createFight(10, { seed: 1 });
    const rk = s.heroes["rat-king"];
    rk.discard.push(...rk.hand, ...rk.draw);
    rk.draw = [];
    const burst = rk.discard.find((c) => c.defId === "burst-the-nest")!;
    const open = rk.discard.find((c) => c.defId === "open-the-rank")!;
    rk.hand = [open, burst];
    rk.energy = 3;
    play(s, "open-the-rank", "the-heap");
    play(s, "burst-the-nest", "the-heap");
    expect(s.opened).toBeNull();
    expect(s.enemies[0]!.hp).toBe(96 - 4 - 8);
  });

  it("refuses Cut the Line consume without a legal second enemy", () => {
    const s = createFight(10, { seed: 2 });
    finishRatKing(s);
    const om = s.heroes["old-man"];
    om.discard.push(...om.hand, ...om.draw);
    om.draw = [];
    const crack = om.discard.find((c) => c.defId === "crack")!;
    const cut = om.discard.find((c) => c.defId === "cut-the-line")!;
    om.hand = [crack, cut];
    om.energy = 3;
    play(s, "crack", "the-heap");
    const cutCard = handCard(s, "cut-the-line")!;
    const view = playerView(s).hand.find((c) => c.uid === cutCard.uid)!;
    expect(view.consumeArmed).toBe(false);
    const result = playCard(s, cutCard.uid, { targetId: "the-heap", secondTargetId: "the-heap" });
    expect(result.ok).toBe(true);
    expect(s.opened?.enemyId).toBe("the-heap");
    expect(s.enemies[0]!.hp).toBe(96 - 5 - 5);
  });
});

describe("Rat token", () => {
  it("spawns at most one on Rat King's row and never intercepts", () => {
    const s = createFight(1, { seed: 12 });
    const rk = s.heroes["rat-king"];
    dealHand(s, "rat-king", ["litter", "send-the-rat"]);
    rk.row = "front";
    play(s, "litter", s.enemies[0]!.id);
    expect(s.rat?.row).toBe("front");
    const hpAfterLitter = s.enemies[0]!.hp;
    play(s, "send-the-rat", s.enemies[0]!.id);
    expect(s.rat?.row).toBe("back");
    expect(s.enemies[0]!.hp).toBe(hpAfterLitter - 5);
    expect(s.queue.some((a) => a.id === "rat")).toBe(false);
    paidMove(s);
    finishRatKing(s);
    expect(s.heroes["rat-king"].hp).toBeLessThan(40);
    expect(s.rat).not.toBeNull();
  });

  it("lets Send the Rat deal 4 when no Rat exists", () => {
    const s = createFight(1, { seed: 13 });
    const rk = s.heroes["rat-king"];
    rk.discard.push(...rk.hand);
    const send = rk.discard.find((c) => c.defId === "send-the-rat")!;
    rk.hand = [send];
    rk.energy = 3;
    expect(s.rat).toBeNull();
    const hp = s.enemies[0]!.hp;
    play(s, "send-the-rat", s.enemies[0]!.id);
    expect(s.enemies[0]!.hp).toBe(hp - 4);
    expect(s.rat).toBeNull();
  });
});

describe("Opened consume telemetry", () => {
  it("records a true decline when a Consume card is in hand and never played", () => {
    const s = createAdversarialTriangle();
    play(s, "king-of-the-heap", "cleaver");
    play(s, "nip", "cleaver");
    finishRatKing(s);
    const rec = s.telemetry.turns.at(-1)!;
    expect(rec.actions.some((a) => a.startsWith("openedAvailableButDeclined"))).toBe(true);
    expect(rec.actions.some((a) => a.startsWith("consumeCardPlayedBaseKilledTarget"))).toBe(false);
    expect(s.opened?.enemyId).toBe("ash");
  });

  it("does not call a base-lethal Consume play a decline", () => {
    const s = createAdversarialTriangle();
    const ash = s.enemies.find((e) => e.id === "ash")!;
    ash.hp = 4;
    play(s, "swarm-the-wound", "ash");
    finishRatKing(s);
    const rec = s.telemetry.turns.at(-1)!;
    expect(rec.actions.some((a) => a.startsWith("consumeCardPlayedBaseKilledTarget:swarm-the-wound"))).toBe(
      true,
    );
    expect(rec.actions.some((a) => a.startsWith("openedAvailableButDeclined"))).toBe(false);
    expect(s.opened).toBeNull();
  });

  it("does not flag a successful Consume as declined or base-killed", () => {
    const s = createAdversarialTriangle();
    play(s, "swarm-the-wound", "ash");
    finishRatKing(s);
    const rec = s.telemetry.turns.at(-1)!;
    expect(s.opened).toBeNull();
    expect(rec.actions.some((a) => a.startsWith("openedAvailableButDeclined"))).toBe(false);
    expect(rec.actions.some((a) => a.startsWith("consumeCardPlayedBaseKilledTarget"))).toBe(false);
  });
});

describe("locked Cleaver/Ash triangle", () => {
  it("Leave: Move + Swarm + Nip", () => {
    const s = createAdversarialTriangle();
    expect(playerView(s).hand.map((c) => c.defId).sort()).toEqual(
      ["king-of-the-heap", "nip", "nip", "swarm-the-wound", "tide"].sort(),
    );
    paidMove(s);
    play(s, "swarm-the-wound", "ash");
    play(s, "nip", "ash");
    expect(s.enemies.find((e) => e.id === "ash")!.hp).toBe(8);
    finishRatKing(s);
    expect(s.heroes["rat-king"].row).toBe("back");
    expect(s.heroes["old-man"].row).toBe("back");
    expect(s.heroes["rat-king"].hp).toBe(32);
    expect(s.heroes["old-man"].hp).toBe(40);
    expect(s.enemies.find((e) => e.id === "cleaver")!.intentIndex).toBe(1);
    expect(s.opened).toBeNull();
  });

  it("Stay: Heap + Nip Cleaver", () => {
    const s = createAdversarialTriangle();
    play(s, "king-of-the-heap", "cleaver");
    play(s, "nip", "cleaver");
    expect(s.enemies.find((e) => e.id === "cleaver")!.hp).toBe(25);
    finishRatKing(s);
    expect(s.heroes["rat-king"].row).toBe("front");
    expect(s.heroes["rat-king"].hp).toBe(37);
    expect(s.heroes["old-man"].hp).toBe(32);
    expect(s.opened?.enemyId).toBe("ash");
    expect(s.heroes["rat-king"].discard.some((c) => c.defId === "swarm-the-wound")).toBe(true);
  });

  it("Race: Tide + Swarm + Nip Ash", () => {
    const s = createAdversarialTriangle();
    play(s, "tide", "ash");
    play(s, "swarm-the-wound", "ash");
    play(s, "nip", "ash");
    expect(s.enemies.find((e) => e.id === "ash")!.hp).toBe(0);
    expect(s.opened).toBeNull();
    finishRatKing(s);
    expect(s.heroes["rat-king"].row).toBe("front");
    expect(s.heroes["rat-king"].hp).toBe(29);
    expect(s.heroes["old-man"].hp).toBe(40);
  });
});

describe("isolation", () => {
  it("does not change campaign PARTY_SIZE", () => {
    expect(PARTY_SIZE).toBe(4);
    createFight(1, { seed: 1 });
    expect(PARTY_SIZE).toBe(4);
  });

  it("does not consume gameplay RNG for shuffling", () => {
    setGameplayRng(() => {
      throw new Error("gameplay RNG used");
    });
    try {
      const s = createFight(2, { seed: 20 });
      expect(s.heroes["rat-king"].hand).toHaveLength(5);
    } finally {
      resetGameplayRng();
    }
  });

  it("lists ten fights and does not register them on campaign floors", () => {
    expect(ENCOUNTERS).toHaveLength(10);
    expect(ENCOUNTERS.map((e) => e.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ENCOUNTERS.find((e) => e.id === 2)!.enemies.map((x) => x.maxHp)).toEqual([40, 22]);
  });
});

describe("playerView presentation fields", () => {
  it("exposes enemy visual rows and the initiative queue without changing combat math", () => {
    const s = createAdversarialTriangle();
    const view = playerView(s);
    expect(view.enemies.map((e) => e.id)).toEqual(s.enemies.map((e) => e.id));
    expect(view.enemies.every((e) => e.visualRow === "front" || e.visualRow === "back")).toBe(true);
    expect(view.queue[0]).toMatchObject({ id: "rat-king", kind: "hero", acting: true });
    expect(view.queue.some((q) => q.id === "old-man" && q.kind === "hero")).toBe(true);
    expect(view.queue.some((q) => q.kind === "enemy")).toBe(true);
  });
});
