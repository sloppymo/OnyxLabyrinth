import type { CardTrialPlayerView, CardTrialState } from "../types";
import type { HeadlessAction } from "./legal-actions";

export interface PolicyContext {
  view: CardTrialPlayerView;
  legalActions: HeadlessAction[];
  rng: () => number;
  /** Search policies only. Clones the live rules state. */
  fork?: () => CardTrialState;
}

export type CardTrialPolicy = (context: PolicyContext) => HeadlessAction;
