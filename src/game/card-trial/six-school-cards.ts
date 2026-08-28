/**
 * Declarative six-school card catalogue.
 *
 * This is the source-of-truth content layer for the next campaign combat
 * rules pass. It is intentionally separate from the frozen Card Trial
 * resolver: the live prototype still consumes `cards.ts`, while the future
 * resolver can compile these effects into one shared forecast/resolution
 * algebra without adding one hard-coded branch per card id.
 */

import type { HeroId, PlayerRow } from "./types";

export type SixSchoolId =
  | "ashen-silence"
  | "last-hour"
  | "astral-conduit"
  | "broodcraft"
  | "crown-of-dominion"
  | "starving-crown";

export type SixSchoolRarity = "common" | "uncommon" | "rare" | "signature";

export type SixSchoolTarget = "self" | "primary" | "second" | "all" | "others";

export type SixSchoolRuleTag =
  | "barrier"
  | "break"
  | "opened"
  | "hush"
  | "seal"
  | "rats"
  | "crowned"
  | "decree"
  | "omen"
  | "resonance"
  | "magnitude"
  | "overchannel"
  | "blood-price"
  | "devour"
  | "movement";

export type SixSchoolCondition =
  | { kind: "row"; row: PlayerRow }
  | { kind: "rat-count-at-least"; amount: number }
  | { kind: "opened-primary" }
  | { kind: "crowned-primary" }
  | { kind: "resonance-at-least"; amount: number }
  | { kind: "recoverable-hp-at-least"; amount: number }
  | { kind: "primary-hp-at-most"; amount: number }
  | { kind: "intent-targets-self" }
  | { kind: "intent-has-trait"; trait: "spell" | "sovereign" }
  | { kind: "cards-played"; amount: number }
  | { kind: "enemy-acted" }
  | { kind: "rat-removed" }
  | { kind: "overchannel" };

export type SixSchoolOmenCondition =
  | { kind: "enemy-acts" }
  | { kind: "opened-primary" }
  | { kind: "crowned-and-opened" }
  | { kind: "cards-played"; amount: number }
  | { kind: "primary-hp-at-most"; amount: number }
  | { kind: "intent-targets-self" }
  | { kind: "intent-breaks" }
  | { kind: "summon-dies" }
  | { kind: "overchannel" }
  | { kind: "rat-removed" };

export type SixSchoolEffect =
  | { kind: "damage"; amount: number; target?: SixSchoolTarget; hits?: number }
  | { kind: "barrier"; amount: number }
  | { kind: "move"; row: PlayerRow | "other" }
  | { kind: "hush"; amount: number }
  | { kind: "seal" }
  | { kind: "open" }
  | { kind: "crack"; amount: number }
  | { kind: "consume-opened"; then: readonly SixSchoolEffect[] }
  | { kind: "break"; amount: number }
  | { kind: "crown" }
  | { kind: "decree"; name: string }
  | {
      kind: "rats";
      operation: "summon" | "ready" | "command" | "consume" | "move";
      count?: number;
      biteDamage?: number;
    }
  | {
      kind: "foretell";
      condition: SixSchoolOmenCondition;
      immediate: readonly SixSchoolEffect[];
      omen: readonly SixSchoolEffect[];
    }
  | { kind: "resonance"; operation: "gain" | "spend" | "hold"; amount?: number }
  | { kind: "convert-hush"; into: "break" | "hits" }
  | { kind: "magnitude"; threshold: number; then: readonly SixSchoolEffect[] }
  | { kind: "overchannel"; spend: "all" | "three"; then: readonly SixSchoolEffect[] }
  | { kind: "blood-price"; amount: number; then: readonly SixSchoolEffect[] }
  | { kind: "devour"; amount: number }
  | {
      kind: "conditional";
      when: SixSchoolCondition;
      then: readonly SixSchoolEffect[];
      otherwise?: readonly SixSchoolEffect[];
    }
  | { kind: "recall-omen" }
  | { kind: "resolve-omen" }
  | { kind: "steal-barrier"; fallbackDamage: number }
  | { kind: "tribute" };

export interface SixSchoolBranch {
  id: string;
  name: string;
  text: string;
  effects: readonly SixSchoolEffect[];
}

export interface SixSchoolCardDef {
  id: string;
  name: string;
  hero: HeroId;
  school: SixSchoolId;
  rarity: SixSchoolRarity;
  cost: 1 | 2 | 3;
  target: SixSchoolTarget;
  text: string;
  effects: readonly SixSchoolEffect[];
  tags: readonly SixSchoolRuleTag[];
  /** Cross-school relationships the card is deliberately authored to use. */
  bridges: readonly SixSchoolId[];
  branches: readonly [SixSchoolBranch, SixSchoolBranch];
}

const damage = (
  amount: number,
  target: SixSchoolTarget = "primary",
  hits = 1
): SixSchoolEffect => ({
  kind: "damage",
  amount,
  ...(target === "primary" ? {} : { target }),
  ...(hits === 1 ? {} : { hits }),
});

const barrier = (amount: number): SixSchoolEffect => ({ kind: "barrier", amount });
const hush = (amount: number): SixSchoolEffect => ({ kind: "hush", amount });
const move = (row: PlayerRow | "other"): SixSchoolEffect => ({ kind: "move", row });
const rats = (
  operation: Extract<SixSchoolEffect, { kind: "rats" }>["operation"],
  count?: number,
  biteDamage?: number
): SixSchoolEffect => ({
  kind: "rats",
  operation,
  ...(count === undefined ? {} : { count }),
  ...(biteDamage === undefined ? {} : { biteDamage }),
});
const foretell = (
  condition: SixSchoolOmenCondition,
  immediate: readonly SixSchoolEffect[],
  omen: readonly SixSchoolEffect[]
): SixSchoolEffect => ({ kind: "foretell", condition, immediate, omen });
const conditional = (
  when: SixSchoolCondition,
  then: readonly SixSchoolEffect[],
  otherwise?: readonly SixSchoolEffect[]
): SixSchoolEffect => ({ kind: "conditional", when, then, ...(otherwise ? { otherwise } : {}) });
const magnitude = (threshold: number, then: readonly SixSchoolEffect[]): SixSchoolEffect => ({
  kind: "magnitude",
  threshold,
  then,
});
const overchannel = (
  spend: "all" | "three",
  then: readonly SixSchoolEffect[]
): SixSchoolEffect => ({ kind: "overchannel", spend, then });
const bloodPrice = (amount: number, then: readonly SixSchoolEffect[]): SixSchoolEffect => ({
  kind: "blood-price",
  amount,
  then,
});
const consume = (then: readonly SixSchoolEffect[]): SixSchoolEffect => ({
  kind: "consume-opened",
  then,
});

const branch = (
  id: string,
  name: string,
  text: string,
  effects: readonly SixSchoolEffect[]
): SixSchoolBranch => ({ id, name, text, effects });

/**
 * Six definitions per school, duplicated twice to make the 12-slot rules
 * slice. These are content definitions, not yet the live campaign deck.
 */
export const SIX_SCHOOL_CATALOGUE = [
  // -----------------------------------------------------------------------
  // Old Man — Ashen Silence
  // -----------------------------------------------------------------------
  {
    id: "cinder-word",
    name: "Cinder Word",
    hero: "old-man",
    school: "ashen-silence",
    rarity: "common",
    cost: 1,
    target: "primary",
    text: "Deal 3. Hush 1.",
    effects: [damage(3), hush(1)],
    tags: ["hush"],
    bridges: ["last-hour", "astral-conduit"],
    branches: [
      branch("quiet-cinder", "Quiet Cinder", "Deal 2. Hush 2.", [damage(2), hush(2)]),
      branch("cinder-echo", "Cinder Echo", "Deal 4. If Opened, gain Resonance 1.", [
        damage(4),
        conditional({ kind: "opened-primary" }, [{ kind: "resonance", operation: "gain", amount: 1 }]),
      ]),
    ],
  },
  {
    id: "ashen-ward",
    name: "Ashen Ward",
    hero: "old-man",
    school: "ashen-silence",
    rarity: "common",
    cost: 1,
    target: "self",
    text: "Gain 6 Barrier.",
    effects: [barrier(6)],
    tags: ["barrier"],
    bridges: ["astral-conduit", "starving-crown"],
    branches: [
      branch("sealed-ward", "Sealed Ward", "Gain 4 Barrier. Seal the most dangerous intent.", [barrier(4), { kind: "seal" }]),
      branch("ward-of-ashes", "Ward of Ashes", "Gain 8 Barrier, then Hush 1 if the intent targets you.", [
        barrier(8),
        conditional({ kind: "intent-targets-self" }, [hush(1)]),
      ]),
    ],
  },
  {
    id: "mute-the-bell",
    name: "Mute the Bell",
    hero: "old-man",
    school: "ashen-silence",
    rarity: "uncommon",
    cost: 1,
    target: "primary",
    text: "Deal 2. Hush 2. Seal a Spell intent.",
    effects: [damage(2), hush(2), { kind: "seal" }],
    tags: ["hush", "seal"],
    bridges: ["last-hour", "crown-of-dominion"],
    branches: [
      branch("bell-under-ash", "Bell Under Ash", "Deal 3. Hush 1. Break 4 if the intent is a Spell.", [
        damage(3),
        hush(1),
        conditional({ kind: "intent-has-trait", trait: "spell" }, [{ kind: "break", amount: 4 }]),
      ]),
      branch("bell-without-echo", "Bell Without Echo", "Deal 1. Hush 3. Seal.", [damage(1), hush(3), { kind: "seal" }]),
    ],
  },
  {
    id: "black-margin",
    name: "Black Margin",
    hero: "old-man",
    school: "ashen-silence",
    rarity: "uncommon",
    cost: 1,
    target: "primary",
    text: "Deal 3. If its intent targets you, gain 3 Barrier and Hush 1.",
    effects: [
      damage(3),
      conditional({ kind: "intent-targets-self" }, [barrier(3), hush(1)]),
    ],
    tags: ["barrier", "hush"],
    bridges: ["crown-of-dominion", "starving-crown"],
    branches: [
      branch("wide-margin", "Wide Margin", "Deal 2 to every enemy. Hush the current intent 1.", [damage(2, "all"), hush(1)]),
      branch("narrow-margin", "Narrow Margin", "Deal 5. If Opened, Break 5.", [
        damage(5),
        conditional({ kind: "opened-primary" }, [{ kind: "break", amount: 5 }]),
      ]),
    ],
  },
  {
    id: "cut-the-chant",
    name: "Cut the Chant",
    hero: "old-man",
    school: "ashen-silence",
    rarity: "rare",
    cost: 1,
    target: "primary",
    text: "Deal 2. Convert each Hush on the intent into 3 Break or 2 damage.",
    effects: [damage(2), { kind: "convert-hush", into: "break" }],
    tags: ["hush", "break"],
    bridges: ["astral-conduit", "broodcraft"],
    branches: [
      branch("measured-cut", "Measured Cut", "Deal 2. Convert one Hush into 6 Break.", [damage(2), { kind: "break", amount: 6 }]),
      branch("ragged-cut", "Ragged Cut", "Deal 2. Convert Hush into pairs of 1-damage hits.", [damage(2, "primary", 2), { kind: "break", amount: 1 }]),
    ],
  },
  {
    id: "final-word",
    name: "Final Word",
    hero: "old-man",
    school: "ashen-silence",
    rarity: "signature",
    cost: 2,
    target: "primary",
    text: "Deal 4. Convert removed Hush into separate finishing hits.",
    effects: [damage(4), { kind: "convert-hush", into: "hits" }],
    tags: ["hush", "break"],
    bridges: ["last-hour", "astral-conduit"],
    branches: [
      branch("last-sentence", "Last Sentence", "Deal 6. Break 8 if Hush was converted.", [damage(6), { kind: "break", amount: 8 }]),
      branch("word-of-ruin", "Word of Ruin", "Deal 3 three times. Opened fracture counts toward each hit sequence.", [damage(3, "primary", 3), { kind: "open" }]),
    ],
  },

  // -----------------------------------------------------------------------
  // Old Man — The Last Hour
  // -----------------------------------------------------------------------
  {
    id: "three-knocks",
    name: "Three Knocks",
    hero: "old-man",
    school: "last-hour",
    rarity: "common",
    cost: 1,
    target: "primary",
    text: "Gain 2 Barrier. Foretell: after three cards are played, deal 6.",
    effects: [barrier(2), foretell({ kind: "cards-played", amount: 3 }, [barrier(2)], [damage(6)])],
    tags: ["barrier", "omen"],
    bridges: ["broodcraft", "crown-of-dominion"],
    branches: [
      branch("hasty-knocks", "Hasty Knocks", "Foretell after two cards for 4 damage.", [foretell({ kind: "cards-played", amount: 2 }, [], [damage(4)])]),
      branch("funeral-knocks", "Funeral Knocks", "Foretell after four cards for 9 damage and Hush 1.", [foretell({ kind: "cards-played", amount: 4 }, [], [damage(9), hush(1)])]),
    ],
  },
  {
    id: "death-arrives-late",
    name: "Death Arrives Late",
    hero: "old-man",
    school: "last-hour",
    rarity: "common",
    cost: 1,
    target: "primary",
    text: "Deal 3. Hush 1. Foretell: when this enemy acts, deal 6.",
    effects: [damage(3), hush(1), foretell({ kind: "enemy-acts" }, [], [damage(6)])],
    tags: ["hush", "omen"],
    bridges: ["ashen-silence", "crown-of-dominion"],
    branches: [
      branch("merciful-delay", "Merciful Delay", "Deal 2. Foretell 4 damage and Hush 2 after the enemy acts.", [damage(2), foretell({ kind: "enemy-acts" }, [], [damage(4), hush(2)])]),
      branch("exact-appointment", "Exact Appointment", "Deal 2. Foretell 10 damage after a Broken action.", [damage(2), foretell({ kind: "intent-breaks" }, [], [damage(10), { kind: "break", amount: 2 }])]),
    ],
  },
  {
    id: "a-death-foreseen",
    name: "A Death Foreseen",
    hero: "old-man",
    school: "last-hour",
    rarity: "uncommon",
    cost: 1,
    target: "primary",
    text: "Gain 3 Barrier. Foretell: when the target becomes Opened, deal 8.",
    effects: [barrier(3), foretell({ kind: "opened-primary" }, [], [damage(8)])],
    tags: ["barrier", "omen", "opened"],
    bridges: ["broodcraft", "crown-of-dominion"],
    branches: [
      branch("death-delayed", "Death Delayed", "Gain 3 Barrier. Foretell 6 damage and Hush 2 when Opened.", [barrier(3), foretell({ kind: "opened-primary" }, [], [damage(6), hush(2)])]),
      branch("broken-appointment", "Broken Appointment", "Gain 1 Barrier. Foretell 10 damage after the target's intent Breaks.", [barrier(1), foretell({ kind: "intent-breaks" }, [], [damage(10), { kind: "break", amount: 3 }])]),
    ],
  },
  {
    id: "appointment-kept",
    name: "Appointment Kept",
    hero: "old-man",
    school: "last-hour",
    rarity: "uncommon",
    cost: 1,
    target: "primary",
    text: "Deal 4. Foretell: when the target reaches 12 HP, Break 5.",
    effects: [damage(4), foretell({ kind: "primary-hp-at-most", amount: 12 }, [], [{ kind: "break", amount: 5 }])],
    tags: ["omen", "break"],
    bridges: ["astral-conduit", "starving-crown"],
    branches: [
      branch("kept-early", "Kept Early", "Deal 3. Foretell at 16 HP for 4 damage and Hush 1.", [damage(3), foretell({ kind: "primary-hp-at-most", amount: 16 }, [], [damage(4), hush(1)])]),
      branch("kept-finally", "Kept Finally", "Deal 2. Foretell at 10 HP for 9 damage and Break 4.", [damage(2), foretell({ kind: "primary-hp-at-most", amount: 10 }, [], [damage(9), { kind: "break", amount: 4 }])]),
    ],
  },
  {
    id: "borrowed-moment",
    name: "Borrowed Moment",
    hero: "old-man",
    school: "last-hour",
    rarity: "rare",
    cost: 1,
    target: "self",
    text: "Gain 3 Barrier. Foretell: when your next intent targets you, gain 2 Resonance.",
    effects: [barrier(3), foretell({ kind: "intent-targets-self" }, [], [{ kind: "resonance", operation: "gain", amount: 2 }])],
    tags: ["barrier", "omen", "resonance"],
    bridges: ["ashen-silence", "astral-conduit"],
    branches: [
      branch("lent-hour", "Lent Hour", "Gain 2 Barrier. Foretell 3 Resonance when a Hushed intent acts.", [barrier(2), foretell({ kind: "enemy-acts" }, [], [{ kind: "resonance", operation: "gain", amount: 3 }])]),
      branch("stolen-hour", "Stolen Hour", "Gain 1 Barrier. Foretell 5 damage when the next enemy acts.", [barrier(1), foretell({ kind: "enemy-acts" }, [], [damage(5)])]),
    ],
  },
  {
    id: "the-hour-comes-round",
    name: "The Hour Comes Round",
    hero: "old-man",
    school: "last-hour",
    rarity: "signature",
    cost: 2,
    target: "primary",
    text: "Deal 5. Resolve your current Omen, then move to the other row.",
    effects: [damage(5), { kind: "resolve-omen" }, move("other")],
    tags: ["omen", "movement"],
    bridges: ["ashen-silence", "astral-conduit"],
    branches: [
      branch("hour-unbound", "Hour Unbound", "Deal 7. Recall the Omen for free, then Hush 1.", [damage(7), { kind: "recall-omen" }, hush(1)]),
      branch("hour-foretold", "Hour Foretold", "Deal 3. Keep the Omen armed and gain Resonance 2.", [damage(3), { kind: "resonance", operation: "gain", amount: 2 }]),
    ],
  },

  // -----------------------------------------------------------------------
  // Old Man — Astral Conduit
  // -----------------------------------------------------------------------
  {
    id: "star-lance",
    name: "Star Lance",
    hero: "old-man",
    school: "astral-conduit",
    rarity: "common",
    cost: 1,
    target: "primary",
    text: "Deal 5. Gain 1 Resonance. Magnitude 7: gain 1 more Resonance.",
    effects: [damage(5), { kind: "resonance", operation: "gain", amount: 1 }, magnitude(7, [{ kind: "resonance", operation: "gain", amount: 1 }])],
    tags: ["resonance", "magnitude"],
    bridges: ["broodcraft", "last-hour"],
    branches: [
      branch("convergent-lance", "Convergent Star Lance", "Deal 3. Gain 2 Resonance.", [damage(3), { kind: "resonance", operation: "gain", amount: 2 }]),
      branch("ruinous-lance", "Ruinous Star Lance", "Deal 6. Magnitude 8: add a piercing hit for 4.", [damage(6), magnitude(8, [damage(4)])]),
    ],
  },
  {
    id: "conjunction",
    name: "Conjunction",
    hero: "old-man",
    school: "astral-conduit",
    rarity: "common",
    cost: 1,
    target: "primary",
    text: "Deal 3 twice. Gain 1 Resonance.",
    effects: [damage(3, "primary", 2), { kind: "resonance", operation: "gain", amount: 1 }],
    tags: ["resonance", "opened"],
    bridges: ["broodcraft", "last-hour"],
    branches: [
      branch("aligned-conjunction", "Aligned Conjunction", "Deal 2 three times. If Opened, gain Resonance 2.", [damage(2, "primary", 3), conditional({ kind: "opened-primary" }, [{ kind: "resonance", operation: "gain", amount: 2 }])]),
      branch("eclipsed-conjunction", "Eclipsed Conjunction", "Deal 5 once. Hush 1 and gain Resonance 1.", [damage(5), hush(1), { kind: "resonance", operation: "gain", amount: 1 }]),
    ],
  },
  {
    id: "chart-the-wound",
    name: "Chart the Wound",
    hero: "old-man",
    school: "astral-conduit",
    rarity: "uncommon",
    cost: 1,
    target: "primary",
    text: "Deal 2. Open the target. Gain 1 Resonance.",
    effects: [damage(2), { kind: "open" }, { kind: "resonance", operation: "gain", amount: 1 }],
    tags: ["opened", "resonance"],
    bridges: ["broodcraft", "crown-of-dominion"],
    branches: [
      branch("charted-wound", "Charted Wound", "Deal 1. Open the target and gain Resonance 2.", [damage(1), { kind: "open" }, { kind: "resonance", operation: "gain", amount: 2 }]),
      branch("unmake-the-chart", "Unmake the Chart", "Deal 5. Consume Opened for a 5-damage second hit.", [damage(5), consume([damage(5)])]),
    ],
  },
  {
    id: "constellation-ward",
    name: "Constellation Ward",
    hero: "old-man",
    school: "astral-conduit",
    rarity: "uncommon",
    cost: 1,
    target: "self",
    text: "Gain 5 Barrier. Gain 1 Resonance.",
    effects: [barrier(5), { kind: "resonance", operation: "gain", amount: 1 }],
    tags: ["barrier", "resonance"],
    bridges: ["ashen-silence", "starving-crown"],
    branches: [
      branch("fixed-constellation", "Fixed Constellation", "Gain 7 Barrier. Hold Resonance for this turn's end Barrier.", [barrier(7), { kind: "resonance", operation: "hold" }]),
      branch("shattered-constellation", "Shattered Constellation", "Gain 3 Barrier. Hush 2 and gain Resonance 2.", [barrier(3), hush(2), { kind: "resonance", operation: "gain", amount: 2 }]),
    ],
  },
  {
    id: "astral-reserve",
    name: "Astral Reserve",
    hero: "old-man",
    school: "astral-conduit",
    rarity: "rare",
    cost: 1,
    target: "self",
    text: "Gain 2 Barrier. Gain 2 Resonance; overflow becomes Barrier.",
    effects: [barrier(2), { kind: "resonance", operation: "gain", amount: 2 }],
    tags: ["barrier", "resonance"],
    bridges: ["ashen-silence", "last-hour"],
    branches: [
      branch("deep-reserve", "Deep Reserve", "Gain 1 Barrier. Gain 3 Resonance.", [barrier(1), { kind: "resonance", operation: "gain", amount: 3 }]),
      branch("armed-reserve", "Armed Reserve", "Gain 4 Barrier. Gain 1 Resonance; the next overflow is a star hit.", [barrier(4), { kind: "resonance", operation: "gain", amount: 1 }, damage(2)]),
    ],
  },
  {
    id: "collapse-the-constellation",
    name: "Collapse the Constellation",
    hero: "old-man",
    school: "astral-conduit",
    rarity: "signature",
    cost: 3,
    target: "all",
    text: "Deal 4 to every enemy. Overchannel: spend Resonance for separate waves.",
    effects: [damage(4, "all"), overchannel("all", [damage(2, "all")])],
    tags: ["resonance", "overchannel", "magnitude"],
    bridges: ["broodcraft", "last-hour"],
    branches: [
      branch("controlled-collapse", "Controlled Collapse", "Deal 3 to every enemy. Overchannel exactly 3 Resonance for three waves.", [damage(3, "all"), overchannel("three", [damage(3, "all", 3)])]),
      branch("singular-collapse", "Singular Collapse", "Deal 8 to one enemy. Overchannel for a second 6-damage hit.", [damage(8), overchannel("all", [damage(6)])]),
    ],
  },

  // -----------------------------------------------------------------------
  // Rat King — Broodcraft
  // -----------------------------------------------------------------------
  {
    id: "litter-the-floor",
    name: "Litter the Floor",
    hero: "rat-king",
    school: "broodcraft",
    rarity: "common",
    cost: 1,
    target: "primary",
    text: "Deal 3. Summon a Ready Rat.",
    effects: [damage(3), rats("summon", 1)],
    tags: ["rats"],
    bridges: ["crown-of-dominion", "starving-crown"],
    branches: [
      branch("prolific-litter", "Prolific Litter", "Deal 1. Summon two Ready Rats.", [damage(1), rats("summon", 2)]),
      branch("feral-litter", "Feral Litter", "Deal 5. Summon only if the board is empty.", [damage(5), conditional({ kind: "rat-count-at-least", amount: 1 }, [], [rats("summon", 1)])]),
    ],
  },
  {
    id: "nip",
    name: "Nip",
    hero: "rat-king",
    school: "broodcraft",
    rarity: "common",
    cost: 1,
    target: "primary",
    text: "Deal 5.",
    effects: [damage(5)],
    tags: ["opened", "break"],
    bridges: ["ashen-silence", "astral-conduit"],
    branches: [
      branch("deep-nip", "Deep Nip", "Deal 4. Add two cracks.", [damage(4), { kind: "crack", amount: 2 }]),
      branch("quick-nip", "Quick Nip", "Deal 3 twice.", [damage(3, "primary", 2)]),
    ],
  },
  {
    id: "open-the-rank",
    name: "Open the Rank",
    hero: "rat-king",
    school: "broodcraft",
    rarity: "common",
    cost: 1,
    target: "primary",
    text: "Deal 2 three times. Open the target.",
    effects: [damage(2, "primary", 3), { kind: "open" }],
    tags: ["opened", "break"],
    bridges: ["last-hour", "astral-conduit"],
    branches: [
      branch("opening-swarm", "Opening Swarm", "Deal 1 four times. Open the target if it survives.", [damage(1, "primary", 4), { kind: "open" }]),
      branch("closed-rank", "Closed Rank", "Deal 6. If already Opened, keep it and gain Barrier 3.", [damage(6), conditional({ kind: "opened-primary" }, [barrier(3)])]),
    ],
  },
  {
    id: "gnawing-court",
    name: "Gnawing Court",
    hero: "rat-king",
    school: "broodcraft",
    rarity: "uncommon",
    cost: 1,
    target: "primary",
    text: "Command up to two Ready Rats for separate 1-damage bites; fallback Deal 2.",
    effects: [rats("command", 2, 1), damage(2)],
    tags: ["rats", "opened"],
    bridges: ["crown-of-dominion", "astral-conduit"],
    branches: [
      branch("full-gnawing-court", "Full Gnawing Court", "Command up to three Rats for 2 each; fallback Deal 3.", [rats("command", 3, 2), damage(3)]),
      branch("civil-gnawing-court", "Civil Gnawing Court", "Command two Rats for 1 each, leaving them Ready for the volley.", [rats("command", 2, 1), { kind: "decree", name: "civil-court" }]),
    ],
  },
  {
    id: "nest-underfoot",
    name: "Nest Underfoot",
    hero: "rat-king",
    school: "broodcraft",
    rarity: "uncommon",
    cost: 1,
    target: "self",
    text: "Summon a Ready Rat and gain 3 Barrier. At cap, Ready one instead.",
    effects: [rats("summon", 1), barrier(3)],
    tags: ["rats", "barrier"],
    bridges: ["starving-crown", "crown-of-dominion"],
    branches: [
      branch("deep-nest", "Deep Nest", "Summon two Rats and gain 1 Barrier; cap overflow still Readies.", [rats("summon", 2), barrier(1)]),
      branch("fortified-nest", "Fortified Nest", "Summon one Rat and gain 6 Barrier; cap overflow gains 2 more.", [rats("summon", 1), barrier(6)]),
    ],
  },
  {
    id: "swarm-the-wound",
    name: "Swarm the Wound",
    hero: "rat-king",
    school: "broodcraft",
    rarity: "rare",
    cost: 1,
    target: "primary",
    text: "Deal 3. Command every Ready Rat. Consume Opened: Ready one afterward.",
    effects: [damage(3), rats("command", 3, 2), consume([rats("ready", 1)])],
    tags: ["rats", "opened"],
    bridges: ["last-hour", "astral-conduit"],
    branches: [
      branch("patient-swarm", "Patient Swarm", "Deal 2. Command Rats for 1 each; Opened stays and Rats remain Ready.", [damage(2), rats("command", 3, 1)]),
      branch("ravenous-swarm", "Ravenous Swarm", "Deal 4. Command Rats for 3 each, then consume one Rat and Opened.", [damage(4), rats("command", 3, 3), consume([rats("consume", 1)])]),
    ],
  },

  // -----------------------------------------------------------------------
  // Rat King — Crown of Dominion
  // -----------------------------------------------------------------------
  {
    id: "kneel",
    name: "Kneel",
    hero: "rat-king",
    school: "crown-of-dominion",
    rarity: "common",
    cost: 1,
    target: "primary",
    text: "Deal 3. Crown the target.",
    effects: [damage(3), { kind: "crown" }],
    tags: ["crowned"],
    bridges: ["broodcraft", "last-hour"],
    branches: [
      branch("kneel-quietly", "Kneel Quietly", "Deal 2. Crown and Hush the target 1.", [damage(2), { kind: "crown" }, hush(1)]),
      branch("kneel-before-teeth", "Kneel Before Teeth", "Deal 3. Crown and Ready one Rat.", [damage(3), { kind: "crown" }, rats("ready", 1)]),
    ],
  },
  {
    id: "royal-guard",
    name: "Royal Guard",
    hero: "rat-king",
    school: "crown-of-dominion",
    rarity: "common",
    cost: 1,
    target: "self",
    text: "Gain 6 Barrier. The next Crowned intent pays tribute.",
    effects: [barrier(6), { kind: "tribute" }],
    tags: ["barrier", "crowned"],
    bridges: ["ashen-silence", "starving-crown"],
    branches: [
      branch("royal-vigil", "Royal Vigil", "Gain 4 Barrier. Hush the next intent targeting you 1.", [barrier(4), conditional({ kind: "intent-targets-self" }, [hush(1)])]),
      branch("royal-command", "Royal Command", "Gain 3 Barrier. The next Decree Readies a Rat.", [barrier(3), { kind: "decree", name: "royal-command" }]),
    ],
  },
  {
    id: "the-king-points",
    name: "The King Points",
    hero: "rat-king",
    school: "crown-of-dominion",
    rarity: "common",
    cost: 1,
    target: "primary",
    text: "Crown the target. One Ready Rat bites it; fallback Deal 3.",
    effects: [{ kind: "crown" }, rats("command", 1, 2), damage(3)],
    tags: ["crowned", "rats"],
    bridges: ["broodcraft", "last-hour"],
    branches: [
      branch("point-of-law", "Point of Law", "Crown the target and Break 4 if a Rat bites it.", [{ kind: "crown" }, rats("command", 1, 1), { kind: "break", amount: 4 }]),
      branch("point-of-hunger", "Point of Hunger", "Crown the target and Blood Price 1 for two Rat bites.", [{ kind: "crown" }, bloodPrice(1, [rats("command", 2, 2)])]),
    ],
  },
  {
    id: "tribute",
    name: "Tribute",
    hero: "rat-king",
    school: "crown-of-dominion",
    rarity: "uncommon",
    cost: 1,
    target: "primary",
    text: "Steal the target's Barrier; if none, deal 5. Crowned targets pay the King.",
    effects: [{ kind: "steal-barrier", fallbackDamage: 5 }, { kind: "tribute" }],
    tags: ["crowned", "barrier"],
    bridges: ["ashen-silence", "starving-crown"],
    branches: [
      branch("living-tribute", "Living Tribute", "Deal 3. Convert stolen Barrier into Devour 3.", [damage(3), { kind: "devour", amount: 3 }]),
      branch("tribute-in-teeth", "Tribute in Teeth", "Deal 2. Each two stolen Barrier become one Rat bite.", [damage(2), rats("command", 2, 1)]),
    ],
  },
  {
    id: "decree-be-still",
    name: "Decree: Be Still",
    hero: "rat-king",
    school: "crown-of-dominion",
    rarity: "rare",
    cost: 1,
    target: "primary",
    text: "Decree. Hush the Crowned target 2 and Break 3.",
    effects: [{ kind: "decree", name: "be-still" }, hush(2), { kind: "break", amount: 3 }],
    tags: ["decree", "hush", "break", "crowned"],
    bridges: ["ashen-silence", "last-hour"],
    branches: [
      branch("decree-kneel", "Decree: Kneel", "Decree. Crown the target, then Hush 1.", [{ kind: "decree", name: "kneel" }, { kind: "crown" }, hush(1)]),
      branch("decree-bite", "Decree: Bite", "Decree. One Ready Rat bites; if Crowned, Open the target.", [{ kind: "decree", name: "bite" }, rats("command", 1, 2), conditional({ kind: "crowned-primary" }, [{ kind: "open" }])]),
    ],
  },
  {
    id: "condemnation",
    name: "Condemnation",
    hero: "rat-king",
    school: "crown-of-dominion",
    rarity: "signature",
    cost: 2,
    target: "primary",
    text: "Deal 4. Crown and Open the target; one Rat bites.",
    effects: [damage(4), { kind: "crown" }, { kind: "open" }, rats("command", 1, 2)],
    tags: ["crowned", "opened", "rats", "decree"],
    bridges: ["last-hour", "astral-conduit"],
    branches: [
      branch("public-condemnation", "Public Condemnation", "Deal 2. Crown, Open, and command every Ready Rat.", [damage(2), { kind: "crown" }, { kind: "open" }, rats("command", 3, 1)]),
      branch("secret-condemnation", "Secret Condemnation", "Deal 5. Crown and give Old Man Resonance 2.", [damage(5), { kind: "crown" }, { kind: "resonance", operation: "gain", amount: 2 }]),
    ],
  },

  // -----------------------------------------------------------------------
  // Rat King — The Starving Crown
  // -----------------------------------------------------------------------
  {
    id: "bite-the-hand",
    name: "Bite the Hand",
    hero: "rat-king",
    school: "starving-crown",
    rarity: "common",
    cost: 1,
    target: "primary",
    text: "Deal 5. Blood Price 2: deal another 3.",
    effects: [damage(5), bloodPrice(2, [damage(3)])],
    tags: ["blood-price"],
    bridges: ["broodcraft", "crown-of-dominion"],
    branches: [
      branch("many-bites", "Many Bites", "Deal 4. Blood Price 2: deal two hits for 2.", [damage(4), bloodPrice(2, [damage(2, "primary", 2)])]),
      branch("closed-mouth", "Closed Mouth", "Deal 7. Devour 2 only if Opened.", [damage(7), conditional({ kind: "opened-primary" }, [{ kind: "devour", amount: 2 }])]),
    ],
  },
  {
    id: "eat-through-it",
    name: "Eat Through It",
    hero: "rat-king",
    school: "starving-crown",
    rarity: "common",
    cost: 1,
    target: "primary",
    text: "Blood Price 2: command every Rat, then consume one.",
    effects: [damage(3), bloodPrice(2, [rats("command", 3, 2), rats("consume", 1)])],
    tags: ["blood-price", "rats", "devour"],
    bridges: ["broodcraft", "crown-of-dominion"],
    branches: [
      branch("feed-the-court", "Feed the Court", "Blood Price 1: command only Ready Rats; leave the rest.", [damage(2), bloodPrice(1, [rats("command", 3, 1)])]),
      branch("eat-the-court", "Eat the Court", "Blood Price 4: command every Rat for 3, then consume them.", [damage(2), bloodPrice(4, [rats("command", 3, 3), rats("consume", 3)])]),
    ],
  },
  {
    id: "royal-appetite",
    name: "Royal Appetite",
    hero: "rat-king",
    school: "starving-crown",
    rarity: "uncommon",
    cost: 1,
    target: "primary",
    text: "Deal 3. Devour 2 recoverable HP; if none is available, gain 3 Barrier.",
    effects: [
      damage(3),
      conditional({ kind: "recoverable-hp-at-least", amount: 1 }, [{ kind: "devour", amount: 2 }], [barrier(3)]),
    ],
    tags: ["devour", "barrier"],
    bridges: ["broodcraft", "ashen-silence"],
    branches: [
      branch("royal-feast", "Royal Feast", "Deal 2. Devour 4; excess becomes Barrier.", [damage(2), { kind: "devour", amount: 4 }, barrier(2)]),
      branch("royal-fast", "Royal Fast", "Deal 6. If recoverable HP exists, leave it for the next Devour.", [damage(6), { kind: "devour", amount: 1 }]),
    ],
  },
  {
    id: "feast-on-the-wounded",
    name: "Feast on the Wounded",
    hero: "rat-king",
    school: "starving-crown",
    rarity: "uncommon",
    cost: 1,
    target: "primary",
    text: "Deal 4. Devour 3. Opened stays.",
    effects: [damage(4), { kind: "devour", amount: 3 }],
    tags: ["devour", "opened"],
    bridges: ["last-hour", "astral-conduit"],
    branches: [
      branch("patient-feast", "Patient Feast", "Deal 2. Devour 5 and preserve Opened.", [damage(2), { kind: "devour", amount: 5 }]),
      branch("ravenous-feast", "Ravenous Feast", "Deal 7. Consume Opened to Devour 4.", [damage(7), consume([{ kind: "devour", amount: 4 }])]),
    ],
  },
  {
    id: "crown-of-hunger",
    name: "Crown of Hunger",
    hero: "rat-king",
    school: "starving-crown",
    rarity: "rare",
    cost: 2,
    target: "primary",
    text: "Crown the target. Blood Price 3: Open it and gain a Rat.",
    effects: [{ kind: "crown" }, bloodPrice(3, [{ kind: "open" }, rats("summon", 1)])],
    tags: ["crowned", "blood-price", "opened", "rats"],
    bridges: ["broodcraft", "last-hour"],
    branches: [
      branch("patient-crown", "Patient Crown", "Crown safely. Blood Price 1: Hush and Open the target.", [{ kind: "crown" }, bloodPrice(1, [hush(1), { kind: "open" }])]),
      branch("famine-crown", "Famine Crown", "Blood Price 5: Crown, Open, and Break 5.", [bloodPrice(5, [{ kind: "crown" }, { kind: "open" }, { kind: "break", amount: 5 }])]),
    ],
  },
  {
    id: "devour-the-spell",
    name: "Devour the Spell",
    hero: "rat-king",
    school: "starving-crown",
    rarity: "signature",
    cost: 2,
    target: "primary",
    text: "Deal 4. Devour 3. Blood Price 3: Hush and consume one Rat for another 5.",
    effects: [damage(4), { kind: "devour", amount: 3 }, bloodPrice(3, [hush(1), rats("consume", 1), damage(5)])],
    tags: ["devour", "blood-price", "hush", "rats"],
    bridges: ["ashen-silence", "crown-of-dominion"],
    branches: [
      branch("devour-the-kingdom", "Devour the Kingdom", "Deal 3. Blood Price 4: consume every Rat and Devour 6.", [damage(3), bloodPrice(4, [rats("consume", 3), { kind: "devour", amount: 6 }])]),
      branch("devour-the-threat", "Devour the Threat", "Deal 8. If the target is Crowned, Break 6 instead of paying Blood Price.", [damage(8), conditional({ kind: "crowned-primary" }, [{ kind: "break", amount: 6 }])]),
    ],
  },
] as const satisfies readonly SixSchoolCardDef[];

export type SixSchoolCardId = (typeof SIX_SCHOOL_CATALOGUE)[number]["id"];

const CATALOGUE_BY_ID = new Map<string, SixSchoolCardDef>(
  SIX_SCHOOL_CATALOGUE.map((card) => [card.id, card])
);

export const SIX_SCHOOL_IDS: readonly SixSchoolId[] = [
  "ashen-silence",
  "last-hour",
  "astral-conduit",
  "broodcraft",
  "crown-of-dominion",
  "starving-crown",
];

export const SCHOOL_HERO: Readonly<Record<SixSchoolId, HeroId>> = {
  "ashen-silence": "old-man",
  "last-hour": "old-man",
  "astral-conduit": "old-man",
  broodcraft: "rat-king",
  "crown-of-dominion": "rat-king",
  "starving-crown": "rat-king",
};

export function sixSchoolCard(id: SixSchoolCardId): SixSchoolCardDef {
  const card = CATALOGUE_BY_ID.get(id);
  if (!card) throw new Error(`Unknown six-school card ${id}`);
  return card;
}

export function cardsForSchool(school: SixSchoolId): SixSchoolCardDef[] {
  return SIX_SCHOOL_CATALOGUE.filter((card) => card.school === school);
}

export function cardsForHero(heroId: HeroId): SixSchoolCardDef[] {
  return SIX_SCHOOL_CATALOGUE.filter((card) => card.hero === heroId);
}

/** A 12-slot fixed school package for rules-slice/Arena fixtures only. */
export function schoolSliceDeck(school: SixSchoolId): SixSchoolCardId[] {
  const cards = cardsForSchool(school);
  return cards.flatMap((card) => [card.id as SixSchoolCardId, card.id as SixSchoolCardId]);
}

function collectEffects(effects: readonly SixSchoolEffect[], out: SixSchoolEffect[] = []): SixSchoolEffect[] {
  for (const effect of effects) {
    out.push(effect);
    if (effect.kind === "conditional" || effect.kind === "magnitude" || effect.kind === "overchannel" || effect.kind === "blood-price" || effect.kind === "consume-opened") {
      collectEffects(effect.then, out);
      if (effect.kind === "conditional" && effect.otherwise) collectEffects(effect.otherwise, out);
    }
    if (effect.kind === "foretell") {
      collectEffects(effect.immediate, out);
      collectEffects(effect.omen, out);
    }
  }
  return out;
}

export interface SixSchoolCatalogueIssue {
  cardId?: string;
  message: string;
}

const REQUIRED_TAGS: readonly SixSchoolRuleTag[] = [
  "barrier",
  "break",
  "opened",
  "hush",
  "seal",
  "rats",
  "crowned",
  "decree",
  "omen",
  "resonance",
  "magnitude",
  "overchannel",
  "blood-price",
  "devour",
  "movement",
];

/** Validate content invariants before a resolver or campaign reward can use this corpus. */
export function validateSixSchoolCatalogue(): SixSchoolCatalogueIssue[] {
  const issues: SixSchoolCatalogueIssue[] = [];
  const ids = new Set<string>();
  const bySchool = new Map<SixSchoolId, SixSchoolCardDef[]>();
  const tags = new Set<SixSchoolRuleTag>();

  for (const card of SIX_SCHOOL_CATALOGUE) {
    if (ids.has(card.id)) issues.push({ cardId: card.id, message: "duplicate card id" });
    ids.add(card.id);
    if (SCHOOL_HERO[card.school] !== card.hero) issues.push({ cardId: card.id, message: "school owner does not match hero" });
    const cost = card.cost as number;
    if (cost < 1 || cost > 3) issues.push({ cardId: card.id, message: "cost must be 1–3" });
    if ((card.effects.length as number) === 0) issues.push({ cardId: card.id, message: "card has no base effect" });
    if ((card.branches.length as number) !== 2 || card.branches.some((candidate) => (candidate.effects.length as number) === 0)) {
      issues.push({ cardId: card.id, message: "card must have two non-empty functional branches" });
    }
    if (new Set(card.tags).size !== card.tags.length) issues.push({ cardId: card.id, message: "duplicate rule tag" });
    card.tags.forEach((tag) => tags.add(tag));
    for (const school of card.bridges) {
      if (!SIX_SCHOOL_IDS.includes(school)) issues.push({ cardId: card.id, message: `unknown bridge school ${school}` });
      if (school === card.school) issues.push({ cardId: card.id, message: "bridge must cross school boundary" });
    }
    const schoolCards = bySchool.get(card.school) ?? [];
    schoolCards.push(card);
    bySchool.set(card.school, schoolCards);
    for (const effect of collectEffects(card.effects)) {
      if (effect.kind === "damage" && (effect.amount <= 0 || (effect.hits ?? 1) <= 0)) {
        issues.push({ cardId: card.id, message: "damage effect must have positive amount/hits" });
      }
      if (effect.kind === "hush" && (effect.amount < 1 || effect.amount > 3)) {
        issues.push({ cardId: card.id, message: "Hush amount must stay within the visible 1–3 cap" });
      }
      if (effect.kind === "rats" && effect.count !== undefined && (effect.count < 1 || effect.count > 3)) {
        issues.push({ cardId: card.id, message: "Rat operation count must stay within the visible 1–3 cap" });
      }
    }
  }

  for (const school of SIX_SCHOOL_IDS) {
    const cards = bySchool.get(school) ?? [];
    if (cards.length !== 6) issues.push({ message: `${school} must contain exactly six definitions` });
    if (cards.every((card) => card.bridges.length === 0)) issues.push({ message: `${school} has no cross-school bridge` });
  }

  for (const tag of REQUIRED_TAGS) {
    if (!tags.has(tag)) issues.push({ message: `required launch vocabulary is absent: ${tag}` });
  }

  for (const school of SIX_SCHOOL_IDS) {
    const threeCost = bySchool.get(school)?.filter((card) => card.cost === 3) ?? [];
    if (threeCost.length > 1) issues.push({ message: `${school} has more than one three-Energy card` });
  }

  for (const school of SIX_SCHOOL_IDS) {
    const deck = schoolSliceDeck(school);
    if (deck.length !== 12) issues.push({ message: `${school} school slice deck must contain exactly 12 slots` });
    for (const cardId of new Set(deck)) {
      if (deck.filter((id) => id === cardId).length !== 2) {
        issues.push({ cardId, message: "school slice deck must duplicate every definition exactly twice" });
      }
    }
  }

  return issues;
}
