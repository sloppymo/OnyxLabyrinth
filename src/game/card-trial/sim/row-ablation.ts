import type { CardTrialDeckEntry, ExtraCardDef, HeroId } from "../types";
import type { FightDefinition } from "./definition";

/**
 * No-row aliases deliberately live outside CARD_DEFS. They make the ablation
 * visible in traces and prevent an experiment from silently changing the
 * production cards.
 */
export const NO_ROW_CARD_PREFIX = "no-row:";

const NO_ROW_HEROES: Record<string, HeroId> = {
  tide: "rat-king",
  lunge: "rat-king",
  "king-of-the-heap": "rat-king",
  "from-the-dark": "rat-king",
  litter: "rat-king",
  "send-the-rat": "rat-king",
  "the-threshold": "old-man",
  "distant-hand": "old-man",
  "parting-word": "old-man",
  "last-bastion": "old-man",
};

const noRowCard = (
  sourceId: string,
  partial: Omit<ExtraCardDef, "id" | "hero">,
): ExtraCardDef => ({
  id: `${NO_ROW_CARD_PREFIX}${sourceId}`,
  hero: NO_ROW_HEROES[sourceId]!,
  ...partial,
});

/**
 * Neutral mappings remove only the row job. Rat, Opened, damage, and Guard
 * jobs remain where they are useful, so a no-row arm is an actual ablation and
 * not an unrelated low-power deck.
 */
export const NO_ROW_CARDS: Readonly<Record<string, ExtraCardDef>> = {
  "tide": noRowCard("tide", {
    name: "Tide (No Rows)",
    cost: 1,
    target: "single-enemy",
    consume: "none",
    opens: false,
    text: "Deal 4. Gain 2 Guard.",
    effects: [{ kind: "damage", amount: 4 }, { kind: "guard", amount: 2 }],
  }),
  "lunge": noRowCard("lunge", {
    name: "Lunge (No Rows)",
    cost: 1,
    target: "single-enemy",
    consume: "none",
    opens: false,
    text: "Deal 5.",
    effects: [{ kind: "damage", amount: 5 }],
  }),
  "king-of-the-heap": noRowCard("king-of-the-heap", {
    name: "King of the Heap (No Rows)",
    cost: 2,
    target: "single-enemy",
    consume: "none",
    opens: false,
    text: "Deal 7 and gain 8 Guard.",
    effects: [{ kind: "damage", amount: 7 }, { kind: "guard", amount: 8 }],
  }),
  "from-the-dark": noRowCard("from-the-dark", {
    name: "From the Dark (No Rows)",
    cost: 1,
    target: "single-enemy",
    consume: "none",
    opens: true,
    text: "Deal 4. Open the target. If Rat lives, it bites 3.",
    effects: [
      { kind: "damage", amount: 4 },
      { kind: "open" },
      { kind: "if", when: { kind: "rat-exists" }, then: [{ kind: "rat-bite", amount: 3 }] },
    ],
  }),
  "litter": noRowCard("litter", {
    name: "Litter (No Rows)",
    cost: 1,
    target: "single-enemy",
    consume: "none",
    opens: false,
    text: "Deal 4. If no Rat exists, spawn it.",
    effects: [{ kind: "damage", amount: 4 }, { kind: "spawn-rat" }],
  }),
  "send-the-rat": noRowCard("send-the-rat", {
    name: "Send the Rat (No Rows)",
    cost: 1,
    target: "single-enemy",
    consume: "none",
    opens: false,
    text: "If Rat lives, it bites 5. Otherwise deal 4 yourself.",
    effects: [
      { kind: "if", when: { kind: "rat-exists" }, then: [{ kind: "rat-bite", amount: 5 }] },
      { kind: "if", when: { kind: "rat-missing" }, then: [{ kind: "damage", amount: 4 }] },
    ],
  }),
  "the-threshold": noRowCard("the-threshold", {
    name: "The Threshold (No Rows)",
    cost: 1,
    target: "single-enemy",
    consume: "none",
    opens: false,
    text: "Deal 5.",
    effects: [{ kind: "damage", amount: 5 }],
  }),
  "distant-hand": noRowCard("distant-hand", {
    name: "Distant Hand (No Rows)",
    cost: 1,
    target: "single-enemy",
    consume: "none",
    opens: false,
    text: "Deal 5.",
    effects: [{ kind: "damage", amount: 5 }],
  }),
  "parting-word": noRowCard("parting-word", {
    name: "Parting Word (No Rows)",
    cost: 1,
    target: "single-enemy",
    consume: "none",
    opens: false,
    text: "Deal 4.",
    effects: [{ kind: "damage", amount: 4 }],
  }),
  "last-bastion": noRowCard("last-bastion", {
    name: "Last Bastion (No Rows)",
    cost: 2,
    target: "single-enemy",
    consume: "none",
    opens: false,
    text: "Deal 8 and gain 9 Guard.",
    effects: [{ kind: "damage", amount: 8 }, { kind: "guard", amount: 9 }],
  }),
};

export const NO_ROW_CARD_ALIASES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.values(NO_ROW_CARDS).map((card) => [card.id.slice(NO_ROW_CARD_PREFIX.length), card.id]),
);

/** Return the no-row alias for a production card, or the original id. */
export function noRowCardId(id: string): string {
  return NO_ROW_CARD_ALIASES[id] ?? id;
}

function mapDeckEntry(entry: CardTrialDeckEntry): CardTrialDeckEntry {
  if (typeof entry === "string") return noRowCardId(entry);
  return { uid: entry.uid, defId: noRowCardId(entry.defId) };
}

/**
 * Convert a fight definition into the explicit no-row arm. This is kept in
 * the simulator package so production deck lists and encounter definitions are
 * never rewritten in place.
 */
export function adaptFightDefinitionForRows(def: FightDefinition): FightDefinition {
  if ((def.rowMode ?? "full") !== "none") return def;

  const extraCards = { ...(def.extraCards ?? {}) };
  for (const card of Object.values(NO_ROW_CARDS)) {
    if (extraCards[card.id]) {
      throw new Error(`extraCards cannot override reserved no-row card "${card.id}"`);
    }
    extraCards[card.id] = card;
  }

  return {
    ...def,
    decks: {
      "rat-king": def.decks["rat-king"].map(mapDeckEntry),
      "old-man": def.decks["old-man"].map(mapDeckEntry),
    },
    setup: def.setup
      ? {
          ...def.setup,
          hands: def.setup.hands
            ? {
                "rat-king": def.setup.hands["rat-king"]?.map(noRowCardId),
                "old-man": def.setup.hands["old-man"]?.map(noRowCardId),
              }
            : undefined,
        }
      : undefined,
    extraCards,
    rowMode: "none",
    noRowIntentTargeting: def.noRowIntentTargeting ?? "lowest-hp",
  };
}
