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

/**
 * Compact target token. Named (hero) intents MUST include the required row —
 * that row is the evade condition. Never shorten them to RK/OM alone.
 */
export function compactIntentTarget(intent: IntentPreview): string {
  const t = intent.target;
  if (t.kind === "both-rows") return "BOTH";
  if (t.kind === "row") return t.row === "front" ? "FRONT" : "BACK";
  const who = t.heroId === "rat-king" ? "RK" : "OM";
  const row = t.row === "front" ? "FRONT" : "BACK";
  return `${who} · ${row}`;
}

/** Enemy-chip suffix. Row/both-rows are spatial; only named intents stay on the chip. */
export function chipIntentSuffix(intent: IntentPreview): string | null {
  return intent.target.kind === "hero" ? compactIntentTarget(intent) : null;
}

/** Rows the floor cue should mark. Named misses still threaten their required row. */
export function threatenedRows(intents: IntentPreview[]): Array<"front" | "back"> {
  const rows = new Set<"front" | "back">();
  for (const intent of intents) {
    const t = intent.target;
    if (t.kind === "both-rows") {
      rows.add("front");
      rows.add("back");
    } else {
      rows.add(t.row);
    }
  }
  return [...rows];
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
