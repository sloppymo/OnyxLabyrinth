import type {
  CardTrialDeckEntry,
  CardTrialRowMode,
  ExtraCardDef,
  HeroId,
  Intent,
  NoRowIntentTargeting,
  PlayerRow,
} from "../types";
import type { FightSetup } from "../engine";

export type { FightSetup };

export interface FightEnemyDefinition {
  id: string;
  name: string;
  maxHp: number;
  visualRow: "front" | "back";
  cycle: Intent[];
  slot: "fast" | "slow";
  order: number;
  /** Presentation-only. Defaults to training-dummy for headless fights. */
  spriteId?: string;
  isBoss?: boolean;
}

export interface FightDefinition {
  id: string;
  name: string;
  seed?: number;
  decks: Record<HeroId, readonly CardTrialDeckEntry[]>;
  enemies: readonly FightEnemyDefinition[];
  setup?: FightSetup;
  extraCards?: Record<string, ExtraCardDef>;
  /** Simulator-only ablation. Omitted means the production row rules. */
  rowMode?: CardTrialRowMode;
  /** How row-targeted enemy intents behave when `rowMode` is `none`. */
  noRowIntentTargeting?: NoRowIntentTargeting;
}

/** Stable numeric fightId so shuffle mixing stays deterministic per scenario id. */
export function hashScenarioId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const n = h >>> 0;
  return n === 0 ? 1 : n;
}

export type { PlayerRow };
