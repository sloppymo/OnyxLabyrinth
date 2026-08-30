import { describe, expect, it } from "vitest";
import { CARD_DEFS } from "../cards";
import { ENCOUNTERS } from "../encounters";
import { createFightFromDefinition } from "./factory";
import { threatFirstPolicy } from "./policies";
import { productionFightDefinitions, productionRowAblationSuite, productionSimSuite } from "./production";
import { runFight } from "./runner";

describe("production simulator suites", () => {
  it("uses campaign physical instance decks rather than the unique-12 Arena lists", () => {
    const defs = productionFightDefinitions();
    expect(defs).toHaveLength(ENCOUNTERS.length);
    const rk = defs[0]!.decks["rat-king"];
    const om = defs[0]!.decks["old-man"];
    expect(rk).toHaveLength(12);
    expect(om).toHaveLength(12);
    expect(rk.every((entry) => typeof entry === "object" && entry.uid.startsWith("starter:rat-king:"))).toBe(true);
    expect(om.every((entry) => typeof entry === "object" && entry.uid.startsWith("starter:old-man:"))).toBe(true);
    expect(new Set(rk.map((entry) => typeof entry === "object" ? entry.defId : entry)).size).toBe(8);
    expect(defs[9]?.enemies[0]?.isBoss).toBe(true);
    expect(CARD_DEFS.nip.text).toBe("Deal 5.");
  });

  it("builds a paired full-versus-no-row scenario for every encounter", () => {
    const suite = productionRowAblationSuite();
    expect(suite.scenarios).toHaveLength(10);
    for (const scenario of suite.scenarios) {
      expect(scenario.baseline.rowMode ?? "full").toBe("full");
      expect(scenario.variant?.rowMode).toBe("none");
      expect(scenario.variant?.enemies).toEqual(scenario.baseline.enemies);
      expect(scenario.variant?.decks).toEqual(scenario.baseline.decks);
    }
  });

  it("also exposes a production-only suite for policy baselines", () => {
    const suite = productionSimSuite();
    expect(suite.scenarios.every((scenario) => !scenario.variant)).toBe(true);
    expect(suite.scenarios.map((scenario) => scenario.name)).toEqual(
      ENCOUNTERS.map((encounter) => encounter.name),
    );
  });
});

describe("production campaign decks at runtime", () => {
  it("plays Fight Dirty through a draft pick without timing out", () => {
    const def = productionFightDefinitions()[0]!;
    const s = createFightFromDefinition({
      ...def,
      id: "draft-runtime",
      setup: { hands: { "rat-king": ["fight-dirty"] } },
    });
    const record = runFight(s, { policy: threatFirstPolicy(), maxRounds: 8, maxActions: 80 });
    expect(record.illegalActions).toBe(0);
    expect(record.actions.some((a) => a.action.kind === "draft")).toBe(true);
  });
});

