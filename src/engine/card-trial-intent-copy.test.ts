import { describe, expect, it } from "vitest";
import { createAdversarialTriangle, playerView } from "../game/card-trial/engine";
import { compactIntentValue, intentDetailLines, intentHpLines } from "./card-trial-intent-copy";

describe("intent presentation copy", () => {
  it("uses post-Guard HP loss, not raw incoming, in detail lines", () => {
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
    expect(lines).toContain("Guard 5");
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
});
