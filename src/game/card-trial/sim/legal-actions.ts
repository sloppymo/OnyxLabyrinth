import {
  actingHero,
  canPaidMove,
  legalSecondTargetIds,
  playerView,
} from "../engine";
import type { DraftChoiceId, CardTrialState } from "../types";

export type HeadlessAction =
  | { kind: "card"; cardUid: string; targetId?: string; secondTargetId?: string }
  | { kind: "move" }
  | { kind: "pass" }
  | { kind: "draft"; choiceId: DraftChoiceId };

export function legalActions(s: CardTrialState): HeadlessAction[] {
  if (s.result || s.phase !== "hero-turn") return [];
  const hero = actingHero(s);
  if (!hero) return [];

  if (s.draft) {
    return s.draft.choices
      .filter((choice) => hero.energy >= choice.cost)
      .map((choice) => ({ kind: "draft" as const, choiceId: choice.id }));
  }

  const view = playerView(s);
  const living = view.enemies.filter((e) => !e.dead);
  const actions: HeadlessAction[] = [{ kind: "pass" }];
  if (canPaidMove(s).ok) actions.push({ kind: "move" });

  for (const card of view.hand) {
    if (card.disabled) continue;
    if (card.target === "none" || card.target === "all-enemies") {
      actions.push({ kind: "card", cardUid: card.uid });
      continue;
    }
    for (const enemy of living) {
      if (card.consume === "second-enemy" && view.openedEnemyId === enemy.id) {
        const seconds = legalSecondTargetIds(s.enemies, enemy.id);
        if (seconds.length > 0) {
          for (const secondTargetId of seconds) {
            actions.push({
              kind: "card",
              cardUid: card.uid,
              targetId: enemy.id,
              secondTargetId,
            });
          }
          continue;
        }
      }
      actions.push({ kind: "card", cardUid: card.uid, targetId: enemy.id });
    }
  }
  return actions;
}

export function actionKey(action: HeadlessAction): string {
  if (action.kind === "pass") return "pass";
  if (action.kind === "move") return "move";
  if (action.kind === "draft") return `draft:${action.choiceId}`;
  return `card:${action.cardUid}:${action.targetId ?? ""}:${action.secondTargetId ?? ""}`;
}
