import type { FightDefinition } from "./definition";
import type { ExtraCardDef } from "../types";
import { createFightFromDefinition } from "./factory";
import { legalActions, type HeadlessAction } from "./legal-actions";
import { applyAction, runFight, type FightRunRecord, type StateFeatureCoverage } from "./runner";
import {
  beamSearchPolicy,
  fixedPolicy,
  frontAwarePolicy,
  guardAwarePolicy,
  openedAwarePolicy,
  passPolicy,
  randomLegalPolicy,
  threatFirstPolicy,
} from "./policies";
import { collectMetrics, actionDiversity, type SimFightMetrics } from "./metrics";
import { comparePaired, summarizeArm } from "./compare";
import { dominanceReport } from "./dominance";
import {
  parseSeeds,
  policyForName,
  runExperiment,
  type CardTrialSimConfig,
  type SimPolicyName,
} from "./experiment";
import { cloneFight } from "./clone";
import {
  adaptFightDefinitionForRows,
  NO_ROW_CARD_ALIASES,
  NO_ROW_CARD_PREFIX,
  NO_ROW_CARDS,
  noRowCardId,
} from "./row-ablation";
import {
  emptyRowCounterfactual,
  measureRowCounterfactual,
  type RowCounterfactualMetrics,
} from "./row-value";
import {
  productionFightDefinitions,
  productionRowAblationSuite,
  productionSimSuite,
  type CardTrialSimSuiteConfig,
} from "./production";

export type {
  FightDefinition,
  ExtraCardDef,
  HeadlessAction,
  FightRunRecord,
  StateFeatureCoverage,
  SimFightMetrics,
  CardTrialSimConfig,
  SimPolicyName,
  RowCounterfactualMetrics,
  CardTrialSimSuiteConfig,
};
export type { CardTrialRowMode, NoRowIntentTargeting } from "../types";
export {
  createFightFromDefinition,
  legalActions,
  applyAction,
  runFight,
  collectMetrics,
  actionDiversity,
  comparePaired,
  summarizeArm,
  dominanceReport,
  parseSeeds,
  policyForName,
  runExperiment,
  cloneFight,
  adaptFightDefinitionForRows,
  NO_ROW_CARD_ALIASES,
  NO_ROW_CARD_PREFIX,
  NO_ROW_CARDS,
  noRowCardId,
  emptyRowCounterfactual,
  measureRowCounterfactual,
  productionFightDefinitions,
  productionRowAblationSuite,
  productionSimSuite,
  beamSearchPolicy,
  fixedPolicy,
  frontAwarePolicy,
  guardAwarePolicy,
  openedAwarePolicy,
  passPolicy,
  randomLegalPolicy,
  threatFirstPolicy,
};
