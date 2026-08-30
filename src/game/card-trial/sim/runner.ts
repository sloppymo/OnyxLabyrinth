import {
  actingHero,
  canPaidMove,
  endHeroTurn,
  paidMove,
  playCard,
  playerView,
  resolveDraftChoice,
} from "../engine";
import type { CardTrialEvent, CardTrialState, HeroId } from "../types";
import { actionKey, legalActions, type HeadlessAction } from "./legal-actions";
import type { CardTrialPolicy } from "./policy-types";
import { cloneFight } from "./clone";
import { createShuffleStream } from "../rng";
import {
  addRowCounterfactual,
  emptyRowCounterfactual,
  measureRowCounterfactual,
  type RowCounterfactualMetrics,
} from "./row-value";

export interface ApplyActionResult {
  ok: boolean;
  reason?: string;
  events: CardTrialEvent[];
}

export type SimOutcome = "victory" | "wipe" | "timeout";

export interface StateFeatureCoverage {
  openedTurns: number;
  hushTurns: number;
  crownedTurns: number;
  omenTurns: number;
  ratTurns: number;
  frontRowTurns: number;
  lowHpTurns: number;
  multiEnemyTurns: number;
}

export function emptyStateFeatureCoverage(): StateFeatureCoverage {
  return {
    openedTurns: 0,
    hushTurns: 0,
    crownedTurns: 0,
    omenTurns: 0,
    ratTurns: 0,
    frontRowTurns: 0,
    lowHpTurns: 0,
    multiEnemyTurns: 0,
  };
}

function sampleStateFeatures(view: ReturnType<typeof playerView>, coverage: StateFeatureCoverage): void {
  if (view.openedEnemyId) coverage.openedTurns += 1;
  if (view.enemies.some((e) => e.hushed && !e.dead)) coverage.hushTurns += 1;
  if (view.crownedEnemyId) coverage.crownedTurns += 1;
  if (view.omen) coverage.omenTurns += 1;
  if (view.ratRow) coverage.ratTurns += 1;
  if (view.heroes.some((h) => !h.dead && h.row === "front")) coverage.frontRowTurns += 1;
  if (view.heroes.some((h) => !h.dead && h.hp < 20)) coverage.lowHpTurns += 1;
  if (view.enemies.filter((e) => !e.dead).length > 1) coverage.multiEnemyTurns += 1;
}

export interface FightRunRecord {
  outcome: SimOutcome;
  rounds: number;
  heroTurns: number;
  actions: Array<{ hero: HeroId; action: HeadlessAction; key: string }>;
  illegalActions: number;
  damageDealt: number;
  hpRemaining: { "rat-king": number; "old-man": number };
  rowCounterfactual: RowCounterfactualMetrics;
  stateCoverage: StateFeatureCoverage;
}

export interface RunFightOptions {
  policy: CardTrialPolicy;
  maxRounds?: number;
  maxActions?: number;
  rngSeed?: number;
  /** Expensive simulator-only branch measurement; off unless requested. */
  measureRowValue?: boolean;
}

export function applyAction(s: CardTrialState, action: HeadlessAction): ApplyActionResult {
  if (action.kind === "draft") {
    return resolveDraftChoice(s, action.choiceId);
  }
  if (action.kind === "pass") {
    if (s.draft) return { ok: false, reason: "Choose a draft card", events: [] };
    const events = endHeroTurn(s);
    return { ok: true, events };
  }
  if (action.kind === "move") {
    return paidMove(s);
  }
  return playCard(s, action.cardUid, {
    targetId: action.targetId,
    secondTargetId: action.secondTargetId,
  });
}

export function runFight(s: CardTrialState, opts: RunFightOptions): FightRunRecord {
  const maxRounds = opts.maxRounds ?? 20;
  const maxActions = opts.maxActions ?? 400;
  const stream = createShuffleStream((opts.rngSeed ?? s.seed) * 7919 + 3);
  const rng = () => stream.nextUnit();
  const actions: FightRunRecord["actions"] = [];
  const rowCounterfactual = emptyRowCounterfactual();
  const stateCoverage = emptyStateFeatureCoverage();
  let illegalActions = 0;
  let heroTurns = 0;
  let lastTurnKey = "";

  while (!s.result) {
    if (s.round > maxRounds || actions.length >= maxActions) {
      return finish("timeout");
    }
    if (s.phase !== "hero-turn") break;
    const hero = actingHero(s);
    if (!hero) break;
    const turnKey = `${s.round}:${hero.id}:${s.queueIndex}`;
    if (turnKey !== lastTurnKey) {
      heroTurns += 1;
      lastTurnKey = turnKey;
    }
    const legal = legalActions(s);
    if (opts.measureRowValue) {
      addRowCounterfactual(
        rowCounterfactual,
        measureRowCounterfactual(s, legal, applyAction),
      );
    }
    const view = playerView(s);
    sampleStateFeatures(view, stateCoverage);
    const picked = opts.policy({ view, legalActions: legal, rng, fork: () => cloneFight(s) });
    const allowed = legal.some((a) => actionKey(a) === actionKey(picked));
    if (!allowed) {
      illegalActions += 1;
      return finish("timeout");
    }
    const result = applyAction(s, picked);
    if (!result.ok) {
      illegalActions += 1;
      return finish("timeout");
    }
    actions.push({ hero: hero.id, action: picked, key: actionKey(picked) });
  }

  function finish(outcome: SimOutcome): FightRunRecord {
    const resolved: SimOutcome =
      outcome === "timeout"
        ? "timeout"
        : s.result === "victory"
          ? "victory"
          : s.result === "wipe"
            ? "wipe"
            : "timeout";
    const damageDealt = s.telemetry.turns.reduce((n, t) => n + t.damageDealt, 0) + (s.openTurn?.damageDealt ?? 0);
    return {
      outcome: s.result === "victory" ? "victory" : s.result === "wipe" ? "wipe" : resolved,
      rounds: s.round,
      heroTurns,
      actions,
      illegalActions,
      damageDealt,
      hpRemaining: {
        "rat-king": s.heroes["rat-king"].hp,
        "old-man": s.heroes["old-man"].hp,
      },
      rowCounterfactual,
      stateCoverage,
    };
  }

  if (s.result === "victory") return finish("victory");
  if (s.result === "wipe") return finish("wipe");
  return finish("timeout");
}

export { canPaidMove };
