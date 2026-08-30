import { ENCOUNTERS } from "../encounters";
import { activeCampaignDeck, createCampaignCardProgress } from "../../campaign-cards";
import type { FightDefinition } from "./definition";
import type { CardTrialSimConfig } from "./experiment";

function campaignProductionDecks(): FightDefinition["decks"] {
  const progress = createCampaignCardProgress();
  return {
    "rat-king": activeCampaignDeck(progress, "rat-king").map((card) => ({
      uid: card.instanceId,
      defId: card.cardId,
    })),
    "old-man": activeCampaignDeck(progress, "old-man").map((card) => ({
      uid: card.instanceId,
      defId: card.cardId,
    })),
  };
}

/** The locked production encounters expressed as simulator definitions. */
export function productionFightDefinitions(): FightDefinition[] {
  const decks = campaignProductionDecks();
  return ENCOUNTERS.map((encounter) => ({
    id: `production-encounter-${encounter.id}`,
    name: encounter.name,
    decks: {
      "rat-king": [...decks["rat-king"]],
      "old-man": [...decks["old-man"]],
    },
    enemies: encounter.enemies,
  }));
}

/** A reusable suite for matched policy and row-ablation runs. */
export function productionSimSuite(): CardTrialSimSuiteConfig {
  return {
    id: "production-encounters",
    name: "Production Card Trial encounters",
    notes:
      "Campaign starter decks (8 unique / 12 physical instances) and the ten Arena-only encounter definitions. Prior win-rate figures from unique-12 prototype decks are obsolete.",
    scenarios: productionFightDefinitions().map((baseline) => ({
      id: baseline.id,
      name: baseline.name,
      baseline,
    })),
  };
}

/**
 * Paired production-vs-no-row suite. The variant keeps each encounter's
 * enemies, decks, and seed while changing only the simulator row mode.
 */
export function productionRowAblationSuite(): CardTrialSimSuiteConfig {
  return {
    id: "production-row-ablation",
    name: "Production Card Trial: rows versus no rows",
    notes: "Simulator-only ablation; production rules and cards are unchanged. Previous ablation figures are obsolete.",
    scenarios: productionFightDefinitions().map((baseline) => ({
      id: `${baseline.id}-row-ablation`,
      name: `${baseline.name}: full versus no rows`,
      baseline,
      variant: {
        ...baseline,
        id: `${baseline.id}-no-row`,
        name: `${baseline.name}: no rows`,
        rowMode: "none" as const,
      },
    })),
  };
}

export interface CardTrialSimSuiteConfig {
  id: string;
  name: string;
  notes?: string;
  scenarios: readonly CardTrialSimConfig[];
}
