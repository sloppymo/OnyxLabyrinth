/**
 * Map Card Trial rules onto the existing CombatState / CombatEvent
 * presentation types. Campaign combat math is not used.
 */

import { createCombatState } from "../game/combat";
import type { CombatEvent, CombatState, EnemyInstance } from "../game/combat-types";
import type { Character } from "../game/party";
import type { EnemyDef } from "../data/enemies";
import type { CardTrialEvent, CardTrialState, HeroId, PlayerRow } from "../game/card-trial/types";

export interface CardTrialPresentationContext {
  /** The global Opened target immediately before the resolved action. */
  openedBefore?: string | null;
}

const STATS = { str: 10, int: 10, pie: 10, vit: 10, agi: 10, luk: 10 };

function heroCharacter(
  id: HeroId,
  name: string,
  cls: Character["class"],
  slot: number,
  hp: number,
  maxHp: number
): Character {
  return {
    id,
    name,
    race: "Human",
    alignment: "Neutral",
    class: cls,
    level: 1,
    xp: 0,
    stats: { ...STATS },
    hp,
    sp: 0,
    maxHp,
    maxSp: 0,
    formationSlot: slot,
    status: [],
    knownSpellIds: [],
    perkIds: [],
  };
}

function enemyInstance(e: CardTrialState["enemies"][number]): EnemyInstance {
  const def: EnemyDef = {
    id: e.id,
    name: e.name,
    spriteId: e.spriteId,
    floors: [],
    rowPreference: e.visualRow,
    hp: e.maxHp,
    attack: 0,
    ac: 0,
    agi: 1,
    xp: 0,
    gold: 0,
    special: [],
    isBoss: !!e.isBoss,
  };
  return {
    ...def,
    instanceId: e.id,
    currentHp: Math.max(0, e.hp),
    row: e.visualRow,
    status: [],
  };
}

function slotFor(row: PlayerRow, indexInRow: number): number {
  return row === "front" ? indexInRow : 2 + indexInRow;
}

export function toCombatState(s: CardTrialState): CombatState {
  const fronts = (["rat-king", "old-man"] as const)
    .map((id) => s.heroes[id])
    .filter((h) => h.hp > 0 && h.row === "front");
  const backs = (["rat-king", "old-man"] as const)
    .map((id) => s.heroes[id])
    .filter((h) => h.hp > 0 && h.row === "back");
  const party: Character[] = [];
  fronts.forEach((h, i) => {
    party.push(
      heroCharacter(
        h.id,
        h.name,
        h.id === "rat-king" ? "Thief" : "Mage",
        slotFor("front", i),
        h.hp,
        h.maxHp
      )
    );
  });
  backs.forEach((h, i) => {
    party.push(
      heroCharacter(
        h.id,
        h.name,
        h.id === "rat-king" ? "Thief" : "Mage",
        slotFor("back", i),
        h.hp,
        h.maxHp
      )
    );
  });
  const living = s.enemies.filter((e) => e.hp > 0);
  const dead = s.enemies.filter((e) => e.hp <= 0);
  const combat = createCombatState(
    party,
    {
      front: living.filter((e) => e.visualRow === "front").map(enemyInstance),
      back: living.filter((e) => e.visualRow === "back").map(enemyInstance),
    },
    living.some((e) => e.isBoss)
  );
  combat.round = s.round;
  combat.partyFormation = {
    kind: "card-trial-rows",
    rowsByActorId: Object.fromEntries(
      (["rat-king", "old-man"] as const).map((id) => [
        id,
        {
          row: s.heroes[id].row,
          rowEnteredAt: s.heroes[id].rowEnteredAt,
        },
      ])
    ),
  };
  combat.justDied = dead.map(enemyInstance);
  combat.ended = !!s.result;
  combat.result = s.result === "victory" ? "victory" : s.result === "wipe" ? "wipe" : undefined;
  return combat;
}

export function toCombatEvents(
  events: CardTrialEvent[],
  state: CardTrialState,
  context: CardTrialPresentationContext = {}
): CombatEvent[] {
  const out: CombatEvent[] = [];
  for (const e of events) {
    if (e.type === "attack" || e.type === "rat-bite") {
      const actorId = e.type === "rat-bite" ? "rat-king" : e.actorId;
      out.push({ type: "attack", actorId, targetId: e.targetId, damage: e.damage });
    } else if (e.type === "guard") {
      out.push({ type: "defend", actorId: e.actorId, amount: e.amount });
    } else if (e.type === "defeated") {
      out.push({ type: "defeated", targetId: e.targetId, wasEnemy: e.wasEnemy });
    } else if (e.type === "banner") {
      out.push({
        type: "cast",
        actorId: e.actorId ?? "rat-king",
        spellId: e.text,
        targetId: null,
      });
    } else if (e.type === "hero-move") {
      out.push({
        type: "partyRowMove",
        actorId: e.actorId,
        row: e.row,
        rowEnteredAt: state.heroes[e.actorId].rowEnteredAt,
      });
    } else if (e.type === "spawn-rat" || e.type === "rat-move") {
      out.push({
        type: "cast",
        actorId: "rat-king",
        spellId: e.type === "spawn-rat" ? "Rat" : "Send the Rat",
        targetId: null,
        cardPresentation: "rat",
      });
    } else if (e.type === "intent-hit") {
      out.push({
        type: "attack",
        actorId: e.enemyId,
        targetId: e.targetId,
        damage: e.damage,
        absorbed: e.absorbed,
      });
    } else if (e.type === "intent-miss") {
      out.push({ type: "miss", actorId: e.enemyId, targetId: e.enemyId, reason: "noTarget" });
    } else if (e.type === "open" || e.type === "consume") {
      out.push({
        type: "spellEffect",
        spellId: e.type === "open" ? "Opened" : "Consume Opened",
        targetId: e.targetId,
        isDebuff: e.type === "open",
        cardPresentation: e.type === "open" ? "opened" : "consume-opened",
        cardPresentationSourceId:
          e.type === "open" && context.openedBefore && context.openedBefore !== e.targetId
            ? context.openedBefore
            : undefined,
      });
    }
  }
  return out;
}

export function spellNameFor(id: string): string {
  return id;
}

export function techniqueNameFor(): string {
  return "";
}
