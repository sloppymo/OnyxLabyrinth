/**
 * Declarative extra-card effects for headless Card Trial experiments.
 * Production cards stay in cards.ts + resolveCardEffect(); extra ids never
 * enter CARD_DEFS.
 */

import type {
  ExtraCardEffect,
  ExtraEffectCondition,
  PlayerRow,
} from "./types";

export type {
  ExtraCardDef,
  ExtraCardEffect,
  ExtraEffectCondition,
  ExtraEffectTarget,
  CardTrialRuleset,
} from "./types";

export interface DeclarativeEffectApi {
  heroRow(): PlayerRow;
  primary(): { id: string; hp: number } | undefined;
  second(): { id: string; hp: number } | undefined;
  living(): Array<{ id: string; hp: number }>;
  openedPrimary(): boolean;
  ratExists(): boolean;
  intentAimsAtHeroRow(): boolean;
  hit(enemyId: string, amount: number): void;
  bite(enemyId: string, amount: number): void;
  open(enemyId: string): void;
  consume(enemyId: string): void;
  guard(amount: number): void;
  moveHero(row: PlayerRow | "other"): void;
  spawnRat(): void;
  moveRat(): void;
}

function conditionMet(when: ExtraEffectCondition, api: DeclarativeEffectApi): boolean {
  switch (when.kind) {
    case "row":
      return api.heroRow() === when.row;
    case "opened-primary":
      return api.openedPrimary();
    case "rat-exists":
      return api.ratExists();
    case "rat-missing":
      return !api.ratExists();
    case "intent-aims-at-row":
      return api.intentAimsAtHeroRow();
    case "hp-at-most": {
      const who = when.who ?? "primary";
      const enemy = who === "primary" ? api.primary() : undefined;
      return !!enemy && enemy.hp <= when.amount;
    }
  }
}

export function applyDeclarativeEffects(
  effects: readonly ExtraCardEffect[],
  api: DeclarativeEffectApi
): void {
  const locked = effects.filter((fx) => fx.kind === "consume");
  const rest = effects.filter((fx) => fx.kind !== "consume");
  for (const fx of [...locked, ...rest]) {
    switch (fx.kind) {
      case "damage": {
        const who = fx.target ?? "primary";
        if (who === "primary") {
          const t = api.primary();
          if (t) api.hit(t.id, fx.amount);
        } else if (who === "all") {
          for (const e of api.living()) api.hit(e.id, fx.amount);
        } else if (who === "others") {
          const primaryId = api.primary()?.id;
          for (const e of api.living()) {
            if (e.id !== primaryId) api.hit(e.id, fx.amount);
          }
        } else {
          const t = api.second();
          if (t) api.hit(t.id, fx.amount);
        }
        break;
      }
      case "guard":
        api.guard(fx.amount);
        break;
      case "open": {
        const t = api.primary();
        if (t && t.hp > 0) api.open(t.id);
        break;
      }
      case "consume": {
        const t = api.primary();
        if (t) api.consume(t.id);
        break;
      }
      case "move":
        api.moveHero(fx.row);
        break;
      case "spawn-rat":
        api.spawnRat();
        break;
      case "move-rat":
        api.moveRat();
        break;
      case "rat-bite": {
        const t = api.primary();
        if (t) api.bite(t.id, fx.amount);
        break;
      }
      case "if":
        if (conditionMet(fx.when, api)) applyDeclarativeEffects(fx.then, api);
        break;
    }
  }
}
