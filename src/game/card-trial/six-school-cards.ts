/**
 * Declarative six-school card catalogue (DEFERRED EXPERIMENT).
 *
 * This file is preserved for a future Arena/expansion experiment. It is not
 * current campaign card authority: the first campaign has one explicit,
 * hero-owned pool for Old Man and one for Rat King (see
 * docs/design/2026-08-27-two-hero-card-pools.md). It is a phase-one (36 unique
 * card) transcription kept separate from the campaign resolver until the
 * six-school model is explicitly reactivated and its semantic rules are
 * compiled and tested.
 * The effect vocabulary is deliberately domain-specific: a future resolver
 * should read these rules directly rather than infer timing from card text or
 * grow one hard-coded branch per card id.
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

export type SixSchoolCost = 1 | 2 | 3;

/** Card UI target or a target bound by a Foretold Omen. */
export type SixSchoolTarget =
  | "self"
  | "primary"
  | "second"
  | "all"
  | "others"
  | "bound-omen-target"
  | "hushed-enemy"
  | "enemy-targeting-old-man-row";

export type SixSchoolRecipient = "self" | "old-man" | "rat-king" | "both";

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

/** Conditions used by immediate card riders. Each name carries its timing. */
export type SixSchoolCondition =
  | { kind: "target-crowned" }
  | { kind: "target-opened" }
  | { kind: "target-was-opened" }
  | { kind: "target-was-hushed" }
  | { kind: "target-opened-by-card" }
  | { kind: "opened-fracture-available" }
  | { kind: "target-bound-to-omen" }
  | { kind: "target-alive" }
  | { kind: "target-killed-by-card" }
  | { kind: "any-enemy-hushed" }
  | { kind: "crowned-enemy-intent-targets"; hero: Extract<SixSchoolRecipient, "old-man" | "rat-king"> }
  | { kind: "current-intent-targets"; hero: Extract<SixSchoolRecipient, "old-man" | "rat-king"> }
  | { kind: "current-intent-has-trait"; trait: "spell" | "sovereign" }
  | { kind: "current-intent-has-break" }
  | { kind: "current-intent-has-no-break" }
  | { kind: "bound-intent-was-broken" }
  | { kind: "all-card-hits-dealt-hp" }
  | { kind: "has-recoverable-hp" }
  | { kind: "has-ready-rat" }
  | { kind: "has-any-rat" }
  | { kind: "has-spent-rat" }
  | { kind: "has-spent-rat-in-other-row" }
  | { kind: "self-row"; row: PlayerRow }
  | { kind: "foretold-omen-exists" }
  | { kind: "not"; condition: SixSchoolCondition }
  | { kind: "all"; conditions: readonly SixSchoolCondition[] };

export type SixSchoolOmenCondition =
  | { kind: "after-player-cards"; amount: number }
  | { kind: "after-bound-enemy-acts" }
  | { kind: "when-bound-enemy-becomes-opened" }
  | { kind: "when-bound-enemy-reaches-cracks"; amount: number }
  | { kind: "when-next-intent-targets"; hero: Extract<SixSchoolRecipient, "old-man" | "rat-king"> }
  | { kind: "any-of"; conditions: readonly SixSchoolOmenCondition[] };

export type SixSchoolBarrierAmount =
  | number
  | { kind: "per-rat-in-row"; row: "self" | "other" | "summoned"; perRat: number; max: number }
  | { kind: "resonance-held-before-card" };

export type SixSchoolHitRider = {
  hit: number;
  when: SixSchoolCondition;
  effects: readonly SixSchoolEffect[];
};

export type SixSchoolRatSource = "ready" | "all";
export type SixSchoolRatSelection = "one" | "up-to" | "all";

/**
 * The semantic card vocabulary. Generic effects cover ordinary arithmetic;
 * named effects cover rules with their own timing, selection, or fallback
 * semantics (Hush conversion, Rat commands, Omens, tribute, and so on).
 */
export type SixSchoolEffect =
  | {
      kind: "damage";
      amount: number;
      target?: SixSchoolTarget;
      hits?: number;
      piercing?: boolean;
      hitRiders?: readonly SixSchoolHitRider[];
    }
  | { kind: "barrier"; amount: SixSchoolBarrierAmount; recipient?: SixSchoolRecipient }
  | { kind: "clear-barrier"; recipient?: SixSchoolRecipient }
  | { kind: "move"; actor: "self" | "old-man" | "rat-king"; destination: PlayerRow | "other" | "either" }
  | { kind: "hush"; amount: number; target?: SixSchoolTarget }
  | { kind: "seal"; target?: SixSchoolTarget }
  | { kind: "open"; target?: SixSchoolTarget }
  | { kind: "crack"; amount: number; target?: SixSchoolTarget }
  | { kind: "break"; amount: number; target?: SixSchoolTarget }
  | {
      kind: "break-or-damage";
      amount: number;
      target?: SixSchoolTarget;
      fallbackDamage: number;
      crownedBonus?: number;
    }
  | { kind: "crown"; target?: SixSchoolTarget }
  | { kind: "decree"; id: string }
  | { kind: "summon-rat"; count: number; row: "self" | "either"; state: "ready" }
  | {
      kind: "ready-rats";
      selection: SixSchoolRatSelection;
      count?: number;
      source: "spent" | "all";
      ifNone?: readonly SixSchoolEffect[];
    }
  | {
      kind: "command-rats";
      selection: SixSchoolRatSelection;
      max?: number;
      source: SixSchoolRatSource;
      biteDamage: number;
      target?: SixSchoolTarget;
      readyBeforeCommand?: number;
      leaveReady?: boolean;
      missingFallback?: { effects: readonly SixSchoolEffect[]; perMissing: boolean };
      noBiteFallback?: readonly SixSchoolEffect[];
    }
  | {
      kind: "move-rat";
      destination: "other" | "either";
      biteDamage: number;
      target?: SixSchoolTarget;
      ifNoRat?: readonly SixSchoolEffect[];
    }
  | { kind: "consume-rats"; selection: SixSchoolRatSelection; count?: number; source: "ready" | "spent" | "all" }
  | { kind: "consume-opened"; optional: true; then: readonly SixSchoolEffect[] }
  | {
      kind: "foretell";
      bind: "primary" | "none";
      condition: SixSchoolOmenCondition;
      immediate: readonly SixSchoolEffect[];
      omen: readonly SixSchoolEffect[];
    }
  | {
      kind: "recall-omen";
      optional: true;
      ifBoundTargetLiving?: readonly SixSchoolEffect[];
      always?: readonly SixSchoolEffect[];
    }
  | { kind: "resolve-omen"; then: readonly SixSchoolEffect[]; otherwise: readonly SixSchoolEffect[] }
  | { kind: "resonance"; operation: "gain"; amount: number; recipient?: Extract<SixSchoolRecipient, "self" | "old-man" | "rat-king"> }
  | { kind: "resonance-threshold"; threshold: number; then: readonly SixSchoolEffect[]; spend: false }
  | { kind: "resonance-overflow"; convertsTo: "barrier" }
  | { kind: "spend-resonance"; amount: number; optional: true; then: readonly SixSchoolEffect[] }
  | {
      kind: "consume-hush";
      remove: "any" | "one" | "all" | "all-but-one";
      optional?: true;
      conversion:
        | { kind: "break"; amountPerRemoved: number; fallbackDamage?: number }
        | { kind: "damage"; amountPerRemoved: number; hitsPerRemoved: number };
    }
  | { kind: "magnitude"; threshold: number; then: readonly SixSchoolEffect[] }
  | { kind: "overchannel"; optional: true; spend: "all" | "exact"; amount?: number; perResonance: readonly SixSchoolEffect[] }
  | { kind: "blood-price"; amount: number; optional: true; payment: "recoverable-hp"; then: readonly SixSchoolEffect[] }
  | { kind: "devour"; amount: number; excess: "lost" | "barrier" }
  | {
      kind: "conditional";
      when: SixSchoolCondition;
      then: readonly SixSchoolEffect[];
      otherwise?: readonly SixSchoolEffect[];
      optional?: true;
    }
  | {
      kind: "tribute";
      requiresCrowned: true;
      selection: "up-to";
      maxBarrier: number;
      payout: "barrier" | "devour" | "rat-bites";
      biteDamage?: number;
      barrierPerBite?: number;
      ratSource?: "ready";
      fallback: readonly SixSchoolEffect[];
    };

export interface SixSchoolBranch {
  id: string;
  name: string;
  text: string;
  /** A branch may alter cost, as Sooner Hour does. */
  cost?: SixSchoolCost;
  effects: readonly SixSchoolEffect[];
}

export interface SixSchoolCardDef {
  id: string;
  name: string;
  hero: HeroId;
  school: SixSchoolId;
  rarity: SixSchoolRarity;
  cost: SixSchoolCost;
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
  hits = 1,
  options: { piercing?: boolean; hitRiders?: readonly SixSchoolHitRider[] } = {}
): SixSchoolEffect => ({
  kind: "damage",
  amount,
  ...(target === "primary" ? {} : { target }),
  ...(hits === 1 ? {} : { hits }),
  ...options,
});

const barrier = (amount: SixSchoolBarrierAmount, recipient?: SixSchoolRecipient): SixSchoolEffect => ({
  kind: "barrier",
  amount,
  ...(recipient ? { recipient } : {}),
});
const clearBarrier = (recipient?: SixSchoolRecipient): SixSchoolEffect => ({
  kind: "clear-barrier",
  ...(recipient ? { recipient } : {}),
});
const hush = (amount: number, target?: SixSchoolTarget): SixSchoolEffect => ({
  kind: "hush",
  amount,
  ...(target && target !== "primary" ? { target } : {}),
});
const seal = (target?: SixSchoolTarget): SixSchoolEffect => ({
  kind: "seal",
  ...(target && target !== "primary" ? { target } : {}),
});
const open = (target?: SixSchoolTarget): SixSchoolEffect => ({
  kind: "open",
  ...(target && target !== "primary" ? { target } : {}),
});
const crown = (target?: SixSchoolTarget): SixSchoolEffect => ({
  kind: "crown",
  ...(target && target !== "primary" ? { target } : {}),
});
const breakIntent = (amount: number, target?: SixSchoolTarget): SixSchoolEffect => ({
  kind: "break",
  amount,
  ...(target && target !== "primary" ? { target } : {}),
});
const breakOrDamage = (amount: number, fallbackDamage: number, crownedBonus?: number): SixSchoolEffect => ({
  kind: "break-or-damage",
  amount,
  fallbackDamage,
  ...(crownedBonus === undefined ? {} : { crownedBonus }),
});
const move = (
  actor: "self" | "old-man" | "rat-king",
  destination: PlayerRow | "other" | "either"
): SixSchoolEffect => ({ kind: "move", actor, destination });
const summonRat = (count = 1, row: "self" | "either" = "self"): SixSchoolEffect => ({
  kind: "summon-rat",
  count,
  row,
  state: "ready",
});
const readyRats = (
  selection: SixSchoolRatSelection,
  source: "spent" | "all" = "spent",
  count?: number,
  ifNone?: readonly SixSchoolEffect[]
): SixSchoolEffect => ({
  kind: "ready-rats",
  selection,
  source,
  ...(count === undefined ? {} : { count }),
  ...(ifNone ? { ifNone } : {}),
});
const commandRats = (
  options: Omit<Extract<SixSchoolEffect, { kind: "command-rats" }>, "kind">
): SixSchoolEffect => ({ kind: "command-rats", ...options });
const consumeRats = (
  selection: SixSchoolRatSelection,
  source: "ready" | "spent" | "all",
  count?: number
): SixSchoolEffect => ({
  kind: "consume-rats",
  selection,
  source,
  ...(count === undefined ? {} : { count }),
});
const foretell = (
  bind: "primary" | "none",
  condition: SixSchoolOmenCondition,
  immediate: readonly SixSchoolEffect[],
  omen: readonly SixSchoolEffect[]
): SixSchoolEffect => ({ kind: "foretell", bind, condition, immediate, omen });
const conditional = (
  when: SixSchoolCondition,
  then: readonly SixSchoolEffect[],
  otherwise?: readonly SixSchoolEffect[],
  optional = false
): SixSchoolEffect => ({
  kind: "conditional",
  when,
  then,
  ...(otherwise ? { otherwise } : {}),
  ...(optional ? { optional: true as const } : {}),
});
const optionalConditional = (when: SixSchoolCondition, then: readonly SixSchoolEffect[]): SixSchoolEffect =>
  conditional(when, then, undefined, true);
const magnitude = (threshold: number, then: readonly SixSchoolEffect[]): SixSchoolEffect => ({
  kind: "magnitude",
  threshold,
  then,
});
const overchannel = (
  spend: "all" | "exact",
  perResonance: readonly SixSchoolEffect[],
  amount?: number
): SixSchoolEffect => ({
  kind: "overchannel",
  optional: true,
  spend,
  ...(amount === undefined ? {} : { amount }),
  perResonance,
});
const bloodPrice = (amount: number, then: readonly SixSchoolEffect[]): SixSchoolEffect => ({
  kind: "blood-price",
  amount,
  optional: true,
  payment: "recoverable-hp",
  then,
});
const consumeHush = (
  remove: "any" | "one" | "all" | "all-but-one",
  conversion: Extract<SixSchoolEffect, { kind: "consume-hush" }>["conversion"],
  optional = false
): SixSchoolEffect => ({
  kind: "consume-hush",
  remove,
  ...(optional ? { optional: true as const } : {}),
  conversion,
});
const consumeOpened = (then: readonly SixSchoolEffect[]): SixSchoolEffect => ({ kind: "consume-opened", optional: true, then });
const devour = (amount: number, excess: "lost" | "barrier" = "lost"): SixSchoolEffect => ({
  kind: "devour",
  amount,
  excess,
});
const tribute = (
  payout: Extract<SixSchoolEffect, { kind: "tribute" }>["payout"],
  fallback: readonly SixSchoolEffect[],
  options: Partial<Pick<Extract<SixSchoolEffect, { kind: "tribute" }>, "maxBarrier" | "biteDamage" | "barrierPerBite" | "ratSource">> = {}
): SixSchoolEffect => ({ kind: "tribute", requiresCrowned: true, selection: "up-to", maxBarrier: 6, payout, fallback, ...options });

const branch = (
  id: string,
  name: string,
  text: string,
  effects: readonly SixSchoolEffect[],
  cost?: SixSchoolCost
): SixSchoolBranch => ({ id, name, text, ...(cost === undefined ? {} : { cost }), effects });

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
      branch("smothering-cinder", "Smothering Cinder", "Deal 2. Hush 2.", [damage(2), hush(2)]),
      branch("starved-cinder", "Starved Cinder", "Deal 4. Hush 1. If the target is Opened, gain 1 Resonance.", [
        damage(4),
        hush(1),
        conditional({ kind: "target-opened" }, [{ kind: "resonance", operation: "gain", amount: 1 }]),
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
    text: "Gain 6 Barrier. If any enemy is Hushed, gain 2 more.",
    effects: [barrier(6), conditional({ kind: "any-enemy-hushed" }, [barrier(2)])],
    tags: ["barrier", "hush"],
    bridges: ["astral-conduit", "starving-crown"],
    branches: [
      branch("sealed-ward", "Sealed Ward", "Gain 5 Barrier. Seal a Hushed enemy. If none is Hushed, gain 2 more Barrier.", [
        barrier(5),
        conditional({ kind: "any-enemy-hushed" }, [seal("hushed-enemy")], [barrier(2)]),
      ]),
      branch("conduit-ward", "Conduit Ward", "Gain 5 Barrier. If any enemy is Hushed, gain 1 Resonance.", [
        barrier(5),
        conditional({ kind: "any-enemy-hushed" }, [{ kind: "resonance", operation: "gain", amount: 1 }]),
      ]),
    ],
  },
  {
    id: "mute-the-bell",
    name: "Mute the Bell",
    hero: "old-man",
    school: "ashen-silence",
    rarity: "common",
    cost: 1,
    target: "primary",
    text: "Hush 2. If the target was already Hushed, deal 3.",
    effects: [hush(2), conditional({ kind: "target-was-hushed" }, [damage(3)])],
    tags: ["hush"],
    bridges: ["last-hour", "crown-of-dominion"],
    branches: [
      branch("deep-mute", "Deep Mute", "Hush 3. Remove the target's Barrier.", [hush(3), clearBarrier()]),
      branch("cracked-bell", "Cracked Bell", "Hush 1. Add 4 Break progress. If the intent has no Break, deal 4 instead.", [
        hush(1),
        breakOrDamage(4, 4),
      ]),
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
    text: "Deal 3. Seal the target.",
    effects: [damage(3), seal()],
    tags: ["seal"],
    bridges: ["crown-of-dominion", "starving-crown"],
    branches: [
      branch("pale-margin", "Pale Margin", "Deal 2. Hush 1. Seal the target.", [damage(2), hush(1), seal()]),
      branch("closing-margin", "Closing Margin", "Deal 5. Seal the target.", [damage(5), seal()]),
    ],
  },
  {
    id: "cut-the-chant",
    name: "Cut the Chant",
    hero: "old-man",
    school: "ashen-silence",
    rarity: "uncommon",
    cost: 1,
    target: "primary",
    text: "Deal 3. You may remove any Hush from the target. For each removed, add 3 Break progress; if its intent has no Break, deal 2 as a separate hit instead.",
    effects: [
      damage(3),
        consumeHush("any", { kind: "break", amountPerRemoved: 3, fallbackDamage: 2 }, true),
    ],
    tags: ["hush", "break"],
    bridges: ["astral-conduit", "broodcraft"],
    branches: [
      branch("measured-cut", "Measured Cut", "Deal 3. You may remove 1 Hush. Add 6 Break progress; if there is no Break, deal 4 instead.", [
        damage(3),
        consumeHush("one", { kind: "break", amountPerRemoved: 6, fallbackDamage: 4 }, true),
      ]),
      branch("ragged-cut", "Ragged Cut", "Deal 3. Remove any Hush. Each removed Hush deals 1 twice instead.", [
        damage(3),
        consumeHush("any", { kind: "damage", amountPerRemoved: 1, hitsPerRemoved: 2 }, true),
      ]),
    ],
  },
  {
    id: "final-word",
    name: "Final Word",
    hero: "old-man",
    school: "ashen-silence",
    rarity: "rare",
    cost: 2,
    target: "primary",
    text: "Deal 7. Remove all Hush from the target. For each removed, deal 2 as a separate hit.",
    effects: [damage(7), consumeHush("all", { kind: "damage", amountPerRemoved: 2, hitsPerRemoved: 1 })],
    tags: ["hush"],
    bridges: ["last-hour", "astral-conduit"],
    branches: [
      branch("lingering-word", "Lingering Word", "Deal 6. Remove all but 1 Hush. For each removed, deal 2 as a separate hit.", [
        damage(6),
        consumeHush("all-but-one", { kind: "damage", amountPerRemoved: 2, hitsPerRemoved: 1 }),
      ]),
      branch("shattering-word", "Shattering Word", "Deal 7. Remove all Hush. For each removed, deal 3 as a separate hit.", [
        damage(7),
        consumeHush("all", { kind: "damage", amountPerRemoved: 3, hitsPerRemoved: 1 }),
      ]),
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
    text: "Foretell: deal 2 to the bound enemy. Omen — after three later player cards are played: deal 6 to it.",
    effects: [foretell("primary", { kind: "after-player-cards", amount: 3 }, [damage(2)], [damage(6)])],
    tags: ["omen"],
    bridges: ["broodcraft", "crown-of-dominion"],
    branches: [
      branch("hasty-knocks", "Hasty Knocks", "Omen — after two later player cards: deal 4.", [foretell("primary", { kind: "after-player-cards", amount: 2 }, [], [damage(4)])]),
      branch("funeral-knocks", "Funeral Knocks", "Omen — after four later player cards: deal 9 and Hush 1.", [foretell("primary", { kind: "after-player-cards", amount: 4 }, [], [damage(9), hush(1)])]),
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
    text: "Foretell: Hush 1 on the bound enemy. Omen — after it acts: deal 6 to it.",
    effects: [foretell("primary", { kind: "after-bound-enemy-acts" }, [hush(1)], [damage(6)])],
    tags: ["hush", "omen"],
    bridges: ["ashen-silence", "crown-of-dominion"],
    branches: [
      branch("merciful-delay", "Merciful Delay", "Omen — after it acts: deal 4 and Hush 2 on its new intent.", [foretell("primary", { kind: "after-bound-enemy-acts" }, [], [damage(4), hush(2)])]),
      branch("exact-appointment", "Exact Appointment", "Omen — after it acts: deal 6; if that intent was Broken, deal 10 instead.", [
        foretell("primary", { kind: "after-bound-enemy-acts" }, [], [
          conditional({ kind: "bound-intent-was-broken" }, [damage(10)], [damage(6)]),
        ]),
      ]),
    ],
  },
  {
    id: "a-death-foreseen",
    name: "A Death Foreseen",
    hero: "old-man",
    school: "last-hour",
    rarity: "common",
    cost: 1,
    target: "primary",
    text: "Foretell: gain 3 Barrier. Omen — when the bound enemy becomes Opened: deal 7 to it.",
    effects: [foretell("primary", { kind: "when-bound-enemy-becomes-opened" }, [barrier(3)], [damage(7)])],
    tags: ["barrier", "omen", "opened"],
    bridges: ["broodcraft", "crown-of-dominion"],
    branches: [
      branch("death-glimpsed", "Death Glimpsed", "Omen — when it reaches 2 cracks or becomes Opened: deal 5.", [
        foretell("primary", { kind: "any-of", conditions: [
          { kind: "when-bound-enemy-reaches-cracks", amount: 2 },
          { kind: "when-bound-enemy-becomes-opened" },
        ] }, [], [damage(5)]),
      ]),
      branch("death-certain", "Death Certain", "Omen — when it becomes Opened: deal 3 three times.", [
        foretell("primary", { kind: "when-bound-enemy-becomes-opened" }, [], [damage(3, "primary", 3)]),
      ]),
    ],
  },
  {
    id: "appointment-kept",
    name: "Appointment Kept",
    hero: "old-man",
    school: "last-hour",
    rarity: "common",
    cost: 1,
    target: "primary",
    text: "Deal 5. If the target is bound by your Omen, gain 3 Barrier.",
    effects: [damage(5), conditional({ kind: "target-bound-to-omen" }, [barrier(3)])],
    tags: ["omen", "barrier"],
    bridges: ["astral-conduit", "starving-crown"],
    branches: [
      branch("patient-appointment", "Patient Appointment", "Deal 4. If bound, gain 3 Barrier and Hush 1.", [
        damage(4),
        conditional({ kind: "target-bound-to-omen" }, [barrier(3), hush(1)]),
      ]),
      branch("final-appointment", "Final Appointment", "Deal 7. Magnitude 9: Open the target if it is bound.", [
        damage(7),
        magnitude(9, [conditional({ kind: "target-bound-to-omen" }, [open()])]),
      ]),
    ],
  },
  {
    id: "borrowed-moment",
    name: "Borrowed Moment",
    hero: "old-man",
    school: "last-hour",
    rarity: "uncommon",
    cost: 1,
    target: "self",
    text: "Gain 5 Barrier. You may Recall your Omen. If you do, deal 3 to its bound target, if living, and gain 1 Resonance.",
    effects: [
      barrier(5),
      {
        kind: "recall-omen",
        optional: true,
        ifBoundTargetLiving: [damage(3, "bound-omen-target")],
        always: [{ kind: "resonance", operation: "gain", amount: 1 }],
      },
    ],
    tags: ["barrier", "omen", "resonance"],
    bridges: ["ashen-silence", "astral-conduit"],
    branches: [
      branch("moment-of-ash", "Moment of Ash", "Gain 5 Barrier. On Recall, Hush 2 the bound target instead of dealing damage; gain 1 Resonance.", [
        barrier(5),
        {
          kind: "recall-omen",
          optional: true,
          ifBoundTargetLiving: [hush(2)],
          always: [{ kind: "resonance", operation: "gain", amount: 1 }],
        },
      ]),
      branch("moment-of-stars", "Moment of Stars", "Gain 4 Barrier. On Recall, gain 2 Resonance; deal no damage.", [
        barrier(4),
        { kind: "recall-omen", optional: true, always: [{ kind: "resonance", operation: "gain", amount: 2 }] },
      ]),
    ],
  },
  {
    id: "the-hour-comes-round",
    name: "The Hour Comes Round",
    hero: "old-man",
    school: "last-hour",
    rarity: "rare",
    cost: 2,
    target: "primary",
    text: "If an Omen is Foretold, resolve it now, then deal 3 to the target. If none is Foretold, deal 8 instead.",
    effects: [{ kind: "resolve-omen", then: [damage(3)], otherwise: [damage(8)] }],
    tags: ["omen"],
    bridges: ["ashen-silence", "astral-conduit"],
    branches: [
      branch("sooner-hour", "Sooner Hour", "Resolve your Foretold Omen now. If none is Foretold, deal 4.", [
        { kind: "resolve-omen", then: [], otherwise: [damage(4)] },
      ], 1),
      branch("black-hour", "Black Hour", "Resolve your Foretold Omen now, then Hush 2 the target. If none is Foretold, deal 8 and Hush 1.", [
        { kind: "resolve-omen", then: [hush(2)], otherwise: [damage(8), hush(1)] },
      ]),
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
    text: "Deal 5. Magnitude 7: gain 1 Resonance.",
    effects: [damage(5), magnitude(7, [{ kind: "resonance", operation: "gain", amount: 1 }])],
    tags: ["resonance", "magnitude"],
    bridges: ["broodcraft", "last-hour"],
    branches: [
      branch("convergent-lance", "Convergent Star Lance", "Deal 4. Gain 1 Resonance.", [damage(4), { kind: "resonance", operation: "gain", amount: 1 }]),
      branch("ruinous-lance", "Ruinous Star Lance", "Deal 6. Magnitude 8: deal 3 again, piercing Barrier.", [damage(6), magnitude(8, [damage(3, "primary", 1, { piercing: true })])]),
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
    text: "Deal 2 twice. If both hits deal HP damage, gain 1 Resonance.",
    effects: [
      damage(2, "primary", 2),
      conditional({ kind: "all-card-hits-dealt-hp" }, [{ kind: "resonance", operation: "gain", amount: 1 }]),
    ],
    tags: ["resonance"],
    bridges: ["broodcraft", "last-hour"],
    branches: [
      branch("triple-conjunction", "Triple Conjunction", "Deal 2 three times. Do not gain Resonance.", [damage(2, "primary", 3)]),
      branch("quiet-conjunction", "Quiet Conjunction", "Deal 2 twice. If both hits deal HP damage, gain 1 Resonance and Hush 1.", [
        damage(2, "primary", 2),
        conditional({ kind: "all-card-hits-dealt-hp" }, [{ kind: "resonance", operation: "gain", amount: 1 }, hush(1)]),
      ]),
    ],
  },
  {
    id: "chart-the-wound",
    name: "Chart the Wound",
    hero: "old-man",
    school: "astral-conduit",
    rarity: "common",
    cost: 1,
    target: "primary",
    text: "Deal 3. Open the target. If it was already Opened, gain 1 Resonance instead.",
    effects: [damage(3), conditional({ kind: "target-was-opened" }, [{ kind: "resonance", operation: "gain", amount: 1 }], [open()])],
    tags: ["opened", "resonance"],
    bridges: ["broodcraft", "crown-of-dominion"],
    branches: [
      branch("convergent-chart", "Convergent Chart", "Deal 2. Open the target. Gain 1 Resonance whether Opened moves or stays.", [damage(2), open(), { kind: "resonance", operation: "gain", amount: 1 }]),
      branch("exploded-chart", "Exploded Chart", "Deal 5. Open the target. If it was already Opened, add 4 Break progress instead; if its intent has no Break, Hush 1 instead.", [
        damage(5),
        open(),
        conditional({ kind: "target-was-opened" }, [
          conditional({ kind: "current-intent-has-break" }, [breakIntent(4)], [hush(1)]),
        ]),
      ]),
    ],
  },
  {
    id: "constellation-ward",
    name: "Constellation Ward",
    hero: "old-man",
    school: "astral-conduit",
    rarity: "common",
    cost: 1,
    target: "self",
    text: "Gain 5 Barrier. Resonance 3: gain 3 more; Resonance is not spent.",
    effects: [barrier(5), { kind: "resonance-threshold", threshold: 3, then: [barrier(3)], spend: false }],
    tags: ["barrier", "resonance"],
    bridges: ["ashen-silence", "starving-crown"],
    branches: [
      branch("orbiting-ward", "Orbiting Ward", "Gain 4 Barrier. Resonance 3: gain 3 more and Hush 1 an enemy targeting Old Man's row.", [
        barrier(4),
        { kind: "resonance-threshold", threshold: 3, then: [barrier(3), hush(1, "enemy-targeting-old-man-row")], spend: false },
      ]),
      branch("spent-constellation", "Spent Constellation", "Gain 5 Barrier. You may spend 1 Resonance to gain 7 more.", [
        barrier(5),
        { kind: "spend-resonance", amount: 1, optional: true, then: [barrier(7)] },
      ]),
    ],
  },
  {
    id: "astral-reserve",
    name: "Astral Reserve",
    hero: "old-man",
    school: "astral-conduit",
    rarity: "uncommon",
    cost: 1,
    target: "self",
    text: "Gain 2 Resonance. Normal overflow becomes Barrier.",
    effects: [{ kind: "resonance", operation: "gain", amount: 2 }, { kind: "resonance-overflow", convertsTo: "barrier" }],
    tags: ["barrier", "resonance"],
    bridges: ["ashen-silence", "last-hour"],
    branches: [
      branch("closed-circuit", "Closed Circuit", "Gain 1 Resonance. Gain Barrier equal to Resonance held before this card.", [
        { kind: "resonance", operation: "gain", amount: 1 },
        barrier({ kind: "resonance-held-before-card" }),
      ]),
      branch("open-circuit", "Open Circuit", "Gain 3 Resonance. Move to Front and remove all Barrier.", [
        { kind: "resonance", operation: "gain", amount: 3 },
        move("old-man", "front"),
        clearBarrier(),
      ]),
    ],
  },
  {
    id: "collapse-the-constellation",
    name: "Collapse the Constellation",
    hero: "old-man",
    school: "astral-conduit",
    rarity: "signature",
    cost: 2,
    target: "all",
    text: "Deal 4 to all enemies. Overchannel: for each Resonance spent, deal 2 to all enemies as a separate hit.",
    effects: [damage(4, "all"), overchannel("all", [damage(2, "all")])],
    tags: ["resonance", "overchannel"],
    bridges: ["broodcraft", "last-hour"],
    branches: [
      branch("controlled-collapse", "Controlled Collapse", "Overchannel may spend exactly 3 Resonance instead of all; deal 2 to all per point spent.", [damage(4, "all"), overchannel("exact", [damage(2, "all")], 3)]),
      branch("singular-collapse", "Singular Collapse", "Target one enemy. Deal 8. Overchannel: deal 3 again per Resonance spent.", [damage(8), overchannel("all", [damage(3)])]),
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
    text: "Deal 3. Summon a Rat on your row.",
    effects: [damage(3), summonRat()],
    tags: ["rats"],
    bridges: ["crown-of-dominion", "starving-crown"],
    branches: [
      branch("prolific-litter", "Prolific Litter", "Deal 1. Summon two Rats on your row.", [damage(1), summonRat(2)]),
      branch("feral-litter", "Feral Litter", "Deal 5. If you have no Rats, summon one on your row.", [
        damage(5),
        conditional({ kind: "has-any-rat" }, [], [summonRat()]),
      ]),
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
    text: "Deal 5. If the target is Crowned, Ready one Spent Rat.",
    effects: [damage(5), conditional({ kind: "target-crowned" }, [readyRats("one")])],
    tags: ["crowned", "rats"],
    bridges: ["ashen-silence", "astral-conduit"],
    branches: [
      branch("courtly-nip", "Courtly Nip", "Deal 4. If Crowned, Ready up to two Spent Rats.", [damage(4), conditional({ kind: "target-crowned" }, [readyRats("up-to", "spent", 2)])]),
      branch("hungry-nip", "Hungry Nip", "Deal 5. Magnitude 7: Devour 2.", [damage(5), magnitude(7, [devour(2)])]),
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
    text: "Deal 2 twice. If the target is not Opened, the second hit counts as two cracks.",
    effects: [
      damage(2, "primary", 2, {
        hitRiders: [{ hit: 2, when: { kind: "not", condition: { kind: "target-was-opened" } }, effects: [{ kind: "crack", amount: 2 }] }],
      }),
    ],
    tags: ["opened"],
    bridges: ["last-hour", "astral-conduit"],
    branches: [
      branch("many-teeth-in-the-rank", "Many Teeth in the Rank", "Deal 1 three times. If this Opens the target, gain 3 Barrier.", [
        damage(1, "primary", 3),
        conditional({ kind: "target-opened-by-card" }, [barrier(3)]),
      ]),
      branch("the-kings-breach", "The King's Breach", "Deal 2 twice. When this Opens the target, Crown it.", [
        damage(2, "primary", 2),
        conditional({ kind: "target-opened-by-card" }, [crown()]),
      ]),
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
    text: "Command as many Ready Rats as possible, up to two, to bite for 2 each. Deal 2 for each Rat fewer than two that bites.",
    effects: [commandRats({ selection: "up-to", max: 2, source: "ready", biteDamage: 2, missingFallback: { effects: [damage(2)], perMissing: true } })],
    tags: ["rats"],
    bridges: ["crown-of-dominion", "astral-conduit"],
    branches: [
      branch("full-gnawing-court", "Full Gnawing Court", "Command as many Ready Rats as possible, up to three, for 2 each. Deal 2 for each Rat fewer than three that bites.", [
        commandRats({ selection: "up-to", max: 3, source: "ready", biteDamage: 2, missingFallback: { effects: [damage(2)], perMissing: true } }),
      ]),
      branch("civil-gnawing-court", "Civil Gnawing Court", "Command as many Ready Rats as possible, up to two, to bite for 1 without becoming Spent. Deal 2 for each missing Rat.", [
        commandRats({ selection: "up-to", max: 2, source: "ready", biteDamage: 1, leaveReady: true, missingFallback: { effects: [damage(2)], perMissing: true } }),
      ]),
    ],
  },
  {
    id: "nest-underfoot",
    name: "Nest Underfoot",
    hero: "rat-king",
    school: "broodcraft",
    rarity: "common",
    cost: 1,
    target: "self",
    text: "Summon a Rat on your row. Gain 2 Barrier per Rat in your row, maximum 6.",
    effects: [summonRat(), barrier({ kind: "per-rat-in-row", row: "self", perRat: 2, max: 6 })],
    tags: ["rats", "barrier"],
    bridges: ["starving-crown", "crown-of-dominion"],
    branches: [
      branch("deep-nest", "Deep Nest", "Summon a Rat in either row. Gain 3 Barrier per Rat in that row, maximum 6.", [
        summonRat(1, "either"),
        barrier({ kind: "per-rat-in-row", row: "summoned", perRat: 3, max: 6 }),
      ]),
      branch("hungry-nest", "Hungry Nest", "Summon a Rat. You may consume a Spent Rat in the other row to Devour 3 and gain 3 more Barrier.", [
        summonRat(),
        optionalConditional({ kind: "has-spent-rat-in-other-row" }, [consumeRats("one", "spent", 1), devour(3), barrier(3)]),
      ]),
    ],
  },
  {
    id: "swarm-the-wound",
    name: "Swarm the Wound",
    hero: "rat-king",
    school: "broodcraft",
    rarity: "rare",
    cost: 2,
    target: "primary",
    text: "Deal 6. Command every Ready Rat to bite the target for 2. If no Rat bites, deal 2 more. Consume Opened: Ready one Rat afterward.",
    effects: [
      damage(6),
      commandRats({ selection: "all", source: "ready", biteDamage: 2, noBiteFallback: [damage(2)] }),
      consumeOpened([readyRats("one")]),
    ],
    tags: ["rats", "opened"],
    bridges: ["last-hour", "astral-conduit"],
    branches: [
      branch("patient-swarm", "Patient Swarm", "Deal 6. Every Ready Rat bites for 1 without becoming Spent. If none bites, deal 2 more. Do not Consume Opened.", [
        damage(6),
        commandRats({ selection: "all", source: "ready", biteDamage: 1, leaveReady: true, noBiteFallback: [damage(2)] }),
      ]),
      branch("ravenous-swarm", "Ravenous Swarm", "Deal 6. Every Ready Rat bites for 3. If none bites, deal 2 more. Consume Opened: consume one Rat afterward.", [
        damage(6),
        commandRats({ selection: "all", source: "ready", biteDamage: 3, noBiteFallback: [damage(2)] }),
        consumeOpened([consumeRats("one", "all", 1)]),
      ]),
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
      branch("kneel-before-teeth", "Kneel Before Teeth", "Deal 3. Crown the target. Ready one Spent Rat.", [damage(3), crown(), readyRats("one")]),
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
    text: "Gain 5 Barrier. If the Crowned enemy's current intent names Rat King, gain 3 more.",
    effects: [barrier(5), conditional({ kind: "crowned-enemy-intent-targets", hero: "rat-king" }, [barrier(3)])],
    tags: ["barrier", "crowned"],
    bridges: ["ashen-silence", "starving-crown"],
    branches: [
      branch("guard-the-court", "Guard the Court", "Gain 5 Barrier. If Crown points at Rat King, Old Man gains 3 Barrier too.", [
        barrier(5),
        conditional({ kind: "crowned-enemy-intent-targets", hero: "rat-king" }, [barrier(3, "old-man")]),
      ]),
      branch("guard-the-hunger", "Guard the Hunger", "Gain 5 Barrier. If Crown points at Rat King, Devour 2.", [
        barrier(5),
        conditional({ kind: "crowned-enemy-intent-targets", hero: "rat-king" }, [devour(2)]),
      ]),
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
    text: "Deal 4. If the target is Crowned, Ready and command one Rat to bite it for 2. If no Rat exists, deal 2 more instead.",
    effects: [
      damage(4),
      conditional({ kind: "target-crowned" }, [commandRats({ selection: "one", max: 1, source: "ready", biteDamage: 2, readyBeforeCommand: 1, noBiteFallback: [damage(2)] })]),
    ],
    tags: ["crowned", "rats"],
    bridges: ["broodcraft", "last-hour"],
    branches: [
      branch("the-king-insists", "The King Insists", "Deal 3. If Crowned, Ready and command up to two Rats for 2 each; deal 2 for each missing Rat.", [
        damage(3),
        conditional({ kind: "target-crowned" }, [commandRats({ selection: "up-to", max: 2, source: "ready", biteDamage: 2, readyBeforeCommand: 2, missingFallback: { effects: [damage(2)], perMissing: true } })]),
      ]),
      branch("the-king-accuses", "The King Accuses", "Deal 6. If Crowned and no Rat bites, add 4 Break progress.", [
        damage(6),
        conditional({ kind: "target-crowned" }, [commandRats({ selection: "one", max: 1, source: "ready", biteDamage: 2, noBiteFallback: [breakIntent(4)] })]),
      ]),
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
    text: "Deal 3. If the target is Crowned, remove up to 6 of its Barrier and gain that much Barrier. If it is not Crowned or none is removed, deal 2 more.",
    effects: [damage(3), tribute("barrier", [damage(2)])],
    tags: ["crowned", "barrier"],
    bridges: ["ashen-silence", "starving-crown"],
    branches: [
      branch("living-tribute", "Living Tribute", "Deal 3. If Crowned, remove up to 6 Barrier and Devour that much; if not Crowned or none is removed, deal 2 more.", [
        damage(3),
        tribute("devour", [damage(2)]),
      ]),
      branch("tribute-in-teeth", "Tribute in Teeth", "Deal 3. If Crowned, remove up to 4 Barrier; for every 2 removed, command one Ready Rat to bite for 2. If not Crowned or none is removed, deal 2 more.", [
        damage(3),
        tribute("rat-bites", [damage(2)], { maxBarrier: 4, biteDamage: 2, barrierPerBite: 2, ratSource: "ready" }),
      ]),
    ],
  },
  {
    id: "decree-be-still",
    name: "Decree: Be Still",
    hero: "rat-king",
    school: "crown-of-dominion",
    rarity: "uncommon",
    cost: 1,
    target: "primary",
    text: "Hush 1. If Crowned, Hush 1 more. If its current intent is Sovereign, add 4 Break progress; if it has no Break, deal 4 instead.",
    effects: [
      { kind: "decree", id: "be-still" },
      hush(1),
      conditional({ kind: "target-crowned" }, [hush(1)]),
      conditional({ kind: "current-intent-has-trait", trait: "sovereign" }, [breakOrDamage(4, 4)]),
    ],
    tags: ["decree", "hush", "break", "crowned"],
    bridges: ["ashen-silence", "last-hour"],
    branches: [
      branch("decree-be-silent", "Decree: Be Silent", "Hush 1. If Crowned, Hush 1 more and Seal.", [
        { kind: "decree", id: "be-silent" },
        hush(1),
        conditional({ kind: "target-crowned" }, [hush(1), seal()]),
      ]),
      branch("decree-be-broken", "Decree: Be Broken", "Hush 1. Add 3 Break progress; if Crowned, add 3 more. If the intent has no Break, deal the same amount instead.", [
        { kind: "decree", id: "be-broken" },
        hush(1),
        breakOrDamage(3, 3, 3),
      ]),
    ],
  },
  {
    id: "condemnation",
    name: "Condemnation",
    hero: "rat-king",
    school: "crown-of-dominion",
    rarity: "rare",
    cost: 2,
    target: "primary",
    text: "Deal 7. If Crowned and still alive, Open it and command one Ready Rat to bite for 2; if no Rat can, gain 3 Barrier.",
    effects: [
      damage(7),
      conditional({ kind: "all", conditions: [{ kind: "target-crowned" }, { kind: "target-alive" }] }, [
        open(),
        commandRats({ selection: "one", max: 1, source: "ready", biteDamage: 2, noBiteFallback: [barrier(3)] }),
      ]),
    ],
    tags: ["crowned", "opened", "rats"],
    bridges: ["last-hour", "astral-conduit"],
    branches: [
      branch("public-condemnation", "Public Condemnation", "Deal 5. If Crowned, Open it and command every Ready Rat to bite for 1.", [
        damage(5),
        conditional({ kind: "target-crowned" }, [open(), commandRats({ selection: "all", source: "ready", biteDamage: 1 })]),
      ]),
      branch("secret-condemnation", "Secret Condemnation", "Deal 9. If Crowned, Open it and gain 1 Resonance for Old Man.", [
        damage(9),
        conditional({ kind: "target-crowned" }, [open(), { kind: "resonance", operation: "gain", amount: 1, recipient: "old-man" }]),
      ]),
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
      branch("closed-mouth", "Closed Mouth", "Deal 6. No Blood Price. If Opened supplies a fracture, Devour 2.", [
        damage(6),
        conditional({ kind: "opened-fracture-available" }, [devour(2)]),
      ]),
    ],
  },
  {
    id: "eat-through-it",
    name: "Eat Through It",
    hero: "rat-king",
    school: "starving-crown",
    rarity: "common",
    cost: 1,
    target: "self",
    text: "Gain 6 Barrier. Blood Price 3: move to Front and gain 5 more Barrier.",
    effects: [barrier(6), bloodPrice(3, [move("rat-king", "front"), barrier(5)])],
    tags: ["blood-price", "barrier", "movement"],
    bridges: ["broodcraft", "crown-of-dominion"],
    branches: [
      branch("hide-in-the-ribs", "Hide in the Ribs", "Gain 7 Barrier. Back: Devour 1. No Blood Price.", [
        barrier(7),
        conditional({ kind: "self-row", row: "back" }, [devour(1)]),
      ]),
      branch("teeth-through-pain", "Teeth Through Pain", "Gain 5 Barrier. Blood Price 3: move to Front, gain 5 more, and Ready one Rat.", [
        barrier(5),
        bloodPrice(3, [move("rat-king", "front"), barrier(5), readyRats("one")]),
      ]),
    ],
  },
  {
    id: "royal-appetite",
    name: "Royal Appetite",
    hero: "rat-king",
    school: "starving-crown",
    rarity: "common",
    cost: 1,
    target: "primary",
    text: "Deal 5. Magnitude 7: Devour 2.",
    effects: [damage(5), magnitude(7, [devour(2)])],
    tags: ["devour", "magnitude"],
    bridges: ["broodcraft", "ashen-silence"],
    branches: [
      branch("carrion-appetite", "Carrion Appetite", "Deal 5. If this kills, Devour 4; otherwise Magnitude 7: Devour 1.", [
        damage(5),
        conditional({ kind: "target-killed-by-card" }, [devour(4)], [magnitude(7, [devour(1)])]),
      ]),
      branch("royal-appetite-unbound", "Royal Appetite Unbound", "Deal 4. If Crowned, Devour 3; otherwise Magnitude 6: Devour 1.", [
        damage(4),
        conditional({ kind: "target-crowned" }, [devour(3)], [magnitude(6, [devour(1)])]),
      ]),
    ],
  },
  {
    id: "feast-on-the-wounded",
    name: "Feast on the Wounded",
    hero: "rat-king",
    school: "starving-crown",
    rarity: "common",
    cost: 1,
    target: "primary",
    text: "Deal 4. If the target is Opened, Devour 2. Opened stays.",
    effects: [damage(4), conditional({ kind: "target-opened" }, [devour(2)])],
    tags: ["devour", "opened"],
    bridges: ["last-hour", "astral-conduit"],
    branches: [
      branch("slow-feast", "Slow Feast", "Deal 3. If Opened, Devour 4. Opened stays.", [damage(3), conditional({ kind: "target-opened" }, [devour(4)])]),
      branch("tear-the-wound", "Tear the Wound", "Deal 5. Consume Opened: deal 3 again and Devour 2.", [
        damage(5),
        consumeOpened([damage(3), devour(2)]),
      ]),
    ],
  },
  {
    id: "crown-of-hunger",
    name: "Crown of Hunger",
    hero: "rat-king",
    school: "starving-crown",
    rarity: "uncommon",
    cost: 1,
    target: "primary",
    text: "Deal 2. Crown the target. Blood Price 3: Open it.",
    effects: [damage(2), crown(), bloodPrice(3, [open()])],
    tags: ["crowned", "blood-price", "opened", "rats"],
    bridges: ["broodcraft", "last-hour"],
    branches: [
      branch("lean-crown", "Lean Crown", "Deal 3. Crown. Blood Price 2: Hush 1 instead of Opening.", [
        damage(3),
        crown(),
        bloodPrice(2, [hush(1)]),
      ]),
      branch("ravenous-crown", "Ravenous Crown", "Deal 2. Crown. Blood Price 4: Open and command one Rat for 3; if none, gain 4 Barrier.", [
        damage(2),
        crown(),
        bloodPrice(4, [open(), commandRats({ selection: "one", max: 1, source: "ready", biteDamage: 3, noBiteFallback: [barrier(4)] })]),
      ]),
    ],
  },
  {
    id: "devour-the-spell",
    name: "Devour the Spell",
    hero: "rat-king",
    school: "starving-crown",
    rarity: "uncommon",
    cost: 1,
    target: "primary",
    text: "Hush 1. Gain 4 Barrier. If its intent is a Spell, Devour 3.",
    effects: [hush(1), barrier(4), conditional({ kind: "current-intent-has-trait", trait: "spell" }, [devour(3)])],
    tags: ["devour", "barrier", "hush"],
    bridges: ["ashen-silence", "crown-of-dominion"],
    branches: [
      branch("eat-magic", "Eat Magic", "Hush 2 and Seal. If the intent is a Spell, Devour 3; gain no Barrier.", [
        hush(2),
        seal(),
        conditional({ kind: "current-intent-has-trait", trait: "spell" }, [devour(3)]),
      ]),
      branch("eat-violence", "Eat Violence", "Hush 1. Gain 4 Barrier. If the intent is not a Spell, add 4 Break progress—or deal 4 if it has no Break—and Devour 1.", [
        hush(1),
        barrier(4),
        conditional({ kind: "not", condition: { kind: "current-intent-has-trait", trait: "spell" } }, [breakOrDamage(4, 4), devour(1)]),
      ]),
    ],
  },
] as const satisfies readonly SixSchoolCardDef[];

/** The exact phase-one IDs selected by Part X of the deferred experiment. */
export const PHASE_ONE_CARD_IDS = [
  "cinder-word",
  "ashen-ward",
  "mute-the-bell",
  "black-margin",
  "cut-the-chant",
  "final-word",
  "three-knocks",
  "death-arrives-late",
  "a-death-foreseen",
  "appointment-kept",
  "borrowed-moment",
  "the-hour-comes-round",
  "star-lance",
  "conjunction",
  "chart-the-wound",
  "constellation-ward",
  "astral-reserve",
  "collapse-the-constellation",
  "litter-the-floor",
  "nip",
  "open-the-rank",
  "gnawing-court",
  "nest-underfoot",
  "swarm-the-wound",
  "kneel",
  "royal-guard",
  "the-king-points",
  "tribute",
  "decree-be-still",
  "condemnation",
  "bite-the-hand",
  "eat-through-it",
  "royal-appetite",
  "feast-on-the-wounded",
  "crown-of-hunger",
  "devour-the-spell",
] as const;

export type SixSchoolCardId = (typeof PHASE_ONE_CARD_IDS)[number];

const CATALOGUE_BY_ID = new Map<string, SixSchoolCardDef>(
  SIX_SCHOOL_CATALOGUE.map((card): readonly [string, SixSchoolCardDef] => [card.id, card])
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

export function isSixSchoolCardId(value: string): value is SixSchoolCardId {
  return (PHASE_ONE_CARD_IDS as readonly string[]).includes(value) && CATALOGUE_BY_ID.has(value);
}

export function cardsForSchool(school: SixSchoolId): readonly SixSchoolCardDef[] {
  return SIX_SCHOOL_CATALOGUE.filter((card) => card.school === school);
}

export function cardsForHero(heroId: HeroId): readonly SixSchoolCardDef[] {
  return SIX_SCHOOL_CATALOGUE.filter((card) => card.hero === heroId);
}

/** A 12-slot fixed school package for rules-slice/Arena fixtures only. */
export function schoolSliceDeck(school: SixSchoolId): SixSchoolCardId[] {
  const cards = cardsForSchool(school);
  return cards.flatMap((card) => [card.id as SixSchoolCardId, card.id as SixSchoolCardId]);
}

/** Flatten every branch and nested fallback so content lint cannot miss a rule. */
export function flattenSixSchoolEffects(
  effects: readonly SixSchoolEffect[],
  out: SixSchoolEffect[] = []
): SixSchoolEffect[] {
  for (const effect of effects) {
    out.push(effect);
    if (effect.kind === "conditional") {
      flattenSixSchoolEffects(effect.then, out);
      if (effect.otherwise) flattenSixSchoolEffects(effect.otherwise, out);
    } else if (effect.kind === "damage" && effect.hitRiders) {
      for (const rider of effect.hitRiders) flattenSixSchoolEffects(rider.effects, out);
    } else if (effect.kind === "ready-rats" && effect.ifNone) {
      flattenSixSchoolEffects(effect.ifNone, out);
    } else if (effect.kind === "command-rats") {
      if (effect.missingFallback) flattenSixSchoolEffects(effect.missingFallback.effects, out);
      if (effect.noBiteFallback) flattenSixSchoolEffects(effect.noBiteFallback, out);
    } else if (effect.kind === "move-rat" && effect.ifNoRat) {
      flattenSixSchoolEffects(effect.ifNoRat, out);
    } else if (effect.kind === "consume-opened") {
      flattenSixSchoolEffects(effect.then, out);
    } else if (effect.kind === "foretell") {
      flattenSixSchoolEffects(effect.immediate, out);
      flattenSixSchoolEffects(effect.omen, out);
    } else if (effect.kind === "recall-omen" && effect.ifBoundTargetLiving) {
      flattenSixSchoolEffects(effect.ifBoundTargetLiving, out);
      if (effect.always) flattenSixSchoolEffects(effect.always, out);
    } else if (effect.kind === "recall-omen" && effect.always) {
      flattenSixSchoolEffects(effect.always, out);
    } else if (effect.kind === "resolve-omen") {
      flattenSixSchoolEffects(effect.then, out);
      flattenSixSchoolEffects(effect.otherwise, out);
    } else if (effect.kind === "resonance-threshold" || effect.kind === "spend-resonance" || effect.kind === "magnitude") {
      flattenSixSchoolEffects(effect.then, out);
    } else if (effect.kind === "overchannel") {
      flattenSixSchoolEffects(effect.perResonance, out);
    } else if (effect.kind === "blood-price") {
      flattenSixSchoolEffects(effect.then, out);
    } else if (effect.kind === "tribute") {
      flattenSixSchoolEffects(effect.fallback, out);
    }
  }
  return out;
}

export function flattenSixSchoolCardEffects(card: SixSchoolCardDef): SixSchoolEffect[] {
  return card.branches.reduce(
    (out, candidate) => flattenSixSchoolEffects(candidate.effects, out),
    flattenSixSchoolEffects(card.effects)
  );
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
  const names = new Set<string>();
  const bySchool = new Map<SixSchoolId, SixSchoolCardDef[]>();
  const tags = new Set<SixSchoolRuleTag>();

  if (SIX_SCHOOL_CATALOGUE.length !== PHASE_ONE_CARD_IDS.length) {
    issues.push({ message: "catalogue length does not match the phase-one ID list" });
  }
  SIX_SCHOOL_CATALOGUE.forEach((card, index) => {
    if (card.id !== PHASE_ONE_CARD_IDS[index]) {
      issues.push({ cardId: card.id, message: `catalogue order/ID differs from phase-one position ${index + 1}` });
    }
  });

  for (const card of SIX_SCHOOL_CATALOGUE) {
    if (ids.has(card.id)) issues.push({ cardId: card.id, message: "duplicate card id" });
    ids.add(card.id);
    if (names.has(card.name)) issues.push({ cardId: card.id, message: "duplicate card name" });
    names.add(card.name);
    if (SCHOOL_HERO[card.school] !== card.hero) issues.push({ cardId: card.id, message: "school owner does not match hero" });
    const cost = card.cost as number;
    if (cost < 1 || cost > 3) issues.push({ cardId: card.id, message: "cost must be 1–3" });
    if ((card.effects.length as number) === 0) issues.push({ cardId: card.id, message: "card has no base effect" });
    if ((card.branches.length as number) !== 2 || card.branches.some((candidate) => (candidate.effects.length as number) === 0)) {
      issues.push({ cardId: card.id, message: "card must have two non-empty functional branches" });
    }
    const branchIds = new Set(card.branches.map((candidate) => candidate.id));
    const branchNames = new Set(card.branches.map((candidate) => candidate.name));
    if (branchIds.size !== card.branches.length) issues.push({ cardId: card.id, message: "branch IDs must be unique" });
    if (branchNames.size !== card.branches.length) issues.push({ cardId: card.id, message: "branch names must be unique" });
    for (const candidate of card.branches) {
      if (candidate.cost !== undefined && (candidate.cost < 1 || candidate.cost > 3)) {
        issues.push({ cardId: card.id, message: `branch ${candidate.id} cost must be 1–3` });
      }
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
    for (const effect of flattenSixSchoolCardEffects(card)) {
      if (effect.kind === "damage" && (effect.amount <= 0 || (effect.hits ?? 1) <= 0)) {
        issues.push({ cardId: card.id, message: "damage effect must have positive amount/hits" });
      }
      if (effect.kind === "hush" && (effect.amount < 1 || effect.amount > 3)) {
        issues.push({ cardId: card.id, message: "Hush amount must stay within the visible 1–3 cap" });
      }
      if (effect.kind === "crack" && (effect.amount < 1 || effect.amount > 3)) {
        issues.push({ cardId: card.id, message: "crack amount must stay within the visible 1–3 cap" });
      }
      if (effect.kind === "summon-rat" && (effect.count < 1 || effect.count > 3)) {
        issues.push({ cardId: card.id, message: "Rat summon count must stay within the visible 1–3 cap" });
      }
      if (effect.kind === "command-rats") {
        if (effect.max !== undefined && (effect.max < 1 || effect.max > 3)) {
          issues.push({ cardId: card.id, message: "Rat command maximum must stay within the visible 1–3 cap" });
        }
        if (effect.biteDamage <= 0) issues.push({ cardId: card.id, message: "Rat bite damage must be positive" });
      }
      if (effect.kind === "foretell" && effect.bind === "none" && effect.condition.kind === "when-bound-enemy-becomes-opened") {
        issues.push({ cardId: card.id, message: "an Opened Omen must bind a target" });
      }
      if (effect.kind === "overchannel" && effect.spend === "exact" && effect.amount !== 3) {
        issues.push({ cardId: card.id, message: "exact Overchannel must spend exactly three Resonance" });
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
