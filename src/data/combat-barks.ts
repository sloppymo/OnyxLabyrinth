/**
 * Authored combat dialog bark lines (presentation only).
 * See docs/superpowers/specs/2026-07-26-combat-dialog-barks.md
 */

export type BarkTrigger = "beforeSpell" | "heavyHit" | "death";

export const BARK_PRIORITY: Record<BarkTrigger, number> = {
  death: 3,
  heavyHit: 2,
  beforeSpell: 1,
};

/** Data-authoring hard cap — unit-tested over COMBAT_BARKS. */
export const MAX_BARK_CHARS = 28;

export interface BarkLineDef {
  trigger: BarkTrigger;
  speaker?: {
    classIds?: string[];
    enemyIds?: string[];
  };
  spell?: {
    spellIds?: string[];
    elements?: string[];
  };
  lines: string[];
  weight?: number;
}

export const COMBAT_BARKS: readonly BarkLineDef[] = [
  {
    trigger: "beforeSpell",
    speaker: { classIds: ["Mage"] },
    spell: { elements: ["fire"] },
    lines: ["Burn, fiend!"],
  },
  {
    trigger: "heavyHit",
    // Party-only is enforced in pickBark (v1), not by omitting classIds.
    lines: ["Gyaaah!", "Nnngh!"],
  },
  {
    trigger: "death",
    speaker: { classIds: ["Fighter", "Mage", "Priest", "Thief", "Halberdier", "Duelist", "Crusader"] },
    lines: ["Let this be the last time."],
  },
  {
    trigger: "death",
    speaker: { enemyIds: ["headmasters-echo-ascendant"] },
    lines: ["The crying stops."],
  },
];
