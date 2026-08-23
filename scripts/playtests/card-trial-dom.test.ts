import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cardTrialActSelector,
  cardTrialCancelApplies,
  cardTrialCardSelector,
  cardTrialTargetSelector,
} from "./lib.mjs";

describe("Card Trial shared DOM selectors", () => {
  it("addresses a hand card by uid under the sparse root", () => {
    expect(cardTrialCardSelector("lunge#11")).toBe(
      `.ct-sparse button[data-uid="lunge#11"]`
    );
  });

  it("addresses an enemy chip by actor id, not coordinates", () => {
    expect(cardTrialTargetSelector("scrap-a")).toBe(
      `.ct-sparse .ct-actor-chip[data-actor="enemy:scrap-a"]`
    );
  });

  it("addresses Move and Pass by data-act only", () => {
    expect(cardTrialActSelector("move")).toBe(`.ct-sparse [data-act="move"]`);
    expect(cardTrialActSelector("pass")).toBe(`.ct-sparse [data-act="pass"]`);
  });

  it("treats Escape as target-cancel only in target phases", () => {
    expect(cardTrialCancelApplies("hand")).toBe(false);
    expect(cardTrialCancelApplies("playback")).toBe(false);
    expect(cardTrialCancelApplies("result")).toBe(false);
    expect(cardTrialCancelApplies("target")).toBe(true);
    expect(cardTrialCancelApplies("target2")).toBe(true);
  });
});

describe("Card Trial scripts share the click helpers", () => {
  function source(name: string): string {
    return readFileSync(resolve(import.meta.dirname, name), "utf8");
  }

  it("replay, capture, and fuzz import the shared helpers instead of local click copies", () => {
    const replay = source("card-trial-replay.mjs");
    const capture = source("card-trial-capture.mjs");
    const fuzz = source("card-trial-fuzz.mjs");

    for (const [name, text] of [
      ["replay", replay],
      ["capture", capture],
      ["fuzz", fuzz],
    ] as const) {
      expect(text, name).toMatch(/clickCard/);
      expect(text, name).toMatch(/selectTarget/);
      expect(text, name).toMatch(/clickAct/);
      expect(text, name).not.toMatch(/async function clickCard\(/);
      expect(text, name).not.toMatch(/async function selectTarget\(/);
    }
  });

  it("leaves the reference-agent keyboard perform() frozen", () => {
    const agent = source("card-trial-reference-agent-run.mjs");
    expect(agent).toMatch(/async function perform\(/);
    expect(agent).not.toMatch(/clickCard\(/);
    expect(agent).toMatch(/page\.keyboard\.press\(String\(idx \+ 1\)\)/);
  });
});
