import { describe, expect, it } from "vitest";
import { createAdversarialTriangle, createFight, playerView } from "../game/card-trial/engine";
import { compactIntentValue, intentDetailLines, intentHpLines } from "./card-trial-intent-copy";

describe("intent presentation copy", () => {
  it("uses post-Barrier HP loss, not raw incoming, in detail lines", () => {
    const trial = createAdversarialTriangle();
    trial.heroes["rat-king"].guard = 5;
    const view = playerView(trial);
    const cleaver = view.intents.find((i) => i.enemyId === "cleaver");
    expect(cleaver).toBeTruthy();
    const rk = intentHpLines(cleaver!, view.heroes).find((l) => l.heroName === "Rat King");
    expect(rk).toBeTruthy();
    expect(rk!.rawDamage).toBeGreaterThan(rk!.hpLoss);
    expect(rk!.hpLoss).toBe(Math.max(0, rk!.rawDamage - 5));
    const lines = intentDetailLines(cleaver!, view.heroes).join("\n");
    expect(lines).toContain("Barrier 5");
    expect(lines).toContain(`${rk!.rawDamage} → ${rk!.hpLoss} HP`);
    expect(lines).not.toMatch(new RegExp(`loses ${rk!.rawDamage} HP`));
  });

  it("shows an em dash when the intent would miss", () => {
    const trial = createAdversarialTriangle();
    const view = playerView(trial);
    const miss = view.intents.find((i) => i.wouldMiss);
    if (miss) expect(compactIntentValue(miss)).toBe("—");
    const hit = view.intents.find((i) => !i.wouldMiss);
    expect(hit).toBeTruthy();
    expect(compactIntentValue(hit!)).toBe(String(hit!.rawDamage));
  });

  it("explains Crown tribute separately from incoming damage", () => {
    const trial = createFight(8, { seed: 7 });
    trial.crownedEnemyId = "twinblade";
    const view = playerView(trial);
    const intent = view.intents.find((candidate) => candidate.enemyId === "twinblade");
    expect(intent?.tribute).toEqual({ heroId: "rat-king", amount: 2 });
    expect(intentDetailLines(intent!, view.heroes).join("\n")).toContain(
      "Rat King gains 2 Barrier as Crown tribute."
    );
  });
});
