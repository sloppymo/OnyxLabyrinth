/** Shared presentation policy for legacy and library bark events. */

import { BARK_PRIORITY } from "./combat-barks";
import type { CombatBarkTrigger } from "./combat-bark-library/types";

/** The library deliberately uses a separate scale above the legacy 1/2/3 scale. */
export const LIBRARY_BARK_PRIORITY: Readonly<Partial<Record<CombatBarkTrigger, number>>> = {
  death: 100,
  ko: 100,
  bossPhase: 95,
  chemistryResolve: 90,
  chemistryBreak: 90,
  chemistryTelegraph: 85,
  guardIntercept: 85,
  guardActivated: 84,
  takeHeavyHit: 80,
  criticalHit: 72,
  kill: 70,
  enemyDefeated: 70,
  chemistrySelected: 68,
  abilityUse: 60,
  spellCast: 60,
  healCast: 58,
  revived: 58,
  combatStart: 52,
  allyDefeated: 50,
  lowHp: 48,
  healed: 42,
  takeHit: 24,
  attackMiss: 22,
  basicAttack: 20,
  rare: 18,
};

export function barkPriority(
  trigger: CombatBarkTrigger,
  source: "legacy" | "library" = "legacy"
): number {
  if (source === "library") return LIBRARY_BARK_PRIORITY[trigger] ?? 10;
  if (trigger in BARK_PRIORITY) {
    return BARK_PRIORITY[trigger as keyof typeof BARK_PRIORITY] ?? 1;
  }
  return LIBRARY_BARK_PRIORITY[trigger] ?? 10;
}

export function barkLandmarkForTrigger(trigger: CombatBarkTrigger):
  | "anticipation"
  | "release"
  | "contact"
  | "reaction"
  | "settle" {
  if (trigger === "spellCast" || trigger === "healCast" || trigger === "abilityUse") return "release";
  if (trigger === "takeHit" || trigger === "takeHeavyHit" || trigger === "criticalHit" || trigger === "guardIntercept") return "reaction";
  if (trigger === "death" || trigger === "ko" || trigger === "victory" || trigger === "enemyDefeated") return "settle";
  return "anticipation";
}

/** Library lines should be readable without freezing the combat queue. */
export function barkDurationMs(text: string, source: "legacy" | "library" = "legacy"): number {
  if (source === "legacy") return 1900;
  return Math.min(1500, Math.max(700, 360 + text.length * 38));
}
