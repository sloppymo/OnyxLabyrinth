/**
 * Map Card Trial rules onto the existing CombatState / CombatEvent
 * presentation types. Campaign combat math is not used.
 */

import { createCombatState } from "../game/combat";
import { CARD_DEFS } from "../game/card-trial/cards";
import type { CombatEvent, CombatState, EnemyInstance } from "../game/combat-types";
import type { Character } from "../game/party";
import type { EnemyDef } from "../data/enemies";
import type { CardId, CardTrialEvent, CardTrialState, HeroId, PlayerRow } from "../game/card-trial/types";

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
  // A card banner is emitted immediately before that card's damage/support
  // events. Remember the id only for this adapter pass so Old Man damage can
  // become a spell presentation without changing Card Trial's rules events.
  let activeCardId: CardId | null = null;
  for (const e of events) {
    if (e.type === "attack" || e.type === "rat-bite") {
      const actorId = e.type === "rat-bite" ? "rat-king" : e.actorId;
      if (e.type === "attack" && actorId === "old-man" && activeCardId) {
        out.push({
          type: "spellEffect",
          spellId: activeCardId,
          actorId,
          targetId: e.targetId,
          damage: e.damage,
          cardPresentation: "card-spell",
        });
      } else {
        out.push({ type: "attack", actorId, targetId: e.targetId, damage: e.damage });
      }
    } else if (e.type === "guard") {
      out.push({ type: "defend", actorId: e.actorId, amount: e.amount });
    } else if (e.type === "defeated") {
      out.push({ type: "defeated", targetId: e.targetId, wasEnemy: e.wasEnemy });
    } else if (e.type === "banner") {
      out.push({
        type: "cast",
        actorId: e.actorId ?? "rat-king",
        spellId: e.cardId ?? e.text,
        targetId: null,
        cardPresentation:
          e.actorId === "old-man" && e.cardId ? "card-spell" : undefined,
      });
      activeCardId = e.cardId ?? null;
    } else if (e.type === "hero-move") {
      out.push({
        type: "partyRowMove",
        actorId: e.actorId,
        row: e.row,
        rowEnteredAt: state.heroes[e.actorId].rowEnteredAt,
      });
    } else if (e.type === "spawn-rat" || e.type === "rat-move" || e.type === "rat-consumed") {
      out.push({
        type: "cast",
        actorId: "rat-king",
        spellId:
          e.type === "spawn-rat" ? "Rat" : e.type === "rat-move" ? "Send the Rat" : "Consume the Rat",
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
    } else if (
      e.type === "hush-applied" ||
      e.type === "hush-triggered" ||
      e.type === "omen-armed" ||
      e.type === "omen-triggered" ||
      e.type === "omen-fizzled" ||
      e.type === "crowned" ||
      e.type === "crown-cleared" ||
      e.type === "crown-tribute"
    ) {
      const cardPresentation =
        e.type === "hush-applied"
          ? "hush"
          : e.type === "hush-triggered"
            ? "hush-trigger"
            : e.type === "omen-armed"
              ? "omen"
            : e.type === "omen-triggered"
              ? "omen-trigger"
              : e.type === "omen-fizzled"
                ? "omen-fizzle"
                : e.type === "crowned"
                  ? "crowned"
                  : e.type === "crown-cleared"
                    ? "crown-cleared"
                    : "crown-tribute";
      out.push({
        type: "spellEffect",
        spellId: e.type.startsWith("hush")
          ? "Hush"
          : e.type.startsWith("omen")
            ? "Omen"
            : e.type === "crown-tribute"
              ? "Crown Tribute"
              : "Crown",
        actorId: e.type === "crown-tribute" ? "rat-king" : "rat-king",
        targetId: e.targetId,
        damage: e.type === "omen-triggered"
          ? e.damage
          : e.type === "crown-tribute"
            ? e.amount
            : undefined,
        isBuff: e.type === "crown-tribute",
        isDebuff: e.type === "crown-cleared",
        cardPresentation,
      });
    }
  }
  return out;
}

export function spellNameFor(id: string): string {
  return CARD_DEFS[id as CardId]?.name ?? id;
}

export function techniqueNameFor(): string {
  return "";
}
