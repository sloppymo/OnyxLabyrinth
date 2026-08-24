import { describe, expect, it } from "vitest";
import { createAdversarialTriangle, createFight, playerView } from "../game/card-trial/engine";
import type { IntentPreview } from "../game/card-trial/types";
import {
  chipIntentSuffix,
  compactIntentTarget,
  compactIntentValue,
  intentDetailLines,
  intentHpLines,
  threatenedRows,
} from "./card-trial-intent-copy";

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

  it("formats a compact target token for every intent kind", () => {
    const base = (target: IntentPreview["target"]): IntentPreview => ({
      enemyId: "x",
      enemyName: "X",
      label: "",
      target,
      rawDamage: 5,
      consequences: [],
      missIfEmpty: false,
      wouldMiss: false,
    });
    expect(compactIntentTarget(base({ kind: "row", row: "front" }))).toBe("FRONT");
    expect(compactIntentTarget(base({ kind: "row", row: "back" }))).toBe("BACK");
    expect(compactIntentTarget(base({ kind: "both-rows" }))).toBe("BOTH");
    expect(compactIntentTarget(base({ kind: "hero", heroId: "rat-king", row: "front" }))).toBe(
      "RK · FRONT"
    );
    expect(compactIntentTarget(base({ kind: "hero", heroId: "old-man", row: "back" }))).toBe(
      "OM · BACK"
    );
  });

  it("keeps the required row on named compact tokens so evade conditions stay visible", () => {
    const namedFront: IntentPreview = {
      enemyId: "hunter",
      enemyName: "Hunter",
      label: "",
      target: { kind: "hero", heroId: "rat-king", row: "front" },
      rawDamage: 12,
      consequences: [],
      missIfEmpty: false,
      wouldMiss: false,
    };
    expect(compactIntentTarget(namedFront)).toContain("FRONT");
    expect(compactIntentTarget(namedFront)).not.toBe("RK");
    expect(chipIntentSuffix(namedFront)).toBe("RK · FRONT");
    expect(chipIntentSuffix({ ...namedFront, target: { kind: "row", row: "front" } })).toBeNull();
  });

  it("treats named intents as threatening their required row even when they would currently miss", () => {
    const intents: IntentPreview[] = [
      {
        enemyId: "a",
        enemyName: "A",
        label: "",
        target: { kind: "row", row: "back" },
        rawDamage: 8,
        consequences: [],
        missIfEmpty: true,
        wouldMiss: false,
      },
      {
        enemyId: "hunter",
        enemyName: "Hunter",
        label: "",
        target: { kind: "hero", heroId: "rat-king", row: "front" },
        rawDamage: 12,
        consequences: [],
        missIfEmpty: true,
        wouldMiss: true,
      },
    ];
    expect(threatenedRows(intents).sort()).toEqual(["back", "front"]);
  });

  it("populates a structured target on live engine previews", () => {
    const trial = createAdversarialTriangle();
    const view = playerView(trial);
    for (const intent of view.intents) {
      expect(["row", "both-rows", "hero"]).toContain(intent.target.kind);
      expect(compactIntentTarget(intent)).toMatch(/^(FRONT|BACK|BOTH|RK · FRONT|RK · BACK|OM · FRONT|OM · BACK)$/);
    }
  });

  it("preserves Hunter's Front condition on the live named-mark fight", () => {
    const view = playerView(createFight(9));
    const hunter = view.intents.find((i) => i.enemyId === "hunter");
    expect(hunter?.target).toEqual({ kind: "hero", heroId: "rat-king", row: "front" });
    expect(compactIntentTarget(hunter!)).toBe("RK · FRONT");
    expect(chipIntentSuffix(hunter!)).toBe("RK · FRONT");
    expect(threatenedRows(view.intents)).toContain("front");
  });
});
