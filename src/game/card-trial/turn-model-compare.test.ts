import { describe, expect, it } from "vitest";
import { CARD_DEFS } from "./cards";
import {
  actingHero,
  canPaidMove,
  createFight,
  endHeroTurn,
  paidMove,
  playCard,
  playerView,
  switchActingHero,
} from "./engine";
import type { CardTrialState, CardTrialTurnModel } from "./types";

function greedyAct(s: CardTrialState): void {
  const view = playerView(s);
  const hero = actingHero(s);
  if (!hero || s.result) return;
  const openedId = s.opened?.enemyId ?? null;
  const living = s.enemies.filter((e) => e.hp > 0);
  const primary = openedId
    ? living.find((e) => e.id === openedId) ?? living[0]
    : living[0];

  const ranked = [...view.hand].sort((a, b) => {
    const da = CARD_DEFS[a.defId];
    const db = CARD_DEFS[b.defId];
    const score = (d: typeof da, armed: boolean) => {
      if (d.consume !== "none" && openedId && armed) return 50;
      if (d.opens && !openedId) return 40;
      if (d.cost === 1 && d.target === "single-enemy") return 20;
      if (d.id === "brace" || d.id === "ward") return 5;
      return 1;
    };
    return score(db, b.consumeArmed) - score(da, a.consumeArmed);
  });

  for (const card of ranked) {
    if (card.disabled) continue;
    const def = CARD_DEFS[card.defId];
    const result = playCard(s, card.uid, {
      targetId: def.target === "none" ? undefined : primary?.id,
    });
    if (result.ok) return;
  }
  if (canPaidMove(s).ok && hero.row === "front" && hero.hp < 20) {
    paidMove(s);
    return;
  }
  endHeroTurn(s);
}

function playFight(fightId: number, seed: number, turnModel: CardTrialTurnModel) {
  const s = createFight(fightId, { seed, turnModel });
  let steps = 0;
  while (!s.result && steps < 200) {
    greedyAct(s);
    steps += 1;
  }
  return {
    turnModel,
    fightId,
    seed,
    result: s.result,
    rounds: s.round,
    steps,
    rkHp: s.heroes["rat-king"].hp,
    omHp: s.heroes["old-man"].hp,
    partnerConsumes: s.telemetry.openedPartnerConsumes,
    samePhaseConsumes: s.telemetry.openedSamePhaseConsumes,
    preemptiveKills: s.telemetry.enemiesKilledDuringPlayerPhase,
    heroSwitches: s.telemetry.heroSwitchCount,
  };
}

describe("Card Trial turn model — greedy comparison", () => {
  it("records power and Opened-routing differences without retuning enemies", () => {
    const fights = [1, 2, 3, 5, 9, 10];
    const models: CardTrialTurnModel[] = ["interleaved", "shared", "handoff"];
    const rows = [];
    for (const fightId of fights) {
      for (const turnModel of models) {
        rows.push(playFight(fightId, 11, turnModel));
      }
    }
    for (const row of rows) {
      expect(row.result === "victory" || row.result === "wipe" || row.steps === 200).toBe(true);
    }
    const byModel = (model: CardTrialTurnModel) => rows.filter((r) => r.turnModel === model);
    const avgHp = (model: CardTrialTurnModel) => {
      const set = byModel(model);
      return set.reduce((n, r) => n + r.rkHp + r.omHp, 0) / set.length;
    };
    console.table(rows);
    console.log("avg combined HP", {
      interleaved: avgHp("interleaved"),
      shared: avgHp("shared"),
      handoff: avgHp("handoff"),
    });
    console.log("partner consumes", {
      interleaved: byModel("interleaved").reduce((n, r) => n + r.partnerConsumes, 0),
      shared: byModel("shared").reduce((n, r) => n + r.partnerConsumes, 0),
      handoff: byModel("handoff").reduce((n, r) => n + r.partnerConsumes, 0),
    });
    console.log("preemptive kills", {
      interleaved: byModel("interleaved").reduce((n, r) => n + r.preemptiveKills, 0),
      shared: byModel("shared").reduce((n, r) => n + r.preemptiveKills, 0),
      handoff: byModel("handoff").reduce((n, r) => n + r.preemptiveKills, 0),
    });
    // Power confound: coordinated phases keep more HP on this greedy sample.
    expect(avgHp("shared") + avgHp("handoff")).toBeGreaterThan(avgHp("interleaved"));
  });

  it("shows Shared only diverges from Handoff when the player actually switches", () => {
    function switchAfterOpen(s: CardTrialState): void {
      const view = playerView(s);
      const hero = actingHero(s);
      if (!hero || s.result) return;
      if (
        s.turnModel === "shared" &&
        view.canSwitchHero &&
        hero.id === "rat-king" &&
        s.opened &&
        view.partner &&
        !view.partner.finished
      ) {
        switchActingHero(s, view.partner.id);
        greedyAct(s);
        return;
      }
      greedyAct(s);
    }
    const shared = createFight(1, { seed: 8, turnModel: "shared" });
    const handoff = createFight(1, { seed: 8, turnModel: "handoff" });
    let steps = 0;
    while (!shared.result && steps < 80) {
      switchAfterOpen(shared);
      steps += 1;
    }
    steps = 0;
    while (!handoff.result && steps < 80) {
      greedyAct(handoff);
      steps += 1;
    }
    expect(shared.telemetry.heroSwitchCount).toBeGreaterThan(0);
    expect(handoff.telemetry.heroSwitchCount).toBe(0);
    expect(shared.result).toBe("victory");
    expect(handoff.result).toBe("victory");
  });
});
