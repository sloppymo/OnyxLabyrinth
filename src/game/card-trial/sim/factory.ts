import { CARD_DEFS } from "../cards";
import { assembleFight } from "../engine";
import type { ExtraCardDef } from "../types";
import { hashScenarioId, type FightDefinition, type FightEnemyDefinition } from "./definition";
import { adaptFightDefinitionForRows } from "./row-ablation";

export type { FightDefinition, FightEnemyDefinition } from "./definition";
export { hashScenarioId } from "./definition";

function normalizeEnemy(e: FightEnemyDefinition) {
  return {
    id: e.id,
    name: e.name,
    maxHp: e.maxHp,
    visualRow: e.visualRow,
    spriteId: e.spriteId ?? "training-dummy",
    cycle: e.cycle,
    slot: e.slot,
    order: e.order,
    isBoss: e.isBoss,
  };
}

function rulesetFromExtra(
  extra: Record<string, ExtraCardDef> | undefined,
  rowMode: FightDefinition["rowMode"],
  noRowIntentTargeting: FightDefinition["noRowIntentTargeting"],
) {
  if (!extra && (rowMode ?? "full") === "full") return null;
  const cards: Record<string, ExtraCardDef> = {};
  for (const [id, def] of Object.entries(extra ?? {})) {
    if (Object.prototype.hasOwnProperty.call(CARD_DEFS, id)) {
      throw new Error(`extraCards cannot override production card "${id}"`);
    }
    if (def.id !== id) {
      throw new Error(`extraCards key "${id}" does not match def.id "${def.id}"`);
    }
    cards[id] = def;
  }
  return { cards, rowMode: rowMode ?? "full", noRowIntentTargeting };
}

export function createFightFromDefinition(
  def: FightDefinition,
  options?: { shuffleKey?: string },
) {
  const adapted = adaptFightDefinitionForRows(def);
  const decks = {
    "rat-king": [...adapted.decks["rat-king"]],
    "old-man": [...adapted.decks["old-man"]],
  };
  return assembleFight({
    fightId: hashScenarioId(options?.shuffleKey ?? adapted.id),
    fightName: adapted.name,
    seed: adapted.seed ?? 1,
    enemies: adapted.enemies.map(normalizeEnemy),
    decks,
    setup: adapted.setup,
    ruleset: rulesetFromExtra(
      adapted.extraCards,
      adapted.rowMode,
      adapted.noRowIntentTargeting,
    ),
  });
}
