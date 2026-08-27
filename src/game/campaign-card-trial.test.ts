import { describe, expect, it } from "vitest";
import { ENCOUNTER_TABLES, resolveEncounter } from "../data/enemies";
import {
  campaignCardReward,
  campaignCardTrialFightId,
  createCampaignCardTrialFight,
} from "./campaign-card-trial";
import { actingHero } from "./card-trial";

describe("campaign Card Trial adapter", () => {
  it("translates an authored campaign formation without changing its identity", () => {
    const entry = ENCOUNTER_TABLES[1]!.find((candidate) => candidate.id === "f1-red-bone-bounty")!;
    const resolved = resolveEncounter(entry);
    const trial = createCampaignCardTrialFight({
      floorId: 1,
      entry,
      resolved,
      seed: 7,
    });

    expect(trial.fightId).toBe(campaignCardTrialFightId(1, entry.id));
    expect(trial.fightName).toBe("Red Skeleton + Skeleton + Skeleton Archer");
    expect(trial.enemies.map((enemy) => enemy.name)).toEqual([
      "Red Skeleton",
      "Skeleton",
      "Skeleton Archer",
    ]);
    expect(trial.enemies.map((enemy) => enemy.hp)).toEqual([10, 10, 13]);
    expect(trial.enemies.map((enemy) => enemy.visualRow)).toEqual(["front", "front", "back"]);
    expect(trial.enemies.every((enemy) => enemy.cycle.length === 3)).toBe(true);
    expect(trial.queue[0]).toEqual({ kind: "hero", id: "rat-king" });
    expect(actingHero(trial)?.id).toBe("rat-king");
    expect(trial.heroes["rat-king"].hand).toHaveLength(5);
    expect(trial.telemetry.intents).toEqual([]);
  });

  it("selects a stable card reward for each authored encounter", () => {
    expect(campaignCardReward(1, "f1-red-bone-bounty")).toBe(
      campaignCardReward(1, "f1-red-bone-bounty")
    );
    expect(["open-the-rank", "crack", "from-the-dark", "split-bone"]).toContain(
      campaignCardReward(1, "f1-red-bone-bounty")
    );
  });
});
