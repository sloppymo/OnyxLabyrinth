import type { Character } from "../game/party";
import { isUtilitySpell, type SpellDef } from "../data/spells";
import type { ItemDef } from "../data/items";

export type PaletteSlot =
  | { kind: "attack" }
  | { kind: "defend" }
  | { kind: "cast"; disabled: boolean }
  | { kind: "skill"; disabled: boolean }
  | { kind: "item"; disabled: boolean }
  | { kind: "flee" };

export interface CombatPalette {
  slots: PaletteSlot[];
  /** Select opens the item menu; greyed when no consumables remain. */
  itemButton: "select";
  itemDisabled: boolean;
  autoButton: "start";
  /** Flee is unavailable (boss encounter). Greys out the Run hint. */
  fleeDisabled: boolean;
}

/**
 * Build the controller-style face-button action palette for a character.
 *
 * The palette exposes four face slots: Attack, Defend, Cast, Skill.
 * - Cast is disabled when the character has no usable combat spells, is
 *   silenced, or (when the caller supplies `currentSp`) cannot afford the
 *   cheapest known spell.
 * - Skill is never disabled: every class gets Analyze, with techniques
 *   (melee) or Hide/Ambush (Thief) listed above it.
 * - Items are opened with the Select button (`itemDisabled` when empty).
 */
export function buildPalette(
  c: Character,
  spells: SpellDef[],
  items: { item: ItemDef; count: number }[],
  options?: {
    silenced?: boolean;
    currentSp?: number;
    currentRage?: number;
    isBoss?: boolean;
  }
): CombatPalette {
  // Filter to combat-castable spells only (dungeon-only utility spells are
  // hidden, matching the combat spell list in combat-ui.ts).
  const combatSpells = spells.filter((s) => !isUtilitySpell(s));
  const hasSpells = combatSpells.length > 0;

  let castDisabled = !hasSpells || (options?.silenced ?? false);
  if (!castDisabled && options && "currentSp" in options) {
    const cheapest = Math.min(...combatSpells.map((s) => s.spCost));
    castDisabled = (options.currentSp ?? 0) < cheapest;
  }

  // The skill list always contains Analyze (universal intel verb), so the
  // slot is never disabled. Techniques (melee) and Hide/Ambush (Thief) sit
  // above it for the classes that have them.
  const skillDisabled = false;

  const itemDisabled =
    items.length === 0 || items.every((entry) => entry.count <= 0);

  // `c` / `currentRage` unused here — skill slot no longer checks class.
  void c;
  void options?.currentRage;

  const fleeDisabled = options?.isBoss ?? false;

  const slots: PaletteSlot[] = [
    { kind: "attack" },
    { kind: "defend" },
    { kind: "cast", disabled: castDisabled },
    { kind: "skill", disabled: skillDisabled },
  ];

  return {
    slots,
    itemButton: "select",
    itemDisabled,
    autoButton: "start",
    fleeDisabled,
  };
}

/**
 * Letter shortcuts accepted during the palette phase, none of which are on the
 * face-button map in `controller-input.ts`.
 *
 * CombatController.handleKey reads this table for palette letters. Those keys
 * arrive on the shared `ControllerInputEvent.key` field (unmapped letters are
 * not rewritten into SNES face buttons). It used to live as a hardcoded
 * `"tcmifr"` string in a dedicated combat keydown listener, which silently
 * dropped `h`/`n`/`v` (Hide / Analyze / Move). Keep this table as the single
 * source of palette letters so combat-ui and tests cannot drift apart.
 *
 * Lives here rather than in `combat-ui.ts` so tests can read it without
 * pulling in `shell.ts` and its DOM shell.
 */
export const PALETTE_LETTER_SHORTCUTS: Readonly<Record<string, PaletteActionKind>> = {
  t: "technique",
  c: "cast",
  m: "cast",
  i: "item",
  f: "flee",
  r: "flee",
  h: "hide",
  n: "analyze",
  v: "move",
};

/** Subset of `PlayerAction["kind"]` reachable from a palette letter shortcut. */
export type PaletteActionKind =
  | "technique"
  | "cast"
  | "item"
  | "flee"
  | "hide"
  | "analyze"
  | "move";
