import { describe, expect, it } from "vitest";
import {
  actingHero,
  createFight,
  endHeroTurn,
  handCard,
  parseTurnModel,
  playCard,
  playerView,
  switchActingHero,
} from "./engine";
import type { CardId, CardTrialEvent, CardTrialState } from "./types";

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

function enemyHp(s: CardTrialState): number[] {
  return s.enemies.map((e) => e.hp);
}

describe("Card Trial turn model — interleaved control", () => {
  it("defaults to interleaved and still inserts fast enemies between the heroes", () => {
    const s = createFight(1, { seed: 2 });
    expect(s.turnModel).toBe("interleaved");
    expect(actingHero(s)?.id).toBe("rat-king");
    expect(s.heroes["old-man"].hand).toHaveLength(0);

    const hpBefore = enemyHp(s);
    endHeroTurn(s);
    expect(actingHero(s)?.id).toBe("old-man");
    expect(s.heroes["old-man"].hand).toHaveLength(5);
    // Fight 1 is all-fast: enemies resolve before Old Man draws.
    expect(s.heroes["rat-king"].hp).toBeLessThan(40);
  });

  it("on Mixed Medium still lets the fast enemy act before Old Man", () => {
    const s = createFight(3, { seed: 5 });
    const pike = s.enemies.find((e) => e.id === "pike")!;
    const bolt = s.enemies.find((e) => e.id === "bolt")!;
    const pikeIntent = pike.intentIndex;
    const boltIntent = bolt.intentIndex;

    endHeroTurn(s);
    expect(actingHero(s)?.id).toBe("old-man");
    expect(pike.intentIndex).not.toBe(pikeIntent);
    expect(bolt.intentIndex).toBe(boltIntent);

    endHeroTurn(s);
    expect(bolt.intentIndex).not.toBe(boltIntent);
  });
});

describe("Card Trial turn model — shared", () => {
  it("draws both hands up front and does not run enemies until both heroes finish", () => {
    const s = createFight(1, { seed: 2, turnModel: "shared" });
    expect(s.turnModel).toBe("shared");
    expect(actingHero(s)?.id).toBe("rat-king");
    expect(s.heroes["rat-king"].hand).toHaveLength(5);
    expect(s.heroes["old-man"].hand).toHaveLength(5);
    expect(s.heroes["old-man"].energy).toBe(3);

    const hpBefore = enemyHp(s);
    const rkHp = s.heroes["rat-king"].hp;
    endHeroTurn(s);
    expect(actingHero(s)?.id).toBe("old-man");
    expect(enemyHp(s)).toEqual(hpBefore);
    expect(s.heroes["rat-king"].hp).toBe(rkHp);
    expect(s.heroes["rat-king"].hand).toHaveLength(0);
    expect(s.heroes["old-man"].hand).toHaveLength(5);

    endHeroTurn(s);
    expect(s.heroes["rat-king"].hp).toBeLessThan(rkHp);
  });

  it("lets the player switch heroes without discarding or advancing enemies", () => {
    const s = createFight(2, { seed: 4, turnModel: "shared" });
    dealHand(s, "rat-king", ["brace"]);
    play(s, "brace");
    expect(s.heroes["rat-king"].guard).toBe(6);
    expect(s.heroes["rat-king"].energy).toBe(2);

    const switched = switchActingHero(s, "old-man");
    expect(switched.ok).toBe(true);
    expect(actingHero(s)?.id).toBe("old-man");
    expect(s.heroes["rat-king"].guard).toBe(6);
    expect(s.heroes["rat-king"].energy).toBe(2);
    expect(s.heroes["rat-king"].hand.length + s.heroes["rat-king"].discard.filter((c) => c.defId === "brace").length).toBeGreaterThan(0);

    const back = switchActingHero(s, "rat-king");
    expect(back.ok).toBe(true);
    expect(actingHero(s)?.id).toBe("rat-king");
    expect(s.heroes["rat-king"].energy).toBe(2);
    expect(s.heroes["rat-king"].guard).toBe(6);
  });

  it("clears Guard for both heroes at the next player phase, not on switch", () => {
    const s = createFight(2, { seed: 6, turnModel: "shared" });
    dealHand(s, "rat-king", ["brace"]);
    play(s, "brace");
    expect(s.heroes["rat-king"].guard).toBe(6);
    endHeroTurn(s);
    expect(actingHero(s)?.id).toBe("old-man");
    expect(s.heroes["rat-king"].guard).toBe(6);
    endHeroTurn(s);
    expect(actingHero(s)?.id).toBe("rat-king");
    // Enemies have now acted; leftover Guard is cleared at the new player phase.
    expect(s.heroes["rat-king"].guard).toBe(0);
    expect(s.heroes["old-man"].guard).toBe(0);
  });

  it("records a partner Opened consume in the same player phase", () => {
    const s = createFight(1, { seed: 8, turnModel: "shared" });
    const ember = s.enemies[0]!;
    dealHand(s, "rat-king", ["open-the-rank"]);
    play(s, "open-the-rank", ember.id);
    expect(s.opened?.enemyId).toBe(ember.id);
    expect(s.opened?.createdBy).toBe("rat-king");

    endHeroTurn(s);
    expect(actingHero(s)?.id).toBe("old-man");
    expect(s.opened?.enemyId).toBe(ember.id);

    dealHand(s, "old-man", ["full-stop"]);
    play(s, "full-stop", ember.id);
    expect(s.opened).toBeNull();
    const rec = s.telemetry.opened.at(-1);
    expect(rec?.openedCreatedBy).toBe("rat-king");
    expect(rec?.openedConsumedBy).toBe("old-man");
    expect(rec?.partnerConsume).toBe(true);
    expect(rec?.samePlayerPhaseConsume).toBe(true);
  });

  it("does not allow switching after that hero has passed", () => {
    const s = createFight(1, { seed: 3, turnModel: "shared" });
    endHeroTurn(s);
    expect(actingHero(s)?.id).toBe("old-man");
    const again = switchActingHero(s, "rat-king");
    expect(again.ok).toBe(false);
  });
});

describe("Card Trial turn model — handoff", () => {
  it("keeps Old Man's hand empty until Rat King hands off, then runs enemies after the second pass", () => {
    const s = createFight(1, { seed: 2, turnModel: "handoff" });
    expect(actingHero(s)?.id).toBe("rat-king");
    expect(s.heroes["old-man"].hand).toHaveLength(0);
    expect(s.heroes["old-man"].energy).toBe(0);

    const hpBefore = enemyHp(s);
    const rkHp = s.heroes["rat-king"].hp;
    expect(switchActingHero(s, "old-man").ok).toBe(false);

    endHeroTurn(s);
    expect(actingHero(s)?.id).toBe("old-man");
    expect(s.heroes["old-man"].hand).toHaveLength(5);
    expect(s.heroes["old-man"].energy).toBe(3);
    expect(enemyHp(s)).toEqual(hpBefore);
    expect(s.heroes["rat-king"].hp).toBe(rkHp);
    expect(s.handoffCompleted).toBe(true);
    expect(switchActingHero(s, "rat-king").ok).toBe(false);

    endHeroTurn(s);
    expect(s.heroes["rat-king"].hp).toBeLessThan(rkHp);
  });

  it("does not clear Rat King Guard when handing off", () => {
    const s = createFight(2, { seed: 6, turnModel: "handoff" });
    dealHand(s, "rat-king", ["brace"]);
    play(s, "brace");
    expect(s.heroes["rat-king"].guard).toBe(6);
    endHeroTurn(s);
    expect(actingHero(s)?.id).toBe("old-man");
    expect(s.heroes["rat-king"].guard).toBe(6);
    endHeroTurn(s);
    expect(s.heroes["rat-king"].guard).toBe(0);
  });

  it("skips a dead partner and proceeds to the enemy phase", () => {
    const s = createFight(1, { seed: 1, turnModel: "handoff" });
    s.heroes["old-man"].hp = 0;
    endHeroTurn(s);
    expect(actingHero(s)?.id).toBe("rat-king");
    expect(s.heroes["rat-king"].hand).toHaveLength(5);
  });
});

describe("Card Trial player view — turn model chrome", () => {
  it("labels Pass as Hand off on the opening handoff segment", () => {
    const s = createFight(4, { seed: 1, turnModel: "handoff" });
    const view = playerView(s);
    expect(view.turnModel).toBe("handoff");
    expect(view.passAction).toBe("handoff");
    expect(view.canSwitchHero).toBe(false);
    endHeroTurn(s);
    expect(playerView(s).passAction).toBe("done");
  });

  it("allows switching in shared and reports partner energy", () => {
    const s = createFight(4, { seed: 1, turnModel: "shared" });
    const view = playerView(s);
    expect(view.canSwitchHero).toBe(true);
    expect(view.partner?.id).toBe("old-man");
    expect(view.partner?.energy).toBe(3);
    expect(view.partner?.handCount).toBe(5);
  });
});

describe("Card Trial turn model — transition fuzz", () => {
  it("survives random play/pass/switch without double-acting enemies or stuck heroes", () => {
    const models = ["shared", "handoff"] as const;
    for (const turnModel of models) {
      for (let seed = 1; seed <= 20; seed++) {
        const fightId = ((seed - 1) % 10) + 1;
        const s = createFight(fightId, { seed, turnModel });
        let steps = 0;
        let lastPhaseId = s.playerPhaseId;
        let enemyResolvesThisPhase = 0;
        while (!s.result && steps < 100) {
          const hero = actingHero(s);
          expect(hero, `${turnModel} seed ${seed} step ${steps}`).toBeTruthy();
          const view = playerView(s);
          const n = (seed * 31 + steps * 17) % 10;
          if (turnModel === "shared" && view.canSwitchHero && n < 3) {
            const sw = switchActingHero(s, view.partner!.id);
            expect(sw.ok).toBe(true);
            steps += 1;
            continue;
          }
          const playable = view.hand.find((c) => !c.disabled);
          if (playable && n < 7) {
            const target = s.enemies.find((e) => e.hp > 0);
            playCard(s, playable.uid, { targetId: target?.id });
          } else {
            const intentBefore = s.enemies.map((e) => e.intentIndex);
            endHeroTurn(s);
            if (s.playerPhaseId !== lastPhaseId) {
              lastPhaseId = s.playerPhaseId;
              enemyResolvesThisPhase = 0;
            }
            const intentAfter = s.enemies.map((e) => e.intentIndex);
            const resolved = intentAfter.filter((v, i) => v !== intentBefore[i]).length;
            enemyResolvesThisPhase += resolved;
            if (s.turnModel !== "interleaved") {
              expect(enemyResolvesThisPhase).toBeLessThanOrEqual(s.enemies.length);
            }
          }
          steps += 1;
        }
        expect(s.telemetry.turnModel).toBe(turnModel);
      }
    }
  });
});

function banners(events: CardTrialEvent[]): string[] {
  return events.filter((e): e is Extract<CardTrialEvent, { type: "banner" }> => e.type === "banner").map((e) => e.text);
}

describe("parseTurnModel", () => {
  it("accepts the three explicit models and defaults everything else to interleaved", () => {
    expect(parseTurnModel("interleaved")).toBe("interleaved");
    expect(parseTurnModel("shared")).toBe("shared");
    expect(parseTurnModel("handoff")).toBe("handoff");
    expect(parseTurnModel("Handoff")).toBe("handoff");
    expect(parseTurnModel(" SHARED ")).toBe("shared");
    expect(parseTurnModel("nope")).toBe("interleaved");
    expect(parseTurnModel(null)).toBe("interleaved");
    expect(parseTurnModel(undefined)).toBe("interleaved");
  });
});

describe("Fight 4 turn-model discriminator", () => {
  it("inserts Hook between heroes only under interleaved", () => {
    const interleaved = createFight(4, { seed: 1, turnModel: "interleaved" });
    const afterRk = banners(endHeroTurn(interleaved));
    expect(afterRk.some((t) => t.includes("HOOK"))).toBe(true);
    expect(afterRk.some((t) => t.includes("BRUTE"))).toBe(false);
    expect(actingHero(interleaved)?.id).toBe("old-man");
    const afterOm = banners(endHeroTurn(interleaved));
    expect(afterOm.some((t) => t.includes("BRUTE"))).toBe(true);

    for (const turnModel of ["handoff", "shared"] as const) {
      const s = createFight(4, { seed: 1, turnModel });
      const first = banners(endHeroTurn(s));
      expect(first.some((t) => t.includes("HOOK") || t.includes("BRUTE")), turnModel).toBe(false);
      expect(actingHero(s)?.id).toBe("old-man");
      const second = banners(endHeroTurn(s));
      expect(second.some((t) => t.includes("HOOK")), turnModel).toBe(true);
      expect(second.some((t) => t.includes("BRUTE")), turnModel).toBe(true);
    }
  });
});
