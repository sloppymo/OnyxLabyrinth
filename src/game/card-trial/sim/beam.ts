import type { CardTrialState } from "../types";
import { cloneFight } from "./clone";
import { legalActions, type HeadlessAction } from "./legal-actions";
import type { CardTrialPolicy } from "./policy-types";
import { applyAction } from "./runner";

function scoreState(s: CardTrialState): number {
  if (s.result === "victory") return 1_000_000 - s.round * 1_000;
  if (s.result === "wipe") return -1_000_000;
  let enemyHp = 0;
  for (const e of s.enemies) if (e.hp > 0) enemyHp += e.hp;
  const heroHp = s.heroes["rat-king"].hp + s.heroes["old-man"].hp;
  return heroHp * 8 - enemyHp * 4 + s.telemetry.turns.reduce((n, t) => n + t.damageDealt, 0);
}

function beamValue(s: CardTrialState, depth: number, width: number): number {
  if (depth <= 0 || s.result) return scoreState(s);
  const legal = legalActions(s);
  if (legal.length === 0) return scoreState(s);
  const children = legal.map((action) => {
    const child = cloneFight(s);
    applyAction(child, action);
    return { child, heuristic: scoreState(child) };
  });
  children.sort((a, b) => b.heuristic - a.heuristic);
  let best = -Infinity;
  for (const ch of children.slice(0, Math.max(1, width))) {
    best = Math.max(best, beamValue(ch.child, depth - 1, width));
  }
  return best;
}

export function beamSearchPolicy(opts?: { width?: number; depth?: number }): CardTrialPolicy {
  const width = opts?.width ?? 8;
  const depth = opts?.depth ?? 4;
  return (ctx) => {
    if (!ctx.fork || ctx.legalActions.length === 0) {
      return ctx.legalActions.find((a) => a.kind === "card")
        ?? ctx.legalActions.find((a) => a.kind === "draft")
        ?? { kind: "pass" };
    }
    const root = ctx.fork();
    let best: { action: HeadlessAction; value: number } | null = null;
    for (const action of ctx.legalActions) {
      const child = cloneFight(root);
      applyAction(child, action);
      const value = beamValue(child, Math.max(0, depth - 1), width);
      if (!best || value > best.value) best = { action, value };
    }
    return best?.action ?? { kind: "pass" };
  };
}
