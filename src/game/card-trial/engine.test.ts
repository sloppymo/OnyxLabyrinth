import { describe, expect, it } from "vitest";
import { createPlayableDuo } from "../playable-duo";
import { CARD_DEFS, OLD_MAN_LIST, RAT_KING_LIST } from "./cards";
import { DRAFT_CHOICES } from "./drafts";
import { ENCOUNTERS } from "./encounters";
import { createShuffleStream, shuffleInPlace } from "./rng";
import {
  actingHero,
  assembleFight,
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
  resolveDraftChoice,
  singleTargetInRow,
  startHeroCardTurn,
  summarizeTelemetry,
} from "./engine";
import { legalActions } from "./sim/legal-actions";
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
  it("gives each hero exactly 12 cards with one bounded draft card", () => {
    expect(RAT_KING_LIST).toHaveLength(12);
    expect(OLD_MAN_LIST).toHaveLength(12);
    expect(RAT_KING_LIST.filter((id) => id === "fight-dirty")).toHaveLength(1);
    expect(OLD_MAN_LIST.filter((id) => id === "improvised-theorem")).toHaveLength(1);
    expect(new Set(RAT_KING_LIST).size).toBe(12);
    expect(new Set(OLD_MAN_LIST).size).toBe(12);
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
      { hero: "old-man", id: "pale-ward", row: "back" },
      { hero: "old-man", id: "last-bastion", row: "front" },
      { hero: "old-man", id: "distant-hand", row: "back" },
      { hero: "old-man", id: "distant-hand", row: "front" },
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
      { hero: "old-man", openId: "faultline", consumeId: "full-stop" },
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
    dealHand(second, "old-man", ["faultline", "sever-the-thread"]);
    play(second, "faultline", "cleaver");
    const ashBeforeCut = second.enemies.find((e) => e.id === "ash")!.hp;
    play(second, "sever-the-thread", "cleaver", "ash");
    expect(ashBeforeCut - second.enemies.find((e) => e.id === "ash")!.hp).toBe(
      cardConsumeRiderDamage("sever-the-thread")
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

  it("does not Open when the base hit would kill", () => {
    const openers = [
      { hero: "rat-king" as const, id: "open-the-rank" as const },
      { hero: "rat-king" as const, id: "from-the-dark" as const },
      { hero: "old-man" as const, id: "faultline" as const },
      { hero: "old-man" as const, id: "marrow-divide" as const },
    ];
    for (const c of openers) {
      const s = createFight(2, { seed: 11 });
      if (c.hero === "old-man") finishRatKing(s);
      const target = s.enemies.find((e) => e.id === "cleaver")!;
      target.hp = cardPrimaryDamage(c.id, s.heroes[c.hero].row)!;
      dealHand(s, c.hero, [c.id]);
      play(s, c.id, "cleaver");
      expect(s.opened, c.id).toBeNull();
      expect(target.hp).toBe(0);
    }
  });

  it("locks Consume before a lethal base hit so the rider still applies", () => {
    const swarm = createFight(2, { seed: 12 });
    dealHand(swarm, "rat-king", ["open-the-rank", "swarm-the-wound"]);
    play(swarm, "open-the-rank", "cleaver");
    const cleaver = swarm.enemies.find((e) => e.id === "cleaver")!;
    cleaver.hp = 5;
    play(swarm, "swarm-the-wound", "cleaver");
    expect(cleaver.hp).toBe(0);
    expect(swarm.opened).toBeNull();
    expect(swarm.events.some((e) => e.type === "consume")).toBe(true);

    const burst = createFight(2, { seed: 13 });
    dealHand(burst, "rat-king", ["open-the-rank", "burst-the-nest"]);
    play(burst, "open-the-rank", "cleaver");
    burst.enemies.find((e) => e.id === "cleaver")!.hp = 8;
    const ashHp = burst.enemies.find((e) => e.id === "ash")!.hp;
    play(burst, "burst-the-nest", "cleaver");
    expect(burst.enemies.find((e) => e.id === "cleaver")!.hp).toBe(0);
    expect(ashHp - burst.enemies.find((e) => e.id === "ash")!.hp).toBe(4);

    const stop = createFight(2, { seed: 14 });
    finishRatKing(stop);
    dealHand(stop, "old-man", ["faultline", "full-stop"]);
    play(stop, "faultline", "cleaver");
    stop.enemies.find((e) => e.id === "cleaver")!.hp = 8;
    play(stop, "full-stop", "cleaver");
    expect(stop.enemies.find((e) => e.id === "cleaver")!.hp).toBe(0);
    expect(stop.opened).toBeNull();

    const cut = createFight(2, { seed: 15 });
    finishRatKing(cut);
    dealHand(cut, "old-man", ["faultline", "sever-the-thread"]);
    play(cut, "faultline", "cleaver");
    cut.enemies.find((e) => e.id === "cleaver")!.hp = 5;
    const ashBefore = cut.enemies.find((e) => e.id === "ash")!.hp;
    play(cut, "sever-the-thread", "cleaver", "ash");
    expect(cut.enemies.find((e) => e.id === "cleaver")!.hp).toBe(0);
    expect(ashBefore - cut.enemies.find((e) => e.id === "ash")!.hp).toBe(5);
  });

  it("ignores Front damage riders when rowMode is none", () => {
    const s = assembleFight({
      fightId: 1,
      fightName: "No row tide",
      seed: 1,
      enemies: [
        {
          id: "dummy",
          name: "Dummy",
          maxHp: 30,
          visualRow: "front",
          spriteId: "training-dummy",
          cycle: [{ kind: "row", row: "front", damage: 5 }],
          slot: "slow",
          order: 0,
        },
      ],
      decks: {
        "rat-king": ["tide", "nip", "brace", "lunge", "litter"],
        "old-man": ["the-staff-speaks", "pale-ward", "faultline", "distant-hand", "full-stop"],
      },
      ruleset: { cards: {}, rowMode: "none" },
      setup: { hands: { "rat-king": ["tide"] } },
    });
    s.heroes["rat-king"].row = "front";
    expect(cardPrimaryDamage("tide", "front", false, true)).toBe(5);
    play(s, "tide", "dummy");
    expect(s.enemies[0]!.hp).toBe(25);
    expect(s.heroes["rat-king"].row).toBe("front");
    expect(canPaidMove(s).ok).toBe(false);
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
    expect(cardPrimaryDamage("tide", "front", false, true)).toBe(5);
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

describe("bounded tactical drafts", () => {
  it("reveals three distinct temporary Dirty Tricks and keeps the source card out of the hand", () => {
    const s = createFight(2, { seed: 101 });
    dealHand(s, "rat-king", ["fight-dirty"]);
    const source = handCard(s, "fight-dirty")!;
    const result = playCard(s, source.uid, { targetId: "cleaver" });
    expect(result.ok).toBe(true);
    expect(result.events).toContainEqual(expect.objectContaining({ type: "draft-opened", sourceId: "fight-dirty" }));
    expect(s.draft?.heroId).toBe("rat-king");
    expect(s.draft?.pool).toBe("dirty-tricks");
    expect(s.draft?.choices).toHaveLength(3);
    expect(new Set(s.draft?.choices.map((choice) => choice.id)).size).toBe(3);
    expect(s.heroes["rat-king"].hand.some((card) => card.defId === "fight-dirty")).toBe(false);
    expect(playerView(s).draft?.sourceName).toBe("Fight Dirty");
  });

  it("uses the same seed to reveal the same choices", () => {
    const a = createFight(2, { seed: 202 });
    const b = createFight(2, { seed: 202 });
    dealHand(a, "rat-king", ["fight-dirty"]);
    dealHand(b, "rat-king", ["fight-dirty"]);
    play(a, "fight-dirty", "cleaver");
    play(b, "fight-dirty", "cleaver");
    expect(a.draft?.choices.map((choice) => choice.id)).toEqual(b.draft?.choices.map((choice) => choice.id));
  });

  it("lets Old Man choose a free arcane response and resolves it as a spell", () => {
    const s = createFight(2, { seed: 303 });
    finishRatKing(s);
    dealHand(s, "old-man", ["improvised-theorem"]);
    play(s, "improvised-theorem", "cleaver");
    const draft = s.draft!;
    const free = draft.choices.find((choice) => choice.cost === 0)!;
    const beforeEnergy = s.heroes["old-man"].energy;
    const picked = resolveDraftChoice(s, free.id);
    expect(picked.ok).toBe(true);
    expect(s.draft).toBeNull();
    expect(s.heroes["old-man"].energy).toBe(beforeEnergy);
    expect(picked.events).toContainEqual(expect.objectContaining({
      type: "draft-picked",
      sourceId: "improvised-theorem",
      choiceId: free.id,
    }));
  });

  it("does not allow ordinary actions or recursive drafts while a choice is open", () => {
    const s = createFight(2, { seed: 404 });
    dealHand(s, "rat-king", ["fight-dirty", "nip"]);
    play(s, "fight-dirty", "cleaver");
    expect(playCard(s, handCard(s, "nip")!.uid, { targetId: "cleaver" })).toMatchObject({
      ok: false,
      reason: "Choose a draft card",
    });
    expect(endHeroTurn(s)).toEqual([]);
    expect(canPaidMove(s)).toMatchObject({ ok: false, reason: "Choose a draft card" });
    expect(legalActions(s).every((a) => a.kind === "draft")).toBe(true);
    expect(legalActions(s).some((a) => a.kind === "pass")).toBe(false);
  });

  it("lets the source be the last Energy and still offers an affordable Safe option", () => {
    const s = createFight(2, { seed: 505 });
    dealHand(s, "rat-king", ["fight-dirty"]);
    s.heroes["rat-king"].energy = 1;
    play(s, "fight-dirty", "cleaver");
    expect(s.heroes["rat-king"].energy).toBe(0);
    const legal = legalActions(s);
    expect(legal.length).toBeGreaterThan(0);
    expect(legal.every((a) => a.kind === "draft")).toBe(true);
    expect(s.draft?.choices.some((choice) => choice.cost === 0)).toBe(true);
    const free = s.draft!.choices.find((choice) => choice.cost === 0)!;
    expect(legal.some((a) => a.kind === "draft" && a.choiceId === free.id)).toBe(true);
    const greedy = s.draft!.choices.find((choice) => choice.cost === 1);
    if (greedy) {
      expect(legal.some((a) => a.kind === "draft" && a.choiceId === greedy.id)).toBe(false);
      expect(resolveDraftChoice(s, greedy.id).ok).toBe(false);
    }
    expect(resolveDraftChoice(s, free.id).ok).toBe(true);
  });

  it("does not change the offer when the hero deck stream is burned", () => {
    const a = createFight(2, { seed: 606 });
    const b = createFight(2, { seed: 606 });
    shuffleInPlace(a.heroes["rat-king"].draw, a.streams["rat-king"]);
    shuffleInPlace(a.heroes["rat-king"].discard, createShuffleStream(1));
    dealHand(a, "rat-king", ["fight-dirty"]);
    dealHand(b, "rat-king", ["fight-dirty"]);
    play(a, "fight-dirty", "cleaver");
    play(b, "fight-dirty", "cleaver");
    expect(a.draft?.choices.map((c) => c.id)).toEqual(b.draft?.choices.map((choice) => choice.id));
  });

  it("locks the target before reveal and rolls back on an invalid pick", () => {
    const s = createFight(2, { seed: 707 });
    dealHand(s, "rat-king", ["fight-dirty"]);
    const energy = s.heroes["rat-king"].energy;
    const streamBefore = s.draftStream.getState();
    play(s, "fight-dirty", "cleaver");
    expect(s.draft?.targetId).toBe("cleaver");
    const afterOpen = s.draftStream.getState();
    expect(afterOpen).not.toBe(streamBefore);
    s.enemies.find((e) => e.id === "cleaver")!.hp = 0;
    const lost = resolveDraftChoice(s, s.draft!.choices[0]!.id);
    expect(lost.ok).toBe(false);
    expect(lost.events).toContainEqual(expect.objectContaining({ type: "offer-lost", targetId: "cleaver" }));
    expect(s.draft).toBeNull();
    expect(s.heroes["rat-king"].hand.some((c) => c.defId === "fight-dirty")).toBe(true);
    expect(s.heroes["rat-king"].energy).toBe(energy);
    expect(s.draftStream.getState()).toBe(streamBefore);
  });

  it("resolves no-Rat, occupied Omen, no-Opened, and partner-Down fallbacks", () => {
    const sleeve = createFight(2, { seed: 808 });
    dealHand(sleeve, "rat-king", ["fight-dirty"]);
    play(sleeve, "fight-dirty", "cleaver");
    sleeve.draft!.choices = [
      DRAFT_CHOICES["rat-in-the-sleeve"],
      DRAFT_CHOICES["pocket-sand"],
      DRAFT_CHOICES["royal-ambush"],
    ];
    expect(sleeve.rat).toBeNull();
    expect(resolveDraftChoice(sleeve, "rat-in-the-sleeve").ok).toBe(true);
    expect(sleeve.rat?.row).toBe("front");

    const omen = createFight(2, { seed: 809 });
    finishRatKing(omen);
    omen.omen = { targetId: "cleaver", createdBy: "old-man", damage: 7 };
    dealHand(omen, "old-man", ["improvised-theorem"]);
    play(omen, "improvised-theorem", "ash");
    omen.draft!.choices = [
      DRAFT_CHOICES["late-verdict"],
      DRAFT_CHOICES["silence-the-room"],
      DRAFT_CHOICES["fracture-script"],
    ];
    omen.heroes["old-man"].energy = 1;
    const ash = omen.enemies.find((e) => e.id === "ash")!;
    expect(resolveDraftChoice(omen, "late-verdict").ok).toBe(true);
    expect(omen.omen?.targetId).toBe("cleaver");
    expect(ash.hushed).toBe(true);

    const feast = createFight(2, { seed: 810 });
    dealHand(feast, "rat-king", ["fight-dirty"]);
    play(feast, "fight-dirty", "cleaver");
    feast.draft!.choices = [
      DRAFT_CHOICES["feast-on-the-fallen"],
      DRAFT_CHOICES["pocket-sand"],
      DRAFT_CHOICES["royal-ambush"],
    ];
    feast.heroes["rat-king"].energy = 1;
    expect(feast.opened).toBeNull();
    resolveDraftChoice(feast, "feast-on-the-fallen");
    expect(feast.heroes["rat-king"].guard).toBe(2);

    const down = createFight(2, { seed: 811 });
    down.heroes["old-man"].hp = 0;
    dealHand(down, "rat-king", ["fight-dirty"]);
    play(down, "fight-dirty", "cleaver");
    expect(down.draft?.choices.some((c) => c.cost === 0)).toBe(true);
    const free = down.draft!.choices.find((c) => c.cost === 0)!;
    expect(resolveDraftChoice(down, free.id).ok).toBe(true);
  });
});

describe("Old Man spell states", () => {
  it("Hush halves the marked enemy's next intent and then clears", () => {
    const s = createFight(4, { seed: 17 });
    finishRatKing(s);
    dealHand(s, "old-man", ["the-staff-speaks"]);
    const brute = s.enemies.find((enemy) => enemy.id === "brute")!;

    const cast = play(s, "the-staff-speaks", brute.id);
    expect(cast.events).toEqual(
      expect.arrayContaining([
        { type: "attack", actorId: "old-man", targetId: "brute", damage: 6 },
        { type: "hush-applied", targetId: "brute" },
      ])
    );
    expect(brute.hushed).toBe(true);
    expect(playerView(s).intents.find((intent) => intent.enemyId === brute.id)?.rawDamage).toBe(6);

    const before = s.heroes["rat-king"].hp;
    const end = endHeroTurn(s);
    expect(end).toEqual(
      expect.arrayContaining([
        { type: "hush-triggered", targetId: "brute", rawDamage: 12, damage: 6 },
      ])
    );
    expect(s.heroes["rat-king"].hp).toBe(before - 6);
    expect(brute.hushed).toBe(false);
    expect(playerView(s).intents.find((intent) => intent.enemyId === brute.id)?.rawDamage).toBe(10);
  });

  it("The Threshold arms one Omen that strikes before a slow enemy acts", () => {
    const s = createFight(4, { seed: 18 });
    finishRatKing(s);
    dealHand(s, "old-man", ["the-threshold"]);
    const brute = s.enemies.find((enemy) => enemy.id === "brute")!;

    const cast = play(s, "the-threshold", brute.id);
    expect(cast.events).toContainEqual({ type: "omen-armed", targetId: brute.id, damage: 7 });
    expect(s.omen).toEqual({ targetId: brute.id, createdBy: "old-man", damage: 7 });
    expect(brute.hp).toBe(40);

    const end = endHeroTurn(s);
    expect(end).toEqual(
      expect.arrayContaining([{ type: "omen-triggered", targetId: brute.id, damage: 7 }])
    );
    expect(brute.hp).toBe(33);
    expect(s.omen).toBeNull();
  });

  it("clears an armed Omen when another card kills its target", () => {
    const s = createFight(2, { seed: 19 });
    const cleaver = s.enemies.find((enemy) => enemy.id === "cleaver")!;
    cleaver.hp = 5;
    s.omen = { targetId: cleaver.id, createdBy: "old-man", damage: 7 };
    dealHand(s, "rat-king", ["tide"]);

    const result = play(s, "tide", cleaver.id);
    expect(result.events).toContainEqual({ type: "omen-fizzled", targetId: cleaver.id });
    expect(s.omen).toBeNull();
  });
});

describe("Card Trial Move", () => {
  it("charges 1 energy once per turn and does not consume it for Lunge or Parting Word", () => {
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

  it("lets Parting Word move to Back without spending the Move utility", () => {
    const s = createFight(3, { seed: 5 });
    finishRatKing(s);
    const om = s.heroes["old-man"];
    dealHand(s, "old-man", ["parting-word"]);
    om.row = "front";
    play(s, "parting-word", s.enemies[0]!.id);
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

  it("refuses Sever the Thread consume without a legal second enemy", () => {
    const s = createFight(10, { seed: 2 });
    finishRatKing(s);
    const om = s.heroes["old-man"];
    om.discard.push(...om.hand, ...om.draw);
    om.draw = [];
    const crack = om.discard.find((c) => c.defId === "faultline")!;
    const cut = om.discard.find((c) => c.defId === "sever-the-thread")!;
    om.hand = [crack, cut];
    om.energy = 3;
    play(s, "faultline", "the-heap");
    const cutCard = handCard(s, "sever-the-thread")!;
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

describe("Crowned", () => {
  it("makes King of the Heap name and designate a single subject", () => {
    const s = createFight(2, { seed: 21 });
    s.heroes["rat-king"].row = "back";
    dealHand(s, "rat-king", ["king-of-the-heap"]);
    const result = play(s, "king-of-the-heap", "cleaver");
    expect(result.events).toContainEqual({ type: "crowned", targetId: "cleaver" });
    expect(s.crownedEnemyId).toBe("cleaver");
    const view = playerView(s);
    expect(view.crownedEnemyId).toBe("cleaver");
    expect(view.enemies.find((e) => e.id === "cleaver")?.crowned).toBe(true);
    expect(view.intents.find((i) => i.enemyId === "cleaver")?.label).toContain("Rat King (CROWN)");
  });

  it("redirects a Crowned row intent to Rat King regardless of row", () => {
    const s = createFight(2, { seed: 22 });
    s.heroes["rat-king"].row = "back";
    s.crownedEnemyId = "cleaver";
    const events = endHeroTurn(s);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "intent-hit", enemyId: "cleaver", targetId: "rat-king" })
    );
    expect(events.some((e) => e.type === "intent-hit" && e.enemyId === "cleaver" && e.targetId === "old-man")).toBe(false);
  });

  it("pays Barrier tribute instead of redirecting wide Crowned intents", () => {
    const s = createFight(8, { seed: 23 });
    s.crownedEnemyId = "twinblade";
    const before = s.heroes["rat-king"].guard;
    const events = endHeroTurn(s);
    expect(events).toContainEqual({ type: "guard", actorId: "rat-king", amount: 2 });
    expect(events).toContainEqual({
      type: "crown-tribute",
      targetId: "rat-king",
      amount: 2,
      sourceId: "twinblade",
    });
    expect(events).toContainEqual(
      expect.objectContaining({ type: "intent-hit", enemyId: "twinblade", targetId: "rat-king", absorbed: 2 })
    );
    expect(s.heroes["rat-king"].guard).toBe(before);
    expect(events.filter((e) => e.type === "intent-hit" && e.enemyId === "twinblade")).toHaveLength(2);
  });

  it("clears the crown when its subject dies", () => {
    const s = createFight(2, { seed: 24 });
    s.crownedEnemyId = "cleaver";
    const cleaver = s.enemies.find((enemy) => enemy.id === "cleaver")!;
    cleaver.hp = 5;
    dealHand(s, "rat-king", ["nip"]);
    const result = play(s, "nip", cleaver.id);
    expect(result.events).toContainEqual({ type: "crown-cleared", targetId: "cleaver", reason: "defeated" });
    expect(s.crownedEnemyId).toBeNull();
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
    expect(s.opened).toBeNull();
    expect(rec.actions.some((a) => a.startsWith("consumeCardPlayedBaseKilledTarget"))).toBe(false);
    expect(rec.actions.some((a) => a.startsWith("openedAvailableButDeclined"))).toBe(false);
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
  it("does not change the campaign's fixed protagonist duo", () => {
    expect(createPlayableDuo().map((character) => character.id)).toEqual([
      "old-man",
      "rat-king",
    ]);
    createFight(1, { seed: 1 });
    expect(createPlayableDuo()).toHaveLength(2);
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
