/**
 * Presentation-only copy for Card Trial intents.
 * Does not change damage, Guard, or targeting rules.
 */

import type { CardTrialPlayerView, IntentPreview } from "../game/card-trial/types";

export const INTENT_ATK_LABEL = "ATK";
export const GUARD_LABEL = "Guard";

export function compactIntentValue(intent: IntentPreview): string {
  return intent.wouldMiss ? "—" : String(intent.rawDamage);
}

export interface IntentHpLine {
  heroName: string;
  rawDamage: number;
  guard: number;
  hpLoss: number;
  lethal: boolean;
  miss: boolean;
}

export function intentHpLines(
  intent: IntentPreview,
  heroes: CardTrialPlayerView["heroes"]
): IntentHpLine[] {
  return intent.consequences.map((c) => {
    const hero = heroes.find((h) => h.id === c.heroId);
    return {
      heroName: c.heroName,
      rawDamage: intent.rawDamage,
      guard: hero?.guard ?? 0,
      hpLoss: c.postGuard,
      lethal: c.lethal,
      miss: c.miss,
    };
  });
}

/** Compact hold-for-details body. Never reports raw incoming as HP loss. */
export function intentDetailLines(
  intent: IntentPreview,
  heroes: CardTrialPlayerView["heroes"]
): string[] {
  const lines: string[] = [];
  if (intent.wouldMiss) {
    lines.push("Miss — no legal target.");
    return lines;
  }
  for (const row of intentHpLines(intent, heroes)) {
    if (row.miss) continue;
    lines.push(row.heroName);
    if (row.guard > 0) {
      lines.push(`${GUARD_LABEL} ${row.guard}`);
      lines.push(`${row.rawDamage} → ${row.hpLoss} HP`);
    } else {
      lines.push(`${row.hpLoss} HP`);
    }
    if (row.lethal) lines.push(`Lethal to ${row.heroName}.`);
  }
  return lines;
}
