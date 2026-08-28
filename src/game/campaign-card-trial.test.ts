import { describe, expect, it } from "vitest";
import { ENCOUNTER_TABLES, resolveEncounter } from "../data/enemies";
import {
  campaignCardReward,
  campaignCardTrialFightId,
  createCampaignCardTrialFight,
} from "./campaign-card-trial";
import { actingHero } from "./card-trial";
import {
  activeCampaignDeck,
  createCampaignCardProgress,
  encounterRewardInstance,
  grantCampaignCard,
  swapCampaignDeckCard,
  unusedCampaignCards,
} from "./campaign-cards";

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

  it("deals from the campaign's persistent physical decks", () => {
    const entry = ENCOUNTER_TABLES[1]!.find((candidate) => candidate.id === "f1-red-bone-bounty")!;
    const progress = createCampaignCardProgress();
    grantCampaignCard(progress, encounterRewardInstance(1, entry.id, "crack"));
    const incoming = unusedCampaignCards(progress, "old-man")[0]!;
    const outgoing = progress["old-man"].activeDeck.find((id) => id.endsWith(":staff"))!;
    expect(swapCampaignDeckCard(progress, "old-man", outgoing, incoming.instanceId)).toBe(true);

    const trial = createCampaignCardTrialFight({
      floorId: 1,
      entry,
      resolved: resolveEncounter(entry),
      seed: 7,
      cardProgress: progress,
    });

    for (const heroId of ["rat-king", "old-man"] as const) {
      const hero = trial.heroes[heroId];
      const combatIds = [...hero.hand, ...hero.draw, ...hero.discard].map((card) => card.uid).sort();
      const persistentIds = activeCampaignDeck(progress, heroId)
        .map((card) => card.instanceId)
        .sort();
      expect(combatIds).toEqual(persistentIds);
    }
    expect(trial.heroes["rat-king"].hand).toHaveLength(5);
    expect(trial.heroes["old-man"].hand).toHaveLength(0);
    expect(trial.heroes["old-man"].draw.some((card) => card.uid === incoming.instanceId)).toBe(true);
  });
});
